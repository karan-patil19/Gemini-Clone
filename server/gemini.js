// Server-only code: runs in Vercel functions (and the Vite dev server locally).
// The API key is read from process.env and never sent to the browser.
import { GoogleGenAI } from "@google/genai";

/** Models the client may request. Anything else is rejected. */
export const ALLOWED_MODELS = new Set([
  "gemini-3.8-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.5-flash-lite",
]);

/**
 * When the chosen model is overloaded (503), rate-limited (429), retired (404)
 * or silent, these are tried in order so the user still gets an answer.
 */
const FALLBACK_CHAIN = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite", // most available, so it comes before older Flash
  "gemini-3.5-flash",
];
const TITLE_MODEL = "gemini-3.5-flash-lite";

const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

// Google can take ~10s to reply "busy", so models that just failed are tried
// last for a while. (Kept per warm function instance.)
const COOLDOWN_MS = 2 * 60 * 1000;
const busyUntil = new Map();
const isCoolingDown = (id) => (busyUntil.get(id) ?? 0) > Date.now();

// How long to wait for the first words before trying another model.
const firstTextTimeout = (id) => (id.includes("pro") ? 60_000 : 15_000);

// Request limits.
const MAX_MESSAGES = 200;
const MAX_TEXT_CHARS = 32_000;
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_BODY_BYTES = 4 * 1024 * 1024; // Vercel's function body limit is 4.5 MB
const RATE_LIMIT = { windowMs: 60_000, max: 20 };

/* ---------- helpers ---------- */

let client;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

const json = (status, body) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const fail = (status, code, message) => json(status, { error: { status, code, message } });

/**
 * Only accept requests made by this site's own pages. Browsers always send
 * Origin on POST, so other websites can't use the key through this endpoint.
 * Extra origins can be allowed with ALLOWED_ORIGINS="https://a.com,https://b.com".
 */
function isAllowedOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const extra = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (extra.includes(origin)) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const hits = new Map();
/** Simple per-IP limiter (per function instance; a soft guard, not a hard quota). */
function isRateLimited(request) {
  const ip =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    "local";
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return recent.length > RATE_LIMIT.max;
}

/** Shared checks for every endpoint. Returns a Response to reject, or the parsed body. */
async function guard(request) {
  if (!isAllowedOrigin(request)) return { reject: fail(403, "FORBIDDEN_ORIGIN", "Requests from other sites aren't allowed.") };
  if (isRateLimited(request)) return { reject: fail(429, "RATE_LIMITED", "Too many requests. Wait a minute and try again.") };
  if (!getClient()) return { reject: fail(500, "NO_API_KEY", "The server has no GEMINI_API_KEY configured.") };

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return { reject: fail(413, "TOO_LARGE", "This chat is too large to send. Start a new chat or remove some images.") };
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return { reject: fail(413, "TOO_LARGE", "This chat is too large to send. Start a new chat or remove some images.") };
    return { body: JSON.parse(raw) };
  } catch {
    return { reject: fail(400, "BAD_REQUEST", "Invalid request body.") };
  }
}

/** Validates client messages and converts them to Gemini `contents`. */
function toContents(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) return null;
  const contents = [];
  for (const m of messages) {
    if (m?.role !== "user" && m?.role !== "model") return null;
    const text = typeof m.text === "string" ? m.text.slice(0, MAX_TEXT_CHARS) : "";
    const images = Array.isArray(m.images) ? m.images.slice(0, MAX_IMAGES_PER_MESSAGE) : [];
    const parts = [];
    for (const img of images) {
      if (typeof img?.data !== "string" || !/^image\/[\w.+-]+$/.test(img.mimeType ?? "")) continue;
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    }
    if (text) parts.push({ text });
    if (parts.length) contents.push({ role: m.role, parts });
  }
  return contents.length ? contents : null;
}

/** Text from a response, skipping "thought" parts and signatures. */
function textOf(response) {
  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p) => typeof p.text === "string" && !p.thought)
    .map((p) => p.text)
    .join("");
}

function systemInstruction() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return [
    "You are Gemini, a helpful, friendly and knowledgeable AI assistant.",
    `Today's date is ${today}.`,
    "Format answers in Markdown. Use headings, bullet lists, tables and fenced code blocks with a language tag when they make the answer clearer.",
    "Be accurate and well structured; keep simple answers short.",
  ].join(" ");
}

/* ---------- generation with fallback ---------- */

async function streamWithFallback({ model, contents, signal, onText, onFallback }) {
  const ai = getClient();
  const all = [model, ...FALLBACK_CHAIN.filter((m) => m !== model)];
  const chain = [...all.filter((m) => !isCoolingDown(m)), ...all.filter(isCoolingDown)];
  let lastError;

  for (const [i, candidate] of chain.entries()) {
    if (i > 0 || candidate !== model) onFallback(candidate);
    let receivedText = false;

    // Each attempt is aborted when the client disconnects, or by us if the
    // model sends no text in time (Google sometimes hangs when overloaded).
    const attempt = new AbortController();
    const onAbort = () => attempt.abort();
    signal.addEventListener("abort", onAbort);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      attempt.abort();
    }, firstTextTimeout(candidate));

    try {
      const stream = await ai.models.generateContentStream({
        model: candidate,
        contents,
        config: { systemInstruction: systemInstruction(), abortSignal: attempt.signal },
      });
      for await (const chunk of stream) {
        const text = textOf(chunk);
        if (!text) continue;
        if (!receivedText) {
          receivedText = true;
          clearTimeout(timer);
          busyUntil.delete(candidate);
        }
        onText(text);
      }
      return candidate;
    } catch (err) {
      if (signal.aborted) throw Object.assign(new Error("ABORTED"), { aborted: true });
      const error = timedOut ? Object.assign(new Error("Model timed out"), { status: 504 }) : err;
      lastError = error;
      if (RETRYABLE_STATUS.has(error?.status)) busyUntil.set(candidate, Date.now() + COOLDOWN_MS);
      // Once part of an answer has streamed, switching models would garble it.
      if (receivedText || !RETRYABLE_STATUS.has(error?.status)) throw error;
      console.warn(`[gemini] ${candidate} unavailable (${error.status}), trying next model`);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }
  throw lastError;
}

/** Shortens SDK error text like `got status: 503 ... {"error":{"message":"..."}}`. */
function errorMessage(err) {
  const raw = String(err?.message ?? "");
  return raw.match(/"message":\s*"([^"]+)"/)?.[1] ?? raw.slice(0, 300);
}

/* ---------- endpoints ---------- */

/**
 * POST /api/chat  { model, messages: [{ role, text, images? }] }
 * Streams newline-delimited JSON events:
 *   {type:"fallback", model} · {type:"text", text} · {type:"done", model} · {type:"error", status, message}
 */
export async function handleChat(request) {
  const { reject, body } = await guard(request);
  if (reject) return reject;

  const model = ALLOWED_MODELS.has(body?.model) ? body.model : FALLBACK_CHAIN[0];
  const contents = toContents(body?.messages);
  if (!contents) return fail(400, "BAD_REQUEST", "Invalid messages.");

  const disconnect = new AbortController();
  request.signal?.addEventListener("abort", () => disconnect.abort());
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => {
        if (disconnect.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          /* stream already closed */
        }
      };
      try {
        const answeredBy = await streamWithFallback({
          model,
          contents,
          signal: disconnect.signal,
          onText: (text) => send({ type: "text", text }),
          onFallback: (m) => send({ type: "fallback", model: m }),
        });
        send({ type: "done", model: answeredBy });
      } catch (err) {
        if (!err?.aborted) {
          console.error("[gemini]", err?.status, errorMessage(err));
          send({ type: "error", status: err?.status ?? 500, message: errorMessage(err) });
        }
      }
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
    cancel() {
      disconnect.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}

/** POST /api/title  { prompt }  →  { title } */
export async function handleTitle(request) {
  const { reject, body } = await guard(request);
  if (reject) return reject;
  const prompt = typeof body?.prompt === "string" ? body.prompt.slice(0, 1000) : "";
  if (!prompt) return fail(400, "BAD_REQUEST", "Missing prompt.");
  try {
    const res = await getClient().models.generateContent({
      model: TITLE_MODEL,
      contents: `Write a short title (at most 6 words, no quotes, no trailing punctuation) for a chat that starts with this message:\n\n${prompt}`,
    });
    const title = textOf(res)
      .split("\n")[0]
      .replace(/^[\s"'#*]+|[\s"'*.]+$/g, "")
      .slice(0, 60);
    return json(200, { title: title || null });
  } catch (err) {
    return json(200, { title: null, error: errorMessage(err) });
  }
}

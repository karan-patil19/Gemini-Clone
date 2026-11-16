// Browser-side client. It never sees the API key: all Gemini calls go through
// this site's own serverless functions in /api (see server/gemini.js).

/** Modes shown in the model picker (must match ALLOWED_MODELS on the server). */
export const MODELS = [
  {
    id: "gemini-3.8-flash",
    label: "Fast",
    name: "Gemini 3.8 Flash",
    description: "Answers quickly",
  },
  {
    id: "gemini-3.1-pro-preview",
    label: "Pro",
    name: "Gemini 3.1 Pro",
    description: "Thinks longer for advanced math & code",
  },
  {
    id: "gemini-3.5-flash-lite",
    label: "Lite",
    name: "Gemini 3.5 Flash-Lite",
    description: "Lightest and most available",
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

const FALLBACK_NAMES = {
  "gemini-3.7-flash": "Gemini 3.7 Flash",
  "gemini-3.5-flash": "Gemini 3.5 Flash",
};

export function modelName(id) {
  return MODELS.find((m) => m.id === id)?.name ?? FALLBACK_NAMES[id] ?? id;
}

// Vercel rejects request bodies over 4.5 MB.
const MAX_PAYLOAD_CHARS = 3_800_000;

/** Stored chat messages → request payload, dropping old images if it's too big. */
function toPayload(messages) {
  const list = messages
    .filter((m) => m.role === "user" || (m.role === "model" && m.text && m.status !== "error"))
    .map((m) => ({
      role: m.role,
      text: m.text,
      images: (m.images ?? [])
        .filter((img) => img.data)
        .map(({ mimeType, data }) => ({ mimeType, data })),
    }));
  for (const m of list) {
    if (JSON.stringify(list).length <= MAX_PAYLOAD_CHARS) break;
    if (m.images.length) m.images = [];
  }
  return list;
}

async function postJson(path, body, signal) {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

async function httpError(res) {
  let info = {};
  try {
    info = (await res.json())?.error ?? {};
  } catch {
    /* not JSON */
  }
  return Object.assign(new Error(info.message || `Request failed (${res.status})`), {
    status: info.status ?? res.status,
    code: info.code,
  });
}

/**
 * Streams a reply for the conversation. The server falls back through other
 * models when the requested one is busy; resolves with the model that answered.
 */
export async function streamChat({ model, messages, signal, onText, onFallback }) {
  let answeredBy = model;
  try {
    const res = await postJson("/api/chat", { model, messages: toPayload(messages) }, signal);
    if (!res.ok) throw await httpError(res);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const event = JSON.parse(line);
        if (event.type === "text") onText(event.text);
        else if (event.type === "fallback") {
          answeredBy = event.model;
          onFallback?.(event.model);
        } else if (event.type === "done") return { model: event.model, aborted: false };
        else if (event.type === "error") {
          throw Object.assign(new Error(event.message), { status: event.status });
        }
      }
    }
  } catch (err) {
    if (signal?.aborted) return { model: answeredBy, aborted: true };
    throw err;
  }
  if (signal?.aborted) return { model: answeredBy, aborted: true };
  throw Object.assign(new Error("The connection closed before Gemini finished."), { status: 502 });
}

/** Short title for the sidebar, generated from the first prompt. */
export async function generateTitle(prompt) {
  try {
    const res = await postJson("/api/title", { prompt });
    if (!res.ok) return null;
    return (await res.json()).title || null;
  } catch {
    return null;
  }
}

/** Turns errors into something a person can act on. */
export function friendlyError(err) {
  const status = err?.status;
  const raw = String(err?.message ?? "");
  if (err?.code === "NO_API_KEY") {
    return "The server has no Gemini API key. Set GEMINI_API_KEY in .env (local) or in your Vercel project settings.";
  }
  if (err?.code === "FORBIDDEN_ORIGIN") return "This request was blocked because it didn't come from this site.";
  if (err?.code === "RATE_LIMITED") return "You're sending messages too quickly. Wait a minute and try again.";
  if (status === 413) return raw;
  if (status === 400 && /api key/i.test(raw)) {
    return "The server's Gemini API key isn't valid. Check GEMINI_API_KEY.";
  }
  if (status === 403) return "The server's API key isn't allowed to use the Gemini API.";
  if (status === 429) return "The Gemini rate limit was reached. Wait a minute and try again.";
  if ([500, 502, 503, 504].includes(status)) {
    return "Gemini is under heavy load right now and every backup model was busy too. Please try again in a moment.";
  }
  if (err instanceof TypeError) return "Couldn't reach the server. Check your internet connection.";
  return raw || "Something went wrong.";
}

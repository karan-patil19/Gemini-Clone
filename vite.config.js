import { Readable } from "node:stream";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves the Vercel functions in /api during `npm run dev`, so the app works
 * locally exactly like in production, without the Vercel CLI.
 */
function vercelApiInDev() {
  return {
    name: "vercel-api-in-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const match = req.url?.match(/^\/api\/([\w-]+)(?:\?|$)/);
        if (!match) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${match[1]}.js`);
          const handler = mod[req.method];
          if (typeof handler !== "function") {
            res.statusCode = 405;
            return res.end("Method Not Allowed");
          }

          const disconnect = new AbortController();
          res.on("close", () => disconnect.abort());
          const hasBody = !["GET", "HEAD"].includes(req.method);
          const request = new Request(new URL(req.url, `http://${req.headers.host}`), {
            method: req.method,
            headers: req.headers,
            body: hasBody ? Readable.toWeb(req) : undefined,
            duplex: "half",
            signal: disconnect.signal,
          });

          const response = await handler(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          if (!response.body) return res.end();
          for await (const chunk of response.body) res.write(chunk);
          res.end();
        } catch (err) {
          if (res.writableEnded) return;
          console.error(err);
          res.statusCode = 500;
          res.end("Internal Server Error");
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Make server-only secrets from .env (no VITE_ prefix, so never bundled)
  // available to the /api functions during development.
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["GEMINI_API_KEY", "ALLOWED_ORIGINS"]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }

  return {
    plugins: [react(), vercelApiInDev()],
    build: {
      rollupOptions: {
        output: {
          // Split big libraries into their own cacheable chunks.
          manualChunks: {
            react: ["react", "react-dom"],
            markdown: ["react-markdown", "remark-gfm", "rehype-highlight"],
          },
        },
      },
    },
  };
});

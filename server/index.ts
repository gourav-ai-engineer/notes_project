import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { createProviderFromConfig, loadConfig } from "./config.ts";

const config = loadConfig();

if (!config.geminiApiKey) {
  console.warn(
    "[warn] GEMINI_API_KEY is not set. The server will start, but /api/study/generate will return AI_NOT_CONFIGURED. Copy .env.example to .env and add a key.",
  );
}

// In production one process serves the built client and the API. In development Vite serves the client.
const dist = fileURLToPath(new URL("../dist", import.meta.url));
const staticDir = process.env.NODE_ENV === "production" && existsSync(`${dist}/index.html`) ? dist : undefined;
if (process.env.NODE_ENV === "production" && !staticDir) {
  console.warn("[warn] NODE_ENV=production but dist/index.html is missing. Run `npm run build` first; serving the API only.");
}

const app = createApp({
  provider: createProviderFromConfig(config),
  aiTimeoutMs: config.aiTimeoutMs,
  staticDir,
  rateLimit: { max: config.rateLimitPerMin, windowMs: 60_000 },
  // Render (like most hosts) puts exactly one proxy in front of the app.
  trustProxyHops: process.env.NODE_ENV === "production" ? 1 : 0,
});

app.listen(config.port, () => {
  console.log(`[info] listening on port ${config.port}${staticDir ? " (serving the built app)" : " (API only)"} (model: ${config.geminiModel})`);
});

import { createApp } from "./app.ts";
import { createProviderFromConfig, loadConfig } from "./config.ts";

const config = loadConfig();

if (!config.geminiApiKey) {
  console.warn(
    "[warn] GEMINI_API_KEY is not set. The server will start, but /api/study/generate will return AI_NOT_CONFIGURED. Copy .env.example to .env and add a key.",
  );
}

const app = createApp({ provider: createProviderFromConfig(config), aiTimeoutMs: config.aiTimeoutMs });

app.listen(config.port, () => {
  console.log(`[info] API listening on http://localhost:${config.port} (model: ${config.geminiModel})`);
});

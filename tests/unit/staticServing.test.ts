import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.ts";
import type { AiProvider } from "../../server/services/ai/types.ts";

const provider: AiProvider = {
  async generate() {
    throw new Error("not used");
  },
};
const quiet = { info() {}, warn() {}, error() {} };

let dir: string;
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "recall-dist-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), "<!doctype html><title>Recall Studio</title><div id=root></div>");
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log(1)");
  writeFileSync(join(dir, "favicon.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(dir, "sw.js"), "self.addEventListener('fetch',()=>{})");
  writeFileSync(join(dir, "manifest.webmanifest"), JSON.stringify({ name: "Recall Studio" }));
  mkdirSync(join(dir, ".well-known"));
  writeFileSync(join(dir, ".well-known", "assetlinks.json"), "[]");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const served = () => createApp({ provider, aiTimeoutMs: 1000, logger: quiet, staticDir: dir });

describe("serving the built client", () => {
  it("serves the app shell at / with revalidation and safe headers", async () => {
    const res = await request(served()).get("/");
    expect(res.status).toBe(200);
    expect(res.text).toContain("Recall Studio");
    expect(res.headers["cache-control"]).toBe("no-cache");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
  });

  it("falls back to the app shell for client-side routes, including deep links", async () => {
    for (const path of ["/library", "/sets/abc-123", "/folders/unsorted", "/create/ai/text"]) {
      const res = await request(served()).get(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).toContain("Recall Studio");
    }
  });

  it("caches hashed assets for a year and other files briefly", async () => {
    const asset = await request(served()).get("/assets/app-abc123.js");
    expect(asset.status).toBe(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const icon = await request(served()).get("/favicon.svg");
    expect(icon.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("never lets the service worker go stale, and serves the web app manifest", async () => {
    const sw = await request(served()).get("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers["cache-control"]).toBe("no-cache");
    expect(sw.headers["content-type"]).toMatch(/javascript/);
    const manifest = await request(served()).get("/manifest.webmanifest");
    expect(manifest.status).toBe(200);
    expect(manifest.headers["content-type"]).toMatch(/manifest\+json|json/);
  });

  it("serves Digital Asset Links as JSON, and a missing .well-known file is a JSON 404, not the app", async () => {
    const links = await request(served()).get("/.well-known/assetlinks.json");
    expect(links.status).toBe(200);
    expect(links.headers["content-type"]).toMatch(/json/);
    expect(links.body).toEqual([]);
    const missing = await request(served()).get("/.well-known/nope.json");
    expect(missing.status).toBe(404);
    expect(missing.headers["content-type"]).toMatch(/json/);
  });

  it("keeps /api responses as JSON, never the app shell", async () => {
    const health = await request(served()).get("/api/health");
    expect(health.body).toEqual({ ok: true });
    const missing = await request(served()).get("/api/nope");
    expect(missing.status).toBe(404);
    expect(missing.headers["content-type"]).toMatch(/json/);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await request(served()).get("/api")).headers["content-type"]).toMatch(/json/);
  });

  it("does not serve files outside the build folder", async () => {
    const res = await request(served()).get("/..%2f..%2fpackage.json");
    expect(res.text).not.toContain("recall-studio");
  });

  it("serves nothing but the API when no build folder is configured", async () => {
    const res = await request(createApp({ provider, aiTimeoutMs: 1000, logger: quiet })).get("/library");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/json/);
  });
});

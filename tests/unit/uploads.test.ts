import request from "supertest";
import { describe, expect, it } from "vitest";
import { LIMITS, validateFiles, validateSubmission } from "../../shared/contract.ts";
import { createApp } from "../../server/app.ts";
import { prepareSources } from "../../server/services/files/attachments.ts";
import { buildPrompt } from "../../server/services/ai/prompts.ts";
import { ProviderError, type AiProvider, type ProviderRequest } from "../../server/services/ai/types.ts";
import type { Logger } from "../../server/services/ai/studyService.ts";
import { SAMPLE_NOTES, makeContent } from "../fixtures/study.ts";
import { JPEG_BYTES, OLE_BYTES, PDF_BYTES, PNG_BYTES, WEBP_BYTES, makeDocx, makeNonDocxZip } from "../fixtures/files.ts";

type Step = string | Error;
const json = (v: unknown) => JSON.stringify(v);

function setup(steps: Step[]) {
  const calls: ProviderRequest[] = [];
  const provider: AiProvider = {
    async generate(req) {
      calls.push(req);
      const step = steps[Math.min(calls.length - 1, steps.length - 1)];
      if (step instanceof Error) throw step;
      return step;
    },
  };
  const lines: string[] = [];
  const push = (m: string, meta?: Record<string, unknown>) => lines.push(`${m} ${JSON.stringify(meta ?? {})}`);
  const logger: Logger = { info: push, warn: push, error: push };
  return { app: createApp({ provider, aiTimeoutMs: 1000, logger }), calls, lines };
}

const post = (app: ReturnType<typeof createApp>, mode = "both") => request(app).post("/api/study/generate").field("mode", mode);

describe("prepareSources (sniffing and extraction)", () => {
  it.each([
    ["PDF", "notes.pdf", PDF_BYTES, "application/pdf"],
    ["PNG", "scan.png", PNG_BYTES, "image/png"],
    ["JPEG", "photo.jpg", JPEG_BYTES, "image/jpeg"],
    ["WEBP", "pic.webp", WEBP_BYTES, "image/webp"],
    ["legacy .doc", "old.doc", OLE_BYTES, "application/msword"],
  ])("passes a %s through with the type taken from its bytes", async (_n, name, buffer, mimeType) => {
    const out = await prepareSources([{ originalname: name, buffer }]);
    expect(out.attachments).toEqual([{ mimeType, data: buffer }]);
    expect(out.extractedText).toEqual([]);
  });

  it("ignores a lying extension: a PNG named .pdf is still image/png", async () => {
    const out = await prepareSources([{ originalname: "fake.pdf", buffer: PNG_BYTES }]);
    expect(out.attachments[0].mimeType).toBe("image/png");
  });

  it("extracts text from a real DOCX", async () => {
    const buffer = await makeDocx(["Mitosis has four phases.", "Prophase comes first."]);
    const out = await prepareSources([{ originalname: "bio.docx", buffer }]);
    expect(out.attachments).toEqual([]);
    expect(out.extractedText[0]).toContain("Mitosis has four phases.");
    expect(out.extractedText[0]).toContain("Prophase comes first.");
  });

  it("reads UTF-8 text and Markdown files", async () => {
    const out = await prepareSources([
      { originalname: "a.txt", buffer: Buffer.from("Café notes: ünïcode is fine") },
      { originalname: "b.md", buffer: Buffer.from("# Heading\n\n- point") },
    ]);
    expect(out.extractedText).toEqual(["Café notes: ünïcode is fine", "# Heading\n\n- point"]);
  });

  it.each([
    ["a ZIP that is not a DOCX", "x.docx", () => makeNonDocxZip(), "FILE_UNREADABLE"],
    ["a DOCX with the wrong extension", "x.zip", () => makeDocx(["hello there"]), "UNSUPPORTED_FILE_TYPE"],
    ["an OLE file that is not named .doc (could be Excel)", "sheet.xls", async () => OLE_BYTES, "UNSUPPORTED_FILE_TYPE"],
    ["binary data with a .txt name", "x.txt", async () => Buffer.from([0x00, 0x01, 0x02, 0xff]), "UNSUPPORTED_FILE_TYPE"],
    ["invalid UTF-8", "x.txt", async () => Buffer.from([0xc3, 0x28, 0x41]), "UNSUPPORTED_FILE_TYPE"],
    ["unknown text extension", "x.exe", async () => Buffer.from("plain text"), "UNSUPPORTED_FILE_TYPE"],
    ["an empty file", "x.txt", async () => Buffer.alloc(0), "FILE_UNREADABLE"],
    ["a whitespace-only text file", "x.txt", async () => Buffer.from("   \n  "), "FILE_UNREADABLE"],
  ])("rejects %s with %s", async (_n, name, make, code) => {
    await expect(prepareSources([{ originalname: name, buffer: await make() }])).rejects.toMatchObject({ code });
  });

  it("rejects, rather than silently clips, text above the extraction limit", async () => {
    const big = Buffer.from("a".repeat(LIMITS.maxExtractedChars + 1));
    await expect(prepareSources([{ originalname: "long.txt", buffer: big }])).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
  });
});

describe("shared validation", () => {
  it("makes notes optional only when files are attached", () => {
    expect(validateSubmission("", 0)).toMatch(/paste some notes/i);
    expect(validateSubmission("", 1)).toBeNull();
    expect(validateSubmission("short", 1)).toBeNull();
    expect(validateSubmission("x".repeat(LIMITS.notesMax + 1), 1)).toMatch(/too long/i);
  });

  it("validates count, type, size and total on the client with the server's limits", () => {
    const f = (name: string, size = 100) => ({ name, size });
    expect(validateFiles([f("a.pdf"), f("b.PNG")])).toBeNull();
    expect(validateFiles(Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => f(`${i}.pdf`)))).toMatch(/at most/i);
    expect(validateFiles([f("a.exe")])).toMatch(/isn't a supported/i);
    expect(validateFiles([f("noext")])).toMatch(/isn't a supported/i);
    expect(validateFiles([f("a.pdf", 0)])).toMatch(/empty/i);
    expect(validateFiles([f("a.pdf", LIMITS.maxFileBytes + 1)])).toMatch(/larger than/i);
    expect(validateFiles([f("a.pdf", 8 * 1024 * 1024), f("b.pdf", 8 * 1024 * 1024)])).toMatch(/total/i);
  });
});

describe("buildPrompt with sources", () => {
  it("is unchanged for text-only requests", () => {
    const p = buildPrompt("my notes", "quiz");
    expect(p).toContain("<notes>\nmy notes\n</notes>");
    expect(p).not.toContain("attached");
    expect(p).not.toContain("<document");
  });

  it("labels documents by index (never by file name) and omits empty notes", () => {
    const p = buildPrompt("", "both", { attachedFiles: 2, extractedText: ["doc body"] });
    expect(p).toContain("2 file(s) are attached");
    expect(p).toContain('<document index="1">\ndoc body\n</document>');
    expect(p).not.toContain("<notes>");
  });
});

describe("POST /api/study/generate — multipart uploads", () => {
  it("accepts files with no typed notes and sends the sniffed attachment to the provider", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const res = await post(app).attach("files", PDF_BYTES, { filename: "lecture.pdf", contentType: "application/octet-stream" });
    expect(res.status).toBe(200);
    expect(res.body.studySet.flashcards).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect(calls[0].attachments).toEqual([{ mimeType: "application/pdf", data: PDF_BYTES }]);
    expect(calls[0].prompt).toContain("1 file(s) are attached");
  });

  it("includes DOCX text in the prompt and combines it with typed notes", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const docx = await makeDocx(["Cell membranes are selectively permeable."]);
    const res = await post(app)
      .field("notes", "Focus on membranes")
      .attach("files", docx, { filename: "cells.docx" })
      .attach("files", PNG_BYTES, { filename: "diagram.png" });
    expect(res.status).toBe(200);
    expect(calls[0].prompt).toContain("Cell membranes are selectively permeable.");
    expect(calls[0].prompt).toContain("Focus on membranes");
    expect(calls[0].attachments).toEqual([{ mimeType: "image/png", data: PNG_BYTES }]);
  });

  it("re-sends the attachments on the single repair call", async () => {
    const { app, calls } = setup(["not json at all", json(makeContent())]);
    const res = await post(app).attach("files", PDF_BYTES, { filename: "a.pdf" });
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls[1].attachments).toEqual(calls[0].attachments);
    expect(calls[1].prompt).toContain("Your previous response was rejected");
  });

  it("still works as JSON with no files and passes no attachments", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const res = await request(app).post("/api/study/generate").send({ notes: SAMPLE_NOTES, mode: "both" });
    expect(res.status).toBe(200);
    expect(calls[0].attachments).toBeUndefined();
  });

  it("still requires 20+ characters of notes when there are no files (multipart too)", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const res = await post(app).field("notes", "tiny");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["an unsupported type", "tool.exe", Buffer.from("MZ binary"), 415, "UNSUPPORTED_FILE_TYPE"],
    ["a corrupt DOCX", "broken.docx", Buffer.from("PK\x03\x04 definitely not a zip"), 422, "FILE_UNREADABLE"],
    ["an empty file", "empty.pdf", Buffer.alloc(0), 422, "FILE_UNREADABLE"],
  ])("rejects %s with a typed, non-retryable error and never calls the model", async (_n, filename, buffer, status, code) => {
    const { app, calls } = setup([json(makeContent())]);
    const res = await post(app).attach("files", buffer, { filename });
    expect(res.status).toBe(status);
    expect(res.body.error).toMatchObject({ code, retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("returns FILE_TOO_LARGE (413), not a 500, for an oversized file", async () => {
    const { app, calls } = setup([json(makeContent())]);
    const big = Buffer.concat([PDF_BYTES, Buffer.alloc(LIMITS.maxFileBytes)]);
    const res = await post(app).attach("files", big, { filename: "big.pdf" });
    expect(res.status).toBe(413);
    expect(res.body.error).toMatchObject({ code: "FILE_TOO_LARGE", retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("returns FILE_TOO_LARGE when the files together exceed the total limit", async () => {
    const { app } = setup([json(makeContent())]);
    const each = Buffer.concat([PDF_BYTES, Buffer.alloc(5 * 1024 * 1024)]);
    const res = await post(app)
      .attach("files", each, { filename: "a.pdf" })
      .attach("files", each, { filename: "b.pdf" })
      .attach("files", each, { filename: "c.pdf" });
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("returns TOO_MANY_FILES (400) above the file-count limit", async () => {
    const { app, calls } = setup([json(makeContent())]);
    let req = post(app);
    for (let i = 0; i <= LIMITS.maxFiles; i++) req = req.attach("files", PDF_BYTES, { filename: `f${i}.pdf` });
    const res = await req;
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "TOO_MANY_FILES", retryable: false });
    expect(calls).toHaveLength(0);
  });

  it("rejects files sent under an unexpected field name as INVALID_REQUEST", async () => {
    const { app } = setup([json(makeContent())]);
    const res = await post(app).attach("document", PDF_BYTES, { filename: "a.pdf" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_REQUEST");
  });

  it("maps a provider 400 with files attached to FILE_UNREADABLE, not a key problem", async () => {
    const { app } = setup([new ProviderError("bad_input", "status 400", 400)]);
    const res = await post(app).attach("files", PDF_BYTES, { filename: "a.pdf" });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: "FILE_UNREADABLE", retryable: false });
  });

  it("never puts file names, contents or extracted text in logs or error responses", async () => {
    const { app, lines } = setup([json(makeContent()), "still not json"]);
    const secret = "TOP-SECRET-LECTURE-LINE";
    const docx = await makeDocx([secret]);
    const res = await post(app).attach("files", docx, { filename: "private-name-xyz.docx" });
    expect(res.status).toBe(200);
    const bad = setup(["nope", "nope"]);
    const failed = await post(bad.app).attach("files", docx, { filename: "private-name-xyz.docx" });
    expect(failed.status).toBe(502);
    const everything = [...lines, ...bad.lines, JSON.stringify(failed.body)].join("\n");
    expect(everything).not.toContain(secret);
    expect(everything).not.toContain("private-name-xyz");
  });
});

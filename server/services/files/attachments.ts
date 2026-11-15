/**
 * Turns uploaded files into something the model can use.
 *
 *  - PDFs and images go to Gemini as-is (it reads scanned pages and photos natively, so there is
 *    no separate OCR step to run or maintain).
 *  - DOCX, TXT and MD are converted to text here, so they work regardless of provider.
 *  - Legacy .doc is passed through to Gemini; the sniffed signature must match the extension.
 *
 * The client's MIME type and file name are never trusted: the type comes from the file's bytes.
 * Nothing here logs file names, contents or extracted text.
 */
import mammoth from "mammoth";
import { LIMITS } from "../../../shared/contract.ts";
import { AppError, type ProviderAttachment } from "../ai/types.ts";

export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
}

export interface PreparedSources {
  /** Sent to the provider untouched (PDF, images, .doc). */
  attachments: ProviderAttachment[];
  /** Plain text extracted locally, in upload order. */
  extractedText: string[];
}

const startsWith = (buf: Buffer, bytes: number[], offset = 0) => bytes.every((b, i) => buf[offset + i] === b);

type Sniffed =
  | { kind: "inline"; mimeType: string }
  | { kind: "docx" }
  | { kind: "doc" }
  | { kind: "text" }
  | { kind: "unknown" };

function sniff(buf: Buffer): Sniffed {
  if (startsWith(buf, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { kind: "inline", mimeType: "application/pdf" }; // %PDF-
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: "inline", mimeType: "image/png" };
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { kind: "inline", mimeType: "image/jpeg" };
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) return { kind: "inline", mimeType: "image/webp" };
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04])) return { kind: "docx" }; // ZIP container; mammoth confirms it is Word
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return { kind: "doc" }; // OLE2 (.doc/.xls/.ppt)
  return { kind: "text" };
}

const extensionOf = (name: string) => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
};

function decodeUtf8(buf: Buffer): string | null {
  if (buf.includes(0)) return null; // binary
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}

function checkExtracted(text: string): string {
  const trimmed = text.replace(/\r\n/g, "\n").trim();
  if (trimmed.length === 0) throw new AppError("FILE_UNREADABLE", "no_text");
  // Reject rather than silently clip: dropping text would quietly change what gets studied.
  if (trimmed.length > LIMITS.maxExtractedChars) throw new AppError("FILE_TOO_LARGE", "extracted_text_too_long");
  return trimmed;
}

export async function prepareSources(files: UploadedFile[]): Promise<PreparedSources> {
  const attachments: ProviderAttachment[] = [];
  const extractedText: string[] = [];

  for (const file of files) {
    if (file.buffer.length === 0) throw new AppError("FILE_UNREADABLE", "empty_file");
    const ext = extensionOf(file.originalname);
    const sniffed = sniff(file.buffer);

    switch (sniffed.kind) {
      case "inline":
        attachments.push({ mimeType: sniffed.mimeType, data: file.buffer });
        break;
      case "docx": {
        if (ext !== ".docx") throw new AppError("UNSUPPORTED_FILE_TYPE", "zip_not_docx");
        try {
          const { value } = await mammoth.extractRawText({ buffer: file.buffer });
          extractedText.push(checkExtracted(value));
        } catch (err) {
          if (err instanceof AppError) throw err;
          throw new AppError("FILE_UNREADABLE", "docx_parse_failed");
        }
        break;
      }
      case "doc":
        // OLE2 is shared with Excel/PowerPoint, so only accept it when the name says .doc.
        if (ext !== ".doc") throw new AppError("UNSUPPORTED_FILE_TYPE", "ole_not_doc");
        attachments.push({ mimeType: "application/msword", data: file.buffer });
        break;
      case "text": {
        if (ext !== ".txt" && ext !== ".md") throw new AppError("UNSUPPORTED_FILE_TYPE", "unknown_binary");
        const text = decodeUtf8(file.buffer);
        if (text === null) throw new AppError("UNSUPPORTED_FILE_TYPE", "not_utf8_text");
        extractedText.push(checkExtracted(text));
        break;
      }
      default:
        throw new AppError("UNSUPPORTED_FILE_TYPE");
    }
  }

  return { attachments, extractedText };
}

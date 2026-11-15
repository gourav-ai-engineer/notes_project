/** Tiny real files built in memory, so tests need no binary fixtures and never touch a live model. */
import JSZip from "jszip";

export const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
export const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
export const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
export const WEBP_BYTES = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x1a, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
export const OLE_BYTES = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);

/** A minimal but valid .docx whose paragraphs are the given lines. */
export async function makeDocx(lines: string[]): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  );
  const paragraphs = lines.map((l) => `<w:p><w:r><w:t>${l}</w:t></w:r></w:p>`).join("");
  zip.file(
    "word/document.xml",
    `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`,
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

/** A ZIP that is not a Word document. */
export async function makeNonDocxZip(): Promise<Buffer> {
  const zip = new JSZip();
  zip.file("hello.txt", "hi");
  return zip.generateAsync({ type: "nodebuffer" });
}

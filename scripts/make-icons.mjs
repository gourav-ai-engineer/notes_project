// Generates the app icons and the Play Store graphics from inline SVG, using the browser Playwright already uses.
// Run: node scripts/make-icons.mjs   (set PW_CHANNEL=chromium if Edge is not installed)
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const NAVY = "#0b0d24";
const ACCENT = "#4a5df5";
const INK = "#eef0ff";

/** A two-card stack. `scale` shrinks the artwork towards the centre to stay inside the maskable safe zone. */
const mark = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="120" y="150" width="272" height="196" rx="30" fill="${ACCENT}" transform="rotate(-9 256 256)"/>
    <rect x="120" y="166" width="272" height="196" rx="30" fill="${INK}"/>
    <rect x="164" y="214" width="150" height="22" rx="11" fill="${NAVY}"/>
    <rect x="164" y="258" width="184" height="16" rx="8" fill="${ACCENT}" opacity=".85"/>
    <rect x="164" y="292" width="120" height="16" rx="8" fill="${ACCENT}" opacity=".55"/>
  </g>`;

const svg = (inner, rx) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="${rx}" fill="${NAVY}"/>${inner}</svg>`;

const icons = {
  "public/icons/icon-192.png": { size: 192, svg: svg(mark(1.25), 96) },
  "public/icons/icon-512.png": { size: 512, svg: svg(mark(1.25), 96) },
  // Full-bleed with the artwork inside the central safe zone, so Android can crop it to any shape.
  "public/icons/icon-maskable-512.png": { size: 512, svg: svg(mark(1.1), 0) },
  "public/icons/apple-touch-icon.png": { size: 180, svg: svg(mark(1.1), 0) },
  // Play Console wants a 512x512 PNG without rounded corners; Google applies its own mask.
  "store-assets/play-icon-512.png": { size: 512, svg: svg(mark(1.1), 0) },
};

const featureGraphic = `<!doctype html><html><body style="margin:0;width:1024px;height:500px;background:${NAVY};display:flex;align-items:center;gap:56px;padding:0 90px;box-sizing:border-box;font-family:Segoe UI,Arial,sans-serif;color:${INK}">
  <svg width="260" height="260" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">${mark(1)}</svg>
  <div><div style="font-size:84px;font-weight:700;letter-spacing:-2px">Recall Studio</div>
  <div style="font-size:34px;color:#a9aed0;margin-top:14px;max-width:560px">Turn your notes, PDFs and photos into flashcards and quizzes.</div></div>
</body></html>`;

mkdirSync("public/icons", { recursive: true });
// The in-app logo and the browser tab icon: the same artwork as the app icon, as a scalable SVG.
writeFileSync("public/favicon.svg", `${svg(mark(1.25), 96)}\n`);
console.log("wrote public/favicon.svg");
mkdirSync("store-assets", { recursive: true });

const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
try {
  for (const [file, { size, svg: markup }] of Object.entries(icons)) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<body style="margin:0">${markup.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`);
    writeFileSync(file, await page.screenshot({ type: "png", omitBackground: true }));
    await page.close();
    console.log("wrote", file);
  }
  const page = await browser.newPage({ viewport: { width: 1024, height: 500 } });
  await page.setContent(featureGraphic);
  writeFileSync("store-assets/feature-graphic-1024x500.png", await page.screenshot({ type: "png" }));
  console.log("wrote store-assets/feature-graphic-1024x500.png");
} finally {
  await browser.close();
}

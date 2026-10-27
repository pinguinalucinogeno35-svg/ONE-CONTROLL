// Gera os ícones PNG do PWA com o Chromium do Playwright.
// Manual ONE v1.0: não redesenhar nem criar símbolo alternativo da marca. Enquanto
// o arquivo mestre do logo não for incorporado, o ícone é o identificador "ONE"
// em Space Grotesk 700 (marfim #F6F4EF sobre carvão #0B0B0F).
// Uso: node scripts/generate-icons.mjs  (substituir pelo master quando disponível)
import { chromium } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";

const font = await readFile(new URL("../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2", import.meta.url));
const fontUrl = `data:font/woff2;base64,${font.toString("base64")}`;

function html(size, safe) {
  // safe = fração útil (zona segura para ícones "maskable" = 80%)
  const fontSize = Math.round(size * safe * 0.42);
  return `<html><head><style>
    @font-face { font-family: SG; src: url(${fontUrl}) format("woff2"); font-weight: 300 700; }
    html,body { margin:0; width:${size}px; height:${size}px; background:#0B0B0F; }
    body { display:flex; align-items:center; justify-content:center; }
    span { font-family: SG; font-weight:700; font-size:${fontSize}px; letter-spacing:-0.02em; color:#F6F4EF; line-height:1; }
  </style></head><body><span>ONE</span></body></html>`;
}

const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ["icon-192.png", 192, 0.9], ["icon-512.png", 512, 0.9], ["apple-touch-icon.png", 180, 0.9],
  ["maskable-192.png", 192, 0.72], ["maskable-512.png", 512, 0.72],
];
for (const [name, size, safe] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(html(size, safe));
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname });
}
await browser.close();

// SVG de referência (texto identificador, não é o logo mestre).
await writeFile(new URL("../public/icons/logo.svg", import.meta.url), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="ONE">
  <rect width="512" height="512" fill="#0B0B0F"/>
  <text x="256" y="256" dominant-baseline="central" text-anchor="middle" font-family="Space Grotesk, sans-serif" font-weight="700" font-size="190" letter-spacing="-4" fill="#F6F4EF">ONE</text>
</svg>
`);
console.log("ícones gerados");

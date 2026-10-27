// Gera os ícones PNG do PWA a partir de public/icons/logo.svg usando o Chromium do Playwright.
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const svg = await readFile(new URL("../public/icons/logo.svg", import.meta.url), "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const targets = [
  ["icon-192.png", 192, 0], ["icon-512.png", 512, 0], ["apple-touch-icon.png", 180, 0],
  ["maskable-192.png", 192, 0.12], ["maskable-512.png", 512, 0.12],
];
for (const [name, size, pad] of targets) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(`<html><body style="margin:0;background:#080B12;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: false });
}
await browser.close();
console.log("ícones gerados");

// Renders icons/icon.svg into the PNG sizes iOS and Android need.
// Usage: node scripts/make-icons.mjs   (requires Playwright + Chromium)
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const svg = await readFile(`${root}icons/icon.svg`, 'utf8');

const targets = [
  { file: 'apple-touch-icon.png', size: 180, scale: 1 },
  { file: 'icon-192.png', size: 192, scale: 1 },
  { file: 'icon-512.png', size: 512, scale: 1 },
  // Maskable icons get cropped to a circle on Android, so shrink the art into the safe zone.
  { file: 'icon-maskable-512.png', size: 512, scale: 0.8 },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const { file, size, scale } of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`
    <style>html,body{margin:0;background:#07070c}div{width:${size}px;height:${size}px;display:grid;place-items:center}
    svg{width:${size * scale}px;height:${size * scale}px}</style><div>${svg}</div>`);
  await page.screenshot({ path: `${root}icons/${file}`, omitBackground: false });
  console.log(`icons/${file}`);
}
await browser.close();

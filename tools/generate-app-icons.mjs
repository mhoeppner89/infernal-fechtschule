import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = new URL('../site/icons/', import.meta.url);
const svg = await readFile(new URL('icon.svg', root), 'utf8');
const browser = await chromium.launch({ channel: 'chrome' });
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:#09151c}svg{width:100%;height:100%;display:block}</style>${svg}`);
    await page.screenshot({ path: fileURLToPath(new URL(`icon-${size}.png`, root)) });
    await page.close();
  }
} finally { await browser.close(); }
console.log('Generated both install icons from the checked-in SVG geometry.');

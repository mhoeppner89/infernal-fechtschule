import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://localhost:4187';
const out = 'test-results/offline-peer'; await mkdir(out, { recursive: true });
const report = { checks: [], errors: [], cache: null };
function check(name, pass, detail = '') { report.checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`); }
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const offline = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await offline.newPage(); page.on('pageerror', e => report.errors.push(String(e)));
  await page.goto(base + '/?autostart=1&skipCountdown=1&seed=2026');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  report.cache = await page.evaluate(async () => {
    const sw = await (await fetch('./sw.js')).text();
    const name = JSON.parse(sw.match(/const CACHE = ("[^"]+");/)[1]);
    const cache = await caches.open(name), keys = await cache.keys();
    let bytes = 0;
    for (const key of keys) bytes += (await (await cache.match(key)).arrayBuffer()).byteLength;
    return { name, entries: keys.length, bytes, urls: keys.map(k => k.url) };
  });
  check('offline cache contains no retired artwork', !report.cache.urls.some(u => /assets\/art|animation-catalog|animation-manifest|background-catalog/.test(u)));
  check('offline runtime stays below 2 MiB', report.cache.bytes < 2 * 1024 * 1024, `${report.cache.bytes} bytes / ${report.cache.entries} entries`);
  await offline.setOffline(true); await page.reload();
  await page.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.phase === 'wave');
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  check('game boots while fully offline', state.animationAssets.source === 'procedural' && state.backgroundAssets.source === 'procedural');
  await page.screenshot({ path: `${out}/offline-phone.png`, timeout: 15000 });
  await offline.close();
  const hostContext = await browser.newContext({ serviceWorkers: 'block' });
  const guestContext = await browser.newContext({ serviceWorkers: 'block' });
  const host = await hostContext.newPage(), guest = await guestContext.newPage();
  for (const p of [host, guest]) { p.on('pageerror', e => report.errors.push(String(e))); await p.goto(base); await p.locator('#open-network').click(); }
  await host.locator('#host-generate').click();
  await host.waitForFunction(() => document.querySelector('#host-offer').value.length > 20, { timeout: 25000 });
  const offer = await host.locator('#host-offer').inputValue();
  await guest.locator('[data-network-tab="guest"]').click();
  await guest.locator('#guest-offer').fill(offer); await guest.locator('#guest-generate-answer').click();
  await guest.waitForFunction(() => document.querySelector('#guest-answer').value.length > 20, { timeout: 25000 });
  await host.locator('#host-answer').fill(await guest.locator('#guest-answer').inputValue());
  await host.locator('#host-apply-answer').click();
  await host.waitForFunction(() => !document.querySelector('#host-start').disabled);
  check('manual WebRTC pairing connects two browser peers', await host.locator('#host-start').isEnabled());
  await host.locator('#host-start').click();
  await guest.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.actors.filter(a => a.team === 'players').length === 2);
  check('guest receives a two-player authoritative snapshot', await guest.evaluate(() => window.__FECHTSCHULE__.snapshot().actors.filter(a => a.team === 'players').length === 2));
  await guest.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.phase === 'wave');
  const position = await host.evaluate(() => window.__FECHTSCHULE__.snapshot().actors.find(a => a.playerIndex === 1)?.x);
  await guest.keyboard.down('ArrowRight'); await guest.waitForTimeout(350); await guest.keyboard.up('ArrowRight');
  const moved = await host.evaluate(() => window.__FECHTSCHULE__.snapshot().actors.find(a => a.playerIndex === 1)?.x);
  check('guest movement reaches the authoritative host', moved > position, `${position} -> ${moved}`);
  await host.screenshot({ path: `${out}/host.png`, timeout: 15000 });
  await guest.screenshot({ path: `${out}/guest.png`, timeout: 15000 });
  await hostContext.close(); await guestContext.close();
  check('no browser errors during offline/peer tests', report.errors.length === 0, report.errors.join('; '));
} catch (error) { report.errors.push(String(error.stack || error)); check('offline/peer audit completes', false, String(error)); }
finally { await browser.close(); await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)); if (report.errors.length || report.checks.some(c => !c.pass)) process.exitCode = 1; }

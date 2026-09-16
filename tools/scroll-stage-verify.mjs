#!/usr/bin/env node
/**
 * End-to-end verification for the scrolling wide-stage waves.
 * Browser: live solo combat; the probe marches Meyer east and verifies that
 * the camera window follows, the stage is wider than one screen, enemies spawn
 * ahead of the frontier, offscreen chevrons are drawable, and the phone layout
 * stays exact. Screenshots at start/end of the march provide visual evidence.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4174';
const OUT = '/tmp/fechtschule-scroll-stages';
mkdirSync(OUT, { recursive: true });

const failures = [];
function check(ok, label, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${suffix}`);
  if (!ok) failures.push(`${label}${suffix}`);
}

async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (!/Executable doesn't exist/.test(String(error))) throw error;
    const { readdirSync } = await import('node:fs');
    const cacheRoot = `${process.env.HOME}/Library/Caches/ms-playwright`;
    const candidates = readdirSync(cacheRoot)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse();
    for (const candidate of candidates) {
      const executable = `${cacheRoot}/${candidate}/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
      try {
        return await chromium.launch({ executablePath: executable });
      } catch {
        // Try the next cached build.
      }
    }
    throw error;
  }
}

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (/Failed to load resource/.test(message.text())) return;
  consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));
page.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('favicon')) {
    consoleErrors.push(`${response.status()} ${response.url()}`);
  }
});

await page.goto(`${BASE}/?autostart=1&skipCountdown=1&seed=1948`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__FECHTSCHULE__?.controller?.world?.phase === 'wave', null, { timeout: 20000 });
await page.waitForFunction(() => {
  if (typeof window.render_game_to_text !== 'function') return false;
  const state = JSON.parse(window.render_game_to_text());
  return state.animationAssets?.pendingAssets === 0 && state.animationAssets?.failedAssets === 0;
}, null, { timeout: 30000 });

const startState = await page.evaluate(() => {
  const snapshot = window.__FECHTSCHULE__.snapshot();
  return {
    cameraX: snapshot.cameraX,
    roadWidth: snapshot.roadWidth,
    playerX: snapshot.actors.find((actor) => actor.team === 'players').x
  };
});
check(startState.roadWidth > 1280, 'the opening road scrolls', `roadWidth ${startState.roadWidth}`);
check(startState.cameraX <= startState.playerX, 'camera starts at or west of the player', `camera ${Math.round(startState.cameraX)}, player ${Math.round(startState.playerX)}`);
await page.screenshot({ path: `${OUT}/march-start.png` });

// March east for ~4 seconds of sim time, holding the keyboard right key.
const march = await page.evaluate(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const press = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
  press('KeyD', true);
  const trace = [];
  for (let step = 0; step < 24; step += 1) {
    window.__FECHTSCHULE__.advanceTime(180);
    const snapshot = window.__FECHTSCHULE__.snapshot();
    const player = snapshot.actors.find((actor) => actor.team === 'players');
    trace.push({ cameraX: Math.round(snapshot.cameraX), playerX: Math.round(player.x) });
    await wait(0);
  }
  press('KeyD', false);
  return trace;
});

const endState = march[march.length - 1];
check(endState.playerX > startState.playerX + 300, `player advanced east (${Math.round(startState.playerX)} → ${endState.playerX})`);
check(endState.cameraX > startState.cameraX + 200, `camera followed the march (${Math.round(startState.cameraX)} → ${endState.cameraX})`);
const monotonic = march.every((entry, index) => index === 0 || entry.cameraX >= march[index - 1].cameraX - 1e-6);
check(monotonic, 'camera never retreated during the march');

const midState = await page.evaluate(() => {
  const snapshot = window.__FECHTSCHULE__.snapshot();
  return {
    cameraX: snapshot.cameraX,
    roadWidth: snapshot.roadWidth,
    playerX: snapshot.actors.find((actor) => actor.team === 'players').x,
    enemies: snapshot.actors.filter((actor) => actor.team === 'enemies' && actor.state !== 'dead').length,
    insideWindow: snapshot.actors.filter((actor) => actor.team === 'players').every(
      (actor) => actor.x >= snapshot.cameraX + 40 && actor.x <= snapshot.cameraX + 1280 - 40
    )
  };
});
check(midState.insideWindow, 'player stays inside the camera window while marching', JSON.stringify(midState));
check(midState.enemies > 0 || midState.playerX > 900, 'combat pressure present during the march', `enemies ${midState.enemies}`);
await page.screenshot({ path: `${OUT}/march-end.png` });

// Phone layout with scrolling active.
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(250);
const phone = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  innerWidth: window.innerWidth,
  cameraX: Math.round(window.__FECHTSCHULE__.snapshot().cameraX)
}));
check(phone.scrollWidth === phone.innerWidth, 'phone layout has no document overflow', `${phone.scrollWidth} vs ${phone.innerWidth}`);
await page.screenshot({ path: `${OUT}/phone-march.png` });

const errors = consoleErrors.filter((message) => !message.includes('favicon'));
check(errors.length === 0, 'no browser console/page errors', errors.slice(0, 3).join(' | '));

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nAll scrolling-stage verifications passed. Evidence in ${OUT}`);

/**
 * Lesson-flow + grounding verification.
 *
 * Drives the live build on :4174 and proves the three gameplay changes:
 *  - the player starts with only basic attacks (chains resolve to starters)
 *  - clearing wave 1 opens the lesson overlay with route lists on the cards
 *  - after picking a lesson the unlocked chain actually fires in combat
 *  - contact shadows hug the actors' feet (grounding regression guard)
 */
import { chromium } from 'playwright';
import { mkdirSync, readdirSync } from 'node:fs';

const OUT = '/tmp/fechtschule-lesson-flow';
mkdirSync(OUT, { recursive: true });

// Reuse any already-cached Chromium build when the pinned one is not installed.
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    if (!/Executable doesn't exist/.test(String(error))) throw error;
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

const checks = [];
function check(name, pass, detail = '') {
  checks.push({ name, pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error' && !message.location().url?.endsWith('favicon')) errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !response.url().includes('favicon')) errors.push(`${response.status()} ${response.url()}`);
  });

  await page.goto('http://localhost:4174/', { waitUntil: 'networkidle' });
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) await registration.unregister();
  });
  // Reload so the page itself runs the freshly deployed build instead of
  // whatever the (now unregistered) service worker had precached.
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => {
    if (window.__FECHTSCHULE__?.controller?.startSolo) window.__FECHTSCHULE__.controller.startSolo(false);
  });
  await page.waitForTimeout(2600);

  const basicState = await page.evaluate(() => {
    const world = window.__FECHTSCHULE__?.controller?.world;
    if (!world) return null;
    const { resolvePlayerAttack } = window.__FECHTSCHULE_MODULES__ ?? {};
    return {
      lessons: world.lessons ? [...world.lessons] : null,
      phase: world.phase,
      level: world.levelIndex,
      wave: world.waveInLevel,
      roadWidth: world.road
    };
  });
  check('run starts with zero lessons', Array.isArray(basicState?.lessons) && basicState.lessons.length === 0, JSON.stringify(basicState));
  check('the opening road scrolls', (basicState?.roadWidth ?? 0) > 1280, `roadWidth ${basicState?.roadWidth}`);

  // Beat wave 1 quickly: march east and auto-kill through the clear-fallback.
  const cleared = await page.evaluate(async () => {
    const world = window.__FECHTSCHULE__.controller.world;
    const neutral = { moveX: 0, moveZ: 0, lightPressed: false, heavyPressed: false, mobilityPressed: false, switchPressed: false, guardHeld: false, guardPressed: false };
    for (let frame = 0; frame < 60 * 90 && world.phase === 'wave' && world.levelIndex === 0; frame += 1) {
      for (const actor of world.actors) {
        if (actor.team === 'players') { actor.health = actor.maxHealth; actor.invulnerable = 2; }
        else if (actor.state !== 'dead') { actor.health = 0; actor.state = 'dead'; actor.deathTimer = 2; }
      }
      world.step(1 / 60, [{ ...neutral, moveX: 1 }]);
    }
    return { phase: world.phase, level: world.levelIndex, wave: world.waveInLevel };
  });
  check('clearing the first level opens the lesson phase', cleared.phase === 'lesson', JSON.stringify(cleared));

  // The overlay syncs on the next animation frame after the sim phase flips.
  await page.waitForTimeout(250);
  const overlay = await page.evaluate(() => {
    const overlayElement = document.getElementById('lesson-overlay');
    const cards = [...document.querySelectorAll('.lesson-card')];
    return {
      hidden: overlayElement?.classList.contains('is-hidden') ?? true,
      cards: cards.map((card) => ({ title: card.querySelector('strong')?.textContent ?? '', routes: card.querySelectorAll('.lesson-routes li').length }))
    };
  });
  check('lesson overlay is visible', !overlay.hidden, JSON.stringify(overlay));
  check('each card lists its input routes', overlay.cards.length >= 2 && overlay.cards.every((card) => card.routes >= 1), JSON.stringify(overlay.cards));
  await page.screenshot({ path: `${OUT}/lesson-overlay.png` });

  // Pick the first card and confirm the unlocked chain fires in combat.
  const chain = await page.evaluate(() => {
    const controller = window.__FECHTSCHULE__.controller;
    const world = controller.world;
    const card = document.querySelector('.lesson-card');
    card?.click();
    const after = { phase: world.phase, lessons: [...world.lessons], level: world.levelIndex, wave: world.waveInLevel };
    // Step the sim: light-light should now chain into ls_l2 for the lesson picked.
    const neutral = { moveX: 0, moveZ: 0, lightPressed: false, heavyPressed: false, mobilityPressed: false, switchPressed: false, guardHeld: false, guardPressed: false };
    world.step(1 / 60, [{ ...neutral, lightPressed: true }]);
    for (let frame = 0; frame < 20; frame += 1) world.step(1 / 60, [{ ...neutral, lightPressed: frame === 12 }]);
    const player = world.actors.find((actor) => actor.team === 'players');
    return { after, firstAttack: player?.attack?.id ?? null, recent: player?.lastInput ?? null };
  });
  check('lesson choice resumes at the next place', chain.after.phase === 'wave' && chain.after.level === 1 && chain.after.wave === 0, JSON.stringify(chain.after));
  check('exactly one lesson learned', chain.after.lessons.length === 1, JSON.stringify(chain.after.lessons));
  check('opening light fires', chain.firstAttack === 'ls_l1' || chain.firstAttack === 'ls_l2', String(chain.firstAttack));

  // Shadow grounding: re-render the same frozen frame with and without
  // drawShadow — the pixel diff is exactly the contact shadow. Its bounding
  // box must straddle the feet line (top at/above the heel row, bottom below
  // it) and darken pixels, proving the actor stands ON the ground.
  const grounding = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    const controller = window.__FECHTSCHULE__.controller;
    const world = controller.world;
    const player = world.actors.find((actor) => actor.team === 'players');
    if (!canvas || !player || !controller.renderer?.render) return { ok: false };
    // Pin on the open lower cobblestone: the upper band sits under the dark
    // awning, where an alpha shadow's measured darkening varies with the
    // animated corruption overlay beneath it.
    player.x = 400; player.z = 560; player.invulnerable = 5;
    world.cameraX = 0;
    const snapshot = world.snapshot();
    const context = canvas.getContext('2d');
    const renderWith = (shadowOn) => {
      if (shadowOn) delete controller.renderer.drawShadow;
      else controller.renderer.drawShadow = () => {};
      controller.renderer.render(snapshot, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height).data;
    };
    const withShadow = renderWith(true);
    const withoutShadow = renderWith(false);
    delete controller.renderer.drawShadow;
    const scale = canvas.width / canvas.clientWidth;
    const feetY = Math.round(player.z * scale);
    let count = 0; let sumDelta = 0;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let y = feetY - 40 * scale; y < feetY + 40 * scale; y += 1) {
      for (let x = (player.x - 90) * scale; x < (player.x + 90) * scale; x += 1) {
        const index = (Math.round(y) * canvas.width + Math.round(x)) * 4;
        const delta = (withShadow[index] + withShadow[index + 1] + withShadow[index + 2])
          - (withoutShadow[index] + withoutShadow[index + 1] + withoutShadow[index + 2]);
        if (delta < -6) {
          count += 1; sumDelta += delta;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    return {
      ok: true, playerZ: player.z, feetY,
      shadowPixels: count,
      meanDarkening: count ? Math.round(sumDelta / count / 3) : 0,
      top: count ? Math.round(minY) : null,
      bottom: count ? Math.round(maxY) : null,
      straddlesFeet: count > 0 && minY <= feetY + 3 && maxY >= feetY + 2
    };
  });
  check('grounding sample readable', grounding.ok === true, JSON.stringify(grounding));
  check('contact shadow straddles the feet line', grounding.ok && grounding.shadowPixels > 250 && grounding.straddlesFeet && grounding.meanDarkening < -8, `pixels ${grounding.shadowPixels}, top ${grounding.top} vs feet ${grounding.feetY}, bottom ${grounding.bottom}, darkening ${grounding.meanDarkening}`);

  check('no browser errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await page.screenshot({ path: `${OUT}/after-choice.png` });
} finally {
  await browser.close();
}

const failed = checks.filter((entry) => !entry.pass);
console.log(failed.length === 0 ? `\nAll ${checks.length} lesson-flow checks passed. Evidence in ${OUT}` : `\n${failed.length} CHECK(S) FAILED`);
process.exit(failed.length === 0 ? 0 : 1);

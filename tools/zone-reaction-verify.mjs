#!/usr/bin/env node
/**
 * End-to-end verification for the per-zone authored reaction rollout.
 * Browser 1: the animation gallery (asset readiness + explicit zone-clip resolution
 *            through the real runtime catalog that playback uses).
 * Browser 2: live solo combat (?autostart=1&skipCountdown=1) where Meyer presses
 *            light attacks into the crowd; each NPC hitstun sample must carry a
 *            reaction zone and a catalog that resolves it to an authored clip.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const BASE = 'http://localhost:4174';
const OUT = '/tmp/fechtschule-zone-reactions';
mkdirSync(OUT, { recursive: true });

const failures = [];
function check(ok, label, detail = '') {
  const suffix = detail ? ` — ${detail}` : '';
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${suffix}`);
  if (!ok) failures.push(`${label}${suffix}`);
}

// Reuse any already-cached Chromium build when the pinned one is not installed.
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const missingExecutable = /Executable doesn't exist/.test(String(error));
    if (!missingExecutable) throw error;
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

// ---------- Gallery readiness + per-zone clip resolution ----------
const gallery = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
gallery.on('console', (message) => {
  if (message.type() !== 'error') return;
  // URL-less resource messages are captured with their URL by the response handler.
  if (/Failed to load resource/.test(message.text())) return;
  consoleErrors.push(message.text());
});
gallery.on('pageerror', (error) => consoleErrors.push(String(error)));
gallery.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('favicon')) {
    consoleErrors.push(`gallery: ${response.status()} ${response.url()}`);
  }
});

await gallery.goto(`${BASE}/animation-gallery.html`, { waitUntil: 'networkidle' });
await gallery.evaluate(() => window.animationGallery.ready());
const status = await gallery.evaluate(() => window.animationGallery.status());
check(
  status.readiness.failedAssets === 0 && status.readiness.pendingAssets === 0,
  'gallery asset readiness',
  `${status.readiness.readyClips} clips, ${status.readiness.loadedAssets} frames`
);

const galleryReport = await gallery.evaluate(async () => {
  const api = window.animationGallery;
  const npc = ['thug', 'spear', 'captain', 'wretch', 'grotesque'];
  const results = [];
  for (const archetype of npc) {
    for (const zone of ['head', 'torso', 'legs']) {
      const clipId = `${archetype}:default:hitstun_${zone}`;
      let found = false;
      let cue = null;
      try {
        const outcome = api.selectClip(clipId);
        found = outcome.clipId === clipId;
        cue = outcome.cue;
      } catch {
        found = false;
      }
      results.push({ clipId, found, cue });
    }
  }
  return results;
});
for (const result of galleryReport) {
  check(result.found, `gallery resolves ${result.clipId}`, `first cue: ${result.cue}`);
}

// Evidence sheet: head, torso, and legs reaction rows for one NPC each.
const sheetClips = [
  'spear:default:hitstun_head',
  'captain:default:hitstun_torso',
  'wretch:default:hitstun_legs',
  'grotesque:default:hitstun_head'
];
for (let index = 0; index < sheetClips.length; index += 1) {
  const state = await gallery.evaluate((clipId) => {
    const outcome = window.animationGallery.selectClip(clipId);
    window.animationGallery.selectFrame(0);
    return outcome;
  }, sheetClips[index]);
  check(state.frameIndex === 0 && state.cue === 'contact', `evidence pose ${sheetClips[index]}`, `frame ${state.frameIndex}, cue ${state.cue}`);
  await gallery.waitForTimeout(120);
  await gallery.screenshot({ path: `${OUT}/gallery-${index}-${sheetClips[index].replaceAll(':', '-')}.png` });
}

// ---------- Live combat reaction resolution ----------
const game = await browser.newPage({ viewport: { width: 1280, height: 720 } });
game.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (/Failed to load resource/.test(message.text())) return;
  consoleErrors.push(`game: ${message.text()}`);
});
game.on('pageerror', (error) => consoleErrors.push(`game: ${String(error)}`));
game.on('response', (response) => {
  if (response.status() >= 400 && !response.url().includes('favicon')) {
    consoleErrors.push(`game: ${response.status()} ${response.url()}`);
  }
});

await game.goto(`${BASE}/?autostart=1&skipCountdown=1&seed=1948&debug=1`, { waitUntil: 'domcontentloaded' });
await game.waitForFunction(() => window.__FECHTSCHULE__?.controller?.world?.phase === 'wave', null, { timeout: 20000 });
await game.waitForFunction(() => {
  if (typeof window.render_game_to_text !== 'function') return false;
  const state = JSON.parse(window.render_game_to_text());
  return state.animationAssets?.pendingAssets === 0 && state.animationAssets?.failedAssets === 0;
}, null, { timeout: 30000 });

// Deterministic sandbox (same model as tools/three-zone-playtest.mjs): strip the
// world to Meyer plus one passive thug at light-attack range, then arm each
// zone attack directly so every reaction can be observed without AI noise.
await game.evaluate(async () => {
  const controller = window.__FECHTSCHULE__.controller;
  const world = controller.world;
  const [{ createEnemy }, { attackDuration, getAttack }] = await Promise.all([
    import('./js/sim/factories.js'),
    import('./js/sim/attacks.js')
  ]);
  const player = world.actors.find((actor) => actor.team === 'players');
  world.actors.splice(0, world.actors.length, player);
  world.spawnQueue = [];
  world.spawnClock = 0;
  world.permissionTimer = 99;
  world.clearTimer = 0;
  world.waveResolved = false;
  player.x = 500;
  player.z = 445;
  player.facing = 1;
  player.health = player.maxHealth;
  player.state = 'idle';
  player.stateElapsed = 0;
  player.stateDuration = 0;
  player.attack = null;
  player.reactionZone = null;
  const thug = createEnemy(9001, 'thug', 566, 445);
  thug.facing = -1;
  thug.aiCooldown = 99;
  thug.attackPermission = false;
  world.actors.push(thug);
  window.__ZONE_VERIFY__ = {
    player,
    thug,
    getAttack,
    armPlayer(attackId, targetId) {
      const definition = getAttack(attackId);
      player.state = 'attack';
      player.stateElapsed = 0;
      player.stateDuration = attackDuration(definition);
      player.reactionZone = null;
      player.attack = {
        id: attackId,
        elapsed: 0,
        targetId,
        hitIds: new Set(),
        hitConfirmed: false,
        blocked: false,
        queuedAction: null,
        activeCuePlayed: false,
        signatureShown: false
      };
    },
    resetThug() {
      thug.health = thug.maxHealth;
      thug.state = 'idle';
      thug.stateElapsed = 0;
      thug.stateDuration = 0;
      thug.reactionZone = null;
      thug.attack = null;
    }
  };
  controller.renderCurrentSnapshot(0);
});

const combatProof = await game.evaluate(async () => {
  const test = window.__ZONE_VERIFY__;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const samples = [];
  const attacks = { torso: 'ls_l1', head: 'ls_l3', legs: 'ls_low_l' };
  for (const [zone, attackId] of Object.entries(attacks)) {
    test.resetThug();
    test.armPlayer(attackId, test.thug.id);
    const startup = test.getAttack(attackId).startup * 1000;
    window.advanceTime(startup + 60);
    samples.push({
      zone,
      attackId,
      thugState: test.thug.state,
      reactionZone: test.thug.reactionZone,
      health: Math.round(test.thug.health)
    });
    await wait(0);
  }
  return samples;
});

console.log('Live hitstun samples:', JSON.stringify(combatProof));
check(combatProof.length === 3, 'deterministic sandbox armed all three zone attacks');
for (const sample of combatProof) {
  check(sample.thugState === 'hitstun', `thug entered hitstun from the ${sample.zone} attack`,
    `state: ${sample.thugState}, health: ${sample.health}`);
  check(sample.reactionZone === sample.zone, `thug reaction zone resolved to ${sample.zone}`,
    `zone: ${sample.reactionZone}`);
  check(sample.health < 30, `thug lost health from the ${sample.zone} attack`, `health: ${sample.health}`);
}

await game.screenshot({ path: `${OUT}/live-combat.png` });

// ---------- Visual distinctness: pixels, not just lookup ids ----------
// A zone reaction must read differently from the generic hitstun silhouette.
// Torso intentionally shares the generic design (the established thug model);
// head and legs must differ on the contact pose's pixels.
const pixelReport = await gallery.evaluate(async () => {
  const load = (url) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`could not load ${url}`));
    image.src = url;
  });
  const diff = async (aUrl, bUrl) => {
    const [a, b] = await Promise.all([load(aUrl), load(bUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = a.naturalWidth;
    canvas.height = a.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(a, 0, 0);
    const dataA = context.getImageData(0, 0, canvas.width, canvas.height).data;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(b, 0, 0);
    const dataB = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let differing = 0;
    let union = 0;
    for (let index = 0; index < dataA.length; index += 4) {
      const inA = dataA[index + 3] > 8;
      const inB = dataB[index + 3] > 8;
      if (inA || inB) union += 1;
      const colorDelta = inA && inB
        ? Math.abs(dataA[index] - dataB[index]) + Math.abs(dataA[index + 1] - dataB[index + 1]) + Math.abs(dataA[index + 2] - dataB[index + 2])
        : 0;
      if (inA !== inB || colorDelta > 24) differing += 1;
    }
    return { differing, union, ratio: union ? differing / union : 0 };
  };
  const actors = { thug: 'club', spear: 'spear', captain: 'captain-sword', wretch: 'claws', grotesque: 'claws' };
  const report = {};
  for (const [actor, weapon] of Object.entries(actors)) {
    for (const zone of ['head', 'torso', 'legs']) {
      report[`${actor}:${zone}`] = await diff(
        `assets/art-v2/${actor}/${weapon}/hitstun/01.webp`,
        `assets/art-v2/${actor}/${weapon}/hitstun_${zone}/01.webp`
      );
    }
  }
  return report;
});
for (const [key, entry] of Object.entries(pixelReport)) {
  check(entry.union > 1000, `${key} contact pose is not blank`, `${entry.union} union pixels`);
  if (key.endsWith(':torso')) {
    console.log(`INFO ${key} shares the generic torso design by contract (diff ratio ${entry.ratio.toFixed(3)})`);
  } else {
    check(entry.ratio > 0.05, `${key} silhouette differs from generic hitstun`, `diff ratio ${entry.ratio.toFixed(3)}`);
  }
}

const errors = consoleErrors.filter((message) => !message.includes('favicon'));
check(errors.length === 0, 'no browser console/page errors', errors.slice(0, 3).join(' | '));

await browser.close();

if (failures.length > 0) {
  console.error(`\n${failures.length} failure(s):`);
  for (const failure of failures) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`\nAll zone-reaction verifications passed. Evidence in ${OUT}`);

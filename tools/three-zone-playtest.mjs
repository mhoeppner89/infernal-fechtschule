#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function options(argv) {
  const result = {
    url: 'http://localhost:4174/',
    out: '/private/tmp/infernal-three-zone-playtest',
    viewport: null,
    scenario: null
  };
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--url' && argv[index + 1]) result.url = argv[++index];
    else if (argv[index] === '--out' && argv[index + 1]) result.out = argv[++index];
    else if (argv[index] === '--viewport' && argv[index + 1]) result.viewport = argv[++index];
    else if (argv[index] === '--scenario' && argv[index + 1]) result.scenario = argv[++index];
  }
  return result;
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch (primaryError) {
    const codexRoot = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const fallback = path.join(codexRoot, 'node_modules', 'playwright', 'index.mjs');
    if (fs.existsSync(fallback)) return import(pathToFileURL(fallback).href);
    throw primaryError;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const config = options(process.argv);
fs.mkdirSync(config.out, { recursive: true });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader']
});

const errors = [];
const evidence = [];

async function openScenario(viewport, scenario) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, serviceWorkers: 'block' });
  const page = await context.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push({ scenario, type: 'console', text: message.text() });
  });
  page.on('pageerror', (error) => errors.push({ scenario, type: 'page', text: String(error) }));
  page.on('requestfailed', (request) => errors.push({
    scenario,
    type: 'request',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`
  }));

  const url = new URL(config.url);
  url.searchParams.set('autostart', '1');
  url.searchParams.set('skipCountdown', '1');
  url.searchParams.set('seed', '1948');
  url.searchParams.set('debug', '1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const hook = window.__FECHTSCHULE__;
    return hook?.controller?.world?.phase === 'wave';
  });
  await page.waitForFunction(() => {
    if (typeof window.render_game_to_text !== 'function') return false;
    const state = JSON.parse(window.render_game_to_text());
    return state.animationAssets?.pendingAssets === 0 && state.animationAssets?.failedAssets === 0;
  }, null, { timeout: 30000 });

  await page.evaluate(async () => {
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
    window.__ZONE_TEST__ = {
      controller,
      world,
      player,
      thug,
      getAttack,
      attackDuration,
      arm(actor, attackId, targetId, elapsed) {
        const definition = getAttack(attackId);
        actor.state = 'attack';
        actor.stateElapsed = elapsed;
        actor.stateDuration = attackDuration(definition);
        actor.reactionZone = null;
        actor.attack = {
          id: attackId,
          elapsed,
          targetId,
          hitIds: new Set(),
          hitConfirmed: false,
          blocked: false,
          queuedAction: null,
          activeCuePlayed: false,
          signatureShown: false
        };
      }
    };
    controller.renderCurrentSnapshot(0);
  });
  return { context, page };
}

async function record(page, viewportName, scenario, checks) {
  const slug = `${viewportName}-${scenario}`;
  const screenshot = path.join(config.out, `${slug}.png`);
  const statePath = path.join(config.out, `${slug}.json`);
  await page.screenshot({ path: screenshot });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
  checks(state);
  evidence.push({ viewport: viewportName, scenario, screenshot, state: statePath });
}

const viewports = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'phone', width: 844, height: 390 }
].filter((viewport) => config.viewport === null || viewport.name === config.viewport);
assert(viewports.length > 0, `unknown viewport ${config.viewport}`);

for (const viewport of viewports) {
  if (config.scenario === null || config.scenario === 'high-miss') {
    const { context, page } = await openScenario(viewport, 'high-miss');
    const healthBefore = await page.evaluate(() => {
      const test = window.__ZONE_TEST__;
      test.player.state = 'crouch';
      test.player.stateElapsed = 0.08;
      test.player.stateDuration = 0.48;
      const definition = test.getAttack('thug_overhead');
      test.arm(test.thug, 'thug_overhead', test.player.id, definition.startup - 1 / 60);
      return test.player.health;
    });
    await page.evaluate(() => window.advanceTime(17));
    await record(page, viewport.name, 'high-miss', (state) => {
      const player = state.actors.find((actor) => actor.team === 'players');
      const thug = state.actors.find((actor) => actor.archetype === 'thug');
      assert(player.health === Math.round(healthBefore), 'head strike damaged crouching player');
      assert(player.crouching === true, 'player did not remain crouched under head strike');
      assert(thug.attackId === 'thug_overhead' && thug.hitZone === 'head', 'head strike proof missing');
    });
    await context.close();
  }

  if (config.scenario === null || config.scenario === 'torso-hit') {
    const { context, page } = await openScenario(viewport, 'torso-hit');
    const healthBefore = await page.evaluate(() => {
      const test = window.__ZONE_TEST__;
      const definition = test.getAttack('thug_body');
      test.arm(test.thug, 'thug_body', test.player.id, definition.startup - 1 / 60);
      return test.player.health;
    });
    await page.evaluate(() => window.advanceTime(17));
    await record(page, viewport.name, 'torso-hit', (state) => {
      const player = state.actors.find((actor) => actor.team === 'players');
      assert(player.health < Math.round(healthBefore), 'torso strike did not damage player');
      assert(player.reactionZone === 'torso', 'torso reaction clip was not selected');
    });
    await context.close();
  }

  if (config.scenario === null || config.scenario === 'duck-low') {
    const { context, page } = await openScenario(viewport, 'duck-low');
    await page.keyboard.down('KeyL');
    await page.evaluate(() => window.advanceTime(17));
    await page.keyboard.up('KeyL');
    await page.keyboard.down('KeyJ');
    await page.evaluate(() => window.advanceTime(17));
    await page.keyboard.up('KeyJ');
    const route = await page.evaluate(() => {
      const player = window.__ZONE_TEST__.player;
      return { attackId: player.attack?.id ?? null, startup: window.__ZONE_TEST__.getAttack(player.attack?.id).startup };
    });
    assert(route.attackId === 'ls_low_l', `Duck then Light routed to ${route.attackId}`);
    await page.evaluate(
      (milliseconds) => window.advanceTime(milliseconds),
      Math.ceil((route.startup + 1 / 60) * 1000)
    );
    await record(page, viewport.name, 'duck-low', (state) => {
      const player = state.actors.find((actor) => actor.team === 'players');
      const thug = state.actors.find((actor) => actor.archetype === 'thug');
      assert(player.attackId === 'ls_low_l' && player.hitZone === 'legs', 'low route proof missing');
      assert(thug.reactionZone === 'legs' && thug.health < 28, 'low attack did not connect to legs');
    });
    await context.close();
  }

  if (config.scenario === null || config.scenario === 'direction-dodge') {
    const { context, page } = await openScenario(viewport, 'direction-dodge');
    const startX = await page.evaluate(() => window.__ZONE_TEST__.player.x);
    await page.keyboard.down('ArrowLeft');
    await page.keyboard.down('KeyL');
    await page.evaluate(() => window.advanceTime(100));
    await page.keyboard.up('KeyL');
    await page.keyboard.up('ArrowLeft');
    await record(page, viewport.name, 'direction-dodge', (state) => {
      const player = state.actors.find((actor) => actor.team === 'players');
      assert(player.state === 'dodge', 'direction + Duck did not preserve dodge');
      assert(player.x < startX, 'directional dodge did not move left');
    });
    await context.close();
  }
}
assert(
  config.scenario === null || evidence.length === viewports.length,
  `unknown or unrecorded scenario ${config.scenario}`
);

await browser.close();
assert(errors.length === 0, `browser errors:\n${JSON.stringify(errors, null, 2)}`);
const report = {
  passed: true,
  evidence,
  errors,
  viewportCount: viewports.length,
  scenarioCount: evidence.length
};
fs.writeFileSync(path.join(config.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));

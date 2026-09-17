import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.BASE_URL || 'http://localhost:4187';
const out = 'test-results/runtime-audit';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: !process.argv.includes('--headed') });
const report = { version: browser.version(), checks: [], errors: [], samples: {} };
function check(name, pass, detail = '') { report.checks.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name} ${detail}`); }
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
const page = await context.newPage();
page.on('pageerror', e => report.errors.push(String(e)));
async function fixture({ weapon = 'longsword', facing = 1, target = false } = {}) {
  await page.evaluate(async options => {
    const { GameWorld } = await import('./js/sim/world.js');
    const { createEnemy } = await import('./js/sim/factories.js');
    const { NEUTRAL_INPUT } = await import('./js/sim/types.js');
    const c = window.__FECHTSCHULE__.controller;
    c.input.reset(); c.pendingLocal = { ...NEUTRAL_INPUT }; c.accumulator = 0;
    c.world = new GameWorld({ playerCount: 1, seed: 42, skipCountdown: true });
    const w = c.world; while (w.phase !== 'wave') w.step(1 / 60, [NEUTRAL_INPUT]);
    w.spawnQueue = []; w.actors.splice(1);
    const p = w.actors[0]; p.x = 400; p.z = 420; p.facing = options.facing; p.weapon = options.weapon;
    const e = createEnemy(90, 'thug', options.target ? 465 : 1100, 420);
    e.health = e.maxHealth = 1000; e.aiCooldown = 999; w.actors.push(e);
  }, { weapon, facing, target });
}
async function step(ms = 17) { await page.evaluate(ms => window.advanceTime(ms), ms); }
async function actor() { return page.evaluate(() => window.__FECHTSCHULE__.snapshot().actors.find(a => a.team === 'players')); }
async function edge(code) { await page.keyboard.press(code); await step(); }
try {
  await page.goto(base + '/?autostart=1&skipCountdown=1&seed=92');
  await page.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.phase === 'wave');
  await step(0);
  for (const weapon of ['longsword', 'dussack']) {
    const prefix = weapon === 'longsword' ? 'ls' : 'ds';
    await fixture({ weapon, target: true }); await edge('KeyJ');
    check(`${weapon}: Cut starts basic opener`, (await actor()).attackId === `${prefix}_l1`);
    await page.keyboard.press('KeyJ'); await step(17);
    const captured = await page.evaluate(() => window.__FECHTSCHULE__.controller.world.actors[0].actionBuffer?.action);
    check(`${weapon}: early follow-up is captured`, captured === 'light', String(captured));
    const seen = new Set();
    for (let i = 0; i < 23; i++) { await step(); seen.add((await actor()).attackId); }
    check(`${weapon}: confirmed opener links without lessons`, seen.has(`${prefix}_l2`), [...seen].join(', '));
    for (const facing of [1, -1]) {
      for (const [direction, key] of [['forward', facing === 1 ? 'ArrowRight' : 'ArrowLeft'], ['back', facing === 1 ? 'ArrowLeft' : 'ArrowRight'], ['up', 'ArrowUp'], ['down', 'ArrowDown']]) {
        await fixture({ weapon, facing }); await edge('KeyI');
        await page.keyboard.down(key); await step(34); await page.keyboard.press('KeyJ'); await step();
        await page.keyboard.up(key);
        const state = await actor();
        check(`${weapon} facing ${facing}: Guard/${direction}/Cut`, state.attackId === `${prefix}_guard_${direction}`, String(state.attackId));
      }
    }
  }
  await fixture(); await page.keyboard.down('KeyJ'); await step(750); await page.keyboard.up('KeyJ');
  check('holding Cut does not automatically repeat', (await actor()).state !== 'attack');
  await fixture(); await edge('KeyI'); await step(600); await page.keyboard.down('ArrowUp'); await edge('KeyJ'); await page.keyboard.up('ArrowUp');
  check('expired Guard command returns to ordinary Cut', (await actor()).attackId === 'ls_l1');
  await fixture(); await page.keyboard.down('ArrowRight'); await edge('KeyL'); await page.keyboard.press('KeyJ'); await step(84); await page.keyboard.up('ArrowRight');
  check('early Step/Cut enters passing cut', (await actor()).attackId === 'ls_dodge_l', String((await actor()).attackId));
  for (const button of ['KeyJ', 'KeyK']) {
    await fixture({ target: true });
    await page.evaluate(async () => {
      const { ATTACKS } = await import('./js/sim/attacks.js');
      const w = window.__FECHTSCHULE__.controller.world, p = w.actors[0], e = w.actors[1];
      e.x = p.x + 48; e.facing = -1; w.startAttack(e, 'thug_body', p);
      e.attack.elapsed = ATTACKS.thug_body.startup - 1 / 60; e.stateElapsed = e.attack.elapsed;
    });
    await page.keyboard.down('KeyI'); await step();
    const parried = await page.evaluate(() => window.__FECHTSCHULE__.controller.world.actors[0].counterWindow > 0);
    check(`timed parry opens counter for ${button}`, parried);
    await page.keyboard.press(button); await step(150); await page.keyboard.up('KeyI');
    check(`held Guard allows ${button} counter`, (await actor()).attackId === 'ls_counter', String((await actor()).attackId));
  }
  await fixture(); await edge('KeyK'); await page.keyboard.press('KeyJ'); await step(250);
  check('heavy windup/active cannot be cancelled by Cut', (await actor()).attackId === 'ls_h');
  await step(650);
  check('early heavy follow-up expires rather than firing much later', (await actor()).attackId === null);
  await fixture(); await page.keyboard.down('ArrowRight'); await step(100);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.keyboard.up('ArrowRight');
  const released = await page.evaluate(() => window.__FECHTSCHULE__.controller.input.sample(1 / 60));
  check('focus loss clears input movement', released.moveX === 0 && released.moveZ === 0);
  await page.keyboard.press('Escape'); await page.locator('#pause-title-button').click();
  await page.locator('#open-network').click(); await page.locator('#host-answer').fill('J K L I U');
  await page.keyboard.press('KeyJ');
  const typed = await page.evaluate(() => window.__FECHTSCHULE__.controller.input.sample(1 / 60));
  check('network text entry cannot trigger game actions', !typed.lightPressed && !typed.heavyPressed && !typed.mobilityPressed && !typed.switchPressed);
  await page.locator('#close-network').click();
  await page.goto(base + '/?autostart=1&skipCountdown=1&seed=81');
  await page.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.phase === 'wave'); await step(0);
  const perf = await page.evaluate(async () => {
    const { createEnemy } = await import('./js/sim/factories.js');
    const c = window.__FECHTSCHULE__.controller, w = c.world;
    w.actors.splice(1); w.actors[0].x = 420; w.actors[0].z = 430;
    const cast = ['thug', 'spear', 'captain', 'wretch'];
    for (let i = 0; i < 16; i++) w.actors.push(createEnemy(100 + i, cast[i % 4], 160 + (i % 6) * 170, 300 + Math.floor(i / 6) * 115));
    const scene = w.snapshot(), times = [];
    for (let i = 0; i < 120; i++) {
      scene.time += 1 / 60; scene.tick++;
      const start = performance.now(); c.renderer.render(scene, 1 / 60);
      if (i >= 20) times.push(performance.now() - start);
    }
    times.sort((a, b) => a - b);
    return { actors: scene.actors.length, medianMs: times[50], p95Ms: times[95], maximumMs: times.at(-1), canvas: { width: document.querySelector('canvas').width, height: document.querySelector('canvas').height } };
  });
  report.samples.render = perf;
  check('17-actor render remains below 50ms p95 on test Mac', perf.p95Ms < 50, JSON.stringify(perf));
  await page.screenshot({ path: `${out}/crowd-stress.png`, timeout: 15000 });
  check('no browser exceptions in runtime audit', report.errors.length === 0, report.errors.join('; '));
} catch (error) { report.errors.push(String(error.stack || error)); check('runtime audit completes', false, String(error)); }
finally {
  await browser.close();
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2));
  console.log(`${report.checks.filter(c => c.pass).length}/${report.checks.length} runtime checks passed`);
  if (report.checks.some(c => !c.pass) || report.errors.length) process.exitCode = 1;
}

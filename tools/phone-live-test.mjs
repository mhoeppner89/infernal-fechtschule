import { chromium, webkit } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.BASE_URL || 'http://localhost:4187';
const baseline = process.argv.includes('--baseline');
const engine = process.argv.includes('--webkit') ? webkit : chromium;
const out = path.resolve('test-results', baseline ? 'before' : engine === webkit ? 'webkit' : 'chrome');
await mkdir(out, { recursive: true });
const browser = await engine.launch({ headless: !process.argv.includes('--headed'), timeout: 20000, ...(engine === chromium ? { channel: 'chrome' } : {}) });
const report = { base, baseline, engine: engine.name(), version: browser.version(), checks: [], errors: [], assets: [], measurements: [] };
function check(name, value, detail = '') { report.checks.push({ name, pass: !!value, detail }); console.log(`${value ? 'PASS' : 'FAIL'} ${name} ${detail}`); }
async function observe(page) {
  page.on('pageerror', e => report.errors.push(String(e)));
  page.on('response', r => { if (/\.(png|webp|jpg|jpeg)(?:\?|$)/i.test(r.url())) report.assets.push(r.url()); });
}
async function start(page) {
  await page.goto(base + '/?autostart=1&skipCountdown=1&seed=17');
  await page.waitForFunction(() => window.__FECHTSCHULE__?.snapshot()?.actors.some(a => a.team === 'players'));
  await page.evaluate(() => window.__FECHTSCHULE__.controller.advanceTime(0));
}
async function isolateControls(page) {
  // Input mapping is tested in a quiet fixture; combat is exercised separately.
  await page.evaluate(() => {
    const world = window.__FECHTSCHULE__.controller.world;
    const player = world.actors.find(actor => actor.team === 'players');
    world.enterNeutral(player);
    for (const actor of world.actors.filter(actor => actor.team === 'enemies')) {
      actor.x = player.x + 700; actor.attack = null;
      actor.state = 'idle'; actor.aiCooldown = 60;
    }
  });
}
async function snapshot(page) { return JSON.parse(await page.evaluate(() => window.render_game_to_text())); }
async function advance(page, ms) { await page.evaluate(ms => window.advanceTime(ms), ms); }
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
  await observe(page); await page.goto(base); await page.waitForTimeout(700);
  check('title has actionable play button', await page.locator('#start-solo').isVisible());
  await page.screenshot({ path: path.join(out, 'title-desktop.png') });
  await start(page); await advance(page, 2000);
  await page.screenshot({ path: path.join(out, 'combat-desktop.png') });
  await isolateControls(page);
  const before = await snapshot(page);
  await page.keyboard.down('ArrowRight'); await advance(page, 300); await page.keyboard.up('ArrowRight');
  const moved = await snapshot(page);
  check('keyboard moves player horizontally', moved.actors.find(a => a.team === 'players').x > before.actors.find(a => a.team === 'players').x);
  await page.keyboard.press('Escape'); const paused = await snapshot(page); await advance(page, 300);
  check('pause freezes simulation', (await snapshot(page)).tick === paused.tick && paused.paused);
  await page.locator('#resume-button').click(); await advance(page, 100);
  check('resume advances simulation', (await snapshot(page)).tick > paused.tick);
  await page.keyboard.press('KeyJ'); await advance(page, 17);
  check('keyboard cut begins attack', (await snapshot(page)).actors.some(a => a.team === 'players' && a.state === 'attack'));
  await writeFile(path.join(out, 'desktop-snapshot.json'), JSON.stringify(await snapshot(page), null, 2));
  await page.close();
  for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 932, height: 430 }, { width: 390, height: 844 }, { width: 360, height: 740 }]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const phone = await context.newPage(); await observe(phone); await phone.goto(base); await phone.waitForTimeout(250);
    const label = `${viewport.width}x${viewport.height}`;
    await phone.screenshot({ path: path.join(out, `title-${label}.png`) });
    await start(phone); await advance(phone, 1000);
    const layout = await phone.evaluate(() => {
      const controls = [...document.querySelectorAll('#touch-controls [data-button], [data-control="joystick"]')].map(el => {
        const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
        return { button: el.dataset.button || 'stick', x: r.x, y: r.y, w: r.width, h: r.height, visible: s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 };
      });
      return { controls, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, rotateBlocks: [...document.querySelectorAll('.rotate-overlay')].some(el => getComputedStyle(el).display !== 'none' && getComputedStyle(el).pointerEvents !== 'none') };
    });
    check(`${label} primary touch targets >=48px`, layout.controls.filter(c => c.button !== 'switch').every(c => c.visible && c.w >= 48 && c.h >= 48), JSON.stringify(layout.controls));
    check(`${label} controls within viewport`, layout.controls.every(c => c.x >= -1 && c.y >= -1 && c.x + c.w <= viewport.width + 1 && c.y + c.h <= viewport.height + 1));
    check(`${label} no horizontal page overflow`, layout.scrollWidth <= layout.width);
    if (!baseline) check(`${label} portrait/landscape play not blocked`, !layout.rotateBlocks);
    if (!baseline) {
      const geometry = await phone.evaluate(() => {
        const c = document.querySelector('#game-canvas'), r = c.getBoundingClientRect();
        const buttons = [...document.querySelectorAll('#touch-controls [data-button], [data-control="joystick"]')];
        const overlap = (a, b) => Math.min(a.right,b.right)-Math.max(a.left,b.left)>0.5 && Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>0.5;
        let pairs = 0;
        for (let i=0;i<buttons.length;i++) for(let j=i+1;j<buttons.length;j++) if(overlap(buttons[i].getBoundingClientRect(),buttons[j].getBoundingClientRect())) pairs++;
        return { arenaHeight:r.height, uniformScale:Math.abs(r.width/r.height-c.width/c.height)<0.005, overlaps:pairs,
          fieldBlocked:buttons.some(b=>overlap(r,b.getBoundingClientRect())),
          centers:buttons.filter(b=>b.dataset.button).every(b=>{const q=b.getBoundingClientRect();return b.contains(document.elementFromPoint(q.x+q.width/2,q.y+q.height/2));}) };
      });
      check(`${label} touch hit regions do not overlap`, geometry.overlaps===0);
      check(`${label} no controls cover the playfield`, !geometry.fieldBlocked);
      check(`${label} button centers dispatch to correct controls`, geometry.centers);
      check(`${label} undistorted procedural viewport`, geometry.uniformScale);
      if(viewport.width<viewport.height) check(`${label} portrait field >=320px tall`, geometry.arenaHeight>=320, `${geometry.arenaHeight}px`);
      await phone.locator('#guide-button').click();
      check(`${label} move guide pauses the fight`, (await snapshot(phone)).paused);
      await phone.locator('#close-guide').click();
      check(`${label} closing guide resumes`, !(await snapshot(phone)).paused);
    }
    await phone.screenshot({ path: path.join(out, `combat-${label}.png`), timeout:15000 });
    if (engine === chromium && viewport.width > viewport.height) {
      await isolateControls(phone);
      const client = await context.newCDPSession(phone);
      const stick = layout.controls.find(c => c.button === 'stick');
      const cut = layout.controls.find(c => c.button === 'light');
      const a = { x: stick.x + stick.w * .76, y: stick.y + stick.h * .5, id: 1 };
      const b = { x: cut.x + cut.w * .5, y: cut.y + cut.h * .5, id: 2 };
      const old = (await snapshot(phone)).actors.find(a => a.team === 'players');
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
      await advance(phone, 250);
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a, b] });
      await advance(phone, 17);
      const now = (await snapshot(phone)).actors.find(a => a.team === 'players');
      check(`${label} simultaneous stick + cut`, now.x > old.x && now.state === 'attack');
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await advance(phone, 600);
      const released = await phone.evaluate(() => { const t = window.__FECHTSCHULE__.controller.input.touch; return { x: t.moveX, z: t.moveZ, held: t.isHeld('light') }; });
      check(`${label} releasing touch clears movement/attack`, released.x === 0 && released.z === 0 && !released.held);
      await client.detach();
    }
    await writeFile(path.join(out, `snapshot-${label}.json`), JSON.stringify(await snapshot(phone), null, 2));
    await context.close();
  }
  if (!baseline) check('zero runtime sprite/background bitmap downloads', report.assets.filter(u => !u.includes('/icons/')).length === 0, `${report.assets.length} raster requests including icons`);
  check('no browser JavaScript errors', report.errors.length === 0, report.errors.join('; '));
} catch (error) { report.errors.push(String(error.stack || error)); check('suite completes', false, String(error)); }
finally {
  await browser.close(); await writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`Results: ${report.checks.filter(c => c.pass).length}/${report.checks.length} checks. ${out}`);
  if (report.checks.some(c => !c.pass) || report.errors.length) process.exitCode = 1;
}

import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
const out = 'test-results/live-soak'; await mkdir(out, { recursive:true });
const browser = await chromium.launch({ channel:'chrome', headless:!process.argv.includes('--headed') });
const report = { browser:browser.version(), targetDurationSeconds:30, errors:[], observations:[], checks:[], frames:null };
const page = await browser.newPage({ viewport:{width:844,height:390}, isMobile:true, hasTouch:true, deviceScaleFactor:2, serviceWorkers:'block' });
page.on('pageerror', e=>report.errors.push(String(e)));
function check(name, pass, detail='') { report.checks.push({name,pass:!!pass,detail}); console.log(`${pass?'PASS':'FAIL'} ${name} ${detail}`); }
try {
  await page.goto('http://localhost:4187/?autostart=1&skipCountdown=1&seed=678');
  await page.waitForFunction(()=>window.__FECHTSCHULE__?.snapshot()?.phase==='wave');
  await page.evaluate(()=>{window.__frameIntervals=[];let last=performance.now();function frame(now){window.__frameIntervals.push(now-last);last=now;if(window.__frameIntervals.length<2400)requestAnimationFrame(frame);}requestAnimationFrame(frame);});
  let held = new Set(), captured = false, runTick = 0;
  const started = Date.now(), deadline = started+30000;
  while(Date.now()<deadline) {
    const s = await page.evaluate(()=>window.__FECHTSCHULE__.snapshot());
    const p=s.actors.find(a=>a.team==='players'), enemies=s.actors.filter(a=>a.team==='enemies'&&a.state!=='dead');
    if(s.phase==='defeat'||s.phase==='victory') break;
    if(s.phase==='lesson'){await page.locator('#lesson-cards button').first().click();continue;}
    const target=enemies.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    const move = new Set();
    if(target){if(Math.abs(target.x-p.x)>54)move.add(target.x>p.x?'ArrowRight':'ArrowLeft');if(Math.abs(target.z-p.z)>12)move.add(target.z>p.z?'ArrowDown':'ArrowUp');}
    else if(s.exitOpen)move.add('ArrowRight');
    for(const k of held)if(!move.has(k))await page.keyboard.up(k);
    for(const k of move)if(!held.has(k))await page.keyboard.down(k);
    held=move;
    if(runTick%11===0) await page.keyboard.press('KeyI');
    else if(runTick%9===0) await page.keyboard.press('KeyL');
    else await page.keyboard.press(runTick%5===4?'KeyK':'KeyJ');
    if(runTick%15===0)report.observations.push({tick:s.tick,phase:s.phase,score:s.score,health:p.health,actors:s.actors.length});
    if(!captured&&runTick>20&&p.state==='attack'){await page.screenshot({path:`${out}/live-combat.png`});captured=true;}
    runTick++; await page.waitForTimeout(120);
  }
  report.actualDurationSeconds=(Date.now()-started)/1000;
  for(const k of held)await page.keyboard.up(k);
  const final = await page.evaluate(()=>window.__FECHTSCHULE__.snapshot());
  report.final={phase:final.phase,tick:final.tick,score:final.score,health:final.actors.find(a=>a.team==='players')?.health};
  report.frames=await page.evaluate(()=>{const a=window.__frameIntervals.slice(15).filter(n=>n>0).sort((a,b)=>a-b);return {count:a.length,medianMs:a[Math.floor(a.length*.5)],p95Ms:a[Math.floor(a.length*.95)],over50ms:a.filter(n=>n>50).length};});
  check('normal live play advances with physical input',final.tick>120,JSON.stringify(report.final));
  check('normal live play remains finite',final.actors.every(a=>Number.isFinite(a.x)&&Number.isFinite(a.z)&&Number.isFinite(a.health)));
  await page.keyboard.press('Escape');
  if(await page.locator('#restart-button').isVisible())await page.locator('#restart-button').click();
  else await page.evaluate(()=>window.__FECHTSCHULE__.controller.restart());
  await page.waitForTimeout(1000);
  const before=await page.evaluate(()=>window.__FECHTSCHULE__.snapshot().tick);await page.waitForTimeout(400);
  check('restart returns to a live clock',await page.evaluate(()=>window.__FECHTSCHULE__.snapshot().tick)>before);
  check('no exceptions during live play and restart',report.errors.length===0,report.errors.join('; '));
} catch(e){report.errors.push(String(e.stack||e));check('live soak completes',false,String(e));}
finally{await browser.close();await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));if(report.errors.length||report.checks.some(c=>!c.pass))process.exitCode=1;}

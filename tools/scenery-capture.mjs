import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const out='test-results/scenery';await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage({viewport:{width:1280,height:800},serviceWorkers:'block'});
const errors=[], hashes=[];page.on('pageerror',e=>errors.push(String(e)));
try {
  await page.goto('http://localhost:4187/?autostart=1&skipCountdown=1');
  await page.waitForFunction(()=>window.__FECHTSCHULE__?.snapshot()?.phase==='wave');
  await page.clock.install(); await page.clock.pauseAt(new Date(Date.now()+100));
  for(const scenery of ['cobbled-streets','town-gate','sala-darmi','castello']) {
    await page.evaluate(async scenery=>{
      const {createEnemy}=await import('./js/sim/factories.js');
      const c=window.__FECHTSCHULE__.controller,s=window.__FECHTSCHULE__.snapshot();
      const p=s.actors.find(a=>a.team==='players');p.x=440;p.z=430;p.state='attack';p.attackId='ls_guard_up';p.stateElapsed=.13;
      s.actors=[p];for(const [i,kind]of ['thug','spear','captain'].entries()){const e=createEnemy(100+i,kind,570+i*150,380+i*54);s.actors.push({...e,attackId:null,state:'idle'});}
      Object.assign(s,{scenery,phase:'wave',levelName:scenery,waveTitle:'Visual fixture',waveLabel:'SCENERY / EQUIPMENT',cameraX:0,time:2});
      c.ui.update(s,0);for(let frame=0;frame<60;frame++)c.renderer.render(s,1/60);document.querySelector('#banner').classList.add('is-hidden');
    },scenery);
    await page.screenshot({path:`${out}/${scenery}.png`,animations:'disabled'});
    hashes.push(createHash('sha256').update(await readFile(`${out}/${scenery}.png`)).digest('hex'));
  }
  console.log(JSON.stringify({distinctFrames:new Set(hashes).size,errors}));
  await writeFile(`${out}/report.json`,JSON.stringify({distinctFrames:new Set(hashes).size,errors},null,2));
  if(errors.length||new Set(hashes).size!==4)process.exitCode=1;
}finally{await browser.close();}

// Browser smoke uses the installed Chromium and its DevTools protocol directly.
// Run after the Node suite: node tests/scripts/darkness-browser-smoke.mjs [outputDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.mjs';

const output=path.resolve(process.argv[2]||'/tmp/emberfall-darkness-qa');
const flowMode=process.argv.includes('--flows');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-chromium-'));
await fs.mkdir(output,{recursive:true});
const running=await startServer({host:'127.0.0.1',port:0,autoTick:false,storagePath:path.join(profile,'rooms.json')});
const chromium=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let socket;
try {
  let port;
  for(let attempt=0;attempt<100;attempt++) {
    try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}
    await pause(50);
  }
  if(!port)throw new Error('Chromium DevTools did not start.');
  const targets=await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target=targets.find(entry=>entry.type==='page');
  if(!target)throw new Error('Chromium did not create a page.');
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const requests=new Map(),errors=[],consoleErrors=[];
  socket.addEventListener('message',event=>{
    const packet=JSON.parse(event.data);
    if(packet.id){const pending=requests.get(packet.id);requests.delete(packet.id);packet.error?pending?.reject(new Error(packet.error.message)):pending?.resolve(packet.result);}
    if(packet.method==='Runtime.exceptionThrown')errors.push(packet.params.exceptionDetails.exception?.description||packet.params.exceptionDetails.text);
    if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')consoleErrors.push(packet.params.args.map(arg=>arg.value||arg.description).join(' '));
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  };
  const screenshot=async name=>{const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(path.join(output,name),Buffer.from(result.data,'base64'));};
  const click=async selector=>{
    const point=await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    if(!point)throw new Error(`Unavailable enabled control: ${selector}`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await pause(180);
  };
  const open=async panel=>{
    if(await evaluate('Boolean(window.emberfall.ui.currentPanel)'))await click('#close-panel');
    const group={journey:'journal',bestiary:'journal',adventures:'map',dungeons:'map',interactions:'map',craft:'inventory',talents:'character'}[panel]||panel;
    await click(`.topbar [data-panel="${group}"]`);
    if(group!==panel)await click(`#panel-navigation [data-panel="${panel}"]`);
    const scroll=await evaluate('document.getElementById("panel-content").scrollTop');
    if(scroll>1)throw new Error(`Panel ${panel} inherited scroll offset ${scroll}.`);
  };
  await send('Page.enable');await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:running.origin});
  for(let attempt=0;attempt<100;attempt++){if(await evaluate('Boolean(window.emberfall)'))break;await pause(50);}
  if(!await evaluate('Boolean(window.emberfall)'))throw new Error('Game never initialized.');
  const inspectWelcome=()=>evaluate(`({visible:!document.getElementById('welcome-overlay').hidden,classes:document.querySelectorAll('#welcome-classes button').length,viewport:{width:innerWidth,scrollWidth:document.documentElement.scrollWidth}})`);
  const welcome={desktop:await inspectWelcome()};await screenshot('desktop-welcome.png');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await pause(150);welcome.mobile=await inspectWelcome();await screenshot('mobile-welcome.png');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await pause(150);
  await evaluate("document.getElementById('start-button').click()");
  await pause(500);
  const report={origin:running.origin,welcome,desktop:{},mobile:{},flows:{desktop:[],mobile:[]},errors,consoleErrors};
  const record=async(mode,name,expression)=>{
    const passed=!!await evaluate(expression);report.flows[mode].push({name,passed});
    if(!passed)throw new Error(`${mode}: ${name}`);
  };
  const runFlows=async mode=>{
    try {
      const gearId=mode==='desktop'?'relic_helmet_1_1':'relic_helmet_1_2';
      await evaluate(`(() => {const g=window.emberfall.game;g.settings.reducedMotion=true;g.player.level=4;g.player.gold=500;g.player.x=520;g.player.y=1250;g.world.enemies=[];g.addItem(${JSON.stringify(gearId)});g.learn('guardian_vigor');window.emberfall.ui.update(true);})()`);
      await open('inventory');await click(`[data-command="inspect-item"][data-id="${gearId}"]`);
      const favorite=await evaluate(`Boolean(window.emberfall.game.itemFlags[${JSON.stringify(gearId)}]?.favorite)`);
      await click(`[data-command="item-flag"][data-id="${gearId}"][data-flag="favorite"]`);
      await record(mode,'Inspector favorisiert Beute',`Boolean(window.emberfall.game.itemFlags[${JSON.stringify(gearId)}]?.favorite)!==${favorite}`);
      await screenshot(`${mode}-item-inspector.png`);
      await click(`[data-command="depositItem"][data-id="${gearId}"]`);
      await record(mode,'Gegenstand wird sicher eingelagert',`window.emberfall.game.stash[${JSON.stringify(gearId)}]===1`);
      await click('[data-inventory-tab="stash"]');await click(`[data-command="inspect-item"][data-id="${gearId}"]`);await screenshot(`${mode}-stash.png`);
      await click(`[data-command="withdrawItem"][data-id="${gearId}"]`);
      await click('[data-inventory-tab="equipment"]');await click(`[data-command="inspect-item"][data-id="${gearId}"]`);await click(`[data-command="equip"][data-id="${gearId}"]`);
      await record(mode,'Helm landet im eigenständigen Ausrüstungsplatz',`window.emberfall.game.equipment.helmet===${JSON.stringify(gearId)}`);
      await open('character');await screenshot(`${mode}-character.png`);
      await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1440:390,height:1400,deviceScaleFactor:1,mobile:mode==='mobile'});
      await pause(150);await screenshot(`${mode}-paperdoll-full.png`);
      await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1440:390,height:mode==='desktop'?1000:844,deviceScaleFactor:1,mobile:mode==='mobile'});
      await pause(150);await click('[data-character-tab="build"]');
      await click('[data-ui-draft="loadoutName"]');await send('Input.insertText',{text:mode==='desktop'?'QA Desktop':'QA Mobil'});await click('[data-command="save-loadout"]');
      await record(mode,'Benanntes Ausrüstungs- und Skillpreset wird gespeichert',`window.emberfall.game.loadouts.some(l=>l.name===${JSON.stringify(mode==='desktop'?'QA Desktop':'QA Mobil')}&&l.equipment.helmet===${JSON.stringify(gearId)})`);
      await screenshot(`${mode}-build.png`);await click('[data-command="respecTalents"]');await record(mode,'Neuverteilen löscht Talente gegen Gold',`Object.keys(window.emberfall.game.skills).length===0&&window.emberfall.game.player.gold===460`);
      await evaluate(`(() => {const g=window.emberfall.game;g.event('explore','frostgrat');g.event('explore','aschenmoor');g.event('interact','encounter-daemmerhain-lore');${mode==='mobile'?"g.event('interact','encounter-frostgrat-lore');g.event('interact','encounter-aschenmoor-lore');g.event('interact','encounter-glutoede-lore');":""}g.selectCompanion(null);window.emberfall.ui.update(true);})()`);
      await open('journey');await screenshot(`${mode}-journey.png`);await click('[data-journey-tab="companions"]');await click('[data-command="select-companion"][data-id="cinder_moth"]');
      await record(mode,'Freigeschalteter Gefährte kann ausgewählt werden',`window.emberfall.game.journey.activeCompanion==='cinder_moth'`);await screenshot(`${mode}-companions.png`);
      await click('[data-journey-tab="achievements"]');const achievement=mode==='desktop'?'first_horizons':'names_remembered';await click(`[data-command="claimAchievement"][data-id="${achievement}"]`);
      await record(mode,'Erfüllte Errungenschaft zahlt ihre Belohnung',`window.emberfall.game.journey.claimed.includes(${JSON.stringify(achievement)})`);
      await open('adventures');await click('[data-command="waypoint"][data-kind="event"][data-id="event-daemmerhain"]');
      await record(mode,'Ereignis erhält ein echtes Reiseziel',`window.emberfall.game.waypoint?.kind==='event'&&window.emberfall.game.waypoint.id==='event-daemmerhain'`);await screenshot(`${mode}-adventures.png`);
      await click('#close-panel');await evaluate('window.emberfall.game.save(false);window.__qaBeforeReload=true');await send('Page.reload');await pause(200);
      for(let attempt=0;attempt<100;attempt++){if(await evaluate('Boolean(window.emberfall)&&window.__qaBeforeReload===undefined'))break;await pause(50);}
      await click('#continue-button');await record(mode,'Neuladen erhält Gegenstand, Preset und Reisegefährten',`window.emberfall.game.equipment.helmet===${JSON.stringify(gearId)}&&window.emberfall.game.loadouts.some(l=>l.name===${JSON.stringify(mode==='desktop'?'QA Desktop':'QA Mobil')})&&window.emberfall.game.journey.activeCompanion==='cinder_moth'`);
    } catch(error) {report.flows[mode].push({name:'Browserflow',passed:false,error:error.message});}
  };
  const inspect=()=>evaluate(`(() => {
    const e=window.emberfall,g=e.game,canvas=document.getElementById('world');
    return {started:g.started,canvas:{width:canvas.width,height:canvas.height},
      viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},
      enemies:g.world.enemies.length,enemyKinds:new Set(g.world.enemies.map(x=>x.type)).size,
      interactions:g.world.interactions?.length||0,
      ui:{title:document.getElementById('panel-title').textContent,visible:!document.getElementById('panel-overlay').hidden},
      buttons:[...document.querySelectorAll('#panel-content button')].length,
      invalidNumbers:/NaN|Infinity|undefined/.test(document.querySelector('#panel-content')?.textContent||'')};
  })()`);
  report.desktop.game=await inspect();await screenshot('desktop-game.png');
  for(const panel of ['inventory','character','talents','bestiary','interactions','journey','adventures','journal','map','craft']) {
    await evaluate(`window.emberfall.ui.closePanel();window.emberfall.ui.togglePanel(${JSON.stringify(panel)})`);
    report.desktop[panel]=await inspect();
    if(panel==='talents'||panel==='bestiary')await screenshot(`desktop-${panel}.png`);
  }
  if(flowMode)await runFlows('desktop');
  await evaluate('window.emberfall.ui.closePanel()');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await pause(300);report.mobile.game=await inspect();await screenshot('mobile-game.png');
  for(const panel of ['inventory','character','talents','bestiary','interactions','journey','adventures','journal','map','craft']) {
    await evaluate(`window.emberfall.ui.closePanel();window.emberfall.ui.togglePanel(${JSON.stringify(panel)})`);
    report.mobile[panel]=await inspect();
    if(panel==='talents'||panel==='inventory')await screenshot(`mobile-${panel}.png`);
  }
  if(flowMode)await runFlows('mobile');
  await evaluate('window.emberfall.ui.closePanel()');
  const failures=[];
  if(errors.length||consoleErrors.length)failures.push('JavaScript exception or console error.');
  for(const [mode,flows] of Object.entries(report.flows))for(const flow of flows)if(!flow.passed)failures.push(`${mode}/${flow.name}: ${flow.error||'state check failed'}`);
  for(const [mode,state] of Object.entries(welcome)) {
    if(!state.visible||state.classes!==8)failures.push(`${mode}/welcome: class selection is unavailable.`);
    if(state.viewport.scrollWidth>state.viewport.width+2)failures.push(`${mode}/welcome: page overflows horizontally.`);
  }
  for(const [mode,views] of Object.entries({desktop:report.desktop,mobile:report.mobile}))for(const [view,state] of Object.entries(views)) {
    if(!state.started||!state.canvas.width||!state.canvas.height)failures.push(`${mode}/${view}: game canvas is unavailable.`);
    if(state.invalidNumbers)failures.push(`${mode}/${view}: invalid numbers appear in UI.`);
    if(state.viewport.scrollWidth>state.viewport.width+2)failures.push(`${mode}/${view}: page overflows horizontally.`);
    if(view!=='game'&&!state.ui.visible)failures.push(`${mode}/${view}: panel did not open.`);
  }
  report.failures=failures;report.screenshots=output;
  await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({failures,errors,consoleErrors,screenshots:output,desktop:report.desktop.game,mobile:report.mobile.game},null,2));
  if(failures.length)process.exitCode=1;
} finally {
  socket?.close();chromium.kill('SIGTERM');await running.close();
  await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
}

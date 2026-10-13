// Real Chromium controls and two independent HTTP/SSE browser sessions.
// Progression and rare finds are explicit fixtures, not a human playthrough.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.mjs';

const output=path.resolve(process.argv[2]||'/tmp/emberfall-v5-preview');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-v5-chromium-'));
await fs.mkdir(output,{recursive:true});
const running=await startServer({host:'127.0.0.1',port:0,autoTick:false,storagePath:path.join(profile,'rooms.json')});
const chromium=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pages=[];let browserSocket;
const report={kind:'native Chromium controls with two HTTP/SSE sessions',humanPlaytest:false,fixtures:['Level 55 and safe village for journal actions','Canonical hunt event hooks to prepare a claim','Deterministic eligible sealed weapon for presentation'],flows:{desktop:[],mobile:[]},errors:[],consoleErrors:[],failures:[],screenshots:output};
try {
  let port,browserPath;
  for(let attempt=0;attempt<100;attempt++){try{const address=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n');port=Number(address[0]);browserPath=address[1];if(port)break;}catch{}await pause(50);}
  if(!port)throw new Error('Chromium DevTools did not start.');
  async function page(target,mode) {
    const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
    let serial=0;const requests=new Map();
    socket.addEventListener('message',event=>{const packet=JSON.parse(event.data);
      if(packet.id){const pending=requests.get(packet.id);requests.delete(packet.id);packet.error?pending?.reject(new Error(packet.error.message)):pending?.resolve(packet.result);}
      if(packet.method==='Runtime.exceptionThrown')report.errors.push({mode,message:packet.params.exceptionDetails.exception?.description||packet.params.exceptionDetails.text});
      if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')report.consoleErrors.push({mode,message:packet.params.args.map(arg=>arg.value||arg.description).join(' ')});
    });
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;requests.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
    const evaluate=async expression=>{const value=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(value.exceptionDetails)throw new Error(value.exceptionDetails.exception?.description||value.exceptionDetails.text);return value.result.value;};
    const wait=async(expression,label=expression)=>{for(let attempt=0;attempt<120;attempt++){try{if(await evaluate(expression))return;}catch(error){if(!/navigated or closed|Execution context was destroyed|Cannot find context/i.test(error.message))throw error;}await pause(50);}throw new Error(`${mode}: timed out waiting for ${label}`);};
    const point=selector=>evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
    const click=async selector=>{await wait(`(() => {const e=document.querySelector(${JSON.stringify(selector)});return Boolean(e&&!e.disabled);})()`,`enabled ${selector}`);const at=await point(selector);if(!at)throw new Error(`${mode}: invisible control ${selector}`);
      await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});await pause(170);
    };
    const touch=async selector=>{const at=await point(selector);if(!at)throw new Error(`${mode}: unavailable touch control ${selector}`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1,radiusX:4,radiusY:4}]});await pause(70);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(170);};
    const key=async(key,code,virtual)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual});};
    const screenshot=async name=>{const result=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(path.join(output,`${mode}-${name}.png`),Buffer.from(result.data,'base64'));};
    const open=async panel=>{if(await evaluate('Boolean(window.emberfall.ui.currentPanel)'))await click('#close-panel');const group={journey:'journal',adventures:'map',party:'map'}[panel]||panel;
      await click(`.topbar [data-panel="${group}"]`);if(group!==panel)await click(`#panel-navigation [data-panel="${panel}"]`);
      await wait(`window.emberfall.ui.currentPanel===${JSON.stringify(panel)}`);if(await evaluate('document.getElementById("panel-content").scrollTop')>1)throw new Error(`${mode}: inherited panel scroll`);
    };
    const record=async(name,expression)=>{const passed=!!await evaluate(expression);report.flows[mode].push({name,passed});if(!passed)throw new Error(`${mode}: ${name}`);};
    const p={socket,mode,send,evaluate,wait,click,touch,key,screenshot,open,record};pages.push(p);
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:mode==='desktop'?1440:390,height:mode==='desktop'?1000:844,deviceScaleFactor:1,mobile:mode==='mobile'});
    if(mode==='mobile')await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    await send('Page.navigate',{url:running.origin});await wait('Boolean(window.emberfall)');await screenshot('welcome');
    if(mode==='mobile')await click('#welcome-classes [data-id="ranger"]');await click('#start-button');await wait('window.emberfall.game.started');
    return p;
  }
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const desktop=await page(targets.find(target=>target.type==='page'),'desktop');
  // Browser contexts isolate localStorage, offline journeys and session tokens.
  browserSocket=new WebSocket(`ws://127.0.0.1:${port}${browserPath}`);await new Promise(resolve=>browserSocket.addEventListener('open',resolve,{once:true}));
  let browserSerial=0;const browserRequests=new Map();browserSocket.addEventListener('message',event=>{const packet=JSON.parse(event.data);if(packet.id){const pending=browserRequests.get(packet.id);browserRequests.delete(packet.id);packet.error?pending.reject(new Error(packet.error.message)):pending.resolve(packet.result);}});
  const browserSend=(method,params={})=>new Promise((resolve,reject)=>{const id=++browserSerial;browserRequests.set(id,{resolve,reject});browserSocket.send(JSON.stringify({id,method,params}));});
  const context=await browserSend('Target.createBrowserContext'),target=await browserSend('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId});
  const mobileTargets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();const mobile=await page(mobileTargets.find(entry=>entry.id===target.targetId),'mobile');
  for(const p of pages) {
    await p.evaluate(`(() => {const g=window.emberfall.game;g.settings.reducedMotion=true;g.player.level=55;g.player.x=520;g.player.y=1250;g.world.enemies=[];g.player.hp=g.stats().maxHp;window.emberfall.ui.update(true);})()`);
    await p.open('settings');await p.click('#volume-masterVolume');await p.key('ArrowLeft','ArrowLeft',37);await p.click('#volume-musicVolume');await p.key('ArrowLeft','ArrowLeft',37);await p.click('#volume-effectsVolume');await p.key('ArrowLeft','ArrowLeft',37);
    await p.record('Drei echte Lautstärkeregler ändern numerische Werte',`['masterVolume','musicVolume','effectsVolume'].every(key=>window.emberfall.game.settings[key]===Number(document.getElementById('volume-'+key).value)&&window.emberfall.game.settings[key]>=0&&window.emberfall.game.settings[key]<=1)`);await p.screenshot('audio');
    await p.open('journey');await p.click('[data-journey-tab="hunts"]');await p.click('[data-command="startHunt"][data-id="hunt-moon"]');
    await p.record('Jagdtagebuch nimmt eine passende Jagd an',`window.emberfall.game.endgame.active.some(h=>h.id==='hunt-moon')`);await p.evaluate('document.getElementById("panel-content").scrollTop=0');await pause(100);await p.screenshot('hunt-progress');
    await p.evaluate(`(async () => {const {HUNTS}=await import('/src/endgame.js');const g=window.emberfall.game;for(const o of HUNTS.find(h=>h.id==='hunt-moon').objectives)g.event(o.kind,o.target,o.count);window.emberfall.ui.update(true);})()`);
    await p.click('[data-command="claimHunt"][data-id="hunt-moon"]');await p.record('Erfüllte Jagd zahlt einmal ihre Jagdsiegel',`window.emberfall.game.endgame.totalClaims===1&&window.emberfall.game.endgame.tokens===8`);
    await p.click('[data-command="redeemHuntReward"][data-id="hunt-ring"]');await p.record('Gezielte Belohnung erzeugt einen seltenen Ring',`Object.values(window.emberfall.game.generatedItems).some(item=>item.source==='hunt_reward'&&item.slot==='ring'&&item.rarity==='rare'&&!item.relic)&&window.emberfall.game.endgame.tokens===0`);await p.screenshot('hunt-reward');
    const relic=await p.evaluate(`(async () => {const {generateLoot}=await import('/src/loot.js');const g=window.emberfall.game,item=generateLoot({level:55,classId:g.classId,slot:'weapon',rarity:'rare',uid:'browser-v5-${p.mode}',source:'furnace_acolyte_boss',relicOrigin:{kind:'boss',enemyId:'furnace_acolyte_boss',dungeonId:null},rng:()=>0});g.addItem(item);window.emberfall.ui.update(true);window.__v5SealId=item.id;return item.id;})()`);
    await p.open('inventory');await p.click(`[data-command="inspect-item"][data-id="${relic}"]`);await p.click('.relic-power details summary');
    await p.record('Siegelinspektor erklärt Fundchance und begrenzte Wirkung',`(() => {const text=document.querySelector('.relic-power')?.textContent||'';return text.includes('Sternensiegel')&&text.includes('geeigneter Waffenfund')&&text.includes('höchstens 85')&&!/undefined|NaN|Infinity/.test(text);})()`);await p.screenshot('seal-inspector');
    await p.click(`[data-command="equip"][data-id="${relic}"]`);await p.record('Geprüfte Siegelwaffe lässt sich anlegen',`window.emberfall.game.equipment.weapon===${JSON.stringify(relic)}`);
    await p.click('#close-panel');await p.screenshot('sealed-world');
    await p.evaluate(`window.emberfall.game.save(false);window.__v5Audio={...window.emberfall.game.settings};`);const before=await p.evaluate('({settings:window.emberfall.game.settings,endgame:window.emberfall.game.endgame,equipment:window.emberfall.game.equipment})');
    await p.send('Page.reload');await p.wait('Boolean(window.emberfall)&&window.__v5Audio===undefined');await p.click('#continue-button');
    await p.record('Neuladen erhält Audio, Jagdabschluss und Siegelwaffe',`JSON.stringify(window.emberfall.game.settings)===${JSON.stringify(JSON.stringify(before.settings))}&&window.emberfall.game.endgame.totalClaims===1&&window.emberfall.game.equipment.weapon===${JSON.stringify(relic)}`);
    await p.open('party');await p.click('#party-player-name');await p.send('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await p.send('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65,modifiers:2});await p.send('Input.insertText',{text:p.mode==='desktop'?'QA Wacht':'QA Gast'});
  }
  await desktop.click('[data-command="party-create"]');await desktop.wait('window.emberfall.network.connected');const code=await desktop.evaluate('window.emberfall.network.roomCode');
  await mobile.click('#party-join-code');await mobile.send('Input.insertText',{text:code});await mobile.click('[data-command="party-join"]');await mobile.wait('window.emberfall.network.connected');
  const sessions=await Promise.all(pages.map(p=>p.evaluate('({token:window.emberfall.network.token,playerId:window.emberfall.network.playerId})')));
  const broadcast=()=>{for(const session of sessions)running.hub._broadcast(running.hub.sessions.get(session.token));};
  for(const session of sessions){const game=running.hub.sessions.get(session.token).game;game.world.enemies=[];game.player.level=55;game.player.hp=game.stats().maxHp;game.player.gold=789;}
  broadcast();await Promise.all(pages.map(p=>p.wait('window.emberfall.game.player.level===55')));
  await desktop.record('Desktop erstellt eine echte serverseitige Gruppe','window.emberfall.network.connected&&window.emberfall.network.party.length===2');await mobile.record('Mobiler Browser tritt derselben Gruppe über SSE bei',`window.emberfall.network.connected&&window.emberfall.network.roomCode===${JSON.stringify(code)}&&window.emberfall.network.party.length===2`);
  await desktop.open('party');await mobile.open('party');
  await desktop.click(`[data-command="pvp-invite"][data-id="${sessions[1].playerId}"]`);await desktop.evaluate('window.emberfall.network._actionQueue');broadcast();await mobile.wait('window.emberfall.game.pvp.invites.length===1');await mobile.screenshot('duel-invite');
  await desktop.record('Einladung allein startet kein Duell',`window.emberfall.game.worldMode==='overworld'&&window.emberfall.game.pvp.duel===null`);
  await mobile.click('[data-command="pvp-accept"]');await mobile.evaluate('window.emberfall.network._actionQueue');broadcast();await Promise.all(pages.map(p=>p.wait("window.emberfall.game.worldMode==='pvp'")));
  for(const p of pages){await p.record('Gegenseitige Zustimmung öffnet isolierte normalisierte Arena',`window.emberfall.game.world.isPvp&&window.emberfall.game.player.level===1&&window.emberfall.game.stats().maxHp===300&&window.emberfall.game.stats().mana===100&&window.emberfall.game.capture().player.level===55`);await p.screenshot('duel-countdown');}
  const step=async seconds=>{for(let frame=0;frame<Math.ceil(seconds/.04);frame++)running.hub.tick(.04);broadcast();await pause(230);};
  await step(3.1);await Promise.all(pages.map(p=>p.wait("window.emberfall.game.pvp.duel.state==='active'")));
  await desktop.click('[data-action="bolt"]');await desktop.evaluate('window.emberfall.network._actionQueue');broadcast();await mobile.wait('window.emberfall.game.hazards.some(h=>h.pending)');
  await desktop.record('Arenaaktion erzeugt autoritative Vorwarnung',`window.emberfall.game.cooldowns.bolt>0&&window.emberfall.game.hazards.some(h=>h.pending)`);
  await mobile.evaluate('window.__v5BeforeDash={x:window.emberfall.game.player.x,y:window.emberfall.game.player.y}');await mobile.touch('[data-touch-action="dash"]');await mobile.evaluate('window.emberfall.network._actionQueue');broadcast();await mobile.wait('Math.hypot(window.emberfall.game.player.x-window.__v5BeforeDash.x,window.emberfall.game.player.y-window.__v5BeforeDash.y)>80');await mobile.record('Mobiler Touch löst echte Arenarolle aus',`(() => {const g=window.emberfall.game;return Math.hypot(g.player.x-window.__v5BeforeDash.x,g.player.y-window.__v5BeforeDash.y)>80&&g.cooldowns.dash>0&&g.player.x>=41&&g.player.x<=859&&g.player.y>=41&&g.player.y<=599;})()`);
  await step(.5);for(const p of pages)await p.screenshot('duel-active');
  await mobile.click('[data-command="pvp-forfeit"]');await mobile.evaluate('window.emberfall.network._actionQueue');broadcast();await Promise.all(pages.map(p=>p.wait("window.emberfall.game.pvp.duel.state==='finished'")));
  for(const p of pages){await p.record('Aufgabeschaltfläche beendet das Duell ohne Reiseverlust',`window.emberfall.game.pvp.duel.state==='finished'&&window.emberfall.game.capture().player.gold===789`);await p.screenshot('duel-result');}
  for(const p of pages){await p.click('#pvp-hud [data-command="pvp-return"]');await p.evaluate('window.emberfall.network._actionQueue');broadcast();}
  for(const p of pages){await p.wait("window.emberfall.game.worldMode==='overworld'");await p.record('Rückkehrschaltfläche stellt echte Reise- und HUD-Werte wieder her',`window.emberfall.game.player.level===55&&window.emberfall.game.player.gold===789&&window.emberfall.game.pvpStats===null&&!document.body.classList.contains('pvp-mode')&&document.getElementById('pvp-hud').hidden`);await p.screenshot('duel-return');await p.open('party');await p.click('[data-command="party-disconnect"]');await p.wait('!window.emberfall.network.online');
    await p.record('Gruppentrennung erhält die vorherige Offlinejagd und Siegelwaffe',`window.emberfall.game.endgame.totalClaims===1&&window.emberfall.game.equipment.weapon===window.__v5SealId||window.emberfall.game.endgame.totalClaims===1&&window.emberfall.game.item(window.emberfall.game.equipment.weapon)?.relic?.id==='star_seal'`);
    const state=await p.evaluate(`({viewport:{width:innerWidth,scrollWidth:document.documentElement.scrollWidth},invalid:/undefined|NaN|Infinity/.test(document.getElementById('panel-content').textContent),canvas:{width:document.getElementById('world').width,height:document.getElementById('world').height},party:window.emberfall.network.party.length})`);report[p.mode]=state;
    if(state.viewport.scrollWidth>state.viewport.width+2||state.invalid||!state.canvas.width||!state.canvas.height)throw new Error(`${p.mode}: final geometry, text or canvas check failed`);
  }
} catch(error){report.failures.push(error.message);process.exitCode=1;report.diagnostics={};for(const p of pages)try{report.diagnostics[p.mode]=await p.evaluate(`({panel:window.emberfall?.ui.currentPanel,mode:window.emberfall?.game.worldMode,player:window.emberfall?.game.player,cooldowns:window.emberfall?.game.cooldowns,pvp:window.emberfall?.game.pvp,notices:document.getElementById('notice-stack')?.textContent,buttons:[...document.querySelectorAll('#panel-content button,#pvp-hud button')].map(b=>({command:b.dataset.command,id:b.dataset.id,disabled:b.disabled,text:b.textContent}))})`);await p.screenshot('failure');}catch{}}
finally {
  if(report.errors.length||report.consoleErrors.length){report.failures.push('Runtime exception or console error.');process.exitCode=1;}
  await fs.writeFile(path.join(output,'v5-browser-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({flows:Object.fromEntries(Object.entries(report.flows).map(([mode,flows])=>[mode,{passed:flows.filter(flow=>flow.passed).length,total:flows.length}])),failures:report.failures,errors:report.errors,consoleErrors:report.consoleErrors,screenshots:output},null,2));
  for(const p of pages)p.socket.close();browserSocket?.close();chromium.kill('SIGTERM');await running.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
}

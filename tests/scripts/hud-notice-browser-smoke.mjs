// Native Chromium HUD geometry and notice timeline checks. No browser dependency.
// Fixtures prepare simultaneous HUD states; they do not replace a human playtest.
// Run: node tests/scripts/hud-notice-browser-smoke.mjs [outputDir] [--baseline|--geometry-only]
// Target a layout fix: --burst-only --viewports=320x480,1440x1000
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.mjs';

const output=path.resolve(process.argv[2]||'/tmp/emberfall-hud-notice-qa');
const baseline=process.argv.includes('--baseline');
const burstOnly=process.argv.includes('--burst-only');
const geometryOnly=process.argv.includes('--geometry-only')||burstOnly;
const viewportArgument=process.argv.find(argument=>argument.startsWith('--viewports='));
const requestedViewports=viewportArgument?.slice('--viewports='.length).split(',').map(value=>{const [width,height]=value.split('x').map(Number);if(!Number.isInteger(width)||!Number.isInteger(height)||width<200||height<200)throw new Error(`Invalid viewport ${value}`);return {width,height};});
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-hud-chromium-'));
await fs.mkdir(output,{recursive:true});
const running=await startServer({host:'127.0.0.1',port:0,autoTick:false,storagePath:path.join(profile,'rooms.json')});
const chromium=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const report={kind:'native Chromium HUD geometry and real notice timeline',humanPlaytest:false,baseline,geometryOnly,views:[],timeline:[],errors:[],consoleErrors:[],failures:[],screenshots:output};
let socket,send,evaluate;

const inspectExpression=`(() => {
  const visible=el=>{if(!el)return false;const style=getComputedStyle(el),rect=el.getBoundingClientRect();if(el.hidden||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)===0||!rect.width||!rect.height)return false;return [...function*(node){while(node){yield node;node=node.parentElement;}}(el)].every(node=>!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden');};
  const box=(name,selector)=>{const el=document.querySelector(selector);if(!visible(el))return null;const r=el.getBoundingClientRect();return {name,selector,text:el.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const panel=Boolean(window.emberfall.ui.currentPanel),finished=window.emberfall.game.pvp?.duel?.state==='finished';
  const selectors=panel?[['panel-close','#close-panel'],['panel-footer','.panel-footer'],['panel-content','#panel-content']]:finished?[['pvp-result-title','.pvp-result-card>h3'],['pvp-result-copy','.pvp-result-card>p'],['pvp-return','.pvp-result-card>.primary-button'],['pvp-audio','.pvp-result-card>.text-button'],['pvp-return-clock','.pvp-result-card>small']]:[['waypoint','#exploration-pill.waypoint-active'],['nearby','#interact-prompt'],['tracker','.quest-tracker'],['pressure','#encounter-pressure'],['joystick','.joystick-area'],['touch','.touch-actions'],['vitals','.player-vitals'],['region-title','#region-name'],['region-subtitle','#region-subtitle'],['minimap','.minimap-wrap'],['pvp-forfeit','.pvp-forfeit'],['pvp-opponent','.pvp-opponent'],['pvp-countdown-title','.pvp-countdown>span'],['pvp-countdown-count','.pvp-countdown>strong'],['pvp-countdown-copy','.pvp-countdown>p']];
  const elements=selectors.map(([name,selector])=>box(name,selector)).filter(Boolean);
  for(const [index,el] of [...document.querySelectorAll('.notice')].entries())if(visible(el)){const r=el.getBoundingClientRect();elements.push({name:'notice'+index,selector:'.notice',text:el.textContent.trim(),x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom});}
  const checked=name=>name!=='vitals'||!window.emberfall.game.pvp?.duel||window.emberfall.game.pvp.duel.state==='active';
  const overlaps=[];
  for(let i=0;i<elements.length;i++)for(let j=i+1;j<elements.length;j++){const a=elements[i],b=elements[j];if(!checked(a.name)||!checked(b.name))continue;if([a.name,b.name].includes('panel-content')&&![a.name,b.name].some(name=>name.startsWith('notice')))continue;const width=Math.min(a.right,b.right)-Math.max(a.x,b.x),height=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);if(width>1&&height>1)overlaps.push({a:a.name,b:b.name,width,height,area:width*height});}
  return {viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},mode:window.emberfall.game.worldMode,panel:window.emberfall.ui.currentPanel,notices:[...document.querySelectorAll('.notice')].filter(visible).map(el=>({text:el.textContent,tone:el.dataset.tone,className:el.className})),noticeCount:document.querySelectorAll('.notice').length,elements,overlaps,invalid:/NaN|Infinity|undefined/.test(document.getElementById('world-hud').textContent),encounter:window.emberfall.game.encounterSummary?.()||null,nearby:window.emberfall.game.nearby?.()?.label||null,touchInteract:document.getElementById('touch-interact').textContent.trim(),crowded:document.getElementById('game-stage').classList.contains('hud-crowded'),compactNearby:visible(document.getElementById('nearby-rail-text'))?document.getElementById('nearby-rail-text').textContent:null};
})()`;

try {
  let port;
  for(let attempt=0;attempt<100;attempt++){try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);if(port)break;}catch{}await pause(50);}
  if(!port)throw new Error('Chromium DevTools did not start.');
  const target=(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(entry=>entry.type==='page');
  socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  let serial=0;const pending=new Map();
  socket.addEventListener('message',event=>{const packet=JSON.parse(event.data);if(packet.id){const request=pending.get(packet.id);pending.delete(packet.id);packet.error?request?.reject(new Error(packet.error.message)):request?.resolve(packet.result);}if(packet.method==='Runtime.exceptionThrown')report.errors.push(packet.params.exceptionDetails.exception?.description||packet.params.exceptionDetails.text);if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')report.consoleErrors.push(packet.params.args.map(arg=>arg.value||arg.description).join(' '));});
  send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
  evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
  const wait=async(expression,label=expression)=>{for(let attempt=0;attempt<180;attempt++){if(await evaluate(expression))return;await pause(50);}throw new Error(`Timed out waiting for ${label}`);};
  const screenshot=async name=>{const data=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(path.join(output,`${name}.png`),Buffer.from(data.data,'base64'));};
  const click=async selector=>{const point=await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);if(!point)throw new Error(`Unavailable control ${selector}`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await pause(120);};
  const capture=async(name,viewport)=>{await pause(360);const state=await evaluate(inspectExpression);state.name=name;state.requestedViewport=viewport;report.views.push(state);await screenshot(`${viewport.width}x${viewport.height}-${name}`);if(!baseline){if(state.overlaps.length)report.failures.push(`${viewport.width}x${viewport.height}/${name}: ${state.overlaps.map(hit=>`${hit.a}/${hit.b}`).join(', ')}`);if(state.noticeCount>1)report.failures.push(`${viewport.width}x${viewport.height}/${name}: ${state.noticeCount} simultaneous notices`);if(state.viewport.scrollWidth>state.viewport.width+2)report.failures.push(`${viewport.width}x${viewport.height}/${name}: horizontal overflow`);if(state.invalid)report.failures.push(`${viewport.width}x${viewport.height}/${name}: invalid HUD numbers`);}return state;};
  await send('Page.enable');await send('Runtime.enable');await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  for(const viewport of requestedViewports||[{width:390,height:844},{width:320,height:568},{width:844,height:390},...(baseline?[]:[{width:320,height:480},{width:1440,height:1000}])]) {
    const mobile=viewport.width<=900;
    await send('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile});await send('Page.navigate',{url:running.origin});await wait('Boolean(window.emberfall)');
    await evaluate(`(() => {const {game:g,ui}=window.emberfall;g.flags.welcomed=true;g.start();g.settings.reducedMotion=true;g.settings.sound=false;g.world.enemies=[];const npc=g.npcs.find(n=>n.id==='mira')||g.npcs[0];g.player.x=npc.x;g.player.y=npc.y;g.setWaypoint('npc',npc.id);ui.elements['welcome-overlay'].hidden=true;for(const notice of ui.notices||[])notice.remove();ui.notices=[];ui.noticeQueue?.clear();ui.renderNotice?.();ui.update(true);})()`);
    const nearbyState=await capture('waypoint-nearby-tracker-touch',viewport);
    if(!baseline&&nearbyState.crowded&&nearbyState.compactNearby!=='Mit Mira sprechen')report.failures.push('Compact named-NPC context did not remain visible in the crowded rail');
    if(!baseline&&viewport.height<=480&&viewport.width<=600){await evaluate("window.emberfall.ui.showNotice('Aufgabe abgeschlossen · Mira verzeichnet deinen Eid am schwarzen Brunnen in der Chronik.','quest')");const namedState=await capture('named-npc-notice',viewport);if(namedState.crowded&&namedState.compactNearby!=='Mit Mira sprechen')report.failures.push('Notice burst hid the compact named-NPC target');}
    if(!baseline) {
      await evaluate(`(async () => {const {createEncounterDirector,updateEncounterDirector}=await import('/src/encounter-director.js');const {game:g,ui}=window.emberfall;const node=g.world.nodes.filter(n=>n.readyAt<=g.time&&g.regionAt(n.x,n.y).id==='glutoede'&&!g.inSettlement(n.x,n.y)&&!g.collides(n.x,n.y)).sort((a,b)=>Math.hypot(a.x-2200,a.y-1700)-Math.hypot(b.x-2200,b.y-1700))[0];if(!node)throw new Error('No canonical wilderness resource for HUD fixture');Object.assign(g.player,{x:node.x,y:node.y,level:25,invulnerable:100});g.player.hp=g.stats().maxHp;g.world.enemies=[];g.questState.q_hainwacht={status:'active',counts:[0]};g.discovered.push('glutoede');g.setWaypoint('event','event-glutoede');g.world.encounterDirector=createEncounterDirector();g.world.encounterDirector.sequence=2;g.world.encounterDirector.nextIn=.04;ui.lastSeenLevel=25;ui.noticeQueue.clear();updateEncounterDirector(g,.04);if(g.world.encounterDirector.stage!=='warning'||g.world.encounterDirector.tier!=='relentless')throw new Error('Canonical director did not enter Bloodnight warning');ui.update(true);})()`);
    }
    await evaluate(`(() => {const ui=window.emberfall.ui;ui.showNotice('Beute geborgen · Dunkle Klinge und 3 Arkanstaub','loot');ui.showNotice('+45 EP erhalten','xp');ui.showNotice('Aufgabe abgeschlossen · Der Eid am schwarzen Brunnen','quest');ui.showNotice('Du erreichst Stufe 2 · Ein weiterer Talentpunkt','level');ui.showNotice('Ein Beutel voller Asche wurde geplündert','loot');})()`);
    await capture('notice-burst',viewport);
    if(!baseline) {
      const state=report.views.at(-1);
      if(!state.encounter?.active||state.encounter.tier!=='relentless'||!state.elements.some(element=>element.name==='pressure'))report.failures.push(`${viewport.width}x${viewport.height}: escalation was not visible beside the notice burst`);
      if(!state.nearby)report.failures.push(`${viewport.width}x${viewport.height}: canonical nearby interaction is missing`);
      else if(!state.elements.some(element=>element.name==='nearby')&&state.touchInteract==='Entdecken')report.failures.push(`${viewport.width}x${viewport.height}: crowded HUD hid the interaction without labeling its touch alternative`);
      if(state.crowded&&state.compactNearby!==state.nearby)report.failures.push(`${viewport.width}x${viewport.height}: compact rail did not retain the actual nearby target`);
    }
    if(burstOnly)continue;
    if(await evaluate("document.getElementById('tracker-toggle').getBoundingClientRect().width>0")){await click('#tracker-toggle');await capture(baseline?'expanded-tracker-notice':'tracker-opens-journal-notice',viewport);if(await evaluate('Boolean(window.emberfall.ui.currentPanel)'))await click('#close-panel');else await click('#tracker-toggle');}
    await click('.topbar [data-panel="inventory"]');await evaluate("window.emberfall.ui.showNotice('Dunkle Klinge ausgerüstet.','success')");await capture('panel-notices',viewport);
    await evaluate(`(async () => {const {PVP_RULES,PVP_STATS,createPvpWorld}=await import('/src/pvp.js');const {game:g,ui,renderer}=window.emberfall;ui.closePanel();g.worldMode='pvp';g.pvpStats={...PVP_STATS};g.world=createPvpWorld();g.player.id='hud-local';g.player.x=210;g.player.y=320;g.player.hp=300;g.player.mana=100;g.player.level=1;g.npcs=[];g.pvp={rules:PVP_RULES,roster:[],invites:[],duel:{id:'hud-qa',state:'active',opponentId:'hud-rival',opponentName:'QA Schatten',timeLeft:90,countdown:0},lastResult:null};g.party=[{id:'hud-rival',name:'QA Schatten',hp:300,maxHp:300}];renderer.setWorld?.(g.world);ui.update(true);ui.showNotice('Die Verbindung zum Duell wurde kurz unterbrochen. Versuche es erneut.','error');})()`);
    await capture('pvp-active-error',viewport);
    await evaluate("window.emberfall.game.pvp.duel.state='countdown';window.emberfall.game.pvp.duel.countdown=3;window.emberfall.ui.update(true)");await capture('pvp-countdown-error',viewport);
    await evaluate("Object.assign(window.emberfall.game.pvp.duel,{state:'finished',result:'victory',reason:'Dein Gegenüber hat das Duell aufgegeben.',returnIn:8});window.emberfall.ui.update(true)");await capture('pvp-result-error',viewport);
    if(!baseline) {
      await click('.topbar [data-panel="settings"]');await click('.notice-history>summary');
      const history=await evaluate("({open:document.querySelector('.notice-history').open,text:document.querySelector('.notice-history').textContent,count:document.querySelectorAll('.notice-history li').length})");
      (report.historyViews||=[]).push({viewport,...history});
      if(!history.open||!history.text.includes('Die Verbindung zum Duell')||!history.text.includes('Blutnacht')||history.count>40)report.failures.push(`${viewport.width}x${viewport.height}: native history did not retain the warning and preempted travel notices`);
      await capture('pvp-settings-history',viewport);
    }
  }
  if(!baseline&&!geometryOnly) {
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await send('Page.navigate',{url:running.origin});await wait('Boolean(window.emberfall)');
    await evaluate(`(() => {const {game:g,ui}=window.emberfall;g.flags.welcomed=true;g.start();g.settings.sound=false;g.world.enemies=[];ui.elements['welcome-overlay'].hidden=true;ui.noticeQueue.clear();ui.renderNotice();ui.update(true);
      const started=performance.now(),events=[];let last='',maximum=0;
      const inspect=()=>{const notices=[...document.querySelectorAll('.notice')];maximum=Math.max(maximum,notices.length);const text=notices.map(node=>node.textContent.trim()).join(' | ');if(text!==last){events.push({ms:Math.round(performance.now()-started),text,count:notices.length});last=text;}};
      const observer=new MutationObserver(inspect);observer.observe(document.getElementById('notice-stack'),{childList:true,subtree:true,characterData:true});const interval=setInterval(inspect,40);
      window.__hudNoticeTimeline={events,get maximum(){return maximum;},stop(){inspect();observer.disconnect();clearInterval(interval);return {events,maximum};}};
      ui.showNotice('+12 EP','xp');})()`);
    await wait("document.querySelector('.notice')?.textContent.includes('+12 EP')",'reward notice settles after its burst window');
    await evaluate("window.emberfall.ui.showNotice('+12 EP','xp');window.emberfall.ui.showNotice('+12 EP','xp');window.emberfall.ui.showNotice('Dunkle Klinge gefunden','loot')");
    const aggregate=await evaluate("document.querySelector('.notice')?.textContent||''");
    if(!aggregate.includes('+36 EP')||!aggregate.includes('Beutefund'))report.failures.push(`Real burst did not aggregate XP and loot: ${aggregate}`);
    await evaluate("window.emberfall.ui.showNotice('QA Geschichte · Ein neuer Eid wurde verzeichnet.','quest');window.emberfall.ui.showNotice('QA Stufenaufstieg · Eine Technik wurde freigeschaltet.','level');window.emberfall.ui.showNotice('QA Fehler · Dein Gepäck ist voll.','error')");
    await wait("document.querySelector('.notice')?.textContent.includes('QA Fehler')",'error preempts level and story');
    await evaluate("for(let i=0;i<12;i++)window.emberfall.ui.showNotice('QA Fehler · Dein Gepäck ist voll.','error')");
    await wait("document.querySelector('.notice')?.textContent.includes('QA Stufenaufstieg')",'level returns after error timeout');
    await wait("document.querySelector('.notice')?.textContent.includes('QA Geschichte')",'story returns after level timeout');
    const timeline=await evaluate('window.__hudNoticeTimeline.stop()');report.timeline=timeline.events;report.timelineMaximum=timeline.maximum;report.aggregate=aggregate;
    if(timeline.maximum>1)report.failures.push(`Notice timeline displayed ${timeline.maximum} nodes simultaneously`);
    const errorIndex=timeline.events.findIndex(event=>event.text.includes('QA Fehler')),levelIndex=timeline.events.findIndex((event,index)=>index>errorIndex&&event.text.includes('QA Stufenaufstieg')),storyIndex=timeline.events.findIndex((event,index)=>index>levelIndex&&event.text.includes('QA Geschichte'));
    if(errorIndex<0||levelIndex<=errorIndex||storyIndex<=levelIndex)report.failures.push('Notice timeline did not preserve error → level → story priority');
    else if(timeline.events[levelIndex].ms-timeline.events[errorIndex].ms<4500)report.failures.push('Important warning disappeared before its readable display interval');
    if(await evaluate("Boolean(document.querySelector('.notice [data-command=\"dismiss-notice\"]'))")){await click('.notice [data-command="dismiss-notice"]');if(await evaluate("document.querySelector('.notice')?.textContent.includes('QA Geschichte')"))report.failures.push('Native dismiss control did not dismiss the current notice');}
    await click('.topbar [data-panel="settings"]');await click('.notice-history>summary');
    const history=await evaluate("({open:document.querySelector('.notice-history').open,text:document.querySelector('.notice-history').textContent,count:document.querySelectorAll('.notice-history li').length})");report.history=history;
    if(!history.open||!['QA Fehler','QA Stufenaufstieg','QA Geschichte','+36 EP'].every(text=>history.text.includes(text))||history.count>40)report.failures.push('Native notice history does not retain aggregated and preempted messages');
  }
} catch(error){report.failures.push(error.message);process.exitCode=1;}
finally {
  if(report.errors.length||report.consoleErrors.length){report.failures.push('Runtime exception or console error.');process.exitCode=1;}
  if(report.failures.length&&!baseline)process.exitCode=1;
  await fs.writeFile(path.join(output,'hud-notice-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({baseline,views:report.views.map(view=>({viewport:view.requestedViewport,name:view.name,notices:view.noticeCount,overlaps:view.overlaps})),failures:report.failures,errors:report.errors,consoleErrors:report.consoleErrors,screenshots:output},null,2));
  socket?.close();chromium.kill('SIGTERM');await running.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
}

// Native wave-trial filtering, warnings and physical rest/push choices.
// Level/position and one-hit actor health are trusted fixtures; all progression
// comes from native controls over the actual HTTP/SSE server.
// node tests/scripts/content-loop4-browser-smoke.mjs [outputDir]
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../../server.mjs';

// The UI owner finalizes this contract before the first native run.
const selectors={
  filterToggle:'[data-command="adventure-filters"]',
  type:'[data-ui-filter="adventureContentFilter"]',
  state:'[data-ui-filter="adventureFilter"]',
  region:'[data-ui-filter="adventureRegionFilter"]',
  search:'[data-ui-search="adventureSearch"]',
  clear:'[data-command="adventure-clear-filters"]',
  cards:'.adventure-card[data-adventure-id]',
};
const output=path.resolve(process.argv[2]||'/tmp/emberfall-content-loop4');
const phaseCardsOnly=process.argv.includes('--phase-cards-only');
const profile=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-content-loop4-chromium-'));
await fs.mkdir(output,{recursive:true});
const running=await startServer({host:'127.0.0.1',port:0,autoTick:false,storagePath:path.join(profile,'rooms.json')});
const chromium=spawn('/usr/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),pages=[];
const report={kind:'native Chromium Loop 4 wave trials with real HTTP/SSE',humanPlaytest:false,
  fixtures:['Level 100 and canonical discoveries for list coverage; level 10 at the real Cinderwatch location for combat','Auto-tick disabled; warning periods advance in real time through native 40 ms server ticks','Actual spawned wave actors receive one-hit health/nearby positioning; native attack controls perform their kills','Damaged player health/mana isolates the real rest choice; no phase, progress, choices or summaries are injected'],
  selectors,flows:{mobile:[],desktop:[]},geometry:[],networkEvidence:[],errors:[],consoleErrors:[],failures:[],screenshots:output};
if(phaseCardsOnly){report.kind='Loop 4 visual phase fixtures with native panel navigation';report.fixtures=['Canonical Game methods/ticks prepare visual phases, with one-hit actor health and nearby positions','Native Chromium panel navigation and scrolling verify the final card order','This visual-only branch adds no native combat or HTTP/SSE proof'];}
let browserSocket;

function connection(socket,onPacket=()=>{}) {let serial=0;const pending=new Map();socket.addEventListener('message',event=>{const packet=JSON.parse(event.data);if(packet.id){const request=pending.get(packet.id);pending.delete(packet.id);packet.error?request?.reject(new Error(packet.error.message)):request?.resolve(packet.result);}onPacket(packet);});return (method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
async function connected(url) {const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});return socket;}

try {
  let port,browserPath;
  for(let attempt=0;attempt<100;attempt++){try{const address=(await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n');port=Number(address[0]);browserPath=address[1];if(port)break;}catch{}await pause(50);}
  if(!port)throw new Error('Chromium DevTools did not start.');
  browserSocket=await connected(`ws://127.0.0.1:${port}${browserPath}`);const browserSend=connection(browserSocket);
  async function page(mode,viewport) {
    const context=await browserSend('Target.createBrowserContext'),target=await browserSend('Target.createTarget',{url:'about:blank',browserContextId:context.browserContextId});
    const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json(),socket=await connected(targets.find(entry=>entry.id===target.targetId).webSocketDebuggerUrl);
    const send=connection(socket,packet=>{if(packet.method==='Runtime.exceptionThrown')report.errors.push({mode,message:packet.params.exceptionDetails.exception?.description||packet.params.exceptionDetails.text});if(packet.method==='Runtime.consoleAPICalled'&&packet.params.type==='error')report.consoleErrors.push({mode,message:packet.params.args.map(arg=>arg.value||arg.description).join(' ')});});
    const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;};
    const wait=async(expression,label=expression)=>{for(let attempt=0;attempt<160;attempt++){if(await evaluate(expression))return;await pause(50);}throw new Error(`${mode}: timed out waiting for ${label}`);};
    const point=selector=>evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});if(!el||el.disabled)return null;el.scrollIntoView({block:'center',inline:'nearest'});const r=el.getBoundingClientRect();return r.width&&r.height?{x:r.x+r.width/2,y:r.y+r.height/2}:null;})()`);
    const click=async selector=>{await wait(`Boolean(document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled)`,`enabled ${selector}`);const at=await point(selector);if(!at)throw new Error(`${mode}: unavailable control ${selector}`);await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...at});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...at});await pause(140);};
    const touch=async selector=>{await wait(`Boolean(document.querySelector(${JSON.stringify(selector)})&&!document.querySelector(${JSON.stringify(selector)}).disabled)`,`enabled ${selector}`);const at=await point(selector);if(!at)throw new Error(`${mode}: unavailable touch control ${selector}`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...at,id:1,radiusX:4,radiusY:4}]});await pause(65);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await pause(170);};
    const activate=mode==='mobile'?touch:click;
    const key=async(key,code,virtual,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:virtual,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:virtual,modifiers});};
    const select=async(selector,value)=>{const index=await evaluate(`(() => {const el=document.querySelector(${JSON.stringify(selector)});return el?[...el.options].findIndex(option=>option.value===${JSON.stringify(value)}):-1;})()`);if(index<0)throw new Error(`${mode}: missing option ${value} in ${selector}`);await click(selector);await key('Home','Home',36);for(let step=0;step<index;step++)await key('ArrowDown','ArrowDown',40);await key('Enter','Enter',13);await pause(160);if(await evaluate(`document.querySelector(${JSON.stringify(selector)})?.value!==${JSON.stringify(value)}`))throw new Error(`${mode}: native select did not choose ${value}`);};
    const text=async(selector,value)=>{await click(selector);await key('a','KeyA',65,2);if(value)await send('Input.insertText',{text:value});else await key('Backspace','Backspace',8);await pause(170);};
    const screenshot=async name=>{const data=await send('Page.captureScreenshot',{format:'png',fromSurface:true});await fs.writeFile(path.join(output,`${mode}-${name}.png`),Buffer.from(data.data,'base64'));};
    const record=async(name,expression)=>{const passed=Boolean(await evaluate(expression));report.flows[mode].push({name,passed});if(!passed)throw new Error(`${mode}: ${name}`);};
    const close=async()=>{if(await evaluate('Boolean(window.emberfall.ui.currentPanel)'))await activate('#close-panel');};
    const open=async panel=>{await close();await activate('.topbar [data-panel="map"]');if(panel!=='map')await activate(`#panel-navigation [data-panel="${panel}"]`);await wait(`window.emberfall.ui.currentPanel===${JSON.stringify(panel)}`);};
    const filters=async()=>{if(await evaluate(`(() => {const button=document.querySelector(${JSON.stringify(selectors.filterToggle)});return button&&button.getBoundingClientRect().width>0&&button.getAttribute('aria-expanded')!=='true';})()`))await activate(selectors.filterToggle);};
    const collapse=async()=>{if(mode==='mobile'&&await evaluate(`document.querySelector(${JSON.stringify(selectors.filterToggle)})?.getAttribute('aria-expanded')==='true'`))await activate(selectors.filterToggle);};
    const reveal=async selector=>{const at=await evaluate(`(() => {const panel=document.getElementById('panel-content'),el=document.querySelector(${JSON.stringify(selector)});if(!panel||!el)return null;const p=panel.getBoundingClientRect(),r=el.getBoundingClientRect();return {x:p.x+12,y:p.y+32,deltaY:Math.max(0,r.y-p.y-10)};})()`);if(!at)throw new Error(`${mode}: missing scroll target ${selector}`);if(at.deltaY>0)await send('Input.dispatchMouseEvent',{type:'mouseWheel',deltaX:0,...at});await pause(220);};
    const ids=()=>evaluate(`[...document.querySelectorAll(${JSON.stringify(selectors.cards)})].map(card=>card.dataset.adventureId)`);
    const geometry=async name=>{await pause(180);const state=await evaluate(`(() => {const visible=el=>{if(!el)return false;const r=el.getBoundingClientRect();return !el.hidden&&r.width>0&&r.height>0&&[...function*(node){while(node){yield node;node=node.parentElement;}}(el)].every(node=>!node.hidden&&getComputedStyle(node).display!=='none'&&getComputedStyle(node).visibility!=='hidden');},panel=window.emberfall.ui.currentPanel;
      const selectors=panel?[['panel-close','#close-panel'],['panel-content','#panel-content'],['panel-footer','.panel-footer']]:[['waypoint','#exploration-pill'],['nearby','#interact-prompt'],['tracker','.quest-tracker'],['pressure','#encounter-pressure'],['joystick','.joystick-area'],['touch','.touch-actions'],['vitals','.player-vitals'],['region-title','#region-name'],['region-subtitle','#region-subtitle'],['minimap','.minimap-wrap'],['quick-tools','.quick-tools']];
      const boxes=selectors.map(([name,selector])=>{const el=document.querySelector(selector);if(!visible(el))return null;const r=el.getBoundingClientRect();return {name,x:r.x,y:r.y,right:r.right,bottom:r.bottom};}).filter(Boolean),notices=[...document.querySelectorAll('.notice')];for(const [index,el] of notices.entries())if(visible(el)){const r=el.getBoundingClientRect();boxes.push({name:'notice'+index,x:r.x,y:r.y,right:r.right,bottom:r.bottom});}
      const overlaps=[];for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if([a.name,b.name].includes('panel-content')&&![a.name,b.name].some(name=>name.startsWith('notice')))continue;const width=Math.min(a.right,b.right)-Math.max(a.x,b.x),height=Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y);if(width>1&&height>1)overlaps.push({a:a.name,b:b.name,width,height});}
      return {panel,noticeCount:notices.length,boxes,overlaps,viewport:{width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth},invalid:/NaN|Infinity|undefined/.test(document.getElementById('world-hud').textContent+document.getElementById('panel-content').textContent)};
    })()`);report.geometry.push({mode,name,...state});if(state.noticeCount>1||state.overlaps.length||state.viewport.scrollWidth>state.viewport.width+2||state.invalid)throw new Error(`${mode}/${name}: HUD geometry or text invalid (${JSON.stringify(state.overlaps)})`);await screenshot(name);};
    const p={socket,mode,viewport,send,evaluate,wait,activate,key,select,text,screenshot,record,close,open,filters,collapse,reveal,ids,geometry};pages.push(p);
    await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:mode==='mobile'});await send('Emulation.setTouchEmulationEnabled',{enabled:mode==='mobile',maxTouchPoints:5});await send('Page.navigate',{url:running.origin});await wait('Boolean(window.emberfall)');await activate('#start-button');await wait('window.emberfall.game.started');return p;
  }

  for(const [mode,viewport] of [['mobile',{width:390,height:844}],['desktop',{width:1440,height:1000}]]) {
    const p=await page(mode,viewport);
    const catalog=await p.evaluate(`(async () => {
      const {REGIONS}=await import('/src/catalog.js'),{TRIALS}=await import('/src/trial-content.js'),{WORLD_EVENT_DEFINITIONS,EXPEDITIONS}=await import('/src/world-events.js'),{game:g,ui}=window.emberfall;
      g.settings.sound=false;g.settings.reducedMotion=true;g.player.level=100;ui.lastSeenLevel=100;g.player.hp=g.stats().maxHp;g.discovered=REGIONS.map(region=>region.id);g.world.enemies=[];ui.noticeQueue.clear();ui.renderNotice();ui.update(true);
      const summary=g.worldEventSummary();if(summary.length!==WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length||summary.length<33)throw new Error('Expanded canonical adventure registry is missing');
      window.__loop4={trials:TRIALS,summary};return {trials:TRIALS,regions:REGIONS.map(region=>region.id),count:summary.length};
    })()`);
    if(phaseCardsOnly){
      await p.evaluate(`(() => {
        const {game:g,ui}=window.emberfall,event=g.world.worldEvents.find(event=>event.id==='trial-cinderwatch');
        Object.assign(g.player,{level:10,x:event.x,y:event.y,invulnerable:1000});g.player.hp=g.stats().maxHp;g.player.mana=g.stats().mana;ui.lastSeenLevel=10;
        ui.adventureContentFilter='challenge';ui.adventureFilter='all';ui.adventureRegionFilter='all';ui.adventureSearch=event.name;ui.adventureFiltersOpen=false;
        if(!g.interactWorldEvent(event.id+':start'))throw new Error('Canonical visual fixture start failed');
        g.paused=true;ui.noticeQueue.clear();ui.renderNotice();ui.update(true);
        window.__visualTrial={advance(){let guard=0;while(event.phase==='wave-warning'&&guard++<200){g.time+=.04;g.updateWorld(.04,[g]);}if(event.phase!=='wave-combat')throw new Error('Visual wave fixture did not spawn');},
          kill(){const actors=g.world.enemies.filter(enemy=>enemy.eventId===event.id&&enemy.eventRun===event.run&&enemy.alive);if(!actors.length)throw new Error('Visual wave has no real actors');for(const enemy of actors)Object.assign(enemy,{hp:1,x:event.x+35,y:event.y});Object.assign(g.player,{x:event.x,y:event.y,face:0});g.cooldowns.attack=0;g.paused=false;if(!g.action('attack')||actors.some(enemy=>enemy.alive))throw new Error('Canonical visual fixture attack failed');g.time+=.04;g.updateWorld(.04,[g]);g.paused=true;},
          choose(choice){const prop=g.world.eventObjects.find(object=>object.eventId===event.id&&object.role==='choice'&&!object.hidden&&object.choice===choice);if(!prop)throw new Error('Visual choice is missing');Object.assign(g.player,{x:prop.x,y:prop.y});if(!g.interactWorldEvent(prop.id))throw new Error('Canonical visual choice failed');},
          quiet(){g.paused=true;ui.noticeQueue.clear();ui.renderNotice();ui.update(true);}};
      })()`);
      const card=async(name,phase)=>{
        await p.open('adventures');await p.collapse();await p.reveal('[data-adventure-id="trial-cinderwatch"]');
        await p.record(`${name}: aktueller Wellenstatus steht sichtbar vor Beschreibung und Kampfhinweis`,`(() => {const card=document.querySelector('[data-adventure-id="trial-cinderwatch"]'),facts=card?.querySelector('.adventure-facts'),status=card?.querySelector('.trial-wave-status'),narrative=card?.querySelector(':scope>p'),panel=document.getElementById('panel-content');if(!facts||!status||!narrative)return false;const a=facts.getBoundingClientRect(),b=status.getBoundingClientRect(),c=narrative.getBoundingClientRect(),p=panel.getBoundingClientRect();return status.dataset.phase===${JSON.stringify(phase)}&&b.top>=a.bottom-1&&b.bottom<=c.top+1&&b.top>=p.top&&b.bottom<=p.bottom&&document.querySelectorAll('.topbar .main-nav>button').length===4;})()`);
        await p.geometry(name);
      };
      await card('visual-first-warning-card','wave-warning');
      await p.close();await p.evaluate('window.__visualTrial.advance();window.__visualTrial.quiet();');await card('visual-combat-card','wave-combat');
      await p.close();await p.evaluate('window.__visualTrial.kill();window.__visualTrial.quiet();');await card('visual-intermission-card','intermission');
      await p.reveal('[data-choice="push"]');await p.geometry('visual-rest-push-card');
      await p.close();await p.evaluate(`(() => {const f=window.__visualTrial;f.choose('rest');f.advance();f.kill();f.choose('push');f.advance();f.kill();f.choose('push');f.quiet();})()`);
      await card('visual-final-boss-card','wave-warning');
      await p.record('Finale Karte nennt Welle4/4, Bossfinale und sechs Sekunden ohne alte Objektivzeile',"(() => {const card=document.querySelector('[data-adventure-id=\"trial-cinderwatch\"]'),heading=card.querySelector('.trial-wave-heading').textContent;return heading.includes('Welle 4/4')&&heading.includes('Bossfinale')&&heading.includes('6 s')&&!card.querySelector('.event-objective')&&card.querySelectorAll('.trial-wave-status').length===1;})()");
      await p.close();await p.geometry('visual-final-boss-hud');
      continue;
    }
    report[mode]={catalogCount:catalog.count,trialIds:catalog.trials.map(def=>def.id),kills:0,warnings:[]};
    await p.open('adventures');await p.filters();await p.select(selectors.type,'challenge');await p.select(selectors.state,'all');await p.select(selectors.region,'all');
    await p.record('Die drei Prüfungen bleiben im vorhandenen Abenteuerfilter mit vier Hauptmenüs',`(() => {const cards=[...document.querySelectorAll(${JSON.stringify(selectors.cards)})];return cards.length===3&&cards.every(card=>card.dataset.contentType==='challenge')&&window.__loop4.trials.every(def=>cards.some(card=>card.dataset.adventureId===def.id))&&document.querySelectorAll('.topbar .main-nav>button').length===4;})()`);
    await p.record('Prüfungskarten zeigen kanonische Stufen, Wellenzahl und Bossfinale',`window.__loop4.trials.every(def=>{const card=document.querySelector('[data-adventure-id="'+def.id+'"]');return card?.querySelector('.adventure-facts')?.textContent.includes('Stufe '+def.minLevel+'+')&&card.querySelector('.trial-wave-heading')?.textContent.includes(def.waves.length+' Wellen')&&card.querySelector('.trial-wave-heading').textContent.includes('Bossfinale')&&card.querySelectorAll('.trial-wave-progress>span').length===def.waves.length;})`);
    await p.select(selectors.region,'glutoede');await p.text(selectors.search,catalog.trials[0].name);
    await p.record('Region und native Suche isolieren die Prüfung ohne Fokusverlust',`window.emberfall.ui.adventurePage===0&&document.querySelectorAll(${JSON.stringify(selectors.cards)}).length===1&&document.querySelector(${JSON.stringify(selectors.cards)})?.dataset.adventureId==='trial-cinderwatch'&&document.activeElement?.dataset.uiSearch==='adventureSearch'`);
    await p.collapse();await p.reveal('[data-adventure-id="trial-cinderwatch"]');await p.geometry('trial-catalog');

    await p.open('party');await p.activate('[data-command="party-create"]');await p.wait('window.emberfall.network.connected');
    const session=await p.evaluate('({token:window.emberfall.network.token,playerId:window.emberfall.network.playerId})'),member=running.hub.sessions.get(session.token),g=member?.game;
    if(!g)throw new Error(`${mode}: native group create has no server member`);
    const trial=g.world.worldEvents.find(event=>event.id==='trial-cinderwatch'),def=catalog.trials.find(value=>value.id===trial?.id);
    if(!trial||!def)throw new Error(`${mode}: canonical trial is missing`);
    Object.assign(g.player,{level:10,x:520,y:1250,invulnerable:1000});g.player.hp=g.stats().maxHp;g.player.mana=g.stats().mana;g.discovered=[...catalog.regions];g.world.enemies=[];
    const broadcast=async()=>{running.hub._broadcast(member);await p.wait(`Math.hypot(window.emberfall.game.player.x-${g.player.x},window.emberfall.game.player.y-${g.player.y})<.05&&window.emberfall.game.player.level===${g.player.level}`);await pause(150);};
    const flush=async()=>{await p.evaluate('window.emberfall.network._actionQueue');running.hub._broadcast(member);await pause(160);};
    const advance=async(seconds,realtime=false)=>{for(let frame=0;frame<Math.ceil(seconds/.04);frame++){running.hub.tick(.04);if(realtime)await pause(40);}running.hub._broadcast(member);await pause(150);};
    const phase=async expected=>p.wait(`window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch')?.phase===${JSON.stringify(expected)}`);
    const liveChoices=()=>g.world.eventObjects.filter(object=>object.eventId===trial.id&&object.role==='choice'&&!object.hidden);
    await broadcast();await p.record('Native Gruppe empfängt Prüfungsdaten über echtes HTTP und SSE',"window.emberfall.network.connected&&window.emberfall.network.source instanceof EventSource&&window.emberfall.network.source.readyState===EventSource.OPEN");
    await p.open('adventures');await p.filters();await p.select(selectors.type,'challenge');await p.select(selectors.state,'all');await p.select(selectors.region,'all');await p.text(selectors.search,def.name);await p.collapse();
    await p.activate('[data-command="waypoint"][data-kind="event"][data-id="trial-cinderwatch"]');await flush();
    await p.record('Native Prüfungsroute erreicht den Server und nutzt globale Koordinaten',`(() => {const g=window.emberfall.game,target=g.waypointTarget();return g.waypoint?.id==='trial-cinderwatch'&&target?.x===${trial.x}&&target?.y===${trial.y}&&target.distance>1400&&!g.world.worldEvents.some(event=>event.id==='trial-cinderwatch');})()`);
    if(g.waypoint?.id!==trial.id)throw new Error(`${mode}: trial route was not authoritative`);
    report.networkEvidence.push({mode,trialId:trial.id,x:trial.x,y:trial.y,farDistance:Math.hypot(trial.x-g.player.x,trial.y-g.player.y)});
    await p.close();await p.geometry('distant-trial-route');

    Object.assign(g.player,{x:trial.x,y:trial.y,face:0});await broadcast();
    if(mode==='mobile') {await p.open('adventures');await p.collapse();await p.activate(`[data-command="world-event"][data-id="${trial.id}:start"]`);}
    else {await p.record('Die native E-Aktion steht am tatsächlichen Prüfungszeichen',"window.emberfall.game.nearby()?.kind==='worldEvent'&&window.emberfall.game.nearby().object.id==='trial-cinderwatch:start'");await p.key('e','KeyE',69);}
    await flush();await phase('wave-warning');
    if(trial.state!=='active'||trial.pending[0]?.at!==6||trial.pending[0]?.count!==def.waves[0].count||trial.participants[0]!==g.player.id)throw new Error(`${mode}: native start did not schedule a canonical first wave`);
    await p.record('Native Annahme am Zeichen erzeugt erste Welle und echte sechs Sekunden',"(() => {const event=window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch');return event.state==='active'&&event.phase==='wave-warning'&&Math.abs(event.warningRemaining-6)<1e-7&&event.wave.current===1&&event.wave.total===4&&event.wave.cleared===0&&event.wave.bossFinal;})()");
    const warning=async(name,seconds)=>{
      const state=await p.evaluate("(() => {const event=window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch');return {phase:event.phase,remaining:event.warningRemaining,hud:document.getElementById('waypoint-text').textContent,hudPhase:document.getElementById('exploration-pill').dataset.adventurePhase,notices:document.querySelectorAll('.notice').length,actors:window.emberfall.game.world.enemies.filter(enemy=>enemy.eventId===event.id&&enemy.alive).length};})()");
      report[mode].warnings.push({name,...state});
      if(state.phase!=='wave-warning'||Math.ceil(state.remaining)!==seconds||!state.hud.includes(`in ${seconds} s`)||state.hudPhase!=='wave-warning'||state.actors!==0||state.notices>1)throw new Error(`${mode}: countdown ${name} is invalid ${JSON.stringify(state)}`);
      await p.geometry(name);
    };
    await warning('warning-six-seconds',6);await advance(3,true);await warning('warning-three-seconds',3);await advance(2.92,true);await warning('warning-last-second',1);
    await advance(.12,true);await phase('wave-combat');
    await p.record('Vor der Warnfrist erscheint kein Gegner, danach die kanonische erste Welle',`window.emberfall.game.world.enemies.filter(enemy=>enemy.eventId==='trial-cinderwatch'&&enemy.alive).length===${def.waves[0].count}&&document.getElementById('exploration-pill').dataset.adventurePhase==='wave-combat'`);
    await p.geometry('first-wave-combat');
    const killWave=async()=>{
      const actors=g.world.enemies.filter(enemy=>enemy.eventId===trial.id&&enemy.eventRun===trial.run&&enemy.alive);if(!actors.length)throw new Error(`${mode}: cannot kill an empty wave`);
      // Actor identities/species/event ownership remain untouched. These trusted
      // one-hit/nearby fixtures isolate the native progression path from balance.
      for(const enemy of actors)Object.assign(enemy,{hp:1,x:trial.x+35,y:trial.y});
      Object.assign(g.player,{x:trial.x,y:trial.y,face:0});g.cooldowns.attack=0;member.aimAngle=0;await broadcast();
      if(mode==='mobile')await p.activate('[data-touch-action="attack"]');else await p.key('j','KeyJ',74);
      await flush();if(actors.some(actor=>actor.alive))throw new Error(`${mode}: native attack did not kill real wave actors`);
      report[mode].kills+=actors.length;await advance(.08);await phase('intermission');
    };
    await killWave();await p.geometry('first-intermission-hud');

    let rest=liveChoices().find(object=>object.choice==='rest'),push=liveChoices().find(object=>object.choice==='push');
    if(!rest||!push)throw new Error(`${mode}: canonical intermission did not create both choices`);
    Object.assign(g.player,{x:rest.x-86,y:rest.y});await broadcast();await p.open('adventures');await p.collapse();
    await p.record('Rastphase nennt beide echten Entscheidungen und sperrt die Ferne',`(() => {const card=document.querySelector('[data-adventure-id="trial-cinderwatch"]'),status=card.querySelector('.trial-wave-status'),rest=card.querySelector('[data-choice="rest"]'),push=card.querySelector('[data-choice="push"]');return status.dataset.phase==='intermission'&&status.querySelector('.trial-wave-heading').textContent.includes('1/4')&&rest.disabled&&push.disabled&&rest.textContent.includes('Rasten')&&push.textContent.includes('Drängen');})()`);
    const negativeBefore={phase:trial.phase,index:trial.waveIndex,bonus:trial.bonus,hp:g.player.hp,mana:g.player.mana},gameRejected=g.interactWorldEvent(rest.id)===false;
    const remote=await fetch(`${running.origin}/api/session/${session.token}/command`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'method',name:'interactWorldEvent',args:[rest.id]})}),remoteData=await remote.json();
    const unchanged=JSON.stringify(negativeBefore)===JSON.stringify({phase:trial.phase,index:trial.waveIndex,bonus:trial.bonus,hp:g.player.hp,mana:g.player.mana});
    if(!gameRejected||remote.status!==200||remoteData.accepted!==false||!unchanged)throw new Error(`${mode}: distant choice escaped Game/HTTP distance gate`);
    report.flows[mode].push({name:'Game und echter HTTP-Aufruf verweigern die Entscheidung jenseits von 85 px',passed:true});await p.geometry('distant-choice-disabled');

    await p.close();
    const stats=g.stats();Object.assign(g.player,{x:rest.x+80,y:rest.y,hp:Math.floor(stats.maxHp*.45),mana:Math.floor(stats.mana*.3)});await broadcast();
    const damaged={hp:g.player.hp,mana:g.player.mana};await p.open('adventures');await p.collapse();await p.reveal('[data-choice="rest"]');await p.geometry('near-rest-choice');
    await p.activate(`[data-command="world-event"][data-id="${rest.id}"][data-choice="rest"]`);await flush();await phase('wave-warning');
    if(Math.abs(g.player.hp-(damaged.hp+stats.maxHp*.2))>.0001||Math.abs(g.player.mana-(damaged.mana+stats.mana*.15))>.0001||trial.bonus!==1||trial.pending[0]?.count!==def.waves[1].count)throw new Error(`${mode}: native rest did not produce exact healing and canonical second wave`);
    await p.record('Native Rast in 80 px heilt genau 20 % Leben und 15 % Mana und startet Welle zwei',"(() => {const event=window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch');return event.phase==='wave-warning'&&event.wave.current===2&&event.wave.cleared===1&&Math.abs(event.warningRemaining-6)<1e-7;})()");await p.geometry('after-native-rest');

    await advance(6.04,true);await phase('wave-combat');await killWave();
    push=liveChoices().find(object=>object.choice==='push');if(!push)throw new Error(`${mode}: second intermission push prop is missing`);
    Object.assign(g.player,{x:push.x-80,y:push.y});await broadcast();await p.open('adventures');await p.collapse();await p.reveal('[data-choice="push"]');await p.geometry('near-push-choice');
    const beforePush={hp:g.player.hp,mana:g.player.mana};await p.activate(`[data-command="world-event"][data-id="${push.id}"][data-choice="push"]`);await flush();await phase('wave-warning');
    if(trial.bonus!==1.05||trial.pending[0]?.count!==def.waves[2].count+1||g.player.hp!==beforePush.hp||g.player.mana!==beforePush.mana)throw new Error(`${mode}: native push did not create exactly one extra actor and 5% bonus`);
    await p.record('Natives Drängen verstärkt nur die nächste normale Welle und erhöht den Abschlussbonus',"(() => {const event=window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch');return event.phase==='wave-warning'&&event.wave.current===3&&event.wave.cleared===2&&Math.abs(event.warningRemaining-6)<1e-7&&document.getElementById('waypoint-text').textContent.includes('Gegner in 6 s');})()");await p.geometry('after-native-push');

    await advance(6.04,true);await phase('wave-combat');await killWave();
    push=liveChoices().find(object=>object.choice==='push');Object.assign(g.player,{x:push.x-80,y:push.y});await broadcast();await p.open('adventures');await p.collapse();await p.reveal('[data-choice="push"]');await p.activate(`[data-command="world-event"][data-id="${push.id}"][data-choice="push"]`);await flush();await phase('wave-warning');
    if(trial.pending[0]?.count!==1||trial.pending[0]?.boss!==def.waves.at(-1).boss||trial.bonus!==1.10)throw new Error(`${mode}: push changed the final boss budget`);
    await p.record('Bossfinale behält seinen einzelnen kanonischen Boss und eine eigene sechssekündige Warnung',"(() => {const event=window.emberfall.game.worldEventSummary().find(event=>event.id==='trial-cinderwatch');return event.wave.current===4&&event.wave.cleared===3&&Math.abs(event.warningRemaining-6)<1e-7&&document.getElementById('waypoint-text').textContent.includes('Boss in 6 s');})()");await p.geometry('final-boss-warning');
    await p.open('adventures');await p.collapse();await p.reveal('[data-adventure-id="trial-cinderwatch"]');
    await p.record('Panel zeigt die laufende Bosswarnung in der bestehenden Prüfungskarte',"(() => {const card=document.querySelector('[data-adventure-id=\"trial-cinderwatch\"]'),status=card?.querySelector('.trial-wave-status');return status?.dataset.phase==='wave-warning'&&status.querySelector('.trial-wave-heading').textContent.includes('Welle 4/4')&&status.querySelector('.trial-wave-heading').textContent.includes('Bossfinale')&&status.querySelector('.trial-wave-heading').textContent.includes('6 s')&&status.querySelectorAll('.trial-wave-progress>.cleared').length===3;})()");await p.geometry('final-boss-panel');
    await p.close();await p.open('party');await p.activate('[data-command="party-disconnect"]');await p.wait('!window.emberfall.network.online');
  }
} catch(error){report.failures.push(error.message);process.exitCode=1;for(const p of pages)try{await p.screenshot('failure');}catch{}}
finally {
  if(report.errors.length||report.consoleErrors.length){report.failures.push('Runtime exception or console error.');process.exitCode=1;}
  await fs.writeFile(path.join(output,'content-loop4-report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({flows:Object.fromEntries(Object.entries(report.flows).map(([mode,flows])=>[mode,{passed:flows.filter(flow=>flow.passed).length,total:flows.length}])),geometry:report.geometry.length,failures:report.failures,errors:report.errors,consoleErrors:report.consoleErrors,screenshots:output},null,2));
  for(const p of pages)p.socket.close();browserSocket?.close();chromium.kill('SIGTERM');await running.close();await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
}

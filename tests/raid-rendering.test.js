import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer } from '../src/renderer.js';
import { GameUI } from '../src/ui.js';
import { DUNGEONS } from '../src/dungeons.js';
import { QUESTS } from '../src/catalog.js';
import { RAID_PROFILES, raidZoneShape } from '../src/raid-encounters.js';
import { hitShape, shapeBounds, annulusDangerArcs } from '../src/encounter-geometry.js';
import { drawRaidObjective, raidHudPresentation, RAID_WARNING_COLOR, RAID_SAFE_COLOR } from '../src/raid-visuals.js';

// Capture the actual Canvas fill contours, then sample them against combat.
// No second copy of the game's ring or cone collision formula is used here.
function environment(run) {
  const previous={document:globalThis.document,window:globalThis.window};
  const canvas=()=>{
    const calls=[],fills=[],strokes=[],stack=[],gradient={addColorStop(){}};let path=[];
    const state={calls,fills,strokes,lineWidth:1,lineCap:'butt',fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,
      createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:value=>({width:String(value).length*6}),
      beginPath(){path=[];},fill(rule){fills.push({path:structuredClone(path),rule,color:this.fillStyle});},
      stroke(){strokes.push({path:structuredClone(path),color:this.strokeStyle});},
      save(){stack.push({fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,globalAlpha:this.globalAlpha});},
      restore(){Object.assign(this,stack.pop()||{});},
      fillRect(...args){calls.push({method:'fillRect',args,color:this.fillStyle});},
    };
    const c=new Proxy(state,{get(target,key){if(key in target)return target[key];return(...args)=>{const command={method:key,args};calls.push(command);if(['moveTo','lineTo','arc','closePath'].includes(key))path.push(command);};},set(target,key,value){target[key]=value;return true;}});
    return {getContext:()=>c,getBoundingClientRect:()=>({width:360,height:580,left:0,top:0}),context:c,width:0,height:0};
  };
  globalThis.document={createElement:canvas};globalThis.window={devicePixelRatio:1};
  try{return run(canvas);}finally{globalThis.document=previous.document;globalThis.window=previous.window;}
}
const worldFor=enemies=>({isDungeon:true,width:1800,height:1500,regions:[],rooms:[],paths:[],river:[],landmarks:[],structures:[],trees:[],rocks:[],nodes:[],plots:[],shrines:[],chests:[],enemies});
const gameFor=(type='world_heart')=>{
  const boss={id:'weltenkern:boss',type,x:1400,y:760,hp:500,maxHp:1000,alive:true,boss:true,aggro:true,phase:'windup',telegraphMechanic:'raid',attackTimer:1.2};
  return {world:worldFor([boss]),player:{id:'local',classId:'guardian',x:1200,y:760,hp:100},time:15,settings:{reducedMotion:true,shake:false},questState:{},npcs:[],hazards:[],drops:[],effects:[],projectiles:[],
    dungeonInstance:{id:'weltenkern',definition:DUNGEONS.find(d=>d.boss===type),bossEngaged:true,raidRevivesUsed:0,bossTime:15,raidEncounter:{type,startedAt:0,phase:1,stopped:false,pending:{name:'Geteiltes Spektrum',mechanicId:'paired_spectrum',time:13.8,resolveAt:16.2,zones:[]},objectives:{}}}};
};
function contours(commands) {
  const result=[];let current=[];const finish=()=>{if(current.length)result.push(current);current=[];};
  for(const {method,args} of commands){
    if(method==='moveTo'){finish();current.push(args);}if(method==='lineTo')current.push(args);
    if(method==='arc'){
      const [x,y,r,start,end,ccw=false]=args;let sweep=end-start;
      if(ccw){while(sweep>0)sweep-=Math.PI*2;sweep=Math.max(-Math.PI*2,sweep);}else{while(sweep<0)sweep+=Math.PI*2;sweep=Math.min(Math.PI*2,sweep);}
      const steps=Math.max(1,Math.ceil(Math.abs(sweep)*1024/(Math.PI*2)));for(let i=0;i<=steps;i++){const a=start+sweep*i/steps;current.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}
    }
    if(method==='closePath')finish();
  }
  finish();return result;
}
function inFill(fill,point) {
  let crossings=0;
  for(const polygon of contours(fill.path))for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j];if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])crossings++;
  }
  return crossings%2===1;
}
const pointAt=(shape,radius,angle)=>({x:shape.x+Math.cos(angle)*radius,y:shape.y+Math.sin(angle)*radius});

test('Eon warns the real paired ring: inner sanctuary and both rotated gaps stay unfilled',()=>environment(canvas=>{
  const view=canvas(),renderer=new Renderer(view,worldFor([]));
  for(const rotation of [.7,Math.PI-.1,-Math.PI+.1,7.5]){
    const shape=Object.freeze({kind:'annulus',x:1400,y:760,innerRadius:100,outerRadius:420,gapAngles:Object.freeze([rotation,rotation+Math.PI]),gapAngle:rotation,gapWidth:Math.PI/4});
    view.context.fills.length=0;view.context.strokes.length=0;renderer.encounterShape(view.context,shape,{progress:.82,color:RAID_WARNING_COLOR});
    const fill=view.context.fills[0];assert.equal(fill.rule,'evenodd');
    for(let angle=.01;angle<Math.PI*2;angle+=.07)for(const radius of [60,180,360,450]){
      const point=pointAt(shape,radius,angle);assert.equal(inFill(fill,point),hitShape(shape,point),JSON.stringify({rotation,radius,angle}));
    }
    for(const gap of shape.gapAngles){assert.equal(inFill(fill,pointAt(shape,200,gap)),false);assert.equal(hitShape(shape,pointAt(shape,200,gap+shape.gapWidth/2)),false,'Gap boundaries are safe');}
    const rim=view.context.strokes.at(-1).path.filter(p=>p.method==='arc');
    for(const arc of rim)for(let angle=arc.args[3]+1e-4;angle<arc.args[4]-1e-4;angle+=.04)assert.equal(hitShape(shape,pointAt(shape,400,angle)),true,'Countdown stays on danger, not across a safe gap');
  }
}));

test('multiple annulus gaps reject malformed input, merge overlaps, and leave legacy one-gap spans identical',()=>{
  const base={kind:'annulus',x:0,y:0,innerRadius:10,outerRadius:100,gapAngle:.7,gapWidth:.8};
  assert.deepEqual(annulusDangerArcs(base),[[1.1,.7+Math.PI*2-.4]]);
  assert.deepEqual(annulusDangerArcs({...base,gapAngles:[.7]}),annulusDangerArcs(base));
  for(const gapAngles of [[],[NaN],[Infinity],Array(9).fill(0),'bad']){const shape={...base,gapAngles};assert.equal(hitShape(shape,{x:20,y:0}),false);assert.equal(shapeBounds(shape),null);assert.deepEqual(annulusDangerArcs(shape),[]);}
  const overlap={...base,gapAngles:[Math.PI-.2,-Math.PI+.2,Math.PI-.2]};
  for(const angle of [Math.PI,-Math.PI,Math.PI-.55,-Math.PI+.55])assert.equal(hitShape(overlap,pointAt(overlap,30,angle)),false);
  const spans=annulusDangerArcs(overlap);assert.equal(spans.length,1);assert.ok(Math.abs((spans[0][1]-spans[0][0])-(Math.PI*2-1.2))<1e-9);
  assert.deepEqual(annulusDangerArcs({...base,gapAngles:[0,Math.PI],gapWidth:Math.PI}),[]);
});

test('offscreen raid hazards cull by their real shape and draw one exact warning with cool refuges',()=>environment(canvas=>{
  const view=canvas(),game=gameFor(),renderer=new Renderer(view,game.world),zone={shape:'donut',x:1400,y:760,innerRadius:100,radius:420,gapAngle:.4,secondGapAngle:.4+Math.PI,gapArc:Math.PI/4};
  game.player.x=1000;
  const shape=raidZoneShape(zone);game.hazards=[{kind:'warning',raidEncounter:true,x:zone.x,y:zone.y,radius:5,shape,mechanicId:'paired_spectrum',life:1.2,windup:true},
    {kind:'warning',raidEncounter:true,x:1700,y:100,radius:999,shape:{kind:'circle',x:1700,y:100,radius:20},life:1,windup:true}];
  renderer.draw(game);assert.equal(renderer.visible(zone.x,zone.y,190),false,'Boss center is beyond the portrait viewport');
  const warnings=renderer.worldCtx.fills.filter(fill=>fill.color===`${RAID_WARNING_COLOR}2c`);
  assert.equal(warnings.length,1,'The intersecting warning is drawn once; the distant marker and generic boss circle are absent');
  assert.equal(inFill(warnings[0],game.player),hitShape(shape,game.player));
  assert.ok(renderer.worldCtx.strokes.some(stroke=>stroke.color===RAID_SAFE_COLOR),'Actual inner refuge and gap sides have a cool boundary');
  assert.ok(!renderer.worldCtx.fills.some(fill=>fill.path.some(p=>p.method==='arc'&&p.args[2]===999)));
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('Sternfall')),'No duplicate warning label is placed over touch controls');
}));

test('raid cone and target circles keep their frozen impact centers and do not follow later player movement',()=>environment(canvas=>{
  const view=canvas(),game=gameFor('night_devourer'),renderer=new Renderer(view,game.world);
  for(const zone of [{shape:'sector',x:1400,y:760,radius:370,angle:.7,arc:Math.PI/3},{shape:'circle',x:1220,y:900,radius:78}]){
    const shape=raidZoneShape(zone),hazard={raidEncounter:true,kind:'warning',shape,x:0,y:0,radius:1,life:1.2,windup:true};
    view.context.fills.length=0;renderer.hazard(view.context,hazard,game);const fill=view.context.fills[0];
    for(let angle=.04;angle<Math.PI*2;angle+=.2)for(const radius of [30,77,150,350,400])assert.equal(inFill(fill,pointAt(shape,radius,angle)),hitShape(shape,pointAt(shape,radius,angle)));
    const before=structuredClone(fill);game.player.x+=80;game.player.y-=80;game.time+=100;view.context.fills.length=0;renderer.hazard(view.context,hazard,game);assert.deepEqual(view.context.fills[0],before);
  }
}));

test('unique raid warnings do not hide the existing cooperative stack circle between casts',()=>environment(canvas=>{
  const view=canvas(),game=gameFor('storm_king'),renderer=new Renderer(view,game.world),boss=game.world.enemies[0];
  game.dungeonInstance.raidEncounter.pending=null;
  Object.assign(boss,{telegraphMechanic:'stack',telegraphX:1200,telegraphY:760,telegraphRadius:115,telegraphDuration:1.7,telegraphPattern:'encounter',stackRequired:2});
  renderer.draw(game);
  assert.ok(renderer.worldCtx.calls.some(call=>call.method==='ellipse'&&call.args[0]===1200&&call.args[1]===760&&call.args[2]===115&&call.args[3]===115),'The cooperative circle keeps its real locked damage center and radius');
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'&&String(call.args[0]).startsWith('Zusammen')),'Coordination text stays in the one raid HUD');
}));

test('anchors and souls have distinct native pixel silhouettes, actual HP and objective deadlines',()=>environment(canvas=>{
  const view=canvas(),game=gameFor(),renderer=new Renderer(view,game.world);renderer.worldLabels=[];
  const actor={id:'anchor',type:'echo_guard',name:'Prismatischer Anker',x:1250,y:760,hp:1200,maxHp:4800,bossObjectiveId:'anchor',ownerBossId:'weltenkern:boss'};
  game.dungeonInstance.raidEncounter.objectives.anchor={hp:1200,alive:true,expiresAt:23,exploding:false};renderer.enemy(renderer.worldCtx,actor,game);
  const rects=renderer.worldCtx.calls.filter(call=>call.method==='roundRect');assert.deepEqual(rects.slice(0,2).map(call=>call.args[2]),[66,16.5]);
  assert.ok(renderer.worldLabels.some(label=>label[0]==='Prismatischer Anker · 8s'));assert.ok(!renderer.worldCtx.calls.some(call=>call.method==='drawImage'),'Objective silhouettes are original pixels, not generic guard assets');
  const anchorPixels=renderer.worldCtx.calls.filter(call=>call.method==='fillRect');view.context.calls.length=0;
  drawRaidObjective(view.context,{...actor,name:'Hungrige Seele',ownerBossId:'nachtschlund:boss'},{time:10,reducedMotion:true});
  const soulPixels=structuredClone(view.context.calls.filter(call=>call.method==='fillRect'));assert.notDeepEqual(soulPixels,anchorPixels);
  view.context.calls.length=0;drawRaidObjective(view.context,{...actor,name:'Hungrige Seele',ownerBossId:'nachtschlund:boss'},{time:90,reducedMotion:true});assert.deepEqual(view.context.calls.filter(call=>call.method==='fillRect'),soulPixels);
  game.dungeonInstance.raidEncounter.objectives.anchor.exploding=true;renderer.worldLabels=[];renderer.enemy(renderer.worldCtx,actor,game);assert.ok(renderer.worldLabels.some(label=>label[0]==='Prismatischer Anker · ÜBERLADEN'));
}));

test('raid HUD reads combat clock, phase and alive objective count while generic warnings stay locked',()=>{
  const game=gameFor();game.dungeonInstance.raidEncounter.objectives={a:{hp:1,alive:true,expiresAt:23},b:{hp:50,alive:true,expiresAt:20},c:{hp:0,alive:true,expiresAt:19},d:{hp:20,alive:false,expiresAt:23}};
  let summary=raidHudPresentation(game);assert.equal(summary.name,'Geteiltes Spektrum');assert.equal(summary.phase,2);assert.equal(summary.remaining,2);assert.equal(summary.objectiveCount,2);assert.equal(summary.objectiveSeconds,5);assert.match(summary.detail,/2 Anker · 5 s/);
  game.time+=200;assert.deepEqual(raidHudPresentation(game),summary,'Global elapsed time never advances a combat warning');
  game.dungeonInstance.raidEncounter.pending=null;Object.assign(game.world.enemies[0],{telegraphMechanic:'stack',mechanicCycle:'spread'});summary=raidHudPresentation(game);assert.equal(summary.name,'Sternfall · 2 sammeln','The locked generic cast wins over a newly scheduled cycle');
  game.dungeonInstance.raidEncounter.stopped=true;assert.equal(raidHudPresentation(game),null);game.dungeonInstance.raidEncounter.stopped=false;game.dungeonInstance.bossDefeated=true;assert.equal(raidHudPresentation(game),null);
  game.dungeonInstance.bossDefeated=false;game.worldMode='pvp';assert.equal(raidHudPresentation(game),null);
});

test('raid HUD reuses the existing danger rail and clears old mode when combat ends',()=>{
  const previous=globalThis.document,attributes={},toggles=[];let writes=0;
  const element={hidden:true,dataset:{},parentElement:{classList:{toggle:(...args)=>toggles.push(args)}},setAttribute:(key,value)=>attributes[key]=value,getAttribute:key=>attributes[key],set innerHTML(value){this.html=value;writes++;},get innerHTML(){return this.html;}};
  globalThis.document={getElementById:id=>id==='encounter-pressure'?element:null};
  try{
    const ui=Object.assign(Object.create(GameUI.prototype),{game:gameFor()});ui.updateEncounter();assert.equal(element.hidden,false);assert.equal(element.dataset.mode,'raid');assert.match(element.innerHTML,/Geteiltes Spektrum/);assert.match(attributes['aria-label'],/Phase 2/);ui.updateEncounter();assert.equal(writes,1,'An unchanged snapshot does not rebuild the HUD');
    ui.game.dungeonInstance.bossTime=16;ui.updateEncounter();assert.equal(writes,2,'Countdown reacts to actual combat time');
    ui.game.dungeonInstance.raidEncounter.stopped=true;ui.updateEncounter();assert.equal(element.hidden,true);assert.equal(element.dataset.mode,'world');assert.deepEqual(toggles.at(-1),['raid-active',false]);
  }finally{globalThis.document=previous;}
});

test('living reconnected heroes see the waiting group count and a paused combat clock instead of an advancing cast',()=>{
  const game=gameFor();game.networkRaidResume={waiting:true,required:8,ready:3};
  const summary=raidHudPresentation(game);assert.equal(summary.waiting,true);assert.equal(summary.name,'Warte auf Raidgruppe · 3/8');assert.equal(summary.detail,'Kampfzeit pausiert');assert.equal(summary.remaining,0);assert.equal(summary.warning,false);
  game.time+=500;assert.deepEqual(raidHudPresentation(game),summary);game.networkRaidResume.ready=4;assert.equal(raidHudPresentation(game).name,'Warte auf Raidgruppe · 4/8');
  game.networkRaidResume.waiting=false;assert.equal(raidHudPresentation(game).name,'Geteiltes Spektrum');
  const previous=globalThis.document,attributes={},element={dataset:{},hidden:true,parentElement:{classList:{toggle(){}}},setAttribute:(key,value)=>attributes[key]=value,getAttribute:key=>attributes[key]};
  globalThis.document={getElementById:()=>element};
  try{game.networkRaidResume.waiting=true;const ui=Object.assign(Object.create(GameUI.prototype),{game});ui.updateEncounter();assert.equal(element.hidden,false);assert.equal(element.dataset.stage,'paused');assert.match(element.innerHTML,/Warte auf Raidgruppe · 4\/8/);assert.match(element.innerHTML,/Kampfzeit pausiert/);assert.match(element.innerHTML,/#i-group/);}
  finally{globalThis.document=previous;}
});

test('the unavoidable pressure cast tells the team to protect and heal, with its actual phase and deadline',()=>{
  const game=gameFor();Object.assign(game.dungeonInstance.raidEncounter,{phase:2,pending:{mechanicId:'raid_pressure',name:RAID_PROFILES.world_heart.pressure.name,time:14.4,resolveAt:16.2,phase:2}});
  const summary=raidHudPresentation(game);assert.equal(summary.pressure,true);assert.equal(summary.phase,3);assert.equal(summary.remaining,2);assert.equal(summary.detail,'Team schützen und heilen · 2 s');
  const previous=globalThis.document,attributes={},element={dataset:{},hidden:true,parentElement:{classList:{toggle(){}}},setAttribute:(key,value)=>attributes[key]=value,getAttribute:key=>attributes[key]};
  globalThis.document={getElementById:()=>element};
  try{const ui=Object.assign(Object.create(GameUI.prototype),{game});ui.updateEncounter();assert.equal(element.dataset.support,'true');assert.match(element.innerHTML,/#i-shield/);assert.match(element.innerHTML,/Weltenlast · Phase 3/);assert.match(element.innerHTML,/Team schützen und heilen · 2 s/);assert.doesNotMatch(element.innerHTML,/ausweich|Fläche verlassen/i);assert.match(attributes['aria-label'],/Phase 3/);}
  finally{globalThis.document=previous;}
});

test('the existing raid rail and journal expose the remaining shared revival pool, including exhaustion',()=>{
  const game=gameFor(),ui=Object.assign(Object.create(GameUI.prototype),{game}),previous=globalThis.document,attributes={},element={dataset:{},hidden:true,parentElement:{classList:{toggle(){}}},setAttribute:(key,value)=>attributes[key]=value,getAttribute:key=>attributes[key]};
  globalThis.document={getElementById:()=>element};
  try{
    const max=RAID_PROFILES.world_heart.combatRevives;assert.equal(max,3);ui.updateEncounter();assert.match(element.innerHTML,/Kampfbelebungen 3\/3/);assert.match(element.title,/noch 3 von 3/);
    game.dungeonInstance.raidRevivesUsed=2;ui.updateEncounter();assert.match(element.innerHTML,/Kampfbelebungen 1\/3/);assert.equal(raidHudPresentation(game).revives.used,2);assert.match(ui.raidJournal(DUNGEONS.find(d=>d.id==='weltenkern')),/Kampfbelebungen 1\/3 übrig/);
    game.dungeonInstance.raidRevivesUsed=3;ui.updateEncounter();assert.match(element.innerHTML,/Kampfbelebungen 0\/3/);assert.equal((element.innerHTML.match(/class="raid-revive-budget"/g)||[]).length,1,'Pool is inline in the existing rail, never a second HUD block');
    game.networkRaidResume={waiting:true,required:8,ready:2};ui.updateEncounter();assert.match(element.innerHTML,/Kampfzeit pausiert/);assert.match(element.innerHTML,/Kampfbelebungen 0\/3/,'A reconnect does not imply the combat budget was renewed');
  }finally{globalThis.document=previous;}
});

test('the defeat screen blocks self-return during a live raid and restores it after a complete team wipe',async()=>{
  const game=gameFor(),ui=Object.assign(Object.create(GameUI.prototype),{game,rescueBusy:false,activePanel:'death',renderPanel(){},update(){},closePanel(){this.activePanel=null;}});
  game.dungeonInstance.world=game.world;game.dead=true;game.player.hp=0;let requests=0;game.respawn=()=>{requests++;game.dead=false;game.player.hp=30;return true;};
  let html=ui.death();assert.match(html,/Warte auf eine Kampfbelebung durch deine Gruppe/);assert.match(html,/Noch 3 von 3/);assert.match(html,/data-command="respawn" disabled aria-describedby="raid-death-wait"/);await ui.command('respawn');assert.equal(requests,0);
  game.dungeonInstance.raidRevivesUsed=3;html=ui.death();assert.match(html,/Vorrat an Kampfbelebungen ist erschöpft/);assert.doesNotMatch(html,/Noch 3 von 3/);
  game.dungeonInstance.bossEngaged=false;game.dungeonInstance.raidRevivesUsed=0;html=ui.death();assert.match(html,/Zurückkehren/);assert.doesNotMatch(html,/data-command="respawn"[^>]+disabled/);await ui.command('respawn');assert.equal(requests,1);assert.equal(ui.activePanel,null);
});

test('each raid journal exposes its canonical unique mechanics and three phase transitions without inventing a fourth boss',()=>{
  const ui=Object.create(GameUI.prototype);
  for(const dungeon of DUNGEONS.filter(d=>d.raid)){
    const html=ui.raidJournal(dungeon),profile=RAID_PROFILES[dungeon.boss];assert.equal((html.match(/data-raid-mechanic=/g)||[]).length,2);assert.equal((html.match(/<li>/g)||[]).length,3);
    for(const ability of profile.abilities){assert.ok(html.includes(ability.id));assert.ok(html.includes(ability.name));assert.ok(html.includes(ability.counterplay));}
    assert.match(html,/Blaue Ränder/);assert.match(html,/Bossstrategie lesen/);assert.ok(html.includes(profile.pressure.name));assert.ok(html.includes(profile.pressure.counterplay));assert.match(html,/data-raid-pressure="raid_pressure"/);assert.ok(html.includes(`${profile.combatRevives} gemeinsame Kampfbelebung${profile.combatRevives===1?'':'en'} pro Bossversuch`));
    assert.match(ui.raidJournal(dungeon,{open:true}),/ open>/);
  }
  assert.equal(ui.raidJournal(DUNGEONS.find(d=>!d.raid)),'');
});

test('an empty dungeon chronicle cannot obscure the raid, while a real pinned quest and the mobile shortcut remain available',()=>{
  const previous=globalThis.document,classes=new Map(),tracker={classList:{toggle:(name,value)=>classes.set(name,value)}},content={innerHTML:'',parentElement:tracker};
  globalThis.document={getElementById:()=>null};
  try{
    const game=gameFor(),ui=Object.assign(Object.create(GameUI.prototype),{game,elements:{'quest-tracker':content},trackerExpanded:false,trackedAdventure:()=>null});
    ui.renderTracker();assert.equal(classes.get('tracker-empty-dungeon'),true);assert.equal(content.innerHTML,'');assert.doesNotMatch(content.innerHTML,/Deine Geschichte beginnt hier|Sprich mit Mira/);
    const quest=QUESTS.find(record=>record.objectives.length>0);game.questState[quest.id]={status:'active',counts:quest.objectives.map(()=>0)};game.trackedQuestId=quest.id;ui.renderTracker();
    assert.equal(classes.get('tracker-empty-dungeon'),false);assert.ok(content.innerHTML.includes(quest.title));assert.match(content.innerHTML,/class="tracked-quest"/);
    game.questState={};game.trackedQuestId=null;game.dungeonInstance=null;game.world.isDungeon=false;ui.renderTracker();assert.equal(classes.get('tracker-empty-dungeon'),false);assert.match(content.innerHTML,/Deine Geschichte beginnt hier/,'The introductory guidance returns outside a dungeon');
    assert.notEqual(tracker.hidden,true,'The shared mobile chronicle shortcut never receives a global hidden attribute');
  }finally{globalThis.document=previous;}
});

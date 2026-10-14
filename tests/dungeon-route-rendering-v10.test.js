import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, dungeonRoutePresentation, TERRAIN_CACHE_LIMIT } from '../src/renderer.js';
import { GameUI } from '../src/ui.js';
import { DUNGEONS, createDungeon } from '../src/dungeons.js';
import { routeHazardShapes } from '../src/dungeon-routes.js';
import { hitShape } from '../src/encounter-geometry.js';

function environment(run) {
  const previous={document:globalThis.document,window:globalThis.window};
  const canvas=()=>{
    const calls=[],fills=[],stack=[],gradient={addColorStop(){}};let path=[];
    const state={calls,fills,fillStyle:'#000',strokeStyle:'#000',globalAlpha:1,createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,measureText:value=>({width:String(value).length*6}),
      beginPath(){path=[];},fill(rule){fills.push({path:structuredClone(path),rule,color:this.fillStyle});},save(){stack.push({fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,globalAlpha:this.globalAlpha});},restore(){Object.assign(this,stack.pop()||{});},
      fillRect(...args){calls.push({method:'fillRect',args,color:this.fillStyle});},fillText(...args){calls.push({method:'fillText',args,color:this.fillStyle});}};
    const ctx=new Proxy(state,{get(target,key){if(key in target)return target[key];return(...args)=>{const call={method:key,args};calls.push(call);if(['moveTo','lineTo','arc','closePath'].includes(key))path.push(call);};},set(target,key,value){target[key]=value;return true;}});
    return{width:360,height:580,context:ctx,getContext:()=>ctx,getBoundingClientRect:()=>({width:360,height:580,left:0,top:0})};
  };
  globalThis.document={createElement:canvas,getElementById:()=>null};globalThis.window={devicePixelRatio:1};
  try{return run(canvas);}finally{globalThis.document=previous.document;globalThis.window=previous.window;}
}
const gameFor=instance=>({world:instance.world,dungeonInstance:instance,player:{id:'local',name:'Runa',classId:'guardian',level:100,...instance.spawn,hp:100},time:10,settings:{reducedMotion:true,shake:false},questState:{},npcs:[],hazards:[],drops:[],effects:[],projectiles:[]});
function inFill(fill,point){
  const polygons=[];let current=[];const finish=()=>{if(current.length)polygons.push(current);current=[];};
  for(const {method,args} of fill.path){
    if(method==='moveTo'){finish();current.push(args);}if(method==='lineTo')current.push(args);
    if(method==='arc'){const [x,y,r,start,end,ccw=false]=args;let sweep=end-start;if(ccw){while(sweep>0)sweep-=Math.PI*2;}else while(sweep<0)sweep+=Math.PI*2;const steps=Math.max(1,Math.ceil(Math.abs(sweep)*1024/(Math.PI*2)));for(let i=0;i<=steps;i++){const a=start+sweep*i/steps;current.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}}
    if(method==='closePath')finish();
  }
  finish();let crossings=0;
  for(const polygon of polygons)for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>point.y)!==(b[1]>point.y)&&point.x<(b[0]-a[0])*(point.y-a[1])/(b[1]-a[1])+a[0])crossings++;}
  return crossings%2===1;
}
const uiFor=game=>Object.assign(Object.create(GameUI.prototype),{game,trackerExpanded:false});

test('route strip warnings and active fills match the exact shared capsules, not their old circles',()=>environment(canvas=>{
  const instance=createDungeon('wurzelgewoelbe'),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world),chamber=instance.routes.chambers.find(c=>c.kind==='tactical'),shape=routeHazardShapes(chamber,0)[0].shape;
  for(const active of [false,true]){
    view.context.fills.length=0;renderer.hazard(view.context,{routeHazard:true,shape,x:chamber.centerX,y:shape.y1,radius:300,color:'#e59577',life:.9,maxLife:1.8,windup:!active,active},game);
    const fill=view.context.fills[0];assert.equal(fill.color,active?'#e5957755':'#e595772c');assert.equal(fill.rule,'evenodd');
    for(const p of [{x:chamber.centerX,y:shape.y1},{x:chamber.centerX,y:shape.y1+27.9},{x:chamber.centerX,y:shape.y1+28.1},{x:shape.x1-27.9,y:shape.y1},{x:shape.x1-28.1,y:shape.y1},{x:shape.x2+27.9,y:shape.y1},{x:shape.x2+28.1,y:shape.y1},{x:chamber.centerX+80,y:shape.y1+80}])assert.equal(inFill(fill,p),hitShape(shape,p),JSON.stringify(p));
    assert.ok(!view.context.calls.some(call=>call.method==='arc'&&call.args[2]===300),'The fallback circle must not suggest damage beyond the actual strip');
  }
}));

test('a strip crossing a portrait viewport is rendered when both capsule ends are outside the screen',()=>environment(canvas=>{
  const instance=createDungeon('salzarchiv'),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world),chamber=instance.routes.chambers.find(c=>c.kind==='tactical'),shape=routeHazardShapes(chamber,0)[1].shape;
  Object.assign(game.player,{x:chamber.centerX,y:shape.y1});game.camera={x:game.player.x,y:game.player.y};game.hazards=[{routeHazard:true,shape,x:0,y:0,radius:1,color:'#e59577',life:1,maxLife:1.8,windup:true}];renderer.draw(game);
  assert.equal(renderer.visible(shape.x1,shape.y1,0),false);assert.equal(renderer.visible(shape.x2,shape.y2,0),false);
  assert.ok(renderer.worldCtx.fills.some(fill=>fill.color==='#e595772c'&&inFill(fill,game.player)),'Real shape bounds keep the warning visible despite its deliberately irrelevant marker center');
  assert.ok(renderer.terrainChunks.size<=TERRAIN_CACHE_LIMIT);assert.equal(renderer.worldCanvas.width,180);assert.equal(renderer.worldCanvas.height,290);
}));

test('cool island pixels lie between actual hazard bands for every dungeon rather than on a temporarily idle strip',()=>environment(canvas=>{
  for(const definition of DUNGEONS){
    const instance=createDungeon(definition.id),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world);
    for(const chamber of instance.routes.chambers.filter(c=>c.kind==='tactical')){
      renderer.bounds={...chamber};view.context.calls.length=0;renderer.routeSafetyIslands(view.context,game);
      const marks=view.context.calls.filter(call=>call.method==='fillRect'&&call.color==='#72a79f22');assert.ok(marks.length>0);
      const shapes=routeHazardShapes(chamber,20).map(phase=>phase.shape);
      for(const mark of marks){const [x,y,w,h]=mark.args;for(const point of [{x,y},{x:x+w,y:y+h},{x:x+w/2,y:y+h/2}])assert.ok(shapes.every(shape=>!hitShape(shape,point)),JSON.stringify({definition:definition.id,point}));}
    }
  }
}));

test('route gates show a full closed barrier and leave the collision opening clear after completion',()=>environment(canvas=>{
  const instance=createDungeon('uhrwerk'),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world),gate=instance.world.structures.find(s=>s.type==='dungeon_route_gate');renderer.bounds={x:0,y:0,w:1800,h:3840};
  Object.assign(game.player,{x:gate.x+gate.w/2,y:gate.y+80});renderer.structure(view.context,gate,game);assert.ok(view.context.calls.some(call=>call.method==='fillRect'&&call.args[0]===gate.x&&call.args[1]===gate.y&&call.args[2]===gate.w&&call.args[3]===gate.h));
  view.context.calls.length=0;renderer.structure(view.context,{...gate,blocking:false,open:true},game);assert.ok(!view.context.calls.some(call=>call.method==='fillRect'&&call.args[2]===gate.w&&call.args[3]===gate.h));assert.ok(view.context.calls.some(call=>call.method==='fillRect'&&call.args[2]===6&&call.args[3]===gate.h));assert.equal(gate.blocking,true,'Rendering never changes collision state');
}));

test('native core and rune pixels show canonical order, completed checks and the real two-second hold',()=>environment(canvas=>{
  const instance=createDungeon('frostkathedrale'),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world),chamber=instance.routes.chambers.find(c=>c.kind==='relay'),beacon=chamber.beacons[1],object=instance.world.puzzleObjects.find(o=>o.id===beacon.id);
  instance.routes.relay={chamberId:chamber.id,actorId:'local',step:1,remaining:8,hold:1,holding:true};Object.assign(game.player,{x:object.x,y:object.y});renderer.worldLabels=[];renderer.puzzleObject(renderer.worldCtx,object,game);
  assert.ok(renderer.worldLabels.some(label=>label[0].startsWith('2. ')&&label[0].includes('als Nächstes halten')));assert.ok(renderer.worldCtx.calls.some(call=>call.method==='arc'&&call.args[2]===30&&Math.abs(call.args[4]-Math.PI/2)<1e-9));
  const pixels=structuredClone(renderer.worldCtx.calls.filter(call=>call.method==='fillRect'));assert.ok(pixels.every(call=>call.args.every(Number.isInteger)),'Route sprites keep their original native pixel grid');
  instance.routes.completed.push(chamber.id);renderer.worldLabels=[];renderer.worldCtx.calls.length=0;renderer.puzzleObject(renderer.worldCtx,object,game);assert.ok(renderer.worldLabels.some(label=>label[0].includes('gemeistert')));assert.notDeepEqual(renderer.worldCtx.calls.filter(call=>call.method==='fillRect'),pixels);
  assert.equal(object.active,false,'Display reads the authority without marking a rune solved');
}));

test('staffel presentation uses the actual named carrier, canonical next rune and server remaining time',()=>{
  const instance=createDungeon('nachtschlund'),game=gameFor(instance),chamber=instance.routes.chambers.find(c=>c.kind==='relay');
  game.party=[{id:'carrier-1',name:'Siv'}];game.waypoint={kind:'npc',id:'mira'};instance.routes.relay={chamberId:chamber.id,actorId:'carrier-1',step:1,remaining:7.3,hold:.5,holding:false};
  const before=JSON.stringify(instance.routes),status=dungeonRoutePresentation(game);assert.equal(status.carrier,'Siv');assert.equal(status.remaining,7.3);assert.equal(status.step,1);assert.equal(status.target.id,chamber.beacons[1].id);assert.deepEqual({x:status.target.x,y:status.target.y},{x:chamber.beacons[1].x,y:chamber.beacons[1].y});assert.ok(status.detail.includes('Siv →'));assert.match(status.name,/8 s/);assert.equal(JSON.stringify(instance.routes),before);assert.deepEqual(game.waypoint,{kind:'npc',id:'mira'});
});

test('the existing rail shows one route status, avoids frame-by-frame rebuilds, and prioritizes a paused raid',()=>{
  const previous=globalThis.document,attributes={},element={dataset:{},parentElement:{classList:{toggle(){}}},setAttribute:(key,value)=>attributes[key]=value,getAttribute:key=>attributes[key]};let writes=0;Object.defineProperty(element,'innerHTML',{set(value){this.html=value;writes++;},get(){return this.html;}});globalThis.document={getElementById:()=>element};
  try{
    const instance=createDungeon('weltenkern'),game=gameFor(instance),ui=uiFor(game),chamber=instance.routes.chambers.find(c=>c.kind==='relay');instance.routes.relay={chamberId:chamber.id,actorId:'local',step:0,remaining:13.4,hold:0,holding:true};
    ui.updateEncounter();assert.equal(element.dataset.mode,'route');assert.match(element.innerHTML,/Runa →/);assert.match(attributes['aria-label'],/Folge/);instance.routes.relay.remaining=13.3;ui.updateEncounter();assert.equal(writes,1);
    game.networkRaidResume={waiting:true,ready:3,required:8};ui.updateEncounter();assert.equal(element.dataset.mode,'raid');assert.match(element.innerHTML,/Warte auf Raidgruppe · 3\/8/);assert.doesNotMatch(element.innerHTML,/Glutstaffel/);
  }finally{globalThis.document=previous;}
});

test('route journal and portrait atlas expose all actual choices while a culled boss and global walls remain mapped',()=>environment(canvas=>{
  const instance=createDungeon('weltenkern'),game=gameFor(instance),ui=uiFor(game),view=canvas();view.width=420;view.height=896;
  const fullStructures=structuredClone(instance.world.structures),boss=instance.world.enemies.find(e=>e.boss);game.networkActive=true;game.networkDungeonLayout={structures:fullStructures};game.networkDungeonCheckpoint={id:instance.id,enemies:[{...boss}],objects:instance.world.puzzleObjects.map(o=>({id:o.id,x:o.x,y:o.y,active:o.active}))};
  game.world={...instance.world,structures:[],enemies:[],puzzleObjects:[]};const html=ui.map();assert.match(html,/width="420" height="896"/);assert.equal((ui.routeGuide().match(/data-route-chamber=/g)||[]).length,6);for(const chamber of instance.routes.chambers){assert.ok(ui.routeGuide().includes(chamber.title));if(chamber.kind==='relay')assert.ok(ui.routeGuide().includes(`${chamber.seconds} Sekunden`));}
  ui.drawMap(view,true);const bossLabel=view.context.calls.find(call=>call.method==='fillText'&&call.args[0]==='Boss');assert.ok(bossLabel,'The boss has real checkpoint coordinates even when the render snapshot culls it');assert.ok(Math.abs(bossLabel.args[1]-boss.x*420/1800)<1e-8);assert.ok(Math.abs(bossLabel.args[2]-(boss.y*896/3840-9))<1e-8);
  const closedCount=view.context.calls.filter(call=>call.method==='fillRect'&&call.color==='#b49d63').length;assert.equal(closedCount,7,'Six global route gates plus the original memory gate remain visible');
  instance.routes.completed.push(instance.routes.chambers.find(c=>c.stage==='A').id);view.context.calls.length=0;ui.drawMap(view,true);assert.equal(view.context.calls.filter(call=>call.method==='fillRect'&&call.color==='#b49d63').length,4,'Clearing any first-stage path opens all three actual first-stage gate markers');assert.ok(fullStructures.filter(s=>s.type==='dungeon_route_gate').every(s=>s.blocking),'Map rendering does not edit the detached initial layout');
}));

test('legacy dungeon rendering keeps its old dimensions and never invents route progress',()=>environment(canvas=>{
  const instance=createDungeon('salzarchiv',{layoutVersion:1}),game=gameFor(instance),view=canvas(),renderer=new Renderer(view,instance.world);assert.equal(instance.world.height,1500);assert.equal(dungeonRoutePresentation(game),null);assert.equal(uiFor(game).routeGuide(),'');assert.match(uiFor(game).map(),/width="900" height="580"/);renderer.draw(game);assert.ok(renderer.terrainChunks.size>0);
}));

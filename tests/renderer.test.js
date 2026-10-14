import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, TERRAIN_CHUNK_SIZE, TERRAIN_CACHE_LIMIT, TERRAIN_CACHE_BYTES } from '../src/renderer.js';
import { makeWorld } from '../src/world.js';
import { expandWorld } from '../src/expansion.js';
import { createDungeon } from '../src/dungeons.js';
import { QUESTS } from '../src/catalog.js';

function environment(run) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const canvases = [];
  function canvas() {
    const calls = [], gradient = { addColorStop() {} };
    const c = new Proxy({ calls, createLinearGradient: () => gradient, createRadialGradient: () => gradient, measureText: value => ({ width: String(value).length * 6 }) }, {
      get(target, key) { if (key in target) return target[key]; return (...args) => { calls.push({ method: key, args }); }; },
      set(target, key, value) { target[key] = value; return true; },
    });
    const result = { width: 0, height: 0, getContext: () => c, getBoundingClientRect: () => ({ width: 1000, height: 700, left: 0, top: 0 }), parentElement: null, context: c };
    canvases.push(result); return result;
  }
  globalThis.document = { createElement: () => canvas() };
  globalThis.window = { devicePixelRatio: 1 };
  try { return run({ canvas, canvases }); } finally { globalThis.document = previous.document; globalThis.window = previous.window; }
}
const gameFor = world => ({ world, player: { id: 'local', name: 'Aren', classId: 'guardian', x: world.isDungeon ? 220 : 520, y: world.isDungeon ? 320 : 1250, face: 0, hp: 100, walking: false }, camera: null, time: 10, settings: { reducedMotion: true, shake: false }, npcs: [], questState: {}, effects: [], drops: [], projectiles: [] });

test('a huge frontier never allocates a full-world canvas and terrain LRU stays under its fixed memory budget', () => environment(({ canvas, canvases }) => {
  const world = expandWorld(makeWorld()), view = canvas(), renderer = new Renderer(view, world);
  assert.equal(renderer.background.width, 3200);
  assert.equal(renderer.background.height, 2400);
  const oldest = renderer.terrainChunk(7, 0);
  for (let i = 0; i < TERRAIN_CACHE_LIMIT + 15; i++) renderer.terrainChunk(8 + i % 28, Math.floor(i / 28));
  assert.equal(renderer.terrainChunks.size, TERRAIN_CACHE_LIMIT);
  assert.equal(renderer.terrainStats.bytes, TERRAIN_CACHE_BYTES);
  assert.equal(TERRAIN_CACHE_BYTES, 64 * 1024 * 1024);
  assert.ok(renderer.terrainStats.evictions > 0);
  assert.equal(oldest.width, 0, 'Evicted pixel buffers must be released');
  assert.ok(canvases.every(c => c === view || c.width <= 3200 && c.height <= 2400));
  assert.ok([...renderer.terrainChunks.values()].every(c => c.width === TERRAIN_CHUNK_SIZE && c.height === TERRAIN_CHUNK_SIZE));
}));

test('cached chunks are reused and a dungeon transition invalidates all old floor pixels', () => environment(({ canvas }) => {
  const overworld = expandWorld(makeWorld()), renderer = new Renderer(canvas(), overworld), legacy = renderer.background;
  const terrain = renderer.terrainChunk(7, 2);
  assert.equal(renderer.terrainChunk(7, 2), terrain);
  assert.equal(renderer.terrainStats.hits, 1);
  const dungeon = createDungeon('wurzelgewoelbe'); renderer.draw(gameFor(dungeon.world));
  assert.equal(renderer.world, dungeon.world);
  assert.equal(renderer.background, null);
  assert.equal(terrain.width, 0);
  assert.ok(renderer.terrainChunks.size > 0 && renderer.terrainChunks.size < 15);
  renderer.draw(gameFor(overworld));
  assert.equal(renderer.background, legacy, 'The original village terrain should be retained as one bounded canvas');
}));

test('every biome and dungeon renders with walls, puzzle props, allies and summons', () => environment(({ canvas }) => {
  const world = expandWorld(makeWorld()), renderer = new Renderer(canvas(), world), game = gameFor(world);
  for (const region of world.regions) {
    game.player.x = region.x + region.w / 2; game.player.y = region.y + region.h / 2;
    game.camera = { x: game.player.x, y: game.player.y }; renderer.draw(game);
  }
  for (const dungeon of ['salzarchiv', 'nachtschlund', 'weltenkern']) {
    const instance = createDungeon(dungeon), game = gameFor(instance.world); game.dungeonInstance = instance;
    game.partyPlayers = [{ id: 'ally', name: 'Rhea', classId: 'druid', x: 250, y: 320, hp: 70, maxHp: 100 }];
    game.summons = [{ x: 320, y: 340, color: '#aabbdd' }]; game.hazards = [{ kind: 'warning', x: 600, y: 600, radius: 75, windup: true }];
    for (const object of instance.world.puzzleObjects) {
      game.player.x = object.x; game.player.y = object.y; game.camera = { x: object.x, y: object.y }; renderer.draw(game);
    }
  }
  assert.ok(renderer.terrainStats.bytes <= TERRAIN_CACHE_BYTES);
}));

test('stack and spread telegraphs use exactly the authoritative damage centers and radii', () => environment(({ canvas }) => {
  const view = canvas(), renderer = new Renderer(view, makeWorld()); renderer.bounds = { x: 0, y: 0, w: 3000, h: 2400 };
  const c = view.context; c.calls.length = 0;
  renderer.telegraph(c, { type: 'storm_king', x: 1000, y: 1000, telegraphX: 450, telegraphY: 600, telegraphRadius: 115, attackTimer: .8, telegraphDuration: 1.7, telegraphMechanic: 'stack', stackRequired: 2 }, gameFor(makeWorld()));
  assert.ok(c.calls.some(call => call.method === 'ellipse' && call.args[0] === 450 && call.args[1] === 600 && call.args[2] === 115 && call.args[3] === 115));
  assert.ok(!c.calls.some(call => call.method === 'ellipse' && call.args[0] === 1000 && call.args[1] === 1000));
  c.calls.length = 0;
  renderer.telegraph(c, { type: 'world_heart', x: 1000, y: 1000, attackTimer: 1, telegraphDuration: 1.7, telegraphMechanic: 'spread', spreadTargets: [{ x: 300, y: 400 }, { x: 700, y: 800 }] }, gameFor(makeWorld()));
  for (const [x, y] of [[300, 400], [700, 800]]) assert.ok(c.calls.some(call => call.method === 'ellipse' && call.args[0] === x && call.args[1] === y && call.args[2] === 75));
}));

test('native pixel sprites select class, direction, attack pose and the metadata foot pivot', () => environment(({ canvas }) => {
  const view = canvas(), renderer = new Renderer(view, makeWorld());
  renderer.characterAtlas = { naturalWidth: 1024, naturalHeight: 384 };
  const game = gameFor(makeWorld()), player = { ...game.player, classId: 'shadowbinder', attackUntil: 10.2, face: 0 };
  view.context.calls.length = 0; renderer.person(view.context, player, game, true);
  const draw = view.context.calls.find(call => call.method === 'drawImage');
  assert.equal(draw.args[1], 13 * 32, 'East direction uses columns eight through fifteen');
  assert.equal(draw.args[2], 7 * 48, 'The eighth class occupies the eighth row');
  assert.equal(draw.args[5], -16 * 2);
  assert.equal(draw.args[6], -40 * 2);
  assert.equal(draw.args[7], 32 * 2);
  assert.equal(view.context.imageSmoothingEnabled, false);
}));

test('NPCs use their own pixel atlas and keep nearby quest labels above the world layer', () => environment(({ canvas }) => {
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());
  renderer.npcAtlas={naturalWidth:1024,naturalHeight:864};renderer.npcMetadata.npcs=['other','rowan'];
  const npc={id:'rowan',name:'Rowan',x:520,y:1250,face:Math.PI/2};
  renderer.worldLabels=[];renderer.person(renderer.worldCtx,npc,game,false);
  const draw=renderer.worldCtx.calls.find(call=>call.method==='drawImage');
  assert.equal(draw.args[2],48);assert.equal(draw.args[7],64);assert.equal(draw.args[8],96);
  assert.ok(renderer.worldLabels.some(label=>label[0]==='Rowan'));
}));

test('world pixels stay at integer 2x while text and pointer mapping retain full resolution', () => environment(({canvas}) => {
  const view=canvas(),world=makeWorld(),renderer=new Renderer(view,world),game=gameFor(world);
  game.camera={x:521.3,y:1250.7};renderer.draw(game);
  assert.equal(renderer.worldCanvas.width,500);assert.equal(renderer.worldCanvas.height,350);
  assert.equal(renderer.camera.x%2,0);assert.equal(renderer.camera.y%2,0);
  const point=renderer.worldToScreen(580,1300),inverse=renderer.screenToWorld(point.x,point.y);
  assert.equal(inverse.x,580);assert.equal(inverse.y,1300);
  const blit=view.context.calls.find(call=>call.method==='drawImage'&&call.args[0]===renderer.worldCanvas);
  assert.deepEqual(blit.args.slice(1),[0,0,1000,700]);assert.equal(view.context.imageSmoothingEnabled,false);
}));

test('dungeon gate labels keep absolute world coordinates when replayed above pixel terrain', () => environment(({canvas})=>{
  const renderer=new Renderer(canvas(),makeWorld()),game=gameFor(makeWorld());
  const gate={type:'dungeon_gate',x:1068,y:780,w:36,h:250,blocking:true};
  game.player.x=1086;game.player.y=905;renderer.worldLabels=[];
  renderer.structure(renderer.worldCtx,gate,game);
  const hint=renderer.worldLabels.find(label=>label[0]==='Löse die Erinnerungen');
  assert.deepEqual(hint.slice(1,3),[1086,905]);
}));

test('damage shakes move both pixel axes and reduced motion disables the impulse', () => environment(({canvas})=>{
  const renderer=new Renderer(canvas(),makeWorld()),game=gameFor(makeWorld());
  game.settings={shake:true,reducedMotion:false};game.shake=.35;renderer.draw(game);
  const translation=renderer.worldCtx.calls.filter(call=>call.method==='translate')[1].args;
  assert.notEqual(translation[0]+renderer.camera.x,0);assert.notEqual(translation[1]+renderer.camera.y,0);
  assert.equal((translation[0]+renderer.camera.x)%2,0);assert.equal((translation[1]+renderer.camera.y)%2,0);
  game.settings.reducedMotion=true;renderer.worldCtx.calls.length=0;renderer.draw(game);
  assert.deepEqual(renderer.worldCtx.calls.filter(call=>call.method==='translate')[1].args,[-renderer.camera.x,-renderer.camera.y]);
}));

test('an incomplete atlas falls back to a visible pixel silhouette instead of cropping away a class', () => environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());
  renderer.characterAtlas={naturalWidth:1024,naturalHeight:48};
  renderer.person(view.context,{...game.player,classId:'shadowbinder'},game,true);
  assert.equal(view.context.calls.filter(call=>call.method==='drawImage').length,0);
  assert.ok(view.context.calls.some(call=>call.method==='fillRect'));
}));

test('a ready quest takes marker priority over an earlier available quest at the same NPC', () => environment(({canvas})=>{
  const renderer=new Renderer(canvas(),makeWorld()),game=gameFor(makeWorld()),quests=QUESTS.filter(q=>q.giver==='sera');
  assert.ok(quests.length>=2);game.canAccept=q=>q.id===quests[0].id;game.questState[quests[1].id]={status:'ready'};
  renderer.worldLabels=[];renderer.npcStatus(renderer.worldCtx,{id:'sera',name:'Sera',x:520,y:1250},game);
  assert.ok(renderer.worldLabels.some(label=>label[0]==='?'));assert.ok(!renderer.worldLabels.some(label=>label[0]==='!'));
}));

test('a static camera reuses terrain chunks instead of repainting them every frame', () => environment(({ canvas }) => {
  const world = expandWorld(makeWorld()), renderer = new Renderer(canvas(), world), game = gameFor(world);
  game.player.x = 7000; game.player.y = 1200; game.camera = { x: 7000, y: 1200 };
  renderer.draw(game); const misses = renderer.terrainStats.misses;
  for (let i = 0; i < 12; i++) renderer.draw(game);
  assert.equal(renderer.terrainStats.misses, misses);
  assert.ok(renderer.terrainStats.hits >= 12);
}));

test('world interactions remain visible before activation and expose locked-state hints', () => environment(({canvas})=>{
  const world=makeWorld(),renderer=new Renderer(canvas(),world),game=gameFor(world);
  const object={id:'unopened',kind:'sealed_cache',x:520,y:1250,label:'Gruftvorrat bergen',used:false,active:false,locked:true};
  renderer.worldLabels=[];renderer.worldObject(renderer.worldCtx,object,game);
  assert.ok(renderer.worldLabels.some(label=>label[0]==='Gruftvorrat bergen'));
  assert.ok(renderer.worldLabels.some(label=>label[0]==='Versiegelt · Kette finden'));
  renderer.worldLabels=[];renderer.worldObject(renderer.worldCtx,{...object,used:true},game);
  assert.equal(renderer.worldLabels.length,0,'Consumed interactions no longer invite another reward');
}));

test('charge warnings match the attack corridor and fan warnings preserve the locked angle', () => environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());
  renderer.bounds={x:0,y:0,w:3000,h:2400};
  renderer.telegraph(view.context,{type:'glacier_ram',x:400,y:500,telegraphPattern:'charge',telegraphAngle:0,attackTimer:.5},game);
  const moves=view.context.calls.filter(call=>call.method==='moveTo'||call.method==='lineTo').map(call=>call.args);
  assert.ok(moves.some(([x,y])=>x===400&&y===535));
  assert.ok(moves.some(([x,y])=>x===400&&y===465));
  assert.ok(moves.some(([x,y])=>x>400&&y===535));
  view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'ice_spider',x:400,y:500,telegraphPattern:'fan',telegraphAngle:Math.PI/2,attackTimer:.5},game);
  const rays=view.context.calls.filter(call=>call.method==='lineTo');
  assert.ok(rays.some(call=>Math.abs(call.args[0]-400)<.0001&&call.args[1]>600),'Middle ray follows the locked southward aim');
}));

test('the dynamic darkness mask is bounded by the half-resolution viewport', () => environment(({canvas})=>{
  const renderer=new Renderer(canvas(),makeWorld()),game=gameFor(makeWorld());renderer.draw(game);
  assert.equal(renderer.lightCanvas.width,renderer.worldCanvas.width);
  assert.equal(renderer.lightCanvas.height,renderer.worldCanvas.height);
  assert.equal(renderer.lightCanvas.width,500);assert.equal(renderer.lightCanvas.height,350);
  assert.ok(renderer.lightCtx.calls.some(call=>call.method==='clearRect'));
  assert.ok(renderer.worldCtx.calls.some(call=>call.method==='drawImage'&&call.args[0]===renderer.lightCanvas));
}));

test('world object labels follow the selected interaction and active challenges keep their warning', () => environment(({canvas})=>{
  const world=makeWorld(),renderer=new Renderer(canvas(),world),game=gameFor(world);
  const first={id:'urn',kind:'urn',x:530,y:1250,label:'Aschenurne bergen',used:false,active:false};
  const second={id:'altar',kind:'altar',x:540,y:1250,label:'Bluteid opfern',used:false,active:false};
  game.nearby=()=>({object:second});renderer.worldLabels=[];
  renderer.worldObject(renderer.worldCtx,first,game);renderer.worldObject(renderer.worldCtx,second,game);
  assert.deepEqual(renderer.worldLabels.map(label=>label[0]),['Bluteid opfern']);
  assert.ok(!renderer.worldLabels.some(label=>label[0]==='E · Interagieren'));
  renderer.worldLabels=[];game.nearby=()=>null;
  renderer.worldObject(renderer.worldCtx,{...first,active:true,x:620},game);
  assert.deepEqual(renderer.worldLabels.map(label=>label[0]),['Herausforderung · Wächter besiegen']);
}));

test('world event actors render each role while hidden rewards stay invisible', () => environment(({canvas})=>{
  const world=makeWorld(),renderer=new Renderer(canvas(),world),game=gameFor(world);
  world.worldEvents=[{id:'test',state:'active',elapsed:1,warningUntil:3,objective:{label:'Schütze den Wagen',progress:2,goal:10},stageIndex:0}];
  renderer.worldLabels=[];renderer.eventWarnings=new Set();
  for(const role of ['start','rune','choice','escort','objective','reward'])renderer.worldEventObject(renderer.worldCtx,{id:`test:${role}`,eventId:'test',role,x:520,y:1250,color:'#ccbbaa',hp:50,maxHp:100,choice:'risk'},game);
  assert.ok(renderer.worldLabels.some(label=>label[0]==='HINTERHALT · 2s'));
  assert.equal(renderer.worldLabels.filter(label=>label[0]==='HINTERHALT · 2s').length,1,'Stage warnings appear once per event');
  renderer.worldCtx.calls.length=0;renderer.worldEventObject(renderer.worldCtx,{id:'hidden',role:'reward',eventId:'test',x:520,y:1250,hidden:true},game);
  assert.equal(renderer.worldCtx.calls.length,0);
}));

test('a tracked target draws a world beacon nearby and a direction marker outside the viewport', () => environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());
  game.waypointTarget=()=>({x:560,y:1250,label:'Die Trauerglocke'});renderer.draw(game);
  assert.ok(renderer.activeWaypoint);assert.ok(view.context.calls.some(call=>call.method==='fillText'&&call.args[0]==='Die Trauerglocke'));
  view.context.calls.length=0;game.waypointTarget=()=>({x:2800,y:2000,label:'Karawane der letzten Brunnen'});renderer.draw(game);
  assert.ok(view.context.calls.some(call=>call.method==='rotate'),'Offscreen marker follows the direction of the tracked target');
  assert.equal(renderer.activeWaypoint.label,'Karawane der letzten Brunnen');
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'&&String(call.args[0]).startsWith('Karawane')),'The HUD names the offscreen goal without a second floating caption');
}));

const projectileEndpoints=(calls,center,range)=>calls.filter(call=>call.method==='lineTo'&&Math.abs(Math.hypot(call.args[0]-center.x,call.args[1]-center.y)-range)<1e-6).map(call=>call.args);

test('ring warnings show the locked projectile count and rotated firing directions',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld()),center={x:400,y:500},angle=.37,range=650;
  renderer.bounds={x:0,y:0,w:3000,h:2400};view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'frost_witch',...center,telegraphPattern:'ring',telegraphProjectileCount:6,telegraphRange:range,telegraphAngle:angle,attackTimer:.5},game);
  const tips=projectileEndpoints(view.context.calls,center,range);assert.equal(tips.length,6,'A six-shot ring has six warning rays');
  for(let i=0;i<6;i++){const a=angle+i*Math.PI*2/6;assert.ok(tips.some(([x,y])=>Math.abs(x-center.x-Math.cos(a)*range)<1e-6&&Math.abs(y-center.y-Math.sin(a)*range)<1e-6));}
}));

test('champion lunge warnings use the collision corridor and the distance frozen at windup',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());renderer.bounds={x:0,y:0,w:3000,h:2400};
  view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'root_hulk_boss',x:400,y:500,telegraphPattern:'charge',telegraphChargeDistance:287,telegraphAngle:0,attackTimer:.5},game);
  const points=view.context.calls.filter(call=>['moveTo','lineTo'].includes(call.method)).map(call=>call.args);
  assert.ok(points.some(([x,y])=>x===687&&y===535));assert.ok(points.some(([x,y])=>x===687&&y===465));
  assert.ok(points.some(([x,y])=>x===687&&y===500),'The arrow ends at the announced 287-unit lunge');
}));

test('a phase-two extra fan uses its own locked angle, count and range',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld()),center={x:400,y:500};renderer.bounds={x:0,y:0,w:3000,h:2400};
  view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'frost_witch_boss',...center,telegraphPattern:'ring',telegraphProjectileCount:6,telegraphRange:650,telegraphAngle:.2,telegraphExtraFan:{angle:Math.PI/2,count:3,spread:.8,range:440,speed:260},attackTimer:.5},game);
  assert.equal(projectileEndpoints(view.context.calls,center,650).length,6);
  const tips=projectileEndpoints(view.context.calls,center,440);assert.equal(tips.length,3);
  for(const a of [Math.PI/2-.4,Math.PI/2,Math.PI/2+.4])assert.ok(tips.some(([x,y])=>Math.abs(x-center.x-Math.cos(a)*440)<1e-6&&Math.abs(y-center.y-Math.sin(a)*440)<1e-6));
}));

test('summoner warnings include the announced projectile direction',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld()),center={x:400,y:500};renderer.bounds={x:0,y:0,w:3000,h:2400};
  view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'grave_cantor',...center,telegraphPattern:'summoner',telegraphProjectileCount:1,telegraphRange:650,attackAngle:Math.PI,attackTimer:.5},game);
  const tips=projectileEndpoints(view.context.calls,center,650);assert.equal(tips.length,1);assert.ok(Math.abs(tips[0][0]+250)<1e-6);assert.ok(Math.abs(tips[0][1]-500)<1e-6);
}));

test('fan warnings use the projectile spread frozen at windup instead of the catalog default',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld()),center={x:400,y:500},angle=.4,range=320;
  renderer.bounds={x:0,y:0,w:3000,h:2400};view.context.calls.length=0;
  renderer.telegraph(view.context,{type:'ice_spider',...center,telegraphPattern:'fan',telegraphProjectileCount:3,telegraphProjectileSpread:1.2,telegraphRange:range,telegraphAngle:angle,attackTimer:.5},game);
  const tips=projectileEndpoints(view.context.calls,center,range);assert.equal(tips.length,3);
  for(const a of [angle-.6,angle,angle+.6])assert.ok(tips.some(([x,y])=>Math.abs(x-center.x-Math.cos(a)*range)<1e-6&&Math.abs(y-center.y-Math.sin(a)*range)<1e-6));
}));

test('dash sprites follow the actual dash direction while reduced motion disables afterimages',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());renderer.characterAtlas={naturalWidth:1024,naturalHeight:384};
  const p={...game.player,classId:'guardian',face:0,dashAngle:Math.PI,dashUntil:10.16};view.context.calls.length=0;renderer.person(view.context,p,game,true);
  const atlasDraws=view.context.calls.filter(call=>call.method==='drawImage'&&call.args[0]===renderer.characterAtlas);
  assert.equal(atlasDraws.length,1);assert.equal(atlasDraws[0].args[1],26*32,'West dash uses the west-facing walk pose');
  game.settings.reducedMotion=false;view.context.calls.length=0;renderer.person(view.context,p,game,true);
  assert.equal(view.context.calls.filter(call=>call.method==='drawImage'&&call.args[0]===renderer.characterAtlas).length,3,'Motion-enabled dash has only two bounded afterimages');
}));

test('PvP line and cone warnings preserve the authoritative arena attack geometry',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld());view.context.calls.length=0;
  renderer.hazard(view.context,{pvp:true,shape:'line',x:100,y:200,length:690,width:30,angle:Math.PI/2,life:.4,maxLife:.4,pending:true,color:'#d77989'},game);
  assert.ok(view.context.calls.some(call=>call.method==='moveTo'&&Math.abs(call.args[0]-85)<1e-6&&call.args[1]===200));
  assert.ok(view.context.calls.some(call=>call.method==='lineTo'&&Math.abs(call.args[0]-85)<1e-6&&call.args[1]===890));
  view.context.calls.length=0;renderer.hazard(view.context,{pvp:true,shape:'cone',x:100,y:200,length:85,arc:1.9,angle:.6,pending:true,color:'#d77989'},game);
  assert.ok(view.context.calls.some(call=>call.method==='arc'&&call.args[2]===85&&Math.abs(call.args[3]-(.6-.95))<1e-6&&Math.abs(call.args[4]-(.6+.95))<1e-6));
}));

test('arena players use hostile markers and an interior floor without overworld props',()=>environment(({canvas})=>{
  const world={...makeWorld(),isPvp:true,isDungeon:false,width:900,height:640,regions:[],rooms:[],paths:[],river:[],landmarks:[],structures:[],trees:[],rocks:[],nodes:[],plots:[],shrines:[],chests:[],enemies:[]},view=canvas(),renderer=new Renderer(view,world),game=gameFor(world);
  game.player.x=450;game.player.y=320;game.partyPlayers=[{id:'opponent',remote:true,classId:'nightblade',x:520,y:320,hp:150,maxHp:300}];renderer.draw(game);
  assert.equal(renderer.background,null);assert.equal(renderer.worldDecorations().length,0);
  assert.deepEqual(renderer.camera,{x:450,y:320},'An arena smaller than the viewport remains centred without inverted camera bounds');
  renderer.heroStatus(view.context,game.partyPlayers[0],game);assert.equal(view.context.fillStyle,'#d77989','Opponent health is hostile red');
}));

test('a mobile duel bearing follows the living offscreen opponent instead of a saved PvE waypoint',()=>environment(({canvas})=>{
  const world={...makeWorld(),isPvp:true,isDungeon:true,width:900,height:640,regions:[],rooms:[],paths:[],river:[],landmarks:[],structures:[],trees:[],rocks:[],nodes:[],plots:[],shrines:[],chests:[],enemies:[]},view=canvas(),renderer=new Renderer(view,world),game=gameFor(world);
  view.getBoundingClientRect=()=>({width:390,height:710,left:0,top:0});renderer.resize();game.worldMode='pvp';game.player.x=225;game.player.y=320;
  const savedWaypoint={kind:'npc',id:'mira',x:560,y:320,label:'Mira'},opponent={id:'duel-enemy',classId:'nightblade',x:675,y:320,hp:300,maxHp:300};
  game.waypoint=savedWaypoint;game.waypointTarget=()=>{throw new Error('PvP must not resolve an overworld waypoint');};game.otherPlayers=[{player:opponent}];game.partyPlayers=[{id:'fallen',x:800,y:320,hp:0,dead:true}];renderer.draw(game);
  assert.equal(game.waypoint,savedWaypoint,'Rendering preserves the saved exploration route');assert.equal(renderer.activeWaypoint.id,opponent.id);assert.equal(renderer.activeWaypoint.distance,450);
  assert.ok(view.context.calls.some(call=>call.method==='fillText'&&call.args[0]==='Gegner · 450 Schritte'));assert.ok(view.context.calls.some(call=>call.method==='rotate'));
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'&&String(call.args[0]).includes('Mira')));
  view.context.calls.length=0;opponent.x=300;renderer.draw(game);assert.ok(!view.context.calls.some(call=>call.method==='rotate'||call.method==='fillText'&&String(call.args[0]).startsWith('Gegner ·')),'A visible opponent needs no extra bearing');
  opponent.dead=true;opponent.hp=0;renderer.draw(game);assert.equal(renderer.activeWaypoint,null,'A defeated opponent does not leave a stale bearing');
}));

test('decorative chunks are reused, bounded, and keep interactive locations clear',()=>environment(({canvas})=>{
  const world=expandWorld(makeWorld()),renderer=new Renderer(canvas(),world);renderer.bounds={x:6000,y:1200,w:1000,h:700};
  const first=renderer.worldDecorations(),again=renderer.worldDecorations();assert.deepEqual(first,again);
  assert.ok(first.every(p=>!(world.nodes||[]).some(n=>Math.hypot(p.x-n.x,p.y-n.y)<50)));
  for(let i=0;i<80;i++){renderer.bounds={x:(i%15)*512,y:Math.floor(i/15)*512,w:512,h:512};renderer.worldDecorations();}
  assert.ok(renderer.decorationChunks.size<=TERRAIN_CACHE_LIMIT);assert.ok([...renderer.decorationChunks.values()].every(props=>props.length<=3));
}));

test('director spawn rings keep exact positions and radii and count down from the authoritative lifetime',()=>environment(({canvas})=>{
  const view=canvas(),renderer=new Renderer(view,makeWorld()),game=gameFor(makeWorld()),warning={directorId:'director-1',kind:'warning',x:920,y:1120,radius:34,life:6,maxLife:8,windup:true,color:'#c883b1'};
  view.context.calls.length=0;renderer.hazard(view.context,warning,game);
  const arcs=view.context.calls.filter(call=>call.method==='arc');assert.equal(arcs.length,2);assert.deepEqual(arcs[0].args,[920,1120,34,0,Math.PI*2]);assert.deepEqual(arcs[1].args,[920,1120,34,-Math.PI/2,0]);
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'),'The world ring does not duplicate the HUD countdown');
  const still=view.context.calls.map(call=>({...call,args:[...call.args]}));game.time+=20;view.context.calls.length=0;renderer.hazard(view.context,warning,game);assert.deepEqual(view.context.calls,still,'Reduced motion adds no decorative movement');
  warning.life=2;view.context.calls.length=0;renderer.hazard(view.context,warning,game);assert.deepEqual(view.context.calls.filter(call=>call.method==='arc')[1].args,[920,1120,34,-Math.PI/2,Math.PI]);
}));

test('mobile director bearings use the closest real marker per pack and remain bounded without text',()=>environment(({canvas})=>{
  const view=canvas();view.getBoundingClientRect=()=>({width:360,height:580,left:0,top:0});const world=makeWorld(),renderer=new Renderer(view,world),game=gameFor(world);game.player.x=1000;game.player.y=1000;renderer.camera={x:1000,y:1000};
  const warning=(id,x,y,life=8)=>({directorId:id,kind:'warning',x,y,life,maxLife:8,radius:34}),route={label:'Mira'};renderer.activeWaypoint=route;
  game.hazards=[warning('a',1250,1000),warning('a',1400,1100),warning('b',1000,650),warning('c',800,1000),warning('d',1000,1400),warning('far',1800,1000),warning('expired',900,1000,0)];
  view.context.calls.length=0;renderer.directorIndicators(view.context,game);const angles=view.context.calls.filter(call=>call.method==='rotate').map(call=>call.args[0]);assert.equal(angles.length,3);assert.deepEqual(angles.sort((a,b)=>a-b),[-Math.PI/2,0,Math.PI]);
  assert.ok(!view.context.calls.some(call=>call.method==='fillText'));assert.equal(renderer.activeWaypoint,route,'Pack bearings never replace the travel route');
  game.hazards=[warning('visible',1010,1000),warning('visible',1400,1000),warning('far',1800,1000)];view.context.calls.length=0;renderer.directorIndicators(view.context,game);assert.ok(!view.context.calls.some(call=>call.method==='rotate'),'A visible nearest marker needs no additional arrow');
  game.worldMode='pvp';game.hazards=[warning('a',1250,1000)];view.context.calls.length=0;renderer.directorIndicators(view.context,game);assert.equal(view.context.calls.length,0,'PvE signals do not leak into a duel');
}));

test('PvE elites keep their native silhouette and gain a red crown, larger HP bar and explicit name',()=>environment(({canvas})=>{
  const world=makeWorld(),view=canvas(),renderer=new Renderer(view,world),game=gameFor(world),enemy={...world.enemies[0],x:game.player.x+200,y:game.player.y,hp:100,maxHp:200,elite:true,aggro:true,level:8,name:'Aschenjäger'};
  view.context.calls.length=0;renderer.enemy(view.context,enemy,game);
  assert.ok(view.context.calls.some(call=>call.method==='ellipse'&&call.args[0]===enemy.x&&call.args[1]===enemy.y+2&&call.args[2]===27&&call.args[3]===10));
  assert.ok(view.context.calls.some(call=>call.method==='roundRect'&&call.args[2]===62&&call.args[3]===5));assert.ok(view.context.calls.some(call=>call.method==='fillText'&&call.args[0]==='Elite · Aschenjäger · 8'));
  assert.equal(enemy.hp,100);assert.equal(enemy.maxHp,200);assert.equal(enemy.x,game.player.x+200,'An elite badge never enlarges or moves the actor');
  enemy.elite=false;view.context.calls.length=0;renderer.enemy(view.context,enemy,game);assert.ok(view.context.calls.some(call=>call.method==='roundRect'&&call.args[2]===43&&call.args[3]===5));assert.ok(!view.context.calls.some(call=>call.method==='fillText'&&String(call.args[0]).startsWith('Elite')));
}));

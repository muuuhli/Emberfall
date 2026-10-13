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

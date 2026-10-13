import test from 'node:test';
import assert from 'node:assert/strict';
import { Renderer, TERRAIN_CHUNK_SIZE, TERRAIN_CACHE_LIMIT, TERRAIN_CACHE_BYTES } from '../src/renderer.js';
import { makeWorld } from '../src/world.js';
import { expandWorld } from '../src/expansion.js';
import { createDungeon } from '../src/dungeons.js';

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

test('Blender sprites select class, direction, attack pose and the metadata foot pivot', () => environment(({ canvas }) => {
  const view = canvas(), renderer = new Renderer(view, makeWorld());
  renderer.characterAtlas = { naturalWidth: 2048, naturalHeight: 768 };
  const game = gameFor(makeWorld()), player = { ...game.player, classId: 'shadowbinder', attackUntil: 10.2, face: 0 };
  view.context.calls.length = 0; renderer.person(view.context, player, game, true);
  const draw = view.context.calls.find(call => call.method === 'drawImage');
  assert.equal(draw.args[1], 13 * 64, 'East direction uses columns eight through fifteen');
  assert.equal(draw.args[2], 7 * 96, 'The eighth class occupies the eighth row');
  assert.equal(draw.args[5], -32 * 1.5);
  assert.equal(draw.args[6], -67 * 1.5);
  assert.equal(draw.args[7], 64 * 1.5);
}));

test('a static camera reuses terrain chunks instead of repainting them every frame', () => environment(({ canvas }) => {
  const world = expandWorld(makeWorld()), renderer = new Renderer(canvas(), world), game = gameFor(world);
  game.player.x = 7000; game.player.y = 1200; game.camera = { x: 7000, y: 1200 };
  renderer.draw(game); const misses = renderer.terrainStats.misses;
  for (let i = 0; i < 12; i++) renderer.draw(game);
  assert.equal(renderer.terrainStats.misses, misses);
  assert.ok(renderer.terrainStats.hits >= 12);
}));

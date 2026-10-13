import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from '../src/world.js';
import { REGIONS, QUESTS, RECIPES, ENEMY_TYPES } from '../src/content.js';
import { DUNGEONS } from '../src/dungeons.js';
import { EXPANSION_REGIONS, EXPANSION_QUESTS, EXPANSION_NPCS, EXPANSION_ENEMIES, FRONTIER_BOUNDS, expandWorld, populateSector } from '../src/expansion.js';

test('sixteen disjoint regions cover the complete frontier without shrinking the starting lands', () => {
  const regions = [...REGIONS, ...EXPANSION_REGIONS];
  assert.equal(regions.length, 16);
  assert.equal(regions.reduce((area, r) => area + r.w * r.h, 0), FRONTIER_BOUNDS.width * FRONTIER_BOUNDS.height);
  for (const [i, a] of regions.entries()) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.w <= FRONTIER_BOUNDS.width && a.y + a.h <= FRONTIER_BOUNDS.height);
    for (const b of regions.slice(i + 1)) assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y), `${a.id} overlaps ${b.id}`);
  }
  assert.equal(Math.max(...regions.map(r => r.level)), 100);
});

test('expansion dressing is deterministic, idempotent and contains all authored entrances', () => {
  const a = expandWorld(makeWorld()), b = expandWorld(makeWorld());
  assert.deepEqual(a, b);
  const before = JSON.stringify(a); expandWorld(a);
  assert.equal(JSON.stringify(a), before);
  assert.equal(a.dungeonEntrances.length, DUNGEONS.length);
  assert.ok(a.enemies.length > 300 && a.nodes.length > 600);
  assert.ok(a.trees.length < 2000, 'World generation must not allocate per-pixel actors');
  for (const entrance of a.dungeonEntrances) {
    assert.ok(a.regions.some(r => entrance.x >= r.x && entrance.x < r.x + r.w && entrance.y >= r.y && entrance.y < r.y + r.h));
    assert.ok(!a.trees.some(t => Math.hypot(t.x - entrance.x, t.y - entrance.y) < 120));
  }
});

test('a lazy sector has exactly the same encounters as eager generation', () => {
  const eager = expandWorld(makeWorld()), lazy = expandWorld(makeWorld(), { lazy: true });
  assert.equal(lazy.populatedRegions?.length || 0, 0);
  for (const region of [...EXPANSION_REGIONS].reverse()) assert.equal(populateSector(lazy, region.id), true);
  for (const key of ['nodes', 'enemies', 'chests']) {
    const byId = objects => [...objects].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(lazy[key]), byId(eager[key]), `${key} must be independent of sector load order`);
  }
  assert.equal(populateSector(lazy, EXPANSION_REGIONS[0].id), false);
  assert.equal(populateSector(lazy, 'missing-sector'), false);
});

test('sixty substantive quests form twelve valid chapters with resolvable event targets', () => {
  assert.ok(EXPANSION_QUESTS.length >= 60);
  const quests = [...QUESTS, ...EXPANSION_QUESTS], ids = new Set(quests.map(q => q.id));
  const foes = { ...ENEMY_TYPES, ...EXPANSION_ENEMIES };
  assert.equal(ids.size, quests.length);
  const kinds = new Set();
  for (const quest of EXPANSION_QUESTS) {
    assert.ok(EXPANSION_NPCS.some(n => n.id === quest.giver));
    assert.ok(quest.description.length >= 75, `${quest.id} needs concrete narrative context`);
    assert.ok(!quest.prerequisite || ids.has(quest.prerequisite));
    for (const objective of quest.objectives) {
      kinds.add(objective.kind);
      assert.ok(objective.count > 0 && objective.label.length > 10);
      if (objective.kind === 'kill') assert.ok(foes[objective.target]);
      if (objective.kind === 'craft') assert.ok(RECIPES.some(r => r.id === objective.target));
      if (['puzzle', 'dungeon', 'raid'].includes(objective.kind)) assert.ok(DUNGEONS.some(d => d.id === objective.target));
    }
  }
  for (const kind of ['explore', 'kill', 'gather', 'craft', 'farm', 'puzzle', 'dungeon', 'raid']) assert.ok(kinds.has(kind));
  for (const region of EXPANSION_REGIONS) assert.equal(EXPANSION_QUESTS.filter(q => q.region === region.id).length, 5);
});

test('outpost quests and resources have clear approaches outside foliage collision', () => {
  const world = expandWorld(makeWorld());
  for (const object of [...EXPANSION_NPCS, ...world.nodes.filter(n => n.region), ...world.chests.filter(n => n.region), ...world.plots.filter(n => n.region)]) {
    assert.ok(!world.trees.some(t => Math.hypot(t.x - object.x, t.y - object.y) < 34), `${object.id} is hidden inside a tree`);
    assert.ok(!world.rocks.some(t => Math.hypot(t.x - object.x, t.y - object.y) < 34), `${object.id} is hidden inside a rock`);
  }
});

test('regional quests unlock near their intended progression band and a level-one scout cannot cash in endgame exploration', () => {
  for (const quest of EXPANSION_QUESTS) assert.ok(Number.isInteger(quest.minLevel) && quest.minLevel >= 10 && quest.minLevel <= 100);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_sonnensteppe_1').minLevel, 10);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_mondbruch_1').minLevel, 50);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_permafrost_1').minLevel, 58);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_sandsenke_5').minLevel, 70);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_nexusriss_1').minLevel, 95);
  assert.equal(EXPANSION_QUESTS.find(q => q.id === 'q_nexusriss_5').minLevel, 100);
});

test('frontier encounter levels and actual combat/loot stats match their regions instead of inheriting a distant template level', () => {
  const world = expandWorld(makeWorld());
  for (const region of EXPANSION_REGIONS) {
    const enemies = world.enemies.filter(e => e.region === region.id); assert.ok(enemies.length > 0);
    for (const enemy of enemies) {
      assert.ok(enemy.level >= region.level && enemy.level <= region.maxLevel);
      assert.equal(enemy.lootLevel, enemy.level); assert.equal(enemy.maxHp, Math.round(90 + enemy.level * 13 + enemy.level ** 2 * .13));
      assert.equal(enemy.damage, 14 + Math.round(enemy.level * 1.8)); assert.equal(enemy.xp, Math.round(35 + enemy.level ** 2 * 2.3));
    }
  }
  const dream = world.enemies.find(e => e.region === 'traumsenke'); assert.equal(dream.level, 76); assert.notEqual(dream.lootLevel, EXPANSION_ENEMIES.void_watcher.level);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { DUNGEONS, DUNGEON_ENEMIES, DUNGEON_AFFIXES, createDungeon, interactPuzzle, updateDungeon, validateDungeonEchoes, restoreDungeonEchoes } from '../src/dungeons.js';

const near = object => [{ id: 'hero', x: object.x - 55, y: object.y, hp: 100 }];
const interact = (instance, object) => interactPuzzle(instance, object.id, near(object));
function advance(instance, players, seconds) { const events = []; for (let t = 0; t < seconds; t += .1) events.push(...updateDungeon(instance, .1, players)); return events; }
function solve(instance) {
  for (const puzzle of instance.puzzles) {
    const objects = () => instance.world.puzzleObjects.filter(o => o.puzzle === puzzle.id);
    if (puzzle.type === 'sequence') for (const symbol of puzzle.sequence) assert.equal(interact(instance, objects().find(o => o.symbol === symbol)).success, true);
    if (puzzle.type === 'switches') for (const object of objects().filter(o => puzzle.pattern[o.index])) interact(instance, object);
    if (puzzle.type === 'light') for (const object of objects()) while (object.rotation !== object.targetRotation) interact(instance, object);
    if (puzzle.type === 'crate') {
      const crate = objects().find(o => o.kind === 'crate');
      for (let move = 0; move < 4; move++) assert.equal(interact(instance, crate).success, true);
    }
    if (puzzle.type === 'pressure') advance(instance, objects().map((o, i) => ({ id: `hero-${i}`, x: o.x, y: o.y, hp: 100 })), 2.2);
    assert.equal(puzzle.solved, true, `${instance.id}:${puzzle.type} must be solvable`);
  }
}

test('eight authored dungeons include three raids with real distinct-player requirements', () => {
  assert.equal(DUNGEONS.length, 8);
  assert.deepEqual(DUNGEONS.filter(d => d.raid).map(d => d.partyRequired), [3, 4, 8]);
  for (const dungeon of DUNGEONS) {
    const instance = createDungeon(dungeon.id);
    assert.ok(DUNGEON_ENEMIES[dungeon.boss]?.boss);
    assert.equal(instance.world.enemies.filter(e => e.boss).length, 1);
    assert.equal(instance.world.structures.find(s => s.type === 'dungeon_gate').blocking, true);
    assert.equal(instance.world.chests.find(c => c.requiresBoss).locked, true);
  }
});

test('dungeon placement is reproducible and every authored puzzle opens its boss route', () => {
  for (const dungeon of DUNGEONS) {
    const a = createDungeon(dungeon.id, { seed: 88, tier: 4 });
    assert.deepEqual(a, createDungeon(dungeon.id, { seed: 88, tier: 4 }));
    solve(a);
    assert.equal(a.gateOpened, true);
    assert.equal(a.world.structures.find(s => s.type === 'dungeon_gate').blocking, false);
    assert.equal(a.eventLog.filter(e => e.event === 'puzzle').length, 1);
  }
  assert.throws(() => createDungeon('missing'), RangeError);
  assert.throws(() => createDungeon('uhrwerk', { tier: 0 }), RangeError);
  assert.throws(() => createDungeon('uhrwerk', { tier: NaN }), RangeError);
});

test('a wrong rune resets the complete sequence without opening the gate', () => {
  const instance = createDungeon('wurzelgewoelbe'), puzzle = instance.puzzles[0];
  const object = symbol => instance.world.puzzleObjects.find(o => o.symbol === symbol);
  assert.equal(interact(instance, object('mond')).success, true);
  assert.equal(puzzle.progress, 1);
  assert.equal(interact(instance, object('glut')).success, false);
  assert.equal(puzzle.progress, 0);
  assert.equal(instance.world.puzzleObjects.filter(o => o.kind === 'rune' && o.active).length, 0);
  assert.equal(instance.gateOpened, false);
  solve(instance);
  assert.equal(instance.gateOpened, true);
});

test('crate pushing follows player position, supports undo/reset and updates collision geometry', () => {
  const instance = createDungeon('salzarchiv'), puzzle = instance.puzzles[0];
  const object = kind => instance.world.puzzleObjects.find(o => o.kind === kind);
  const crate = object('crate'), start = { x: crate.x, y: crate.y };
  interact(instance, crate);
  assert.equal(crate.x, start.x + 60);
  assert.equal(instance.world.structures.find(s => s.id === crate.id).collision.x, crate.x - 20);
  interact(instance, object('undo'));
  assert.deepEqual({ x: crate.x, y: crate.y }, start);
  assert.equal(interactPuzzle(instance, crate.id, []).success, false, 'Remote interactions require a living nearby player');
  interact(instance, crate); interact(instance, object('reset'));
  assert.deepEqual({ x: crate.x, y: crate.y }, start);
  assert.equal(puzzle.history.length, 0);
  solve(instance);
});

test('cooperative entrance plates require the full simultaneous living party and reset when abandoned', () => {
  for (const definition of DUNGEONS.filter(d => d.raid)) {
    const instance = createDungeon(definition.id), puzzle = instance.puzzles.find(p => p.type === 'pressure');
    const objects = instance.world.puzzleObjects.filter(o => o.puzzle === puzzle.id);
    const party = objects.map((o, i) => ({ id: `hero-${i}`, x: o.x, y: o.y, hp: 100 }));
    advance(instance, party.slice(1), 3);
    assert.equal(puzzle.solved, false);
    advance(instance, party.map(p => ({ ...p, id: 'same-person' })), 3);
    assert.equal(puzzle.solved, false, 'A duplicated player cannot occupy multiple seals');
    advance(instance, party.map((p, i) => ({ ...p, downed: i === 0 })), 3);
    assert.equal(puzzle.solved, false, 'Downed players do not count as a living party');
    advance(instance, party, 1); advance(instance, [], .2);
    assert.equal(puzzle.hold, 0, 'Partial progress resets when the party leaves');
    advance(instance, party, 2.2);
    assert.equal(puzzle.solved, true);
  }
});

test('raid shields cannot break solo, open only after coordinated plates and close again', () => {
  for (const definition of DUNGEONS.filter(d => d.raid)) {
    const instance = createDungeon(definition.id); solve(instance);
    const boss = instance.world.enemies.find(e => e.boss);
    const plates = instance.world.puzzleObjects.filter(o => o.kind === 'boss_plate');
    advance(instance, [{ id: 'solo', ...plates[0], hp: 100 }], 3);
    assert.equal(boss.shielded, true);
    assert.equal(boss.shieldDamageMultiplier, 0);
    const party = plates.map((o, i) => ({ id: `hero-${i}`, x: o.x, y: o.y, hp: 100 }));
    while (party.length < definition.partyRequired) party.push({ id: `hero-${party.length}`, x: 1550, y: 850, hp: 100 });
    const events = advance(instance, party, 2.2);
    assert.ok(events.some(e => e.mechanic === 'shield-break'));
    assert.equal(boss.shielded, false);
    advance(instance, [], 10);
    assert.equal(boss.shielded, true);
  }
});

test('boss completion unlocks one reward chest and emits the correct quest event once', () => {
  for (const definition of DUNGEONS) {
    const instance = createDungeon(definition.id); solve(instance);
    instance.world.enemies.find(e => e.boss).alive = false;
    const events = updateDungeon(instance, .1);
    assert.equal(events.filter(e => e.event === (definition.raid ? 'raid' : 'dungeon')).length, 1);
    assert.ok(events.every(e => e.target === definition.id));
    assert.equal(instance.world.chests.find(c => c.requiresBoss).locked, false);
    assert.equal(updateDungeon(instance, .1).filter(e => ['dungeon', 'raid'].includes(e.event)).length, 0);
  }
});

test('deeper tiers increase actual damage, XP, gold, loot power levels and material rewards while tier one stays unchanged', () => {
  for (const definition of DUNGEONS) {
    const normal = createDungeon(definition.id), deep = createDungeon(definition.id, { tier: 30 });
    const low = normal.world.enemies.find(e => e.boss), high = deep.world.enemies.find(e => e.boss), base = DUNGEON_ENEMIES[definition.boss];
    assert.equal(low.maxHp, base.hp); assert.equal(low.damage, base.damage); assert.equal(low.xp, base.xp); assert.equal(low.gold, base.gold);
    assert.equal(normal.rewards.completionXp, base.xp); assert.equal(normal.rewards.completionGold, 0); assert.equal(normal.rewards.dust, 0);
    assert.equal(normal.rewards.raidSigils, definition.raid ? 1 : 0);
    assert.ok(high.maxHp > low.maxHp && high.damage > low.damage && high.xp > low.xp && high.gold > low.gold);
    assert.equal(high.lootTier, 30); assert.ok(high.lootLevel >= low.lootLevel && high.lootLevel <= 100);
    assert.ok(deep.rewards.completionXp > normal.rewards.completionXp); assert.ok(deep.rewards.dust > 0);
    const chest = deep.world.chests.find(c => c.requiresBoss); assert.equal(chest.lootTier, 30); assert.ok(chest.rewards.dust > 0);
    if (definition.raid) assert.ok(chest.rewards.raidSigil > 0 && deep.rewards.raidSigils > normal.rewards.raidSigils);
  }
});

test('depth affixes unlock at four and eight and their combat timers do not run during puzzle preparation', () => {
  assert.deepEqual(DUNGEON_AFFIXES.map(a => a.minTier), [4, 8]);
  assert.equal(createDungeon('wurzelgewoelbe', { tier: 1 }).affixes.length, 0);
  assert.equal(createDungeon('wurzelgewoelbe', { tier: 4 }).affixes.length, 1);
  const instance = createDungeon('wurzelgewoelbe', { tier: 8 });
  assert.equal(instance.affixes.length, 2);
  assert.equal(advance(instance, [{ id: 'hero', ...instance.spawn, hp: 100 }], 60).filter(e => e.mechanic?.startsWith('rift') || e.mechanic === 'echo-wave').length, 0);
  assert.equal(instance.bossTime, 0); assert.equal(instance.world.enemies.some(e => e.affixEcho), false);
});

test('rift warnings precede their real explosion and preserve the captured centers after players move', () => {
  const instance = createDungeon('wurzelgewoelbe', { tier: 4 }); solve(instance);
  const hero = { id: 'hero', x: 1470, y: 1050, hp: 100 };
  const events = advance(instance, [hero], 18.1), warning = events.find(e => e.mechanic === 'rift-warning');
  assert.ok(warning); assert.equal(warning.hazards.length, 1); assert.equal(warning.hazards[0].x, hero.x); assert.equal(warning.hazards[0].radius, 72);
  assert.equal(events.some(e => e.mechanic === 'rift-explosion'), false);
  const deadline = instance.affixState.rifts[0].explodeAt; assert.ok(deadline > instance.bossTime);
  const before = advance(instance, [{ ...hero, x: 1180 }], deadline - instance.bossTime - .3); assert.equal(before.some(e => e.mechanic === 'rift-explosion'), false);
  const blast = advance(instance, [{ ...hero, x: 1180 }], .5).find(e => e.mechanic === 'rift-explosion');
  assert.ok(blast); assert.equal(blast.zones[0].x, 1470); assert.equal(blast.zones[0].y, 1050); assert.equal(blast.zones[0].radius, warning.hazards[0].radius); assert.ok(blast.zones[0].damage > 0);
});

test('echo waves produce real attack/reward actors but cap living echoes and discard dead respawn records', () => {
  const instance = createDungeon('wurzelgewoelbe', { tier: 8 }); solve(instance);
  const party = [{ id: 'hero', x: 1470, y: 1050, hp: 100 }];
  const events = advance(instance, party, 110); assert.ok(events.some(e => e.mechanic === 'echo-wave'));
  let echoes = instance.world.enemies.filter(e => e.affixEcho); assert.equal(echoes.length, 6);
  const baseline = createDungeon(instance.id, { tier: 1 }).world.enemies.find(e => e.type === 'echo_guard');
  assert.ok(echoes.every(e => e.alive && e.damage > baseline.damage && e.xp > 0));
  const defeated = echoes[0].id; echoes[0].alive = false;
  advance(instance, party, 30); echoes = instance.world.enemies.filter(e => e.affixEcho);
  assert.equal(echoes.length, 6); assert.equal(echoes.some(e => e.id === defeated), false);
  assert.ok(instance.world.enemies.length <= 14, 'Encounter actors must not accumulate every dead echo across a long fight');
});

test('saved echo waves restore only trusted combat stats and preserve IDs, position and remaining health', () => {
  const source = createDungeon('wurzelgewoelbe', { tier: 8 }); solve(source); advance(source, [{ id: 'hero', x: 1470, y: 1050, hp: 100 }], 54);
  const snapshots = source.world.enemies.map(e => ({ id: e.id, type: e.type, affixEcho: !!e.affixEcho, alive: e.alive, x: e.x, y: e.y, level: e.level, hp: e.hp, maxHp: e.maxHp }));
  const saved = snapshots.find(e => e.affixEcho); saved.hp -= 70; saved.damage = 999999; saved.xp = 999999; saved.gold = 999999; saved.maxHp = 999999;
  assert.equal(validateDungeonEchoes(snapshots, source.id, source.tier), true);
  const restored = createDungeon(source.id, { tier: source.tier }); assert.equal(restoreDungeonEchoes(restored, snapshots), 4);
  const actor = restored.world.enemies.find(e => e.id === saved.id), original = source.world.enemies.find(e => e.id === saved.id);
  assert.equal(actor.hp, saved.hp); assert.equal(actor.x, saved.x); assert.equal(actor.y, saved.y); assert.equal(actor.maxHp, original.maxHp);
  assert.equal(actor.damage, original.damage); assert.equal(actor.xp, original.xp); assert.equal(actor.gold, original.gold); assert.equal(restored.affixState.wave, 2);
  assert.equal(restoreDungeonEchoes(restored, snapshots), 4); assert.equal(restored.world.enemies.filter(e => e.affixEcho).length, 4, 'Repeated restoration must not duplicate actors');
});

test('invalid saved echoes are rejected before mutating the target dungeon', () => {
  const source = createDungeon('wurzelgewoelbe', { tier: 8 }); solve(source); advance(source, [{ id: 'hero', x: 1470, y: 1050, hp: 100 }], 27);
  const valid = source.world.enemies.filter(e => e.affixEcho).map(e => ({ id: e.id, type: e.type, affixEcho: true, alive: true, x: e.x, y: e.y, level: e.level, hp: e.hp }));
  for (const mutate of [
    entries => { entries[0].id = 'outside:affix-echo-1-0'; },
    entries => { entries[0].type = 'world_heart'; },
    entries => { entries[0].level = 100; },
    entries => { entries[0].hp = 1e9; },
    entries => { entries[0].x = -1; },
    entries => { entries[0].affixEcho = false; },
    entries => { entries.push({ ...entries[0] }); },
    entries => { for (let wave = 2; wave <= 6; wave++) entries.push({ ...entries[0], id: `wurzelgewoelbe:affix-echo-${wave}-0` }); },
  ]) {
    const target = createDungeon('wurzelgewoelbe', { tier: 8 }), before = JSON.stringify(target); const invalid = structuredClone(valid); mutate(invalid);
    assert.throws(() => validateDungeonEchoes(invalid, target.id, target.tier)); assert.throws(() => restoreDungeonEchoes(target, invalid)); assert.equal(JSON.stringify(target), before);
  }
  assert.throws(() => validateDungeonEchoes(valid, source.id, 1));
});

function reachable(instance) {
  const step = 20, width = instance.world.width / step, height = instance.world.height / step;
  const occupied = (x, y) => instance.world.structures.some(s => {
    if (!s.blocking) return false;
    const b = s.collision; return x + 12 > b.x && x - 12 < b.x + b.w && y + 12 > b.y && y - 12 < b.y + b.h;
  });
  const visited = new Set(), start = Math.floor(instance.spawn.y / step) * width + Math.floor(instance.spawn.x / step), queue = [start]; visited.add(start);
  for (let head = 0; head < queue.length; head++) {
    const index = queue[head], x = index % width, y = Math.floor(index / width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, next = ny * width + nx;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height || visited.has(next)) continue;
      if (occupied(nx * step, ny * step) || occupied((x + dx / 2) * step, (y + dy / 2) * step)) continue;
      visited.add(next); queue.push(next);
    }
  }
  return (object, radius = 75) => [...visited].some(index => Math.hypot(index % width * step - object.x, Math.floor(index / width) * step - object.y) < radius);
}

test('entrance, exit, puzzle objects and all pre-boss encounters remain reachable behind closed gates', () => {
  for (const definition of DUNGEONS) {
    const instance = createDungeon(definition.id), approach = reachable(instance);
    for (const target of [instance.exit, ...instance.world.puzzleObjects.filter(o => o.kind !== 'boss_plate'), ...instance.world.nodes, ...instance.world.shrines, ...instance.world.chests.filter(c => !c.locked), ...instance.world.enemies.filter(e => !e.boss)]) assert.equal(approach(target), true, `${definition.id}: ${target.id} must have a pre-boss approach`);
    assert.equal(approach(instance.world.enemies.find(e => e.boss)), false, 'The boss room must stay gated until its puzzles are solved');
    solve(instance);
    assert.equal(reachable(instance)(instance.world.enemies.find(e => e.boss)), true, 'A solved gate must admit the player to the boss');
  }
});

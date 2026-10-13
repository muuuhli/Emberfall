import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SAVE_KEY } from '../src/game.js';
import { CLASSES, getClass } from '../src/classes.js';
import { DUNGEONS, updateDungeon } from '../src/dungeons.js';
import { cumulativeXp } from '../src/progression.js';
import { generateLoot, computeItemStats, computeSetBonuses, salvageYield } from '../src/loot.js';

const clone = value => JSON.parse(JSON.stringify(value));
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)) }; }
function fresh(classId = 'guardian', memory = storage()) {
  const game = new Game({ storage: memory, random: () => .5 }); game.start();
  if (game.player.level === 1 && game.player.classId !== classId) assert.equal(game.selectClass(classId), true);
  return game;
}
function checkpoint(game) { const result = clone(game.capture()); delete result.savedAt; return result; }
function arena(classId) {
  const game = fresh(classId); game.player.level = 40;
  game.world = { ...game.world, width: 2400, height: 2400, trees: [], rocks: [], structures: [], walls: [], nodes: [], chests: [], shrines: [], plots: [], dungeonEntrances: [] };
  game.player.x = 900; game.player.y = 900; game.player.face = 0; game.player.hp = game.stats().maxHp; game.player.mana = game.stats().mana;
  game.world.enemies = [{ id: 'test-foe', type: 'wolf', x: 970, y: 900, homeX: 970, homeY: 900, hp: 50000, maxHp: 50000, alive: true, phase: 'idle', attackTimer: 999, respawnAt: 0, level: 40 }];
  return game;
}
function advance(game, seconds, party = [game]) { for (let t = 0; t < seconds; t += .04) { game.update(.04, { simulateWorld: false }); game.updateWorld(.04, party); } }
function enter(id, level = 100, memory = storage()) {
  const game = fresh('guardian', memory), definition = DUNGEONS.find(d => d.id === id);
  game.player.level = level; game.player.x = definition.entrance.x; game.player.y = definition.entrance.y;
  assert.equal(game.enterDungeon(id), true); return game;
}
function interactObject(game, object) {
  game.player.x = object.x - 50; game.player.y = object.y;
  assert.equal(game.collides(game.player.x, game.player.y), false, `Interaction approach to ${object.id} must be physically valid`);
  assert.equal(game.nearby()?.kind, 'puzzle'); assert.equal(game.nearby()?.object.id, object.id);
  game.interact();
}
function rune(game, symbol) { return game.world.puzzleObjects.find(o => o.symbol === symbol); }

test('all eight classes apply their basic attack through the real Game combat loop', () => {
  for (const cls of CLASSES) {
    const game = arena(cls.id), enemy = game.world.enemies[0], before = enemy.hp;
    assert.equal(game.action('attack'), true, `${cls.name} attack must start`);
    if (cls.abilities.attack.kind === 'projectile') {
      assert.equal(game.projectiles.length, 1); assert.ok(game.projectiles[0].damage > 0); advance(game, .3);
    }
    assert.ok(enemy.hp < before, `${cls.name} must damage an actual enemy`);
    assert.ok(game.cooldowns.attack > 0 || cls.abilities.attack.cooldown <= .3);
  }
});

test('guardian shields absorb damage and paladin/druid healing reaches nearby allies', () => {
  const guardian = arena('guardian'); assert.equal(guardian.action('bolt'), true);
  const hp = guardian.player.hp, shield = guardian.player.shield;
  assert.ok(shield > 0); guardian.damagePlayer(50);
  assert.equal(guardian.player.hp, hp); assert.ok(guardian.player.shield < shield);
  assert.equal(guardian.world.enemies[0].targetId, guardian.player.id || 'local');
  for (const id of ['paladin', 'druid']) {
    const healer = arena(id), ally = arena('guardian'); ally.player.x = 925; ally.player.hp = 10;
    healer.partyGames = [healer, ally]; healer.player.hp = 20;
    assert.equal(healer.action('bolt'), true); assert.ok(healer.player.hp > 20); assert.ok(ally.player.hp > 10, `${id} must heal a nearby human ally`);
  }
});

test('ranger and frostweaver traps damage and slow enemies, nightblade moves and strikes, shadowbinder summons fight', () => {
  for (const id of ['ranger', 'frostweaver']) {
    const game = arena(id), enemy = game.world.enemies[0]; assert.equal(game.action('nova'), true);
    assert.equal(game.hazards.length, 1); const before = enemy.hp; advance(game, .08);
    assert.ok(enemy.hp < before, `${id} trap must deal damage`); assert.ok(enemy.slowUntil > game.time);
  }
  const rogue = arena('nightblade'), x = rogue.player.x, before = rogue.world.enemies[0].hp;
  assert.equal(rogue.action('bolt'), true); assert.ok(rogue.player.x > x); assert.ok(rogue.world.enemies[0].hp < before);
  const binder = arena('shadowbinder'), target = binder.world.enemies[0], health = target.hp;
  assert.equal(binder.action('nova'), true); assert.equal(binder.summons.length, 2); advance(binder, 1.2);
  assert.ok(target.hp < health, 'A summoned spirit must deal real combat damage');
  binder.cooldowns.bolt = 0; binder.player.hp = 10; assert.equal(binder.action('bolt'), true); advance(binder, .5);
  assert.ok(binder.player.hp > 10, 'Seelenentzug must restore health after hitting a target');
});

test('a flamecaller fireball damages the primary target and enemies inside its advertised splash radius', () => {
  const game = arena('flamecaller'), primary = game.world.enemies[0];
  const neighbor = { ...primary, id: 'nearby-foe', y: primary.y + 35, homeY: primary.y + 35 };
  game.world.enemies.push(neighbor); const before = neighbor.hp;
  assert.equal(game.action('bolt'), true); advance(game, .3);
  assert.ok(primary.hp < primary.maxHp); assert.ok(neighbor.hp < before, 'Feuerball must explode around its impact, as its class profile specifies');
});

test('the druid Circle of Life continues regenerating the group after the initial heal', () => {
  const game = arena('druid'), ally = arena('guardian'); ally.player.x = 925; ally.player.hp = 1;
  game.partyGames = [game, ally]; assert.equal(game.action('nova'), true);
  const immediate = ally.player.hp; assert.ok(immediate > 1 && immediate < ally.stats().maxHp);
  advance(game, 1, [game, ally]);
  assert.ok(ally.player.hp > immediate, 'Kreis des Lebens must provide its advertised duration-based regeneration');
});

test('flamecaller Inferno keeps burning its area after the initial blast and expires after its duration', () => {
  const game = arena('flamecaller'), enemy = game.world.enemies[0]; assert.equal(game.action('nova'), true);
  const immediate = enemy.hp; assert.ok(immediate < enemy.maxHp); assert.ok(game.hazards.some(h => h.kind === 'burn'));
  advance(game, 1.2); assert.ok(enemy.hp < immediate, 'Inferno must deal periodic fire damage');
  advance(game, 4); assert.equal(game.hazards.some(h => h.kind === 'burn'), false);
  const finished = enemy.hp; advance(game, 1.2); assert.equal(enemy.hp, finished, 'An expired fire zone must not keep damaging enemies');
});

test('talent learning enforces class ownership, prerequisites and actual level unlocks', () => {
  for (const cls of CLASSES) {
    const game = fresh(cls.id); game.player.skillPoints = 50;
    const foreign = CLASSES.find(c => c.id !== cls.id).talents[0]; assert.equal(game.learn(foreign.id), false);
    const root = cls.talents.find(t => !t.requires && t.minLevel === 1); assert.equal(game.learn(root.id), true);
    const advanced = cls.talents.find(t => t.minLevel >= 12); if (advanced.requires) game.skills[advanced.requires] = 1;
    assert.equal(game.learn(advanced.id), false, `${advanced.name} must not unlock before its level`);
    game.player.level = advanced.minLevel; assert.equal(game.learn(advanced.id), true);
    assert.equal(game.selectClass(foreign.classId), false, 'A developed class cannot be swapped to borrow another tree');
  }
});

test('actual experience gain reaches level 100, grants all level rewards and survives version-two storage', () => {
  const memory = storage(), game = fresh('frostweaver', memory), points = game.player.skillPoints;
  game.gainXp(cumulativeXp(100)); assert.equal(game.player.level, 100); assert.equal(game.player.skillPoints, points + 99 * 2); assert.equal(game.player.xp, 0);
  game.gainXp(1e9); assert.equal(game.player.level, 100); assert.equal(game.player.xp, 0); assert.equal(game.capture().version, 2);
  assert.equal(game.save(false), true); const restored = fresh('frostweaver', memory);
  assert.equal(restored.player.level, 100); assert.equal(restored.player.classId, 'frostweaver'); assert.equal(restored.player.skillPoints, game.player.skillPoints);
  assert.equal(restored.stats().maxHp, game.stats().maxHp);
});

test('instanced set equipment, sockets and upgrades survive reload and salvage returns its gems once', () => {
  const memory = storage(), game = fresh('guardian', memory); game.player.level = 60; game.resources.ruby = 1; game.resources.dust = 100;
  const gear = ['iron_longsword', 'ashen_plate', 'ember_locket'].map((baseId, i) => generateLoot({ level: 60, classId: 'guardian', baseId, rarity: 'legendary', rng: () => .5, uid: `roundtrip-${i}` }));
  for (const item of gear) { assert.equal(game.addItem(item), true); assert.equal(game.equip(item.id), true); }
  assert.equal(gear.every(item => item.setId === 'ashen_oath'), true); assert.ok(computeSetBonuses(gear).armor > 0);
  const damage = game.stats().damage; assert.equal(game.socket(gear[0].id, 'ruby'), true); assert.equal(game.upgradeItem(gear[0].id), true);
  assert.ok(game.stats().damage > damage); assert.equal(game.resources.ruby, 0); assert.equal(game.resources.dust, 92);
  const expectedStats = game.stats(), expectedItemStats = computeItemStats(gear[0]); game.save(false);
  const restored = fresh('guardian', memory); assert.deepEqual(restored.stats(), expectedStats); assert.deepEqual(restored.itemStats(gear[0].id), expectedItemStats);
  assert.equal(restored.salvage(gear[0].id), false, 'Equipped gear must not be dismantled'); assert.equal(restored.equip('rusty_blade'), true);
  const materials = salvageYield(restored.item(gear[0].id)), resources = { ...restored.resources };
  assert.equal(restored.salvage(gear[0].id), true);
  for (const [id, amount] of Object.entries(materials)) assert.equal(restored.resources[id], (resources[id] || 0) + amount);
  assert.equal(restored.salvage(gear[0].id), false, 'A consumed item must not return materials twice');
  const final = fresh('guardian', memory); assert.equal(final.inventory[gear[0].id] || 0, 0); assert.deepEqual(final.resources, restored.resources);
});

test('long loot sessions bound the bag to 240 instances and remove sold/salvaged metadata before saving', () => {
  const memory = storage(), game = fresh('guardian', memory); game.player.level = 100;
  const rolled = Array.from({ length: 242 }, (_, i) => generateLoot({ level: 100, classId: 'guardian', rarity: 'common', rng: () => .5, uid: `bag-${i}` }));
  for (const item of rolled.slice(0, 240)) assert.equal(game.addItem(item), true);
  assert.equal(game.bagUsed(), 240); assert.equal(game.addItem(rolled[240]), false); assert.equal(game.item(rolled[240].id), null);
  assert.equal(Object.keys(game.generatedItems).length, 240);
  assert.equal(game.sell(rolled[0].id), true); assert.equal(game.item(rolled[0].id), null); assert.equal(game.bagUsed(), 239);
  assert.equal(game.addItem(rolled[240]), true); assert.equal(game.salvage(rolled[1].id), true); assert.equal(game.item(rolled[1].id), null);
  assert.equal(game.addItem(rolled[241]), true); assert.equal(game.bagUsed(), 240); assert.equal(Object.keys(game.generatedItems).length, 240);
  game.save(false); const restored = fresh('guardian', memory);
  assert.equal(restored.bagUsed(), 240); assert.equal(Object.keys(restored.generatedItems).length, 240); assert.equal(restored.item(rolled[0].id), null); assert.equal(restored.item(rolled[1].id), null);
});

test('a full bag leaves personal rare drops on the ground and does not consume an unopened chest', () => {
  const game = arena('guardian'); game.player.level = 100; game.world.enemies = [];
  for (let i = 0; i < 240; i++) assert.equal(game.addItem(generateLoot({ level: 100, rarity: 'common', rng: () => .5, uid: `full-${i}` })), true);
  const item = generateLoot({ level: 100, rarity: 'legendary', rng: () => .5, uid: 'waiting-legendary' });
  game.drops.push({ x: game.player.x, y: game.player.y, item: item.id, loot: item, ownerId: 'local', life: 120 });
  game.updateWorld(.04, [game]); assert.equal(game.drops.length, 1); assert.ok(game.drops[0].life > 0); assert.equal(game.item(item.id), null);
  const chest = { id: 'full-bag-chest', x: game.player.x, y: game.player.y, opened: false }; game.world.chests = [chest];
  assert.equal(game.nearby()?.kind, 'chest'); game.interact(); assert.equal(chest.opened, false);
  const first = Object.keys(game.generatedItems)[0]; assert.equal(game.salvage(first), true); game.updateWorld(.04, [game]);
  assert.equal(game.drops.length, 0); assert.equal(game.inventory[item.id], 1); assert.equal(game.bagUsed(), 240);
});

test('dungeon portals require physical approach and level, switch worlds, and E solves the gate without remote NPC dialogue', () => {
  const game = fresh(), definition = DUNGEONS[0], overworld = game.world;
  game.player.level = 100; assert.equal(game.enterDungeon(definition.id), false, 'A portal must not be a global teleport command');
  game.player.x = definition.entrance.x; game.player.y = definition.entrance.y; game.player.level = 1;
  assert.equal(game.enterDungeon(definition.id), false, 'The dungeon must enforce its entry level');
  game.player.level = definition.minLevel; assert.equal(game.enterDungeon(definition.id), true); assert.notEqual(game.world, overworld); assert.deepEqual(game.npcs, []);
  let dialogues = 0; game.onDialogue = () => dialogues++;
  const gate = game.world.structures.find(s => s.type === 'dungeon_gate'), gatePoint = { x: gate.x + gate.w / 2, y: gate.y + gate.h / 2 };
  assert.equal(game.collides(gatePoint.x, gatePoint.y), true);
  for (const symbol of game.dungeonInstance.puzzles[0].sequence) interactObject(game, rune(game, symbol));
  assert.equal(game.collides(gatePoint.x, gatePoint.y), false); assert.equal(game.ledger[`puzzle:${definition.id}`], 1); assert.equal(dialogues, 0);
  assert.equal(game.exitDungeon(), true); assert.equal(game.world, overworld); assert.equal(game.player.x, definition.entrance.x); assert.equal(game.player.y, definition.entrance.y);
});

test('saving inside a dungeon restores partial rune, lens and crate state rather than visually resetting the puzzle', () => {
  for (const id of ['wurzelgewoelbe', 'dornenkloster', 'salzarchiv']) {
    const memory = storage(), game = enter(id, 100, memory);
    const object = game.world.puzzleObjects.find(o => o.kind === ({ wurzelgewoelbe: 'rune', dornenkloster: 'lens', salzarchiv: 'crate' })[id]);
    if (id === 'wurzelgewoelbe') interactObject(game, rune(game, 'mond')); else interactObject(game, object);
    const expected = clone(game.world.puzzleObjects); game.save(false);
    const restored = fresh('guardian', memory); assert.equal(restored.dungeonInstance?.id, id);
    assert.deepEqual(restored.world.puzzleObjects, expected, `${id} props must retain their actual positions, orientation and active states`);
    if (id === 'wurzelgewoelbe') { assert.equal(restored.dungeonInstance.puzzles[0].progress, 1); interactObject(restored, rune(restored, 'blatt')); interactObject(restored, rune(restored, 'glut')); assert.equal(restored.dungeonInstance.gateOpened, true); }
    if (id === 'salzarchiv') {
      const crate = restored.world.puzzleObjects.find(o => o.kind === 'crate'), collision = restored.world.structures.find(s => s.id === crate.id).collision;
      assert.equal(collision.x, crate.x - 20); assert.equal(collision.y, crate.y - 20);
      for (let i = 0; i < 3; i++) interactObject(restored, crate); assert.equal(restored.dungeonInstance.gateOpened, true);
    }
  }
});

test('a defeated dungeon boss keeps its reward chest unlocked across reload and does not grant a second completion', () => {
  const memory = storage(), game = enter('wurzelgewoelbe', 100, memory);
  for (const symbol of game.dungeonInstance.puzzles[0].sequence) interactObject(game, rune(game, symbol));
  const boss = game.world.enemies.find(e => e.boss); game.killEnemy(boss); game.updateWorld(.04, [game]);
  assert.equal(game.dungeonInstance.bossDefeated, true); assert.equal(game.world.chests.find(c => c.requiresBoss).locked, false);
  const completions = game.dungeonRecords.wurzelgewoelbe.runs; game.save(false);
  const restored = fresh('guardian', memory); assert.equal(restored.world.chests.find(c => c.requiresBoss).locked, false);
  restored.updateWorld(.04, [restored]); assert.equal(restored.dungeonRecords.wurzelgewoelbe.runs, completions);
});

test('legacy version-one characters retain their journey, talents, quests and equipment in version two', () => {
  const source = fresh(); source.player.level = 18; source.player.gold = 999; source.resources.ore = 37; source.skills.guardian_vigor = 2; source.skills.arcane_fire = 1;
  source.questState.q_hainwacht = { status: 'done', counts: [4] }; source.inventory.forest_blade = 1; source.equipment.weapon = 'forest_blade';
  const legacy = checkpoint(source); legacy.version = 1;
  for (const key of ['generatedItems', 'lootPity', 'lootSerial', 'dungeonRecords', 'dungeon']) delete legacy[key]; delete legacy.player.classId;
  const memory = storage(); memory.setItem(SAVE_KEY, JSON.stringify(legacy)); const restored = fresh('guardian', memory);
  assert.equal(restored.player.level, 18); assert.equal(restored.player.gold, 999); assert.equal(restored.resources.ore, 37);
  assert.equal(restored.skills.guardian_vigor, 2); assert.equal(restored.skills.arcane_fire, 1); assert.equal(restored.questState.q_hainwacht.status, 'done'); assert.equal(restored.equipment.weapon, 'forest_blade'); assert.equal(restored.capture().version, 2);
});

test('invalid instanced loot and dungeon checkpoints are rejected atomically before changing the running journey', async () => {
  const game = enter('salzarchiv'); const crate = game.world.puzzleObjects.find(o => o.kind === 'crate'); interactObject(game, crate);
  game.player.gold = 4321; const before = checkpoint(game);
  const item = generateLoot({ level: 80, rarity: 'legendary', uid: 'corrupt-checkpoint', rng: () => .5 }); item.stats.damage = 1e9;
  const loot = clone(before); loot.player.gold = 0; loot.generatedItems[item.id] = item;
  assert.equal(await game.importSave({ text: async () => JSON.stringify(loot) }), false); assert.deepEqual(checkpoint(game), before);
  const invalid = clone(before); invalid.dungeon.puzzles[0].objects = null; invalid.player.gold = 0;
  assert.equal(await game.importSave({ text: async () => JSON.stringify(invalid) }), false); assert.deepEqual(checkpoint(game), before);
});

function deepDungeon(tier, memory = storage()) {
  const game = fresh('guardian', memory), definition = DUNGEONS[0]; game.player.level = 100;
  game.dungeonRecords[definition.id] = { runs: tier - 1, bestTier: tier - 1, bestTime: 100 };
  game.player.x = definition.entrance.x; game.player.y = definition.entrance.y; assert.equal(game.enterDungeon(definition.id, tier), true);
  for (const symbol of game.dungeonInstance.puzzles[0].sequence) interactObject(game, rune(game, symbol));
  game.player.x = 1470; game.player.y = 1050; game.player.hp = game.stats().maxHp; game.player.invulnerable = 0;
  return game;
}

test('depth-four rift warnings deal real damage after windup and can be avoided by leaving the marked area', () => {
  for (const escape of [false, true]) {
    const game = deepDungeon(4), boss = game.world.enemies.find(e => e.boss); boss.attackTimer = 999;
    game.world.enemies = [boss];
    advance(game, 18.1); assert.ok(game.hazards.some(h => h.kind === 'warning')); const hp = game.player.hp;
    if (escape) game.player.x = 1180;
    advance(game, 1.8);
    assert.equal(game.player.hp < hp, !escape, 'Only remaining in the actual marked circle should deal rift damage');
  }
});

test('a deep-dungeon checkpoint preserves living echo waves and pending rift deadlines; forged echoes reject atomically', async () => {
  const memory = storage(), game = deepDungeon(8, memory);
  // Advance the dungeon simulation independently of attack execution so the
  // checkpoint deliberately contains a known active wave and pending warning.
  for (let elapsed = 0; elapsed < 54.3; elapsed += .1) updateDungeon(game.dungeonInstance, .1, [game.player]);
  const echoes = game.world.enemies.filter(e => e.affixEcho); assert.equal(echoes.length, 4);
  echoes[0].hp -= 25; assert.ok(game.dungeonInstance.affixState.rifts.length > 0); game.save(false);
  const restored = fresh('guardian', memory), returned = restored.world.enemies.filter(e => e.affixEcho);
  assert.equal(returned.length, 4); assert.deepEqual(returned.map(e => [e.id, e.hp, e.damage, e.xp]), echoes.map(e => [e.id, e.hp, e.damage, e.xp]));
  assert.equal(restored.dungeonInstance.bossTime, game.dungeonInstance.bossTime); assert.deepEqual(restored.dungeonInstance.affixState, game.dungeonInstance.affixState);
  assert.ok(restored.hazards.some(h => h.kind === 'warning' && h.life > 0));
  const before = checkpoint(restored), invalid = clone(before); invalid.dungeon.enemies.find(e => e.affixEcho).hp = 1e9;
  assert.equal(await restored.importSave({ text: async () => JSON.stringify(invalid) }), false); assert.deepEqual(checkpoint(restored), before);
});

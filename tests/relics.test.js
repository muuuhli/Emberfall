import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../src/classes.js';
import { Game, SAVE_KEY } from '../src/game.js';
import { ITEMS } from '../src/catalog.js';
import { RARITIES, generateLoot, computeItemStats, validateLootItem } from '../src/loot.js';
import { getArsenalShopStock, EXTRA_RECIPES } from '../src/arsenal.js';
import { getEquipmentShopStock } from '../src/equipment-system.js';
import { BESTIARY_ENEMIES } from '../src/bestiary.js';
import { RELICS, RELIC_DROP_CHANCES, RELIC_IDS, relicDropChances, rollRelic, getRelic, validateRelicItem, relicPresentation, resolveRelicProc } from '../src/relics.js';

const clone = value => JSON.parse(JSON.stringify(value));
const seeded = initial => { let seed = initial; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };
const contexts = {
  enemy: { kind: 'enemy', enemyId: 'obsidian_knight', dungeonId: null },
  boss: { kind: 'boss', enemyId: 'obsidian_knight_boss', dungeonId: null },
  dungeon_boss: { kind: 'dungeon_boss', enemyId: 'chronar', dungeonId: 'uhrwerk' },
};
let serial = 0;
function sealed({ id = 'moon_seal', level = 100, context = contexts.enemy, classId = 'guardian', baseId = 'iron_longsword', ...options } = {}) {
  const chance = RELIC_DROP_CHANCES[context.kind];
  const roll = id === 'star_seal' ? chance.star_seal / 2 : chance.star_seal + chance.moon_seal / 2;
  const item = generateLoot({ level, classId, baseId, rarity: 'rare', source: context.enemyId, relicOrigin: context, rng: () => roll, uid: `relic-test-${++serial}`, ...options });
  assert.equal(item.relic?.id, id);
  assert.equal(validateLootItem(item), true);
  return item;
}

test('two original seals expose fixed small encounter chances and immutable horizontal effects', () => {
  assert.deepEqual(RELIC_IDS, ['moon_seal', 'star_seal']);
  assert.equal(RELICS.moon_seal.minLevel, 20);
  assert.equal(RELICS.star_seal.minLevel, 45);
  assert.ok(RELICS.moon_seal.color !== RELICS.star_seal.color && RELICS.moon_seal.aura !== RELICS.star_seal.aura);
  for (const definition of Object.values(RELICS)) {
    assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.proc));
    assert.equal(definition.stats, undefined, 'A seal does not add unbounded combat stats.');
    assert.ok(definition.cooldown >= 12);
  }
  assert.deepEqual(RELIC_DROP_CHANCES.enemy, { moon_seal: .0008, star_seal: .00015 });
  assert.deepEqual(RELIC_DROP_CHANCES.boss, { moon_seal: .008, star_seal: .002 });
  assert.deepEqual(RELIC_DROP_CHANCES.dungeon_boss, { moon_seal: .012, star_seal: .003 });
  for (const chances of Object.values(RELIC_DROP_CHANCES)) assert.ok(chances.moon_seal + chances.star_seal < .02);
  assert.equal(RARITIES.legendary.weight, .002); assert.equal(RARITIES.legendary.bossWeight, .03);
});

test('chance intervals have exact exclusive boundaries and respect both level gates', () => {
  const item = sealed();
  for (const context of Object.values(contexts)) {
    const candidate = { ...item, source: context.enemyId, dungeonTier: 1 }, chance = RELIC_DROP_CHANCES[context.kind];
    assert.deepEqual(relicDropChances(candidate, context), chance);
    assert.equal(rollRelic(candidate, context, () => 0).id, 'star_seal');
    assert.equal(rollRelic(candidate, context, () => chance.star_seal - Number.EPSILON).id, 'star_seal');
    assert.equal(rollRelic(candidate, context, () => chance.star_seal).id, 'moon_seal');
    assert.equal(rollRelic(candidate, context, () => chance.star_seal + chance.moon_seal - Number.EPSILON).id, 'moon_seal');
    assert.equal(rollRelic(candidate, context, () => chance.star_seal + chance.moon_seal), null);
    assert.equal(rollRelic(candidate, context, () => 1), null);
    for (const value of [NaN, Infinity, -.01, 1.01]) assert.throws(() => rollRelic(candidate, context, () => value), TypeError);
  }
  assert.deepEqual(relicDropChances({ ...item, level: 19 }, contexts.enemy), { moon_seal: 0, star_seal: 0 });
  const early = { ...item, level: 20 };
  assert.deepEqual(relicDropChances(early, contexts.enemy), { moon_seal: .0008, star_seal: 0 });
  assert.equal(rollRelic(early, contexts.enemy, () => 0).id, 'moon_seal');
  assert.equal(rollRelic({ ...item, level: 44 }, contexts.enemy, () => 0).id, 'moon_seal');
  assert.equal(rollRelic({ ...item, level: 45 }, contexts.enemy, () => 0).id, 'star_seal');
});

test('shops, crafting, caches and invented encounters never roll a seal or consume its random draw', () => {
  const item = sealed();
  let called = 0;
  const rng = () => { called++; return 0; };
  const blocked = [
    undefined, null, { kind: 'shop', enemyId: 'obsidian_knight' }, { kind: 'craft', enemyId: 'obsidian_knight' },
    { kind: 'enemy', enemyId: 'constructor' }, { kind: 'enemy', enemyId: '__proto__' }, { kind: ['enemy'], enemyId: 'obsidian_knight' },
    { kind: 'enemy', enemyId: 'obsidian_knight_boss' }, { kind: 'boss', enemyId: 'obsidian_knight' },
    { kind: 'boss', enemyId: 'chronar' }, { kind: 'dungeon_boss', enemyId: 'chronar', dungeonId: 'salzarchiv' },
    { kind: 'dungeon_boss', enemyId: 'obsidian_knight_boss', dungeonId: 'uhrwerk' },
  ];
  for (const context of blocked) assert.equal(rollRelic(item, context, rng), null);
  for (const source of ['world', 'chest', 'cursed_chest', 'sealed_cache', 'sarcophagus', 'forge_forest', 'prepare_grave_red_vial', 'boss:obsidian_knight']) {
    assert.equal(rollRelic({ ...item, source }, contexts.enemy, rng), null);
    const generated = generateLoot({ level: 100, rarity: 'rare', baseId: 'iron_longsword', source, relicOrigin: contexts.enemy, rng: () => 0, uid: `blocked-${++serial}` });
    assert.equal(generated.relic, undefined);
  }
  for (const recipe of EXTRA_RECIPES.filter(recipe => ITEMS[recipe.output]?.type === 'weapon')) {
    const crafted = generateLoot({ level: 100, classId: ITEMS[recipe.output].classIds?.[0] || 'guardian', rarity: 'rare', baseId: recipe.output, source: recipe.id, relicOrigin: contexts.enemy, rng: () => 0, uid: `craft-block-${++serial}` });
    assert.equal(crafted.relic, undefined);
  }
  for (const cls of CLASSES) for (const merchant of ['elin', 'sera', 'oren']) {
    for (const shopItem of [...getArsenalShopStock({ level: 100, classId: cls.id, merchant }), ...getEquipmentShopStock({ level: 100, classId: cls.id, merchant })]) {
      assert.equal(shopItem.relic, undefined);
      assert.equal(rollRelic(shopItem, contexts.enemy, rng), null);
    }
  }
  assert.equal(rollRelic({ ...item, type: 'armor', slot: 'helmet' }, contexts.enemy, rng), null);
  assert.equal(rollRelic({ ...item, dungeonTier: 2 }, contexts.enemy, rng), null);
  assert.equal(called, 0);
});

test('independent sampled seals match the documented conditional chances instead of becoming guaranteed boss rewards', () => {
  const item = sealed(), count = 100000;
  for (const [kind, context] of Object.entries(contexts)) {
    const rng = seeded(471 + Object.keys(contexts).indexOf(kind)), totals = { moon_seal: 0, star_seal: 0 }, candidate = { ...item, source: context.enemyId, dungeonTier: 1 };
    for (let index = 0; index < count; index++) { const result = rollRelic(candidate, context, rng); if (result) totals[result.id]++; }
    for (const id of RELIC_IDS) {
      const expected = count * RELIC_DROP_CHANCES[kind][id], tolerance = Math.max(12, Math.sqrt(expected) * 4);
      assert.ok(Math.abs(totals[id] - expected) < tolerance, `${kind} ${id}: ${totals[id]}, expected ${expected}`);
    }
    assert.ok(totals.moon_seal + totals.star_seal < count * .02);
  }
});

test('authored tier-two overworld champions can roll seals without opening arbitrary overworld depth', () => {
  const item = sealed({ context: contexts.boss, tier: 2 });
  assert.equal(item.relic.origin.tier, 2);
  assert.equal(validateLootItem(clone(item)), true);
  const champions = Object.values(BESTIARY_ENEMIES).filter(enemy => enemy.boss);
  assert.ok(champions.length >= 80);
  for (const champion of champions) {
    const candidate = { ...item, source: champion.id, dungeonTier: champion.lootTier };
    const context = { kind: 'boss', enemyId: champion.id, dungeonId: null };
    assert.deepEqual(relicDropChances(candidate, context), RELIC_DROP_CHANCES.boss, champion.id);
    assert.equal(relicDropChances({ ...candidate, dungeonTier: 3 }, context).moon_seal, 0);
  }
  assert.equal(relicDropChances({ ...item, source: 'emberlord', dungeonTier: 2 }, { kind: 'boss', enemyId: 'emberlord' }).moon_seal, 0);
});

test('all eight classes can find each seal without modifying canonical base stats, affixes, rarity or ordinary pity', () => {
  let serial = 0;
  const bases = { guardian: 'iron_longsword', paladin: 'oath_hammer', ranger: 'greenwood_bow', nightblade: 'twilight_daggers', flamecaller: 'ember_wand', frostweaver: 'rime_scepter', druid: 'living_branch', shadowbinder: 'soul_focus' };
  for (const cls of CLASSES) for (const id of RELIC_IDS) {
    const roll = id === 'star_seal' ? .00005 : .0005;
    const options = { level: 100, classId: cls.id, baseId: bases[cls.id], source: contexts.enemy.enemyId, rng: () => roll, uid: `matching-${++serial}` };
    const ordinaryPity = { legendaryMisses: 8, bossMisses: 2 }, sealedPity = clone(ordinaryPity);
    const ordinary = generateLoot({ ...options, pity: ordinaryPity }), rare = generateLoot({ ...options, pity: sealedPity, relicOrigin: contexts.enemy });
    assert.equal(rare.relic.id, id);
    assert.equal(rare.classId, cls.id);
    for (const key of ['rarity', 'level', 'baseId', 'stats', 'affixes', 'sockets', 'setId', 'price', 'power', 'upgrade', 'dungeonTier']) assert.deepEqual(rare[key], ordinary[key], `${cls.id} ${id} ${key}`);
    assert.deepEqual(computeItemStats(rare), computeItemStats(ordinary));
    assert.deepEqual(sealedPity, ordinaryPity);
    assert.equal(validateLootItem(clone(rare)), true);
    assert.match(rare.name, new RegExp(`^${RELICS[id].prefix}: `));
  }
  const pity = { legendaryMisses: 499, bossMisses: 33 };
  const guaranteed = generateLoot({ level: 100, baseId: 'iron_longsword', boss: true, source: contexts.boss.enemyId, relicOrigin: contexts.boss, pity, rng: () => .99, uid: 'relic-pity' });
  assert.equal(guaranteed.rarity, 'legendary'); assert.equal(guaranteed.relic, undefined);
  assert.deepEqual(pity, { legendaryMisses: 0, bossMisses: 0 });
});

test('strict seal metadata rejects forged powers, provenance, weapon slots and old-version relabeling', () => {
  const original = sealed({ id: 'star_seal', context: contexts.dungeon_boss, tier: 4 });
  for (const mutate of [
    item => { item.relic.id = 'solar_seal'; }, item => { item.relic.id = ['star_seal']; }, item => { item.relic.version = 2; },
    item => { item.relic.stats = { damage: 999 }; }, item => { item.relic.proc = { fraction: 1 }; },
    item => { item.relic.origin.level = 99; }, item => { item.relic.origin.tier = 5; }, item => { item.relic.origin.kind = 'shop'; },
    item => { item.relic.origin.enemyId = 'constructor'; }, item => { item.relic.origin.enemyId = 'skadi'; },
    item => { item.relic.origin.dungeonId = 'frostkathedrale'; }, item => { item.relic.origin.extraChance = 1; },
    item => { delete item.relic.origin.dungeonId; }, item => { item.source = 'forge_forest'; },
    item => { item.balanceVersion = 1; }, item => { item.slot = 'ring'; }, item => { item.classId = 'invalid-class'; },
  ]) {
    const item = clone(original); mutate(item);
    assert.equal(validateRelicItem(item), false);
    assert.equal(validateLootItem(item), false);
    assert.equal(getRelic(item), null);
    assert.equal(resolveRelicProc(item, { damageDealt: 100, maxHp: 1000 }), null);
  }
  const legacy = { id: 'loot:legacy-relic-check', baseId: 'iron_longsword', name: 'Alter Eid', type: 'weapon', rarity: 'common', level: 100, icon: '⚔', description: 'Ein altes Fundstück.',
    stats: { damage: 59.45 }, price: 100, power: 119, upgrade: 0, dungeonTier: 1, setId: null, affixes: [], sockets: [] };
  assert.equal(validateLootItem(legacy), true);
  assert.equal(getRelic(legacy), null);
  const before = clone(legacy);
  computeItemStats(legacy);
  assert.deepEqual(legacy, before);
});

test('source, effect and upgrade presentation always comes from the canonical seal definition', () => {
  const item = sealed({ id: 'star_seal', context: contexts.dungeon_boss, tier: 12 }), presentation = relicPresentation(item);
  assert.equal(presentation.name, RELICS.star_seal.name);
  assert.equal(presentation.color, RELICS.star_seal.color);
  assert.match(presentation.originText, /Chronar/); assert.match(presentation.originText, /Uhrwerk/); assert.match(presentation.originText, /Tiefe 12/);
  assert.match(presentation.chanceText, /0,3 %/); assert.match(presentation.chanceText, /je geeigneter Waffenfund/);
  assert.match(presentation.upgradeText, /unverändert/); assert.match(presentation.upgradeText, /PvP/);
  assert.equal(relicPresentation({ type: 'weapon', name: 'Grabmond: Fälschung' }), null);
});

test('bounded effects honor a shared ready timestamp, positive damage and PvE mode across weapons and upgrades', () => {
  const moon = sealed(), star = sealed({ id: 'star_seal', context: contexts.dungeon_boss, tier: 30 });
  const hit = { time: 10, readyAt: 0, damageDealt: 300, maxHp: 2000 };
  const slow = resolveRelicProc(moon, hit);
  assert.deepEqual({ factor: slow.factor, duration: slow.duration, cooldown: slow.cooldown, readyAt: slow.readyAt }, { factor: .8, duration: 2, cooldown: 12, readyAt: 22 });
  const bossSlow = resolveRelicProc(moon, { ...hit, targetIsBoss: true });
  assert.equal(bossSlow.factor, .9); assert.equal(bossSlow.duration, 1);
  const ward = resolveRelicProc(star, hit);
  assert.equal(ward.amount, 70); assert.equal(ward.duration, 3); assert.equal(ward.cooldown, 16);
  assert.equal(resolveRelicProc(star, { ...hit, maxHp: 16000 }).amount, 85);
  assert.equal(resolveRelicProc(moon, { ...hit, readyAt: slow.readyAt }), null);
  assert.equal(resolveRelicProc(star, { ...hit, readyAt: slow.readyAt }), null, 'Swapping the weapon does not bypass one shared actor pause.');
  assert.ok(resolveRelicProc(star, { ...hit, time: slow.readyAt, readyAt: slow.readyAt }));
  for (const item of [moon, star]) {
    const before = resolveRelicProc(item, hit), rolls = clone(item.stats);
    item.upgrade = 10; item.sockets = item.sockets.map(() => ({ id: 'ruby', tier: 3 }));
    assert.equal(validateLootItem(item), true);
    assert.deepEqual(resolveRelicProc(item, hit), before);
    assert.deepEqual(item.stats, rolls);
    for (const invalid of [{ damageDealt: 0 }, { damageDealt: -1 }, { damageDealt: Infinity }, { time: NaN }, { readyAt: Infinity }, { mode: 'pvp' }, { mode: 'arena' }]) assert.equal(resolveRelicProc(item, { ...hit, ...invalid }), null);
  }
});

test('sealed weapons retain validated identity, source and upgrade rolls through the actual save and stash path', () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const game = new Game({ storage, random: () => .5 });
  game.player.level = 100;
  for (const key of ['enemies', 'trees', 'rocks', 'structures', 'nodes', 'plots', 'chests', 'shrines', 'interactions']) game.world[key] = [];
  const weapon = sealed({ id: 'star_seal', context: contexts.dungeon_boss, tier: 3 });
  weapon.upgrade = 2; weapon.sockets[0] = { id: 'ruby', tier: 3 };
  assert.equal(game.addItem(weapon), true);
  assert.equal(game.setItemFlag(weapon.id, 'favorite'), true);
  assert.equal(game.depositItem(weapon.id), true);
  assert.equal(game.save(false), true);
  const saved = JSON.parse(storage.getItem(SAVE_KEY));
  assert.deepEqual(saved.generatedItems[weapon.id], weapon);
  const restored = new Game({ storage, random: () => .5 });
  assert.deepEqual(restored.item(weapon.id), weapon);
  assert.equal(restored.stash[weapon.id], 1);
  assert.equal(restored.itemFlags[weapon.id].favorite, true);
  assert.equal(restored.withdrawItem(weapon.id), true);
  assert.equal(restored.equip(weapon.id), true);
  assert.equal(getRelic(restored.item(restored.equipment.weapon)).id, 'star_seal');
  assert.deepEqual(computeItemStats(restored.item(weapon.id)), computeItemStats(weapon));
  const corrupt = clone(restored.capture()); corrupt.generatedItems[weapon.id].relic.origin.kind = 'craft';
  const before = clone(restored.generatedItems);
  assert.throws(() => restored.applySave(corrupt));
  assert.deepEqual(restored.generatedItems, before);
});

test('real hit effects never revive or extend a stronger slow, preserve larger shields and retain their shared cooldown on reload', () => {
  const game = new Game({ storage: null, random: () => .5 });
  game.player.level = 100;
  for (const key of ['enemies', 'trees', 'rocks', 'structures', 'nodes', 'plots', 'chests', 'shrines', 'interactions']) game.world[key] = [];
  const moon = sealed(), star = sealed({ id: 'star_seal', context: contexts.dungeon_boss, tier: 30 });
  assert.equal(game.addItem(moon), true); assert.equal(game.addItem(star), true);
  assert.equal(game.equip(moon.id), true);
  const enemy = { id: 'relic-hit-target', type: 'wolf', x: game.player.x + 20, y: game.player.y, hp: 10000, maxHp: 10000, alive: true,
    homeX: game.player.x + 20, homeY: game.player.y, slowFactor: .4, slowUntil: game.time - 1, level: 1, attackTimer: 1, phase: 'idle' };
  game.world.enemies = [enemy];
  assert.ok(game.hitEnemy(enemy, 10) > 0);
  assert.equal(enemy.slowFactor, .8, 'Expired frost is replaced with the canonical weaker moon factor.');
  assert.equal(enemy.slowUntil, game.time + 2);
  assert.equal(game.cooldowns.relic, 12);
  game.cooldowns.relic = 0;
  enemy.slowFactor = .4; enemy.slowUntil = game.time + 1;
  const oldExpiry = enemy.slowUntil;
  assert.ok(game.hitEnemy(enemy, 10) > 0);
  assert.equal(enemy.slowFactor, .4); assert.equal(enemy.slowUntil, oldExpiry, 'A weaker moon proc cannot extend stronger frost.');
  assert.equal(game.equip(star.id), true);
  assert.ok(game.hitEnemy(enemy, 10) > 0);
  assert.equal(game.player.shield || 0, 0, 'A weapon swap retains the actor pause.');
  game.cooldowns.relic = 0;
  game.player.shield = 400; game.player.shieldUntil = game.time + 8;
  assert.ok(game.hitEnemy(enemy, 10) > 0);
  assert.equal(game.player.shield, 400); assert.equal(game.player.shieldUntil, game.time + 8);
  assert.equal(game.cooldowns.relic, 16);
  const restored = new Game({ storage: null, random: () => .5 }); restored.applySave(clone(game.capture()));
  assert.equal(restored.cooldowns.relic, 16);
  game.cooldowns.relic = 0; game.player.shield = 0; game.player.shieldUntil = 0;
  game.worldMode = 'pvp';
  assert.ok(game.hitEnemy(enemy, 10) > 0);
  assert.equal(game.player.shield, 0); assert.equal(game.cooldowns.relic, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, getClass } from '../src/classes.js';
import { RESOURCES } from '../src/catalog.js';
import { EQUIPMENT_SLOTS, EQUIPMENT_SLOT_IDS, EQUIPMENT_BASES, EQUIPMENT_ITEMS, EQUIPMENT_RECIPES, equipmentSlot, equipmentBudget, equipmentStatCaps, isEquipmentCompatible, createEmptyEquipment, getEquipmentShopStock } from '../src/equipment-system.js';
import { ITEM_BASES, RARITIES, LEGENDARY_AFFIXES, SETS, GEM_TYPES, GEAR_STAT_CAPS, LOOT_EQUIPMENT_SLOT_WEIGHTS, generateLoot, validateLootItem, computeItemStats, computeSetBonuses } from '../src/loot.js';
import { basePlayerStats, classStatModifiers, estimateCombat } from '../src/balance.js';

const seeded = initial => { let seed = initial; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };
const clone = value => JSON.parse(JSON.stringify(value));
const round = value => Math.round(value * 10000) / 10000;
const add = (target, source) => { for (const [stat, value] of Object.entries(source)) target[stat] = (target[stat] || 0) + value; return target; };

test('seven canonical equipment slots resolve legacy types and reject malformed explicit assignments', () => {
  assert.deepEqual(EQUIPMENT_SLOT_IDS, ['weapon', 'armor', 'charm', 'helmet', 'gloves', 'boots', 'ring']);
  assert.ok(Object.isFrozen(EQUIPMENT_SLOTS) && EQUIPMENT_SLOTS.every(Object.isFrozen));
  const empty = createEmptyEquipment();
  assert.deepEqual(Object.keys(empty), EQUIPMENT_SLOT_IDS);
  assert.ok(Object.values(empty).every(value => value === null));
  empty.helmet = 'a';
  assert.equal(createEmptyEquipment().helmet, null);
  for (const type of ['weapon', 'armor', 'charm']) assert.equal(equipmentSlot({ type }), type);
  for (const slot of ['helmet', 'gloves', 'boots']) assert.equal(equipmentSlot({ type: 'armor', slot }), slot);
  assert.equal(equipmentSlot({ type: 'charm', slot: 'ring' }), 'ring');
  for (const item of [null, [], { type: 'consumable' }, { type: 'armor', slot: null }, { type: 'armor', slot: 'ring' }, { type: 'weapon', slot: 'helmet' }, { type: 'armor', slot: 'constructor' }]) assert.equal(equipmentSlot(item), null);
  assert.equal(isEquipmentCompatible({ type: 'armor', slot: 'boots' }, 'armor'), false);
  assert.equal(isEquipmentCompatible({ type: 'armor', slot: 'boots' }, 'boots'), true);
  assert.equal(equipmentBudget('weapon'), 1);
  assert.ok(['helmet', 'gloves', 'boots', 'ring'].every(slot => equipmentBudget(slot) > 0 && equipmentBudget(slot) < .3));
});

test('forty-eight small-slot families provide distinct defensive, mobile and caster alternatives', () => {
  assert.equal(EQUIPMENT_BASES.length, 48);
  assert.equal(new Set(EQUIPMENT_BASES.map(base => base.name)).size, 48);
  assert.equal(new Set(ITEM_BASES.map(base => base.id)).size, ITEM_BASES.length);
  for (const slot of ['helmet', 'gloves', 'boots', 'ring']) {
    const bases = EQUIPMENT_BASES.filter(base => equipmentSlot(base) === slot);
    assert.equal(bases.length, 12);
    assert.equal(new Set(bases.map(base => base.minLevel)).size, 4);
    assert.equal(new Set(bases.map(base => base.category)).size, 3);
    assert.ok(bases.every(base => base.minLevel <= 90 && base.minLevel >= 1));
  }
  for (const recipe of EQUIPMENT_RECIPES) {
    assert.ok(EQUIPMENT_ITEMS[recipe.output]);
    assert.equal(recipe.minLevel, EQUIPMENT_ITEMS[recipe.output].minLevel);
    for (const [resource, amount] of Object.entries(recipe.ingredients)) assert.ok(RESOURCES[resource] && Number.isInteger(amount) && amount > 0);
  }
});

test('all new bases and rarities round-trip with canonical small-slot stats, upgrades and sockets', () => {
  let serial = 0;
  for (const base of EQUIPMENT_BASES) for (const rarity of Object.keys(RARITIES)) for (const level of [base.minLevel, 100]) {
    const cls = CLASSES[serial % CLASSES.length];
    const item = generateLoot({ baseId: base.id, level, classId: cls.id, rarity, rng: seeded(++serial), uid: `slot-roll-${serial}` });
    assert.equal(equipmentSlot(item), base.slot);
    assert.equal(validateLootItem(clone(item)), true, `${base.id} ${rarity} ${level}`);
    if (rarity === 'legendary') {
      const definition = LEGENDARY_AFFIXES[cls.id];
      const affix = item.affixes.find(affix => affix.id === definition.id);
      for (const [stat, value] of Object.entries(definition.stats)) assert.equal(affix.stats[stat], round(value * equipmentBudget(item)));
    }
    const rolledStats = clone(item.stats), affixes = clone(item.affixes);
    item.upgrade = 10; item.dungeonTier = 30;
    item.sockets = item.sockets.map(() => ({ id: 'emerald', tier: 3 }));
    assert.equal(validateLootItem(clone(item)), true);
    const caps = equipmentStatCaps(GEAR_STAT_CAPS, item);
    for (const [stat, value] of Object.entries(computeItemStats(item))) assert.ok(value >= 0 && value <= caps[stat]);
    assert.deepEqual(item.stats, rolledStats); assert.deepEqual(item.affixes, affixes);
  }
  for (const fixed of Object.values(EQUIPMENT_ITEMS)) {
    const item = generateLoot({ baseId: fixed.id, level: fixed.minLevel, rarity: fixed.rarity, rng: seeded(81), uid: `fixed-${fixed.id}` });
    assert.deepEqual(item.stats, fixed.stats);
  }
});

test('loot validation rejects moving a canonical subslot and forging full-size affixes or legacy rolls', () => {
  const original = generateLoot({ baseId: 'relic_helmet_4_1', level: 100, classId: 'guardian', rarity: 'legendary', rng: seeded(31), uid: 'slot-validation' });
  for (const mutate of [
    item => { delete item.slot; },
    item => { item.slot = 'armor'; },
    item => { item.slot = 'boots'; },
    item => { item.type = 'helmet'; },
    item => { delete item.balanceVersion; },
    item => { item.balanceVersion = 1; },
    item => { item.stats.maxHp /= .24; },
    item => { item.affixes.find(affix => affix.legendary).stats.maxHp = 120; },
  ]) {
    const item = clone(original); mutate(item);
    assert.equal(validateLootItem(item), false);
  }
  const legacySlot = generateLoot({ baseId: 'iron_longsword', level: 100, rarity: 'common', uid: 'slot-legacy' });
  assert.equal(legacySlot.slot, undefined);
  assert.equal(legacySlot.stats.damage, 151.025);
  assert.equal(validateLootItem(clone(legacySlot)), true);
  legacySlot.slot = 'weapon';
  assert.equal(validateLootItem(legacySlot), true, 'An explicit equivalent slot is also valid for original bases.');
});

test('minor sockets use the same reduced stat budget and three distinct slots activate one set bonus', () => {
  const item = generateLoot({ baseId: 'relic_gloves_4_2', level: 100, rarity: 'epic', rng: seeded(57), uid: 'small-sockets' });
  const before = computeItemStats(item), rolls = clone(item.stats);
  item.sockets[0] = { id: 'ruby', tier: 3 };
  const after = computeItemStats(item);
  assert.equal(after.damage, round(before.damage + GEM_TYPES.ruby.stats.damage * 3 * .18));
  assert.deepEqual(item.stats, rolls);
  assert.equal(validateLootItem(item), true);
  const helmet = { id: 'set-helmet', type: 'armor', slot: 'helmet', setId: 'ashen_oath' };
  const boots = { id: 'set-boots', type: 'armor', slot: 'boots', setId: 'ashen_oath' };
  const ring = { id: 'set-ring', type: 'charm', slot: 'ring', setId: 'ashen_oath' };
  assert.deepEqual(computeSetBonuses([helmet, { ...helmet, id: 'another-helmet' }]), {});
  assert.deepEqual(computeSetBonuses([helmet, boots]), SETS.ashen_oath.bonuses[2]);
  assert.deepEqual(computeSetBonuses([helmet, boots, ring, ring]), { ...SETS.ashen_oath.bonuses[2], ...SETS.ashen_oath.bonuses[3] });
});

test('all seven equipment slots occur in live drops without reducing the weapon-group share', () => {
  const rng = seeded(8251), counts = Object.fromEntries(EQUIPMENT_SLOT_IDS.map(slot => [slot, 0])), seen = new Set(), count = 24000;
  for (let index = 0; index < count; index++) {
    const item = generateLoot({ level: 100, classId: 'guardian', rarity: 'common', rng, uid: `slot-frequency-${index}` });
    counts[equipmentSlot(item)]++; seen.add(item.baseId);
  }
  for (const [slot, expected] of Object.entries(LOOT_EQUIPMENT_SLOT_WEIGHTS)) assert.ok(Math.abs(counts[slot] / count - expected) < .012, `${slot}: ${counts[slot] / count}`);
  for (const base of EQUIPMENT_BASES) assert.ok(seen.has(base.id), `${base.id} is obtainable`);
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const item = generateLoot({ level: 100, slot, rng: seeded(32), uid: `requested-${slot}` });
    assert.equal(equipmentSlot(item), slot);
  }
  assert.throws(() => generateLoot({ slot: 'offhand' }), RangeError);
  assert.throws(() => generateLoot({ level: 100, baseId: 'iron_longsword', slot: 'ring' }), RangeError);
});

test('new merchant stock follows slot progression and each class role', () => {
  for (const cls of CLASSES) for (const level of [1, 10, 25, 50, 100]) {
    const stock = getEquipmentShopStock({ level, classId: cls.id });
    assert.ok(stock.length <= 4 && stock.every(item => item.minLevel <= level));
    assert.equal(new Set(stock.map(equipmentSlot)).size, stock.length);
    const magic = cls.abilities.attack.stat === 'spellDamage';
    for (const item of stock) assert.equal(item.category, item.slot === 'ring' ? magic ? 'arcane' : 'martial'
      : ['guardian', 'paladin'].includes(cls.id) ? 'heavy' : magic ? 'ritual' : 'light');
  }
  assert.deepEqual(getEquipmentShopStock({ level: 100, merchant: 'sera' }), []);
});

test('four additional rare pieces improve survival and damage within a bounded seven-slot budget', () => {
  for (const cls of CLASSES) for (const level of [25, 50, 100]) {
    const primary = getClass(cls.id).abilities.attack.stat || 'damage';
    const core = add(basePlayerStats(level), classStatModifiers(cls.id, level));
    for (const slot of ['weapon', 'armor', 'charm']) {
      const bases = ITEM_BASES.filter(base => equipmentSlot(base) === slot && base.minLevel <= level && (!base.classIds || base.classIds.includes(cls.id))
        && (slot === 'weapon' || slot === 'charm' ? base.stats[primary] > 0 : base.stats.armor && base.stats.maxHp)).sort((a, b) => b.minLevel - a.minLevel);
      const item = generateLoot({ baseId: bases[0].id, level, rarity: 'rare', classId: cls.id, rng: () => .5, uid: `core-${cls.id}-${slot}-${level}` });
      add(core, computeItemStats(item));
    }
    const expanded = { ...core };
    for (const fixed of getEquipmentShopStock({ level, classId: cls.id })) {
      const item = generateLoot({ baseId: fixed.id, level, rarity: 'rare', classId: cls.id, rng: () => .5, uid: `extra-${cls.id}-${fixed.slot}-${level}` });
      add(expanded, computeItemStats(item));
    }
    const before = estimateCombat({ level, classId: cls.id, stats: core }), after = estimateCombat({ level, classId: cls.id, stats: expanded });
    assert.ok(after.dps > before.dps && after.dps / before.dps < 1.35, `${cls.id} ${level} damage increase`);
    assert.ok(after.ttd > before.ttd && after.ttd / before.ttd < 1.45, `${cls.id} ${level} defense increase`);
  }
});

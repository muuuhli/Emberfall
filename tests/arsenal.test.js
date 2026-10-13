import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../src/classes.js';
import { ITEMS as STARTER_ITEMS } from '../src/content.js';
import { RESOURCES } from '../src/catalog.js';
import { ARSENAL_WEAPONS, ARSENAL_ARMOR, ARSENAL_CHARMS, ARSENAL_BASES, ARSENAL_CONSUMABLES, EXTRA_ITEMS, EXTRA_RECIPES, getArsenalShopStock, getSupplyDrop } from '../src/arsenal.js';
import { ITEM_BASES, RARITIES, LOOT_SLOT_WEIGHTS, GEAR_STAT_CAPS, generateLoot, validateLootItem, computeItemStats } from '../src/loot.js';
import { getConsumableProfile } from '../src/professions.js';
import { Game } from '../src/game.js';

const seeded = initial => {
  let seed = initial;
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
};
const clone = value => JSON.parse(JSON.stringify(value));

test('sixty-four class weapons offer distinct roles with level progression and useful primary stats', () => {
  assert.equal(ARSENAL_WEAPONS.length, 64);
  assert.equal(ARSENAL_ARMOR.length, 24);
  assert.equal(ARSENAL_CHARMS.length, 24);
  assert.equal(new Set(ITEM_BASES.map(base => base.id)).size, ITEM_BASES.length);
  assert.equal(new Set(ARSENAL_BASES.map(base => base.name)).size, ARSENAL_BASES.length);
  for (const cls of CLASSES) {
    const weapons = ARSENAL_WEAPONS.filter(base => base.classIds.includes(cls.id));
    assert.equal(weapons.length, 8);
    assert.equal(new Set(weapons.map(base => base.role)).size, 8);
    assert.equal(new Set(weapons.map(base => JSON.stringify(base.stats))).size, 8);
    assert.ok(weapons.every(base => base.stats[cls.abilities.attack.stat || 'damage'] > 0));
    assert.ok(weapons[0].minLevel <= 5 && weapons.at(-1).minLevel >= 90);
    assert.ok(weapons.some(base => base.stats.armor || base.stats.maxHp), 'Defensive alternatives exist.');
    assert.ok(weapons.some(base => base.stats.crit || base.stats.cooldown || base.stats.manaRegen), 'Offensive and sustain alternatives exist.');
    assert.equal(EXTRA_ITEMS[cls.weaponId], undefined, 'A new family does not replace a class starter.');
    assert.ok(STARTER_ITEMS[cls.weaponId]);
  }
});

test('every authored base can drop and survives saving, high-depth upgrades and sockets', () => {
  let serial = 0;
  for (const base of ARSENAL_BASES) {
    const classId = base.classIds?.[0] || 'guardian';
    for (const rarity of Object.keys(RARITIES)) for (const level of [base.minLevel, 100]) {
      const item = generateLoot({ baseId: base.id, classId, level, rarity, boss: true, tier: 30, rng: seeded(++serial), uid: `arsenal-${serial}` });
      assert.equal(validateLootItem(clone(item)), true, `${base.id} ${rarity} ${level}`);
      const rolledStats = clone(item.stats);
      item.upgrade = 10;
      item.sockets = item.sockets.map(() => ({ id: 'emerald', tier: 3 }));
      assert.equal(validateLootItem(clone(item)), true);
      for (const [stat, value] of Object.entries(computeItemStats(item))) assert.ok(Number.isFinite(value) && value <= GEAR_STAT_CAPS[stat]);
      assert.deepEqual(item.stats, rolledStats);
    }
    assert.throws(() => generateLoot({ baseId: base.id, classId, level: base.minLevel - 1, uid: `locked-${serial}` }), RangeError);
  }
});

test('craft and merchant equipment shares its canonical base budget with loot and has bounded prices', () => {
  for (const base of ARSENAL_BASES) {
    const fixed = EXTRA_ITEMS[base.id];
    const rolled = generateLoot({ baseId: base.id, classId: base.classIds?.[0] || 'guardian', level: base.minLevel, rarity: fixed.rarity, rng: seeded(38), uid: `shop-budget-${base.id}` });
    assert.deepEqual(fixed.stats, rolled.stats, base.id);
    assert.equal(fixed.level, base.minLevel);
    assert.equal(fixed.minLevel, base.minLevel);
    assert.ok(fixed.price >= 35 && fixed.price <= 1000, 'Handmade equipment is affordable within its progression tier.');
    assert.ok(rolled.price >= fixed.price, 'A rolled version with affixes does not underprice the fixed counterpart.');
  }
  for (const recipe of EXTRA_RECIPES) {
    const output = EXTRA_ITEMS[recipe.output];
    assert.ok(output, `${recipe.id} output exists`);
    assert.equal(recipe.minLevel, output.minLevel);
    assert.deepEqual(recipe.classIds, output.classIds);
    assert.equal(recipe.amount, 1);
    for (const [id, amount] of Object.entries(recipe.ingredients)) {
      assert.ok(RESOURCES[id], `${recipe.id} resource ${id} exists`);
      assert.ok(Number.isInteger(amount) && amount > 0 && amount < 50);
    }
  }
  assert.equal(new Set(EXTRA_RECIPES.map(recipe => recipe.id)).size, EXTRA_RECIPES.length);
  for (const cls of CLASSES) assert.equal(EXTRA_RECIPES.filter(recipe => recipe.classIds?.includes(cls.id)).length, 4);
});

test('larger item catalogs preserve useful slot frequency and make every new class weapon obtainable', () => {
  for (const cls of CLASSES) {
    const rng = seeded(870 + CLASSES.indexOf(cls)), seen = new Set(), slots = { weapon: 0, armor: 0, charm: 0 }, count = 6000;
    for (let index = 0; index < count; index++) {
      const item = generateLoot({ level: 100, classId: cls.id, rarity: 'common', rng, uid: `frequency-${cls.id}-${index}` });
      seen.add(item.baseId); slots[item.type]++;
      const base = ITEM_BASES.find(base => base.id === item.baseId);
      assert.ok(!base.classIds || base.classIds.includes(cls.id));
    }
    for (const [slot, weight] of Object.entries(LOOT_SLOT_WEIGHTS)) assert.ok(Math.abs(slots[slot] / count - weight) < .025, `${cls.id} ${slot}: ${slots[slot] / count}`);
    for (const weapon of ARSENAL_WEAPONS.filter(base => base.classIds.includes(cls.id))) assert.ok(seen.has(weapon.id), weapon.id);
    assert.ok(seen.has('iron_scale'), 'Old families remain obtainable.');
  }
});

test('merchant progression gives each class compact, usable stock without exposing locked gear', () => {
  const idsBefore = Object.keys(EXTRA_ITEMS);
  for (const cls of CLASSES) for (const level of [1, 10, 25, 50, 75, 100]) for (const merchant of ['elin', 'sera', 'oren']) {
    const stock = getArsenalShopStock({ level, classId: cls.id, merchant });
    assert.ok(stock.length <= (merchant === 'sera' ? 4 : 6));
    assert.equal(new Set(stock.map(item => item.id)).size, stock.length);
    assert.ok(stock.every(item => item.minLevel <= level && (!item.classIds || item.classIds.includes(cls.id))));
    if (merchant === 'elin') assert.ok(stock.every(item => item.type !== 'consumable'));
    if (merchant === 'sera') assert.ok(stock.every(item => item.type === 'consumable'));
    if (merchant === 'oren' && level >= 10) {
      const armor = stock.find(item => item.type === 'armor'), charm = stock.find(item => item.type === 'charm');
      const magic = cls.abilities.attack.stat === 'spellDamage';
      assert.equal(charm.category, magic ? 'arcane' : 'martial');
      assert.equal(armor.category, ['guardian', 'paladin'].includes(cls.id) ? 'heavy' : magic ? 'ritual' : 'light');
    }
  }
  assert.deepEqual(Object.keys(EXTRA_ITEMS), idsBefore);
  assert.deepEqual(getArsenalShopStock({ level: 1 }), []);
});

test('supply tables scale across any bestiary creature and keep food separate from potion profiles', () => {
  for (const level of [1, 10, 30, 65, 100]) for (const boss of [false, true]) {
    const rng = seeded(612 + level), seen = new Set();
    let drops = 0;
    for (let index = 0; index < 2500; index++) {
      const id = getSupplyDrop({ level, boss, traits: ['champion', 'arcane', 'draining'], rng });
      if (!id) continue;
      drops++; seen.add(id);
      const item = EXTRA_ITEMS[id] || STARTER_ITEMS[id];
      assert.ok(item?.type === 'consumable');
      assert.ok((item.minLevel || 1) <= level);
      assert.ok(item.stats.hpRestore || item.stats.manaRestore);
    }
    assert.ok(Math.abs(drops / 2500 - (boss ? .7 : .12)) < .03);
    assert.ok(seen.size >= 2);
  }
  for (const item of ARSENAL_CONSUMABLES) {
    const profile = getConsumableProfile(item);
    assert.equal(profile.minLevel, item.minLevel);
    assert.equal(profile.cooldownGroup, item.family === 'food' ? 'food' : 'potion');
    assert.equal(profile.outOfCombat, item.family === 'food');
    assert.equal(profile.cooldown, item.family === 'food' ? 10 : 3);
  }
  assert.equal(getSupplyDrop({ rng: () => 1 }), null);
  assert.throws(() => getSupplyDrop({ rng: () => NaN }), TypeError);
});

test('real crafting and equipping respects class and level requirements before spending materials', () => {
  const game = new Game({ storage: null, random: seeded(39) });
  game.player.gold = 10000;
  for (const id of Object.keys(game.resources)) game.resources[id] = 100;
  const resourcesBefore = clone(game.resources), goldBefore = game.player.gold;
  assert.equal(game.craft('forge_cinder_bulwark'), false);
  assert.deepEqual(game.resources, resourcesBefore);
  assert.equal(game.buy('cinder_bulwark'), false);
  assert.equal(game.player.gold, goldBefore);
  game.player.level = 12;
  assert.equal(game.craft('forge_leech_kukris'), false, 'A guardian cannot craft a nightblade-only weapon.');
  assert.equal(game.buy('leech_kukris'), false);
  assert.deepEqual(game.resources, resourcesBefore);
  assert.equal(game.craft('forge_cinder_bulwark'), true);
  assert.equal(game.inventory.cinder_bulwark, 1);
  const recipe = EXTRA_RECIPES.find(recipe => recipe.id === 'forge_cinder_bulwark');
  for (const [id, amount] of Object.entries(recipe.ingredients)) assert.equal(game.resources[id], resourcesBefore[id] - amount);
  game.player.hp = 20;
  const before = game.stats();
  assert.equal(game.equip('cinder_bulwark'), true);
  assert.ok(game.stats().armor > before.armor && game.stats().maxHp > before.maxHp);
  assert.equal(game.player.hp, 20, 'Defensive equipment cannot heal by being swapped.');
  game.addItem('leech_kukris');
  assert.equal(game.equip('leech_kukris'), false);
  const restored = new Game({ storage: null, random: seeded(39) });
  restored.applySave(clone(game.capture()));
  assert.equal(restored.equipment.weapon, 'cinder_bulwark');
  assert.equal(restored.inventory.cinder_bulwark, 1);
  assert.deepEqual(restored.stats(), game.stats());
});

test('new food requires a quiet moment, a meal cooldown and the same short healing pause as potions', () => {
  const game = new Game({ storage: null, random: seeded(48) });
  game.start();
  game.player.level = 80;
  game.world.enemies = [];
  game.inventory = { last_supper_ration: 2, martyr_lifeblood: 2, night_oracle_tears: 2 };
  game.player.hp = 10; game.player.mana = 0;
  game.player.lastDamageAt = game.time;
  assert.equal(game.consume('last_supper_ration'), false);
  assert.equal(game.inventory.last_supper_ration, 2);
  game.time += 6;
  assert.equal(game.consume('last_supper_ration'), true);
  assert.equal(game.cooldowns.food, 10);
  assert.equal(game.consume('last_supper_ration'), false);
  assert.equal(game.consume('martyr_lifeblood'), false, 'A meal also prevents instant healing spam.');
  for (let index = 0; index < 80; index++) game.update(.04, { simulateWorld: false });
  game.player.hp = 10;
  assert.equal(game.consume('martyr_lifeblood'), true);
  assert.equal(game.cooldowns.potion, 3);
  assert.equal(game.consume('night_oracle_tears'), false);
  assert.equal(game.player.hp, 810);
  assert.ok(game.player.hp <= game.stats().maxHp);
  game.cooldowns.potion = 0;
  game.inventory = { last_supper_ration: 1 };
  assert.equal(game.action('potion'), false, 'The healing shortcut never consumes food in combat.');
});

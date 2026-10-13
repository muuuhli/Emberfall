import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../src/classes.js';
import { RARITIES, ITEM_BASES, AFFIXES, LEGENDARY_AFFIXES, GEM_TYPES, SETS, generateLoot, computeItemStats, computeSetBonuses, validateLootItem, salvageYield, itemPower, describeStat } from '../src/loot.js';

const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const clone = value => JSON.parse(JSON.stringify(value));

test('deeper dungeon loot increases flat power without inflating percentage stats, gems or level requirements', () => {
  const options={level:100,rarity:'legendary',classId:'guardian',baseId:ITEM_BASES.find(item=>item.type==='armor'&&(!item.classIds||item.classIds.includes('guardian'))).id,uid:'depth'};
  // Use the same seeded roll to isolate dungeon depth from random affixes.
  const shallow=generateLoot({...options,rng:seeded(28),tier:1});
  const deep=generateLoot({...options,rng:seeded(28),tier:30});
  assert.equal(deep.level,shallow.level);
  assert.deepEqual(deep.stats,shallow.stats);
  assert.deepEqual(deep.affixes,shallow.affixes);
  assert.equal(validateLootItem(clone(deep)),true);
  const before=computeItemStats(shallow),after=computeItemStats(deep);
  for(const key of ['crit','cooldown','lifeSteal','dodgeCooldown'])if(before[key])assert.equal(after[key],before[key]);
  assert.ok(itemPower(deep)>itemPower(shallow));
  deep.dungeonTier=31;assert.equal(validateLootItem(deep),false);
  assert.throws(()=>generateLoot({...options,tier:NaN}),RangeError);
});

test('loot includes thirty-plus reusable gear bases and controlled rarity odds', () => {
  assert.ok(ITEM_BASES.length >= 30);
  assert.equal(new Set(ITEM_BASES.map(base => base.id)).size, ITEM_BASES.length);
  assert.equal(new Set(AFFIXES.map(affix => affix.id)).size, AFFIXES.length);
  assert.ok(Math.abs(Object.values(RARITIES).reduce((sum, rarity) => sum + rarity.weight, 0) - 1) < 1e-12);
  assert.ok(Math.abs(Object.values(RARITIES).reduce((sum, rarity) => sum + rarity.bossWeight, 0) - 1) < 1e-12);
  assert.equal(RARITIES.legendary.weight, 0.002);
  assert.equal(RARITIES.legendary.bossWeight, 0.03);
});

test('fixed seeded rolls produce reproducible instanced items and independent instances', () => {
  const first = generateLoot({ level: 60, classId: 'ranger', rng: seeded(37), uid: 'fixed' });
  const second = generateLoot({ level: 60, classId: 'ranger', rng: seeded(37), uid: 'fixed' });
  assert.deepEqual(first, second);
  assert.equal(validateLootItem(first), true);
  const other = generateLoot({ level: 60, classId: 'ranger', rng: seeded(37), uid: 'another' });
  assert.notEqual(first.id, other.id);
  first.stats.damage = 99999;
  assert.notDeepEqual(first.stats, other.stats);
  assert.equal(validateLootItem(first), false);
});

test('all rarities and class legendaries round-trip through JSON with valid level scaling', () => {
  let count = 0;
  for (const characterClass of CLASSES) {
    for (const rarity of Object.keys(RARITIES)) {
      for (const level of [1, 30, 70, 100]) {
        const item = generateLoot({ level, rarity, classId: characterClass.id, rng: seeded(++count), uid: `class-${count}` });
        assert.equal(validateLootItem(item), true, `${characterClass.id} ${rarity} ${level}`);
        assert.equal(validateLootItem(clone(item)), true);
        if (rarity === 'legendary') {
          const legendary = LEGENDARY_AFFIXES[characterClass.id];
          assert.ok(item.affixes.some(affix => affix.id === legendary.id));
          for (const [stat, value] of Object.entries(legendary.stats)) assert.ok(computeItemStats(item)[stat] >= value);
        }
      }
    }
  }
});

test('smart loot produces class-usable weapons and respects minimum base levels', () => {
  for (const characterClass of CLASSES) {
    const rng = seeded(42);
    for (let index = 0; index < 80; index++) {
      const item = generateLoot({ level: 20, classId: characterClass.id, rng, uid: `smart-${index}` });
      const base = ITEM_BASES.find(base => base.id === item.baseId);
      assert.ok(base.minLevel <= 20);
      assert.ok(!base.classIds || base.classIds.includes(characterClass.id));
    }
  }
  assert.throws(() => generateLoot({ level: 1, baseId: 'sunforged_maul' }), RangeError);
  assert.throws(() => generateLoot({ level: 60, classId: 'druid', baseId: 'greenwood_bow' }), RangeError);
});

test('normal and boss drop frequencies match the documented low legendary rates', () => {
  const normal = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  const bosses = { ...normal };
  const normalRng = seeded(891);
  const bossRng = seeded(293);
  const count = 30000;
  for (let index = 0; index < count; index++) {
    normal[generateLoot({ level: 50, rng: normalRng, uid: `n-${index}` }).rarity]++;
    bosses[generateLoot({ level: 50, boss: true, rng: bossRng, uid: `b-${index}` }).rarity]++;
  }
  assert.ok(normal.legendary >= 35 && normal.legendary <= 90, JSON.stringify(normal));
  assert.ok(bosses.legendary >= 800 && bosses.legendary <= 1010, JSON.stringify(bosses));
  assert.equal(bosses.common, 0);
  assert.ok(bosses.epic > normal.epic * 5);
});

test('legendary pity is persisted by the caller and resets after a successful roll', () => {
  const normalPity = { legendaryMisses: 498, bossMisses: 7 };
  assert.notEqual(generateLoot({ pity: normalPity, rng: () => 0.5, uid: 'miss' }).rarity, 'legendary');
  assert.equal(normalPity.legendaryMisses, 499);
  assert.equal(generateLoot({ pity: normalPity, rng: () => 0.5, uid: 'normal-guarantee' }).rarity, 'legendary');
  assert.equal(normalPity.legendaryMisses, 0);
  assert.equal(normalPity.bossMisses, 0);
  const bossPity = { legendaryMisses: 4, bossMisses: 32 };
  generateLoot({ boss: true, pity: bossPity, rng: () => 0.5, uid: 'boss-miss' });
  assert.equal(bossPity.bossMisses, 33);
  assert.equal(generateLoot({ boss: true, pity: bossPity, rng: () => 0.5, uid: 'boss-guarantee' }).rarity, 'legendary');
  assert.equal(bossPity.bossMisses, 0);
});

test('sockets add known gem bonuses without changing base stats or duplicating them', () => {
  const item = generateLoot({ level: 50, rarity: 'legendary', rng: () => 0.5, uid: 'sockets' });
  const base = clone(item.stats);
  const before = computeItemStats(item);
  item.sockets = ['ruby', { id: 'sapphire', tier: 2 }, { id: 'emerald', tier: 3 }];
  const after = computeItemStats(item);
  assert.equal(after.damage, Math.round(((before.damage || 0) + GEM_TYPES.ruby.stats.damage) * 10000) / 10000);
  assert.equal(after.mana, Math.round(((before.mana || 0) + GEM_TYPES.sapphire.stats.mana * 2) * 10000) / 10000);
  assert.equal(after.maxHp, Math.round(((before.maxHp || 0) + GEM_TYPES.emerald.stats.maxHp * 3) * 10000) / 10000);
  assert.deepEqual(item.stats, base);
  assert.deepEqual(computeItemStats(item), after);
  assert.equal(validateLootItem(item), true);
  item.sockets[1] = { id: 'sapphire', tier: 99, stats: { damage: 999 } };
  assert.equal(validateLootItem(item), false);
});

test('two- and three-piece sets require distinct equipped slots and grant bonuses once', () => {
  const setId = 'ashen_oath';
  const pieces = ['weapon', 'armor', 'charm'].map((type, index) => ({ id: `test-${index}`, type, setId }));
  assert.deepEqual(computeSetBonuses([pieces[0]]), {});
  assert.deepEqual(computeSetBonuses([pieces[0], { ...pieces[0], id: 'duplicate-slot' }]), {});
  assert.deepEqual(computeSetBonuses(pieces.slice(0, 2)), SETS[setId].bonuses[2]);
  assert.deepEqual(computeSetBonuses(pieces), { ...SETS[setId].bonuses[2], ...SETS[setId].bonuses[3] });
  assert.deepEqual(computeSetBonuses([...pieces, ...pieces]), computeSetBonuses(pieces));
});

test('bounded upgrades scale base and affix values while percentages and gems stay stable', () => {
  const item = generateLoot({ level: 60, rarity: 'legendary', classId: 'nightblade', baseId: 'twilight_daggers', rng: seeded(91), uid: 'upgrade' });
  const original = clone(item.stats);
  const originalAffixes = clone(item.affixes);
  const before = computeItemStats(item);
  item.upgrade = 10;
  item.sockets[0] = 'ruby';
  const after = computeItemStats(item);
  assert.equal(after.damage, Math.round((Math.round(before.damage * 1.06 ** 10 * 10000) / 10000 + GEM_TYPES.ruby.stats.damage) * 10000) / 10000);
  assert.equal(after.crit, before.crit);
  assert.equal(after.lifeSteal, before.lifeSteal);
  assert.deepEqual(item.stats, original);
  assert.deepEqual(item.affixes, originalAffixes);
  assert.equal(validateLootItem(item), true);
  for (const invalid of [-1, 11, 0.5, NaN, '5']) {
    item.upgrade = invalid;
    assert.equal(validateLootItem(item), false);
  }
});

test('validation rejects corrupt or forged save data before equipment use', () => {
  const original = generateLoot({ level: 90, rarity: 'epic', rng: seeded(7), uid: 'validate' });
  for (const mutate of [
    item => { item.level = 101; },
    item => { item.stats.maxHp = Infinity; },
    item => { item.stats.constructor = 5; },
    item => { item.affixes[0].stats = { damage: 99999 }; },
    item => { item.affixes.push(clone(item.affixes[0])); },
    item => { item.sockets.push(null); },
    item => { item.sockets[0] = { id: 'unknown', tier: 1 }; },
    item => { item.setId = 'invented'; },
    item => { item.baseId = 'missing'; },
    item => { item.id = 'legacy-id'; },
    item => { item.rarity = 'mythic'; },
  ]) {
    const item = clone(original);
    mutate(item);
    assert.equal(validateLootItem(item), false);
  }
  assert.equal(validateLootItem(null), false);
  assert.throws(() => generateLoot({ rng: () => NaN }), TypeError);
  assert.throws(() => generateLoot({ uid: '../../bad' }), TypeError);
});

test('salvaging returns materials and gems; German stat labels preserve percentages', () => {
  const item = generateLoot({ level: 100, rarity: 'legendary', rng: seeded(4), uid: 'salvage' });
  item.sockets[0] = 'ruby';
  const materials = salvageYield(item);
  assert.ok(materials.ore > 0 && materials.crystal > 0);
  assert.ok(materials.dust >= 8, 'High-tier salvaging funds the equipment upgrade loop.');
  assert.equal(materials.ruby, 1);
  assert.deepEqual(salvageYield({ id: 'bogus' }), {});
  assert.equal(describeStat('crit', 0.025), '+2.5 % Kritische Treffer');
  assert.equal(describeStat('maxHp', 20), '+20 Leben');
  assert.equal(describeStat('damage', NaN), '');
  assert.ok(itemPower(item) > item.power, 'Socketing raises computed item power.');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, CLASS_TALENTS, getClass } from '../src/classes.js';

const stats = ['maxHp', 'mana', 'damage', 'armor', 'crit', 'speed', 'spellDamage', 'manaRegen', 'cooldown', 'dodgeCooldown', 'gatherYield', 'lifeSteal'];

test('eight classes offer distinct combat roles and attacks', () => {
  assert.equal(CLASSES.length, 8);
  assert.equal(new Set(CLASSES.map(entry => entry.id)).size, 8);
  assert.deepEqual(CLASSES.map(entry => entry.id), ['guardian', 'paladin', 'ranger', 'nightblade', 'flamecaller', 'frostweaver', 'druid', 'shadowbinder']);
  assert.equal(getClass('unknown').id, 'guardian');
  for (const entry of CLASSES) {
    assert.equal(getClass(entry.id), entry);
    assert.deepEqual(Object.keys(entry.statMods).sort(), [...stats].sort());
    assert.ok(Object.values(entry.statMods).every(Number.isFinite));
    assert.ok(entry.name && entry.role && entry.description && entry.weaponId);
    for (const key of ['attack', 'bolt', 'nova']) {
      const ability = entry.abilities[key];
      assert.ok(ability.name && ability.color);
      assert.ok(ability.cooldown > 0);
      assert.ok(Number.isFinite(ability.damageMultiplier) && ability.damageMultiplier >= 0);
    }
  }
  assert.equal(getClass('guardian').abilities.bolt.kind, 'shield');
  assert.equal(getClass('paladin').abilities.bolt.kind, 'heal');
  assert.equal(getClass('ranger').abilities.attack.kind, 'projectile');
  assert.equal(getClass('nightblade').abilities.bolt.kind, 'dashstrike');
  assert.ok(getClass('flamecaller').abilities.bolt.splashRadius > 0);
  assert.ok(getClass('frostweaver').abilities.bolt.slow > 0);
  assert.ok(getClass('druid').abilities.nova.regenerationMultiplier > 0);
  assert.equal(getClass('shadowbinder').abilities.nova.kind, 'summon');
});

test('class-exclusive talent trees have valid prerequisites and late unlocks', () => {
  assert.equal(new Set(CLASS_TALENTS.map(talent => talent.id)).size, CLASS_TALENTS.length);
  for (const entry of CLASSES) {
    assert.ok(entry.talents.length >= 8);
    assert.ok(entry.talents.some(talent => talent.minLevel >= 80));
    const ids = new Set(entry.talents.map(talent => talent.id));
    for (const talent of entry.talents) {
      assert.equal(talent.classId, entry.id);
      assert.ok(talent.id.startsWith(`${entry.id}_`));
      assert.ok(talent.maxRank > 0 && talent.cost > 0);
      assert.ok(talent.minLevel >= 1 && talent.minLevel <= 100);
      if(talent.combatDepth){assert.equal(talent.effect,null);assert.ok(talent.combatEffects.length>=2);assert.ok(talent.combatEffects.every(effect=>typeof effect.target==='string'&&typeof effect.stat==='string'&&Number.isFinite(effect.value)&&effect.value!==0));}
      else {assert.ok(stats.includes(talent.effect.stat));assert.ok(Number.isFinite(talent.effect.value) && talent.effect.value > 0);}
      if (talent.requires) assert.ok(ids.has(talent.requires));
      const path = new Set([talent.id]);
      let current = talent;
      while (current.requires) {
        assert.equal(path.has(current.requires), false, 'Talent prerequisites must not cycle.');
        path.add(current.requires);
        current = entry.talents.find(candidate => candidate.id === current.requires);
        assert.ok(current.minLevel <= talent.minLevel);
      }
    }
  }
});

test('original guardian ranks remain save-compatible', () => {
  for (const id of ['guardian_vigor', 'guardian_steel', 'guardian_might', 'guardian_siphon']) {
    const talent = getClass('guardian').talents.find(entry => entry.id === id);
    assert.equal(talent.maxRank, 3);
    assert.equal(talent.cost, 1);
  }
});

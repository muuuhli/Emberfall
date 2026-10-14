import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES } from '../src/classes.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { DUNGEONS } from '../src/dungeons.js';
import { PVP_STATS } from '../src/pvp.js';
import { BALANCE_VERSION, COMBAT_CAPS, COMBAT_SUSTAIN, CLASS_POWER, basePlayerStats,
  capCombatStats, armorMitigation } from '../src/balance.js';

const clone = value => JSON.parse(JSON.stringify(value));
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
let serial = 0;
function arena(classId = 'guardian', level = 100) {
  const game = new Game({ storage: null, random: () => .5 }); game.selectClass(classId);
  Object.assign(game.player, { id: `v8-owner-${++serial}`, level, skillPoints: level * 2, x: 2000, y: 1000, face: 0, invulnerable: 0, shield: 0 });
  for (const field of ['trees', 'rocks', 'structures', 'enemies', 'shrines', 'nodes', 'plots', 'chests', 'worldEvents', 'eventObjects', 'interactions']) game.world[field] = [];
  game.npcs = []; game.start(); game.player.hp = game.stats().maxHp; game.player.mana = game.stats().mana;
  assert.equal(game.inSettlement(), false); return game;
}
function learn(game, id, rank = 1) {
  const talent = CLASSES.find(cls => cls.id === game.player.classId).talents.find(talent => talent.id === id);
  assert.ok(talent, id);
  const requirements = talent.requires ? Array.isArray(talent.requires) ? talent.requires : [talent.requires] : [];
  for (const requirement of requirements) learn(game, typeof requirement === 'string' ? requirement : requirement.id,
    typeof requirement === 'string' ? talent.requiresRank || 1 : requirement.rank || 1);
  while ((game.skills[id] || 0) < rank) assert.equal(game.learn(id), true, id);
}
function enemy(game, offset = 100) {
  const actor = createBestiaryEnemy('wolf', `v8-target-${++serial}`, game.player.x + offset, game.player.y,
    { level: game.player.level, region: 'daemmerhain' });
  actor.rewardless = true; game.world.enemies.push(actor); return actor;
}
function advance(game, seconds, simulateWorld = false) {
  for (let left = seconds; left > 1e-9; left -= .02) game.update(Math.min(left, .02), { simulateWorld });
}

test('the narrow PvE sustain change preserves item versions, unrelated caps, armor and class role factors', () => {
  assert.equal(BALANCE_VERSION, 2, 'Canonical old and current loot keep their serialized budget version');
  assert.deepEqual(COMBAT_CAPS, { crit: .45, lifeSteal: .08, cooldown: .45, dodgeCooldown: .6, speed: 300 });
  assert.deepEqual(COMBAT_SUSTAIN, { leechMaxHpPerSecond: .02, leechBurstSeconds: 1, earlyGrace: .24, lateGrace: .16 });
  assert.equal(Object.isFrozen(COMBAT_SUSTAIN), true);
  close(armorMitigation(100, 100), 100 / 278.4);
  assert.equal(CLASS_POWER.guardian.attack, .78); assert.equal(CLASS_POWER.druid.heal, .35);
  assert.equal(CLASS_POWER.shadowbinder.summon, .65);
  for (const invalid of [NaN, Infinity, -Infinity, '1', null]) {
    const raw = { ...basePlayerStats(100), lifeSteal: invalid }, before = { ...raw };
    assert.equal(capCombatStats(raw, { level: 100 }).lifeSteal, 0); assert.deepEqual(raw, before);
  }
  assert.equal(capCombatStats({ lifeSteal: -1 }).lifeSteal, 0);
  assert.equal(capCombatStats({ lifeSteal: 100 }).lifeSteal, .08);
});

test('an earned native talent build reaches the leech cap without losing old save ranks or item truth', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3);
  const ranks = clone(game.skills), gear = clone(game.equipment), inventory = clone(game.inventory);
  assert.equal(game.skills.guardian_siphon, 3); assert.equal(game.stats().lifeSteal, .08);
  const spent = CLASSES.find(cls => cls.id === 'guardian').talents.reduce((total, talent) => total + (game.skills[talent.id] || 0) * talent.cost, 0);
  assert.equal(spent + game.player.skillPoints, 200); assert.ok(spent < 20);
  const save = clone(game.capture()), restored = new Game({ storage: null, random: () => .5 }); restored.applySave(save);
  const earned = skills => Object.fromEntries(Object.entries(skills).filter(([, rank]) => rank > 0));
  assert.deepEqual(earned(restored.skills), earned(ranks)); assert.deepEqual(restored.equipment, gear); assert.deepEqual(restored.inventory, inventory);
  assert.equal(restored.stats().lifeSteal, .08); assert.deepEqual(restored.capture().generatedItems, save.generatedItems);
});

test('real damage against several canonical enemies shares one owner leech burst and refills only with active game time', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3); game.player.hp = game.stats().maxHp / 2;
  const before = game.player.hp, rate = game.stats().maxHp * COMBAT_SUSTAIN.leechMaxHpPerSecond;
  const first = game.hitEnemy(enemy(game), 2000, 0); assert.ok(first * game.stats().lifeSteal > rate);
  close(game.player.hp - before, rate);
  game.hitEnemy(enemy(game, 130), 2000, 0); game.hitEnemy(enemy(game, 160), 2000, 0); close(game.player.hp - before, rate);
  advance(game, .25); game.hitEnemy(enemy(game, 190), 2000, 0); close(game.player.hp - before, rate * 1.25);
  const paused = game.player.hp; game.paused = true; advance(game, 10);
  game.hitEnemy(enemy(game, 220), 2000, 0); close(game.player.hp, paused);
  game.paused = false; advance(game, 5); const longWait = game.player.hp;
  game.hitEnemy(enemy(game, 250), 2000, 0); close(game.player.hp - longWait, rate, 'Idle credit cannot exceed one second');
});

test('invalid damage and leech inputs cannot spend credit, mutate health or revive a fallen owner', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3); game.player.hp = game.stats().maxHp / 2;
  const target = enemy(game), initial = { hp: game.player.hp, enemyHp: target.hp };
  for (const invalid of [0, -1, NaN, Infinity, -Infinity, true, false, '10', null, undefined]) {
    assert.equal(game.hitEnemy(target, invalid, 0), 0); assert.equal(game.healLifeSteal(invalid), 0);
    assert.equal(game.player.hp, initial.hp); assert.equal(target.hp, initial.enemyHp);
  }
  assert.equal(game.leechBudget, null);
  game.dead = true; game.player.hp = 0; assert.equal(game.healLifeSteal(20), 0); assert.equal(game.player.hp, 0);
});

test('native dungeon entry and return preserve already spent owner leech credit without advancing time', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3); game.player.hp = game.stats().maxHp / 2;
  const entrance = DUNGEONS.find(dungeon => dungeon.id === 'wurzelgewoelbe').entrance;
  Object.assign(game.player, entrance);
  const before = game.player.hp, rate = game.stats().maxHp * COMBAT_SUSTAIN.leechMaxHpPerSecond, overworld = game.world;
  game.hitEnemy(enemy(game), 2000, 0); close(game.player.hp - before, rate);
  assert.equal(game.enterDungeon('wurzelgewoelbe'), true); assert.notEqual(game.world, overworld);
  const dungeonTarget = game.world.enemies.find(actor => actor.alive); assert.ok(dungeonTarget);
  dungeonTarget.rewardless = true; assert.ok(game.hitEnemy(dungeonTarget, 2000, 0) > 0);
  close(game.player.hp - before, rate);
  assert.equal(game.exitDungeon(), true); assert.equal(game.world, overworld);
  assert.ok(game.hitEnemy(enemy(game), 2000, 0) > 0); close(game.player.hp - before, rate);
  assert.equal(game.time, 0, 'Travel does not earn active-second healing credit');
});

test('native save and reload conserve spent and fractional leech credit while legacy saves retain their initial burst', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3); game.player.hp = game.stats().maxHp / 2;
  const rate = game.stats().maxHp * COMBAT_SUSTAIN.leechMaxHpPerSecond;
  game.hitEnemy(enemy(game), 2000, 0);
  const exhausted = clone(game.capture()); close(exhausted.leechCredit, 0);
  const load = save => { const restored = new Game({ storage: null, random: () => .5 }); restored.applySave(clone(save)); return restored; };
  const restored = load(exhausted), hp = restored.player.hp;
  assert.ok(restored.hitEnemy(enemy(restored), 2000, 0) > 0); close(restored.player.hp, hp);
  advance(game, .25); const fractional = clone(game.capture()); close(fractional.leechCredit, .25);
  let current = load(fractional); const prior = current.player.hp;
  current.hitEnemy(enemy(current), 2000, 0); close(current.player.hp - prior, rate * .25);
  const conserved = current.player.hp;
  for (let reload = 0; reload < 3; reload++) {
    const save = clone(current.capture()); close(save.leechCredit, 0); current = load(save);
    current.hitEnemy(enemy(current), 2000, 0); close(current.player.hp, conserved);
  }
  const legacy = clone(exhausted); delete legacy.leechCredit; const old = load(legacy), before = old.player.hp;
  old.hitEnemy(enemy(old), 2000, 0); close(old.player.hp - before, rate);
});

test('nonfinite, malformed and out-of-range saved leech credit reject before changing the native character', () => {
  const game = arena(); learn(game, 'guardian_siphon', 3); game.player.hp = game.stats().maxHp / 2;
  game.hitEnemy(enemy(game), 2000, 0); advance(game, .25);
  const snapshot = () => { const save = clone(game.capture()); delete save.savedAt; return save; }, before = snapshot();
  for (const invalid of [-.01, 1.01, NaN, Infinity, -Infinity, '0', null, true, [], {}]) {
    const forged = clone(before); forged.leechCredit = invalid;
    assert.throws(() => game.applySave(forged)); assert.deepEqual(snapshot(), before);
  }
});

test('spending passive leech credit leaves actual Paladin party healing and Shadow drain available', () => {
  const guardian = arena(); learn(guardian, 'guardian_siphon', 3); guardian.player.hp = 100;
  guardian.hitEnemy(enemy(guardian), 2000, 0); const afterLeech = guardian.player.hp;
  const paladin = arena('paladin'); paladin.world = guardian.world; paladin.partyGames = guardian.partyGames = [guardian, paladin];
  assert.equal(paladin.action('bolt'), true); assert.ok(guardian.player.hp - afterLeech > guardian.stats().maxHp * .02);
  const shadow = arena('shadowbinder'); shadow.player.hp = 100; shadow.healLifeSteal(1000);
  const afterBudget = shadow.player.hp; enemy(shadow); shadow.aim = { x: shadow.player.x + 100, y: shadow.player.y };
  assert.equal(shadow.action('bolt'), true); advance(shadow, .35, true);
  assert.ok(shadow.player.hp - afterBudget > shadow.stats().maxHp * .02, 'Native Drain heals independently after actual projectile damage');
});

test('eight distinct attackers can deal simultaneous damage while one attacker retains its short grace', () => {
  for (const level of [5, 100]) {
    const game = arena('guardian', level), before = game.player.hp;
    for (let index = 0; index < 8; index++) assert.equal(game.damagePlayer(10, { trueDamage: true, attackerId: `wolf-${index}` }), 10);
    assert.equal(before - game.player.hp, 80); assert.equal(game.player.invulnerable, 0, 'Damage grace is separate from explicit roll immunity');
    assert.equal(game.damagePlayer(10, { trueDamage: true, attackerId: 'wolf-0' }), undefined);
    advance(game, (level < 12 ? COMBAT_SUSTAIN.earlyGrace : COMBAT_SUSTAIN.lateGrace) + .001);
    assert.equal(game.damagePlayer(10, { trueDamage: true, attackerId: 'wolf-0' }), 10);
  }
});

test('legacy unknown sources share a bounded grace bucket and explicit escape immunity still blocks every attacker', () => {
  const game = arena(), before = game.player.hp;
  assert.equal(game.damagePlayer(10, { trueDamage: true }), 10); assert.equal(game.damagePlayer(10, { trueDamage: true }), undefined);
  assert.equal(game.player.hp, before - 10);
  game.player.invulnerable = .3;
  for (let index = 0; index < 8; index++) assert.equal(game.damagePlayer(10, { trueDamage: true, attackerId: `roll-${index}` }), undefined);
  assert.equal(game.player.hp, before - 10);
  advance(game, .32);
  for (let index = 0; index < 200; index++) game.damagePlayer(1, { trueDamage: true, attackerId: `bounded-${index}` });
  assert.ok(game.damageGrace.size <= 128); assert.equal(game.player.hp, before - 210);
});

test('the PvP arena keeps its mirrored stats and receives no passive PvE leech', () => {
  const game = arena('shadowbinder'); game.worldMode = 'pvp'; game.pvpStats = { ...PVP_STATS }; game.player.hp = 100;
  assert.deepEqual(game.stats(), PVP_STATS); assert.equal(game.healLifeSteal(1000), 0); assert.equal(game.player.hp, 100);
  assert.equal(game.leechBudget, null); assert.equal(game.stats().lifeSteal, 0); assert.equal(game.stats().crit, 0);
});

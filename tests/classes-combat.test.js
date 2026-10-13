import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES, getClass } from '../src/classes.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { classPowerMultiplier } from '../src/balance.js';

let characterSerial = 0;
function arena(classId = 'guardian', level = 20) {
  const game = new Game({ storage: null, random: () => 0.5 });
  assert.equal(game.selectClass(classId), true);
  game.player.id = `class-test-${++characterSerial}`;
  game.player.level = level;
  game.player.x = 2000;
  game.player.y = 1000;
  game.player.face = 0;
  game.player.hp = game.stats().maxHp;
  game.player.mana = game.stats().mana;
  game.world.trees = [];
  game.world.rocks = [];
  game.world.structures = [];
  game.world.nodes = [];
  game.world.plots = [];
  game.world.chests = [];
  game.world.shrines = [];
  game.world.dungeonEntrances = [];
  game.world.enemies = [];
  game.npcs = [];
  game.start();
  return game;
}

function enemy(game, dx = 120, dy = 0, changes = {}) {
  const target = {
    id: `target-${game.world.enemies.length}`, type: 'wolf', x: game.player.x + dx, y: game.player.y + dy,
    homeX: game.player.x + dx, homeY: game.player.y + dy, hp: 1000, maxHp: 1000, alive: true,
    phase: 'recover', attackTimer: 999, aggro: true, respawnAt: 0, ...changes,
  };
  game.world.enemies.push(target);
  return target;
}

function attachParty(leader, ...allies) {
  const party = [leader, ...allies];
  for (const member of party) {
    member.world = leader.world;
    member.partyGames = party;
    for (const field of ['effects', 'projectiles', 'drops', 'hazards', 'summons']) member[field] = leader[field];
  }
  return party;
}

function advance(leader, seconds, party = leader.partyGames) {
  for (let remaining = seconds; remaining > 1e-8; remaining -= 0.02) {
    const dt = Math.min(0.02, remaining);
    for (const member of party) member.update(dt, { simulateWorld: false });
    leader.updateWorld(dt, party);
  }
}

test('all eight classes pay their ability costs once and enforce their own cooldowns', () => {
  for (const characterClass of CLASSES) {
    for (const action of ['bolt', 'nova']) {
      const game = arena(characterClass.id);
      const profile = characterClass.abilities[action];
      const mana = game.player.mana;
      assert.equal(game.action(action), true, `${characterClass.name}: ${action}`);
      assert.equal(game.player.mana, mana - profile.cost);
      assert.ok(game.cooldowns[action] > 0);
      assert.equal(game.action(action), false);
      assert.equal(game.player.mana, mana - profile.cost, 'Repeated input must not pay twice.');
      game.cooldowns[action] = 0;
      game.player.mana = profile.cost - 1;
      assert.equal(game.action(action), false);
      assert.equal(game.player.mana, profile.cost - 1);
    }
  }
});

test('guardian Bastion absorbs real damage and taunts an enemy away from a closer ally', () => {
  const guardian = arena('guardian');
  const ally = arena('flamecaller');
  ally.player.x = guardian.player.x + 140;
  ally.player.y = guardian.player.y - 50;
  const party = attachParty(guardian, ally);
  const target = enemy(guardian, 140, 0, { phase: 'chase', attackTimer: 999 });
  const hp = guardian.player.hp;
  assert.equal(guardian.action('bolt'), true);
  assert.ok(guardian.player.shield > 0);
  assert.equal(ally.player.shield, 0, 'Bastion is personal protection.');
  guardian.damagePlayer(100);
  assert.equal(guardian.player.hp, hp);
  assert.ok(guardian.player.shield < guardian.stats().maxHp * getClass('guardian').abilities.bolt.shieldMultiplier);
  guardian.updateEnemies(0.02, party);
  assert.ok(target.x < guardian.player.x + 140, 'Taunted enemy moves toward the guardian, not the nearer caster.');
  assert.ok(Math.abs(Math.abs(target.face) - Math.PI) < 0.001);
  assert.equal(target.targetId, guardian.player.id);
  assert.ok(target.tauntUntil > guardian.time);
});

test('guardian Eiserner Wall shields nearby allies, excludes distant allies and expires', () => {
  const guardian = arena('guardian');
  const near = arena('druid');
  const far = arena('ranger');
  near.player.x += 100;
  far.player.x += 300;
  const party = attachParty(guardian, near, far);
  assert.equal(guardian.action('nova'), true);
  assert.ok(guardian.player.shield > 0 && near.player.shield > 0);
  assert.equal(far.player.shield, 0);
  const hp = near.player.hp;
  near.damagePlayer(80);
  assert.equal(near.player.hp, hp);
  advance(guardian, getClass('guardian').abilities.nova.duration + 0.1, party);
  assert.equal(guardian.player.shield, 0);
  assert.equal(near.player.shield, 0);
});

test('paladin heals the party in range without reviving dead or reaching distant allies', () => {
  const paladin = arena('paladin');
  const near = arena('ranger');
  const far = arena('nightblade');
  const dead = arena('guardian');
  near.player.x += 100;
  far.player.x += 300;
  paladin.player.hp = near.player.hp = far.player.hp = 20;
  dead.player.hp = 0;
  dead.dead = true;
  attachParty(paladin, near, far, dead);
  assert.equal(paladin.action('bolt'), true);
  assert.ok(paladin.player.hp > 20 && near.player.hp > 20);
  assert.equal(far.player.hp, 20);
  assert.equal(dead.player.hp, 0);
});

test('paladin Weihe damages nearby enemies while healing the party', () => {
  const paladin = arena('paladin');
  const ally = arena('guardian');
  ally.player.x += 80;
  ally.player.hp = 20;
  attachParty(paladin, ally);
  const near = enemy(paladin, 110);
  const far = enemy(paladin, 210);
  assert.equal(paladin.action('nova'), true);
  assert.ok(near.hp < near.maxHp);
  assert.equal(far.hp, far.maxHp);
  assert.ok(ally.player.hp > 20);
});

test('ranger basic arrows are real projectiles and hit at long distance', () => {
  const ranger = arena('ranger');
  const target = enemy(ranger, 350);
  assert.equal(ranger.action('attack'), true);
  assert.equal(target.hp, target.maxHp);
  assert.equal(ranger.projectiles.length, 1);
  advance(ranger, 0.7);
  assert.ok(target.hp < target.maxHp);
});

test('ranger Durchschlag hits multiple targets once each and scales with weapon damage', () => {
  const ranger = arena('ranger');
  const first = enemy(ranger, 100);
  const second = enemy(ranger, 220);
  const third = enemy(ranger, 340);
  const expected = Math.round(ranger.stats().damage * getClass('ranger').abilities.bolt.damageMultiplier * classPowerMultiplier('ranger','spell'));
  assert.equal(ranger.action('bolt'), true);
  advance(ranger, 0.15);
  assert.equal(first.maxHp - first.hp, expected);
  assert.ok(ranger.projectiles.length > 0, 'Piercing arrow continues after the first target.');
  const firstHp = first.hp;
  advance(ranger, 0.6);
  assert.equal(first.hp, firstHp, 'The projectile must not repeatedly damage the same target.');
  assert.ok(second.hp < second.maxHp && third.hp < third.maxHp);
});

test('ranger Dornennetz waits for an enemy and traps only targets inside its radius', () => {
  const ranger = arena('ranger');
  const inside = enemy(ranger, 80, 100);
  const outside = enemy(ranger, 80, 260);
  assert.equal(ranger.action('nova'), true);
  assert.equal(inside.hp, inside.maxHp);
  advance(ranger, 0.02);
  assert.ok(inside.hp < inside.maxHp);
  assert.equal(outside.hp, outside.maxHp);
  advance(ranger, 1.1);
  assert.ok(inside.slowUntil > ranger.time, 'A six-second trap must not turn its slow strength into a subsecond duration.');
});

test('nightblade Schattenstich reaches its declared range and damages the landing target', () => {
  const nightblade = arena('nightblade');
  const profile = getClass('nightblade').abilities.bolt;
  const start = nightblade.player.x;
  const target = enemy(nightblade, profile.range - 20);
  assert.equal(nightblade.action('bolt'), true);
  assert.ok(nightblade.player.x - start >= profile.range * 0.9);
  assert.ok(target.hp < target.maxHp);
  assert.ok(nightblade.player.invulnerable > 0);
});

test('nightblade dashstrike cannot pass through a blocking wall', () => {
  const nightblade = arena('nightblade');
  const wallX = nightblade.player.x + 80;
  nightblade.world.structures = [{ x: wallX, y: 900, w: 25, h: 200, collision: { x: wallX, y: 900, w: 25, h: 200 } }];
  assert.equal(nightblade.action('bolt'), true);
  assert.ok(nightblade.player.x < wallX - 11);
  assert.equal(nightblade.collides(nightblade.player.x, nightblade.player.y), false);
});

test('flamecaller Feuerball explodes around its impact and respects its splash radius', () => {
  const flamecaller = arena('flamecaller');
  const direct = enemy(flamecaller, 140);
  const splash = enemy(flamecaller, 140, 60);
  const outside = enemy(flamecaller, 140, 140);
  assert.equal(flamecaller.action('bolt'), true);
  advance(flamecaller, 0.5);
  assert.ok(direct.hp < direct.maxHp);
  assert.ok(splash.hp < splash.maxHp, 'Splash damage must use the class profile splashRadius.');
  assert.equal(outside.hp, outside.maxHp);
});

test('flamecaller Inferno deals an initial blast and continuing burn inside its area', () => {
  const flamecaller = arena('flamecaller');
  const inside = enemy(flamecaller, 100);
  const outside = enemy(flamecaller, 240);
  assert.equal(flamecaller.action('nova'), true);
  const afterBlast = inside.hp;
  assert.ok(afterBlast < inside.maxHp);
  advance(flamecaller, 1.2);
  assert.ok(inside.hp < afterBlast, 'Inferno must continue to burn after its initial hit.');
  assert.equal(outside.hp, outside.maxHp);
  const afterDuration = inside.hp;
  advance(flamecaller, getClass('flamecaller').abilities.nova.duration + 0.2);
  const afterExpiry = inside.hp;
  advance(flamecaller, 1);
  assert.ok(afterExpiry <= afterDuration);
  assert.equal(inside.hp, afterExpiry, 'Burn damage must end with the effect.');
});

test('frostweaver Frostlanze uses separate slow strength and three-second duration', () => {
  const frostweaver = arena('frostweaver');
  const target = enemy(frostweaver, 130);
  assert.equal(frostweaver.action('bolt'), true);
  advance(frostweaver, 0.35);
  assert.ok(target.hp < target.maxHp);
  target.x = target.homeX = frostweaver.player.x + 300;
  target.phase = 'chase';
  const start = target.x;
  advance(frostweaver, 0.4);
  const expectedDistance = ENEMY_TYPES.wolf.speed * (1 - getClass('frostweaver').abilities.bolt.slow) * 0.4;
  assert.ok(Math.abs(start - target.x - expectedDistance) < 0.25, 'Slow strength must actually affect movement speed.');
  advance(frostweaver, 0.5);
  assert.ok(target.slowUntil > frostweaver.time, 'Frostlanze slow remains active beyond one second.');
  advance(frostweaver, 1.2);
  assert.ok(target.slowUntil > frostweaver.time, 'Frostlanze retains its declared three-second control window.');
  advance(frostweaver, 0.9);
  assert.ok(target.slowUntil <= frostweaver.time, 'The slow must expire rather than permanently slowing an enemy.');
});

test('frostweaver basic Eissplitter applies its weaker short frost slow', () => {
  const frostweaver = arena('frostweaver');
  const target = enemy(frostweaver, 130);
  assert.equal(frostweaver.action('attack'), true);
  advance(frostweaver, 0.35);
  assert.ok(target.hp < target.maxHp);
  assert.ok(target.slowUntil > frostweaver.time, 'Basic frost shards carry their declared slow.');
  target.x = target.homeX = frostweaver.player.x + 300;
  target.phase = 'chase';
  const start = target.x;
  advance(frostweaver, 0.4);
  const expected = ENEMY_TYPES.wolf.speed * (1 - getClass('frostweaver').abilities.attack.slow) * 0.4;
  assert.ok(Math.abs(start - target.x - expected) < 0.25);
  advance(frostweaver, getClass('frostweaver').abilities.attack.duration);
  assert.ok(target.slowUntil <= frostweaver.time);
});

test('frostweaver Wintergefängnis controls an area more strongly than Frostlanze', () => {
  const frostweaver = arena('frostweaver');
  const target = enemy(frostweaver, 80, 50);
  const far = enemy(frostweaver, 80, 260);
  assert.equal(frostweaver.action('nova'), true);
  advance(frostweaver, 0.02);
  assert.ok(target.hp < target.maxHp);
  assert.equal(far.hp, far.maxHp);
  target.x = target.homeX = frostweaver.player.x + 300;
  target.y = target.homeY = frostweaver.player.y;
  target.phase = 'chase';
  const start = target.x;
  advance(frostweaver, 0.4);
  const expectedDistance = ENEMY_TYPES.wolf.speed * (1 - getClass('frostweaver').abilities.nova.slow) * 0.4;
  assert.ok(Math.abs(start - target.x - expectedDistance) < 0.25);
  advance(frostweaver, 1);
  assert.ok(target.slowUntil > frostweaver.time);
});

test('druid heals nearby allies with Blütensegen', () => {
  const druid = arena('druid');
  const ally = arena('guardian', 50);
  const outside = arena('guardian', 50);
  ally.player.x += 100;
  outside.player.x += 260;
  ally.player.hp = outside.player.hp = druid.player.hp = 10;
  attachParty(druid, ally, outside);
  assert.equal(druid.action('bolt'), true);
  assert.ok(druid.player.hp > 10 && ally.player.hp > 10);
  assert.equal(outside.player.hp, 10);
});

test('druid Kreis des Lebens regenerates the group after its initial healing', () => {
  const druid = arena('druid');
  const ally = arena('guardian', 50);
  const outside = arena('guardian', 50);
  ally.player.x += 120;
  outside.player.x += 280;
  ally.player.hp = outside.player.hp = druid.player.hp = 5;
  const party = attachParty(druid, ally, outside);
  assert.equal(druid.action('nova'), true);
  const initial = ally.player.hp;
  assert.ok(initial > 5 && initial < ally.stats().maxHp);
  advance(druid, 1.2, party);
  assert.ok(ally.player.hp > initial, 'Regeneration continues after the initial cast.');
  assert.equal(outside.player.hp, 5);
  advance(druid, getClass('druid').abilities.nova.duration + 0.2, party);
  const afterExpiry = ally.player.hp;
  advance(druid, 1, party);
  assert.equal(ally.player.hp, afterExpiry, 'Regeneration expires rather than becoming permanent.');
});

test('shadowbinder Seelenentzug only restores health after an actual hit', () => {
  const shadowbinder = arena('shadowbinder');
  const target = enemy(shadowbinder, 130);
  shadowbinder.player.hp = 20;
  assert.equal(shadowbinder.action('bolt'), true);
  assert.equal(shadowbinder.player.hp, 20, 'Casting drain into the air is not a heal.');
  advance(shadowbinder, 0.4);
  assert.ok(target.hp < target.maxHp);
  assert.ok(shadowbinder.player.hp > 20);
  const miss = arena('shadowbinder');
  miss.player.hp = 20;
  assert.equal(miss.action('bolt'), true);
  advance(miss, 2);
  assert.equal(miss.player.hp, 20, 'A missed drain cannot heal.');
});

test('shadowbinder cannot drain health through an invulnerable boss shield', () => {
  const shadowbinder = arena('shadowbinder');
  const shielded = enemy(shadowbinder, 130, 0, { shielded: true });
  shadowbinder.player.hp = 20;
  assert.equal(shadowbinder.action('bolt'), true);
  advance(shadowbinder, 0.4);
  assert.equal(shielded.hp, shielded.maxHp);
  assert.equal(shadowbinder.player.hp, 20);
});

test('shared-world drain restores its caster rather than the room authority', () => {
  const guardian = arena('guardian');
  const shadowbinder = arena('shadowbinder');
  guardian.player.hp = shadowbinder.player.hp = 20;
  const party = attachParty(guardian, shadowbinder);
  const target = enemy(guardian, 130);
  assert.equal(shadowbinder.action('bolt'), true);
  advance(guardian, 0.4, party);
  assert.ok(target.hp < target.maxHp);
  assert.ok(shadowbinder.player.hp > 20);
  assert.equal(guardian.player.hp, 20, 'Drain ownership must survive authoritative shared-world simulation.');
});

test('shadowbinder summons two independently attacking servants that expire', () => {
  const shadowbinder = arena('shadowbinder');
  const target = enemy(shadowbinder, 120, 0, { hp: 100000, maxHp: 100000 });
  assert.equal(shadowbinder.action('nova'), true);
  assert.equal(shadowbinder.summons.length, getClass('shadowbinder').abilities.nova.summonCount);
  assert.equal(target.hp, target.maxHp);
  advance(shadowbinder, 2);
  assert.ok(target.hp < target.maxHp);
  assert.ok(shadowbinder.summons.every(summon => summon.x > shadowbinder.player.x));
  advance(shadowbinder, getClass('shadowbinder').abilities.nova.duration + 0.1);
  assert.equal(shadowbinder.summons.length, 0);
});

test('shadowbinder servants obey their declared attack cadence', () => {
  const shadowbinder = arena('shadowbinder');
  const target = enemy(shadowbinder, 25, 30, { hp: 100000, maxHp: 100000 });
  assert.equal(shadowbinder.action('nova'), true);
  advance(shadowbinder, 0.02);
  const firstAttackHp = target.hp;
  assert.ok(firstAttackHp < target.maxHp);
  advance(shadowbinder, getClass('shadowbinder').abilities.nova.summonAttackCooldown + 0.02);
  assert.ok(target.hp < firstAttackHp, 'Servant attacks repeat at the class profile cadence.');
});

test('shadowbinder servants do not chase targets beyond their declared acquisition range', () => {
  const shadowbinder = arena('shadowbinder');
  const target = enemy(shadowbinder, getClass('shadowbinder').abilities.nova.summonRange + 30);
  assert.equal(shadowbinder.action('nova'), true);
  advance(shadowbinder, 2.5);
  assert.equal(target.hp, target.maxHp);
  assert.ok(shadowbinder.summons.every(summon => Math.hypot(summon.x - shadowbinder.player.x, summon.y - shadowbinder.player.y) < 60));
});

test('choosing a starting class cannot duplicate starter equipment', () => {
  const game = new Game({ storage: null, random: () => 0.5 });
  for (let index = 0; index < 5; index++) assert.equal(game.selectClass('guardian'), true);
  assert.equal(game.inventory[getClass('guardian').weaponId], 1);
  for (let index = 0; index < 3; index++) assert.equal(game.selectClass('flamecaller'), true);
  assert.equal(game.inventory[getClass('flamecaller').weaponId], 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { BESTIARY_ENEMIES, BESTIARY_SPECIES, BESTIARY_FAMILIES, REGION_ENEMY_POOLS, bestiaryCombatStats, createBestiaryEnemy } from '../src/bestiary.js';
import { makeWorld } from '../src/world.js';
import { expandWorld, EXPANSION_REGIONS } from '../src/expansion.js';
import { ENEMY_TYPES as ORIGINAL_ENEMIES } from '../src/content.js';
import { Game } from '../src/game.js';

function arena(type, distance = 80) {
  const game = new Game({ storage: null, random: () => .5 });
  game.start();
  game.world.trees = []; game.world.rocks = []; game.world.structures = []; game.world.shrines = [];
  game.player.x = 4000 + distance; game.player.y = 1800;
  const enemy = createBestiaryEnemy(type, 'bestiary-arena', 4000, 1800, { level: 10 });
  game.world.enemies = [enemy];
  return { game, enemy, def: BESTIARY_ENEMIES[type] };
}

function finishWarning(game, enemy) {
  const duration = enemy.attackTimer;
  game.time += duration + .01;
  game.updateEnemies(duration + .01);
}

test('eighty authored species have distinct combat budgets and identities in sixteen regional pools', () => {
  assert.equal(BESTIARY_SPECIES.length, 80);
  assert.equal(new Set(BESTIARY_SPECIES).size, 80);
  assert.equal(Object.keys(REGION_ENEMY_POOLS).length, 16);
  for (const pool of Object.values(REGION_ENEMY_POOLS)) assert.equal(pool.length, 5);
  const species = BESTIARY_SPECIES.map(id => BESTIARY_ENEMIES[id]);
  assert.equal(new Set(species.map(def => def.name)).size, 80);
  const behaviorSignature = def => JSON.stringify([def.family, def.archetype, def.hpScale, def.damageScale, def.speed,
    def.range, def.combat.pattern, def.combat.windup, def.combat.projectileCount, def.traits]);
  assert.equal(new Set(species.map(behaviorSignature)).size, 80, 'Species must differ in gameplay, not only their labels');
  assert.equal(new Set(species.map(def => def.combat.pattern)).size, 8);
  assert.equal(new Set(species.map(def => def.family)).size, BESTIARY_FAMILIES.length);
  for (const def of species) {
    assert.equal(def.species, true);
    assert.equal(def.boss, false);
    assert.ok(BESTIARY_FAMILIES.includes(def.family));
    assert.ok(def.description.length > 45);
    assert.ok(def.combat.windup >= .45 && def.combat.recovery >= .9);
    assert.ok(def.hp > 0 && def.damage > 0 && def.xp > 0);
  }
});

test('every species has a compatible champion with capped additive budgets and clear warnings', () => {
  for (const id of BESTIARY_SPECIES) {
    const def = BESTIARY_ENEMIES[id], boss = BESTIARY_ENEMIES[def.bossType];
    assert.ok(boss.boss && !boss.species);
    assert.equal(boss.baseType, id);
    assert.equal(boss.questTarget, id);
    assert.equal(boss.family, def.family);
    assert.equal(boss.combat.pattern, def.combat.pattern);
    assert.ok(boss.combat.windup >= 1.15);
    assert.ok(boss.combat.aggroRange < def.combat.aggroRange);
    assert.ok(boss.combat.leashRange <= 300);
    for (const level of [1, 25, 50, 75, 100]) {
      const normal = bestiaryCombatStats(def, level), champion = bestiaryCombatStats(boss, level);
      assert.ok(champion.hp >= normal.hp * 5.1 && champion.hp <= normal.hp * 5.3);
      assert.ok(champion.damage <= Math.max(normal.damage + 1, normal.damage * 1.3));
      assert.ok(champion.xp <= normal.xp * 3.5);
      assert.equal(champion.lootLevel, level);
    }
  }
});

test('all eighty species and their champions actually spawn in the open world without removing original quests', () => {
  const world = expandWorld(makeWorld());
  const normal = new Set(world.enemies.filter(e => !e.boss).map(e => e.type));
  const bosses = new Set(world.enemies.filter(e => e.boss).map(e => e.type));
  for (const id of BESTIARY_SPECIES) {
    assert.ok(normal.has(id), `${id} needs an actual normal encounter`);
    assert.ok(bosses.has(`${id}_boss`), `${id} needs an actual champion encounter`);
  }
  for (const id of Object.keys(ORIGINAL_ENEMIES)) assert.ok(world.enemies.some(enemy => enemy.type === id));
  assert.equal(new Set(world.enemies.map(enemy => enemy.id)).size, world.enemies.length);
  for (const enemy of world.enemies.filter(e => e.bestiary)) {
    assert.ok(enemy.x > 0 && enemy.x < world.width && enemy.y > 0 && enemy.y < world.height);
    assert.equal(enemy.maxHp, bestiaryCombatStats(enemy.type, enemy.level).hp);
    assert.equal(enemy.lootLevel, enemy.level);
    assert.ok(!world.trees.some(tree => Math.hypot(tree.x - enemy.x, tree.y - enemy.y) < 50));
    assert.ok(!world.rocks.some(rock => Math.hypot(rock.x - enemy.x, rock.y - enemy.y) < 50));
  }
});

test('optional early champions stay outside the village and cannot one-shot a fresh hero', () => {
  const world = makeWorld();
  for (const enemy of world.enemies.filter(e => e.bossVariant)) {
    const def = BESTIARY_ENEMIES[enemy.type];
    assert.ok(Math.hypot(enemy.x - 520, enemy.y - 1250) > 650);
    assert.ok(world.shrines.every(shrine => Math.hypot(enemy.x - shrine.x, enemy.y - shrine.y) > def.combat.aggroRange));
    if (enemy.region === 'daemmerhain') assert.ok(enemy.damage < 20, 'Starter champion hits allow a recovery decision');
  }
});

test('frontier packs keep enough quest foes and offer every local species with level-appropriate budgets', () => {
  const world = expandWorld(makeWorld());
  for (const region of EXPANSION_REGIONS) {
    const enemies = world.enemies.filter(enemy => enemy.region === region.id);
    assert.ok(enemies.filter(enemy => !enemy.boss && enemy.type === region.enemy).length >= 12, `${region.id} must keep quest targets available`);
    for (const type of REGION_ENEMY_POOLS[region.id]) assert.ok(enemies.some(enemy => enemy.type === type));
    assert.equal(enemies.filter(enemy => enemy.boss).length, 5);
    const profiles = new Set(enemies.filter(enemy => !enemy.boss).map(enemy => `${enemy.maxHp}:${enemy.damage}:${BESTIARY_ENEMIES[enemy.type].combat.pattern}`));
    assert.ok(profiles.size >= 5);
    for (const enemy of enemies) {
      assert.ok(enemy.level >= region.level && enemy.level <= region.maxLevel);
      assert.equal(enemy.damage, bestiaryCombatStats(enemy.type, enemy.level).damage);
    }
  }
});

test('new attack profiles create real warnings, aimed hexes, separate salvos and charge movement', () => {
  const melee = arena('wolf', 20), hp = melee.game.player.hp;
  melee.game.updateEnemies(.01);
  assert.equal(melee.enemy.phase, 'windup');
  assert.equal(melee.game.player.hp, hp);
  finishWarning(melee.game, melee.enemy);
  assert.ok(melee.game.player.hp < hp);

  const hex = arena('gallows_cultist', 120), hexHp = hex.game.player.hp;
  hex.game.updateEnemies(.01);
  assert.equal(hex.enemy.telegraphX, hex.game.player.x);
  hex.game.player.y += 150;
  finishWarning(hex.game, hex.enemy);
  assert.equal(hex.game.player.hp, hexHp, 'Leaving the marked curse prevents the hit');

  const charge = arena('glacier_ram', 120);
  charge.game.updateEnemies(.01);
  finishWarning(charge.game, charge.enemy);
  assert.ok(charge.enemy.x > charge.enemy.homeX + 100, 'The charge traverses a collision-aware path');

  const burst = arena('soot_priest');
  burst.game.updateEnemies(.01);
  finishWarning(burst.game, burst.enemy);
  assert.equal(burst.game.projectiles.length, 1, 'Salvos give time between their shots');
  burst.game.time += .19;
  burst.game.updateEnemies(.19);
  assert.equal(burst.game.projectiles.length, 2);

  const fan = arena('ice_spider');
  fan.game.updateEnemies(.01); finishWarning(fan.game, fan.enemy);
  assert.equal(fan.game.projectiles.length, 3);
  assert.equal(new Set(fan.game.projectiles.map(p => p.angle)).size, 3);

  const ring = arena('frost_witch');
  ring.game.updateEnemies(.01); finishWarning(ring.game, ring.enemy);
  assert.equal(ring.game.projectiles.length, 6);
  assert.ok(ring.game.projectiles.every(p => p.speed < 150));
});

test('summoners create bounded weaker minions with no farmable rewards and remove them when the caster dies', () => {
  const { game, enemy } = arena('grave_cantor', 120);
  game.updateEnemies(.01); finishWarning(game, enemy);
  let minions = game.world.enemies.filter(e => e.summonedBy === enemy.id);
  assert.equal(minions.length, 2);
  assert.ok(minions.every(e => e.rewardless && e.xp === 0 && e.gold === 0));
  assert.ok(minions.every(e => e.maxHp < bestiaryCombatStats(e.type, e.level).hp * .3));
  enemy.phase = 'idle'; enemy.attackTimer = 0;
  game.updateEnemies(.01); finishWarning(game, enemy);
  assert.equal(game.world.enemies.filter(e => e.summonedBy === enemy.id).length, 2);
  const gold = game.player.gold, xp = game.player.xp, kills = game.kills;
  game.killEnemy(minions[0]);
  assert.equal(game.player.gold, gold);
  assert.equal(game.player.xp, xp);
  assert.equal(game.kills, kills);
  enemy.alive = false;
  game.updateEnemies(.01);
  minions = game.world.enemies.filter(e => e.summonedBy === enemy.id);
  assert.ok(minions.every(e => !e.alive && e.respawnAt === Infinity));
});

test('champion kills count toward the original species quest and survive save restoration', () => {
  let saved;
  const storage = { getItem: () => saved || null, setItem: (key, value) => { saved = value; } };
  const game = new Game({ storage, random: () => .5 });
  game.start();
  const enemy = game.world.enemies.find(e => e.type === 'wolf_boss');
  game.player.x = enemy.x; game.player.y = enemy.y;
  game.killEnemy(enemy);
  assert.equal(game.ledger['kill:wolf'], 1);
  assert.equal(game.ledger['kill:wolf_boss'], 1);
  const restored = new Game({ storage, random: () => .5 });
  assert.equal(restored.world.enemies.find(e => e.id === enemy.id).alive, false);
  assert.equal(restored.ledger['kill:wolf'], 1);
});

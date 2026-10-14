import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES } from '../src/classes.js';
import { createBestiaryEnemy, REGION_ENEMY_POOLS } from '../src/bestiary.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { CONTENT_HUNTS, CONTENT_HUNT_REWARDS } from '../src/hunt-content.js';
import { NAMED_BOSS_HUNTS } from '../src/encounter-content.js';
import { HUNTS, HUNT_REWARDS, huntRewardLevel, validateEndgameState } from '../src/endgame.js';
import { generateLoot, ITEM_BASES, validateLootItem } from '../src/loot.js';
import { equipmentSlot } from '../src/equipment-system.js';
import { resolveWaypoint } from '../src/navigation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const approach = (game, object) => Object.assign(game.player, { x: object.x, y: object.y });
function fresh(level = 100, classId = 'guardian') {
  const game = new Game({ storage: null, random: () => .5 });
  assert.equal(game.selectClass(classId), true);
  game.world.enemies = [];
  // These tests verify content progression through native interaction and
  // combat resolution. Deterministic one-hit health fixtures isolate rewards
  // from the separate full-health encounter balance and AI audits.
  game.updateEnemies = () => {};
  game.player.level = level;
  game.player.hp = game.stats().maxHp;
  game.player.mana = game.stats().mana;
  game.start();
  return game;
}
function defeatByAttack(game, enemy) {
  assert.ok(enemy.alive);
  enemy.hp = 1;
  Object.assign(game.player, { x: enemy.x - 35, y: enemy.y, face: 0 });
  game.cooldowns.attack = 0;
  assert.equal(game.action('attack'), true);
  assert.equal(enemy.alive, false, `${enemy.type} dies through the native attack`);
}
function ordinaryKills(game, objective) {
  for (let count = 0; count < objective.count; count++) {
    const enemy = createBestiaryEnemy(objective.target, `content-hunt-foe-${objective.target}-${count}`, game.player.x + 35, game.player.y, { level: game.player.level });
    game.world.enemies.push(enemy);
    defeatByAttack(game, enemy);
  }
}
function solveBossEncounter(game, id) {
  const event = game.world.worldEvents.find(candidate => candidate.id === id);
  const start = game.world.eventObjects.find(object => object.id === `${id}:start`);
  const ledgerBefore = game.ledger[`world_event:${id}`] || 0;
  approach(game, start);
  assert.equal(game.interactWorldEvent(start.id), true);
  for (const track of game.world.eventObjects.filter(object => object.eventId === id && object.role === 'rune' && !object.hidden)) {
    approach(game, track);
    assert.equal(game.interactWorldEvent(track.id), true);
  }
  let defeatedBoss = false;
  for (let frame = 0; frame < 40 && event.state === 'active'; frame++) {
    approach(game, event);
    game.time += .25;
    game.updateWorld(.25, [game]);
    for (const enemy of game.world.enemies.filter(actor => actor.eventId === id && actor.alive)) {
      assert.equal(enemy.rewardless, true);
      if (enemy.boss) defeatedBoss = true;
      defeatByAttack(game, enemy);
    }
  }
  assert.equal(defeatedBoss, true, `${id} creates its real boss`);
  assert.equal(event.state, 'success');
  assert.equal(game.ledger[`world_event:${id}`], ledgerBefore + 1);
  return event;
}
function earnedFixture(game, id, count) {
  const hunt = HUNTS.find(candidate => candidate.id === id);
  game.endgame = { version: 1, tokens: hunt.reward.tokens * count, totalClaims: count, active: [], completed: { [id]: count } };
  assert.equal(validateEndgameState(game.endgame), true);
}
function stableSave(game) {
  const captured = clone(game.capture());
  delete captured.savedAt;
  return captured;
}

test('six authored hunts append to the original eleven and use repeatable regional kills plus their own named encounter', () => {
  assert.equal(HUNTS.length, 17);
  assert.equal(HUNTS.filter(hunt => !CONTENT_HUNTS.includes(hunt)).length, 11);
  assert.equal(HUNT_REWARDS.length, 9);
  assert.equal(new Set(HUNTS.map(hunt => hunt.id)).size, HUNTS.length);
  assert.equal(new Set(HUNT_REWARDS.map(reward => reward.id)).size, HUNT_REWARDS.length);
  for (const [index, hunt] of CONTENT_HUNTS.entries()) {
    const encounter = NAMED_BOSS_HUNTS[index];
    assert.equal(HUNTS.find(candidate => candidate.id === hunt.id), hunt);
    assert.equal(hunt.minLevel, encounter.level);
    assert.equal(hunt.maxLevel, Math.min(100, encounter.level + 14));
    assert.equal(hunt.partyRequired, 1);
    assert.equal(hunt.region, encounter.region);
    assert.deepEqual(hunt.objectives.map(objective => [objective.kind, objective.target, objective.count]), [
      ['kill', REGION_ENEMY_POOLS[hunt.region][0], 3],
      ['kill', REGION_ENEMY_POOLS[hunt.region][1], 3],
      ['world_event', encounter.id, 1],
    ]);
    assert.ok(hunt.objectives.every(objective => objective.fresh === true));
    assert.ok(hunt.description.length > 110);
    assert.deepEqual(hunt.waypoint, { kind: 'event', id: encounter.id });
    assert.deepEqual(hunt.reward, { tokens: 3 + index * 2, dust: 4 + index * 3 });
    assert.ok(Object.isFrozen(hunt) && Object.isFrozen(hunt.objectives) && Object.isFrozen(hunt.reward));
  }
  assert.deepEqual(CONTENT_HUNT_REWARDS.map(reward => [reward.slot, reward.cost]), [['helmet', 8], ['gloves', 7], ['boots', 7], ['charm', 10]]);
});

for (const hunt of CONTENT_HUNTS) test(`${hunt.id}: real regional attacks and its named encounter complete a fresh route and pay once`, () => {
  const game = fresh(hunt.minLevel);
  for (const objective of hunt.objectives) game.event(objective.kind, objective.target, objective.count);
  assert.equal(game.startHunt(hunt.id), true);
  const state = game.endgame.active[0];
  assert.deepEqual(state.counts, [0, 0, 0], 'Historical progress is never backfilled');
  assert.equal(game.claimHunt(hunt.id), false);
  ordinaryKills(game, hunt.objectives[0]);
  assert.deepEqual(state.counts, [3, 0, 0]);
  ordinaryKills(game, hunt.objectives[1]);
  assert.deepEqual(state.counts, [3, 3, 0]);
  const bossId = NAMED_BOSS_HUNTS.find(encounter => encounter.id === hunt.waypoint.id).boss;
  game.event('boss', bossId);
  game.event('world_event', 'event-imaginary');
  assert.deepEqual(state.counts, [3, 3, 0], 'A raw boss record or another event cannot replace this completed encounter');
  const destination = resolveWaypoint(game, hunt.waypoint.kind, hunt.waypoint.id);
  assert.ok(destination && Number.isFinite(destination.x) && Number.isFinite(destination.y));
  solveBossEncounter(game, hunt.waypoint.id);
  assert.deepEqual(state.counts, [3, 3, 1]);
  assert.equal(game.endgameSummary().active[0].ready, true);
  const dust = game.resources.dust;
  assert.equal(game.claimHunt(hunt.id), true);
  assert.equal(game.endgame.tokens, hunt.reward.tokens);
  assert.equal(game.resources.dust, dust + hunt.reward.dust);
  assert.equal(game.endgame.totalClaims, 1);
  assert.equal(game.endgame.completed[hunt.id], 1);
  const after = clone(game.endgame);
  assert.equal(game.claimHunt(hunt.id), false);
  assert.deepEqual(game.endgame, after);
  const loaded = fresh(hunt.minLevel);
  loaded.applySave(clone(game.capture()));
  assert.deepEqual(loaded.endgame, after);
  assert.equal(loaded.claimHunt(hunt.id), false);
  assert.equal(loaded.startHunt(hunt.id), true);
  assert.deepEqual(loaded.endgame.active[0].counts, [0, 0, 0], 'A repeated route also starts with new activity');
});

test('rewardless event actors and incomplete participation never substitute for ordinary regional kills', () => {
  const hunt = CONTENT_HUNTS[0], game = fresh(hunt.minLevel);
  assert.equal(game.startHunt(hunt.id), true);
  const actor = createBestiaryEnemy(hunt.objectives[0].target, 'rewardless-hunt-fixture', game.player.x + 35, game.player.y, { level: game.player.level });
  actor.rewardless = true;
  game.world.enemies.push(actor);
  defeatByAttack(game, actor);
  assert.deepEqual(game.endgame.active[0].counts, [0, 0, 0]);
  const event = game.world.worldEvents.find(candidate => candidate.id === hunt.waypoint.id);
  approach(game, event);
  assert.equal(game.interactWorldEvent(`${event.id}:start`), true);
  game.time += 21;
  game.player.x += 1200;
  game.updateWorld(21, [game]);
  assert.equal(event.state, 'failure');
  assert.deepEqual(game.endgame.active[0].counts, [0, 0, 0]);
  assert.equal(game.claimHunt(hunt.id), false);
});

test('new enrollment preserves the two-route cap and rejects tiers outside the hunting window', () => {
  const game = fresh(12);
  assert.equal(game.startHunt('hunt-sivra'), true);
  assert.equal(game.startHunt('hunt-irdan'), true);
  assert.equal(game.startHunt('hunt-sivra'), false);
  assert.equal(game.startHunt('hunt-wurzelgewoelbe'), false);
  assert.equal(game.endgame.active.length, 2);
  assert.equal(game.abandonHunt('hunt-sivra'), true);
  assert.equal(game.startHunt('hunt-wurzelgewoelbe'), true);
  assert.equal(fresh(3).startHunt('hunt-sivra'), false);
  assert.equal(fresh(19).startHunt('hunt-sivra'), false);
  assert.equal(fresh(100).startHunt('hunt-irdan'), false);
  assert.equal(fresh(100).startHunt('hunt-asterion'), true);
});

test('old eleven-route saves retain their history and new partial progress round-trips without retroactive credit', () => {
  const original = HUNTS.find(hunt => hunt.id === 'hunt-moon'), game = fresh(55);
  assert.equal(game.startHunt(original.id), true);
  game.event('kill', original.objectives[0].target, 2);
  const saved = clone(game.capture()), loaded = fresh(55);
  loaded.applySave(saved);
  assert.deepEqual(loaded.endgame, game.endgame);
  assert.equal(loaded.startHunt('hunt-vey'), true);
  assert.deepEqual(loaded.endgame.active.find(hunt => hunt.id === 'hunt-vey').counts, [0, 0, 0]);
  game.abandonHunt(original.id);
  game.startHunt('hunt-vey');
  ordinaryKills(game, CONTENT_HUNTS.find(hunt => hunt.id === 'hunt-vey').objectives[0]);
  const savedNew = clone(game.capture());
  loaded.applySave(savedNew);
  assert.deepEqual(loaded.endgame, game.endgame);
  assert.deepEqual(loaded.endgame.active[0].counts, [3, 0, 0]);
  delete saved.endgame;
  const legacy = fresh(55);
  legacy.applySave(saved);
  assert.deepEqual(legacy.endgame, { version: 1, tokens: 0, totalClaims: 0, active: [], completed: {} });
});

test('forged new counts, currency, histories and route identities reject save imports atomically', () => {
  const game = fresh(12);
  assert.equal(game.startHunt('hunt-irdan'), true);
  const saved = clone(game.capture());
  for (const corrupt of [
    value => value.endgame.active[0].counts[0] = 4,
    value => value.endgame.active[0].counts[2] = 2,
    value => value.endgame.active[0].counts[0] = -1,
    value => value.endgame.active[0].counts[0] = .5,
    value => value.endgame.active[0].counts.pop(),
    value => value.endgame.active.push(clone(value.endgame.active[0])),
    value => value.endgame.active[0].id = 'hunt-forged',
    value => value.endgame.tokens = 1,
    value => value.endgame.completed['hunt-irdan'] = 1,
    value => { value.endgame.completed['hunt-irdan'] = 1; value.endgame.totalClaims = 1; value.endgame.tokens = 6; },
  ]) {
    const forged = clone(saved);
    corrupt(forged);
    assert.equal(validateEndgameState(forged.endgame), false);
    const before = stableSave(game);
    assert.throws(() => game.applySave(forged));
    assert.deepEqual(stableSave(game), before);
  }
});

for (const cls of CLASSES) test(`${cls.id}: all four new rewards buy valid rare gear for the earned level and correct slot`, () => {
  const game = fresh(26, cls.id);
  // A valid already-earned hunting balance isolates purchase and equipment
  // behavior; the six preceding tests verify the routes' native reward claims.
  earnedFixture(game, 'hunt-irdan', 7);
  assert.equal(huntRewardLevel(game), 26);
  for (const reward of CONTENT_HUNT_REWARDS) {
    const before = new Set(Object.keys(game.generatedItems)), tokens = game.endgame.tokens;
    assert.equal(game.redeemHuntReward(reward.id), true);
    const item = Object.values(game.generatedItems).find(candidate => !before.has(candidate.id));
    assert.ok(item);
    assert.equal(validateLootItem(item), true);
    assert.equal(equipmentSlot(item), reward.slot);
    assert.equal(item.rarity, 'rare');
    assert.equal(item.level, 26);
    assert.equal(item.classId, cls.id);
    assert.equal(item.source, 'hunt_reward');
    assert.equal(item.relic, undefined);
    const base = ITEM_BASES.find(candidate => candidate.id === item.baseId);
    assert.ok(!base.classIds || base.classIds.includes(cls.id));
    assert.equal(game.endgame.tokens, tokens - reward.cost);
    assert.equal(game.canEquipItem(item.id), true);
    assert.equal(game.equip(item.id), true);
    assert.equal(game.equipment[reward.slot], item.id);
  }
  const loaded = fresh(26, cls.id);
  loaded.applySave(clone(game.capture()));
  assert.deepEqual(loaded.equipment, game.equipment);
  assert.deepEqual(loaded.endgame, game.endgame);
});

test('Sivra farming cannot produce level-100 rewards or unlock an epic purchase at level 100', () => {
  const game = fresh(100), low = CONTENT_HUNTS[0];
  earnedFixture(game, low.id, 20);
  assert.equal(huntRewardLevel(game), 18);
  assert.equal(game.startHunt(low.id), false);
  const tokens = game.endgame.tokens;
  assert.equal(game.redeemHuntReward('hunt-epic'), false);
  assert.equal(game.endgame.tokens, tokens);
  for (const reward of CONTENT_HUNT_REWARDS) {
    const before = new Set(Object.keys(game.generatedItems));
    assert.equal(game.redeemHuntReward(reward.id), true);
    const item = Object.values(game.generatedItems).find(candidate => !before.has(candidate.id));
    assert.equal(item.level, 18);
    assert.equal(item.rarity, 'rare');
  }
  assert.equal(game.endgameSummary().rewards.find(reward => reward.id === 'hunt-epic').affordable, false);
});

test('each new purchase preserves currency and item serial on a full bag and succeeds after a real stash transfer', () => {
  const game = fresh(26);
  earnedFixture(game, 'hunt-irdan', 7);
  for (let index = 0; index < 240; index++) assert.equal(game.addItem(generateLoot({ level: 26, classId: 'guardian', baseId: 'iron_longsword', rarity: 'rare', uid: `expanded-hunt-full-${index}`, rng: () => .5 })), true);
  const before = stableSave(game), serial = game.lootSerial, tokens = game.endgame.tokens;
  for (const reward of CONTENT_HUNT_REWARDS) {
    assert.equal(game.redeemHuntReward(reward.id), false);
    assert.equal(game.endgame.tokens, tokens);
    assert.equal(game.lootSerial, serial);
    assert.deepEqual(stableSave(game), before);
  }
  const removed = Object.keys(game.inventory).find(id => id.startsWith('loot:'));
  assert.equal(game.depositItem(removed), true);
  assert.equal(game.bagUsed(), 239);
  assert.equal(game.redeemHuntReward(CONTENT_HUNT_REWARDS[0].id), true);
  assert.equal(game.bagUsed(), 240);
  assert.equal(game.endgame.tokens, tokens - CONTENT_HUNT_REWARDS[0].cost);
});

test('new hunt claims and targeted purchases obey death, combat, settlement and PvP guards', () => {
  const game = fresh(26);
  earnedFixture(game, 'hunt-irdan', 7);
  const reward = CONTENT_HUNT_REWARDS[0];
  game.dead = true;
  assert.equal(game.startHunt('hunt-irdan'), false);
  assert.equal(game.redeemHuntReward(reward.id), false);
  game.dead = false;
  game.player.lastDamageAt = game.time;
  assert.equal(game.redeemHuntReward(reward.id), false);
  delete game.player.lastDamageAt;
  game.player.x = 1500;
  game.player.y = 800;
  assert.equal(game.inSettlement(), false);
  assert.equal(game.redeemHuntReward(reward.id), false);
  approach(game, { x: 520, y: 1250 });
  assert.equal(game.startHunt('hunt-irdan'), true);
  game.endgame.active[0].counts = [3, 3, 1];
  game.dead = true;
  assert.equal(game.claimHunt('hunt-irdan'), false);
  game.dead = false;
  const before = clone(game.endgame);
  game.worldMode = 'pvp';
  assert.equal(game.startHunt('hunt-sivra'), false);
  assert.equal(game.claimHunt('hunt-irdan'), false);
  assert.equal(game.redeemHuntReward(reward.id), false);
  assert.deepEqual(game.endgame, before);
});

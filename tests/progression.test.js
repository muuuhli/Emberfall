import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SAVE_KEY } from '../src/game.js';
import { ITEMS, QUESTS, RECIPES } from '../src/content.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function freshGame(storage = memoryStorage()) {
  const game = new Game({ storage, random: () => 0.5 });
  game.start();
  return game;
}

function snapshot(game) {
  const value = JSON.parse(JSON.stringify(game.capture()));
  delete value.savedAt;
  return value;
}

function completeQuest(game, id) {
  assert.equal(game.questAccept(id), true, `Accept ${id}`);
  for (const objective of QUESTS.find(quest => quest.id === id).objectives) {
    game.event(objective.kind, objective.target, objective.count);
  }
  assert.equal(game.questTurnIn(id), true, `Turn in ${id}`);
}

function standAt(game, object) {
  game.player.x = object.x;
  game.player.y = object.y;
}

test('quests enforce prerequisites, matching events, and reward once', () => {
  const game = freshGame();
  assert.equal(game.questAccept('q_erste_klinge'), false);
  assert.equal(game.questAccept('q_hainwacht'), true);
  assert.equal(game.questAccept('q_hainwacht'), false);
  game.event('kill', 'slime', 9);
  assert.deepEqual(game.questState.q_hainwacht.counts, [0]);
  game.event('kill', 'wolf', 3);
  assert.equal(game.questState.q_hainwacht.status, 'active');
  assert.equal(game.questTurnIn('q_hainwacht'), false);
  game.event('kill', 'wolf', 12);
  assert.deepEqual(game.questState.q_hainwacht.counts, [4]);
  assert.equal(game.questState.q_hainwacht.status, 'ready');
  const gold = game.player.gold;
  const potionCount = game.inventory.heal_potion;
  assert.equal(game.questTurnIn('q_hainwacht'), true);
  assert.equal(game.player.gold, gold + 35);
  assert.equal(game.inventory.heal_potion, potionCount + 1);
  const afterReward = snapshot(game);
  assert.equal(game.questTurnIn('q_hainwacht'), false);
  assert.deepEqual(snapshot(game), afterReward);
  assert.equal(game.questAccept('q_erste_klinge'), true);
});

test('early boss kills count retroactively and persist without respawning', () => {
  const storage = memoryStorage();
  const game = freshGame(storage);
  completeQuest(game, 'q_hainwacht');
  completeQuest(game, 'q_erste_klinge');
  const boss = game.world.enemies.find(enemy => enemy.type === 'thorn_guardian');
  game.killEnemy(boss);
  assert.equal(boss.alive, false);
  assert.equal(game.ledger['kill:thorn_guardian'], 1);
  const afterKill = game.player.gold;
  game.killEnemy(boss);
  assert.equal(game.player.gold, afterKill);
  const restored = freshGame(storage);
  const restoredBoss = restored.world.enemies.find(enemy => enemy.id === boss.id);
  assert.equal(restoredBoss.alive, false);
  restored.time += 500;
  restored.updateEnemies(0.04);
  assert.equal(restoredBoss.alive, false);
  assert.equal(restored.questAccept('q_grimmwurzel'), true);
  assert.deepEqual(restored.questState.q_grimmwurzel.counts, [0, 1]);
  restored.event('kill', 'slime', 5);
  assert.equal(restored.questState.q_grimmwurzel.status, 'ready');
});

test('equipment recomputes stats without repeated equip drift', () => {
  const game = freshGame();
  const initialStats = game.stats();
  const initialLevel = game.player.level;
  game.addItem('forest_blade');
  const expectedDamage = initialStats.damage - ITEMS.rusty_blade.stats.damage + ITEMS.forest_blade.stats.damage;
  for (let i = 0; i < 12; i++) assert.equal(game.equip('forest_blade'), true);
  assert.equal(game.stats().damage, expectedDamage);
  assert.equal(game.player.level, initialLevel);
  assert.equal(game.equip('rusty_blade'), true);
  assert.deepEqual(game.stats(), initialStats);
  assert.equal(game.equip('ember_edge'), false, 'Cannot equip an unowned item');
});

test('charm equipment applies the legendary reward and survives saving', () => {
  const storage = memoryStorage();
  const game = freshGame(storage);
  const before = game.stats();
  game.addItem('ember_charm');
  assert.equal(game.equip('ember_charm'), true);
  assert.equal(game.equipment.charm, 'ember_charm');
  assert.equal(game.stats().maxHp, before.maxHp + 35);
  assert.equal(game.stats().spellDamage, before.spellDamage + 12);
  const restored = freshGame(storage);
  assert.equal(restored.equipment.charm, 'ember_charm');
  assert.deepEqual(restored.stats(), game.stats());
});

test('talents require a parent, consume points, and stop at maximum rank', () => {
  const game = freshGame();
  assert.equal(game.learn('guardian_steel'), false);
  assert.equal(game.player.skillPoints, 2);
  assert.equal(game.learn('guardian_vigor'), true);
  assert.equal(game.player.skillPoints, 1);
  assert.equal(game.learn('guardian_steel'), true);
  assert.equal(game.player.skillPoints, 0);
  assert.equal(game.learn('guardian_vigor'), false);
  game.player.skillPoints = 10;
  assert.equal(game.learn('guardian_vigor'), true);
  assert.equal(game.learn('guardian_vigor'), true);
  const remaining = game.player.skillPoints;
  assert.equal(game.learn('guardian_vigor'), false);
  assert.equal(game.skills.guardian_vigor, 3);
  assert.equal(game.player.skillPoints, remaining);
});

test('cooldown talents shorten spells and dodge without negative durations', () => {
  const game = freshGame();
  assert.equal(game.action('bolt'), true);
  const boltBase = game.cooldowns.bolt;
  assert.equal(game.action('dash'), true);
  const dashBase = game.cooldowns.dash;
  game.skills.arcane_mastery = 3;
  game.skills.ranger_escape = 3;
  game.cooldowns.bolt = 0;
  game.cooldowns.dash = 0;
  game.player.mana = game.stats().mana;
  assert.equal(game.action('bolt'), true);
  assert.equal(game.action('dash'), true);
  assert.ok(game.cooldowns.bolt > 0 && game.cooldowns.bolt < boltBase);
  assert.ok(game.cooldowns.dash > 0 && game.cooldowns.dash < dashBase);
  assert.ok(Math.abs(game.cooldowns.bolt - boltBase * 0.7) < 1e-9);
  assert.ok(Math.abs(game.cooldowns.dash - dashBase * 0.55) < 1e-9);
});

test('crafting is atomic on insufficient materials and pays exact costs on success', () => {
  const game = freshGame();
  const recipe = RECIPES.find(recipe => recipe.id === 'forge_forest');
  game.resources.wood = 5;
  game.resources.ore = 3;
  const before = snapshot(game);
  assert.equal(game.craft(recipe.id), false);
  assert.deepEqual(snapshot(game), before);
  game.resources.ore = 4;
  assert.equal(game.craft(recipe.id), true);
  assert.equal(game.resources.wood, 0);
  assert.equal(game.resources.ore, 0);
  assert.equal(game.inventory.forest_blade, 1);
  assert.equal(game.ledger['craft:forge_forest'], 1);
  const after = snapshot(game);
  assert.equal(game.craft(recipe.id), false);
  assert.deepEqual(snapshot(game), after);
});

test('farming takes a seed, waits for growth, and emits harvest quest progress once', () => {
  const game = freshGame();
  const plot = game.world.plots[0];
  game.questAccept('q_acker');
  standAt(game, plot);
  const seeds = game.resources.seed;
  game.interact();
  assert.equal(plot.state, 'growing');
  assert.equal(game.resources.seed, seeds - 1);
  game.interact();
  assert.equal(game.resources.wheat, 0);
  game.time = plot.readyAt - 0.01;
  game.interact();
  assert.equal(game.resources.wheat, 0);
  game.time = plot.readyAt;
  game.update(0.01);
  assert.equal(plot.state, 'ripe');
  game.interact();
  assert.equal(plot.state, 'empty');
  assert.equal(game.resources.wheat, 3);
  assert.equal(game.resources.seed, seeds);
  assert.equal(game.ledger['farm:wheat'], 3);
  assert.equal(game.questState.q_acker.status, 'ready');
  game.interact(); // Plant a new crop, rather than harvesting the previous crop twice.
  assert.equal(game.resources.wheat, 3);
  assert.equal(game.ledger['farm:wheat'], 3);
});

test('depleted resource nodes cannot grant duplicate gather rewards', () => {
  const game = freshGame();
  const node = game.world.nodes.find(node => node.type === 'wood');
  standAt(game, node);
  game.interact();
  assert.equal(game.resources.wood, 2);
  assert.equal(node.readyAt, game.time + 40);
  const xp = game.player.xp;
  game.interact();
  assert.equal(game.resources.wood, 2);
  assert.equal(game.player.xp, xp);
  assert.equal(game.ledger['gather:wood'], 2);
  game.time = node.readyAt;
  game.interact();
  assert.equal(game.resources.wood, 4);
});

test('heal potions use their own restore value without refilling mana', () => {
  const game = freshGame();
  game.inventory = { heal_potion: 1 };
  game.player.hp = 10;
  game.player.mana = 0;
  assert.equal(game.action('potion'), true);
  assert.equal(game.player.hp, 10 + ITEMS.heal_potion.stats.hpRestore);
  assert.equal(game.player.mana, 0);
  assert.equal(game.inventory.heal_potion, 0);
});

test('mana potions restore mana and leave current health unchanged', () => {
  const game = freshGame();
  game.inventory = { mana_potion: 1 };
  game.player.hp = 20;
  game.player.mana = 0;
  assert.equal(game.consume('mana_potion'), true);
  assert.equal(game.player.hp, 20);
  assert.equal(game.player.mana, ITEMS.mana_potion.stats.manaRestore);
});

test('the quick healing action does not waste a potion when health is full', () => {
  const game = freshGame();
  game.inventory = { heal_potion: 1 };
  game.player.hp = game.stats().maxHp;
  game.player.mana = 0;
  assert.equal(game.action('potion'), false);
  assert.equal(game.inventory.heal_potion, 1);
  assert.equal(game.cooldowns.potion, 0);
});

test('corrupted primary save loads the last intact backup', () => {
  const storage = memoryStorage();
  const game = freshGame(storage);
  game.player.gold = 123;
  game.time = 42;
  assert.equal(game.save(false), true);
  game.player.gold = 456;
  assert.equal(game.save(false), true);
  storage.setItem(SAVE_KEY, '{broken-json');
  const restored = freshGame(storage);
  assert.equal(restored.player.gold, 123);
  assert.equal(restored.time, 42);
  assert.equal(restored.hasSave, true);
});

test('invalid import is rejected atomically without changing the current journey', async () => {
  const game = freshGame();
  game.player.gold = 432;
  game.resources.crystal = 11;
  game.skills.guardian_vigor = 2;
  const before = snapshot(game);
  const invalid = structuredClone(before);
  invalid.player.gold = 99999;
  invalid.world.nodes = { not: 'an array' };
  const file = { text: async () => JSON.stringify(invalid) };
  assert.equal(await game.importSave(file), false);
  assert.deepEqual(snapshot(game), before);
  assert.equal(game.started, true);
});

test('a valid exported snapshot restores equipment, materials and active quest counts', async () => {
  const source = freshGame();
  source.player.gold = 234;
  source.resources.ore = 7;
  source.questAccept('q_hainwacht');
  source.event('kill', 'wolf', 2);
  source.addItem('forest_blade');
  source.equip('forest_blade');
  source.learn('guardian_vigor');
  const data = snapshot(source);
  const imported = freshGame();
  assert.equal(await imported.importSave({ text: async () => JSON.stringify(data) }), true);
  assert.equal(imported.player.gold, 234);
  assert.equal(imported.resources.ore, 7);
  assert.equal(imported.equipment.weapon, 'forest_blade');
  assert.equal(imported.skills.guardian_vigor, 1);
  assert.deepEqual(imported.questState.q_hainwacht, { status: 'active', counts: [2] });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SAVE_KEY } from '../src/game.js';
import { NPCS, QUESTS, ENEMY_TYPES, SKILLS } from '../src/catalog.js';
import { EQUIPMENT_SLOT_IDS } from '../src/equipment-system.js';
import { STASH_CAPACITY, LOADOUT_CAPACITY } from '../src/inventory-system.js';
import { generateLoot, computeItemStats, validateLootItem } from '../src/loot.js';
import { getAbility } from '../src/abilities.js';

const clone = value => JSON.parse(JSON.stringify(value));
const memoryStorage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, String(value)), removeItem: key => values.delete(key) };
};
function fixture({ classId = 'guardian', level = 100, storage = null } = {}) {
  const game = new Game({ storage, random: () => .5 });
  assert.equal(game.selectClass(classId), true);
  game.player.level = level; game.player.gold = 10000; game.player.skillPoints = 200;
  for (const key of ['trees', 'rocks', 'structures', 'enemies', 'nodes', 'plots', 'chests', 'shrines', 'interactions', 'dungeonEntrances']) game.world[key] = [];
  game.npcs = [];
  game.start();
  game.player.hp = 20; game.player.mana = 12;
  return game;
}
let serial = 0;
function loot(game, options = {}) {
  const item = generateLoot({ classId: game.player.classId, level: game.player.level, rarity: 'rare', rng: () => .5, uid: `inventory-workflow-${++serial}`, baseId: 'iron_longsword', ...options });
  assert.equal(validateLootItem(item), true);
  assert.equal(game.addItem(item), true);
  return item;
}
function assertUnchanged(game, before) {
  for (const key of ['inventory', 'stash', 'generatedItems', 'itemFlags', 'equipment', 'abilityLoadout', 'cooldowns', 'resources']) assert.deepEqual(game[key], before[key], key);
  assert.equal(game.player.gold, before.gold);
  assert.equal(game.player.hp, before.hp);
  assert.equal(game.player.mana, before.mana);
}
const state = game => ({ ...Object.fromEntries(['inventory', 'stash', 'generatedItems', 'itemFlags', 'equipment', 'abilityLoadout', 'cooldowns', 'resources'].map(key => [key, clone(game[key])])), gold: game.player.gold, hp: game.player.hp, mana: game.player.mana });

test('all seven slots compare total character values, equip separately and survive a real saved reload', () => {
  const storage = memoryStorage(), game = fixture({ storage });
  const bases = { weapon: 'iron_longsword', armor: 'grave_heavy_8', charm: 'grave_martial_charm_8', helmet: 'relic_helmet_4_1', gloves: 'relic_gloves_4_2', boots: 'relic_boots_4_2', ring: 'relic_ring_4_1' };
  const expected = {};
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const item = loot(game, { baseId: bases[slot], rng: () => ['helmet', 'gloves', 'boots', 'ring'].includes(slot) ? .1 : .5 }), inventoryBefore = clone(game.inventory), rolled = clone(item);
    const oldEquipment = clone(game.equipment), before = game.stats(), preview = game.previewEquipment(item.id);
    assert.equal(preview.slot, slot);
    assert.deepEqual(preview.before, before);
    assert.equal(preview.currentId, oldEquipment[slot]);
    assert.equal(game.equip(item.id), true);
    expected[slot] = item.id;
    assert.equal(game.equipment[slot], item.id);
    for (const other of EQUIPMENT_SLOT_IDS.filter(other => other !== slot)) assert.equal(game.equipment[other], oldEquipment[other]);
    assert.deepEqual(game.stats(), preview.after);
    if (slot === 'gloves') assert.ok(Math.abs(preview.delta.maxHp - computeItemStats(item).maxHp - 100) < 1e-9, 'Comparing the second small set piece includes the set health bonus.');
    if (slot === 'boots') assert.equal(preview.delta.lifeSteal, .025, 'Comparing the third small set piece includes the set lifesteal bonus.');
    for (const [stat, delta] of Object.entries(preview.delta)) assert.ok(Math.abs(delta - (preview.after[stat] - preview.before[stat])) < 1e-9);
    assert.equal(game.player.hp, 20); assert.equal(game.player.mana, 12);
    assert.deepEqual(game.inventory, inventoryBefore);
    assert.deepEqual(game.generatedItems[item.id], rolled);
  }
  assert.deepEqual(game.equipment, expected);
  assert.equal(game.save(false), true);
  const encoded = JSON.parse(storage.getItem(SAVE_KEY));
  assert.deepEqual(encoded.equipment, expected);
  const restored = new Game({ storage, random: () => .5 });
  assert.deepEqual(restored.equipment, expected);
  assert.deepEqual(restored.stats(), game.stats());
  assert.deepEqual(restored.generatedItems, game.generatedItems);
  assert.equal(restored.player.hp, 20); assert.equal(restored.player.mana, 12);
  const armorId = restored.equipment.armor;
  assert.equal(restored.unequip('helmet'), true);
  assert.equal(restored.equipment.helmet, null); assert.equal(restored.equipment.armor, armorId);
  assert.equal(restored.inventory[expected.helmet], 1);
  assert.equal(restored.equip(expected.helmet), true);
  assert.equal(restored.unequip('offhand'), false);
});

test('favorite and locked flags independently prevent selling and salvaging without losing gold, materials or item rolls', () => {
  const game = fixture(), item = loot(game, { baseId: 'relic_ring_4_1' });
  assert.equal(game.setItemFlag(item.id, 'favorite'), true);
  let before = state(game);
  assert.equal(game.sell(item.id), false); assert.equal(game.salvage(item.id), false); assertUnchanged(game, before);
  assert.equal(game.setItemFlag(item.id, 'locked'), true);
  assert.equal(game.setItemFlag(item.id, 'favorite'), true);
  assert.deepEqual(game.itemFlags[item.id], { favorite: false, locked: true });
  before = state(game);
  assert.equal(game.sell(item.id), false); assert.equal(game.salvage(item.id), false); assertUnchanged(game, before);
  assert.equal(game.setItemFlag(item.id, 'unknown'), false);
  assert.equal(game.setItemFlag('missing-item', 'favorite'), false);
  assert.equal(game.setItemFlag(item.id, 'locked'), true);
  const gold = game.player.gold;
  assert.equal(game.sell(item.id), true);
  assert.equal(game.player.gold, gold + Math.max(1, Math.floor(item.price * .4)));
  assert.equal(game.generatedItems[item.id], undefined);
  assert.equal(game.itemFlags[item.id], undefined);
  const second = loot(game, { baseId: 'relic_gloves_4_2' });
  assert.equal(game.equip(second.id), true);
  before = state(game);
  assert.equal(game.sell(second.id), false); assert.equal(game.salvage(second.id), false); assertUnchanged(game, before);
  assert.equal(game.unequip('gloves'), true);
  assert.equal(game.salvage(second.id), true);
  assert.ok(game.resources.dust > before.resources.dust);
  assert.equal(game.generatedItems[second.id], undefined);
});

test('stash transfer requires a settlement and a quiet moment and preserves generated rolls, flags and metadata through saving', () => {
  const game = fixture(), item = loot(game, { baseId: 'relic_helmet_4_1', rarity: 'epic' });
  item.upgrade = 4; item.sockets[0] = { id: 'emerald', tier: 3 };
  assert.equal(game.setItemFlag(item.id, 'favorite'), true);
  assert.equal(game.setItemFlag(item.id, 'locked'), true);
  const canonical = clone(item), stats = computeItemStats(item);
  Object.assign(game.player, { x: 1500, y: 1500 });
  assert.equal(game.inSettlement(), false);
  let before = state(game);
  assert.equal(game.depositItem(item.id), false); assertUnchanged(game, before);
  Object.assign(game.player, { x: 520, y: 1250, lastDamageAt: game.time });
  before = state(game);
  assert.equal(game.depositItem(item.id), false); assertUnchanged(game, before);
  delete game.player.lastDamageAt;
  assert.equal(game.equip(item.id), true);
  assert.equal(game.depositItem(item.id), false, 'Worn equipment cannot be moved into the stash.');
  assert.equal(game.unequip('helmet'), true);
  assert.equal(game.depositItem(item.id), true);
  assert.equal(game.inventory[item.id], undefined); assert.equal(game.stash[item.id], 1);
  assert.deepEqual(game.generatedItems[item.id], canonical);
  assert.deepEqual(computeItemStats(game.item(item.id)), stats);
  assert.equal(game.setItemFlag(item.id, 'locked'), true, 'Flags remain editable on stored equipment.');
  const saved = clone(game.capture()), restored = fixture();
  restored.applySave(saved);
  assert.equal(restored.inventory[item.id] || 0, 0); assert.equal(restored.stash[item.id], 1);
  assert.deepEqual(restored.generatedItems[item.id], canonical);
  assert.deepEqual(restored.itemFlags[item.id], { favorite: true, locked: false });
  restored.player.lastDamageAt = restored.time;
  assert.equal(restored.withdrawItem(item.id), false);
  delete restored.player.lastDamageAt;
  assert.equal(restored.withdrawItem(item.id), true);
  assert.equal(restored.stash[item.id], undefined); assert.equal(restored.inventory[item.id], 1);
  assert.deepEqual(restored.generatedItems[item.id], canonical);
  assert.equal(restored.sell(item.id), false, 'A stored favorite remains protected after withdrawal.');
  const shared = loot(restored, { baseId: 'relic_ring_4_1' });
  assert.equal(restored.addItem(clone(shared)), true);
  assert.equal(restored.depositItem(shared.id), true);
  assert.equal(restored.sell(shared.id), true);
  assert.equal(restored.inventory[shared.id] || 0, 0); assert.equal(restored.stash[shared.id], 1);
  assert.deepEqual(restored.generatedItems[shared.id], shared, 'Selling the carried copy keeps the stored instance metadata.');
});

test('the stash caps distinct stacks at 120 and the generated-item bag caps at 240 including previously stored instances', () => {
  const game = fixture();
  for (let index = 0; index < STASH_CAPACITY; index++) {
    const item = loot(game);
    assert.equal(game.depositItem(item.id), true);
  }
  assert.equal(Object.keys(game.stash).length, 120);
  const overflow = loot(game), before = state(game);
  assert.equal(game.depositItem(overflow.id), false); assertUnchanged(game, before);
  const storedId = Object.keys(game.stash)[0];
  assert.equal(game.withdrawItem(storedId), true);
  assert.equal(game.depositItem(overflow.id), true);
  assert.equal(Object.keys(game.stash).length, 120);
  assert.equal(game.addItem(clone(game.item(overflow.id))), true);
  assert.equal(game.depositItem(overflow.id), true, 'Adding to an existing stack does not consume a distinct stash slot.');
  assert.equal(game.stash[overflow.id], 2);
  while (game.bagUsed() < 240) loot(game);
  const full = state(game), fresh = generateLoot({ level: 100, rarity: 'rare', baseId: 'iron_longsword', rng: () => .5, uid: `inventory-fresh-${++serial}` });
  assert.equal(game.addItem(fresh), false);
  assert.equal(game.withdrawItem(overflow.id), false); assertUnchanged(game, full);
  assert.equal(game.addItem(clone(game.item(overflow.id))), false, 'Known metadata in the stash cannot bypass the bag capacity.');
  assert.equal(game.bagUsed(), 240);
  const soldId = Object.keys(game.generatedItems).find(id => game.inventory[id] > 0 && !Object.values(game.equipment).includes(id));
  assert.equal(game.sell(soldId), true);
  assert.equal(game.bagUsed(), 239);
  assert.equal(game.withdrawItem(overflow.id), true);
  assert.equal(game.bagUsed(), 240); assert.equal(game.stash[overflow.id], 1);
  assert.equal(game.withdrawItem(overflow.id), true, 'Adding a carried stack does not occupy another bag slot.');
  assert.equal(game.bagUsed(), 240); assert.equal(game.inventory[overflow.id], 2);
});

test('three named equipment and ability templates apply atomically, retain cooldowns and never heal on swapping', () => {
  const game = fixture();
  const helmet = loot(game, { baseId: 'relic_helmet_4_1' }), ring = loot(game, { baseId: 'relic_ring_4_1' });
  assert.equal(game.equip(helmet.id), true); assert.equal(game.equip(ring.id), true);
  assert.equal(game.learnAbility('guardian_bulwark'), true);
  assert.equal(game.learnAbility('guardian_challenge'), true);
  assert.equal(game.saveLoadout('  Totenwache  '), true);
  const first = clone(game.loadouts[0]);
  assert.equal(first.name, 'Totenwache');
  assert.equal(game.unequip('helmet'), true); assert.equal(game.unequip('ring'), true);
  assert.equal(game.setAbilityLoadout(0, null), true); assert.equal(game.setAbilityLoadout(1, null), true);
  assert.equal(game.saveLoadout('Leichter Marsch'), true);
  assert.equal(game.saveLoadout('Rückzug'), true);
  assert.equal(game.loadouts.length, LOADOUT_CAPACITY);
  assert.equal(game.saveLoadout('Vierte Vorlage'), false);
  assert.equal(game.saveLoadout('   '), false);
  assert.equal(game.saveLoadout('Rückzug'), true, 'An existing name updates within the capacity.');
  assert.equal(game.loadouts.length, 3);
  game.cooldowns['ability:guardian_bulwark'] = 6;
  game.cooldowns['ability:guardian_challenge'] = 12;
  Object.assign(game.cooldowns, { attack: .2, dash: .8, bolt: 2, nova: 4, potion: 1, food: 7 });
  const cooldowns = clone(game.cooldowns);
  game.player.hp = 20; game.player.mana = 12;
  assert.equal(game.applyLoadout(first.id), true);
  assert.deepEqual(game.equipment, first.equipment); assert.deepEqual(game.abilityLoadout, first.abilityLoadout);
  assert.deepEqual(game.cooldowns, cooldowns);
  assert.equal(game.player.hp, 20); assert.equal(game.player.mana, 12);
  assert.equal(game.useLearnedAbility(0), false);
  assert.equal(game.applyLoadout(game.loadouts[1].id), true);
  assert.equal(game.depositItem(helmet.id), true);
  let before = state(game);
  assert.equal(game.applyLoadout(first.id), false); assertUnchanged(game, before);
  assert.equal(game.withdrawItem(helmet.id), true);
  delete game.learnedAbilities.guardian_challenge;
  before = state(game);
  assert.equal(game.applyLoadout(first.id), false); assertUnchanged(game, before);
  game.learnedAbilities.guardian_challenge = true;
  game.player.lastDamageAt = game.time;
  before = state(game);
  assert.equal(game.applyLoadout(first.id), false); assertUnchanged(game, before);
  delete game.player.lastDamageAt;
  const foreign = fixture({ classId: 'ranger' });
  foreign.loadouts = clone(game.loadouts);
  before = state(foreign);
  assert.equal(foreign.applyLoadout(first.id), false); assertUnchanged(foreign, before);
  const restored = fixture(); restored.applySave(clone(game.capture()));
  assert.deepEqual(restored.loadouts, game.loadouts);
  assert.equal(restored.cooldowns['ability:guardian_bulwark'], 6);
  assert.equal(restored.deleteLoadout(first.id), true);
  assert.equal(restored.applyLoadout(first.id), false);
  assert.equal(restored.saveLoadout('Neue Wache'), true);
  assert.equal(restored.loadouts.length, 3);
});

test('paid talent respec refunds each purchased passive rank exactly once and keeps learned active abilities and their cooldowns', () => {
  const game = fixture(), initialPoints = game.player.skillPoints;
  for (const id of ['guardian_vigor', 'guardian_vigor', 'guardian_steel', 'guardian_steel', 'guardian_bulwark', 'guardian_gatekeeper', 'guardian_gatekeeper', 'guardian_black_plate', 'guardian_black_plate', 'guardian_siege_heart', 'guardian_siege_heart', 'guardian_siege_heart', 'guardian_living_citadel']) assert.equal(game.learn(id), true, id);
  const passiveCost = initialPoints - game.player.skillPoints;
  assert.equal(game.learnAbility('guardian_bulwark'), true);
  assert.equal(game.learnAbility('guardian_challenge'), true);
  game.cooldowns['ability:guardian_bulwark'] = 5;
  const learned = clone(game.learnedAbilities), abilities = clone(game.abilityLoadout), cooldowns = clone(game.cooldowns), points = game.player.skillPoints, gold = game.player.gold;
  const paid = 20 + game.player.level * 5;
  assert.equal(passiveCost, SKILLS.filter(skill => game.skills[skill.id]).reduce((sum, skill) => sum + game.skills[skill.id] * skill.cost, 0));
  assert.equal(game.respecTalents(), true);
  assert.equal(game.player.gold, gold - paid);
  assert.equal(game.player.skillPoints, points + passiveCost);
  assert.equal(game.player.skillPoints, initialPoints - getAbility('guardian_bulwark').talentCost - getAbility('guardian_challenge').talentCost);
  assert.deepEqual(game.skills, {});
  assert.deepEqual(game.learnedAbilities, learned); assert.deepEqual(game.abilityLoadout, abilities); assert.deepEqual(game.cooldowns, cooldowns);
  assert.equal(game.player.hp, 20); assert.equal(game.player.mana, 12);
  const afterGold = game.player.gold, afterPoints = game.player.skillPoints;
  assert.equal(game.respecTalents(), false);
  assert.equal(game.player.gold, afterGold); assert.equal(game.player.skillPoints, afterPoints);
});

test('respec gates reject insufficient gold, combat, death and remote locations before mutating the build', () => {
  const game = fixture();
  assert.equal(game.learn('guardian_vigor'), true);
  const cost = 20 + game.player.level * 5;
  const expectRejected = () => {
    const before = state(game), skills = clone(game.skills), points = game.player.skillPoints;
    assert.equal(game.respecTalents(), false); assertUnchanged(game, before);
    assert.deepEqual(game.skills, skills); assert.equal(game.player.skillPoints, points);
  };
  game.player.gold = cost - 1; expectRejected();
  game.player.gold = 10000; game.player.lastDamageAt = game.time; expectRejected();
  delete game.player.lastDamageAt; game.dead = true; expectRejected();
  game.dead = false; Object.assign(game.player, { x: 1500, y: 1500 }); expectRejected();
});

test('pinning a kill quest follows the next living enemy, then its giver, and rejects invalid destinations', () => {
  const game = fixture();
  const definition = ENEMY_TYPES.wolf;
  game.world.enemies = Array.from({ length: 4 }, (_, index) => ({ id: `navigation-wolf-${index}`, type: 'wolf', x: 580 + index * 80, y: 1250, homeX: 580 + index * 80, homeY: 1250, hp: definition.hp, maxHp: definition.hp, alive: true, aggro: false, phase: 'idle', respawnAt: 0, level: 1 }));
  assert.equal(game.questAccept('q_hainwacht'), true);
  assert.equal(game.trackedQuestId, 'q_hainwacht');
  assert.equal(game.waypointTarget().x, game.world.enemies[0].x);
  const pinned = clone(game.waypoint);
  for (const [kind, id] of [['quest', 'missing-quest'], ['npc', 'missing-npc'], ['shrine', 'missing-shrine'], ['dungeon', 'missing-dungeon'], ['interaction', 'missing-object'], ['region', 'missing-region'], ['anything', 'mira']]) assert.equal(game.setWaypoint(kind, id), false);
  assert.equal(game.trackQuest('missing-quest'), false);
  assert.equal(game.trackQuest(null), false);
  assert.deepEqual(game.waypoint, pinned);
  game.killEnemy(game.world.enemies[0]);
  assert.equal(game.waypointTarget().x, game.world.enemies[1].x);
  for (const enemy of game.world.enemies.slice(1)) game.killEnemy(enemy);
  assert.equal(game.questState.q_hainwacht.status, 'ready');
  const mira = NPCS.find(npc => npc.id === 'mira'), target = game.waypointTarget();
  assert.equal(target.x, mira.x); assert.equal(target.y, mira.y);
  assert.match(target.label, /Abgeben/);
  const restored = fixture(); restored.applySave(clone(game.capture()));
  assert.equal(restored.trackedQuestId, 'q_hainwacht');
  assert.equal(restored.waypointTarget().x, mira.x);
  assert.equal(restored.questTurnIn('q_hainwacht'), true);
  assert.equal(restored.trackedQuestId, ''); assert.equal(restored.waypointTarget(), null);
  assert.equal(restored.trackQuest('q_hainwacht'), false, 'Completed quests cannot remain pinned.');
  assert.equal(restored.setWaypoint('npc', 'elin'), true);
  assert.equal(restored.waypointTarget().label, NPCS.find(npc => npc.id === 'elin').name);
  assert.equal(restored.setWaypoint('clear', ''), true); assert.equal(restored.waypointTarget(), null);
});

test('gather quest waypoints skip depleted resources and switch objectives before directing the player to the giver', () => {
  const game = fixture();
  game.questState.q_hainwacht = { status: 'done', counts: [4] };
  game.world.nodes = [
    ...Array.from({ length: 3 }, (_, index) => ({ id: `navigation-wood-${index}`, type: 'wood', x: 1000 + index * 100, y: 800, readyAt: 0 })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `navigation-ore-${index}`, type: 'ore', x: 1400 + index * 100, y: 800, readyAt: 0 })),
  ];
  assert.equal(game.questAccept('q_erste_klinge'), true);
  assert.equal(game.trackedQuestId, 'q_erste_klinge');
  const first = game.world.nodes[0], second = game.world.nodes[1];
  Object.assign(game.player, { x: first.x, y: first.y });
  assert.equal(game.waypointTarget().x, first.x);
  game.interact();
  assert.ok(first.readyAt > game.time);
  assert.equal(game.waypointTarget().x, second.x);
  for (const node of game.world.nodes.slice(1, 3)) { Object.assign(game.player, { x: node.x, y: node.y }); game.interact(); }
  assert.equal(game.questState.q_erste_klinge.counts[0], QUESTS.find(quest => quest.id === 'q_erste_klinge').objectives[0].count);
  assert.equal(game.waypointTarget().x, game.world.nodes[3].x);
  for (const node of game.world.nodes.slice(3)) { Object.assign(game.player, { x: node.x, y: node.y }); game.interact(); }
  assert.equal(game.questState.q_erste_klinge.status, 'ready');
  assert.equal(game.waypointTarget().x, NPCS.find(npc => npc.id === 'elin').x);
});

test('malformed inventory extensions reject the complete saved import before changing any running state', () => {
  const game = fixture(), item = loot(game, { baseId: 'relic_ring_4_1' });
  assert.equal(game.setItemFlag(item.id, 'favorite'), true);
  assert.equal(game.saveLoadout('Wache'), true);
  const saved = clone(game.capture()), before = state(game), loadouts = clone(game.loadouts);
  for (const mutate of [
    data => { data.stash = { [item.id]: 0 }; },
    data => { data.stash = { [item.id]: 1.5 }; },
    data => { data.itemFlags[item.id].favorite = 'true'; },
    data => { data.itemFlags[item.id].selling = true; },
    data => { data.loadouts[0].equipment.offhand = item.id; },
    data => { data.loadouts[0].abilityLoadout = ['guardian_bulwark', 'guardian_bulwark']; },
    data => { data.loadouts.push(clone(data.loadouts[0])); },
    data => { data.waypoint = { kind: 'coordinates', id: '999999,999999' }; },
  ]) {
    const corrupt = clone(saved); mutate(corrupt);
    assert.throws(() => game.applySave(corrupt));
    assertUnchanged(game, before); assert.deepEqual(game.loadouts, loadouts);
  }
});

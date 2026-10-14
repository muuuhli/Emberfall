import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { QUESTS, NPCS, REGIONS, RECIPES, ITEMS, ENEMY_TYPES } from '../src/catalog.js';
import { QUESTS as ORIGINAL_QUESTS } from '../src/content.js';
import { EXPANSION_QUESTS } from '../src/expansion.js';
import { SIDE_QUESTS, SIDE_STORY_CHAINS } from '../src/side-stories.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS } from '../src/world-events.js';
import { applyExperience, xpToNext } from '../src/progression.js';
import { resolveQuestTarget } from '../src/navigation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const quest = id => SIDE_QUESTS.find(candidate => candidate.id === id);
const approach = (game, target) => Object.assign(game.player, { x: target.x, y: target.y });
const bossSpecies = enemy => ENEMY_TYPES[enemy.type]?.baseType || ENEMY_TYPES[enemy.type]?.speciesId || enemy.type;
function fresh(level = 100) {
  const game = new Game({ storage: null, random: () => .5 });
  game.testChampions = game.world.enemies.filter(enemy => ENEMY_TYPES[enemy.type]?.boss && !enemy.rewardless);
  game.world.enemies = [];
  // Combat resolution stays native; this deterministic content harness does not
  // ask idle foes to attack the player while an authored ritual is being solved.
  game.updateEnemies = () => {};
  game.player.level = level;
  game.player.hp = game.stats().maxHp;
  game.player.mana = game.stats().mana;
  game.start();
  return game;
}
function seedIngredients(game, recipe) {
  for (const [id, count] of Object.entries(recipe.ingredients)) {
    if (Object.hasOwn(game.resources, id)) game.resources[id] += count;
    else game.inventory[id] = (game.inventory[id] || 0) + count;
  }
}
function defeat(game, enemy) {
  approach(game, enemy);
  assert.ok(game.hitEnemy(enemy, enemy.maxHp * 30, 0) > 0);
  assert.equal(enemy.alive, false);
}
function solveEvent(game, id) {
  const event = game.world.worldEvents.find(candidate => candidate.id === id);
  const definition = [...WORLD_EVENT_DEFINITIONS, ...EXPEDITIONS].find(candidate => candidate.id === id);
  const start = game.world.eventObjects.find(object => object.id === `${id}:start`);
  approach(game, start);
  assert.equal(game.interactWorldEvent(start.id), true, id);
  let defeated = 0;
  for (let frame = 0; frame < 1400 && event.state === 'active'; frame++) {
    const objects = game.world.eventObjects.filter(object => object.eventId === id && !object.hidden);
    const stage = event.mode === 'expedition' ? definition.stages[event.stageIndex] : definition;
    const use = object => { approach(game, object); assert.equal(game.interactWorldEvent(object.id), true, object.id); };
    const choices = objects.filter(object => object.role === 'choice');
    if (choices.length) use(choices[0]);
    else if (event.stageType === 'ritual') {
      const runes = objects.filter(object => object.role === 'rune');
      if (stage.rule === 'sequence') {
        const next = runes.find(object => object.symbol === stage.symbols[event.objective.progress]);
        if (next) use(next);
      } else if (stage.rule === 'switches') {
        const next = runes.find((object, index) => object.active !== stage.pattern[index]);
        if (next) use(next);
      } else if (stage.rule === 'alignment') {
        const next = runes.find((object, index) => object.rotation !== stage.rotations[index]);
        if (next) use(next);
      } else approach(game, runes[0]);
    } else if (['ambush', 'boss_hunt'].includes(event.stageType)) {
      const next = objects.find(object => object.role === 'rune' && !object.active);
      if (next) use(next);
    } else approach(game, objects.find(object => ['objective', 'escort'].includes(object.role)) || event);
    game.time += .25;
    game.updateWorld(.25, [game]);
    for (const enemy of game.world.enemies.filter(actor => actor.eventId === id && actor.alive)) {
      defeat(game, enemy); defeated++;
    }
  }
  assert.equal(event.state, 'success', `${id} requires its actual stages to complete`);
  assert.ok(defeated > 0, `${id} produces real opposition`);
  assert.equal(game.ledger[`world_event:${id}`], 1);
  return event;
}
function completeObjective(game, objective) {
  if (objective.kind === 'interact') {
    const object = game.world.interactions.find(candidate => candidate.id === objective.target);
    approach(game, object);
    assert.equal(game.interactWorldObject(object.id), true, objective.target);
  } else if (objective.kind === 'craft') {
    const recipe = RECIPES.find(candidate => candidate.id === objective.target);
    seedIngredients(game, recipe);
    assert.equal(game.craft(recipe.id), true, objective.target);
  } else if (objective.kind === 'world_event') solveEvent(game, objective.target);
  else if (objective.kind === 'boss') {
    const champion = clone(game.testChampions.find(enemy => bossSpecies(enemy) === objective.target));
    assert.ok(champion, objective.target);
    game.world.enemies.push(champion);
    defeat(game, champion);
  } else if (objective.kind === 'explore') {
    const region = REGIONS.find(candidate => candidate.id === objective.target);
    approach(game, { x: region.x + region.w / 2, y: region.y + region.h / 2 });
    game.update(.01, { simulateWorld: false });
    assert.ok(game.discovered.includes(region.id));
  } else if (objective.kind === 'gather') {
    while ((game.ledger[`gather:${objective.target}`] || 0) < objective.count) {
      const node = game.world.nodes.find(candidate => candidate.type === objective.target && candidate.readyAt <= game.time);
      assert.ok(node);
      approach(game, node);
      assert.equal(game.nearby()?.object.id, node.id);
      game.interact();
    }
  } else assert.fail(`Unhandled authored objective ${objective.kind}`);
}
function turnInOnce(game, definition) {
  const state = game.questState[definition.id];
  assert.equal(state.status, 'ready', definition.id);
  const before = { gold: game.player.gold, level: game.player.level, xp: game.player.xp, item: game.inventory[definition.reward.item] || 0 };
  const experience = applyExperience(before, definition.reward.xp);
  assert.equal(game.questTurnIn(definition.id), true);
  assert.equal(game.player.gold, before.gold + definition.reward.gold);
  assert.equal(game.player.level, experience.level);
  assert.equal(game.player.xp, experience.xp);
  assert.equal(game.inventory[definition.reward.item], before.item + 1);
  const after = clone(game.capture());
  assert.equal(game.questTurnIn(definition.id), false);
  assert.equal(game.questAccept(definition.id), false);
  const repeated = clone(game.capture());
  repeated.savedAt = after.savedAt;
  assert.deepEqual(repeated, after);
}

test('24 original side quests extend the existing catalog as eight ordered chains with bounded rewards', () => {
  const original = [...ORIGINAL_QUESTS, ...EXPANSION_QUESTS];
  assert.equal(SIDE_QUESTS.length, 24);
  assert.equal(SIDE_STORY_CHAINS.length, 8);
  assert.deepEqual(QUESTS.slice(0, original.length), original);
  assert.equal(new Set(QUESTS.map(definition => definition.id)).size, QUESTS.length);
  assert.deepEqual(QUESTS.slice(original.length), SIDE_QUESTS);
  assert.deepEqual(new Set(SIDE_QUESTS.flatMap(definition => definition.objectives.map(objective => objective.kind))), new Set(['explore', 'interact', 'craft', 'world_event', 'boss', 'gather']));
  for (const chain of SIDE_STORY_CHAINS) {
    const chapters = chain.quests.map(quest);
    assert.equal(chapters.length, 3);
    assert.ok(chain.summary.length > 70);
    chapters.forEach((definition, index) => {
      assert.equal(definition.contentType, 'side');
      assert.equal(definition.category, 'side-story');
      assert.equal(definition.chainId, chain.id);
      assert.equal(definition.chainName, chain.name);
      assert.equal(definition.chapter, index + 1);
      assert.equal(definition.chapters, 3);
      assert.equal(definition.prerequisite, index ? chapters[index - 1].id : null);
      assert.equal(definition.giver, chain.giver);
      assert.equal(definition.region, chain.region);
      assert.ok(definition.description.length > 170);
      assert.ok(Number.isInteger(definition.reward.xp) && definition.reward.xp >= 20 && definition.reward.xp <= xpToNext(definition.minLevel) * .27);
      assert.ok(Number.isInteger(definition.reward.gold) && definition.reward.gold <= 250);
      assert.ok(ITEMS[definition.reward.item]);
      assert.ok((ITEMS[definition.reward.item].minLevel || 1) <= definition.minLevel, `${definition.id} must give usable supplies`);
    });
    assert.ok(chapters.at(-1).objectives.some(objective => ['world_event', 'craft', 'boss'].includes(objective.kind) && !objective.remembered), `${chain.id} requires new gameplay at its conclusion`);
  }
});

test('every objective resolves to a present world object, recipe, regional champion or playable event', () => {
  const game = new Game({ storage: null, random: () => .5 });
  for (const definition of SIDE_QUESTS) {
    assert.ok(NPCS.some(npc => npc.id === definition.giver));
    assert.ok(REGIONS.some(region => region.id === definition.region));
    for (const objective of definition.objectives) {
      assert.ok(objective.count > 0 && Number.isInteger(objective.count));
      assert.ok(objective.label.length > 10 && !objective.label.includes('undefined'));
      if (objective.kind === 'interact') {
        const object = game.world.interactions.find(candidate => candidate.id === objective.target);
        assert.ok(object, objective.target);
        assert.equal(object.region, definition.region);
        assert.equal(objective.remembered, true);
      } else if (objective.kind === 'explore') {
        assert.ok(REGIONS.some(region => region.id === objective.target));
        assert.equal(objective.remembered, true);
      } else if (objective.kind === 'craft') {
        const recipe = RECIPES.find(candidate => candidate.id === objective.target);
        assert.ok(recipe, objective.target);
        assert.ok((recipe.minLevel || 1) <= definition.minLevel);
        assert.equal(recipe.classIds, undefined, 'Side stories remain playable by every class');
      } else if (objective.kind === 'world_event') {
        const event = game.world.worldEvents.find(candidate => candidate.id === objective.target);
        assert.ok(event, objective.target);
        assert.ok(event.minLevel <= definition.minLevel);
        assert.equal(objective.remembered, undefined);
      } else if (objective.kind === 'boss') {
        assert.ok(game.world.enemies.some(enemy => enemy.region === definition.region && ENEMY_TYPES[enemy.type]?.boss && !enemy.rewardless && bossSpecies(enemy) === objective.target), objective.target);
      } else if (objective.kind === 'gather') assert.ok(game.world.nodes.some(node => node.type === objective.target));
    }
  }
});

for (const chain of SIDE_STORY_CHAINS) test(`${chain.name}: all three chapters accept, progress through native gameplay and pay only once`, () => {
  const game = fresh(chain.minLevel);
  const chapters = chain.quests.map(quest);
  assert.equal(game.questAccept(chapters[1].id), false, 'The prior chapter must be turned in');
  for (const definition of chapters) {
    game.player.level = Math.max(game.player.level, definition.minLevel);
    game.player.hp = game.stats().maxHp;
    assert.equal(game.questAccept(definition.id), true, definition.id);
    assert.equal(game.questAccept(definition.id), false);
    const initial = clone(game.questState[definition.id]);
    game.event('interact', 'encounter-imaginary-lore');
    game.event('boss', 'imaginary-boss');
    game.event('world_event', 'event-imaginary');
    assert.deepEqual(game.questState[definition.id], initial, 'Unrelated events cannot advance the chapter');
    if (initial.status !== 'ready') assert.equal(game.questTurnIn(definition.id), false);
    for (const [index, objective] of definition.objectives.entries()) {
      if (game.questState[definition.id].counts[index] < objective.count) completeObjective(game, objective);
    }
    turnInOnce(game, definition);
  }
});

test('level gates and an unfinished earlier chapter block the next phase', () => {
  const game = fresh(2), first = quest('side-nameless-bell-1'), second = quest('side-nameless-bell-2');
  assert.equal(game.questAccept(first.id), false);
  game.player.level = 4;
  assert.equal(game.questAccept(first.id), true);
  completeObjective(game, first.objectives[1]);
  assert.equal(game.questState[first.id].status, 'ready');
  assert.equal(game.questAccept(second.id), false);
  assert.equal(game.questTurnIn(first.id), true);
  game.player.level = 3;
  assert.equal(game.questAccept(second.id), false);
  game.player.level = 4;
  assert.equal(game.questAccept(second.id), true);
});

test('already visited places and spent one-shot objects remain usable as remembered narrative evidence after loading', () => {
  const game = fresh(4), definition = quest('side-nameless-bell-1');
  const object = game.world.interactions.find(candidate => candidate.id === definition.objectives[1].target);
  approach(game, object);
  assert.equal(game.interactWorldObject(object.id), true);
  const saved = clone(game.capture());
  // A companion could have spent this shared object without the actor owning a
  // personal interaction ledger; the old-save world fact is sufficient.
  delete saved.ledger[`interact:${object.id}`];
  const restored = fresh(4);
  restored.applySave(saved); restored.start();
  assert.equal(restored.questAccept(definition.id), true);
  assert.deepEqual(restored.questState[definition.id], { status: 'ready', counts: [1, 1] });
  approach(restored, restored.world.interactions.find(candidate => candidate.id === object.id));
  assert.equal(restored.interactWorldObject(object.id), false);
  turnInOnce(restored, definition);
});

test('old event, boss and crafting ledgers cannot skip fresh conclusions while old base quests retain their behavior', () => {
  const game = fresh(10), definition = quest('side-moor-inheritance-3');
  for (const previous of SIDE_STORY_CHAINS.find(chain => chain.id === definition.chainId).quests.slice(0, 2)) {
    const data = quest(previous); game.questState[previous] = { status: 'done', counts: data.objectives.map(objective => objective.count) };
  }
  game.event('boss', 'grave_cantor', 4);
  game.event('world_event', 'event-aschenmoor', 3);
  game.event('craft', 'brew_mana', 8);
  assert.equal(game.questAccept(definition.id), true);
  assert.deepEqual(game.questState[definition.id], { status: 'active', counts: [0, 0] });
  assert.equal(game.questTurnIn(definition.id), false);
  completeObjective(game, definition.objectives[0]);
  assert.deepEqual(game.questState[definition.id].counts, [1, 0]);
  assert.equal(game.questState[definition.id].status, 'active');
  assert.equal(game.questAccept('q_hainwacht'), true);
  assert.deepEqual(game.questState.q_hainwacht.counts, [0]);
  const crafting = quest('side-moor-inheritance-1');
  delete game.questState[crafting.id];
  assert.equal(game.questAccept(crafting.id), true);
  assert.equal(game.questState[crafting.id].counts[1], 0);
});

test('craft objectives advance only after ingredients are actually consumed and the output is created', () => {
  const game = fresh(6), definition = quest('side-moor-inheritance-1');
  assert.equal(game.questAccept(definition.id), true);
  const recipe = RECIPES.find(candidate => candidate.id === 'brew_mana');
  const before = clone(game.questState[definition.id]);
  assert.equal(game.craft(recipe.id), false);
  assert.deepEqual(game.questState[definition.id], before);
  seedIngredients(game, recipe);
  const ingredients = clone(game.resources), output = game.inventory[recipe.output] || 0;
  assert.equal(game.craft(recipe.id), true);
  for (const [id, count] of Object.entries(recipe.ingredients)) assert.equal(game.resources[id], ingredients[id] - count);
  assert.equal(game.inventory[recipe.output], output + (recipe.amount || 1));
  assert.deepEqual(game.questState[definition.id].counts, [0, 1]);
  assert.equal(game.questState[definition.id].status, 'active');
});

test('quest pins follow actual evidence, regional champions and event stages, then return to the giver', () => {
  const game = fresh(10), first = quest('side-nameless-bell-1');
  assert.equal(game.questAccept(first.id), true);
  assert.equal(game.trackQuest(first.id), true);
  assert.equal(resolveQuestTarget(game, first.id).objectId, 'encounter-daemmerhain-lore');
  completeObjective(game, first.objectives[1]);
  assert.equal(resolveQuestTarget(game, first.id).objectId, first.giver);
  const last = quest('side-moor-inheritance-3');
  for (const id of ['side-moor-inheritance-1', 'side-moor-inheritance-2']) game.questState[id] = { status: 'done', counts: quest(id).objectives.map(objective => objective.count) };
  const champion = clone(game.testChampions.find(enemy => bossSpecies(enemy) === 'grave_cantor'));
  game.world.enemies.push(champion);
  assert.equal(game.questAccept(last.id), true);
  assert.equal(resolveQuestTarget(game, last.id).objectId, champion.id);
  defeat(game, champion);
  assert.equal(resolveQuestTarget(game, last.id).objectId, 'event-aschenmoor:start');
  approach(game, game.world.eventObjects.find(object => object.id === 'event-aschenmoor:start'));
  assert.equal(game.interactWorldEvent('event-aschenmoor:start'), true);
  assert.ok(resolveQuestTarget(game, last.id).objectId.startsWith('event-aschenmoor:prop:'));
});

test('partial progress, pin, spent evidence and a paid reward survive native save restoration', () => {
  const game = fresh(10), definition = quest('side-moor-inheritance-1');
  assert.equal(game.questAccept(definition.id), true);
  assert.equal(game.trackQuest(definition.id), true);
  completeObjective(game, definition.objectives[0]);
  const saved = clone(game.capture()), restored = fresh();
  restored.applySave(saved); restored.start();
  assert.deepEqual(restored.questState[definition.id], { status: 'active', counts: [1, 0] });
  assert.equal(restored.trackedQuestId, definition.id);
  assert.ok(restored.world.interactions.find(object => object.id === definition.objectives[0].target).used);
  completeObjective(restored, definition.objectives[1]);
  turnInOnce(restored, definition);
  const paid = clone(restored.capture()), reloaded = fresh();
  reloaded.applySave(paid); reloaded.start();
  assert.deepEqual(reloaded.questState[definition.id], paid.questState[definition.id]);
  assert.equal(reloaded.player.gold, paid.player.gold);
  assert.equal(reloaded.inventory[definition.reward.item], paid.inventory[definition.reward.item]);
  assert.equal(reloaded.questTurnIn(definition.id), false);
  assert.equal(reloaded.questAccept(definition.id), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { EXPEDITION_CONTENT } from '../src/expedition-content.js';
import { EXPEDITIONS, WORLD_EVENT_ENEMIES, summarizeWorldEvents, validateWorldEventSave } from '../src/world-events.js';
import { applyExperience } from '../src/progression.js';

const clone = value => JSON.parse(JSON.stringify(value));
const approach = (game, target) => Object.assign(game.player, { x: target.x, y: target.y });
// Actual activity positions captured before the four new expeditions were
// appended. Existing saved routes and remembered evidence keep their locations.
const EXISTING_ACTIVITY_POSITIONS = [
  ['event-daemmerhain', 552, 1883], ['event-frostgrat', 394, 644], ['event-aschenmoor', 2486, 770], ['event-glutoede', 2202, 2037],
  ['event-sonnensteppe', 5024, 1968], ['event-jadeauen', 8433, 1810], ['event-sturmkueste', 11904, 1680], ['event-dornwildnis', 14752, 1920],
  ['event-obsidianpass', 17824, 1872], ['event-mondbruch', 16384, 5280], ['event-permafrost', 10240, 5360], ['event-sandsenke', 3520, 5320],
  ['event-traumsenke', 3520, 9480], ['event-blutmark', 9984, 9600], ['event-sternensund', 16384, 9600], ['event-nexusriss', 9984, 13120],
  ['expedition-trauerweg', 285, 1680], ['expedition-salzzug', 10631, 1967], ['expedition-ofenpfad', 16960, 1896], ['expedition-schlafgericht', 1792, 9480],
  ['event-sivra', 975, 684], ['event-irdan', 4064, 1320], ['event-orsa', 10906, 706], ['event-vey', 14592, 4960], ['event-nera', 4608, 8360], ['event-asterion', 15552, 12520],
];

function fresh(level = 100) {
  const game = new Game({ storage: null, random: () => .5 });
  game.player.level = level;
  game.player.hp = game.stats().maxHp;
  game.player.mana = game.stats().mana;
  game.world.enemies = [];
  // Boss combat budgets have their own profile tests. Here actual damage kills
  // the spawned actors while the native controller still owns all stage rules.
  game.updateEnemies = () => {};
  game.start(); return game;
}

function runExpedition(game, definition, { risky = false } = {}) {
  const event = game.world.worldEvents.find(candidate => candidate.id === definition.id);
  assert.ok(event, `${definition.id} is integrated into the native controller`);
  const initialLedger = game.ledger[`world_event:${definition.id}`] || 0;
  const startedAt = game.time, stages = new Set(), actorsByStage = new Map(), propertiesByStage = new Map();
  const warningsByStage = new Map(), warningReadyAt = new Map(), nativeEffects = game.handleWorldEventEffects;
  game.handleWorldEventEffects = function (effects) {
    for (const effect of effects.filter(effect => effect.eventId === event.id && effect.kind === 'warning')) {
      assert.ok(effect.duration >= 2 && effect.radius > 0, 'Actual encounter warnings have visible time and area');
      warningsByStage.set(event.stageIndex, (warningsByStage.get(event.stageIndex) || 0) + 1);
      warningReadyAt.set(event.stageIndex, event.elapsed + effect.duration);
    }
    return nativeEffects.call(this, effects);
  };
  const use = object => {
    assert.ok(object); approach(game, object);
    assert.equal(game.interactWorldEvent(object.id), true, object.id);
  };
  use(game.world.eventObjects.find(object => object.id === `${definition.id}:start`));
  for (let frame = 0; frame < 1200 && event.state === 'active'; frame++) {
    stages.add(event.stageIndex);
    const stage = definition.stages[event.stageIndex];
    const properties = game.world.eventObjects.filter(object => object.eventId === event.id && !object.hidden);
    propertiesByStage.set(event.stageIndex, properties.map(object => object.role));
    if (stage.type === 'choice') use(properties.filter(object => object.role === 'choice')[risky ? 1 : 0]);
    else if (stage.type === 'ritual') {
      const runes = properties.filter(object => object.role === 'rune');
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
    } else if (stage.type === 'ambush' || stage.type === 'boss_hunt') {
      const next = properties.find(object => object.role === 'rune' && !object.active);
      if (next) use(next);
    } else approach(game, properties.find(object => object.role === 'objective' || object.role === 'escort'));
    game.time += .25;
    game.updateWorld(.25, [game]);
    for (const actor of game.world.enemies.filter(enemy => enemy.eventId === event.id && enemy.alive)) {
      assert.ok(event.elapsed + 1e-9 >= warningReadyAt.get(event.stageIndex), 'Real opposition arrives after the native warning');
      actorsByStage.set(event.stageIndex, (actorsByStage.get(event.stageIndex) || 0) + 1);
      approach(game, actor);
      assert.ok(game.hitEnemy(actor, actor.maxHp * 30, 0) > 0);
      assert.equal(actor.alive, false);
    }
  }
  game.handleWorldEventEffects = nativeEffects;
  assert.equal(event.state, 'success', `${definition.id}: ${event.objective.label}`);
  assert.deepEqual([...stages], [0, 1, 2, 3, 4], 'All five distinct stages were actually visited');
  assert.ok(game.time - startedAt < 150, 'The authored route leaves ample room before the 300-second failure deadline');
  assert.equal(game.ledger[`world_event:${definition.id}`], initialLedger + 1, 'Exactly one native completion reaches Game');
  assert.equal(event.bonus, risky ? 1.25 : 1);
  assert.equal(event.risky, risky);
  for (let index = 1; index < 5; index++) {
    assert.ok((warningsByStage.get(index) || 0) >= 1, `Stage ${index + 1} warns before its real opponents arrive`);
    assert.ok((actorsByStage.get(index) || 0) >= 1, `Stage ${index + 1} created and resolved real opponents`);
    const expectedRole = definition.stages[index].type === 'escort' ? 'escort' : definition.stages[index].type === 'defend' ? 'objective' : 'rune';
    assert.ok(propertiesByStage.get(index).includes(expectedRole), `Stage ${index + 1} exposes a usable ${expectedRole}`);
  }
  const finalBoss = game.world.enemies.find(actor => actor.eventId === event.id && actor.type === definition.stages.at(-1).boss);
  assert.ok(finalBoss?.boss);
  assert.equal(finalBoss.alive, false);
  assert.equal(finalBoss.level, definition.level);
  return event;
}

test('four immutable original expedition definitions use five supported stages and independent regional placements', () => {
  assert.equal(EXPEDITION_CONTENT.length, 4);
  assert.deepEqual(EXPEDITION_CONTENT.map(definition => [definition.id, definition.region, definition.level, definition.minLevel, definition.stages.at(-1).boss]), [
    ['expedition-weisshorn', 'frostgrat', 7, 6, 'sivra_whitehorn'],
    ['expedition-schilfzug', 'jadeauen', 24, 22, 'irdan_reaper'],
    ['expedition-zeitbruch', 'mondbruch', 54, 52, 'vey_clockslayer'],
    ['expedition-namenlos', 'traumsenke', 80, 78, 'nera_nameless'],
  ]);
  assert.ok(Object.isFrozen(EXPEDITION_CONTENT));
  assert.equal(new Set(EXPEDITION_CONTENT.map(definition => definition.id)).size, 4);
  const ritualRules = new Set();
  for (const definition of EXPEDITION_CONTENT) {
    assert.equal(definition.mode, 'expedition');
    assert.equal(definition.contentType, 'expedition');
    assert.equal(definition.partyRequired, 1);
    assert.equal(definition.repeatable, true);
    assert.ok(definition.description.length > 90 && definition.hint.length > 90);
    assert.ok(Object.isFrozen(definition) && Object.isFrozen(definition.stages));
    assert.ok(definition.at.every(value => value > 0 && value < 1));
    assert.equal(definition.stages.length, 5);
    const [choice, first, ritual, second, final] = definition.stages;
    assert.equal(choice.type, 'choice');
    assert.ok(choice.safe.length > 10 && choice.risk.length > 10 && choice.safe !== choice.risk);
    assert.ok(['ambush', 'defend', 'escort'].includes(first.type));
    assert.ok(['ambush', 'defend', 'escort'].includes(second.type));
    assert.notEqual(first.type, second.type);
    assert.equal(ritual.type, 'ritual');
    assert.ok(['sequence', 'switches', 'alignment', 'hold'].includes(ritual.rule));
    ritualRules.add(ritual.rule);
    assert.equal(final.type, 'boss_hunt');
    assert.equal(final.tracks, 1);
    assert.ok(WORLD_EVENT_ENEMIES[final.boss]?.boss);
    for (const stage of definition.stages) {
      assert.ok(Object.isFrozen(stage));
      if (stage.type === 'defend') {
        assert.ok(stage.duration >= 18 && stage.duration <= 32);
        assert.ok(stage.waves.every(pack => pack >= 2 && pack <= 4));
      }
      if (stage.type === 'ritual' && stage.rule === 'hold') assert.ok(stage.duration >= 5 && stage.duration <= 8);
      if (stage.type === 'ambush') assert.ok(stage.pack >= 2 && stage.pack <= 4);
    }
  }
  assert.deepEqual(ritualRules, new Set(['sequence', 'switches', 'alignment', 'hold']));
});

test('the native catalog appends the four expeditions without moving any of the existing 26 activities', () => {
  const game = fresh();
  for (const [id, x, y] of EXISTING_ACTIVITY_POSITIONS) {
    const event = game.world.worldEvents.find(candidate => candidate.id === id);
    assert.ok(event);
    assert.deepEqual([event.x, event.y], [x, y], `${id} preserves its saved route`);
  }
  for (const definition of EXPEDITION_CONTENT) {
    assert.equal(EXPEDITIONS.find(candidate => candidate.id === definition.id), definition);
    const event = game.world.worldEvents.find(candidate => candidate.id === definition.id);
    assert.ok(event);
    const region = game.world.regions.find(candidate => candidate.id === definition.region);
    assert.ok(event.x >= region.x && event.x < region.x + region.w && event.y >= region.y && event.y < region.y + region.h);
    const summary = summarizeWorldEvents(game.world, game.player).find(candidate => candidate.id === event.id);
    assert.equal(summary.stages, 5);
    assert.equal(summary.contentType, 'expedition');
    assert.equal(summary.partyRequired, 1);
    assert.equal(summary.repeatable, true);
    assert.equal(summary.hint, definition.hint);
  }
});

for (const definition of EXPEDITION_CONTENT) for (const risky of [false, true]) {
  test(`${definition.name}: ${risky ? 'risk' : 'safe'} path resolves five native stages with controlled damage, warnings and a single claim`, () => {
    const game = fresh(definition.level);
    const event = runExpedition(game, definition, { risky });
    approach(game, event);
    const before = { gold: game.player.gold, dust: game.resources.dust, bag: game.bagUsed(), level: game.player.level, xp: game.player.xp };
    const reward = summarizeWorldEvents(game.world, game.player).find(candidate => candidate.id === event.id).reward;
    const expectedXp = applyExperience(before, reward.xp);
    assert.equal(game.claimWorldEvent(event.id), true);
    assert.equal(game.player.gold, before.gold + reward.gold);
    assert.equal(game.resources.dust, before.dust + reward.dust);
    assert.equal(game.bagUsed(), before.bag + 1);
    assert.equal(game.player.level, expectedXp.level);
    assert.equal(game.player.xp, expectedXp.xp);
    const paid = clone(game.capture());
    assert.equal(game.claimWorldEvent(event.id), false);
    assert.equal(game.player.gold, paid.player.gold);
    assert.equal(game.resources.dust, paid.resources.dust);
    assert.deepEqual(game.inventory, paid.inventory);
    assert.equal(game.interactWorldEvent(`${event.id}:start`), false);
  });
}

test('all four real starting signs enforce minimum level and individual proximity', () => {
  const game = fresh(1);
  for (const definition of EXPEDITION_CONTENT) {
    const start = game.world.eventObjects.find(object => object.id === `${definition.id}:start`);
    assert.ok(start);
    approach(game, start); game.player.level = definition.minLevel - 1;
    assert.equal(game.interactWorldEvent(start.id), false);
    assert.equal(game.world.worldEvents.find(event => event.id === definition.id).state, 'idle');
    game.player.level = definition.minLevel; game.player.x += 100;
    assert.equal(game.interactWorldEvent(start.id), false);
    approach(game, start);
    assert.equal(game.interactWorldEvent(start.id), true);
  }
});

test('a spent expedition repeats after its actual cooldown with a new run and reduced reward', () => {
  const definition = EXPEDITION_CONTENT[0], game = fresh(definition.level);
  const event = runExpedition(game, definition);
  approach(game, event);
  const first = summarizeWorldEvents(game.world, game.player).find(candidate => candidate.id === event.id).reward;
  assert.equal(game.claimWorldEvent(event.id), true);
  game.time = event.readyAt - .1;
  approach(game, game.world.eventObjects.find(object => object.id === `${event.id}:start`));
  assert.equal(game.interactWorldEvent(`${event.id}:start`), false);
  game.time = event.readyAt + .1; game.updateWorld(.1, [game]);
  assert.equal(event.state, 'idle');
  runExpedition(game, definition);
  assert.equal(event.run, 2);
  assert.equal(event.completions, 2);
  const second = summarizeWorldEvents(game.world, game.player).find(candidate => candidate.id === event.id).reward;
  assert.equal(second.repeatFactor, .5);
  assert.ok(second.gold < first.gold && second.xp < first.xp);
  assert.equal(game.ledger[`world_event:${event.id}`], 2);
});

test('old saves leave new expeditions idle and claimed runs cannot pay again after restoration', () => {
  const definition = EXPEDITION_CONTENT[1], game = fresh(definition.level);
  const legacy = clone(game.capture());
  legacy.world.worldEvents = legacy.world.worldEvents.filter(event => !EXPEDITION_CONTENT.some(candidate => candidate.id === event.id));
  assert.equal(validateWorldEventSave(legacy.world.worldEvents), true);
  const older = fresh(); older.applySave(legacy); older.start();
  for (const content of EXPEDITION_CONTENT) assert.equal(older.world.worldEvents.find(event => event.id === content.id).state, 'idle');
  const event = runExpedition(game, definition);
  approach(game, event);
  assert.equal(game.claimWorldEvent(event.id), true);
  const paid = clone(game.capture()), restored = fresh();
  restored.applySave(paid); restored.start();
  approach(restored, event);
  assert.equal(restored.claimWorldEvent(event.id), false);
  assert.equal(restored.player.gold, paid.player.gold);
  assert.equal(restored.resources.dust, paid.resources.dust);
  assert.deepEqual(restored.inventory, paid.inventory);
  assert.equal(restored.ledger[`world_event:${event.id}`], 1);
});

test('a save taken during stage one fails the run on restore instead of skipping stages or gaining a reward', () => {
  const definition = EXPEDITION_CONTENT[3], game = fresh(definition.level);
  const start = game.world.eventObjects.find(object => object.id === `${definition.id}:start`);
  approach(game, start);
  assert.equal(game.interactWorldEvent(start.id), true);
  const saved = clone(game.capture()), restored = fresh();
  restored.applySave(saved); restored.start();
  const event = restored.world.worldEvents.find(candidate => candidate.id === definition.id);
  assert.equal(event.state, 'failure');
  assert.equal(restored.ledger[`world_event:${definition.id}`], undefined);
  approach(restored, event);
  assert.equal(restored.claimWorldEvent(event.id), false);
  assert.equal(restored.player.gold, saved.player.gold);
});

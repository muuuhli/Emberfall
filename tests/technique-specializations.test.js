import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES } from '../src/classes.js';
import { applyTalentAbilityProfile, getTalentCombatModifiers } from '../src/talent-combat.js';
import {
  TECHNIQUE_SPECIALIZATIONS, createTechniqueSpecializationState, getTechniqueSpecialization,
  validateTechniqueSpecializations, restoreTechniqueSpecializations, captureTechniqueSpecializations,
  canLearnTechniqueSpecialization, learnTechniqueSpecialization, canSelectTechniqueSpecialization,
  selectTechniqueSpecialization, applyTechniqueSpecialization, previewTechniqueSpecialization,
  techniqueSpecializationSummary, techniqueCooldownCeiling,
} from '../src/technique-specializations.js';

const clone = value => JSON.parse(JSON.stringify(value));
function character(classId = 'ranger', changes = {}) {
  return { player: { classId, level: 70, hp: 100 }, resources: { raidSigil: 24, dust: 61 },
    techniqueSpecializations: createTechniqueSpecializationState(), worldMode: 'overworld', world: {},
    cooldowns: { bolt: 3, nova: 9 }, inSettlement: () => true, inCombat: () => false, ...changes };
}
function profile(classId, id, { skills = {} } = {}) {
  const game = character(classId), definition = getTechniqueSpecialization(id), cls = CLASSES.find(c => c.id === classId);
  assert.equal(learnTechniqueSpecialization(game, id), true); assert.equal(selectTechniqueSpecialization(game, id), true);
  const base = applyTalentAbilityProfile(cls.abilities[definition.action], getTalentCombatModifiers(skills, classId), { action: definition.action });
  return { game, base, changed: applyTechniqueSpecialization(base, game, { action: definition.action }), definition };
}
const context = game => ({ classId: game.player.classId, level: game.player.level });

test('all eight classes have exactly two canonical alternatives for one existing core action', () => {
  const original = clone(CLASSES);
  assert.equal(TECHNIQUE_SPECIALIZATIONS.length, 16);
  assert.equal(new Set(TECHNIQUE_SPECIALIZATIONS.map(d => d.id)).size, 16);
  for (const cls of CLASSES) {
    const choices = TECHNIQUE_SPECIALIZATIONS.filter(d => d.classId === cls.id);
    assert.equal(choices.length, 2); assert.equal(choices[0].action, choices[1].action);
    for (const choice of choices) {
      assert.equal(choice.sigilCost, 12);
      assert.equal(choice.techniqueName, cls.abilities[choice.action].name);
      assert.ok(Object.isFrozen(choice) && Object.isFrozen(choice.multiply));
      const base = cls.abilities[choice.action], changed = previewTechniqueSpecialization(base, choice.id, { classId: cls.id, action: choice.action });
      assert.equal(changed.kind, base.kind);
      const resourceOrTiming = new Set(['cost', 'cooldown', 'summonAttackCooldown']);
      const drawback = Object.keys(choice.multiply).some(key => Number.isFinite(base[key])
        && (resourceOrTiming.has(key) ? changed[key] > base[key] : changed[key] < base[key]))
        || Object.keys(choice.set).some(key => Number.isFinite(base[key]) && changed[key] < base[key]);
      assert.ok(drawback, `${choice.id} must pay an actual profile disadvantage`);
    }
  }
  assert.deepEqual(CLASSES, original, 'preview never mutates the shared class catalog');
});

test('learning spends twelve existing sigils exactly once, while selection is separate and free', () => {
  const game = character(), originalCooldowns = clone(game.cooldowns);
  assert.equal(canLearnTechniqueSpecialization(game, 'ranger_linebreaker').ok, true);
  assert.equal(learnTechniqueSpecialization(game, 'ranger_linebreaker'), true);
  assert.equal(game.resources.raidSigil, 12); assert.equal(game.resources.dust, 61);
  assert.equal(game.techniqueSpecializations.active, null);
  assert.equal(learnTechniqueSpecialization(game, 'ranger_linebreaker'), false);
  assert.equal(game.resources.raidSigil, 12);
  assert.equal(selectTechniqueSpecialization(game, 'ranger_linebreaker'), true);
  assert.equal(selectTechniqueSpecialization(game, 'ranger_linebreaker'), false);
  assert.equal(game.resources.raidSigil, 12);
  assert.deepEqual(game.cooldowns, originalCooldowns);
});

test('both alternatives can be learned but only one can act, with free reversible selection retaining cooldowns', () => {
  const game = character(), base = CLASSES.find(c => c.id === 'ranger').abilities.bolt;
  for (const id of ['ranger_linebreaker', 'ranger_focused_arrow']) assert.equal(learnTechniqueSpecialization(game, id), true);
  assert.equal(game.resources.raidSigil, 0);
  assert.equal(selectTechniqueSpecialization(game, 'ranger_linebreaker'), true);
  assert.equal(applyTechniqueSpecialization(base, game, { action: 'bolt' }).piercing, 5);
  assert.equal(selectTechniqueSpecialization(game, 'ranger_focused_arrow'), true);
  assert.equal(applyTechniqueSpecialization(base, game, { action: 'bolt' }).piercing, 1);
  assert.equal(selectTechniqueSpecialization(game, null), true);
  assert.deepEqual(applyTechniqueSpecialization(base, game, { action: 'bolt' }), base);
  assert.deepEqual(game.cooldowns, { bolt: 3, nova: 9 });
  assert.deepEqual(game.techniqueSpecializations.learned, ['ranger_linebreaker', 'ranger_focused_arrow']);
});

test('class, level, resources, death, combat, settlement and PvP gates refuse payment atomically', () => {
  const rejected = [
    game => { game.player.level = 69; }, game => { game.player.classId = 'guardian'; },
    game => { game.resources.raidSigil = 11; }, game => { game.resources.raidSigil = Infinity; },
    game => { game.resources.raidSigil = 12.1; }, game => { game.dead = true; }, game => { game.player.hp = 0; },
    game => { game.inCombat = () => true; }, game => { game.inSettlement = () => false; },
    game => { game.dungeonInstance = {}; }, game => { game.worldMode = 'pvp'; }, game => { game.world.isPvp = true; },
  ];
  for (const alter of rejected) {
    const game = character(); alter(game); const balance = game.resources.raidSigil, state = clone(game.techniqueSpecializations);
    assert.equal(canLearnTechniqueSpecialization(game, 'ranger_linebreaker').ok, false);
    assert.equal(learnTechniqueSpecialization(game, 'ranger_linebreaker'), false);
    assert.equal(game.resources.raidSigil, balance); assert.deepEqual(game.techniqueSpecializations, state);
  }
  const game = character(); assert.equal(learnTechniqueSpecialization(game, 'not-a-technique'), false);
  assert.equal(game.resources.raidSigil, 24);
});

test('an owned technique cannot be switched during a fight, dungeon, death or duel', () => {
  for (const alter of [g => { g.inCombat = () => true; }, g => { g.inSettlement = () => false; },
    g => { g.dungeonInstance = {}; }, g => { g.dead = true; }, g => { g.worldMode = 'pvp'; }]) {
    const game = character(); learnTechniqueSpecialization(game, 'ranger_linebreaker'); selectTechniqueSpecialization(game, 'ranger_linebreaker'); alter(game);
    const before = clone(game.techniqueSpecializations), sigils = game.resources.raidSigil;
    assert.equal(canSelectTechniqueSpecialization(game, null).ok, false);
    assert.equal(selectTechniqueSpecialization(game, null), false); assert.deepEqual(game.techniqueSpecializations, before);
    assert.equal(game.resources.raidSigil, sigils);
  }
});

test('old saves migrate empty; valid choices roundtrip detached from saved and current state', () => {
  assert.deepEqual(restoreTechniqueSpecializations(undefined), createTechniqueSpecializationState());
  const game = character(); learnTechniqueSpecialization(game, 'ranger_linebreaker'); selectTechniqueSpecialization(game, 'ranger_linebreaker');
  const captured = captureTechniqueSpecializations(game), restored = restoreTechniqueSpecializations(captured, context(game));
  assert.deepEqual(restored, game.techniqueSpecializations);
  captured.learned.length = 0; restored.active = null;
  assert.equal(game.techniqueSpecializations.active, 'ranger_linebreaker');
  assert.equal(game.techniqueSpecializations.learned.length, 1);
});

test('strict save validation rejects unknown effects, wrong class, free active choices and malformed ownership', () => {
  const game = character(); learnTechniqueSpecialization(game, 'ranger_linebreaker'); selectTechniqueSpecialization(game, 'ranger_linebreaker');
  const valid = captureTechniqueSpecializations(game), original = clone(game.techniqueSpecializations);
  for (const corrupt of [
    s => { s.multiply = { damageMultiplier: 100 }; }, s => { s.active = 'ranger_focused_arrow'; },
    s => { s.learned.push('ranger_linebreaker'); }, s => { s.learned = ['guardian_impact_wall']; s.active = s.learned[0]; },
    s => { s.version = 2; }, s => { s.learned = 'ranger_linebreaker'; }, s => { s.active = {}; },
    s => { s.learned = ['unknown']; s.active = null; }, s => { delete s.active; },
  ]) {
    const bad = clone(valid); corrupt(bad);
    assert.equal(validateTechniqueSpecializations(bad, context(game)), false);
    assert.throws(() => restoreTechniqueSpecializations(bad, context(game)), /Ungültige Technikprägung/);
    assert.deepEqual(game.techniqueSpecializations, original);
  }
  assert.equal(validateTechniqueSpecializations(valid, { classId: 'ranger', level: 69 }), false);
  assert.equal(validateTechniqueSpecializations(valid, { classId: 'guardian', level: 100 }), false);
});

test('runtime requires valid ownership, the matching core action and PvE, never changing another technique', () => {
  const { game, base } = profile('ranger', 'ranger_linebreaker'), cls = CLASSES.find(c => c.id === 'ranger');
  assert.deepEqual(applyTechniqueSpecialization(cls.abilities.nova, game, { action: 'nova' }), cls.abilities.nova);
  assert.deepEqual(applyTechniqueSpecialization(base, game, { action: 'learned' }), base);
  game.worldMode = 'pvp'; assert.deepEqual(applyTechniqueSpecialization(base, game, { action: 'bolt' }), base);
  game.worldMode = 'overworld'; game.techniqueSpecializations.learned = [];
  assert.deepEqual(applyTechniqueSpecialization(base, game, { action: 'bolt' }), base);
  game.techniqueSpecializations = { version: 1, learned: ['guardian_impact_wall'], active: 'guardian_impact_wall' };
  assert.deepEqual(applyTechniqueSpecialization(base, game, { action: 'bolt' }), base);
});

test('ranger choice offers opposite advantages for one distant target and a line of five', () => {
  const line = profile('ranger', 'ranger_linebreaker').changed, focus = profile('ranger', 'ranger_focused_arrow').changed;
  assert.ok(focus.damageMultiplier > line.damageMultiplier);
  assert.ok(focus.range > 750 && line.range < 750, 'a distant target can only be reached by focus');
  assert.ok(line.piercing * line.damageMultiplier > focus.piercing * focus.damageMultiplier, 'five aligned targets favor the line choice');
  assert.ok(focus.cooldown > line.cooldown, 'the higher single hit pays a slower recast');
});

test('paladin reach versus healing creates a choice for a split party instead of a universal stronger heal', () => {
  const far = profile('paladin', 'paladin_far_light').changed, close = profile('paladin', 'paladin_close_light').changed;
  const targets = [0, 150, 250], within = p => targets.filter(d => d < p.radius).length;
  assert.equal(within(far), 3); assert.equal(within(close), 1);
  assert.ok(close.healMultiplier > far.healMultiplier);
  assert.ok(close.cooldown > far.cooldown && close.cost > far.cost, 'focused healing trades reach, mana and recast');
});

test('guardian choice differentiates a lasting weaker barrier from an imminent stronger barrier', () => {
  const lasting = profile('guardian', 'guardian_enduring_wall').changed, impact = profile('guardian', 'guardian_impact_wall').changed;
  assert.ok(lasting.duration > 8 && impact.duration < 4);
  assert.ok(impact.shieldMultiplier > lasting.shieldMultiplier);
  assert.ok(lasting.cooldown > impact.cooldown);
});

test('flamecaller retains a distinct single-hit versus wider collateral damage decision', () => {
  const core = profile('flamecaller', 'flamecaller_cinder_core').changed, blossom = profile('flamecaller', 'flamecaller_fire_blossom').changed;
  assert.ok(core.damageMultiplier > blossom.damageMultiplier);
  assert.ok(core.splashRadius < 50 && blossom.splashRadius > 100, 'a second target 100 units away is only in blossom splash');
  assert.ok(core.cooldown > blossom.cooldown && core.range > blossom.range);
});

test('nightblade distances make the wider damaging cut require closer engagement', () => {
  const long = profile('nightblade', 'nightblade_long_shadow').changed, close = profile('nightblade', 'nightblade_close_cut').changed;
  assert.ok(long.range > 250 && close.range < 170);
  assert.ok(close.radius > long.radius && close.damageMultiplier > long.damageMultiplier);
});

test('frost choice respects the control cap even after composed control talents', () => {
  const bite = profile('frostweaver', 'frostweaver_frost_bite').changed, rime = profile('frostweaver', 'frostweaver_creeping_rime').changed;
  assert.ok(bite.slow > rime.slow && bite.duration < rime.duration);
  const composed = { ...CLASSES.find(c => c.id === 'frostweaver').abilities.bolt, slow: .72, duration: 4.2 };
  const capped = previewTechniqueSpecialization(composed, 'frostweaver_frost_bite', { classId: 'frostweaver', action: 'bolt' });
  assert.equal(capped.slow, .75); assert.ok(capped.duration < composed.duration); assert.equal(composed.slow, .72);
});

test('druid chooses immediate recovery versus a lasting stronger regeneration field', () => {
  const renewed = profile('druid', 'druid_renewing_circle').changed, pulse = profile('druid', 'druid_life_pulse').changed;
  assert.ok(pulse.healMultiplier > renewed.healMultiplier);
  assert.ok(renewed.duration > pulse.duration && renewed.regenerationMultiplier > pulse.regenerationMultiplier);
});

test('shadowbinder trades early attack cadence against lifetime without inventing extra summon capacity', () => {
  const patient = profile('shadowbinder', 'shadowbinder_patient_pact').changed, hungry = profile('shadowbinder', 'shadowbinder_ravenous_pact').changed;
  assert.equal(patient.summonCount, 2); assert.equal(hungry.summonCount, 2);
  assert.ok(hungry.summonAttackCooldown < patient.summonAttackCooldown);
  assert.ok(hungry.duration < 12 && patient.duration > 20);
  assert.ok(patient.cooldown > hungry.cooldown);
});

test('cooldown ceiling follows all owned canonical techniques even after clearing the active slot', () => {
  const game = character(); assert.equal(techniqueCooldownCeiling(game.techniqueSpecializations, 'ranger', 'bolt'), 1);
  learnTechniqueSpecialization(game, 'ranger_focused_arrow'); selectTechniqueSpecialization(game, 'ranger_focused_arrow');
  assert.equal(techniqueCooldownCeiling(game.techniqueSpecializations, 'ranger', 'bolt'), 1.25);
  selectTechniqueSpecialization(game, null);
  assert.equal(techniqueCooldownCeiling(game.techniqueSpecializations, 'ranger', 'bolt'), 1.25);
  assert.equal(techniqueCooldownCeiling(game.techniqueSpecializations, 'ranger', 'nova'), 1);
  assert.equal(techniqueCooldownCeiling(game.techniqueSpecializations, 'guardian', 'bolt'), 1);
  assert.equal(techniqueCooldownCeiling({ ...game.techniqueSpecializations, multiply: { cooldown: 100 } }, 'ranger', 'bolt'), 1);
});

test('summary previews composed talent profiles honestly before payment without mutating resources or active technique', () => {
  const game = character('paladin'); game.combatTalentModifiers = () => ({ healing: { healPower: .2 }, bolt: { radius: .1 } });
  const state = clone(game.techniqueSpecializations), resources = clone(game.resources), summary = techniqueSpecializationSummary(game);
  assert.equal(summary.offers.length, 2); assert.equal(summary.active, null); assert.equal(summary.sigils, 24);
  assert.ok(summary.offers.every(offer => !offer.learned && !offer.active && offer.learning.ok));
  for (const offer of summary.offers) {
    assert.ok(offer.baseProfile.healMultiplier > CLASSES.find(c => c.id === 'paladin').abilities.bolt.healMultiplier);
    assert.ok(offer.modifiedProfile.radius !== offer.baseProfile.radius);
  }
  assert.deepEqual(game.techniqueSpecializations, state); assert.deepEqual(game.resources, resources);
  summary.offers[0].multiply.radius = 999;
  assert.equal(getTechniqueSpecialization(summary.offers[0].id).multiply.radius, 1.65);
});

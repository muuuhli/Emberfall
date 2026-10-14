import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ABILITIES, getAbility, validateAbilityState } from '../src/abilities.js';
import { CLASSES, CLASS_TALENTS } from '../src/classes.js';
import { cumulativeXp } from '../src/progression.js';
import { applyTalentAbilityProfile } from '../src/talent-combat.js';

const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
function arena(classId) {
  const game = new Game({ storage: null, random: () => .5 });
  game.selectClass(classId); game.start(); game.gainXp(cumulativeXp(100));
  assert.equal(game.player.level, 100); assert.equal(game.player.skillPoints, 200);
  Object.assign(game.player, { id: `balance-${++serial}`, x: 5000, y: 1800, face: 0 });
  for (const key of ['trees', 'rocks', 'structures', 'walls', 'enemies', 'nodes', 'plots', 'chests', 'shrines', 'worldEvents', 'interactions']) game.world[key] = [];
  game.npcs = []; game.updateEnemies = () => {};
  game.world.encounterDirector.nextIn = 1e6;
  game.player.hp = game.stats().maxHp; game.player.mana = game.stats().mana;
  return game;
}
function learnAbility(game, ability) {
  if (ability.requires && !game.learnedAbilities[ability.requires]) learnAbility(game, getAbility(ability.requires));
  if (!game.learnedAbilities[ability.id]) assert.equal(game.learnAbility(ability.id), true, ability.id);
}
function learnTalent(game, id, rank = 1) {
  const talent = CLASS_TALENTS.find(entry => entry.id === id);
  assert.ok(talent, id);
  if (talent.requires) learnTalent(game, talent.requires, talent.requiresRank || 1);
  while ((game.skills[id] || 0) < rank) assert.equal(game.learn(id), true, id);
}
function spentPoints(game) {
  return CLASS_TALENTS.filter(talent => talent.classId === game.classId).reduce((sum, talent) => sum + (game.skills[talent.id] || 0) * talent.cost, 0)
    + ABILITIES.filter(ability => game.learnedAbilities[ability.id]).reduce((sum, ability) => sum + ability.talentCost, 0);
}
function enemy(game, distance) {
  const target = { id: `balance-target-${++serial}`, type: 'wolf', level: 100, x: game.player.x + distance, y: game.player.y,
    homeX: game.player.x + distance, homeY: game.player.y, hp: 100000, maxHp: 100000, alive: true, phase: 'idle' };
  game.world.enemies.push(target); return target;
}
function advance(game, seconds) {
  for (let elapsed = 0; elapsed < seconds - 1e-8; elapsed += .02) {
    const dt = Math.min(.02, seconds - elapsed);
    for (const member of game.partyGames) member.update(dt, { simulateWorld: false });
    game.updateWorld(dt, game.partyGames);
  }
}
const ownServants = game => game.summons.filter(summon => summon.life > 0 && !summon.companion && summon.actorId === game.player.id);
function pactBuild() {
  const game = arena('shadowbinder');
  learnTalent(game, 'shadowbinder_patient_pact', 2); learnTalent(game, 'shadowbinder_third_shadow');
  learnAbility(game, getAbility('shadowbinder_abyss_eye'));
  game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
  game.setAbilityLoadout(0, 'shadowbinder_legion'); game.setAbilityLoadout(1, 'shadowbinder_abyss_eye');
  game.player.mana = game.stats().mana;
  assert.equal(spentPoints(game) + game.player.skillPoints, 200);
  return game;
}
function sevenNativeServants(game) {
  assert.equal(game.action('nova'), true); assert.equal(ownServants(game).length, 3);
  advance(game, game.cooldowns.nova + .02);
  assert.equal(ownServants(game).length, 3, 'The first pact is still naturally alive after its cooldown');
  assert.equal(game.useLearnedAbility(0), true); assert.equal(ownServants(game).length, 7);
}

test('balance tuning retains all 88 skills and 196 canonical talent paths without changing saved IDs', () => {
  assert.equal(ABILITIES.length, 88); assert.equal(CLASS_TALENTS.length, 196);
  assert.equal(new Set(ABILITIES.map(ability => ability.id)).size, 88);
  assert.equal(new Set(CLASS_TALENTS.map(talent => talent.id)).size, 196);
  for (const cls of CLASSES) {
    const abilities = ABILITIES.filter(ability => ability.classId === cls.id);
    assert.equal(abilities.length, 11);
    for (const definition of [...abilities, ...cls.talents]) {
      assert.ok(Number.isFinite(definition.talentCost ?? definition.cost));
      const seen = new Set(); let entry = definition;
      while (entry) {
        assert.ok(!seen.has(entry.id), `${definition.id}: cyclic prerequisite`); seen.add(entry.id);
        assert.equal(entry.classId, cls.id);
        entry = entry.requires ? getAbility(entry.requires) || CLASS_TALENTS.find(talent => talent.id === entry.requires) : null;
        if (entry) assert.ok((entry.level ?? entry.minLevel) <= (definition.level ?? definition.minLevel));
      }
    }
  }
});

test('all 88 native skills pay their adjusted mana and cooldown once with a naturally earned point budget', () => {
  for (const ability of ABILITIES) {
    const game = arena(ability.classId); learnAbility(game, ability);
    game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
    assert.equal(game.setAbilityLoadout(0, ability.id), true);
    enemy(game, 60);
    if (ability.kind === 'revive') {
      const fallen = arena('guardian'); fallen.world = game.world; fallen.player.x = game.player.x + 40;
      fallen.player.y = game.player.y; fallen.player.hp = 0; fallen.dead = true;
      game.partyGames = fallen.partyGames = [game, fallen];
    }
    game.player.hp = game.stats().maxHp * .6;
    game.player.mana = game.stats().mana - 20;
    const profile = applyTalentAbilityProfile(ability, game.combatTalentModifiers(), { action: 'learned' });
    const before = game.player.mana;
    assert.equal(game.useLearnedAbility(0), true, ability.id);
    if (ability.kind !== 'bargain') assert.ok(Math.abs(game.player.mana - (before - profile.cost)) < 1e-8, `${ability.id}: native mana`);
    assert.ok(Math.abs(game.cooldowns[`ability:${ability.id}`] - profile.cooldown * (1 - game.stats().cooldown)) < 1e-8, `${ability.id}: native cooldown`);
    const paidMana = game.player.mana, paidCooldown = game.cooldowns[`ability:${ability.id}`];
    assert.equal(game.useLearnedAbility(0), false, `${ability.id}: repeated input during cooldown`);
    assert.equal(game.player.mana, paidMana); assert.equal(game.cooldowns[`ability:${ability.id}`], paidCooldown);
    assert.equal(spentPoints(game) + game.player.skillPoints, 200, `${ability.id}: no free prerequisite points`);
    assert.doesNotThrow(() => validateAbilityState(game.capture()), ability.id);
  }
});

test('dedicated learned taunt reach preserves ordinary area and the canonical frozen definition', () => {
  const source = Object.freeze({ kind: 'taunt', radius: 360, shieldFraction: .16, duration: 7, cost: 34, cooldown: 26 });
  const profile = applyTalentAbilityProfile(source, { shielding: { radius: .16, tauntRadius: .25, shieldPower: .2, cooldown: .25 } });
  assert.ok(Math.abs(profile.radius - 417.6) < 1e-8);
  assert.ok(Math.abs(profile.tauntRadius - 522) < 1e-8);
  assert.equal(profile.shieldFraction, .192); assert.equal(profile.cooldown, 32.5);
  assert.equal(source.tauntRadius, undefined); assert.equal(source.radius, 360);
  assert.deepEqual(applyTalentAbilityProfile(source, {}), source);
  const ordinaryShield = applyTalentAbilityProfile({ kind: 'partyShield', radius: 310, shieldFraction: .2 }, { shielding: { tauntRadius: .25 } });
  assert.equal(ordinaryShield.tauntRadius, undefined); assert.equal(ordinaryShield.radius, 310);
});

test('Gate Oath reaches a real distant foe while paying its shield timing tradeoff and excluding its rival', () => {
  const game = arena('guardian'), ability = getAbility('guardian_black_standard');
  learnAbility(game, ability); learnTalent(game, 'guardian_watchful_aegis', 2);
  const before = applyTalentAbilityProfile(ability, game.combatTalentModifiers(), { action: 'learned' });
  learnTalent(game, 'guardian_gate_oath');
  const profile = applyTalentAbilityProfile(ability, game.combatTalentModifiers(), { action: 'learned' });
  assert.equal(profile.radius, before.radius); assert.ok(profile.tauntRadius > profile.radius);
  assert.equal(profile.cooldown, before.cooldown * 1.25);
  const reached = enemy(game, 450), outside = enemy(game, 530);
  game.setAbilityLoadout(0, ability.id); game.player.mana = game.stats().mana;
  assert.equal(game.useLearnedAbility(0), true);
  assert.equal(reached.targetId, game.player.id); assert.equal(reached.tauntUntil, game.time + profile.duration);
  assert.equal(outside.targetId, undefined);
  learnTalent(game, 'guardian_sweeping_guard', 2);
  const points = game.player.skillPoints;
  assert.equal(game.learn('guardian_iron_momentum'), false); assert.equal(game.player.skillPoints, points);
  assert.equal(spentPoints(game) + game.player.skillPoints, 200);
  game.world.encounterDirector.nextIn = 75;
  const saved = clone(game.capture()), loaded = arena('guardian'); loaded.applySave(saved);
  assert.deepEqual(loaded.combatTalentModifiers(), game.combatTalentModifiers());
  assert.equal(loaded.cooldowns[`ability:${ability.id}`], game.cooldowns[`ability:${ability.id}`]);
});

test('a learned pact rejects a naturally full shared eight-servant cap without spending mana or cooldown', () => {
  const game = pactBuild(); sevenNativeServants(game);
  assert.equal(game.action('nova'), true); assert.equal(ownServants(game).length, 8, 'The core pact fills only its one remaining slot');
  const mana = game.player.mana, cooldown = game.cooldowns['ability:shadowbinder_abyss_eye'] || 0;
  assert.equal(game.useLearnedAbility(1), false);
  assert.equal(game.player.mana, mana); assert.equal(game.cooldowns['ability:shadowbinder_abyss_eye'] || 0, cooldown);
  assert.equal(ownServants(game).length, 8);
});

test('a core pact rejects a naturally full shared cap and learned pacts fill only remaining slots', () => {
  const game = pactBuild(); sevenNativeServants(game);
  assert.equal(game.useLearnedAbility(1), true); assert.equal(ownServants(game).length, 8, 'The two-servant eye fills only one remaining slot');
  const mana = game.player.mana, cooldown = game.cooldowns.nova || 0;
  assert.equal(cooldown, 0); assert.equal(game.action('nova'), false);
  assert.equal(game.player.mana, mana); assert.equal(game.cooldowns.nova || 0, cooldown);
  assert.equal(ownServants(game).length, 8);
});

test('core summoning snapshots two remaining slots before spawning either servant', () => {
  const game = arena('shadowbinder'); learnTalent(game, 'shadowbinder_patient_pact', 2);
  learnAbility(game, getAbility('shadowbinder_abyss_eye'));
  game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
  game.setAbilityLoadout(0, 'shadowbinder_legion'); game.setAbilityLoadout(1, 'shadowbinder_abyss_eye');
  assert.equal(game.action('nova'), true); advance(game, game.cooldowns.nova + .02);
  assert.equal(ownServants(game).length, 2);
  assert.equal(game.useLearnedAbility(0), true); assert.equal(game.useLearnedAbility(1), true);
  assert.equal(ownServants(game).length, 6);
  assert.equal(game.action('nova'), true); assert.equal(ownServants(game).length, 8);
  assert.equal(spentPoints(game) + game.player.skillPoints, 200);
});

test('summon capacity counts living servants per owner and excludes a native earned companion', () => {
  const pact = pactBuild(), ranger = arena('ranger');
  // These canonical historical events establish a legitimately earned companion.
  pact.event('rescue', 'daemmerhain'); pact.event('rescue', 'frostgrat');
  pact.event('boss', 'thorn_guardian'); pact.event('boss', 'frost_sentinel');
  assert.equal(pact.selectCompanion('ossuary_hound'), true);
  advance(pact, .02); assert.equal(pact.summons.filter(summon => summon.companion).length, 1);
  sevenNativeServants(pact); assert.equal(pact.useLearnedAbility(1), true); assert.equal(ownServants(pact).length, 8);
  ranger.world = pact.world; pact.partyGames = ranger.partyGames = [pact, ranger]; ranger.time = pact.time;
  for (const key of ['effects', 'projectiles', 'summons', 'hazards', 'drops']) ranger[key] = pact[key];
  learnAbility(ranger, getAbility('ranger_hawk')); ranger.setAbilityLoadout(0, null); ranger.setAbilityLoadout(1, null);
  ranger.setAbilityLoadout(0, 'ranger_hawk'); ranger.player.mana = ranger.stats().mana;
  assert.equal(ranger.useLearnedAbility(0), true, 'Another class owns its independent servant budget');
  assert.equal(ownServants(pact).length, 8); assert.equal(ownServants(ranger).length, 1);
  // Expired entries can remain queued until the next shared world cleanup.
  ranger.summons.push(...Array.from({ length: 8 }, (_, index) => ({ id: `expired-${index}`, actorId: ranger.player.id, life: 0 })));
  learnAbility(ranger, getAbility('ranger_dusk_flock')); ranger.setAbilityLoadout(1, 'ranger_dusk_flock');
  assert.equal(ranger.useLearnedAbility(1), true); assert.equal(ownServants(ranger).length, 3);
  assert.equal(ownServants(pact).length, 8); assert.equal(pact.summons.filter(summon => summon.companion && summon.life > 0).length, 1);
});

test('paid core and learned cooldowns survive save loading while pre-extension saves remain loadable', () => {
  for (const classId of ['guardian', 'ranger', 'shadowbinder']) {
    const game = arena(classId), ability = ABILITIES.find(entry => entry.classId === classId);
    learnAbility(game, ability); game.setAbilityLoadout(0, ability.id); enemy(game, 60);
    assert.equal(game.action('bolt'), true); assert.equal(game.action('nova'), true);
    assert.equal(game.action('attack'), true); assert.equal(game.action('dash'), true);
    assert.equal(game.useLearnedAbility(0), true);
    game.world.encounterDirector.nextIn = 75;
    const saved = clone(game.capture()), loaded = arena(classId); loaded.applySave(saved);
    for (const action of ['attack', 'dash', 'bolt', 'nova']) {
      assert.equal(loaded.cooldowns[action], game.cooldowns[action]);
      const mana = loaded.player.mana; assert.equal(loaded.action(action), false);
      assert.equal(loaded.player.mana, mana);
    }
    assert.equal(loaded.cooldowns[`ability:${ability.id}`], game.cooldowns[`ability:${ability.id}`]);
    const legacy = clone(saved); delete legacy.combatCooldowns;
    assert.doesNotThrow(() => loaded.applySave(legacy));
    assert.equal(loaded.cooldowns[`ability:${ability.id}`], saved.abilityCooldowns[ability.id]);
    const before = clone(loaded.capture());
    for (const value of [NaN, Infinity, -1, 1e6]) {
      const invalid = clone(saved); invalid.combatCooldowns.nova = value;
      assert.throws(() => loaded.applySave(invalid));
      assert.deepEqual(loaded.capture().player, before.player);
      assert.deepEqual(loaded.capture().combatCooldowns, before.combatCooldowns);
    }
    const invalid = clone(saved); invalid.combatCooldowns.forged = 1;
    assert.throws(() => loaded.applySave(invalid));
  }
});

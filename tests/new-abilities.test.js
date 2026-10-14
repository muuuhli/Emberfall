import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ABILITIES, getAbility } from '../src/abilities.js';
import { MASTERY_ABILITIES } from '../src/mastery-abilities.js';
import { CLASSES } from '../src/classes.js';
import { getMasteryState, clearMasteryAbilities, preflightMasteryAbility, onMasteryHit, onMasteryDamaged } from '../src/ability-runtime.js';

const clone = value => JSON.parse(JSON.stringify(value));
let serial = 0;
function arena(classId = 'ranger') {
  const game = new Game({ storage: null, random: () => .5 }); game.selectClass(classId);
  Object.assign(game.player, { id: `mastery-${++serial}`, level: 100, skillPoints: 200, x: 5000, y: 1800, face: 0 });
  for (const key of ['trees', 'rocks', 'structures', 'enemies', 'shrines', 'nodes', 'plots', 'chests', 'worldEvents']) game.world[key] = [];
  game.world.interactions = []; game.npcs = []; game.updateEnemies = () => {};
  game.player.hp = game.stats().maxHp; game.player.mana = game.stats().mana; game.start(); return game;
}
function target(game, dx = 100, dy = 0, changes = {}) {
  const enemy = { id: `target-${++serial}`, type: 'wolf', alive: true, hp: 100000, maxHp: 100000, x: game.player.x + dx, y: game.player.y + dy,
    homeX: game.player.x + dx, homeY: game.player.y + dy, level: 100, phase: 'idle', ...changes };
  game.world.enemies.push(enemy); return enemy;
}
function prepare(game, id, slot = 0) {
  const ability = getAbility(id);
  if (ability.requires && !game.learnedAbilities[ability.requires]) prepare(game, ability.requires, slot);
  if (!game.learnedAbilities[id]) assert.equal(game.learnAbility(id), true, id);
  game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
  assert.equal(game.setAbilityLoadout(slot, id), true); game.player.mana = game.stats().mana; return ability;
}
function learnTalent(game, id, rank = 1) {
  const talent = CLASSES.find(definition => definition.id === game.player.classId).talents.find(talent => talent.id === id);
  assert.ok(talent, id);
  if (talent.requires) learnTalent(game, talent.requires, talent.requiresRank || 1);
  while ((game.skills[id] || 0) < rank) assert.equal(game.learn(id), true, id);
}
function advance(game, duration) {
  for (let time = 0; time < duration - 1e-8; time += .02) {
    for (const member of game.partyGames) member.update(.02, { simulateWorld: false });
    game.updateWorld(.02, game.partyGames);
  }
}
function share(...games) {
  for (const game of games) { game.world = games[0].world; game.partyGames = games;
    for (const key of ['effects', 'projectiles', 'summons', 'hazards', 'drops']) game[key] = games[0][key]; }
}

test('24 original techniques add three per class while preserving the 64 existing abilities and valid learning paths', () => {
  assert.equal(MASTERY_ABILITIES.length, 24); assert.equal(ABILITIES.length, 88);
  assert.equal(ABILITIES.filter(ability => ability.contentType !== 'mastery').length, 64);
  assert.equal(new Set(ABILITIES.map(ability => ability.id)).size, 88);
  assert.deepEqual(new Set(MASTERY_ABILITIES.map(ability => ability.kind)), new Set(['mark', 'retaliationWard', 'stepStrike', 'channel']));
  for (const classId of new Set(MASTERY_ABILITIES.map(ability => ability.classId))) {
    const definitions = MASTERY_ABILITIES.filter(ability => ability.classId === classId);
    assert.deepEqual(definitions.map(ability => ability.level), [16, 38, 62]);
    for (const ability of definitions) {
      assert.ok(Object.isFrozen(ability)); assert.ok(ability.description.length > 130 && !ability.description.includes('{'));
      assert.ok(ability.cost >= 20 && ability.cost <= 40 && ability.cooldown >= 12 && ability.cooldown <= 30);
      const seen = new Set(); let prerequisite = ability;
      while (prerequisite) { assert.ok(!seen.has(prerequisite.id)); seen.add(prerequisite.id); assert.equal(prerequisite.classId, classId); prerequisite = getAbility(prerequisite.requires); }
      assert.ok(getAbility(ability.requires)?.level <= ability.level);
    }
  }
});

for (const ability of MASTERY_ABILITIES) test(`${ability.id} pays its native cost once and produces its stated family effect`, () => {
  const game = arena(ability.classId); prepare(game, ability.id);
  const enemy = target(game, 65, ability.kind === 'stepStrike' ? ability.distance * ability.side : 0);
  const before = { mana: game.player.mana, hp: enemy.hp };
  assert.equal(game.useLearnedAbility(0), true);
  assert.equal(game.player.mana, before.mana - ability.cost);
  assert.equal(game.useLearnedAbility(0), false); assert.ok(game.cooldowns[`ability:${ability.id}`] > 0);
  if (ability.kind === 'mark') assert.equal(getMasteryState(game).marks[0].charges, 2);
  if (ability.kind === 'channel') assert.equal(getMasteryState(game).channel.remaining, 3);
  if (ability.kind === 'stepStrike') {
    assert.ok(Math.abs(game.player.y - 1800 - ability.distance * ability.side) < 1e-7);
    assert.equal(game.player.invulnerable, 0);
  }
  if (ability.kind === 'retaliationWard') {
    assert.ok(game.player.shield > 0); assert.equal(getMasteryState(game).ward.charges, 3);
    game.damagePlayer(game.stats().maxHp * .4, { ignoreInvulnerability: true });
    assert.equal(getMasteryState(game).ward.charges, 2);
  }
  advance(game, 1.3); assert.ok(enemy.hp < before.hp, 'A real Game hit applied damage');
  assert.ok(game.effects.length || game.player.castUntil > 0);
});

test('mark preflight is atomic without a forward visible target and foreign classes cannot cast', () => {
  const game = arena('ranger'), ability = prepare(game, 'ranger_quarry_sign');
  const mana = game.player.mana; assert.equal(game.useLearnedAbility(0), false); assert.equal(game.player.mana, mana);
  assert.equal(game.cooldowns[`ability:${ability.id}`], undefined);
  const behind = target(game, -100); assert.equal(game.useLearnedAbility(0), false); behind.alive = false;
  target(game, 200);
  game.world.structures.push({ x: 5090, y: 1700, w: 20, h: 200, blocking: true, collision: { x: 5090, y: 1700, w: 20, h: 200 } });
  assert.equal(game.useLearnedAbility(0), false); assert.equal(game.player.mana, mana);
  game.world.structures = []; game.player.classId = 'guardian';
  assert.equal(game.useLearnedAbility(0), false); assert.equal(game.player.mana, mana);
  assert.equal(preflightMasteryAbility(game, getAbility('guardian_bulwark')), null);
});

test('channels wait for three bounded pulses, keep their direction and respect walls', () => {
  const game = arena('ranger'); prepare(game, 'ranger_stillstring');
  const front = target(game, 160), side = target(game, 100, 100), behindWall = target(game, 330);
  game.world.structures.push({ x: 5250, y: 1700, w: 20, h: 200, blocking: true, collision: { x: 5250, y: 1700, w: 20, h: 200 } });
  assert.equal(game.useLearnedAbility(0), true); game.aim = { x: side.x, y: side.y };
  advance(game, .28); assert.equal(front.hp, 100000);
  advance(game, .04); assert.ok(front.hp < 100000); assert.equal(getMasteryState(game).channel.remaining, 2);
  advance(game, 1); const done = front.hp;
  assert.equal(getMasteryState(game).channel, null); assert.equal(side.hp, 100000); assert.equal(behindWall.hp, 100000);
  advance(game, 2); assert.equal(front.hp, done);
});

test('channel interruption is tied to actual movement, HP loss or successful actions, and shortens only its own FX', () => {
  for (const interrupt of ['movement', 'damage', 'attack']) {
    const game = arena('ranger'); prepare(game, 'ranger_stillstring'); const enemy = target(game, 100);
    game.useLearnedAbility(0);
    const ownEffect = game.effects.find(effect => effect.kind === 'mastery-channel');
    const allyEffect = { ...ownEffect, actorId: 'another-player', life: 5 }; game.effects.push(allyEffect);
    if (interrupt === 'movement') { game.keys.add('s'); advance(game, .02); }
    if (interrupt === 'damage') game.damagePlayer(20, { trueDamage: true, ignoreInvulnerability: true });
    if (interrupt === 'attack') assert.equal(game.action('attack'), true);
    assert.equal(getMasteryState(game).channel, null); assert.ok(ownEffect.life <= .08); assert.ok(allyEffect.life > 4.9);
    assert.notEqual(game.player.presentation?.skillId, 'ranger_stillstring');
    const hp = enemy.hp; game.projectiles = []; game.aim = null; game.keys.clear(); advance(game, 1.5); assert.equal(enemy.hp, hp);
  }
  const blocked = arena('ranger'); prepare(blocked, 'ranger_stillstring'); target(blocked);
  blocked.useLearnedAbility(0); blocked.cooldowns.attack = 2;
  assert.equal(blocked.action('attack'), false); assert.equal(getMasteryState(blocked).channel.remaining, 3);
  assert.equal(onMasteryDamaged(blocked, 0), 0); assert.equal(getMasteryState(blocked).channel.remaining, 3);
});

test('zero, negative and nonfinite native damage cannot spend marks, leech or mutate enemy HP', () => {
  const game = arena('ranger'); prepare(game, 'ranger_quarry_sign'); const enemy = target(game);
  game.useLearnedAbility(0); game.player.hp -= 50;
  const hp = enemy.hp, playerHp = game.player.hp;
  for (const value of [0, -1, NaN, Infinity]) assert.equal(game.hitEnemy(enemy, value, 0), 0);
  assert.equal(enemy.hp, hp); assert.equal(game.player.hp, playerHp);
  assert.equal(getMasteryState(game).marks[0].charges, 2);
});

test('own marks consume exactly two real hits, reject recursive/zero damage and reward an actual slowed target', () => {
  const sample = slowed => {
    const game = arena('frostweaver'); prepare(game, 'frostweaver_rime_lock'); const enemy = target(game);
    game.useLearnedAbility(0);
    if (slowed) { enemy.slowUntil = game.time + 3; enemy.slowFactor = .5; }
    const before = enemy.hp;
    assert.equal(onMasteryHit(game, enemy, 0), 0); assert.equal(getMasteryState(game).marks[0].charges, 2);
    game.hitEnemy(enemy, 10, 0); const first = before - enemy.hp;
    assert.equal(getMasteryState(game).marks[0].charges, 1);
    game.hitEnemy(enemy, 10, 0); assert.equal(getMasteryState(game).marks.length, 0);
    const thirdBefore = enemy.hp; game.hitEnemy(enemy, 10, 0); assert.ok(thirdBefore - enemy.hp < first);
    return first;
  };
  assert.ok(sample(true) > sample(false) * 1.8);
});

test('one party member cannot spend another owner mark, and marks expire without healing or bonus damage', () => {
  const game = arena('ranger'), ally = arena('ranger'); share(game, ally); prepare(game, 'ranger_quarry_sign');
  const enemy = target(game, 200); game.useLearnedAbility(0); ally.hitEnemy(enemy, 10, 0);
  assert.equal(getMasteryState(game).marks[0].charges, 2); assert.equal(getMasteryState(ally).marks.length, 0);
  advance(game, 6.1); assert.equal(getMasteryState(game).marks.length, 0);
});

test('every mark condition reads actual owner status, range or target health instead of a fabricated combo flag', () => {
  const helpers = { guardian: 'guardian_challenge', paladin: 'paladin_martyr', frostweaver: 'frostweaver_shards',
    druid: 'druid_vines', flamecaller: 'flamecaller_cinder', shadowbinder: 'shadowbinder_curse' };
  for (const ability of MASTERY_ABILITIES.filter(ability => ability.kind === 'mark')) {
    const sample = enabled => {
      const game = arena(ability.classId);
      const enemy = target(game, enabled && ability.classId === 'guardian' ? 220 : ability.condition === 'distant' && enabled ? 200 : 80);
      if (enabled && ability.condition === 'wounded') game.hitEnemy(enemy, 60000, 0);
      if (enabled && helpers[ability.classId]) {
        prepare(game, helpers[ability.classId]); game.aim = { x: enemy.x, y: enemy.y };
        assert.equal(game.useLearnedAbility(0), true); advance(game, .3);
        game.player.face = 0; game.aim = null;
      }
      prepare(game, ability.id); assert.equal(game.useLearnedAbility(0), true, ability.id);
      // An arbitrary property does not grant the prepared-status bonus.
      enemy.comboReady = true;
      const before = enemy.hp; game.hitEnemy(enemy, 10, 0);
      return before - enemy.hp;
    };
    const active = sample(true), absent = sample(false);
    assert.ok(active > absent * 1.75, `${ability.id} condition needs the real native setup: ${active} / ${absent}`);
  }
});

test('ward answers are bounded to three applied-HP triggers and one per second, never shield-only or fatal hits', () => {
  const game = arena('guardian'); prepare(game, 'guardian_answering_steel'); const enemy = target(game);
  game.useLearnedAbility(0); const hp = enemy.hp;
  game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true });
  assert.equal(enemy.hp, hp); assert.equal(getMasteryState(game).ward.charges, 3);
  game.player.shield = 0;
  game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true }); assert.equal(getMasteryState(game).ward.charges, 2);
  const first = enemy.hp; game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true }); assert.equal(enemy.hp, first);
  advance(game, 1.01); game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true });
  advance(game, 1.01); game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true });
  assert.equal(getMasteryState(game).ward, null);
  const done = enemy.hp; advance(game, 1.01); game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true }); assert.equal(enemy.hp, done);
  const dying = arena('guardian'); prepare(dying, 'guardian_answering_steel'); const foe = target(dying); dying.useLearnedAbility(0); dying.player.shield = 0;
  dying.damagePlayer(dying.stats().maxHp * 3, { trueDamage: true, ignoreInvulnerability: true }); assert.equal(dying.dead, true); assert.equal(foe.hp, 100000);
});

test('longer frost control changes the retaliation slow without shortening the six-second ward', () => {
  const game = arena('frostweaver'); learnTalent(game, 'frostweaver_white_prison');
  const ability = prepare(game, 'frostweaver_crystal_answer'), enemy = target(game);
  assert.equal(game.useLearnedAbility(0), true);
  assert.equal(getMasteryState(game).ward.remaining, ability.duration, 'Control duration must not replace the entire shield/ward lifetime');
  advance(game, 3); assert.ok(getMasteryState(game).ward);
  game.player.shield = 0; game.damagePlayer(1, { trueDamage: true, ignoreInvulnerability: true });
  assert.ok(enemy.slowUntil - game.time > ability.slowDuration, 'The native retaliation actually gives its longer slow');
  assert.ok(getMasteryState(game).ward.remaining > 2.9);
});

test('lasting spring strengthens actual periodic healing while reducing direct healing as described', () => {
  const sample = (id, keystone) => {
    const game = arena('druid'); learnTalent(game, 'druid_wandering_bloom', 2);
    if (keystone) learnTalent(game, 'druid_lasting_spring');
    if (id !== 'bolt') prepare(game, id);
    game.player.hp = game.stats().maxHp * .2; game.player.mana = game.stats().mana;
    const before = game.player.hp;
    assert.equal(id === 'bolt' ? game.action('bolt') : game.useLearnedAbility(0), true);
    if (id !== 'bolt') advance(game, 1.02);
    return game.player.hp - before;
  };
  for (const id of ['druid_spring_rain', 'druid_moonwell']) {
    const baseline = sample(id, false), empowered = sample(id, true);
    // Contributions use the unmodified base: two Wandering Bloom ranks give
    // -10%, then this keystone adds15%, so the actual factor grows .9→1.05.
    const expected = (1 - .1 + .15) / (1 - .1);
    assert.ok(Math.abs(empowered / baseline - expected) < 1e-8, `${id}: actual periodic healing must receive the15% base contribution`);
  }
  assert.ok(sample('bolt', true) < sample('bolt', false), 'Its direct heal penalty still applies');
});

test('far siphon modifies the real mana cost and reach of an owner draining channel', () => {
  const game = arena('shadowbinder'); learnTalent(game, 'shadowbinder_far_siphon', 2);
  const ability = prepare(game, 'shadowbinder_grave_thread'), enemy = target(game, 480);
  const mana = game.player.mana;
  assert.equal(game.useLearnedAbility(0), true);
  assert.ok(Math.abs(game.player.mana - (mana - ability.cost * 1.24)) < 1e-8, 'The longer draining channel pays the actual24% mana tradeoff');
  advance(game, 1.3);
  assert.ok(enemy.hp < 100000, 'A480-step target lies outside the base420 beam but inside its real draining reach');
});

test('offensive steps stop at collision, damage only from the reached endpoint and do not grant invulnerability', () => {
  const game = arena('nightblade'); prepare(game, 'nightblade_crosscut_step');
  const atEnd = target(game, 60, 25), oldFarEndpoint = target(game, 60, 220);
  game.world.structures.push({ x: 4900, y: 1845, w: 200, h: 20, blocking: true, collision: { x: 4900, y: 1845, w: 200, h: 20 } });
  assert.equal(game.useLearnedAbility(0), true); assert.ok(game.player.y < 1845 - 12);
  assert.ok(atEnd.hp < 100000); assert.equal(oldFarEndpoint.hp, 100000); assert.equal(game.player.invulnerable, 0);
  const effect = game.effects.find(effect => effect.kind === 'mastery-step'); assert.equal(effect.y, game.player.y);
});

test('runtime expires on world/player identity changes and does not reappear from forged save fields; cooldown survives', () => {
  const game = arena('ranger'); prepare(game, 'ranger_quarry_sign'); target(game); game.useLearnedAbility(0);
  const saved = clone(game.capture()); saved.masteryRuntime = { marks: [{ charges: 99999, bonus: 999999 }] };
  const restored = arena('ranger'); restored.applySave(saved); restored.start();
  assert.equal(getMasteryState(restored).marks.length, 0);
  assert.equal(restored.cooldowns['ability:ranger_quarry_sign'], game.cooldowns['ability:ranger_quarry_sign']);
  game.world = { ...game.world }; assert.equal(getMasteryState(game).marks.length, 0);
  clearMasteryAbilities(game); assert.equal(getMasteryState(game).ward, null);
});

test('PvP preflight spends nothing and cannot carry a mark, ward or channel into the arena', () => {
  const game = arena('ranger'), ability = prepare(game, 'ranger_stillstring'); target(game);
  game.useLearnedAbility(0); game.worldMode = 'pvp'; advance(game, .02);
  assert.equal(getMasteryState(game).channel, null);
  game.cooldowns[`ability:${ability.id}`] = 0; const mana = game.player.mana;
  assert.equal(game.useLearnedAbility(0), false); assert.equal(game.player.mana, mana);
  assert.equal(preflightMasteryAbility(game, ability).ok, false);
});

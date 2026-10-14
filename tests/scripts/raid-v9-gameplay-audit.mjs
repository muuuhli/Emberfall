/** Reproducible combat audit, not a browser playtest or a 200-hour certification.
 * Use: node tests/scripts/raid-v9-gameplay-audit.mjs --source /absolute/checkout
 *      --mode reactive --raid sturmzitadelle --out /private/tmp/raid-audit.json
 * Fixture setup supplies legal level, seven rare items and 2*level points.
 * Entrance travel/trash are isolated; the actual puzzle mechanisms open the gate.
 * After pull, movement uses Game.keys/update and casts use native Game methods.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, arg, i, all) => {
  if (arg.startsWith('--')) pairs.push([arg.slice(2), all[i + 1]?.startsWith('--') ? true : all[i + 1] ?? true]);
  return pairs;
}, []));
const root = path.resolve(args.source || path.join(path.dirname(fileURLToPath(import.meta.url)), '../..'));
const load = name => import(pathToFileURL(path.join(root, 'src', name)).href);
const [{ Game }, { DUNGEONS, interactPuzzle }, { CLASSES }, { ABILITIES }, { generateLoot, ITEM_BASES }, { EQUIPMENT_SLOT_IDS, equipmentSlot }, { hitShape }, { cumulativeXp, applyExperience }, { enemyXpReward }] = await Promise.all([
  load('game.js'), load('dungeons.js'), load('classes.js'), load('abilities.js'), load('loot.js'), load('equipment-system.js'), load('encounter-geometry.js'), load('progression.js'), load('balance.js'),
]);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = x => Math.round(x * 100) / 100;
const randomFor = initial => { let seed = initial; return () => { seed = (seed | 0) + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const caster = id => ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'].includes(id);
const choices = {
  guardian: ['guardian_black_standard', 'guardian_last_watch'], paladin: ['paladin_mend', 'paladin_absolution'],
  ranger: ['ranger_barbed', 'ranger_arrowstorm'], nightblade: ['nightblade_poison', 'nightblade_dusk_execution'],
  flamecaller: ['flamecaller_cinder', 'flamecaller_phoenix'], frostweaver: ['frostweaver_shards', 'frostweaver_frozen_bastion'],
  druid: ['druid_spring_rain', 'druid_moonwell'], shadowbinder: ['shadowbinder_death_mark', 'shadowbinder_abyss_eye'],
};

function selectBase(slot, classId, level) {
  const category = slot === 'ring' || slot === 'charm' ? caster(classId) || classId === 'paladin' ? 'arcane' : 'martial'
    : ['guardian', 'paladin'].includes(classId) ? 'heavy' : caster(classId) ? 'ritual' : 'light';
  let eligible = ITEM_BASES.filter(base => equipmentSlot(base) === slot && base.minLevel <= level && (!base.classIds || base.classIds.includes(classId)));
  if (slot === 'weapon') {
    const authored = eligible.filter(base => base.family === classId);
    if (authored.length) eligible = authored;
  } else {
    const authored = eligible.filter(base => base.category === category);
    if (authored.length) eligible = authored;
  }
  return eligible.sort((a, b) => b.minLevel - a.minLevel || a.id.localeCompare(b.id))[0];
}
function fixtureCharacter(classId, level, index, supplies) {
  const game = new Game({ storage: null, random: randomFor(481 + index * 71) });
  assert.equal(game.selectClass(classId), true);
  game.gainXp(cumulativeXp(level));
  assert.equal(game.player.level, level); assert.equal(game.player.skillPoints, level * 2);
  Object.assign(game.player, { id: `audit-human-${index}`, name: `Prüfer ${index + 1}` });
  const learned = new Set();
  const learn = id => {
    if (learned.has(id)) return;
    const ability = ABILITIES.find(a => a.id === id); if (!ability || ability.level > level) return;
    if (ability.requires) learn(ability.requires);
    assert.equal(game.learnAbility(id), true, `Legal ability ${id}`); learned.add(id);
  };
  choices[classId].forEach(learn);
  const talents = CLASSES.find(c => c.id === classId).talents;
  // Small investment in prerequisites, then prioritize role-appropriate combat
  // attributes. Points are spent only through the real eligibility API.
  const priority = classId === 'guardian' ? ['armor', 'maxHp', 'cooldown', 'manaRegen', 'damage', 'crit', 'lifeSteal', 'mana']
    : caster(classId) || classId === 'paladin' ? ['spellDamage', 'manaRegen', 'cooldown', 'crit', 'maxHp', 'armor', 'mana', 'damage', 'lifeSteal']
      : ['damage', 'crit', 'cooldown', 'lifeSteal', 'maxHp', 'armor', 'manaRegen', 'mana'];
  const sorted = [...talents].sort((a, b) => {
    const pa = priority.indexOf(a.effect?.stat), pb = priority.indexOf(b.effect?.stat);
    return (pa < 0 ? 100 : pa) - (pb < 0 ? 100 : pb) || a.minLevel - b.minLevel;
  });
  for (let pass = 0; pass < 200; pass++) {
    let spent = false;
    for (const talent of sorted) if (game.learn(talent.id)) { spent = true; break; }
    if (!spent) break;
  }
  for (const slot of EQUIPMENT_SLOT_IDS) {
    const base = selectBase(slot, classId, level);
    const item = generateLoot({ level, tier: 1, classId, rarity: 'rare', baseId: base.id, uid: `audit-${index}-${slot}`, rng: game.random });
    assert.equal(game.addItem(item), true); assert.equal(game.equip(item.id), true, `Legal ${slot}`);
  }
  game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
  choices[classId].forEach((id, slot) => { if (game.learnedAbilities[id]) assert.equal(game.setAbilityLoadout(slot, id), true); });
  if (supplies > 0) { game.inventory.martyr_lifeblood = supplies; game.inventory.night_oracle_tears = supplies; }
  const stats = game.stats(); game.player.hp = stats.maxHp; game.player.mana = stats.mana;
  const talentSpend = Object.entries(game.skills).reduce((sum, [id, rank]) => sum + rank * talents.find(t => t.id === id).cost, 0);
  const abilitySpend = learned.size ? [...learned].reduce((sum, id) => sum + ABILITIES.find(a => a.id === id).talentCost, 0) : 0;
  assert.equal(talentSpend + abilitySpend + game.player.skillPoints, level * 2, 'Exact natural point budget');
  game.start();
  return game;
}
function composition(size, type) {
  if (type === 'rangers') return Array(size).fill('ranger');
  if (size === 8) return CLASSES.map(c => c.id);
  return size === 3 ? ['guardian', 'paladin', 'ranger'] : ['guardian', 'druid', 'ranger', 'flamecaller'];
}
function aimAndMove(game, boss, goal, dash = false) {
  game.player.face = Math.atan2(boss.y - game.player.y, boss.x - game.player.x);
  // Multiplayer input transmits angle and uses a 100-unit aim point. Match it
  // rather than giving placed spells the offline pointer's exact target point.
  game.aim = { x: game.player.x + Math.cos(game.player.face) * 100, y: game.player.y + Math.sin(game.player.face) * 100 };
  game.keys.clear();
  const dx = goal.x - game.player.x, dy = goal.y - game.player.y;
  if (Math.abs(dx) > 7) game.keys.add(dx > 0 ? 'd' : 'a');
  if (Math.abs(dy) > 7) game.keys.add(dy > 0 ? 's' : 'w');
  if (dash && (game.keys.size || game.player.invulnerable <= 0)) game.action('dash');
}
function warnsHit(boss, point, hitShape) {
  const shapes = [...(boss.telegraphShapes || []), ...(boss.activeShapes || [])].filter(s => !s.safe);
  if (shapes.length) return shapes.some(shape => hitShape(shape, point));
  if (boss.phase !== 'windup') return false;
  if (boss.telegraphMechanic === 'spread') return (boss.spreadTargets || []).some(p => distance(p, point) < 96);
  if (boss.telegraphMechanic === 'stack') return false;
  return distance({ x: boss.telegraphX ?? boss.x, y: boss.telegraphY ?? boss.y }, point) < (boss.telegraphRadius || 145) + 20;
}
function safeGoal(game, boss, preferred, peers, index) {
  if (!warnsHit(boss, game.player, hitShape) && !warnsHit(boss, preferred, hitShape)) return preferred;
  const candidates = [];
  for (const radius of [110, 180, 270, 360]) for (let k = 0; k < 16; k++) {
    const angle = k * Math.PI / 8;
    const point = { x: game.player.x + Math.cos(angle) * radius, y: game.player.y + Math.sin(angle) * radius };
    if (point.x < 1140 || point.x > 1730 || point.y < 80 || point.y > 1430 || game.collides(point.x, point.y, 13) || warnsHit(boss, point, hitShape)) continue;
    const overlap = peers.reduce((sum, peer, j) => sum + (j !== index && distance(peer.player, point) < 80 ? 120 : 0), 0);
    candidates.push({ ...point, score: distance(game.player, point) + distance(preferred, point) * .2 + overlap });
  }
  return candidates.sort((a, b) => a.score - b.score)[0] || preferred;
}
function recordDamage(game, metrics) {
  const original = game.damagePlayer.bind(game);
  game.damagePlayer = (amount, options) => {
    const beforeShield = game.player.shield || 0, wasDead = game.dead;
    const applied = original(amount, options) || 0;
    metrics.hpDamage += applied; metrics.shieldDamage += Math.max(0, beforeShield - (game.player.shield || 0));
    if (applied > 0) metrics.hits++;
    if (!wasDead && game.dead) metrics.deaths++;
    return applied;
  };
  const originalHeal = game._healAbilityAlly.bind(game);
  game._healAbilityAlly = (ally, amount) => { const before = ally.player.hp, result = originalHeal(ally, amount); metrics.healing += Math.max(0, ally.player.hp - before); return result; };
  const originalHit = game.hitEnemy.bind(game);
  game.hitEnemy = (enemy, amount, knockback) => { const before = enemy.alive, applied = originalHit(enemy, amount, knockback); metrics.damage += applied; if (before && !enemy.alive && enemy.bossObjectiveId) metrics.objectiveKills++; return applied; };
}

export async function runRaidAudit({ id, mode = 'reactive', team = 'balanced', seconds = 850, supplies = 20, verifyRespawn = false } = {}) {
  const definition = DUNGEONS.find(d => d.id === id); assert.ok(definition?.raid);
  assert.ok(Number.isInteger(supplies) && supplies >= 0 && supplies <= 20);
  const classes = composition(definition.partyRequired, team), games = classes.map((c, i) => fixtureCharacter(c, definition.level, i, supplies));
  games.forEach(g => { g.partyGames = games; Object.assign(g.player, definition.entrance); });
  assert.equal(games[0].enterDungeon(id, 1), true);
  const authority = games[0], instance = authority.dungeonInstance, boss = authority.world.enemies.find(e => e.id === `${id}:boss`), startingBossHp = boss.maxHp;
  // Boss audit only: trash is removed before the pull. Puzzle interaction and
  // occupancy still use the real dungeon implementation, not solved flags.
  authority.world.enemies = [boss]; games.forEach(g => { g.world = authority.world; });
  for (const puzzle of instance.puzzles) {
    if (puzzle.type === 'light') for (const object of authority.world.puzzleObjects.filter(o => o.puzzle === puzzle.id && o.kind === 'lens')) {
      Object.assign(authority.player, { x: object.x - 35, y: object.y });
      while (object.rotation !== object.targetRotation) assert.equal(interactPuzzle(instance, object.id, games.map(g => g.player), authority.time).success, true);
    }
    if (puzzle.type === 'pressure') {
      const plates = authority.world.puzzleObjects.filter(o => o.puzzle === puzzle.id && o.kind === 'plate');
      games.forEach((g, i) => Object.assign(g.player, { x: plates[i].x, y: plates[i].y }));
      for (let step = 0; step < 51; step++) { games.forEach(g => g.update(.04, { simulateWorld: false })); authority.updateWorld(.04, games); }
    }
    assert.equal(puzzle.solved, true, 'Puzzle completion uses actual interaction/occupancy');
  }
  assert.equal(instance.gateOpened, true);
  const plates = authority.world.puzzleObjects.filter(o => o.kind === 'boss_plate');
  games.forEach((g, i) => { const point = i < plates.length ? plates[i] : { x: 1400, y: 760 + (i - plates.length) * 45 }; Object.assign(g.player, { x: point.x, y: point.y }); });
  const metrics = games.map(() => ({ damage: 0, hpDamage: 0, shieldDamage: 0, healing: 0, hits: 0, deaths: 0, potions: 0, largePotions: 0, manaPotions: 0, casts: 0, dodges: 0, revives: 0, objectiveKills: 0 }));
  games.forEach((g, i) => recordDamage(g, metrics[i]));
  let simulationClock = authority.time;
  const phaseSeen = new Set(), casts = new Map(), mechanicResolutions = new Map();
  let windows = 0, previousShield = boss.shielded, previousPhase = boss.phase, ticks = 0, lastHp = startingBossHp, longestNoDamage = 0, noDamage = 0, minBossHp = startingBossHp, enrageSeen = false, maxRaidRevivesUsed = 0;
  let stackMembers = new Set(), stackStartedAt = -1;
  const objectiveIds = new Set(), uniqueResolved = new Map(), stackSamples = [], seenUniqueWarnings = new Set(), warningTimeline = [];
  const selfReturnChecks = new Map(); let blockedSelfReturns = 0;
  while (ticks * .04 < seconds && boss.alive && games.some(g => !g.dead)) {
    // Match MultiplayerHub: absolute world time advances for downed characters
    // too. Personal update still decides whether movement/cooldowns advance.
    games.forEach(game => { game.time = simulationClock; });
    const now = authority.time, hasStack = boss.phase === 'windup' && (boss.telegraphMechanic === 'stack' || boss.raidAction?.kind === 'stack' || boss.raidAction?.mechanic === 'stack');
    const supportWarning = boss.phase === 'windup' && instance.raidEncounter?.pending?.mechanicId === 'raid_pressure';
    const stackPoint = { x: boss.telegraphX ?? boss.x, y: boss.telegraphY ?? boss.y };
    if (!hasStack) stackStartedAt = -1;
    if (hasStack && stackStartedAt < 0) {
      stackStartedAt = now; stackMembers = new Set();
      // A plate worker already in the target circle stays on that plate.
      // Free damage/heal members fulfill the rest before moving another worker.
      const candidates = games.map((g, i) => ({ g, i, nearby: distance(g.player, stackPoint) < 90, free: i >= plates.length }))
        .filter(entry => !entry.g.dead).sort((a, b) => Number(b.nearby) - Number(a.nearby) || Number(b.free) - Number(a.free) || distance(a.g.player, stackPoint) - distance(b.g.player, stackPoint));
      candidates.slice(0, boss.stackRequired || 2).forEach(entry => stackMembers.add(entry.i));
    }
    const objectives = authority.world.enemies.filter(e => e.bossObjectiveId && e.alive);
    if (verifyRespawn && instance.bossEngaged && boss.alive) for (let i = 0; i < games.length; i++) {
      const game = games[i]; if (!game.dead || (selfReturnChecks.get(i) || 0) === metrics[i].deaths) continue;
      selfReturnChecks.set(i, metrics[i].deaths);
      assert.equal(game.respawn(), false, 'Self-return cannot bypass the combat revive pool during a live boss attempt');
      assert.equal(game.dead, true); assert.equal(game.player.hp, 0); blockedSelfReturns++;
    }
    const fallen = games.filter(g => g.dead);
    const rescue = fallen.length ? games.map((g, i) => ({ g, i, fallen: fallen.reduce((a, b) => distance(a.player, g.player) < distance(b.player, g.player) ? a : b) })).filter(entry => !entry.g.dead)
      .sort((a, b) => distance(a.g.player, a.fallen.player) - distance(b.g.player, b.fallen.player))[0] : null;
    for (const objective of authority.world.enemies.filter(e => e.bossObjectiveId)) objectiveIds.add(objective.id);
    for (let i = 0; i < games.length; i++) {
      const game = games[i], p = game.player; if (game.dead) continue;
      const melee = CLASSES.find(c => c.id === p.classId).abilities.attack.kind === 'melee';
      const angle = Math.PI * 2 * i / games.length;
      const target = objectives.length ? objectives[Math.floor(i * objectives.length / games.length) % objectives.length] : boss;
      let goal = boss.shielded && i < plates.length ? plates[i] : { x: target.x + Math.cos(angle) * (melee ? 65 : 170), y: target.y + Math.sin(angle) * (melee ? 65 : 170) };
      if (mode === 'stationary') goal = i < plates.length ? plates[i] : { x: 1400, y: 760 + (i - plates.length) * 45 };
      else if (hasStack && stackMembers.has(i)) {
        goal = i < plates.length && distance(plates[i], stackPoint) < 90 ? plates[i] : { x: stackPoint.x + Math.cos(angle) * 30, y: stackPoint.y + Math.sin(angle) * 30 };
      }
      else if (!supportWarning && (boss.phase === 'windup' || boss.activeShapes?.length)) goal = safeGoal(game, boss, goal, games, i);
      if (mode === 'reactive' && rescue?.i === i && !hasStack) goal = safeGoal(game, boss, rescue.fallen.player, games, i);
      const beforeDash = game.cooldowns.dash || 0;
      const stackDash = hasStack && stackMembers.has(i) && distance(p, stackPoint) > 80 + game.stats().speed * Math.max(0, boss.attackTimer - .1);
      aimAndMove(game, target, goal, mode === 'reactive' && (stackDash || boss.phase === 'windup' && !hasStack && !supportWarning && warnsHit(boss, p, hitShape) && boss.attackTimer < .35));
      if ((game.cooldowns.dash || 0) > beforeDash) metrics[i].dodges++;
      if (ticks % 4 === 0) {
        const healthRatio = p.hp / game.stats().maxHp;
        const beforeLargePotions = game.inventory.martyr_lifeblood || 0;
        if (healthRatio < .55 && game.action('potion')) { metrics[i].potions++; metrics[i].largePotions += Math.max(0, beforeLargePotions - (game.inventory.martyr_lifeblood || 0)); }
        if (p.mana < game.stats().mana * .2 && game.consume('night_oracle_tears')) metrics[i].manaPotions++;
        const fallenAlly = games.find(other => other.dead && distance(p, other.player) < 70);
        if (mode === 'reactive' && fallenAlly) { const before = games.filter(other => other.dead); game.action('interact'); metrics[i].revives += before.filter(other => !other.dead).length; }
        const wounded = games.filter(other => !other.dead && other.player.hp < other.stats().maxHp * .8 && distance(p, other.player) < 175);
        const longHealTargets = ['paladin', 'druid'].includes(p.classId) && games.some(other => !other.dead && other.player.hp < other.stats().maxHp * .9 && distance(p, other.player) < 450);
        if (!boss.shielded || objectives.length || p.classId === 'guardian' || wounded.length || longHealTargets || supportWarning) {
          game.action('attack');
          if (p.classId === 'guardian' || p.classId === 'paladin' && wounded.length || p.classId === 'druid' && wounded.length || !['paladin', 'druid'].includes(p.classId)) if (game.action('bolt')) metrics[i].casts++;
          if (p.classId === 'guardian' || p.classId === 'paladin' && (wounded.length || distance(p, target) < 150) || p.classId === 'druid' && wounded.length || ['shadowbinder'].includes(p.classId) || distance(p, target) < 170) if (game.action('nova')) metrics[i].casts++;
          for (let slot = 0; slot < 2; slot++) {
            const a = ABILITIES.find(a => a.id === game.abilityLoadout[slot]); if (!a) continue;
            const recipients = games.filter(other => !other.dead && other.player.hp < other.stats().maxHp * .9 && distance(p, other.player) < (a.radius || 175));
            if (a.kind === 'mend' && !recipients.length) continue;
            if (['regeneration', 'sanctum', 'partyShield'].includes(a.kind) && !recipients.length && boss.phase !== 'windup') continue;
            if (game.useLearnedAbility(slot)) metrics[i].casts++;
          }
        }
      }
    }
    const pendingBeforeUpdate = instance.raidEncounter?.pending ? { ...instance.raidEncounter.pending } : null;
    maxRaidRevivesUsed = Math.max(maxRaidRevivesUsed, instance.raidRevivesUsed || 0);
    if (hasStack && boss.attackTimer <= .04) { stackSamples.push({ at: round(ticks * .04), center: stackPoint, selected: [...stackMembers], players: games.map(g => ({ x: round(g.player.x), y: round(g.player.y), distance: round(distance(g.player, stackPoint)) })) }); if (stackSamples.length > 10) stackSamples.shift(); }
    minBossHp = Math.min(minBossHp, boss.hp); enrageSeen ||= !!boss.enraged;
    games.forEach(g => g.update(.04, { simulateWorld: false }));
    simulationClock += .04; games.forEach(game => { game.time = simulationClock; });
    const liveAuthority = games.find(g => !g.dead) || authority;
    liveAuthority.updateWorld(.04, games);
    for (const g of games) for (const field of ['effects', 'projectiles', 'drops', 'hazards', 'summons']) g[field] = liveAuthority[field];
    if (previousShield && !boss.shielded) windows++;
    previousShield = boss.shielded;
    if (previousPhase !== 'windup' && boss.phase === 'windup' && boss.telegraphMechanic !== 'raid') { const kind = boss.raidAction?.id || boss.raidAction?.kind || boss.encounterAction?.id || boss.telegraphMechanic || 'circle'; casts.set(kind, (casts.get(kind) || 0) + 1); }
    if (instance.raidEncounter?.pending && !seenUniqueWarnings.has(instance.raidEncounter.pending.id)) {
      const pending = instance.raidEncounter.pending; seenUniqueWarnings.add(pending.id);
      casts.set(pending.mechanicId, (casts.get(pending.mechanicId) || 0) + 1);
      warningTimeline.push({ at: round(ticks * .04), id: pending.mechanicId, phase: pending.phase + 1, shapes: pending.zones.length });
    }
    if (previousPhase === 'windup' && boss.phase === 'recover' && !pendingBeforeUpdate) { const kind = boss.raidAction?.id || boss.raidAction?.kind || boss.encounterAction?.id || boss.telegraphMechanic || 'circle'; mechanicResolutions.set(kind, (mechanicResolutions.get(kind) || 0) + 1); }
    if (pendingBeforeUpdate && instance.raidEncounter?.pending?.id !== pendingBeforeUpdate.id && boss.phase === 'recover') uniqueResolved.set(pendingBeforeUpdate.mechanicId, (uniqueResolved.get(pendingBeforeUpdate.mechanicId) || 0) + 1);
    previousPhase = boss.phase;
    phaseSeen.add(instance.raidEncounter ? instance.raidEncounter.phase + 1 : boss.raidPhase || boss.encounterPhase || (boss.hp <= boss.maxHp * .3 ? 3 : boss.hp <= boss.maxHp * .65 ? 2 : 1));
    noDamage = boss.hp === lastHp ? noDamage + .04 : 0; longestNoDamage = Math.max(longestNoDamage, noDamage); lastHp = boss.hp;
    ticks++;
    // Real minimum-human-count shield never opens after one death. Give a
    // controller 30 seconds to rescue before abandoning that attempt.
    if (games.some(g => g.dead) && noDamage > 30) break;
  }
  assert.equal(boss.maxHp, startingBossHp, 'No fixture health inflation or weakening');
  if (!boss.alive) { games.forEach(g => { g.time = simulationClock; g.update(.04, { simulateWorld: false }); }); simulationClock += .04; games.forEach(g => { g.time = simulationClock; }); authority.updateWorld(.04, games); }
  return { source: root, raid: id, team, mode, level: definition.level, players: games.length, suppliedVials: supplies, inputAim: 'server-angle-with-100-unit-aim-point',
    fixtureScope: 'isolated boss arena; real puzzle mechanisms, fixed legal gear/point budget; no during-fight teleport, manual HP/mana edit or cooldown reset',
    seconds: round(ticks * .04), bossHp: round(boss.hp), bossMaxHp: boss.maxHp, bossDamage: boss.damage,
    bossXp: boss.xp, completionXp: instance.rewards.completionXp,
    hpRemovedPct: round((1 - boss.hp / boss.maxHp) * 100), maximumHpRemovedPct: !boss.alive ? 100 : round((1 - minBossHp / boss.maxHp) * 100), success: !boss.alive, completed: instance.bossDefeated, living: games.filter(g => !g.dead).length,
    enrage: !!boss.enraged, enrageSeen, phases: [...phaseSeen], shieldWindows: windows, longestNoDamage: round(longestNoDamage),
    outcome: !boss.alive ? 'victory' : !games.some(g => !g.dead) ? 'full-party-defeat' : noDamage > 30 ? 'controller-abandonment-after-30s-without-damage' : 'simulation-time-limit',
    warningCasts: Object.fromEntries(casts), mechanicsResolved: Object.fromEntries(mechanicResolutions), uniqueImpacts: Object.fromEntries(uniqueResolved), warningTimeline, stackSamples,
    objectivesSeen: objectiveIds.size, objectivesKilled: metrics.reduce((sum, m) => sum + m.objectiveKills, 0),
    maxRaidRevivesUsed, raidRevivesUsedAtEnd: instance.raidRevivesUsed || 0, raidWipes: instance.raidWipes || 0, blockedSelfReturns,
    heroes: games.map((g, i) => ({ classId: g.player.classId, ...Object.fromEntries(Object.entries(metrics[i]).map(([k, v]) => [k, round(v)])),
      hp: round(g.player.hp), maxHp: round(g.stats().maxHp), mana: round(g.player.mana), maxMana: round(g.stats().mana),
      remainingPoints: g.player.skillPoints, spentPoints: definition.level * 2 - g.player.skillPoints,
      xpGranted: cumulativeXp(g.player.level) + g.player.xp - cumulativeXp(definition.level), levelAfter: g.player.level,
      stats: g.stats(), talents: { ...g.skills }, loadout: [...g.abilityLoadout],
      equipment: Object.entries(g.equipment).map(([slot, id]) => { const item = g.item(id); return { slot, baseId: item.baseId, rarity: item.rarity, level: item.level, setId: item.setId, stats: g.itemStats(id), affixes: item.affixes.map(a => a.id) }; }),
      remainingHealthSupplies: g.inventory.martyr_lifeblood || 0, remainingManaSupplies: g.inventory.night_oracle_tears || 0,
    })) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const ids = args.raid ? [args.raid] : DUNGEONS.filter(d => d.raid).map(d => d.id), reports = [];
  for (const id of ids) {
    const report = await runRaidAudit({ id, mode: args.mode || 'reactive', team: args.team || 'balanced', seconds: Number(args.seconds || 850), supplies: Number(args.supplies ?? 20), verifyRespawn: args['verify-respawn'] === true });
    reports.push(report);
    console.log(JSON.stringify({ raid: report.raid, mode: report.mode, team: report.team, success: report.success, seconds: report.seconds, hpRemovedPct: report.hpRemovedPct, living: report.living, phases: report.phases, shieldWindows: report.shieldWindows, warnings: report.warningCasts, uniqueImpacts: report.uniqueImpacts, objectivesSeen: report.objectivesSeen, objectivesKilled: report.objectivesKilled, mechanicsResolved: report.mechanicsResolved, damage: report.heroes.map(h => h.damage), hpDamage: report.heroes.map(h => h.hpDamage) }));
  }
  if (args.pacing) for (const report of reports.filter(r => r.success && r.level < 100)) {
    let state = { level: report.level, xp: 0 }, runs = 0;
    while (state.level < 100 && runs < 1000) {
      const reward = enemyXpReward(report.bossXp, { enemyLevel: report.level, playerLevel: state.level, boss: true }) + report.completionXp;
      state = applyExperience(state, reward); runs++;
    }
    report.repeatPacingIllustration = { kind: 'illustrative-repeat-route-not-playtime-proof', startLevel: report.level, endLevel: state.level, runs,
      modeledHoursWith300SecondsOverhead: round((report.seconds + 300) * runs / 3600), modeledHoursWith600SecondsOverhead: round((report.seconds + 600) * runs / 3600),
      assumptions: 'Each repeated fight takes the one measured equal-level fight duration; current gray boss kill EP plus completion EP. Travel/puzzles/group overhead of 300/600s is assumed. No guards, quest EP, scheduling, gear growth or human sessions measured.' };
    console.log(JSON.stringify({ raid: report.raid, team: report.team, ...report.repeatPacingIllustration }));
  }
  if (args.out) await fs.writeFile(args.out, JSON.stringify(reports, null, 2) + '\n');
}

// Native combat probes, not difficulty claims about human players.
// node tests/scripts/trial-gameplay-audit.mjs [output.json]
import fs from 'node:fs/promises';
import { Game } from '../../src/game.js';
import { TRIALS } from '../../src/trial-content.js';
import { ENEMY_TYPES, SKILLS, ITEMS } from '../../src/catalog.js';
import { ITEM_BASES, generateLoot } from '../../src/loot.js';
import { EQUIPMENT_SLOTS, equipmentSlot } from '../../src/equipment-system.js';
import { hitShape } from '../../src/encounter-geometry.js';

const DT = .04, LIMIT = 500, output = process.argv[2] || '/tmp/emberfall-trial-gameplay.json';
const rng = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const round = value => Number(value.toFixed(2));

// Same legal Rare-base and passive progression fixture as the existing named
// boss audit. Early missing slots are declared, never filled with illegal gear.
function loadout(game, level) {
  const classId = 'ranger', gear = [], unavailableSlots = [];
  for (const slot of EQUIPMENT_SLOTS) {
    const base = ITEM_BASES.filter(item => equipmentSlot(item) === slot.id && item.minLevel <= level && (!item.classIds || item.classIds.includes(classId)))
      .sort((a, b) => b.minLevel - a.minLevel || (b.stats.damage || 0) - (a.stats.damage || 0) || (b.stats.maxHp || 0) - (a.stats.maxHp || 0) || a.id.localeCompare(b.id))[0];
    if (!base) { unavailableSlots.push(slot.id); continue; }
    const item = generateLoot({ level, baseId: base.id, classId, rarity: 'rare', rng: rng(8177 + level), uid: `trial-${level}-${slot.id}`, source: 'audit_fixture' });
    if (!game.addItem(item) || !game.equip(item.id)) throw new Error(`Invalid legal equipment ${base.id}`);
    gear.push({ slot: slot.id, baseId: base.id, minLevel: base.minLevel, level: item.level, rarity: item.rarity });
  }
  const pointBudget = 2 + (level - 1) * 2;
  game.player.skillPoints = pointBudget;
  for (let pass = 0; pass < 4; pass++) for (const talent of SKILLS.filter(talent => talent.classId === classId && (talent.minLevel || 1) <= level)) {
    if ((game.skills[talent.id] || 0) < Math.min(3, talent.maxRank || 3)) game.learn(talent.id);
  }
  // Remove the five starter heal potions as well: this probe gets five healing
  // items in total, rather than silently retaining a second reserve stack.
  for (const id of Object.keys(game.inventory)) if (game.item(id)?.type === 'consumable') delete game.inventory[id];
  const healing = Object.values(ITEMS).filter(item => item.type === 'consumable' && (item.minLevel || 1) <= level && item.family === 'health')
    .sort((a, b) => b.stats.hpRestore - a.stats.hpRestore)[0];
  if (!healing) throw new Error(`Missing legal healing supply at level ${level}`);
  game.addItem(healing.id, 5);
  game.player.hp = game.stats().maxHp; game.player.mana = game.stats().mana;
  return { gear, unavailableSlots, talents: { ...game.skills }, pointBudget, unspentPoints: game.player.skillPoints,
    healing: healing.id, initialHealingCount: 5, stats: game.stats() };
}

function keys(game, dx, dy) {
  game.keys.clear(); if (dx > 5) game.keys.add('d'); else if (dx < -5) game.keys.add('a');
  if (dy > 5) game.keys.add('s'); else if (dy < -5) game.keys.add('w');
}
function act(game, name, actions) { if (game.action(name)) actions[name] = (actions[name] || 0) + 1; }
function walk(game, goal) {
  const player = game.player, dx = goal.x - player.x, dy = goal.y - player.y, length = Math.hypot(dx, dy);
  if (length < 8) { game.keys.clear(); return; }
  const angle = Math.atan2(dy, dx);
  for (const turn of [0, .4, -.4, .8, -.8, 1.2, -1.2]) {
    const ax = Math.cos(angle + turn), ay = Math.sin(angle + turn);
    if (!game.collides(player.x + ax * 24, player.y + ay * 24, 12)) { keys(game, ax * 100, ay * 100); return; }
  }
  game.keys.clear();
}

// Generic windups are read as shown by the native telegraphs. Curated boss
// shapes are used directly; attacks never read a future random choice.
function dangers(foes) {
  const shapes = [];
  for (const enemy of foes) {
    if (ENEMY_TYPES[enemy.type]?.encounterProfile) {
      shapes.push(...(enemy.phase === 'windup' ? enemy.telegraphShapes || [] : []), ...(enemy.activeShapes || [])); continue;
    }
    if (enemy.phase !== 'windup') continue;
    const pattern = enemy.telegraphPattern, angle = enemy.telegraphAngle ?? enemy.attackAngle ?? enemy.face ?? 0;
    const x = enemy.telegraphX ?? enemy.x, y = enemy.telegraphY ?? enemy.y;
    if (['melee', 'brute', 'cleave', 'hex'].includes(pattern)) shapes.push({ kind: 'circle', x, y, radius: (enemy.telegraphRadius || 65) + 20 });
    else if (pattern === 'charge') shapes.push({ kind: 'segment', x1: enemy.x, y1: enemy.y,
      x2: enemy.x + Math.cos(angle) * (enemy.telegraphChargeDistance || 180), y2: enemy.y + Math.sin(angle) * (enemy.telegraphChargeDistance || 180), width: 48 });
    else {
      const count = enemy.telegraphProjectileCount || 1, length = enemy.telegraphProjectileRange || enemy.telegraphRange || 450;
      for (let index = 0; index < count; index++) {
        const offset = pattern === 'ring' ? index * Math.PI * 2 / count : count === 1 ? 0 : (index / (count - 1) - .5) * (enemy.telegraphProjectileSpread || .7);
        shapes.push({ kind: 'segment', x1: enemy.x, y1: enemy.y, x2: enemy.x + Math.cos(angle + offset) * length,
          y2: enemy.y + Math.sin(angle + offset) * length, width: 32 });
      }
    }
  }
  return shapes.filter(shape => !shape.safe);
}

function controller(game, event, style, actions, memory) {
  const player = game.player, stats = game.stats();
  const foes = game.world.enemies.filter(enemy => enemy.alive && enemy.eventId === event.id).sort((a, b) => distance(a, player) - distance(b, player));
  if (!foes.length) {
    game.aim = null;
    if (event.phase === 'intermission') {
      const choice = game.world.eventObjects.find(object => object.eventId === event.id && !object.hidden && object.role === 'choice' && object.choice === (style === 'reactive' ? 'rest' : 'push'));
      if (!choice) throw new Error(`Missing actual intermission choice ${event.id}`);
      walk(game, choice);
      if (distance(player, choice) < 80) {
        game.keys.clear();
        if (!game.interactWorldEvent(choice.id)) throw new Error(`Rejected nearby intermission ${choice.id}`);
        memory.decisions.push({ choice: choice.choice, cleared: event.waveIndex, time: round(game.time), distance: round(distance(player, choice)) });
      }
    } else walk(game, event);
    return;
  }
  const target = foes[0], range = distance(player, target), preferred = 210;
  game.aim = { x: target.x, y: target.y }; player.face = Math.atan2(target.y - player.y, target.x - player.x);
  let dx = target.x - player.x, dy = target.y - player.y;
  if (range < 180) { dx = -dx; dy = -dy; } else if (range <= preferred) dx = dy = 0;
  const shapes = dangers(foes), shots = game.projectiles.filter(projectile => projectile.owner === 'enemy' && foes.some(enemy => enemy.id === projectile.attackerId));
  if (style === 'reactive') {
    if (shapes.some(shape => hitShape(shape, player))) {
      const candidates = [];
      for (const length of [65, 120, 175, 230]) for (let index = 0; index < 16; index++) {
        const angle = index * Math.PI / 8, point = { x: player.x + Math.cos(angle) * length, y: player.y + Math.sin(angle) * length };
        const blocked = [1 / 3, 2 / 3, 1].some(t => game.collides(player.x + (point.x - player.x) * t, player.y + (point.y - player.y) * t, 12));
        const score = shapes.filter(shape => hitShape(shape, point)).length * 10000 + (blocked ? 12000 : 0)
          + (game.inSettlement(point.x, point.y) ? 12000 : 0) + Math.max(0, distance(point, event) - 445) * 60
          + Math.max(0, distance(point, target) - 550) * 20 + length + Math.abs(distance(point, target) - preferred) * .15;
        candidates.push({ ...point, score });
      }
      candidates.sort((a, b) => a.score - b.score); memory.safetyGoal = candidates[0];
      dx = memory.safetyGoal.x - player.x; dy = memory.safetyGoal.y - player.y;
      keys(game, dx, dy);
      if (foes.some(enemy => enemy.phase === 'windup' && enemy.attackTimer < .4 || enemy.activeShapes?.length)) act(game, 'dash', actions);
    } else if (memory.safetyGoal && (shots.length || foes.some(enemy => enemy.activeShapes?.length))) {
      dx = memory.safetyGoal.x - player.x; dy = memory.safetyGoal.y - player.y; if (Math.hypot(dx, dy) < 20) dx = dy = 0;
    } else {
      memory.safetyGoal = null;
      const incoming = shots.find(projectile => distance(projectile, player) < 95);
      if (incoming) { dx = -Math.sin(incoming.angle) * 100; dy = Math.cos(incoming.angle) * 100; keys(game, dx, dy); act(game, 'dash', actions); }
    }
  }
  // The trial must remain attended. A physical route back prevents endless
  // off-arena kiting; steering respects the retained trees, rocks and walls.
  if (distance(player, event) > 450) { dx = event.x - player.x; dy = event.y - player.y; }
  if (dx || dy) walk(game, { x: player.x + dx, y: player.y + dy }); else game.keys.clear();
  if (range < 560) act(game, 'attack', actions);
  if (range < 300) act(game, 'bolt', actions);
  if (range < 155) act(game, 'nova', actions);
  if (style === 'reactive' && player.hp < stats.maxHp * .4) act(game, 'potion', actions);
}

function probe(trial, style) {
  const game = new Game({ storage: null, random: rng(8719 + trial.level) });
  game.selectClass('ranger'); game.start(); game.player.level = trial.level;
  const equipment = loadout(game, trial.level), event = game.world.worldEvents.find(event => event.id === trial.id);
  if (!event) throw new Error(`Missing native trial ${trial.id}`);
  game.world.enemies = []; // Declared ambient isolation; authored cover remains.
  game.player.x = event.x; game.player.y = event.y; // Sole initial placement.
  const directorAtStart = { ...game.world.encounterDirector }, initialHp = game.player.hp;
  const actions = {}, memory = { decisions: [] }, warnings = [], failures = [], actorBudgets = [], recorded = new Set();
  let damage = 0, damageDealt = 0, maxOwnAlive = 0, maxArenaDistance = 0, pressureActors = 0, settlementFrames = 0;
  const applyDamage = game.damagePlayer.bind(game);
  game.damagePlayer = (...args) => { const applied = applyDamage(...args) || 0; damage += applied; return applied; };
  const hit = game.hitEnemy.bind(game);
  game.hitEnemy = (...args) => { const applied = hit(...args) || 0; damageDealt += applied; return applied; };
  const effects = game.handleWorldEventEffects.bind(game);
  game.handleWorldEventEffects = values => {
    for (const effect of values.filter(effect => effect.eventId === trial.id)) {
      if (effect.kind === 'warning') warnings.push({ wave: event.waveIndex + 1, seconds: effect.duration, time: round(game.time), elapsed: round(event.elapsed) });
      if (effect.kind === 'failure') failures.push(effect);
    }
    return effects(values);
  };
  if (!game.interactWorldEvent(`${trial.id}:start`)) throw new Error(`Cannot natively start ${trial.id}`);
  while (!game.dead && event.state === 'active' && game.time < LIMIT) {
    controller(game, event, style, actions, memory); game.update(DT);
    if (game.inSettlement()) settlementFrames++;
    const own = game.world.enemies.filter(enemy => enemy.alive && enemy.eventId === trial.id);
    maxOwnAlive = Math.max(maxOwnAlive, own.length); maxArenaDistance = Math.max(maxArenaDistance, distance(game.player, event));
    pressureActors = Math.max(pressureActors, game.world.enemies.filter(enemy => enemy.directorId && enemy.alive).length);
    for (const enemy of game.world.enemies.filter(enemy => enemy.eventId === trial.id)) if (!recorded.has(enemy.id)) {
      recorded.add(enemy.id); actorBudgets.push({ id: enemy.id, wave: event.waveIndex + 1, type: enemy.type, level: enemy.level, boss: !!enemy.boss, maxHp: enemy.maxHp, damage: enemy.damage, spawnTime: round(game.time) });
    }
  }
  const won = !game.dead && event.state === 'success', fightTime = round(game.time);
  const directorNextInAtFightEnd = game.world.encounterDirector.nextIn;
  const boss = game.world.enemies.find(enemy => enemy.eventId === trial.id && ENEMY_TYPES[enemy.type]?.boss);
  let claimed = false, duplicateClaim = false, claimWalkSeconds = 0;
  if (won) {
    const from = game.time; game.aim = null;
    while (distance(game.player, event) > 65 && game.time - from < 30) { walk(game, event); game.update(DT); }
    game.keys.clear(); claimWalkSeconds = round(game.time - from);
    claimed = game.claimWorldEvent(trial.id); duplicateClaim = game.claimWorldEvent(trial.id);
  }
  return { id: trial.id, style, classId: 'ranger', level: trial.level, equipment,
    fixture: { legalRareGear: true, passivesMaxRank: 3, pointsWithinEarnedBudget: true, healingItemsTotal: 5,
      noExtraActives: true, noRelicsGemsUpgradesOrCompanions: true, initialPlacementAtStartOnly: true, fightTeleports: 0,
      ambientEnemiesRemoved: true, authoredCoverRetained: true, enemyStatsUnmodified: true, forcedEnemyKills: false, directorClockUnmodified: true },
    won, dead: game.dead, timeout: !won && !game.dead && game.time >= LIMIT, eventState: event.state, fightTime,
    wavesCleared: event.waveIndex, wavesTotal: trial.waves.length, damageTaken: round(damage), damageDealt: round(damageDealt), damagePercent: round(damage / initialHp * 100),
    initialPlayerHp: initialHp, finalPlayerHp: round(game.player.hp), actions, potionsLeft: game.inventory[equipment.healing] || 0,
    bossType: boss?.type || null, bossLevel: boss?.level || null, bossMaxHp: boss?.maxHp || null, bossDamage: boss?.damage || null,
    bossCycles: boss?.cycle || 0, bossAlive: boss?.alive ?? null, claimed, duplicateClaim, claimWalkSeconds,
    maxOwnAlive, maxArenaDistance: round(maxArenaDistance), pressureActors, settlementFrames, directorNextInAtStart: directorAtStart.nextIn,
    directorNextInAtFightEnd: round(directorNextInAtFightEnd), directorNextInAtEnd: round(game.world.encounterDirector.nextIn), warnings,
    decisions: memory.decisions, failures, actorBudgets };
}

const results = [];
for (const trial of TRIALS) for (const style of ['reactive', 'reckless']) {
  const result = probe(trial, style); results.push(result);
  console.log(JSON.stringify({ id: result.id, style, won: result.won, dead: result.dead, timeout: result.timeout, wavesCleared: result.wavesCleared,
    fightTime: result.fightTime, damageTaken: result.damageTaken, bossCycles: result.bossCycles, maxOwnAlive: result.maxOwnAlive, claimed: result.claimed }));
}
const checks = results.map(result => ({ id: `${result.id}/${result.style}`, cap: result.maxOwnAlive <= 7,
  warnings: result.warnings.length <= result.wavesTotal && (!result.won || result.warnings.length === result.wavesTotal) && result.warnings.every(warning => warning.seconds === 6),
  spawnDelay: result.actorBudgets.every(actor => actor.spawnTime + 1e-6 >= result.warnings.find(warning => warning.wave === actor.wave).time + 6),
  levels: result.actorBudgets.every(actor => actor.level === result.level), bossLevel: result.bossLevel === null || result.bossLevel === result.level,
  potions: (result.actions.potion || 0) <= 5,
  talentBudget: Object.values(result.equipment.talents).every(rank => rank <= 3) && result.equipment.unspentPoints >= 0,
  pressure: result.pressureActors === 0 && result.directorNextInAtStart === result.directorNextInAtFightEnd,
  noSettlementFarming: result.settlementFrames === 0,
  physicalDecisions: result.decisions.every(decision => decision.distance < 85),
  personalClaim: !result.won || result.claimed && !result.duplicateClaim,
  reactiveCompleted: result.style !== 'reactive' || result.won }));
await fs.writeFile(output, JSON.stringify({ fixtureLimits: 'Six deterministic Ranger probes with legal generated Rare equipment, earned passive points capped at rank three, and exactly five healing items. One initial placement at the start; all combat, intermission and claim travel use native keys/actions. Ambient foes isolated, authored cover and director clock retained, enemy HP/damage unchanged. Reactive bots read current telegraphs; reckless bots ignore warnings and select Push. These are reproducible regression probes, not human difficulty judgments.', results, checks }, null, 2));
console.log(JSON.stringify({ output, checks }, null, 2));
if (checks.some(check => Object.entries(check).some(([name, value]) => name !== 'id' && value !== true))) process.exitCode = 1;

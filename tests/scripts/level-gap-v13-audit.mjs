import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { loadAuditSource, auditController } from './v8-balance-gameplay-audit.mjs';

// Reproducible in-memory native combat; no server, user save or live account.
// Level, seven rare drops and initial placement are explicitly supplied fixtures.
// XP progression, learning, equip, rest, actions and combat are production methods.
const PROJECT = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2), value = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const root = path.resolve(value('--source-root', PROJECT));
const output = path.resolve(value('--output', path.join(PROJECT, '.openai/.local/level-gap-v13-current.json')));
const compareFile = value('--compare', null);
const seconds = Number(value('--seconds', '120'));
const classFilter = value('--classes', '').split(',').filter(Boolean);
const gaps = value('--gaps', '0,5,10,41').split(',').map(Number);
const styles = value('--styles', 'reactive,reckless').split(',');
const kinds = value('--kinds', 'normal,elite,champion').split(',');
if (!Number.isInteger(seconds) || seconds < 10 || seconds > 180 || gaps.some(g => !Number.isInteger(g) || g < 0 || g > 73) || styles.some(s => !['reactive', 'reckless'].includes(s)) || kinds.some(k => !['normal', 'elite', 'champion'].includes(k))) throw new RangeError('Bounded audit arguments required.');
const DT = .04, LEVEL = 27;
const round = n => +n.toFixed(3);
const rng = initial => { let seed = initial; return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; };
async function fingerprint() {
  const rows = {};
  for (const file of (await fs.readdir(path.join(root, 'src'))).filter(file => file.endsWith('.js')).sort()) rows[file] = createHash('sha256').update(await fs.readFile(path.join(root, 'src', file))).digest('hex');
  return { sha256: createHash('sha256').update(JSON.stringify(rows)).digest('hex'), files: rows };
}
const before = await fingerprint(), source = await loadAuditSource(root);
Object.assign(source, await import(pathToFileURL(path.join(root, 'src/bestiary.js'))));
const { cumulativeXp } = await import(pathToFileURL(path.join(root, 'src/progression.js')));
const director = await import(pathToFileURL(path.join(root, 'src/encounter-director.js')));
const profiles = source.CLASSES.filter(cls => !classFilter.length || classFilter.includes(cls.id));
if (!profiles.length || classFilter.some(id => !source.CLASSES.some(cls => cls.id === id))) throw new RangeError('Unknown audit class.');
const pristine = new source.Game({ storage: null }).world;
const fresh = seed => new source.Game({ storage: null, random: rng(seed), worldFactory: () => structuredClone(pristine) });
function regionFor(level) { return source.REGIONS.find(region => level >= region.level && level <= (region.maxLevel ?? region.level + 6) && source.REGION_ENEMY_POOLS[region.id]); }
function speciesFor(region) {
  const types = source.REGION_ENEMY_POOLS[region.id];
  return types.find(id => source.BESTIARY_ENEMIES[id].combat.pattern === 'melee') ?? types[0];
}
function isolate(game) {
  const w = game.world;
  // Open collision arena removes unrelated scenery, protection and opponents.
  // Native actor movement, warnings, projectiles, damage and sustain remain.
  w.enemies = []; w.trees = []; w.rocks = []; w.structures = []; w.river = []; w.bridges = []; w.shrines = [];
  w.nodes = []; w.plots = []; w.worldEvents = []; w.eventObjects = []; w.interactions = [];
  w.encounterDirector.sequence = 1; w.encounterDirector.nextIn = 1e6;
  game.npcs = []; game.overworld = w;
}
function prepare(profile) {
  const game = fresh(27027); assert.equal(game.selectClass(profile.id), true); game.start();
  game.gainXp(cumulativeXp(LEVEL)); assert.equal(game.player.level, LEVEL);
  const pointBudget = game.player.skillPoints, gear = [];
  for (const slot of source.EQUIPMENT_SLOTS) {
    const base = source.ITEM_BASES.filter(item => source.equipmentSlot(item) === slot.id && item.minLevel <= LEVEL && (!item.classIds || item.classIds.includes(profile.id)))
      .sort((a, b) => b.minLevel - a.minLevel || (b.stats.damage || 0) - (a.stats.damage || 0) || (b.stats.maxHp || 0) - (a.stats.maxHp || 0) || a.id.localeCompare(b.id))[0];
    if (!base) throw new Error(`No legal level-27 base for ${profile.id}/${slot.id}`);
    const item = source.generateLoot({ level: LEVEL, baseId: base.id, classId: profile.id, rarity: 'rare', rng: rng(8177 + LEVEL), uid: `gap27-${profile.id}-${slot.id}`, source: 'declared_level_27_drop_fixture' });
    const minimum = item.minLevel || item.level || 1;
    assert.ok(minimum <= LEVEL); assert.equal(game.addItem(item), true); assert.equal(game.equip(item.id), true);
    gear.push({ slot: slot.id, id: item.id, baseId: base.id, level: item.level, minimum, baseMinimum: base.minLevel, rarity: item.rarity, stats: game.itemStats(item.id) });
  }
  const learnPath = (talent, rank = 1) => {
    if (!talent || (talent.minLevel || 1) > LEVEL) return false;
    for (const need of !talent.requires ? [] : Array.isArray(talent.requires) ? talent.requires : [talent.requires]) {
      const id = typeof need === 'string' ? need : need.id, count = typeof need === 'string' ? talent.requiresRank || 1 : need.rank || 1;
      if (!learnPath(profile.talents.find(t => t.id === id), count)) return false;
    }
    while ((game.skills[talent.id] || 0) < rank) if (!game.learn(talent.id)) return false;
    return true;
  };
  for (const ability of source.ABILITIES.filter(a => a.classId === profile.id && a.level <= LEVEL)) {
    if (ability.requires) learnPath(profile.talents.find(t => t.id === ability.requires));
    game.learnAbility(ability.id);
  }
  const exclusive = new Set();
  for (const talent of profile.talents.filter(t => t.combatEffects && (t.minLevel || 1) <= LEVEL)) {
    if (talent.exclusiveGroup && exclusive.has(talent.exclusiveGroup)) continue;
    if (learnPath(talent, talent.maxRank) && talent.exclusiveGroup) exclusive.add(talent.exclusiveGroup);
  }
  for (let pass = 0; pass < 3; pass++) for (const talent of profile.talents.filter(t => !t.combatEffects && (t.minLevel || 1) <= LEVEL)) if ((game.skills[talent.id] || 0) < Math.min(3, talent.maxRank)) game.learn(talent.id);
  const learned = source.ABILITIES.filter(a => a.classId === profile.id && game.learnedAbilities[a.id]);
  game.setAbilityLoadout(0, null); game.setAbilityLoadout(1, null);
  for (const [slot, ability] of learned.slice(0, 2).entries()) assert.equal(game.setAbilityLoadout(slot, ability.id), true);
  const pointCost = profile.talents.reduce((sum, talent) => sum + (game.skills[talent.id] || 0) * (talent.cost || 1), 0) + learned.reduce((sum, a) => sum + a.talentCost, 0);
  assert.equal(pointCost + game.player.skillPoints, pointBudget);
  const initialPotions = Object.entries(game.inventory).filter(([id]) => game.item(id)?.type === 'consumable').map(([id, count]) => ({ id, count }));
  // Equip never grants an HP refill. Rest at the real protected starting village.
  const hpAfterEquip = game.player.hp, restStart = game.time;
  while (game.player.hp < game.stats().maxHp - .0001 || game.player.mana < game.stats().mana - .0001) {
    if (game.time - restStart > 1200) throw new Error('Native settlement recovery exceeded its bound.');
    assert.equal(game.inSettlement(), true); game.update(DT, { simulateWorld: false });
  }
  return { save: structuredClone(game.capture()), fixture: { classId: profile.id, level: LEVEL, awardedXp: cumulativeXp(LEVEL), pointBudget, pointCost, unspent: game.player.skillPoints, gear, talents: { ...game.skills }, loadout: [...game.abilityLoadout], initialPotions, hpAfterEquip, restedSeconds: round(game.time - restStart), initialHp: game.player.hp, initialMana: game.player.mana, stats: game.stats() } };
}
function spawn(game, level, kind, center) {
  const region = regionFor(level), type = speciesFor(region);
  if (kind !== 'elite') {
    const enemy = source.createBestiaryEnemy(type, `gap-${kind}-${level}`, center.x + 190, center.y, { level, region: region.id, boss: kind === 'champion' });
    game.world.enemies.push(enemy); return enemy;
  }
  // Both actors spawn through the actual, validated Director warning plan.
  // Then isolate one elite, retaining its canonical hard-tier HP/damage budget.
  const saved = { version: 1, elapsed: 100, sequence: 1, nextIn: 0, stage: 'warning', tier: 'hard', remaining: DT, region: region.id, anchor: { ...center }, plan: [
    { type, level, x: center.x + 190, y: center.y, elite: true, partySize: 1 },
    { type, level, x: center.x - 250, y: center.y + 50, elite: false, partySize: 1 },
  ], actors: [] };
  assert.equal(director.validateEncounterDirectorSave(saved), true); director.restoreEncounterDirector(game.world, saved);
  // Higher-level regional pursuits are naturally triggered by an eligible
  // traveler. That traveler only starts the spawn and never joins combat.
  const traveler = fresh(1000 + level); traveler.gainXp(cumulativeXp(level)); traveler.start();
  traveler.world = game.world; traveler.overworld = game.world;
  // Within the Director's 650 px warning radius, outside both spawn exclusion
  // radii; native XP makes this traveler eligible for the authored region.
  Object.assign(traveler.player, { x: center.x - 500, y: center.y + 350 });
  director.updateEncounterDirector(game, DT, [traveler]);
  const enemy = game.world.enemies.find(e => e.elite); assert.ok(enemy);
  game.world.enemies = [enemy];
  // Lifecycle/other patrols are excluded from the isolated actor comparison.
  // The actor keeps all native elite combat fields, budgets and movement AI.
  Object.assign(game.world.encounterDirector, { stage: 'calm', region: null, anchor: null, plan: [], remaining: 0, nextIn: 1e6 });
  return enemy;
}
function probe(profile, prepared, gap, kind, style) {
  const game = fresh(8117 + LEVEL); game.applySave(structuredClone(prepared.save)); game.start(); isolate(game);
  const level = LEVEL + gap, region = regionFor(level); assert.ok(region);
  const center = { x: region.x + region.w / 2, y: region.y + region.h / 2 };
  Object.assign(game.player, center); game.player.id = `audit-${profile.id}`; game.keys.clear();
  const target = spawn(game, level, kind, center), initial = { hp: target.hp, maxHp: target.maxHp, damage: target.damage, level: target.level, type: target.type, elite: !!target.elite, boss: !!target.boss };
  assert.equal(target.hp, target.maxHp); assert.equal(game.inSettlement(), false);
  const actions = {}, memory = {}, start = game.time; let dealt = 0, taken = 0, absorbed = 0, minHp = game.player.hp, preRewardHp = null, preRewardLevel = null, hits = 0, resets = 0, lastAggro = false, playerDistance = 0, cycles = 0;
  const hit = game.hitEnemy.bind(game), damage = game.damagePlayer.bind(game), kill = game.killEnemy.bind(game);
  game.hitEnemy = (enemy, ...args) => { const applied = hit(enemy, ...args) || 0; if (enemy === target) dealt += applied; return applied; };
  game.damagePlayer = (...args) => { const shield = game.player.shield || 0, hp = game.player.hp, result = damage(...args) || 0; taken += result; absorbed += Math.max(0, shield - (game.player.shield || 0)); if (game.player.hp < hp) hits++; minHp = Math.min(minHp, game.player.hp); return result; };
  game.killEnemy = enemy => { if (enemy === target) { preRewardHp = game.player.hp; preRewardLevel = game.player.level; } return kill(enemy); };
  const event = { x: center.x, y: center.y }; // undefined id matches native ordinary actors, without event tagging that changes AI.
  let ticks = 0;
  while (!game.dead && target.alive && game.world.enemies.includes(target) && game.time - start < seconds && ticks++ < Math.ceil(seconds / DT)) {
    const previous = { x: game.player.x, y: game.player.y };
    auditController(source, game, event, style, memory, actions);
    game.update(DT);
    playerDistance += Math.hypot(game.player.x - previous.x, game.player.y - previous.y);
    if (target.alive && lastAggro && !target.aggro) resets++; lastAggro = !!target.aggro;
    cycles = Math.max(cycles, target.cycle || 0);
    assert.equal(target.maxHp, initial.maxHp); assert.equal(game.inSettlement(), false, 'Controller entered a protected zone.');
  }
  const won = !target.alive && !game.dead;
  return { key: `${profile.id}/${gap}/${kind}/${style}`, classId: profile.id, playerLevel: LEVEL, gap, enemyLevel: level, kind, style, won, dead: game.dead, timedOut: !won && !game.dead && target.alive, withdrawn: target.alive && !game.world.enemies.includes(target), seconds: round(game.time - start), enemy: initial, enemyRemainingHp: round(Math.max(0, target.hp)), damageDealt: round(dealt), damageTaken: round(taken), shieldAbsorbed: round(absorbed), minHp: round(minHp), finalHp: round(game.player.hp), hpBeforeNativeRewards: preRewardHp === null ? null : round(preRewardHp), levelBeforeNativeRewards: preRewardLevel, levelAfterCombat: game.player.level, incomingHits: hits, enemyCycles: cycles, aggroResets: resets, playerDistance: round(playerDistance), actions, remainingPotions: prepared.fixture.initialPotions.map(p => ({ id: p.id, count: game.inventory[p.id] || 0 })) };
}
const fixtures = [], results = [];
for (const profile of profiles) {
  const prepared = prepare(profile); fixtures.push(prepared.fixture);
  for (const gap of gaps) for (const kind of kinds) for (const style of styles) {
    const result = probe(profile, prepared, gap, kind, style); results.push(result);
    console.log(JSON.stringify({ key: result.key, won: result.won, dead: result.dead, seconds: result.seconds, enemyHp: result.enemy.hp, enemyRemainingHp: result.enemyRemainingHp, taken: result.damageTaken, potions: result.actions.potion || 0 }));
  }
}
const after = await fingerprint(), groups = [];
for (const gap of gaps) for (const kind of kinds) for (const style of styles) {
  const rows = results.filter(r => r.gap === gap && r.kind === kind && r.style === style);
  groups.push({ gap, enemyLevel: LEVEL + gap, kind, style, cases: rows.length, wins: rows.filter(r => r.won).length, deaths: rows.filter(r => r.dead).length, timeouts: rows.filter(r => r.timedOut).length, zeroDamageWins: rows.filter(r => r.won && r.damageTaken === 0 && r.shieldAbsorbed === 0).length });
}
const report = { auditVersion: 1, auditScriptSha256: createHash('sha256').update(await fs.readFile(fileURLToPath(import.meta.url))).digest('hex'), controllerSha256: createHash('sha256').update(await fs.readFile(new URL('./v8-balance-gameplay-audit.mjs', import.meta.url))).digest('hex'), sourceRoot: root, source: before, sourceChangedDuringRun: after.sha256 !== before.sha256, humanPlaytest: false, dt: DT, secondsLimit: seconds, supplied: ['native XP budget to level 27; acquisition time not replayed', 'seven seeded rare level-27 drops, actual equip/requirements', 'five unmodified initial healing consumables', 'one initial placement in an obstacle-free regional arena', 'native normal/champion spawn, elite through validated hard Director plan then isolated from its pack'], forbiddenShortcuts: ['no direct level/skill-point/HP/mana assignment', 'no enemy HP/damage/maxHp overrides', 'no combat teleport', 'no infinite potions, gems, upgrades, relics or companion', 'no backend or user-save mutations'], controller: 'Existing v8 native controller: reactive reads exposed warnings/projectiles and can dodge/use finite initial potions; reckless uses same offensive rotation/range, ignores warnings and never dodges/uses potions. It is an automated controller, not a human difficulty score.', fixtures, groups, results };
if (compareFile) {
  const baseline = JSON.parse(await fs.readFile(path.resolve(compareFile), 'utf8'));
  assert.equal(baseline.sourceChangedDuringRun, false, 'Changed baseline source cannot support a comparison.');
  assert.equal(baseline.auditScriptSha256, report.auditScriptSha256, 'Both runs must use the same probe.');
  assert.equal(baseline.controllerSha256, report.controllerSha256, 'Both runs must use the same controller.');
  assert.equal(baseline.dt, DT); assert.equal(baseline.secondsLimit, seconds);
  const byKey = new Map(baseline.results.map(row => [row.key, row]));
  assert.equal(byKey.size, results.length, 'Compare requires the same matrix dimensions.');
  assert.deepEqual(fixtures, baseline.fixtures, 'Progression, gear, learning and rest must match the baseline.');
  report.comparison = results.map(row => {
    const old = byKey.get(row.key); assert.ok(old, `Missing baseline row ${row.key}`);
    assert.deepEqual(row.enemy, old.enemy, 'Native enemy budgets must match the baseline.');
    return { key: row.key, beforeWon: old.won, afterWon: row.won, beforeSeconds: old.seconds, afterSeconds: row.seconds, beforeDamageDealt: old.damageDealt, afterDamageDealt: row.damageDealt, beforeDamageTaken: old.damageTaken, afterDamageTaken: row.damageTaken };
  });
  const immuneRows = results.filter(row => row.gap >= 20);
  const sameLevelNormal = results.filter(row => row.gap === 0 && row.kind === 'normal' && row.style === 'reactive');
  report.checks = [
    { name: 'same legal hero and native enemy fixtures', passed: true },
    { name: 'no kill or damage at the declared overwhelming level gap', cases: immuneRows.length, passed: immuneRows.length > 0 && immuneRows.every(row => !row.won && row.damageDealt === 0 && row.enemyRemainingHp === row.enemy.maxHp) },
    { name: 'previously achievable same-level normal encounters remain achievable', cases: sameLevelNormal.length, passed: sameLevelNormal.length > 0 && sameLevelNormal.every(row => !byKey.get(row.key).won || row.won) },
  ];
}
await fs.mkdir(path.dirname(output), { recursive: true }); await fs.writeFile(output, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, cases: results.length, sourceChangedDuringRun: report.sourceChangedDuringRun, groups }));
if (report.sourceChangedDuringRun || report.checks?.some(check => !check.passed)) process.exitCode = 1;

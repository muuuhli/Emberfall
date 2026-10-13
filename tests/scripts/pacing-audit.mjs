// Run manually: node tests/scripts/pacing-audit.mjs
// This is an analytical balance model. It does NOT measure human playtime or
// establish the requested 200-hour content quality/retention requirement.
import { QUESTS, ENEMY_TYPES } from '../../src/catalog.js';
import { makeWorld } from '../../src/world.js';
import { expandWorld, EXPANSION_REGIONS, EXPANSION_QUESTS } from '../../src/expansion.js';
import { DUNGEONS, createDungeon } from '../../src/dungeons.js';
import { cumulativeXp, applyExperience } from '../../src/progression.js';
import { getClass } from '../../src/classes.js';

const levelFor = xp => applyExperience({}, xp).level;
const world = expandWorld(makeWorld());
const averageRegionalXp = (region, type) => {
  const candidates = world.enemies.filter(e => e.region === region && e.type === type);
  return candidates.length ? candidates.reduce((n, e) => n + (e.xp ?? ENEMY_TYPES[e.type].xp), 0) / candidates.length : ENEMY_TYPES[type].xp;
};
const killXp = quest => quest.objectives.filter(o => o.kind === 'kill').reduce((n, o) => n + o.count * averageRegionalXp(quest.region, o.target), 0);
const ordinaryStories = QUESTS.filter(q => !q.repeatable && !q.contract);
const questXp = ordinaryStories.reduce((n, q) => n + q.reward.xp, 0);
const firstVisits = EXPANSION_QUESTS.filter(q => q.chapter === 1).reduce((n, q) => n + q.reward.xp, 0);
const perRun = (definition, tier = 1) => {
  const instance = createDungeon(definition.id, { tier });
  return instance.rewards.completionXp + instance.world.enemies.reduce((n, e) => n + e.xp, 0);
};
const baseline = ordinaryStories.reduce((n, q) => n + q.reward.xp + killXp(q), 0) + DUNGEONS.reduce((n, d) => n + perRun(d), 0);
console.log(JSON.stringify({
  kind: 'analytical-estimate-not-human-playtest', xpTo100: cumulativeXp(100),
  questRewards: questXp, questRewardsLevelWithoutKillXp: levelFor(questXp),
  originalFirstVisitXp: firstVisits, firstVisitLevelWithoutQuestGates: levelFor(firstVisits),
  optimisticStoryAndSingleDungeonPassXp: Math.round(baseline), optimisticLevel: levelFor(baseline),
  note: 'The optimistic story sum ignores entry/minimum-level gates, routes, resources, deaths and party scheduling. Repeatable contracts and affix-wave kills are not counted.',
}, null, 2));

console.table(EXPANSION_REGIONS.map(region => {
  const quests = EXPANSION_QUESTS.filter(q => q.region === region.id);
  return { region: region.id, recommended: region.level, questStartGate: quests[0].minLevel,
    questXp: quests.reduce((n, q) => n + q.reward.xp, 0), mandatoryKillsXp: Math.round(quests.reduce((n, q) => n + killXp(q), 0)),
    averageEnemyXp: Math.round(averageRegionalXp(region.id, region.enemy)),
  };
}));

const profile = getClass('guardian').abilities.attack;
const basicDps = level => (16 + level * 3) * profile.damageMultiplier / profile.cooldown * (3.55 / 3) * 1.042;
console.table(DUNGEONS.map(definition => ({ dungeon: definition.id, minLevel: definition.minLevel, party: definition.partyRequired,
  tierOneXp: perRun(definition), tierThirtyXp: perRun(definition, 30),
  minimumBossSecondsBasicAttack: Math.round(ENEMY_TYPES[definition.boss].hp / (basicDps(definition.minLevel) * definition.partyRequired)),
  // 50% attack uptime is an explicit assumption, not an observed measurement.
  bossSecondsAt50PercentUptime: Math.round(ENEMY_TYPES[definition.boss].hp / (basicDps(definition.minLevel) * definition.partyRequired) * 2),
})));

const route = []; let xp = cumulativeXp(12);
while (levelFor(xp) < 100 && route.length < 2000) {
  const before = levelFor(xp), definition = DUNGEONS.filter(d => d.partyRequired === 1 && d.minLevel <= before).at(-1);
  const instance = createDungeon(definition.id), boss = instance.world.enemies.find(e => e.boss);
  const guardHp = instance.world.enemies.filter(e => !e.boss).reduce((n, e) => n + e.maxHp, 0);
  const combatSeconds = (boss.maxHp + guardHp) / basicDps(before) / .5;
  xp += perRun(definition);
  route.push({ dungeon: definition.id, before, after: levelFor(xp), xp: perRun(definition), combatSeconds });
}
const combat = route.reduce((n, run) => n + run.combatSeconds, 0);
console.log(JSON.stringify({
  kind: 'illustrative-repeat-route-not-playtime-proof', startLevel: 12, endLevel: levelFor(xp), runs: route.length,
  runsByDungeon: Object.fromEntries(DUNGEONS.filter(d => d.partyRequired === 1).map(d => [d.id, route.filter(r => r.dungeon === d.id).length])),
  modelHoursWith90SecondRunOverhead: Math.round((combat + route.length * 90) / 3600 * 100) / 100,
  modelHoursWith300SecondRunOverhead: Math.round((combat + route.length * 300) / 3600 * 100) / 100,
  assumptions: 'Tier one repeats; original starter equipment; no talents, spells or loot upgrades; 50% basic-attack uptime; overhead per run includes puzzles and travel. Initial levels, deaths, raid scheduling and full authored campaign are outside this route. These assumptions are estimates, not captured play sessions.',
}, null, 2));

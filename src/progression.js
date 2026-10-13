/** Bounded polynomial scaling: high-level progression does not need exponential numbers. */
export const MAX_LEVEL = 100;
const levelValue = value => Number.isFinite(value) ? Math.max(1, Math.min(MAX_LEVEL, Math.floor(value))) : 1;

export function xpToNext(level) {
  const current = levelValue(level);
  if (current === MAX_LEVEL) return 0;
  const originalCurve = 70 + current * current * 22;
  return Math.round(originalCurve * (1 + Math.max(0, current - 10) * 0.03));
}

export function enemyScale(level) {
  const delta = levelValue(level) - 1;
  return 1 + delta * 0.13 + delta * delta * 0.0015;
}

export function rewardScale(level) {
  const delta = levelValue(level) - 1;
  return 1 + delta * 0.25 + delta * delta * 0.005;
}

export function cumulativeXp(level) {
  let total = 0;
  for (let current = 1; current < levelValue(level); current++) total += xpToNext(current);
  return total;
}

export function applyExperience({ level = 1, xp = 0 } = {}, amount = 0) {
  let current = levelValue(level);
  let remainder = (Number.isFinite(xp) ? Math.max(0, xp) : 0) + (Number.isFinite(amount) ? Math.max(0, amount) : 0);
  const levels = [];
  while (current < MAX_LEVEL && remainder >= xpToNext(current)) {
    remainder -= xpToNext(current);
    current++;
    levels.push(current);
  }
  return { level: current, xp: current === MAX_LEVEL ? 0 : remainder, levels, skillPoints: levels.length * 2 };
}

/** A content/pacing DESIGN TARGET. Only recorded full play sessions can verify 200 hours. */
export const campaignPacing = {
  targetHours: 200,
  status: 'design-target',
  verifiedHours: 0,
  validation: 'Noch keine vollständige 200-Stunden-Spielzeitmessung; die Werte sind Entwicklungsziele.',
  phases: [
    { id: 'first_embers', name: 'Die erste Glut', minLevel: 1, maxLevel: 10, targetHours: 4, focus: ['Kampf lernen', 'Dorfquests', 'erste Rätseldungeons'] },
    { id: 'frontier', name: 'Grenzlande', minLevel: 11, maxLevel: 30, targetHours: 22, focus: ['Regionen erschließen', 'Klassenpfade', 'Handwerk'] },
    { id: 'forgotten_reaches', name: 'Vergessene Weiten', minLevel: 31, maxLevel: 50, targetHours: 32, focus: ['Dungeonketten', 'Seltene Beute', 'Fraktionen'] },
    { id: 'shattered_crown', name: 'Die zerbrochene Krone', minLevel: 51, maxLevel: 70, targetHours: 42, focus: ['Gruppendungeons', 'Setausrüstung', 'Weltbosse'] },
    { id: 'war_of_embers', name: 'Krieg der Glut', minLevel: 71, maxLevel: 90, targetHours: 50, focus: ['Raidvorbereitung', 'Eliteverträge', 'Klassenmeisterschaft'] },
    { id: 'last_horizon', name: 'Der letzte Horizont', minLevel: 91, maxLevel: 100, targetHours: 30, focus: ['Schwere Bosse', 'Legendäre Jagd', 'Letzte Talentzweige'] },
    { id: 'endgame', name: 'Jenseits der letzten Glut', minLevel: 100, maxLevel: 100, targetHours: 20, focus: ['Koordinierte Raids', 'Mythische Dungeons', 'Build-Optimierung'] },
  ],
  milestoneLevels: [10, 12, 25, 40, 60, 80, 100],
};

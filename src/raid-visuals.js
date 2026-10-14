// Presentation reads the same authoritative raid clock, warning snapshot and
// objective HP as combat. It never advances an encounter or creates targets.
import { BOSS_ENCOUNTERS } from './boss-encounters.js';
import { raidReviveSummary } from './raid-encounters.js';

export const RAID_WARNING_COLOR = '#e78b70';
export const RAID_SAFE_COLOR = '#8edbe2';
export const RAID_OBJECTIVE_HEIGHT = 58;
const RAID_TYPES = new Set(['storm_king', 'night_devourer', 'world_heart']);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function raidHudPresentation(game) {
  if (game?.world?.isPvp || game?.worldMode === 'pvp') return null;
  const instance = game?.dungeonInstance, state = instance?.raidEncounter;
  const reviveSummary=raidReviveSummary(instance),revives=reviveSummary.active?reviveSummary:null;
  const resume=game?.networkRaidResume;
  if(resume?.waiting){
    const required=clamp(Math.round(Number(resume.required)||1),1,8),ready=clamp(Math.round(Number(resume.ready)||0),0,8);
    return {waiting:true,pressure:false,revives,type:state?.type||'',phase:clamp(Number(state?.phase)||0,0,2)+1,
      name:`Warte auf Raidgruppe · ${ready}/${required}`,detail:'Kampfzeit pausiert',warning:false,remaining:0,objectiveCount:0,objectiveSeconds:0,objectiveLabel:''};
  }
  if (!state || !RAID_TYPES.has(state.type) || state.stopped || instance.bossDefeated) return null;
  const boss = game.world?.enemies?.find(enemy => enemy.type === state.type && enemy.alive !== false && enemy.hp > 0);
  if (!boss || state.startedAt === null && !state.pending && !boss.aggro) return null;
  const now = instance.bossTime || 0, pending = state.pending;
  const objectives = Object.values(state.objectives || {}).filter(objective => objective.alive !== false && objective.hp > 0);
  const remaining = pending ? Math.max(0, Math.ceil(pending.resolveAt - now - 1e-6)) : 0;
  const objectiveSeconds = objectives.length ? Math.max(0, Math.ceil(Math.min(...objectives.map(objective => objective.expiresAt)) - now - 1e-6)) : 0;
  const phase = clamp(Number(state.phase) || 0, 0, 2) + 1;
  const objectiveLabel = state.type === 'world_heart' ? 'Anker' : 'Seelen';
  const generic = boss.phase === 'windup' && ['stack', 'spread'].includes(boss.telegraphMechanic);
  const name = pending?.name || (generic ? boss.telegraphMechanic === 'stack' ? `Sternfall · ${boss.stackRequired || 2} sammeln` : 'Nova · Verteilen' : boss.shielded ? 'Quellsiegel halten' : BOSS_ENCOUNTERS[state.type].name);
  const warning = !!pending || !!generic;
  const countdown = pending ? remaining : generic ? Math.max(0, Math.ceil(boss.attackTimer || 0)) : 0;
  const pressure=pending?.mechanicId==='raid_pressure';
  const detail = pressure?`Team schützen und heilen · ${countdown} s`:[`Phase ${phase}`, ...(warning ? [`${countdown} s`] : []), ...(objectives.length ? [`${objectives.length} ${objectiveLabel} · ${objectiveSeconds} s`] : [])].join(' · ');
  return { type: state.type, phase, name, detail, revives,pressure,waiting:false,warning, remaining: countdown, objectiveCount: objectives.length, objectiveSeconds, objectiveLabel };
}

/** Original native pixel silhouettes, drawn into the existing half-resolution
 * world layer. No image downloads or per-object Canvas allocation are needed.
 */
export function drawRaidObjective(c, actor, { time = 0, reducedMotion = false, exploding = false } = {}) {
  const anchor = /Anker/.test(actor.name || '') || actor.ownerBossId?.startsWith('weltenkern:');
  const x = Math.round(actor.x / 2) * 2, y = Math.round(actor.y / 2) * 2;
  const pixel = (dx, dy, width, height, color) => { c.fillStyle = color; c.fillRect(x + dx, y + dy, width, height); };
  const outline = '#231a35', light = exploding ? '#ffd0a0' : anchor ? '#e7d5f7' : '#caecec';
  const accent = exploding ? '#ea795c' : anchor ? '#ac81c4' : '#70a7b1';
  pixel(-16, 2, 32, 4, '#13132188'); pixel(-10, 0, 20, 8, '#13132188');
  if (anchor) {
    pixel(-18, -2, 36, 6, outline); pixel(-14, -8, 28, 6, '#675879'); pixel(-10, -12, 20, 6, accent);
    pixel(-4, -54, 8, 4, outline); pixel(-8, -50, 16, 6, outline); pixel(-12, -44, 24, 8, outline);
    pixel(-14, -36, 28, 10, outline); pixel(-10, -26, 20, 8, outline); pixel(-6, -18, 12, 8, outline);
    pixel(-2, -50, 4, 8, light); pixel(-6, -42, 12, 6, accent); pixel(-10, -36, 20, 8, accent);
    pixel(-6, -28, 12, 8, '#71577f'); pixel(-2, -22, 4, 10, light); pixel(-4, -40, 4, 10, light);
    pixel(4, -36, 4, 6, '#dab7eb'); pixel(-14, -6, 8, 2, light); pixel(6, -6, 8, 2, light);
  } else {
    const bob = reducedMotion ? 0 : Math.round(Math.sin(time * 3 + actor.x) * 2) * 2;
    pixel(-6, -52 + bob, 12, 4, outline); pixel(-12, -48 + bob, 24, 4, outline);
    pixel(-16, -44 + bob, 32, 16, outline); pixel(-12, -28 + bob, 24, 8, outline);
    pixel(-8, -20 + bob, 16, 8, outline); pixel(-4, -12 + bob, 8, 6, outline);
    pixel(-8, -48 + bob, 16, 6, light); pixel(-12, -42 + bob, 24, 12, accent);
    pixel(-10, -30 + bob, 20, 8, light); pixel(-6, -22 + bob, 12, 6, accent);
    pixel(-2, -16 + bob, 4, 6, accent); pixel(-8, -38 + bob, 6, 6, outline); pixel(2, -38 + bob, 6, 6, outline);
    pixel(-2, -30 + bob, 4, 4, outline); pixel(-6, -22 + bob, 2, 4, outline); pixel(4, -22 + bob, 2, 4, outline);
  }
}

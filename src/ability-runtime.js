import { MASTERY_ABILITIES } from './mastery-abilities.js';
import { classPowerMultiplier } from './balance.js';
import { hitShape, wrapAngle } from './encounter-geometry.js';

// Authority-only transient state. No imported save, network command, player
// stat or mutable ability catalog can create a channel, mark or ward here.
const runtime = new WeakMap();
const canonical = new Map(MASTERY_ABILITIES.map(ability => [ability.id, ability]));
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const live = game => game?.started && !game.dead && !game.paused && game.player?.hp > 0 && game.worldMode !== 'pvp' && !game.world?.isPvp;
const owner = game => String(game.player.id || 'local');
const positive = value => Number.isFinite(value) && value > 0;

export function isMasteryAbility(ability) { return !!ability && canonical.get(ability.id)?.kind === ability.kind; }
export function clearMasteryAbilities(game) { cancelMasteryChannel(game); runtime.delete(game); }
function state(game) {
  let value = runtime.get(game);
  if (!value || value.world !== game.world || value.player !== game.player) {
    if (value) cancelMasteryChannel(game);
    value = { world: game.world, player: game.player, channel: null, ward: null, marks: new Map(), resolving: false };
    runtime.set(game, value);
  }
  return value;
}
export function cancelMasteryChannel(game) {
  const value = runtime.get(game), present = !!value?.channel;
  if (value?.channel) {
    const id = value.channel.ability.id, actorId = String(value.player?.id || 'local');
    for (const effect of game.effects || []) if (effect.kind === 'mastery-channel' && effect.abilityId === id && effect.actorId === actorId) effect.life = Math.min(effect.life, .08);
    if (value.player?.presentation?.skillId === id) delete value.player.presentation;
    value.channel = null;
  }
  return present;
}
function visible(game, from, to) {
  const length = distance(from, to), count = Math.max(1, Math.ceil(length / 18));
  for (let step = 1; step < count; step++) {
    const t = step / count;
    if (game.collides(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, 3)) return false;
  }
  return true;
}
function markTarget(game, ability) {
  const player = game.player;
  return game.world.enemies.filter(enemy => enemy.alive && distance(enemy, player) <= ability.range
    && Math.abs(wrapAngle(Math.atan2(enemy.y - player.y, enemy.x - player.x) - player.face)) <= 1.05
    && visible(game, player, enemy)).sort((a, b) => distance(a, player) - distance(b, player))[0] || null;
}
export function preflightMasteryAbility(game, ability) {
  if (!isMasteryAbility(ability)) return null;
  if (!live(game) || ability.classId !== game.player.classId) return { ok: false, reason: 'Diese Technik ist hier nicht verfügbar.' };
  if (ability.kind === 'mark' && !markTarget(game, ability)) return { ok: false, reason: 'Kein sichtbarer Gegner vor dir in Reichweite.' };
  return { ok: true };
}
function applySlow(game, enemy, ability) {
  if (!enemy.alive || !positive(ability.slow)) return;
  const factor = enemy.slowUntil > game.time ? enemy.slowFactor ?? 1 : 1;
  enemy.slowUntil = Math.max(enemy.slowUntil || 0, game.time + (ability.slowDuration || ability.duration || 2));
  enemy.slowFactor = Math.min(factor, Math.max(.1, 1 - ability.slow));
}
function procHit(game, enemy, damage) {
  if (!positive(damage) || !enemy.alive) return 0;
  const value = state(game), wasResolving = value.resolving;
  value.resolving = true;
  try { return game.hitEnemy(enemy, damage, 0) || 0; }
  finally { value.resolving = wasResolving; }
}
function fx(game, kind, point, ability, fields = {}) {
  game.effect(kind, point.x, point.y, { abilityId: ability.id, actorId: owner(game), color: ability.color, radius: 24, life: .45, ...fields });
}

/** Execute only after the normal Game authority has validated learned state,
 * prerequisites, slot, mana and cooldown, and paid the adjusted profile cost.
 */
export function executeMasteryAbility(game, ability, context = {}) {
  if (!isMasteryAbility(ability) || !live(game) || ability.classId !== game.player.classId) return false;
  const value = state(game), stats = context.stats || game.stats(), player = game.player;
  const powerFactor = context.powerFactor ?? classPowerMultiplier(player.classId, ability.powerKind);
  const healFactor = context.healFactor ?? classPowerMultiplier(player.classId, 'heal');
  const damage = context.damage ?? (stats[ability.stat] || 0) * ability.damageMultiplier * powerFactor;
  const origin = { x: player.x, y: player.y }, angle = player.face;
  cancelMasteryChannel(game);
  if (ability.kind === 'channel') {
    value.channel = { ability, origin, angle, damage, healFactor, remaining: Math.min(3, ability.ticks), nextAt: game.time + ability.windup };
    fx(game, 'mastery-channel', origin, ability, { angle, length: ability.length, width: ability.width, life: ability.windup + (ability.ticks - 1) * ability.interval });
  } else if (ability.kind === 'mark') {
    const target = markTarget(game, ability); if (!target) return false;
    if (positive(damage)) procHit(game, target, damage);
    if (target.alive) value.marks.set(target, { ability, expiresAt: game.time + ability.duration, charges: Math.min(2, ability.charges),
      bonus: (stats[ability.stat] || 0) * ability.comboMultiplier * powerFactor, actorId: owner(game) });
    fx(game, 'mastery-mark', target, ability, { targetId: target.id, radius: 24, life: .5 });
  } else if (ability.kind === 'stepStrike') {
    const moveAngle = angle + Math.PI / 2 * ability.side;
    game.move(player, Math.cos(moveAngle) * ability.distance, Math.sin(moveAngle) * ability.distance);
    const impact = { kind: 'cone', x: player.x, y: player.y, angle, length: ability.impactRange, halfAngle: ability.arc / 2 };
    for (const enemy of game.world.enemies.filter(enemy => enemy.alive && hitShape(impact, enemy) && visible(game, player, enemy)).slice(0, 6)) {
      const applied = positive(damage) ? game.hitEnemy(enemy, damage, 0) || 0 : 0;
      if (applied > 0) {
        applySlow(game, enemy, ability);
        if (positive(ability.burnMultiplier)) game.hazards.push({ id: `mastery-burn-${++game.lootSerial}`, kind: 'burn', x: enemy.x, y: enemy.y,
          radius: 38, damage: (stats.spellDamage || 0) * ability.burnMultiplier * classPowerMultiplier(player.classId, 'spell'),
          life: ability.burnDuration, tick: 1, actorId: owner(game), color: ability.color });
      }
    }
    fx(game, 'mastery-step', player, ability, { angle, range: ability.impactRange, arc: ability.arc, startX: origin.x, startY: origin.y, life: .3 });
  } else if (ability.kind === 'retaliationWard') {
    value.ward = { ability, damage, healFactor, charges: Math.min(3, ability.charges), expiresAt: game.time + ability.duration, readyAt: game.time };
    game._abilityShield(game, ability.shieldFraction, ability.duration);
    fx(game, 'mastery-ward', player, ability, { radius: 42, life: .55 });
  }
  return true;
}

function comboReady(game, target, mark) {
  const ability = mark.ability, time = game.time;
  if (ability.condition === 'slowed') return target.slowUntil > time && target.slowFactor < 1;
  if (ability.condition === 'taunted') return target.tauntUntil > time && target.targetId === mark.actorId;
  if (ability.condition === 'shielded') return game.player.shield > 0 && game.player.shieldUntil > time;
  if (ability.condition === 'wounded') return target.hp / target.maxHp < ability.threshold;
  if (ability.condition === 'distant') return distance(game.player, target) >= ability.conditionRange;
  if (ability.condition === 'cursed') return game.hazards.some(hazard => hazard.kind === 'curse' && hazard.life > 0 && hazard.actorId === mark.actorId && hazard.targetId === target.id);
  if (ability.condition === 'burning') return game.hazards.some(hazard => hazard.kind === 'burn' && hazard.life > 0 && hazard.actorId === mark.actorId && distance(hazard, target) < hazard.radius);
  return false;
}

/** A positive applied ordinary hit consumes at most one owner's mark charge.
 * Proc damage cannot trigger another proc, even when Game calls this hook again.
 */
export function onMasteryHit(game, enemy, applied) {
  if (!live(game) || !positive(applied)) return 0;
  const value = state(game), mark = value.marks.get(enemy);
  if (value.resolving || !mark) return 0;
  if (!enemy.alive || mark.expiresAt <= game.time || mark.actorId !== owner(game)) { value.marks.delete(enemy); return 0; }
  if (--mark.charges <= 0) value.marks.delete(enemy);
  const dealt = procHit(game, enemy, mark.bonus * (comboReady(game, enemy, mark) ? 1 : .5));
  if (dealt > 0) fx(game, 'mastery-proc', enemy, mark.ability, { radius: 32, targetId: enemy.id });
  return dealt;
}

/** Ward reactions require actual HP loss; shield-only hits and blocked or
 * nonpositive damage do not count. Consume before recursion or damage calls.
 */
export function onMasteryDamaged(game, applied) {
  if (!positive(applied)) return 0;
  cancelMasteryChannel(game);
  if (!live(game)) return 0;
  const value = state(game), ward = value.ward;
  if (value.resolving || !ward || ward.expiresAt <= game.time || ward.readyAt > game.time) return 0;
  const target = game.world.enemies.filter(enemy => enemy.alive && distance(enemy, game.player) <= ward.ability.targetRange && visible(game, game.player, enemy))
    .sort((a, b) => distance(a, game.player) - distance(b, game.player))[0];
  if (!target) return 0;
  if (--ward.charges <= 0) value.ward = null;
  ward.readyAt = game.time + Math.max(1, ward.ability.procCooldown);
  const dealt = procHit(game, target, ward.damage);
  if (dealt > 0) {
    applySlow(game, target, ward.ability);
    if (positive(ward.ability.drain)) game._healAbilityAlly(game, dealt * ward.ability.drain * ward.healFactor);
    fx(game, 'mastery-proc', target, ward.ability, { radius: 36, targetId: target.id });
  }
  return dealt;
}

export function updateMasteryAbilities(game, dt) {
  if (!Number.isFinite(dt) || dt < 0) return;
  if (!live(game)) { clearMasteryAbilities(game); return; }
  const value = state(game), time = game.time;
  for (const [target, mark] of value.marks) if (!target.alive || mark.expiresAt <= time || !game.world.enemies.includes(target)) value.marks.delete(target);
  if (value.ward?.expiresAt <= time) value.ward = null;
  const channel = value.channel;
  if (!channel) return;
  if (game.player.walking || distance(game.player, channel.origin) > 8) { cancelMasteryChannel(game); return; }
  while (channel.remaining > 0 && channel.nextAt <= time + 1e-8) {
    channel.remaining--; channel.nextAt += channel.ability.interval;
    const end = { x: channel.origin.x + Math.cos(channel.angle) * channel.ability.length, y: channel.origin.y + Math.sin(channel.angle) * channel.ability.length };
    const shape = { kind: 'segment', x1: channel.origin.x, y1: channel.origin.y, x2: end.x, y2: end.y, width: channel.ability.width };
    const targets = game.world.enemies.filter(enemy => enemy.alive && hitShape(shape, enemy) && visible(game, channel.origin, enemy))
      .sort((a, b) => distance(a, channel.origin) - distance(b, channel.origin)).slice(0, 4);
    for (const target of targets) {
      const dealt = positive(channel.damage) ? game.hitEnemy(target, channel.damage, 0) || 0 : 0;
      if (dealt > 0) {
        applySlow(game, target, channel.ability);
        if (positive(channel.ability.drain)) game._healAbilityAlly(game, dealt * channel.ability.drain * channel.healFactor);
      }
    }
    fx(game, 'mastery-channel', channel.origin, channel.ability, { angle: channel.angle, length: channel.ability.length, width: channel.ability.width, life: .22 });
  }
  if (channel.remaining <= 0) value.channel = null;
}

/** Cosmetic/read-only diagnostics. Never accepted by an import or command. */
export function getMasteryState(game) {
  if (!live(game)) return Object.freeze({ channel: null, ward: null, marks: Object.freeze([]) });
  const value = state(game), time = game.time;
  return Object.freeze({
    channel: value.channel ? Object.freeze({ abilityId: value.channel.ability.id, remaining: value.channel.remaining, nextIn: Math.max(0, value.channel.nextAt - time) }) : null,
    ward: value.ward && value.ward.expiresAt > time ? Object.freeze({ abilityId: value.ward.ability.id, charges: value.ward.charges, remaining: value.ward.expiresAt - time }) : null,
    marks: Object.freeze([...value.marks].filter(([target, mark]) => target.alive && mark.expiresAt > time).slice(0, 8)
      .map(([target, mark]) => Object.freeze({ abilityId: mark.ability.id, targetId: target.id, charges: mark.charges, remaining: mark.expiresAt - time }))),
  });
}

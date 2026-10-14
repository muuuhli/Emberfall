// Deterministic, renderer-independent boss choreography. The controller owns only
// its serializable state; it never moves, damages or mutates input actors.
// Root simulation applies events and synchronizes state.objectives[id].hp/alive
// with the corresponding spawned objective actor before the next update.
const TAU = Math.PI * 2, EPSILON = 1e-7;
const clone = value => JSON.parse(JSON.stringify(value));
const roundTime = value => Math.round(value * 1e6) / 1e6;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const angleDifference = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const alive = player => player && player.alive !== false && !player.dead && !player.downed && (player.hp == null || player.hp > 0);

const ability = (id, name, pattern, cooldown, windup, effect, extra = {}) => ({ id, name, pattern, cooldown, windup, effect, ...extra });
export const BOSS_ENCOUNTERS = {
  root_matron: { name: 'Die Wurzelmutter', color: '#a9c487', abilities: [
    ability('root_lanes', 'Wurzelstoß', 'root-lanes', 9, 1.5, { damageFraction: .18, flatDamage: 8, armorPierce: .7, slow: { factor: .65, duration: 2 }, push: { distance: 35 } }),
    ability('seed_ring', 'Saatkranz', 'seed-ring', 13, 1.8, { damageFraction: .22, flatDamage: 0, armorPierce: 1 }, { adds: { fromPhase: 1, count: 2, hp: 260, lifetime: 12 } }),
  ] },
  drowned_archon: { name: 'Der Ertrunkene Archont', color: '#98c8d0', abilities: [
    ability('rising_tide', 'Steigende Flut', 'rising-tide', 10, 1.7, { damageFraction: .22, flatDamage: 20, armorPierce: .65, push: { distance: 115 } }),
    ability('drowned_bells', 'Ertrunkene Glocken', 'drowned-bells', 14, 1.9, { damageFraction: .16, flatDamage: 0, armorPierce: 1, slow: { factor: .55, duration: 3 }, dot: { fraction: .025, duration: 5, interval: 1 } }),
  ] },
  thorn_abbess: { name: 'Äbtissin der Dornen', color: '#bad28b', abilities: [
    ability('rose_cross', 'Rosendom', 'rose-cross', 9, 1.6, { damageFraction: .25, flatDamage: 12, armorPierce: .8, slow: { factor: .7, duration: 2 } }),
    ability('thorn_blooms', 'Hungrige Blüten', 'thorn-blooms', 15, 2, { damageFraction: .16, flatDamage: 0, armorPierce: 1 }, { adds: { fromPhase: 0, count: 3, hp: 340, lifetime: 12 } }),
  ] },
  chronar: { name: 'Chronar', color: '#c9b1e3', abilities: [
    ability('clock_hand', 'Zeiger der falschen Stunde', 'clock-hand', 9, 1.5, { damageFraction: .24, flatDamage: 18, armorPierce: .75, push: { distance: 65 }, slow: { factor: .65, duration: 2 } }),
    ability('rewind_path', 'Rücklauf', 'rewind-path', 13, 1.8, { damageFraction: .21, flatDamage: 0, armorPierce: 1, push: { distance: 90 }, slow: { factor: .6, duration: 2.5 } }),
  ] },
  skadi: { name: 'Skadi', color: '#b6e3ef', abilities: [
    ability('glacier_lanes', 'Gletscherlanzen', 'glacier-lanes', 9, 1.7, { damageFraction: .23, flatDamage: 20, armorPierce: .8, slow: { factor: .5, duration: 3 } }),
    ability('whiteout', 'Weißer Sturm', 'whiteout', 14, 2.1, { damageFraction: .29, flatDamage: 0, armorPierce: 1, push: { distance: 60 } }),
  ] },
  storm_king: { name: 'Azhur', color: '#e1c992', abilities: [
    ability('storm_cleaver', 'Sturmschneide', 'storm-cleaver', 10, 2, { damageFraction: .38, flatDamage: 45, armorPierce: .8, push: { distance: 125 } }, { targetRole: 'tank' }),
    ability('storm_eye', 'Auge des Sturms', 'storm-eye', 18, 2.3, { damageFraction: .09, flatDamage: 0, armorPierce: 1, dot: { fraction: .025, duration: 6, interval: 1 } }),
  ] },
  night_devourer: { name: 'Velthra', color: '#d594b0', abilities: [
    ability('devouring_gaze', 'Verschlingender Blick', 'devouring-gaze', 10, 2, { damageFraction: .31, flatDamage: 40, armorPierce: .8, healingReduction: { factor: .6, duration: 6 }, slow: { factor: .75, duration: 2 } }, { targetRole: 'tank' }),
    ability('hungry_souls', 'Hungrige Seelen', 'hungry-souls', 18, 2, { damageFraction: .17, flatDamage: 0, armorPierce: 1, dot: { fraction: .025, duration: 5, interval: 1 } }, { adds: { fromPhase: 0, count: 2, hp: 1600, lifetime: 11 }, targetRole: 'healer' }),
  ] },
  world_heart: { name: 'Eon', color: '#e6b2e8', abilities: [
    ability('paired_spectrum', 'Geteiltes Spektrum', 'paired-spectrum', 11, 2.4, { damageFraction: .3, flatDamage: 0, armorPierce: 1, push: { distance: 70 } }),
    ability('prismatic_anchors', 'Prismatische Anker', 'prismatic-anchors', 22, 2.5, { damageFraction: .15, flatDamage: 0, armorPierce: 1 }, { adds: { fromPhase: 0, count: 4, hp: 4800, lifetime: 12 } }),
  ] },
};

export function containsZone(zone, position) {
  if (!zone || !position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const dx = position.x - zone.x, dy = position.y - zone.y, distance = Math.hypot(dx, dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  const shape = zone.shape || 'circle';
  if (shape === 'circle') return distance <= zone.radius + EPSILON;
  if (shape === 'donut') {
    if (distance < zone.innerRadius - EPSILON || distance > zone.radius + EPSILON) return false;
    if (zone.gapArc && Math.abs(angleDifference(Math.atan2(dy, dx), zone.gapAngle || 0)) < zone.gapArc / 2 - EPSILON) return false;
    if (zone.secondGapAngle !== undefined && Math.abs(angleDifference(Math.atan2(dy, dx), zone.secondGapAngle)) < zone.gapArc / 2 - EPSILON) return false;
    return true;
  }
  if (shape === 'sector') return distance <= zone.radius + EPSILON && (distance <= EPSILON || Math.abs(angleDifference(Math.atan2(dy, dx), zone.angle || 0)) <= zone.arc / 2 + EPSILON);
  if (shape === 'line') {
    const angle = zone.angle || 0, along = dx * Math.cos(angle) + dy * Math.sin(angle), across = -dx * Math.sin(angle) + dy * Math.cos(angle);
    return along >= -EPSILON && along <= zone.length + EPSILON && Math.abs(across) <= zone.width / 2 + EPSILON;
  }
  return false;
}

export function createBossEncounter(type, { tier = 1, seed = 826404 } = {}) {
  if (!Object.hasOwn(BOSS_ENCOUNTERS, type)) throw new RangeError(`Unbekannte Bosschoreografie: ${type}`);
  if (!Number.isInteger(tier) || tier < 1 || tier > 30 || !Number.isFinite(seed)) throw new RangeError('Ungültige Bosschoreografie-Stufe oder Saat.');
  return { type, tier, seed: seed >>> 0, serial: 0, startedAt: null, nextCastAt: null, castIndex: 0, phase: 0, pending: null, objectives: {}, dots: [], previousTargets: {}, lastFrame: null, stopped: false };
}

function role(player) {
  if (player.classId === 'guardian') return 'tank';
  if (player.classId === 'druid') return 'healer';
  if (player.classId === 'paladin') return 'hybrid';
  return 'damage';
}
function normalizedPlayers(players) {
  const unique = new Map();
  players.filter(alive).forEach((p, i) => {
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
    const id = String(p.id ?? (players.length === 1 ? 'local' : `anon-${i}`));
    if (!unique.has(id)) unique.set(id, { ...p, id });
  });
  return [...unique.values()].sort((a, b) => a.id.localeCompare(b.id));
}
function selectedTank(boss, players) {
  return players.find(p => p.id === boss.targetId) || players.filter(p => ['tank', 'hybrid'].includes(role(p))).sort((a, b) => Math.hypot(a.x - boss.x, a.y - boss.y) - Math.hypot(b.x - boss.x, b.y - boss.y))[0] || players[0];
}
function selectedHealer(boss, players) {
  return players.find(p => role(p) === 'healer') || players.find(p => role(p) === 'hybrid') || [...players].sort((a, b) => Math.hypot(b.x - boss.x, b.y - boss.y) - Math.hypot(a.x - boss.x, a.y - boss.y))[0];
}
function frameAt(state, current, time) {
  const previous = state.lastFrame;
  if (!previous || current.time <= previous.time || time <= previous.time) return current;
  const ratio = clamp((time - previous.time) / (current.time - previous.time), 0, 1), lerp = (a, b) => a + (b - a) * ratio;
  const boss = { ...current.boss, x: lerp(previous.boss.x, current.boss.x), y: lerp(previous.boss.y, current.boss.y), hp: lerp(previous.boss.hp, current.boss.hp) };
  const oldPlayers = new Map(previous.players.map(p => [p.id, p]));
  const players = current.players.map(p => {
    const old = oldPlayers.get(p.id); if (!old || Math.hypot(old.x - p.x, old.y - p.y) > 500) return p;
    return { ...p, x: lerp(old.x, p.x), y: lerp(old.y, p.y) };
  });
  return { time, boss, players };
}
function geometryFor(state, ability, boss, players, phase) {
  const tank = selectedTank(boss, players), healer = selectedHealer(boss, players), angle = Math.atan2(tank.y - boss.y, tank.x - boss.x);
  const center = { x: boss.x, y: boss.y }, circle = (p, radius) => ({ shape: 'circle', x: p.x, y: p.y, radius });
  const line = (p, direction, length, width) => ({ shape: 'line', x: p.x, y: p.y, angle: direction, length, width });
  const sector = (direction, radius, arc) => ({ shape: 'sector', ...center, angle: direction, radius, arc });
  const ring = (innerRadius, radius, extra = {}) => ({ shape: 'donut', ...center, innerRadius, radius, ...extra });
  const group = [...players].sort((a, b) => (role(a) === 'healer' ? -1 : 0) - (role(b) === 'healer' ? -1 : 0) || a.id.localeCompare(b.id));
  let zones;
  switch (ability.pattern) {
    case 'root-lanes': zones = [-.32, 0, .32].map(offset => line(center, angle + offset, 360 + phase * 35, 40)); break;
    case 'seed-ring': zones = [ring(90 - phase * 5, 225 + phase * 25)]; break;
    case 'rising-tide': zones = [line({ x: boss.x - 260, y: tank.y }, 0, 520, 84 + phase * 8)]; break;
    case 'drowned-bells': zones = group.slice(0, Math.max(1, Math.ceil(players.length / 2))).map(p => circle(p, 72)); break;
    case 'rose-cross': zones = [0, 1, 2, 3].map(i => sector(i * Math.PI / 2 + phase * .13, 265, .48)); break;
    case 'thorn-blooms': zones = [-1, 0, 1].map(i => circle({ x: clamp(boss.x + i * 170, 1150, 1710), y: clamp(boss.y + (i === 0 ? -180 : 130), 110, 1380) }, 72)); break;
    case 'clock-hand': zones = [sector((state.seed % 4 + state.castIndex) * Math.PI / 2, 300, Math.PI / 5 + phase * .06)]; break;
    case 'rewind-path': zones = players.slice(0, 4).map(p => {
      const old = state.previousTargets[p.id] || { x: p.x - 120, y: p.y - 60 }, distance = Math.hypot(p.x - old.x, p.y - old.y);
      return line(old, Math.atan2(p.y - old.y, p.x - old.x), Math.max(140, distance), 64);
    }); break;
    case 'glacier-lanes': zones = (phase === 2 ? [-180, -60, 60, 180] : [-140, 0, 140]).map(offset => line({ x: boss.x + offset, y: boss.y - 320 }, Math.PI / 2, 640, 46)); break;
    case 'whiteout': zones = [ring(85 - phase * 5, 460, { gapAngle: angle, gapArc: Math.PI / 4 })]; break;
    case 'storm-cleaver': zones = [sector(angle, 340, Math.PI / 3)]; break;
    case 'storm-eye': zones = [ring(85, 820)]; break;
    case 'devouring-gaze': zones = [sector(angle, 370, Math.PI / 3)]; break;
    case 'hungry-souls': zones = [circle(healer, 78), ...group.filter(p => p.id !== healer.id && p.id !== tank.id).slice(0, 1 + phase).map(p => circle(p, 70))]; break;
    case 'paired-spectrum': {
      const gapAngle = state.castIndex * Math.PI / 3 + (state.seed % 6) * Math.PI / 3;
      zones = [ring(100, 420, { gapAngle, secondGapAngle: gapAngle + Math.PI, gapArc: Math.PI / 4 })]; break;
    }
    case 'prismatic-anchors': zones = [[-155, -195], [155, -195], [-155, 195], [155, 195]].map(([x, y]) => circle({ x: clamp(boss.x + x, 1150, 1710), y: clamp(boss.y + y, 110, 1380) }, 74)); break;
    default: throw new Error(`Unbekanntes Bossmuster: ${ability.pattern}`);
  }
  const effect = clone(ability.effect), scale = (1 + (state.tier - 1) * .015) * (1 + phase * .08);
  return zones.map(zone => ({ ...zone, ...effect,
    damageFraction: Math.min(.58, roundTime(effect.damageFraction * scale)),
    flatDamage: Math.round((effect.flatDamage || 0) * (1 + (state.tier - 1) * .035)),
    color: BOSS_ENCOUNTERS[state.type].color,
    ...(effect.push ? { push: { ...effect.push, angle: zone.shape === 'line' ? zone.angle : zone.shape === 'sector' ? zone.angle : Math.atan2(tank.y - boss.y, tank.x - boss.x) } } : {}),
  }));
}
function cast(state, ability, frame, time) {
  const phase = frame.boss.hp / frame.boss.maxHp <= .3 ? 2 : frame.boss.hp / frame.boss.maxHp <= .65 ? 1 : 0;
  state.phase = phase;
  const id = `${state.type}:cast-${++state.serial}`, zones = geometryFor(state, ability, frame.boss, frame.players, phase);
  const windup = Math.max(1.2, ability.windup - phase * .08), resolveAt = roundTime(time + windup);
  state.pending = { id, mechanicId: ability.id, name: ability.name, zones, resolveAt, time, phase, adds: ability.adds ? clone(ability.adds) : null, failureIds: [] };
  state.nextCastAt = roundTime(time + Math.max(7, ability.cooldown - phase)); state.castIndex++;
  for (const player of frame.players) state.previousTargets[player.id] = { x: player.x, y: player.y };
  return { kind: 'warning', id, mechanicId: ability.id, name: ability.name, bossType: state.type, time, resolveAt, lockMovementUntil: resolveAt, targetRole: ability.targetRole || null, zones: clone(zones) };
}
function objectiveWarning(state, objectives, time) {
  const id = `${state.type}:cast-${++state.serial}`, resolveAt = roundTime(time + 1.5);
  const name = state.type === 'night_devourer' ? 'Ausbruch der hungrigen Seelen' : 'Überladener Anker';
  const zones = objectives.map(o => ({ shape: 'circle', x: o.x, y: o.y, radius: 86, damageFraction: .2, flatDamage: 0, armorPierce: 1, color: '#dfa18d' }));
  state.pending = { id, mechanicId: 'neglected-objectives', name, zones, resolveAt, time, phase: state.phase, adds: null, failureIds: objectives.map(o => o.id) };
  for (const objective of objectives) objective.exploding = true;
  state.nextCastAt = Math.max(state.nextCastAt, resolveAt + 2);
  return { kind: 'warning', id, mechanicId: 'neglected-objectives', name, bossType: state.type, time, resolveAt, zones: clone(zones) };
}
function spawnObjectives(state, pending, frame, time) {
  if (!pending.adds || pending.phase < pending.adds.fromPhase) return null;
  const existing = Object.values(state.objectives).filter(o => o.alive && o.hp > 0).length;
  const count = Math.min(pending.adds.count, 8 - existing); if (count <= 0) return null;
  const adds = [];
  for (let i = 0; i < count; i++) {
    const zone = pending.zones[i % pending.zones.length];
    const x = zone.shape === 'circle' ? zone.x : clamp(frame.boss.x + (i % 2 ? 170 : -170), 1150, 1710);
    const y = zone.shape === 'circle' ? zone.y : clamp(frame.boss.y + 150, 110, 1380);
    const id = `${state.type}:objective-${state.serial}-${i}`, hp = Math.round(pending.adds.hp * (1 + (state.tier - 1) * .065) * (1 + pending.phase * .18));
    const objective = { id, x, y, hp, maxHp: hp, alive: true, phase: pending.phase, expiresAt: roundTime(time + pending.adds.lifetime), exploding: false };
    state.objectives[id] = objective;
    adds.push({ ...objective, type: 'echo_guard', name: pending.mechanicId === 'prismatic_anchors' ? 'Prismatischer Anker' : pending.mechanicId === 'hungry_souls' ? 'Hungrige Seele' : 'Dornenknospe', role: 'dps-check', bossObjectiveId: id, ownerBossId: frame.boss.id, stationary: true, rewardless: true, level: frame.boss.level || 1, damage: 0, xp: 0, gold: 0 });
  }
  return { kind: 'spawn-adds', bossType: state.type, mechanicId: pending.mechanicId, time, adds };
}

export function updateBossEncounter(state, { boss, players = [], time, dt = 0, allowCasting = true }) {
  if (!state || !Object.hasOwn(BOSS_ENCOUNTERS, state.type) || !boss || !Number.isFinite(time) || !Number.isFinite(dt) || dt < 0 || typeof allowCasting !== 'boolean' || !Array.isArray(players) || !['x', 'y', 'hp', 'maxHp'].every(key => Number.isFinite(boss[key])) || boss.maxHp <= 0) throw new TypeError('Ungültiger Boss-Simulationsschritt.');
  const now = roundTime(time), current = { time: now, boss: { ...boss }, players: normalizedPlayers(players) };
  if (state.lastFrame && now < state.lastFrame.time - EPSILON) throw new RangeError('Bosszeit darf nicht rückwärts laufen.');
  if (boss.alive === false || boss.hp <= 0 || !current.players.length) {
    if (state.stopped) return [];
    state.stopped = true; const ids = Object.keys(state.objectives); state.pending = null; state.objectives = {}; state.dots = [];
    state.lastFrame = clone(current);
    return [{ kind: 'cleanup', bossType: state.type, time: now, objectiveIds: ids }];
  }
  if (state.stopped) return [];
  if (state.startedAt === null) { state.startedAt = roundTime(now - dt); state.nextCastAt = roundTime(state.startedAt + 4); }
  const events = [];
  // Bound catch-up work; ordinary game frames are 40 ms, tests may deliberately
  // advance larger intervals. Every emitted timestamp is its scheduled time.
  for (let iteration = 0; iteration < 128; iteration++) {
    for (const [id, objective] of Object.entries(state.objectives)) if (!objective.alive || objective.hp <= 0) { events.push({ kind: 'despawn-adds', bossType: state.type, time: now, ids: [id] }); delete state.objectives[id]; }
    const expired = Object.values(state.objectives).filter(o => !o.exploding && o.expiresAt <= now + EPSILON);
    const objectiveAt = allowCasting && expired.length && !state.pending ? Math.max(Math.min(...expired.map(o => o.expiresAt)), state.lastFrame?.time ?? state.startedAt) : Infinity;
    const dotAt = state.dots.length ? Math.min(...state.dots.map(dot => dot.nextAt)) : Infinity;
    const impactAt = state.pending?.resolveAt ?? Infinity, castAt = state.pending || !allowCasting ? Infinity : state.nextCastAt;
    const next = Math.min(objectiveAt, dotAt, impactAt, castAt);
    if (next > now + EPSILON || next === Infinity) break;
    const frame = frameAt(state, current, next);
    if (dotAt === next) {
      const due = state.dots.filter(dot => dot.nextAt <= next + EPSILON);
      for (const dot of due) {
        const targets = frame.players.filter(p => dot.targetIds.includes(p.id)).map(p => p.id);
        if (targets.length) events.push({ kind: 'tick', bossType: state.type, mechanicId: dot.mechanicId, id: dot.id, time: next, targetIds: targets, damageFraction: dot.fraction, flatDamage: 0, armorPierce: 1 });
        dot.nextAt = roundTime(dot.nextAt + dot.interval);
      }
      state.dots = state.dots.filter(dot => dot.nextAt <= dot.endsAt + EPSILON);
      continue;
    }
    if (impactAt === next) {
      const pending = state.pending; state.pending = null;
      events.push({ kind: 'impact', id: pending.id, mechanicId: pending.mechanicId, name: pending.name, bossType: state.type, time: next, zones: clone(pending.zones) });
      for (let index = 0; index < pending.zones.length; index++) {
        const zone = pending.zones[index]; if (!zone.dot) continue;
        const targets = frame.players.filter(p => containsZone(zone, p)).map(p => p.id);
        if (targets.length) state.dots.push({ id: `${pending.id}:dot-${index}`, mechanicId: pending.mechanicId, targetIds: targets, fraction: zone.dot.fraction, interval: zone.dot.interval, nextAt: roundTime(next + zone.dot.interval), endsAt: roundTime(next + zone.dot.duration) });
      }
      if (pending.failureIds.length) { events.push({ kind: 'despawn-adds', bossType: state.type, time: next, ids: [...pending.failureIds] }); for (const id of pending.failureIds) delete state.objectives[id]; }
      const spawn = spawnObjectives(state, pending, frame, next); if (spawn) events.push(spawn);
      continue;
    }
    if (objectiveAt === next) { events.push(objectiveWarning(state, expired, next)); continue; }
    const definition = BOSS_ENCOUNTERS[state.type], ability = definition.abilities[state.castIndex % definition.abilities.length];
    events.push(cast(state, ability, frame, next));
  }
  state.lastFrame = clone(current);
  return events;
}

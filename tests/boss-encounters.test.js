import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSS_ENCOUNTERS, createBossEncounter, updateBossEncounter, containsZone } from '../src/boss-encounters.js';

const bossFor = type => ({ id: `${type}:boss`, type, x: 1460, y: 780, hp: 50000, maxHp: 100000, alive: true, level: 100, targetId: 'tank' });
const party = [
  { id: 'tank', classId: 'guardian', x: 1460, y: 950, hp: 1300, maxHp: 1500 },
  { id: 'healer', classId: 'druid', x: 1250, y: 1050, hp: 1200, maxHp: 1300 },
  { id: 'ranger', classId: 'ranger', x: 1630, y: 1050, hp: 1250, maxHp: 1300 },
  { id: 'mage', classId: 'flamecaller', x: 1600, y: 570, hp: 1150, maxHp: 1250 },
];
const clone = value => structuredClone(value);
function run(type, duration, step = .1, players = party, boss = bossFor(type)) {
  const state = createBossEncounter(type, { seed: 5 }), events = [];
  updateBossEncounter(state, { boss, players, time: 0, dt: 0 });
  for (let time = step; time <= duration + 1e-7; time += step) events.push(...updateBossEncounter(state, { boss, players, time: Math.min(duration, time), dt: step }));
  return { state, events };
}

test('eight boss controllers each provide two distinct real geometry patterns and phase thresholds', () => {
  assert.equal(Object.keys(BOSS_ENCOUNTERS).length, 8);
  for (const [type, definition] of Object.entries(BOSS_ENCOUNTERS)) {
    assert.equal(definition.abilities.length, 2); assert.notEqual(definition.abilities[0].pattern, definition.abilities[1].pattern);
    const { events, state } = run(type, 30);
    const attacks = events.filter(e => e.kind === 'warning' && e.mechanicId !== 'neglected-objectives');
    assert.ok(definition.abilities.every(a => attacks.some(e => e.mechanicId === a.id)), type);
    assert.ok(attacks.every(e => e.zones.length && e.zones.every(z => ['circle', 'sector', 'line', 'donut'].includes(z.shape))));
    assert.equal(state.phase, 1, '50% boss HP uses the second phase');
  }
});

test('warning and impact geometries are identical, captured targets do not track after warning, and input actors stay unchanged', () => {
  const boss = bossFor('storm_king'), players = clone(party), original = clone({ boss, players }), state = createBossEncounter('storm_king');
  updateBossEncounter(state, { boss, players, time: 0 });
  const warning = updateBossEncounter(state, { boss, players, time: 4, dt: 4 }).find(e => e.kind === 'warning');
  assert.ok(warning); assert.equal(warning.zones[0].angle, Math.PI / 2); assert.deepEqual({ boss, players }, original);
  players[0].x += 200;
  const impact = updateBossEncounter(state, { boss, players, time: warning.resolveAt + .1, dt: .1 }).find(e => e.kind === 'impact');
  assert.deepEqual(impact.zones, warning.zones);
  assert.equal(containsZone(impact.zones[0], original.players[0]), true);
});

test('circle, sector, line and donut collision agrees with exact visible borders and safe gaps', () => {
  const circle = { shape: 'circle', x: 0, y: 0, radius: 50 };
  assert.equal(containsZone(circle, { x: 50, y: 0 }), true); assert.equal(containsZone(circle, { x: 50.001, y: 0 }), false);
  const sector = { shape: 'sector', x: 0, y: 0, radius: 100, angle: 0, arc: Math.PI / 2 };
  assert.equal(containsZone(sector, { x: 70, y: 70 }), true); assert.equal(containsZone(sector, { x: -5, y: 0 }), false);
  const line = { shape: 'line', x: 0, y: 0, length: 100, width: 20, angle: Math.PI / 2 };
  assert.equal(containsZone(line, { x: 10, y: 50 }), true); assert.equal(containsZone(line, { x: 10.01, y: 50 }), false); assert.equal(containsZone(line, { x: 0, y: -1 }), false);
  const donut = { shape: 'donut', x: 0, y: 0, innerRadius: 30, radius: 100, gapAngle: 0, secondGapAngle: Math.PI, gapArc: Math.PI / 4 };
  assert.equal(containsZone(donut, { x: 0, y: 0 }), false); assert.equal(containsZone(donut, { x: 0, y: 70 }), true); assert.equal(containsZone(donut, { x: 70, y: 0 }), false); assert.equal(containsZone(donut, { x: -70, y: 0 }), false);
  assert.equal(containsZone({ shape: 'invalid' }, { x: 0, y: 0 }), false);
});

test('event choreography is deterministic across frame partitions, including moving-target interpolation', () => {
  for (const type of Object.keys(BOSS_ENCOUNTERS)) {
    assert.deepEqual(run(type, 45, .1).events, run(type, 45, .25).events, `${type}: split-frame event stream`);
  }
  function moving(step) {
    const state = createBossEncounter('root_matron', { seed: 1 }), events = [], boss = bossFor('root_matron');
    updateBossEncounter(state, { boss, players: clone(party), time: 0 });
    for (let t = step; t <= 12 + 1e-7; t += step) events.push(...updateBossEncounter(state, { boss, players: party.map(p => ({ ...p, x: p.x + t * 5 })), time: t, dt: step }));
    return events;
  }
  assert.deepEqual(moving(.1), moving(.25));
});

test('tank and healer attacks choose the intended roles while solo and irregular groups remain valid', () => {
  const storm = run('storm_king', 8).events.find(e => e.kind === 'warning'); assert.equal(storm.targetRole, 'tank'); assert.equal(storm.zones[0].angle, Math.PI / 2);
  const night = run('night_devourer', 30).events.find(e => e.kind === 'warning' && e.mechanicId === 'hungry_souls');
  assert.equal(night.targetRole, 'healer'); assert.equal(night.zones[0].x, party.find(p => p.id === 'healer').x);
  for (const type of Object.keys(BOSS_ENCOUNTERS)) {
    assert.ok(run(type, 30, .1, [party[2]], { ...bossFor(type), targetId: null }).events.some(e => e.kind === 'impact'));
    assert.ok(run(type, 30, .1, [party[0], { ...party[1], hp: 0 }, party[2]]).events.some(e => e.kind === 'impact'));
  }
});

test('spawned DPS objectives have real HP/deadlines, killed objectives do not explode, and neglected objectives always warn first', () => {
  const { state, events } = run('world_heart', 18);
  const spawn = events.find(e => e.kind === 'spawn-adds'); assert.ok(spawn); assert.equal(spawn.adds.length, 4);
  assert.ok(spawn.adds.every(a => a.hp > 0 && a.stationary && a.rewardless && a.expiresAt > spawn.time));
  const first = spawn.adds[0].id; state.objectives[first].alive = false; state.objectives[first].hp = 0;
  const later = updateBossEncounter(state, { boss: bossFor('world_heart'), players: party, time: 38, dt: .1 });
  const warning = later.find(e => e.kind === 'warning' && e.mechanicId === 'neglected-objectives'); assert.ok(warning);
  assert.equal(warning.zones.length, 3); assert.ok(later.some(e => e.kind === 'despawn-adds' && e.ids.includes(first)));
  const impact = later.find(e => e.kind === 'impact' && e.mechanicId === 'neglected-objectives'); assert.ok(impact); assert.deepEqual(impact.zones, warning.zones); assert.ok(impact.time >= warning.resolveAt);
});

test('salt and storm damage-over-time ticks target actual initial victims and stop at their duration', () => {
  const result = run('storm_king', 30, .1, [{ id: 'ranger', classId: 'ranger', x: 1700, y: 1000, hp: 100, maxHp: 1000 }], { ...bossFor('storm_king'), targetId: 'ranger' });
  const impact = result.events.find(e => e.kind === 'impact' && e.mechanicId === 'storm_eye'), ticks = result.events.filter(e => e.kind === 'tick' && e.mechanicId === 'storm_eye');
  assert.ok(impact); assert.equal(ticks.length, 6); assert.ok(ticks.every(e => e.targetIds.includes('ranger') && e.time <= impact.time + 6 + 1e-7));
});

test('dead or absent parties cancel pending damage/objectives and cannot restart an ended encounter', () => {
  const state = createBossEncounter('world_heart'), boss = bossFor('world_heart');
  updateBossEncounter(state, { boss, players: party, time: 0 }); updateBossEncounter(state, { boss, players: party, time: 4, dt: 4 });
  const events = updateBossEncounter(state, { boss: { ...boss, hp: 0 }, players: party, time: 5, dt: 1 }); assert.equal(events[0].kind, 'cleanup'); assert.equal(state.pending, null);
  assert.deepEqual(updateBossEncounter(state, { boss, players: party, time: 20, dt: 15 }), []);
  const empty = createBossEncounter('root_matron'); assert.equal(updateBossEncounter(empty, { boss: bossFor('root_matron'), players: [], time: 0 })[0].kind, 'cleanup');
});

test('phase three and dungeon depth strengthen attacks without reducing the minimum readable windup', () => {
  const base = run('root_matron', 7, .1, party, { ...bossFor('root_matron'), hp: 100000 }).events.find(e => e.kind === 'warning');
  const state = createBossEncounter('root_matron', { tier: 30 }), boss = { ...bossFor('root_matron'), hp: 20000 }; updateBossEncounter(state, { boss, players: party, time: 0 });
  const deep = updateBossEncounter(state, { boss, players: party, time: 4, dt: 4 }).find(e => e.kind === 'warning');
  assert.equal(state.phase, 2); assert.ok(deep.zones[0].damageFraction > base.zones[0].damageFraction); assert.ok(deep.resolveAt - deep.time >= 1.2);
  assert.ok(deep.zones.every(z => z.damageFraction <= .58));
});

test('controller state round-trips through JSON and rejects invalid time/input without mutating actors', () => {
  const { state } = run('chronar', 5); const restored = JSON.parse(JSON.stringify(state)), boss = bossFor('chronar');
  assert.deepEqual(updateBossEncounter(state, { boss, players: party, time: 10, dt: .1 }), updateBossEncounter(restored, { boss, players: party, time: 10, dt: .1 }));
  assert.throws(() => createBossEncounter('unknown'), RangeError); assert.throws(() => createBossEncounter('chronar', { tier: 31 }), RangeError);
  assert.throws(() => updateBossEncounter(state, { boss, players: party, time: 8, dt: .1 }), RangeError);
  assert.throws(() => updateBossEncounter(state, { boss, players: party, time: 11, dt: -1 }), TypeError);
});

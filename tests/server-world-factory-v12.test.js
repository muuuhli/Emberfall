import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../src/game.js';
import { CLASSES } from '../src/classes.js';
import { NPCS } from '../src/catalog.js';
import { createServerGameFactory } from '../server/game-factory.mjs';
import { startDedicatedServer } from '../server/dedicated.mjs';

test('server factory clones the canonical world and preserves all eight fresh class states', () => {
  const random = () => .5, factory = createServerGameFactory({ random });
  for (const profile of CLASSES) {
    const expected = new Game({ storage: null, random }), actual = factory();
    expected.selectClass(profile.id); actual.selectClass(profile.id);
    assert.deepEqual(actual.world, expected.world);
    assert.deepEqual(actual.player, expected.player);
    assert.deepEqual(actual.stats(), expected.stats());
    for (const field of ['inventory', 'resources', 'equipment', 'questState', 'skills', 'learnedAbilities', 'abilityLoadout', 'techniqueSpecializations', 'journey', 'endgame']) assert.deepEqual(actual[field], expected[field]);
    assert.equal(actual.npcs, NPCS, 'Canonical NPC catalogue identity remains unchanged.');
    assert.equal(actual.overworld, actual.world);
  }
});

test('independent cloned rooms never inherit actor, event, foliage or personal mutations', () => {
  const factory = createServerGameFactory(), a = factory(), b = factory();
  assert.notEqual(a.world, b.world); assert.notEqual(a.world.enemies[0], b.world.enemies[0]);
  a.world.enemies[0].hp = 1; a.world.nodes[0].readyAt = 123456; a.world.trees[0].x = -500;
  a.world.worldEvents[0].participants.push('one-room-only'); a.world.interactions[0].used = true;
  a.inventory.heal_potion = 900; a.resources.wood = 99;
  const c = factory();
  assert.deepEqual(b.world, c.world);
  assert.deepEqual(b.inventory, c.inventory); assert.deepEqual(b.resources, c.resources);
  a.initialize(); assert.deepEqual(a.world, c.world); assert.deepEqual(a.inventory, c.inventory);
});

test('cached initialization resets saved mutable state exactly like ordinary initialization', () => {
  const random = () => .5, ordinary = new Game({ storage: null, random }), factory = createServerGameFactory({ random });
  ordinary.selectClass('druid'); ordinary.gainXp(600); ordinary.resources.wood = 17;
  ordinary.player.gold = 321; ordinary.world.enemies[0].hp = 1; ordinary.world.interactions[0].used = true;
  const saved = structuredClone(ordinary.capture()), expected = new Game({ storage: null, random }), actual = factory();
  expected.applySave(structuredClone(saved)); actual.applySave(structuredClone(saved));
  assert.deepEqual(actual.world, expected.world); assert.deepEqual(actual.player, expected.player);
  assert.deepEqual(actual.resources, expected.resources); assert.deepEqual(actual.stats(), expected.stats());
});

test('dedicated cached factory preserves account character identity, shared room progress and restart', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emberfall-world-factory-v12-'));
  const env = { HOST: '127.0.0.1', EMBERFALL_DATA_DIR: directory }; let server;
  try {
    server = await startDedicatedServer({ env, port: 0, autoTick: false });
    const request = async (route, body, cookie = '') => {
      const response = await fetch(server.origin + route, { headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
      assert.ok(response.ok); return { data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
    };
    const guest = await request('/api/rooms', { playerName: 'Factory guest', classId: 'guardian' });
    const account = await request('/api/account/register', { username: 'factory_restart', password: 'test-only-factory-password', classId: 'druid' });
    const member = server.hub.accountMembers.get(account.data.account.id), guestMember = server.hub.sessions.get(guest.data.token);
    assert.notEqual(member.game.world, guestMember.game.world);
    member.game.gainXp(600); member.game.resources.wood = 37; member.game.player.gold = 432;
    guestMember.game.world.enemies[0].hp = 1;
    const id = member.id, level = member.game.player.level, privateEnemyHp = member.game.world.enemies[0].hp;
    assert.equal(server.hub.persist(), true); await server.close(); server = null;
    server = await startDedicatedServer({ env, port: 0, autoTick: false });
    const restored = server.hub.accountMembers.get(account.data.account.id), resumed = (await request('/api/account', undefined, account.cookie)).data;
    assert.equal(resumed.account.id, account.data.account.id); assert.equal(restored.id, id);
    assert.equal(restored.game.player.level, level); assert.equal(restored.game.player.gold, 432); assert.equal(restored.game.resources.wood, 37);
    assert.equal(restored.game.world.enemies[0].hp, privateEnemyHp);
    assert.equal(server.hub.sessions.get(guest.data.token).game.world.enemies[0].hp, 1);
  } finally { await server?.close(); await fs.rm(directory, { recursive: true, force: true }); }
});

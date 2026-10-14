import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { startDedicatedServer } from '../../server/dedicated.mjs';
import { CLASSES } from '../../src/classes.js';

// Real, isolated HTTP/cookie/SSE workload. No remote target or injected progress.
// Account and guild setup are excluded from the sample; driver and authority
// share one process. This is a server-cost probe, not a human raid/playtime test.
if (process.argv.length > 2) throw new Error('This bounded probe accepts no arguments or remote URL.');
const PLAYERS = 8, WARMUP_MS = 5000, SAMPLE_MS = 20000;
const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'emberfall-social-performance-v16-'));
const env = { HOST: '127.0.0.1', PORT: '4173', EMBERFALL_DATA_DIR: directory, EMBERFALL_MAX_ROOMS: '2' };
const clients = [], streams = [], timers = [], works = new Set(), sent = new Map();
const ticks = [], persistence = [], commands = [], chatRtt = [], chatDelivery = [];
const histogram = monitorEventLoopDelay({ resolution: 10 });
let running, measuring = false, stopping = false, failed = null, peakRss = 0, peakHeap = 0, skippedInputs = 0;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const round = value => +value.toFixed(3);
const distribution = values => {
  const ordered = [...values].sort((a, b) => a - b);
  const at = p => ordered.length ? round(ordered[Math.max(0, Math.ceil(p * ordered.length) - 1)]) : null;
  return { samples: ordered.length, p50Ms: at(.5), p95Ms: at(.95), maxMs: at(1) };
};
const sampleMemory = () => { const m = process.memoryUsage(); peakRss = Math.max(peakRss, m.rss); peakHeap = Math.max(peakHeap, m.heapUsed); };
async function request(route, body, client) {
  assert.equal(new URL(running.origin).hostname, '127.0.0.1');
  const response = await fetch(running.origin + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(client?.cookie ? { Cookie: client.cookie } : {}), ...(client?.playerId ? { 'X-Emberfall-Player-Id': client.playerId } : {}), ...(client?.accountId ? { 'X-Emberfall-Account-Id': client.accountId } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
  });
  assert.ok(response.ok, `Local probe HTTP ${response.status} at ${route.replace(/[A-F0-9]{8}/g, 'ROOM')}`);
  if (client && response.headers.has('set-cookie')) client.cookie = response.headers.get('set-cookie').split(';')[0];
  return response.json();
}
function openStream(route, client, kind) {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const state = { controller, kind, packets: 0, bytes: 0, gaps: [], last: null, seen: new Set(), initial: false };
    const deadline = setTimeout(() => { controller.abort(); reject(new Error('Initial stream timeout.')); }, 10000);
    streams.push(state);
    state.work = (async () => {
      try {
        const response = await fetch(running.origin + route, { headers: { Cookie: client.cookie }, signal: controller.signal });
        assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/event-stream/);
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        for (;;) {
          const { value, done } = await reader.read(); if (done) { if (!stopping) throw new Error('Stream ended early.'); break; }
          buffer += decoder.decode(value, { stream: true }); assert.ok(buffer.length < 8 * 1024 * 1024);
          for (;;) {
            const index = buffer.indexOf('\n\n'); if (index < 0) break;
            const block = buffer.slice(0, index); buffer = buffer.slice(index + 2);
            const line = block.split('\n').find(line => line.startsWith('data: ')); if (!line) continue;
            const packet = JSON.parse(line.slice(6));
            if (!state.initial) { state.initial = true; clearTimeout(deadline); resolve(state); }
            if (measuring) {
              const now = performance.now(); state.packets++; state.bytes += Buffer.byteLength(block + '\n\n');
              if (kind === 'game') { if (state.last !== null) state.gaps.push(now - state.last); state.last = now; }
              else for (const message of packet.guild?.messages || []) {
                if (sent.has(message.text) && !state.seen.has(message.text)) { state.seen.add(message.text); chatDelivery.push(now - sent.get(message.text)); }
              }
            }
          }
        }
      } catch (error) { if (!stopping) { failed ??= error; clearTimeout(deadline); reject(error); } }
    })();
  });
}
const progress = snapshot => ({ id: snapshot.playerId, classId: snapshot.classId, level: snapshot.player.level, gold: snapshot.player.gold, skillPoints: snapshot.player.skillPoints, x: snapshot.player.x, y: snapshot.player.y, equipment: snapshot.equipment, inventory: snapshot.inventory, skills: Object.fromEntries(Object.entries(snapshot.skills).filter(([, rank]) => rank > 0)), professions: snapshot.professions, professionTraining: snapshot.professionTraining });
const socialProgress = snapshot => ({ friends: snapshot.friends.map(contact => contact.accountId ?? contact.id).sort(), guildId: snapshot.guild?.id, members: snapshot.guild?.members.map(member => ({ accountId: member.accountId ?? member.id, role: member.role })).sort((a, b) => a.accountId.localeCompare(b.accountId)), messages: snapshot.guild?.messages });

try {
  running = await startDedicatedServer({ env, port: 0, autoTick: true });
  const started = performance.now();
  for (let i = 0; i < PLAYERS; i++) {
    const client = { index: i, cookie: '', accountId: '', playerId: '', inFlight: false };
    const account = await request('/api/account/register', { username: `social_probe_${i + 1}`, playerName: `Social Probe ${i + 1}`, password: randomBytes(24).toString('base64url'), classId: CLASSES[i].id }, client);
    client.accountId = account.account.id; clients.push(client);
  }
  const created = await request('/api/account/social', { action: 'guild_create', guildName: 'Native Social Probe' }, clients[0]);
  const guildId = created.snapshot.guild.id;
  for (const client of clients.slice(1)) {
    await request('/api/account/social', { action: 'guild_invite', username: `social_probe_${client.index + 1}` }, clients[0]);
    await request('/api/account/social', { action: 'guild_accept', guildId }, client);
  }
  const leader = await request('/api/account/rooms', { name: 'Native Social Probe' }, clients[0]);
  clients[0].playerId = leader.playerId;
  await openStream(`/api/account/play/events?deltas=1&playerId=${leader.playerId}`, clients[0], 'game');
  for (const client of clients.slice(1)) {
    const joined = await request('/api/account/social/join', { accountId: clients[0].accountId }, client);
    assert.equal(joined.roomCode, leader.roomCode); client.playerId = joined.playerId;
    await openStream(`/api/account/play/events?deltas=1&playerId=${joined.playerId}`, client, 'game');
  }
  await Promise.all(clients.map(client => openStream(`/api/account/social/events?accountId=${encodeURIComponent(client.accountId)}`, client, 'social')));
  // Spend the real two starting talent points, so restart preservation checks
  // earned ranks as well as empty state. Missing/unlearned zero ranks are
  // equivalent when the legacy save reader expands the complete talent map.
  for (const client of clients) {
    const talent = CLASSES[client.index].talents.find(t => t.minLevel === 1 && !t.requires && t.cost <= 2);
    assert.ok(talent);
    const learned = await request('/api/account/play/command', { type: 'method', name: 'learn', args: [talent.id] }, client);
    assert.equal(learned.accepted, true);
    assert.equal((await request('/api/account/play', undefined, client)).skills[talent.id], 1);
  }
  const tick = running.hub.tick.bind(running.hub), persist = running.hub.persist.bind(running.hub);
  running.hub.tick = (...args) => { const at = performance.now(); try { return tick(...args); } finally { if (measuring) ticks.push(performance.now() - at); } };
  running.hub.persist = (...args) => { const at = performance.now(); try { return persist(...args); } finally { if (measuring) persistence.push(performance.now() - at); } };
  const movementStarted = performance.now();
  for (const client of clients) timers.push(setInterval(() => {
    if (stopping) return; if (client.inFlight) { if (measuring) skippedInputs++; return; }
    client.inFlight = true;
    const direction = (Math.floor((performance.now() - movementStarted) / 700) + client.index) % 4, at = performance.now(), sampled = measuring;
    const work = request('/api/account/play/command', { type: 'input', keys: [['d'], ['s'], ['a'], ['w']][direction], angle: direction * Math.PI / 2 }, client)
      .then(data => { assert.equal(data.accepted, true); if (sampled && measuring) commands.push(performance.now() - at); })
      .catch(error => { failed ??= error; }).finally(() => { client.inFlight = false; works.delete(work); });
    works.add(work);
  }, 75));
  await sleep(WARMUP_MS); if (failed) throw failed;
  const preparationMs = performance.now() - started;
  let messageNumber = 0;
  const sendChat = () => {
    const client = clients[messageNumber % clients.length], text = `Leistungsprobe Nachricht ${++messageNumber}`, at = performance.now(); sent.set(text, at);
    const work = request('/api/account/social', { action: 'guild_chat', text }, client)
      .then(data => { assert.equal(data.ok, true); if (measuring) chatRtt.push(performance.now() - at); })
      .catch(error => { failed ??= error; }).finally(() => works.delete(work)); works.add(work);
  };
  measuring = true; histogram.enable(); histogram.reset(); sampleMemory();
  const sampleStarted = performance.now(), cpuStarted = process.cpuUsage();
  timers.push(setInterval(sampleMemory, 100)); sendChat(); timers.push(setInterval(sendChat, 2000));
  await sleep(SAMPLE_MS);
  const actualMs = performance.now() - sampleStarted, cpu = process.cpuUsage(cpuStarted); measuring = false; histogram.disable(); sampleMemory();
  for (const timer of timers) clearInterval(timer); await Promise.allSettled([...works]); if (failed) throw failed;
  assert.equal(chatRtt.length, sent.size); assert.equal(chatDelivery.length, sent.size * PLAYERS);
  assert.ok(ticks.length > 0 && streams.every(stream => stream.initial && stream.packets > 0));
  await Promise.all(clients.map(client => request('/api/account/play/command', { type: 'input', keys: [], angle: 0 }, client)));
  clearInterval(running.hub.timer); running.hub.timer = null;
  const before = await Promise.all(clients.map(async client => ({ progress: progress(await request('/api/account/play', undefined, client)), social: socialProgress(await request('/api/account/social', undefined, client)) })));
  stopping = true; for (const stream of streams) stream.controller.abort(); await Promise.allSettled(streams.map(stream => stream.work));
  await running.close(); running = await startDedicatedServer({ env, port: 0, autoTick: false });
  const after = await Promise.all(clients.map(async client => ({ progress: progress(await request('/api/account/play', undefined, client)), social: socialProgress(await request('/api/account/social', undefined, client)) })));
  assert.deepEqual(after, before);
  console.log(JSON.stringify({ probe: 'isolated-native-social-http-sse-v16', node: process.version, platform: process.platform, players: PLAYERS, guilds: 1, warmupSeconds: WARMUP_MS / 1000, sampleSeconds: round(actualMs / 1000), preparationMs: round(preparationMs), scope: 'driver-and-authority-one-process; authenticated accounts; no remote target; setup excluded; no injected character stats', tick: distribution(ticks), commandRtt: distribution(commands), chatRtt: distribution(chatRtt), chatDelivery: distribution(chatDelivery), persistence: distribution(persistence), cpuCorePercent: round((cpu.user + cpu.system) / 1000 / actualMs * 100), peakRssMiB: round(peakRss / 1048576), peakHeapMiB: round(peakHeap / 1048576), eventLoopP95Ms: round(histogram.percentile(95) / 1e6), gameSseGap: distribution(streams.filter(s => s.kind === 'game').flatMap(s => s.gaps)), gamePackets: streams.filter(s => s.kind === 'game').reduce((n, s) => n + s.packets, 0), socialPackets: streams.filter(s => s.kind === 'social').reduce((n, s) => n + s.packets, 0), socialKiBPerSecond: round(streams.filter(s => s.kind === 'social').reduce((n, s) => n + s.bytes, 0) / 1024 / (actualMs / 1000)), sentMessages: sent.size, expectedDeliveries: sent.size * PLAYERS, skippedInputs, cookiesAndProgressRestartVerified: true, guildRosterAndHistoryRestartVerified: true, budgets: { tickP95Ms: 40, commandRttP95Ms: 100, gameSseGapP95Ms: 160, rssMiB: 768 } }));
} finally {
  measuring = false; stopping = true; histogram.disable(); for (const timer of timers) clearInterval(timer);
  for (const stream of streams) stream.controller.abort(); await Promise.allSettled(streams.map(stream => stream.work));
  await Promise.allSettled([...works]); await running?.close(); await fs.rm(directory, { recursive: true, force: true });
}

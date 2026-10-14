import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { startDedicatedServer } from '../../server/dedicated.mjs';
import { CLASSES } from '../../src/classes.js';

// Isolated native HTTP/SSE probe. There is deliberately no remote-URL option.
// The driver and server share a process; CPU/RSS include both, unlike tick time.
const options = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const argument = process.argv[i];
  if (argument === '--help') {
    console.log('node tests/scripts/hosting-performance-v12.mjs --players 2|4|8 --rooms 1|2 --seconds 20 --warmup 5 [--account-burst]');
    process.exit(0);
  }
  const match = argument.match(/^--(players|rooms|seconds|warmup|account-burst)(?:=(.*))?$/);
  if (!match || options.has(match[1])) throw new RangeError('Unknown or duplicate benchmark argument.');
  if (match[1] === 'account-burst') {
    const value = match[2] ?? (['true', 'false'].includes(process.argv[i + 1]) ? process.argv[++i] : 'true');
    if (!['true', 'false'].includes(value)) throw new RangeError('account-burst must be true or false.');
    options.set(match[1], value);
  } else options.set(match[1], match[2] ?? process.argv[++i]);
}
const players = Number(options.get('players') ?? 2);
const rooms = Number(options.get('rooms') ?? 1);
const seconds = Number(options.get('seconds') ?? 20);
const warmup = Number(options.get('warmup') ?? 5);
const accountBurst = options.get('account-burst') === 'true';
if (![2, 4, 8].includes(players) || ![1, 2].includes(rooms) || players % rooms || !Number.isInteger(seconds) || seconds < 1 || seconds > 60 || !Number.isInteger(warmup) || warmup < 0 || warmup > 15) {
  throw new RangeError('Bounded probe required: total players 2/4/8, rooms 1/2, seconds 1–60, warmup 0–15.');
}
if (accountBurst && seconds < 12) throw new RangeError('The account burst requires at least twelve measurement seconds.');

const INPUT_INTERVAL_MS = 75;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const rounded = value => Number.isFinite(value) ? +value.toFixed(3) : null;
const quantile = (values, fraction) => {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
};
const distribution = values => ({ samples: values.length, p50Ms: rounded(quantile(values, .5)), p95Ms: rounded(quantile(values, .95)), maxMs: values.length ? rounded(Math.max(...values)) : null });
const privateDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'emberfall-hosting-performance-v12-'));
const environment = { HOST: '127.0.0.1', PORT: '4173', EMBERFALL_DATA_DIR: privateDirectory, EMBERFALL_MAX_ROOMS: '2' };
const agent = new http.Agent({ keepAlive: true, maxSockets: players * 3 + 2 });
const requests = new Set();
const streams = [];
const clients = [];
const commands = new Set();
const intervals = [];
const histogram = monitorEventLoopDelay({ resolution: 10 });
const authHistogram = accountBurst ? monitorEventLoopDelay({ resolution: 10 }) : null;
const auth = { registrations: [], logins: [], kdfs: [], gameConstructionTimes: [], persistTimes: [], tickTimes: [], commandTimes: [], sseGaps: [], fixtures: [], running: false, kdfActive: 0, maxConcurrentKdfs: 0, completed: false };
let running, memoryTimer, checkpointTimer, authTimer, authWork, measuring = false, stopping = false, failed = null;
let tickTimes = [], persistTimes = [], commandTimes = [], tickGaps = [], lastMeasuredTick = null;
let peakRss = 0, peakHeap = 0, peakCgroupMemory = 0, skippedCommands = 0;

async function cgroupNumber(filename) {
  try { const text = (await fs.readFile(`/sys/fs/cgroup/${filename}`, 'utf8')).trim(); return text === 'max' ? null : Number(text); }
  catch { return null; }
}
async function cgroupStats() {
  try { return Object.fromEntries((await fs.readFile('/sys/fs/cgroup/cpu.stat', 'utf8')).trim().split('\n').map(line => { const [key, value] = line.split(/\s+/); return [key, Number(value)]; })); }
  catch { return null; }
}
async function cgroupCpuLimit() {
  try { const [quota, period] = (await fs.readFile('/sys/fs/cgroup/cpu.max', 'utf8')).trim().split(/\s+/); return quota === 'max' ? null : Number(quota) / Number(period); }
  catch { return null; }
}
function sampleMemory() {
  const usage = process.memoryUsage();
  peakRss = Math.max(peakRss, usage.rss); peakHeap = Math.max(peakHeap, usage.heapUsed);
}
function request(route, body, { cookie = '', includeMeta = false, timeoutMs = 5000 } = {}) {
  const origin = running.origin;
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body);
    const req = http.request(origin + route, { agent, method: payload === null ? 'GET' : 'POST', headers: { ...(payload === null ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }), ...(cookie ? { Cookie: cookie } : {}) } }, res => {
      let text = '', size = 0;
      res.setEncoding('utf8');
      res.on('data', chunk => {
        size += Buffer.byteLength(chunk); if (size > 8 * 1024 * 1024) { req.destroy(new Error('Probe response exceeded its bound.')); return; }
        text += chunk;
      });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) { reject(new Error(`Native probe request failed with HTTP ${res.statusCode}.`)); return; }
        try { const data = JSON.parse(text); resolve(includeMeta ? { data, status: res.statusCode, cookie: res.headers['set-cookie']?.[0]?.split(';')[0] ?? '' } : data); }
        catch { reject(new Error('Native probe returned invalid JSON.')); }
      });
    });
    requests.add(req); req.on('close', () => requests.delete(req)); req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('Native probe request timed out.')));
    req.end(payload);
  });
}
function openStream(client) {
  return new Promise((resolve, reject) => {
    const stream = { initial: false, bytes: 0, snapshots: 0, deltas: 0, gaps: [], lastAt: null, sequence: -1, errors: 0 };
    const req = http.get(`${running.origin}/api/session/${client.token}/events?deltas=1`, { agent }, res => {
      if (res.statusCode !== 200 || !res.headers['content-type']?.startsWith('text/event-stream')) { res.resume(); reject(new Error('Native probe could not open its event stream.')); return; }
      let buffer = ''; res.setEncoding('utf8');
      const fail = error => { stream.errors++; failed ??= error; reject(error); req.destroy(); };
      res.on('data', chunk => {
        buffer += chunk;
        if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) { fail(new Error('Native probe event buffer exceeded its bound.')); return; }
        for (;;) {
          const end = buffer.indexOf('\n\n'); if (end < 0) break;
          const block = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const data = block.split('\n').find(line => line.startsWith('data: ')); if (!data) continue;
          let packet;
          try { packet = JSON.parse(data.slice(6)); } catch { fail(new Error('Native probe received an invalid event.')); return; }
          if (packet.protocol !== 1 || !Number.isSafeInteger(packet.sequence) || packet.sequence < stream.sequence || packet.snapshotDelta === 1 && packet.baseSequence !== stream.sequence) { fail(new Error('Native probe event sequence diverged.')); return; }
          stream.sequence = packet.sequence;
          if (!stream.initial) {
            if (packet.snapshotDelta !== undefined || packet.playerId !== client.playerId || !packet.layout) { fail(new Error('Native probe initial state was incomplete.')); return; }
            stream.initial = true; clearTimeout(stream.timeout); resolve(stream); continue;
          }
          if (measuring) {
            const at = performance.now();
            if (stream.lastAt !== null) {
              const gap = at - stream.lastAt; stream.gaps.push(gap);
              if (auth.running) auth.sseGaps.push(gap);
            }
            stream.lastAt = at; stream.bytes += Buffer.byteLength(block + '\n\n'); stream.snapshots++;
            if (packet.snapshotDelta === 1) stream.deltas++;
          }
        }
      });
      res.on('error', error => { if (!stopping) fail(error); });
      res.on('end', () => { if (!stopping) fail(new Error('Native probe event stream ended early.')); });
    });
    stream.req = req; streams.push(stream); requests.add(req);
    req.on('close', () => requests.delete(req)); req.on('error', error => { if (!stopping) { failed ??= error; reject(error); } });
    stream.timeout = setTimeout(() => { req.destroy(); reject(new Error('Native probe initial event timed out.')); }, 5000);
  });
}
function instrumentHub() {
  const hub = running.hub, tick = hub.tick.bind(hub), persist = hub.persist.bind(hub);
  hub.tick = (...args) => {
    const start = performance.now();
    try { return tick(...args); }
    finally {
      if (measuring) {
        const elapsed = performance.now() - start; tickTimes.push(elapsed);
        if (auth.running) auth.tickTimes.push(elapsed);
        if (lastMeasuredTick !== null) tickGaps.push(start - lastMeasuredTick);
        lastMeasuredTick = start;
      }
    }
  };
  hub.persist = (...args) => {
    const start = performance.now();
    try { return persist(...args); }
    finally {
      if (measuring) {
        const elapsed = performance.now() - start; persistTimes.push(elapsed);
        if (auth.running) auth.persistTimes.push(elapsed);
      }
    }
  };
  if (accountBurst) {
    if (!hub.accounts?._hash) throw new Error('The account burst requires an account-capable release image.');
    const hash = hub.accounts._hash.bind(hub.accounts);
    hub.accounts._hash = async (...args) => {
      const at = performance.now(); auth.kdfActive++; auth.maxConcurrentKdfs = Math.max(auth.maxConcurrentKdfs, auth.kdfActive);
      try { return await hash(...args); }
      finally { auth.kdfActive--; if (measuring) auth.kdfs.push(performance.now() - at); }
    };
    const createGame = hub.createGame.bind(hub);
    hub.createGame = (...args) => {
      const at = performance.now();
      try { return createGame(...args); }
      finally { if (measuring && auth.running) auth.gameConstructionTimes.push(performance.now() - at); }
    };
  }
}
function compactPlayer(snapshot) {
  const p = snapshot.player;
  return { id: snapshot.playerId, classId: p.classId, level: p.level, gold: p.gold, x: p.x, y: p.y };
}
async function runAccountBurst(sampleStarted) {
  const at = performance.now(), cpu = process.cpuUsage();
  auth.startedAfterMs = at - sampleStarted; auth.running = true; authHistogram.enable(); authHistogram.reset();
  try {
    const fixtures = [0, 1].map(index => ({ username: `performance_account_${index + 1}`, password: randomBytes(24).toString('base64url'), playerName: `Kontoprobe ${index + 1}`, classId: CLASSES[index].id }));
    const registerStarted = performance.now();
    await Promise.all(fixtures.map(async fixture => {
      const started = performance.now(), response = await request('/api/account/register', fixture, { includeMeta: true, timeoutMs: 40000 });
      auth.registrations.push(performance.now() - started);
      assert.equal(response.status, 201); assert.ok(response.cookie); assert.equal(response.data.privateWorld, true);
      auth.fixtures.push({ credentials: fixture, accountId: response.data.account.id, cookie: response.cookie });
    }));
    auth.registrationPhaseMs = performance.now() - registerStarted;
    const loginStarted = performance.now();
    await Promise.all(auth.fixtures.map(async fixture => {
      const started = performance.now(), response = await request('/api/account/login', { username: fixture.credentials.username, password: fixture.credentials.password }, { includeMeta: true, timeoutMs: 40000 });
      auth.logins.push(performance.now() - started);
      assert.equal(response.status, 200); assert.equal(response.data.account.id, fixture.accountId); assert.ok(response.cookie);
      fixture.cookie = response.cookie;
      // Registration/login alone must not simulate the private home world.
      const member = running.hub.accountMembers.get(fixture.accountId);
      assert.equal(member.active, false); assert.equal(member.room.accountHome, true);
      delete fixture.credentials.password;
    }));
    auth.loginPhaseMs = performance.now() - loginStarted;
    assert.equal(running.hub.accounts.runningKdfs, 0); assert.equal(running.hub.accounts.records.size, 2);
    auth.completed = true;
  } finally {
    auth.durationMs = performance.now() - at;
    const usage = process.cpuUsage(cpu); auth.cpuCorePercent = (usage.user + usage.system) / 1000 / auth.durationMs * 100;
    auth.running = false; authHistogram.disable();
  }
}

try {
  running = await startDedicatedServer({ env: environment, port: 0, autoTick: true }); instrumentHub();
  assert.equal((await request('/healthz')).status, 'ready');
  const started = performance.now();
  for (let room = 0; room < rooms; room++) {
    let code;
    for (let index = 0; index < players / rooms; index++) {
      const number = clients.length;
      const created = await request(index ? `/api/rooms/${code}/join` : '/api/rooms', { name: 'Isolierte Leistungsprobe', playerName: `Probe ${number + 1}`, classId: CLASSES[number].id });
      code = created.roomCode;
      clients.push({ token: created.token, playerId: created.playerId, roomCode: code, initial: compactPlayer(created.snapshot), inFlight: false });
    }
  }
  await Promise.all(clients.map(openStream));
  const inputStarted = performance.now();
  for (const [index, client] of clients.entries()) {
    const send = () => {
      if (stopping) return;
      if (client.inFlight) { if (measuring) skippedCommands++; return; }
      const direction = (Math.floor((performance.now() - inputStarted) / 700) + index) % 4;
      const input = { type: 'input', keys: [['d'], ['s'], ['a'], ['w']][direction], angle: direction * Math.PI / 2 };
      const at = performance.now(), sampled = measuring; client.inFlight = true;
      const work = request(`/api/session/${client.token}/command`, input).then(response => {
        if (response.accepted !== true) throw new Error('Native probe movement was rejected.');
        if (sampled && measuring) {
          const elapsed = performance.now() - at; commandTimes.push(elapsed);
          if (auth.running) auth.commandTimes.push(elapsed);
        }
      }).catch(error => { failed ??= error; }).finally(() => { client.inFlight = false; commands.delete(work); });
      commands.add(work);
    };
    send(); intervals.push(setInterval(send, INPUT_INTERVAL_MS));
  }
  await sleep(warmup * 1000);
  if (failed) throw failed;
  const preparationMs = performance.now() - started;
  const quota = await cgroupCpuLimit(), memoryLimit = await cgroupNumber('memory.max'), cgroupBefore = await cgroupStats();
  const hostLoadStart = os.loadavg();
  histogram.enable(); histogram.reset(); sampleMemory();
  const sampleStarted = performance.now(), cpuStarted = process.cpuUsage(); measuring = true;
  memoryTimer = setInterval(() => { sampleMemory(); }, 100);
  // The real synchronous atomic storage path is included, without touching saves
  // outside this mkdtemp. Automatic ten-second checkpoints also remain enabled.
  checkpointTimer = setTimeout(() => { if (measuring) running.hub.persist(); }, Math.floor(seconds * 500));
  if (accountBurst) authTimer = setTimeout(() => { authWork = runAccountBurst(sampleStarted).catch(error => { failed ??= error; }); }, 5000);
  await sleep(seconds * 1000);
  const actualMs = performance.now() - sampleStarted, cpu = process.cpuUsage(cpuStarted); measuring = false;
  clearInterval(memoryTimer); clearTimeout(checkpointTimer); clearTimeout(authTimer); histogram.disable(); sampleMemory();
  const cgroupAfter = await cgroupStats(); peakCgroupMemory = await cgroupNumber('memory.peak') ?? 0;
  if (accountBurst && !auth.completed) throw new Error('The account burst did not complete within the measured window.');
  if (failed) throw failed;
  assert.ok(tickTimes.length > 0 && commandTimes.length > 0 && streams.every(stream => stream.snapshots > 0 && stream.errors === 0), 'Native probe produced insufficient samples.');
  stopping = true; for (const timer of intervals) clearInterval(timer);
  await Promise.allSettled([...commands]);
  // Stop movement through the normal authority API, then freeze the disposable
  // clock before comparing its persistent restart. No HP/position edits occur.
  await Promise.all(clients.map(client => request(`/api/session/${client.token}/command`, { type: 'input', keys: [], angle: 0 })));
  clearInterval(running.hub.timer); running.hub.timer = null;
  const beforeRestart = await Promise.all(clients.map(async client => compactPlayer(await request(`/api/session/${client.token}`))));
  const accountsBeforeRestart = await Promise.all(auth.fixtures.map(fixture => request('/api/account', undefined, { cookie: fixture.cookie })));
  const distanceMoved = beforeRestart.reduce((sum, player, index) => sum + Math.hypot(player.x - clients[index].initial.x, player.y - clients[index].initial.y), 0);
  for (const stream of streams) { clearTimeout(stream.timeout); stream.req.destroy(); }
  await running.close(); running = null;
  const restartAt = performance.now();
  running = await startDedicatedServer({ env: environment, port: 0, autoTick: false });
  const restored = await Promise.all(clients.map(async client => compactPlayer(await request(`/api/session/${client.token}`))));
  assert.deepEqual(restored, beforeRestart, 'Disposable native player state changed across restart.');
  const accountsRestored = await Promise.all(auth.fixtures.map(fixture => request('/api/account', undefined, { cookie: fixture.cookie })));
  assert.deepEqual(accountsRestored, accountsBeforeRestart, 'Disposable account record or cookie changed across restart.');
  for (const fixture of auth.fixtures) {
    assert.equal(running.hub.accounts.records.get(fixture.accountId)?.username, fixture.credentials.username);
    assert.equal(running.hub.accountMembers.get(fixture.accountId)?.active, false);
  }
  const restartMs = performance.now() - restartAt;
  const bytes = streams.reduce((sum, stream) => sum + stream.bytes, 0), packets = streams.reduce((sum, stream) => sum + stream.snapshots, 0);
  console.log(JSON.stringify({
    probe: 'isolated-native-http-sse-v12', scenario: 'overworld-moving', node: process.version, platform: process.platform,
    rooms, players, warmupSeconds: warmup, targetSampleSeconds: seconds, actualSampleSeconds: rounded(actualMs / 1000), inputIntervalMs: INPUT_INTERVAL_MS,
    scope: 'driver-and-authority-one-process; no remote target; initial states and warmup excluded',
    cpuCorePercent: rounded((cpu.user + cpu.system) / 1000 / actualMs * 100), cpuMs: rounded((cpu.user + cpu.system) / 1000),
    peakRssMiB: rounded(peakRss / 1048576), peakHeapMiB: rounded(peakHeap / 1048576), peakCgroupMemoryMiB: peakCgroupMemory ? rounded(peakCgroupMemory / 1048576) : null,
    cgroupCpuCores: quota, cgroupMemoryLimitMiB: memoryLimit ? rounded(memoryLimit / 1048576) : null,
    cgroupThrottledPeriods: cgroupAfter && cgroupBefore ? cgroupAfter.nr_throttled - cgroupBefore.nr_throttled : null,
    cgroupThrottledMs: cgroupAfter && cgroupBefore ? rounded((cgroupAfter.throttled_usec - cgroupBefore.throttled_usec) / 1000) : null,
    hostLoadStart, hostLoadEnd: os.loadavg(), tick: distribution(tickTimes), tickInterval: distribution(tickGaps), commandRtt: distribution(commandTimes),
    eventLoop: { resolutionMs: 10, p50Ms: rounded(histogram.percentile(50) / 1e6), p95Ms: rounded(histogram.percentile(95) / 1e6), maxMs: rounded(histogram.max / 1e6) },
    ...(accountBurst ? { authentication: {
      enabled: true, registrations: distribution(auth.registrations), logins: distribution(auth.logins), kdf: distribution(auth.kdfs), maxConcurrentKdfs: auth.maxConcurrentKdfs,
      startedAfterMs: rounded(auth.startedAfterMs), registrationPhaseMs: rounded(auth.registrationPhaseMs), loginPhaseMs: rounded(auth.loginPhaseMs), durationMs: rounded(auth.durationMs), cpuCorePercent: rounded(auth.cpuCorePercent),
      gameConstruction: distribution(auth.gameConstructionTimes), persistence: distribution(auth.persistTimes),
      duringBurst: { tick: distribution(auth.tickTimes), commandRtt: distribution(auth.commandTimes), sseGap: distribution(auth.sseGaps), eventLoopP95Ms: rounded(authHistogram.percentile(95) / 1e6), eventLoopMaxMs: rounded(authHistogram.max / 1e6) },
      completedInsideSample: true, accountRecordsRestored: auth.fixtures.length, cookiesResumeVerified: true, accountWorldsStayedInactive: true,
    } } : {}),
    persistence: { ...distribution(persistTimes), includesExplicitCheckpoint: true },
    transport: { snapshots: packets, deltas: streams.reduce((sum, stream) => sum + stream.deltas, 0), rawKiBPerSecond: rounded(bytes / 1024 / (actualMs / 1000)), meanPacketKiB: rounded(bytes / Math.max(1, packets) / 1024), gap: distribution(streams.flatMap(stream => stream.gaps)), perClientSnapshots: streams.map(stream => stream.snapshots), skippedInputs: skippedCommands },
    fixture: { preparationMs: rounded(preparationMs), displacementSumPixels: rounded(distanceMoved), persistentRestartVerified: true, restartMs: rounded(restartMs) },
    budgets: { tickMs: 40, nominalSnapshotGapMs: 80, sseGapP95Ms: 160, commandRttP95Ms: 100, rssMiB: 768 },
  }));
} finally {
  measuring = false; stopping = true; histogram.disable();
  authHistogram?.disable(); clearInterval(memoryTimer); clearTimeout(checkpointTimer); clearTimeout(authTimer); for (const timer of intervals) clearInterval(timer);
  for (const stream of streams) { clearTimeout(stream.timeout); stream.req.destroy(); }
  for (const req of requests) req.destroy();
  await Promise.allSettled([...commands]);
  await authWork;
  // A failed client request can finish before its asynchronous server KDF.
  // Drain those owned jobs before deleting their private storage directory.
  const drainStarted = performance.now();
  while (running?.hub.accounts?.runningKdfs > 0 && performance.now() - drainStarted < 40000) await sleep(20);
  await running?.close(); agent.destroy();
  await fs.rm(privateDirectory, { recursive: true, force: true });
}

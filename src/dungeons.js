// Authored instanced dungeons. Puzzles and cooperative seals are simulation data,
// independent of canvas rendering and network transport.
export const DUNGEONS = [
  { id: 'wurzelgewoelbe', name: 'Wurzelgewölbe', subtitle: 'Der Eid unter der Kornwacht', minLevel: 12, level: 15, partyRequired: 1, boss: 'root_matron', color: '#7f9e65', entrance: { x: 4740, y: 970 }, puzzles: ['sequence'], symbols: ['mond', 'blatt', 'glut'], hint: 'Mond lässt das Blatt wachsen. Das Blatt nährt die Glut. Berühre die Runen in dieser Reihenfolge.' },
  { id: 'salzarchiv', name: 'Salzarchiv', subtitle: 'Die Bibliothek der Ertrunkenen', minLevel: 25, level: 30, partyRequired: 1, boss: 'drowned_archon', color: '#8cb5bf', entrance: { x: 11140, y: 970 }, puzzles: ['crate'], hint: 'Die Fracht gehört auf die östliche Waage. Stelle dich westlich der Kiste und schiebe sie vier Schritte. Das Rückstellrad hilft bei Fehlern.' },
  { id: 'dornenkloster', name: 'Dornenkloster', subtitle: 'Der Garten ohne Frühling', minLevel: 36, level: 42, partyRequired: 1, boss: 'thorn_abbess', color: '#a2b779', entrance: { x: 14340, y: 970 }, puzzles: ['light'], hint: 'Drehe die drei Linsen: die erste nach Osten, die zweite nach Süden, die dritte nach Westen. Das Licht nährt den stillen Garten.' },
  { id: 'uhrwerk', name: 'Zerbrochenes Uhrwerk', subtitle: 'Die Stunde ohne Ende', minLevel: 50, level: 55, partyRequired: 1, boss: 'chronar', color: '#baa5d9', entrance: { x: 15800, y: 4100 }, puzzles: ['switches'], hint: 'Die erste Kette trägt den Tag, die dritte trägt die Nacht. Die zweite ruht. Nur Hebel eins und drei müssen leuchten.' },
  { id: 'frostkathedrale', name: 'Frostkathedrale', subtitle: 'Die zweite Strophe des Winters', minLevel: 60, level: 65, partyRequired: 1, boss: 'skadi', color: '#b3ddea', entrance: { x: 9400, y: 4100 }, puzzles: ['sequence', 'light'], symbols: ['mond', 'frost', 'stern'], hint: 'Sivs Lied lautet Mond, Frost, Stern. Danach richte die Linsen Ost, Süd, West. Beide Erinnerungen öffnen den Chor.' },
  { id: 'sturmzitadelle', name: 'Sturmzitadelle', subtitle: 'Drei Hände gegen den Wind', minLevel: 70, level: 75, partyRequired: 3, raid: true, boss: 'storm_king', color: '#d2bc88', entrance: { x: 3000, y: 4100 }, puzzles: ['pressure'], hint: 'Drei lebende Gefährten müssen drei Bodenzeichen gleichzeitig zwei Sekunden halten. Im Kampf brechen dieselben drei Stimmen den Sturmschild.' },
  { id: 'nachtschlund', name: 'Nachtschlund', subtitle: 'Der Hunger hinter dem Krieg', minLevel: 85, level: 90, partyRequired: 4, raid: true, boss: 'night_devourer', color: '#cb8c98', entrance: { x: 9400, y: 8100 }, puzzles: ['light', 'pressure'], hint: 'Drei Linsen: Ost, Süd, West. Danach vier Gefährten auf vier Siegeln. Im Kampf halten drei die Schilde, während der vierte den Blick des Verschlingers lenkt.' },
  { id: 'weltenkern', name: 'Weltenkern', subtitle: 'Acht Stimmen für eine neue Welt', minLevel: 95, level: 100, partyRequired: 8, raid: true, boss: 'world_heart', color: '#e2a5e7', entrance: { x: 9600, y: 12400 }, puzzles: ['pressure'], hint: 'Acht Reisende halten acht verschiedene Zeichen gleichzeitig. Im Kampf benötigen die vier Quellsiegel vier Gefährten; andere bewahren Heilung und Aufmerksamkeit.' },
];

const bosses = [
  ['root_matron', 'Die Wurzelmutter', 15, '#97ad76', 4600, 39, 1],
  ['drowned_archon', 'Der Ertrunkene Archont', 30, '#8cbfc8', 9200, 71, 1],
  ['thorn_abbess', 'Äbtissin der Dornen', 42, '#b1c47f', 14600, 95, 1],
  ['chronar', 'Chronar, Hüter der falschen Stunde', 55, '#cbb2e9', 24000, 125, 1],
  ['skadi', 'Skadi, Herz des Winters', 65, '#bbe8f0', 35000, 151, 1],
  ['storm_king', 'Azhur, König des leeren Himmels', 75, '#d9c994', 125000, 205, 3],
  ['night_devourer', 'Velthra, der Nachtverschlinger', 90, '#d792a9', 245000, 255, 4],
  ['world_heart', 'Eon, der gefallene Weltenkern', 100, '#ebafe9', 850000, 310, 8],
];
export const DUNGEON_ENEMIES = Object.fromEntries(bosses.map(([id, name, level, color, hp, damage, minPlayers]) => [id, {
  name, level, color, hp, damage, speed: 40 + level * .35, range: 210, boss: true, minPlayers,
  xp: level * level * 32, gold: level * 110, dropTable: minPlayers > 1 ? 'raid' : 'dungeon',
  ...(minPlayers===1 ? {
    // Solo bosses answer a real ranged opening without outrunning the hero.
    // Their next warning selects a health phase; live warnings never change.
    combat:{pattern:'ring',windup:1.35,recovery:1.4,projectileCount:8,projectileSpeed:175,
      projectileRange:600,attackRange:450,spread:Math.PI*2,preferredRange:160,
      aggroRange:420,leashRange:600,telegraphRadius:85},
    combatPhases:[
      {belowHp:1,pattern:'ring',windup:1.35,recovery:1.4,projectileCount:8,projectileSpeed:175,spread:Math.PI*2},
      {belowHp:.65,pattern:'fan',windup:1.3,recovery:1.3,projectileCount:5,projectileSpeed:260,spread:1.1},
      {belowHp:.3,pattern:'hex',windup:1.4,recovery:1.4,telegraphRadius:85},
    ],
  } : {}),
  mechanics: minPlayers > 1 ? {
    shield: { plates: minPlayers === 8 ? 4 : 3, holdSeconds: 2, vulnerableSeconds: 9, requiresDistinctPlayers: true },
    stack: { minPlayers: minPlayers === 8 ? 4 : 2, radius: 100, windup: 2.2, damage: damage * 1.6 },
    spread: { radius: 78, windup: 1.7, damage: damage * 1.25 },
    enrageSeconds: minPlayers === 8 ? 780 : 540,
    reviveRequired: true,
    description: 'Gemeinsame Siegel brechen den Schild. Beim Sternfall sammeln, vor der Nova verteilen. Gefallene müssen von Verbündeten wiederbelebt werden.',
  } : {
    phases: [{ belowHp: 1, telegraph: 'ring', windup: 1.35 }, { belowHp: .65, telegraph: 'fan', windup: 1.3 }, { belowHp: .3, telegraph: 'mark', windup: 1.4 }],
    description: 'Ein gelockter Geschossring eröffnet den Kampf. Bei 65 Prozent Leben folgt ein gezielter Fächer, bei 30 Prozent wird deine letzte Position markiert. Verlasse die vollständigen Warnungen vor dem Einschlag.',
  },
}]));
DUNGEON_ENEMIES.echo_guard = { name: 'Siegelwächter', hp: 650, damage: 56, speed: 69, range: 40, xp: 3400, gold: 110, color: '#a0a4bd', level: 40, boss: false, dropTable: 'dungeon' };

export const DUNGEON_AFFIXES = [
  { id: 'fractured', name: 'Zerklüftet', minTier: 4, color: '#d68ba4', description: 'Alle 18 Kampfsekunden reißen unter lebenden Reisenden Spalten auf. Nach 1,6 Sekunden explodieren die markierten Flächen.' },
  { id: 'echoing', name: 'Widerhall', minTier: 8, color: '#aeb0e6', description: 'Alle 26 Kampfsekunden ruft der Boss zwei Echos. Höchstens sechs Echos können zugleich leben; besiegte Echos lassen reguläre Beute zurück.' },
];

export function dungeonTierRewards(definition, tier) {
  const boss = DUNGEON_ENEMIES[definition.boss], rewardMultiplier = 1 + (tier - 1) * .18;
  return {
    completionXp: Math.round(boss.xp * rewardMultiplier),
    completionGold: Math.round(boss.gold * (tier - 1) * .08),
    dust: tier > 1 ? (tier - 1) * 2 : 0,
    raidSigils: definition.raid ? 1 + Math.floor((tier - 1) / 5) : 0,
  };
}

const copy = value => JSON.parse(JSON.stringify(value));
const alive = p => p && p.alive !== false && !p.downed && !p.dead && (p.hp == null || p.hp > 0);
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function randomFor(seed) {
  return () => { seed = (seed | 0) + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function wall(id, x, y, w, h, blocking = true) { return { id, type: 'dungeon_wall', name: 'Altes Mauerwerk', x, y, w, h, blocking, collision: { x, y, w, h } }; }
function enemy(type, id, x, y, tier, level) {
  const definition = DUNGEON_ENEMIES[type], healthMultiplier = 1 + (tier - 1) * .38;
  const damageMultiplier = 1 + (tier - 1) * .075, rewardMultiplier = 1 + (tier - 1) * .18;
  const hp = Math.round(definition.hp * healthMultiplier * (definition.boss ? 1 : .5 + level / 40));
  // The same guard appears at levels 15 through 100. Keep its level-40 budget
  // while avoiding stronger guards than the first boss and trivial late echoes.
  const baseDamage=definition.boss?definition.damage:Math.round(definition.damage*(.4+level*.015));
  return { id, type, x, y, homeX: x, homeY: y, hp, maxHp: hp, level, tier, healthMultiplier, damageMultiplier,
    damage: Math.round(baseDamage * damageMultiplier), xp: Math.round(definition.xp * rewardMultiplier), gold: Math.round(definition.gold * rewardMultiplier),
    lootLevel: Math.min(100, level + Math.floor((tier - 1) / 2)), lootTier: tier,
    boss: definition.boss, alive: true, attackTimer: 0, phase: 'idle', respawnAt: 0, shielded: definition.minPlayers > 1, mechanics: copy(definition.mechanics || {}), dungeon: true };
}

export function validateDungeonEchoes(savedEnemies, id, tier) {
  const definition = DUNGEONS.find(d => d.id === id);
  if (!definition || !Number.isInteger(tier) || tier < 1 || tier > 30 || !Array.isArray(savedEnemies)) throw new TypeError('Ungültige gespeicherte Echowelle.');
  const pattern = new RegExp(`^${id}:affix-echo-([1-9][0-9]{0,5})-([01])$`), ids = new Set();
  const echoes = savedEnemies.filter(e => e?.affixEcho === true || typeof e?.id === 'string' && e.id.startsWith(`${id}:affix-echo-`));
  if (echoes.length > 6 || echoes.length && tier < 8) throw new RangeError('Die Echowelle passt nicht zu dieser Dungeontiefe.');
  for (const saved of echoes) {
    if (!pattern.test(saved.id) || saved.affixEcho !== true || saved.type !== 'echo_guard' || saved.level !== definition.level || ids.has(saved.id) || typeof saved.alive !== 'boolean') throw new TypeError('Ungültiger Echogegner.');
    ids.add(saved.id);
    const trusted = enemy('echo_guard', saved.id, 1400, 800, tier, definition.level);
    if (!Number.isFinite(saved.hp) || saved.hp < 0 || saved.hp > trusted.maxHp || !Number.isFinite(saved.x) || saved.x < 30 || saved.x > 1770 || !Number.isFinite(saved.y) || saved.y < 30 || saved.y > 1470) throw new RangeError('Der Echogegner überschreitet seine Kampfwerte oder Kartengrenzen.');
  }
  return true;
}

export function restoreDungeonEchoes(instance, savedEnemies) {
  validateDungeonEchoes(savedEnemies, instance.id, instance.tier);
  const echoes = savedEnemies.filter(e => e.affixEcho === true && e.alive && e.hp > 0);
  instance.world.enemies = instance.world.enemies.filter(e => !e.affixEcho);
  for (const saved of echoes) {
    // Damage, reward values, maximum HP and loot are reconstructed, never imported.
    const echo = enemy('echo_guard', saved.id, saved.x, saved.y, instance.tier, instance.definition.level);
    echo.hp = saved.hp; echo.affixEcho = true; echo.aggro = true;
    instance.world.enemies.push(echo);
    const wave = Number(saved.id.match(/:affix-echo-([0-9]+)-/)[1]);
    instance.affixState.wave = Math.max(instance.affixState.wave, wave);
  }
  return echoes.length;
}

export function createDungeon(id, { tier = 1, seed = 826404, partySize = 1 } = {}) {
  const definition = DUNGEONS.find(d => d.id === id);
  if (!definition) throw new RangeError(`Unbekannter Dungeon: ${id}`);
  if (!Number.isFinite(tier) || tier < 1 || tier > 30 || Math.floor(tier) !== tier) throw new RangeError('Dungeonstufe muss eine ganze Zahl von 1 bis 30 sein.');
  if (!Number.isFinite(seed)) throw new TypeError('Der Dungeon benötigt eine endliche Saat.');
  const rng = randomFor(seed + DUNGEONS.indexOf(definition) * 971);
  const world = {
    seed, width: 1800, height: 1500, isDungeon: true, dungeonId: id, tier,
    regions: [{ id, name: definition.name, subtitle: definition.subtitle, x: 0, y: 0, w: 1800, h: 1500, color: definition.color, ground: '#343644', level: definition.level }],
    rooms: [
      { id: 'entry', name: 'Die stille Schwelle', x: 40, y: 40, w: 500, h: 670, color: '#38454a', intensity: .1 },
      { id: 'memory', name: 'Kammer der Erinnerung', x: 570, y: 40, w: 490, h: 670, color: '#42434f', intensity: .2 },
      { id: 'watch', name: 'Wacht vor dem Tor', x: 40, y: 740, w: 1020, h: 720, color: '#403d4d', intensity: .65 },
      { id: 'boss', name: definition.subtitle, x: 1110, y: 40, w: 650, h: 1420, color: '#493f50', intensity: 1 },
    ],
    structures: [wall('wall-n', 0, 0, 1800, 32), wall('wall-s', 0, 1468, 1800, 32), wall('wall-w', 0, 0, 32, 1500), wall('wall-e', 1768, 0, 32, 1500), wall('wall-memory-n', 540, 32, 28, 268), wall('wall-memory-s', 540, 460, 28, 250), wall('wall-watch-w', 32, 710, 318, 28), wall('wall-watch-e', 510, 710, 558, 28), wall('wall-boss-n', 1068, 32, 36, 748), wall('wall-boss-s', 1068, 1030, 36, 438), { ...wall(`${id}:gate`, 1068, 780, 36, 250), type: 'dungeon_gate', name: 'Tor der Erinnerung', open: false }],
    paths: [{ width: 90, points: [[220, 320], [420, 380], [750, 380], [750, 600], [420, 600], [420, 900], [1460, 900]] }],
    river: [], bridges: [], trees: [], rocks: [], plots: [], npcs: [], landmarks: [], nodes: [], enemies: [], chests: [], shrines: [], puzzleObjects: [],
  };
  const instance = { id, definition: copy(definition), tier, partySize, seed, world, spawn: { x: 220, y: 320 }, exit: { id: `${id}:exit`, x: 160, y: 240, name: 'Zurück zur offenen Welt' }, puzzles: [], elapsed: 0, bossTime: 0, bossEngaged: false, bossDefeated: false, gateOpened: false, eventLog: [], shieldHold: 0, vulnerabilityUntil: 0,
    affixes: DUNGEON_AFFIXES.filter(a => tier >= a.minTier).map(copy), affixState: { nextRiftAt: 18, nextEchoAt: 26, rifts: [], wave: 0, riftSerial: 0 }, rewards: dungeonTierRewards(definition, tier) };
  world.dungeonExit = instance.exit;
  world.shrines.push({ id: `${id}:rest`, x: 215, y: 1080, name: 'Ruhestätte der Reisenden', region: id });
  world.puzzleObjects.push({ id: `${id}:inscription`, kind: 'inscription', x: 420, y: 320, label: 'Inschrift lesen', text: definition.hint, active: false });
  definition.puzzles.forEach((type, number) => {
    const puzzle = { id: `${id}:puzzle-${number}`, type, solved: false, progress: 0, hold: 0, objects: [], history: [], hint: definition.hint };
    const add = object => { object.puzzle = puzzle.id; puzzle.objects.push(object.id); world.puzzleObjects.push(object); return object; };
    if (type === 'sequence') {
      puzzle.sequence = definition.symbols;
      // Physical order differs from the inscription, encouraging players to read it.
      [...definition.symbols].reverse().forEach((symbol, i) => add({ id: `${puzzle.id}:${symbol}`, kind: 'rune', symbol, label: `${({ mond: 'Mond', blatt: 'Blatt', glut: 'Glut', frost: 'Frost', stern: 'Stern' })[symbol]}rune berühren`, x: 650 + i * 135, y: 260, active: false }));
    }
    if (type === 'crate') {
      puzzle.step = 60; puzzle.goal = { x: 900, y: 380 };
      const crate = add({ id: `${puzzle.id}:crate`, kind: 'crate', label: 'Frachtkiste schieben', x: 660, y: 380, startX: 660, startY: 380, active: false });
      world.structures.push({ ...wall(crate.id, crate.x - 20, crate.y - 20, 40, 40), type: 'puzzle_crate', puzzle: puzzle.id });
      add({ id: `${puzzle.id}:goal`, kind: 'crate_plate', x: puzzle.goal.x, y: puzzle.goal.y, label: 'Frachtwaage', active: false });
      add({ id: `${puzzle.id}:reset`, kind: 'reset', x: 690, y: 520, label: 'Fracht zurückstellen', active: false });
      add({ id: `${puzzle.id}:undo`, kind: 'undo', x: 870, y: 520, label: 'Letzten Schub zurücknehmen', active: false });
    }
    if (type === 'light') {
      puzzle.targetRotations = [0, 1, 2];
      puzzle.targetRotations.forEach((targetRotation, i) => add({ id: `${puzzle.id}:lens-${i}`, kind: 'lens', x: 650 + i * 135, y: number ? 520 : 320, rotation: 3, targetRotation, label: `Linse ${i + 1} drehen · Ost/Süd/West/Nord`, active: false }));
    }
    if (type === 'switches') {
      puzzle.pattern = [true, false, true];
      puzzle.pattern.forEach((target, i) => add({ id: `${puzzle.id}:switch-${i}`, kind: 'switch', x: 650 + i * 135, y: 320, index: i, label: `Hebel ${i + 1} umlegen`, active: false }));
    }
    if (type === 'pressure') {
      puzzle.groupRequired = definition.partyRequired; puzzle.holdSeconds = 2;
      for (let i = 0; i < puzzle.groupRequired; i++) add({ id: `${puzzle.id}:plate-${i}`, kind: 'plate', x: 600 + i % 4 * 120, y: 990 + Math.floor(i / 4) * 120, radius: 33, label: `Siegel ${i + 1} gemeinsam halten`, active: false });
    }
    instance.puzzles.push(puzzle);
  });
  const guardSpots = [[325, 560], [460, 630], [700, 610], [900, 620], [450, 1090], [710, 1290], [940, 1180]];
  guardSpots.forEach(([x, y], i) => world.enemies.push(enemy('echo_guard', `${id}:guard-${i}`, x + rng() * 18 - 9, y + rng() * 18 - 9, tier, definition.level)));
  const boss = enemy(definition.boss, `${id}:boss`, 1470, 780, tier, definition.level);
  world.enemies.push(boss);
  world.chests.push({ id: `${id}:cache`, x: 850, y: 1300, level: definition.level, tier, lootTier: tier, lootLevel: Math.min(100, definition.minLevel + Math.floor((tier - 1) / 2)), opened: false, lootTable: 'dungeon' });
  world.chests.push({ id: `${id}:reward`, x: 1490, y: 1250, level: definition.level, tier, lootTier: tier, lootLevel: Math.min(100, definition.minLevel + Math.floor((tier - 1) / 2)), rewards: { dust: tier > 1 ? tier * 2 : 0, raidSigil: definition.raid && tier > 1 ? Math.floor(tier / 5) : 0 }, opened: false, locked: true, requiresBoss: boss.id, lootTable: definition.raid ? 'raid' : 'dungeon' });
  [['herb', 220, 590], ['ore', 620, 620], ['crystal', 940, 560], ['crystal', 200, 1270]].forEach(([type, x, y], i) => world.nodes.push({ id: `${id}:node-${i}`, type, x, y, readyAt: 0, level: definition.level }));
  if (definition.raid) {
    const count = DUNGEON_ENEMIES[definition.boss].mechanics.shield.plates;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + i * Math.PI * 2 / count;
      world.puzzleObjects.push({ id: `${id}:boss-plate-${i}`, kind: 'boss_plate', x: 1460 + Math.cos(angle) * 215, y: 780 + Math.sin(angle) * 300, radius: 34, active: false, label: `Quellsiegel ${i + 1} · Schild brechen` });
    }
  }
  return instance;
}

function completePuzzle(instance, puzzle) {
  if (puzzle.solved) return { success: true, message: 'Diese Erinnerung ist bereits gelöst.', event: null, target: instance.id };
  puzzle.solved = true;
  instance.world.puzzleObjects.filter(o => o.puzzle === puzzle.id && !['undo', 'reset'].includes(o.kind)).forEach(o => { o.active = true; });
  const allSolved = instance.puzzles.every(p => p.solved);
  if (allSolved) {
    const gate = instance.world.structures.find(s => s.id === `${instance.id}:gate`);
    gate.open = true; gate.blocking = false; instance.gateOpened = true;
  }
  const result = { success: true, message: allSolved ? 'Die Erinnerung antwortet. Das Tor zum Boss öffnet sich.' : 'Eine Erinnerung ist gelöst. Die nächste wartet noch.', event: allSolved ? 'puzzle' : 'puzzle-step', target: instance.id, puzzle: puzzle.id, openGate: allSolved };
  instance.eventLog.push({ event: result.event, target: result.target, time: instance.elapsed });
  return result;
}
function syncCrate(instance, object) {
  const structure = instance.world.structures.find(s => s.id === object.id);
  structure.x = object.x - 20; structure.y = object.y - 20;
  structure.collision = { x: structure.x, y: structure.y, w: 40, h: 40 };
}
function blocked(instance, x, y, ignoreId) {
  return instance.world.structures.some(s => {
    if (!s.blocking || s.id === ignoreId) return false;
    const c = s.collision;
    return x + 21 > c.x && x - 21 < c.x + c.w && y + 21 > c.y && y - 21 < c.y + c.h;
  });
}

export function interactPuzzle(instance, objectId, players = [], time = instance.elapsed) {
  const object = instance.world.puzzleObjects.find(o => o.id === objectId);
  const failure = message => ({ success: false, message, event: null, target: instance.id });
  if (!object) return failure('Diese Erinnerung existiert nicht.');
  const player = players.find(p => alive(p) && distance(p, object) <= 95);
  if (!player) return failure('Gehe näher an die Erinnerung heran.');
  if (object.kind === 'inscription') return { success: true, message: object.text, event: null, target: instance.id };
  if (object.kind === 'boss_plate') return { success: true, message: 'Haltet alle Quellsiegel mit verschiedenen Gefährten zwei Sekunden. Der Schild öffnet sich neun Sekunden.', event: null, target: instance.id };
  const puzzle = instance.puzzles.find(p => p.id === object.puzzle);
  if (!puzzle) return failure('Das Zeichen gehört zu keiner Erinnerung.');
  if (puzzle.solved) return { success: true, message: 'Diese Erinnerung ist bereits gelöst.', event: null, target: instance.id };
  if (puzzle.type === 'sequence') {
    if (object.symbol !== puzzle.sequence[puzzle.progress]) {
      puzzle.progress = 0;
      instance.world.puzzleObjects.filter(o => o.puzzle === puzzle.id).forEach(o => { o.active = false; });
      return failure('Die falsche Note lässt alle Runen erlöschen. Lies die Inschrift und beginne erneut.');
    }
    object.active = true; puzzle.progress++;
    if (puzzle.progress === puzzle.sequence.length) return completePuzzle(instance, puzzle);
    return { success: true, message: `Die Rune antwortet · ${puzzle.progress}/${puzzle.sequence.length}`, event: null, target: instance.id };
  }
  if (puzzle.type === 'switches') {
    object.active = !object.active;
    const objects = puzzle.objects.map(id => instance.world.puzzleObjects.find(o => o.id === id));
    if (objects.every((o, i) => o.active === puzzle.pattern[i])) return completePuzzle(instance, puzzle);
    return { success: true, message: `Hebel ${object.index + 1} ${object.active ? 'gespannt' : 'ruht'}. Die erste und dritte Kette müssen tragen.`, event: null, target: instance.id };
  }
  if (puzzle.type === 'light') {
    object.rotation = (object.rotation + 1) % 4; object.active = object.rotation === object.targetRotation;
    const objects = puzzle.objects.map(id => instance.world.puzzleObjects.find(o => o.id === id));
    if (objects.every(o => o.rotation === o.targetRotation)) return completePuzzle(instance, puzzle);
    return { success: true, message: `Linse zeigt nach ${['Osten', 'Süden', 'Westen', 'Norden'][object.rotation]}. Gesucht: Ost, Süd, West.`, event: null, target: instance.id };
  }
  if (puzzle.type === 'crate') {
    const crate = instance.world.puzzleObjects.find(o => o.puzzle === puzzle.id && o.kind === 'crate');
    if (object.kind === 'reset' || object.kind === 'undo') {
      const previous = object.kind === 'undo' ? puzzle.history.pop() : { x: crate.startX, y: crate.startY };
      if (!previous) return failure('Es gibt noch keinen Schub zum Zurücknehmen.');
      crate.x = previous.x; crate.y = previous.y;
      if (object.kind === 'reset') puzzle.history = [];
      syncCrate(instance, crate);
      return { success: true, message: object.kind === 'undo' ? 'Der letzte Schub ist zurückgenommen.' : 'Die Fracht steht wieder am Anfang.', event: null, target: instance.id };
    }
    if (object.kind !== 'crate') return { success: true, message: 'Die Fracht muss auf dieser Waage ruhen. Stelle dich hinter die Kiste und schiebe.', event: null, target: instance.id };
    const dx = crate.x - player.x, dy = crate.y - player.y;
    if (Math.hypot(dx, dy) < 25) return failure('Stelle dich an eine Seite der Kiste.');
    const next = Math.abs(dx) >= Math.abs(dy) ? { x: crate.x + Math.sign(dx) * puzzle.step, y: crate.y } : { x: crate.x, y: crate.y + Math.sign(dy) * puzzle.step };
    if (blocked(instance, next.x, next.y, crate.id) || players.some(p => p !== player && alive(p) && distance(p, next) < 40)) return failure('Die Fracht stößt an ein Hindernis. Mit dem Rückstellrad kannst du neu beginnen.');
    puzzle.history.push({ x: crate.x, y: crate.y }); crate.x = next.x; crate.y = next.y; syncCrate(instance, crate);
    if (distance(crate, puzzle.goal) < 5) return completePuzzle(instance, puzzle);
    return { success: true, message: 'Die Kiste gleitet einen Schritt weiter.', event: null, target: instance.id };
  }
  return { success: true, message: `${puzzle.groupRequired} lebende Gefährten müssen verschiedene Siegel gleichzeitig zwei Sekunden halten.`, event: null, target: instance.id };
}

// Bipartite matching enforces one distinct living human per seal, even if two
// circles happen to overlap. A downed person or repeated player id never counts.
function sealOccupants(objects, players) {
  const humans = [...new Map(players.filter(alive).map((p, i) => [String(p.id ?? p.playerId ?? `position-${i}`), p])).values()];
  const matched = new Map();
  function assign(objectIndex, visited) {
    for (let i = 0; i < humans.length; i++) {
      if (visited.has(i) || distance(humans[i], objects[objectIndex]) > (objects[objectIndex].radius || 33)) continue;
      visited.add(i);
      if (!matched.has(i) || assign(matched.get(i), visited)) { matched.set(i, objectIndex); return true; }
    }
    return false;
  }
  objects.forEach((o, i) => { o.active = assign(i, new Set()); });
  const occupied = new Set(matched.values()); objects.forEach((o, i) => { o.active = occupied.has(i); });
  return { count: matched.size, humans: humans.length, full: matched.size === objects.length };
}

export function updateDungeon(instance, dt, players = []) {
  if (!Number.isFinite(dt) || dt < 0) throw new RangeError('Die Dungeonzeit muss vorwärts laufen.');
  const step = Math.min(dt, .25); instance.elapsed += step;
  // Summoned echoes are encounter actors, never persistent respawn locations.
  // Their drops have already moved into Game.drops when they die.
  instance.world.enemies = instance.world.enemies.filter(e => !e.affixEcho || e.alive);
  const events = [];
  for (const puzzle of instance.puzzles) {
    if (puzzle.type !== 'pressure' || puzzle.solved) continue;
    const objects = instance.world.puzzleObjects.filter(o => o.puzzle === puzzle.id && o.kind === 'plate');
    const occupancy = sealOccupants(objects, players);
    puzzle.hold = occupancy.full && occupancy.humans >= puzzle.groupRequired ? puzzle.hold + step : 0;
    if (puzzle.hold >= puzzle.holdSeconds) events.push(completePuzzle(instance, puzzle));
  }
  const boss = instance.world.enemies.find(e => e.id === `${instance.id}:boss`);
  if (boss.alive && instance.gateOpened && players.some(p => alive(p) && p.x > 1120 && distance(p, boss) < 650)) instance.bossEngaged = true;
  if (boss.alive && instance.bossEngaged) instance.bossTime += step;
  if (!boss.alive && !instance.bossDefeated) {
    instance.bossDefeated = true;
    instance.affixState.rifts = [];
    instance.world.chests.filter(c => c.requiresBoss === boss.id).forEach(c => { c.locked = false; });
    const result = { success: true, event: instance.definition.raid ? 'raid' : 'dungeon', target: instance.id, message: `${instance.definition.name} abgeschlossen. Die Siegestruhe ist geöffnet.`, tier: instance.tier, rewards: copy(instance.rewards) };
    events.push(result); instance.eventLog.push({ event: result.event, target: instance.id, time: instance.elapsed });
    // A raid is also a dungeon completion for generic achievement/reward logic.
    if (instance.definition.raid) events.push({ ...result, event: 'dungeon', message: '' });
  }
  if (boss.alive && instance.definition.raid) {
    const mechanics = DUNGEON_ENEMIES[boss.type].mechanics;
    const objects = instance.world.puzzleObjects.filter(o => o.kind === 'boss_plate');
    const occupancy = sealOccupants(objects, players);
    boss.insufficientParty = occupancy.humans < instance.definition.partyRequired;
    instance.shieldHold = instance.gateOpened && occupancy.full && !boss.insufficientParty ? instance.shieldHold + step : 0;
    if (instance.shieldHold >= mechanics.shield.holdSeconds && instance.elapsed >= instance.vulnerabilityUntil) {
      instance.vulnerabilityUntil = instance.elapsed + mechanics.shield.vulnerableSeconds; instance.shieldHold = 0;
      events.push({ success: true, event: 'mechanic', target: instance.id, mechanic: 'shield-break', message: 'Gemeinsamer Schildbruch! Neun Sekunden voller Schaden.' });
    }
    boss.shielded = boss.insufficientParty || instance.elapsed >= instance.vulnerabilityUntil;
    boss.shieldDamageMultiplier = boss.shielded ? 0 : 1;
    boss.enraged = instance.bossTime >= mechanics.enrageSeconds;
    boss.mechanicCycle = Math.floor(instance.bossTime / 12) % 2 === 0 ? 'stack' : 'spread';
    boss.stackRequired = mechanics.stack.minPlayers;
  }
  if (boss.alive && instance.bossEngaged && instance.affixes.length) {
    const state = instance.affixState;
    if (instance.affixes.some(a => a.id === 'fractured')) {
      const resolved = state.rifts.filter(r => r.explodeAt <= instance.bossTime);
      if (resolved.length) events.push({ event: 'mechanic', mechanic: 'rift-explosion', target: instance.id, zones: resolved.map(({ x, y, radius, damage }) => ({ x, y, radius, damage })) });
      state.rifts = state.rifts.filter(r => r.explodeAt > instance.bossTime);
      if (instance.bossTime >= state.nextRiftAt) {
        state.nextRiftAt = instance.bossTime + 18;
        const humans = [...new Map(players.filter(alive).map((p, i) => [String(p.id ?? p.playerId ?? i), p])).values()].slice(0, 8);
        const rifts = humans.map(p => ({ id: `${instance.id}:rift-${++state.riftSerial}`, x: p.x, y: p.y, radius: 72, damage: Math.round(boss.damage * 1.25), explodeAt: instance.bossTime + 1.6 }));
        state.rifts.push(...rifts);
        if (rifts.length) events.push({ event: 'mechanic', mechanic: 'rift-warning', target: instance.id, hazards: rifts.map(({ id, x, y, radius }) => ({ id, x, y, radius, kind: 'warning', color: '#d68ba4', life: 1.6, windup: true })) });
      }
    }
    if (instance.affixes.some(a => a.id === 'echoing') && instance.bossTime >= state.nextEchoAt) {
      state.nextEchoAt = instance.bossTime + 26;
      const aliveEchoes = instance.world.enemies.filter(e => e.affixEcho && e.alive).length, count = Math.min(2, Math.max(0, 6 - aliveEchoes)), spawnedIds = [];
      state.wave++;
      for (let i = 0; i < count; i++) {
        const angle = state.wave * 1.7 + i * Math.PI;
        const x = Math.max(1160, Math.min(1700, boss.x + Math.cos(angle) * 170)), y = Math.max(140, Math.min(1350, boss.y + Math.sin(angle) * 190));
        const echo = enemy('echo_guard', `${instance.id}:affix-echo-${state.wave}-${i}`, x, y, instance.tier, instance.definition.level);
        echo.affixEcho = true; echo.aggro = true; instance.world.enemies.push(echo); spawnedIds.push(echo.id);
      }
      if (spawnedIds.length) events.push({ event: 'mechanic', mechanic: 'echo-wave', target: instance.id, spawnedIds });
    }
  }
  return events;
}

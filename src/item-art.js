import { ITEM_BASES } from './loot.js';
import { ITEMS, RESOURCES } from './catalog.js';

// Original, grid-authored objects. SVG and Canvas consume the same integer runs.
// No generated ID, player name, rolled statistic or external asset enters art.
export const ITEM_ART_STYLE = Object.freeze({ version: 1, width: 32, height: 32, pivot: Object.freeze([16, 16]), cacheLimit: 192, bitmapCacheLimit: 128, filtering: 'nearest' });
export const ITEM_ART_PALETTE = Object.freeze([null, '#252a2b', '#3c4145', '#594139', '#815a40', '#b17c52', '#dcad79', '#f0d29a', '#f4e4ba', '#997443', '#c5a45b', '#efd086', '#51626b', '#829797', '#b8c9bf', '#3f593e', '#668253', '#9fa76b', '#703a3c', '#ab5145', '#d47b52', '#396777', '#76a2ac', '#514565', '#8c759c']);
export const ITEM_ART_FAMILIES = Object.freeze(['sword', 'daggers', 'axe', 'hammer', 'spear', 'flail', 'bow', 'crossbow', 'staff', 'scepter', 'grimoire', 'lantern', 'candle', 'censer', 'bell', 'hourglass', 'orb', 'mirror', 'plate', 'leather', 'robe', 'helm', 'hood', 'circlet', 'gauntlets', 'gloves', 'wraps', 'sabatons', 'boots', 'slippers', 'signet', 'gem_ring', 'band', 'amulet', 'tooth', 'talisman', 'chime', 'lens', 'potion', 'elixir', 'bread', 'stew', 'ration', 'log', 'ore', 'herb', 'crystal', 'wheat', 'seed', 'dust', 'gold', 'bag']);
const P = { ink: 1, dark: 2, barkShade: 3, bark: 4, leather: 5, woodLight: 6, linenShade: 7, linen: 8, bronzeShade: 9, bronze: 10, gold: 11, steelShade: 12, steel: 13, silver: 14, mossShade: 15, moss: 16, leaf: 17, redShade: 18, red: 19, ember: 20, iceShade: 21, ice: 22, night: 23, violet: 24 };
const materialColors = Object.freeze({ steel: [12, 13, 14], bronze: [9, 10, 11], leather: [3, 4, 5], wood: [3, 4, 6], cloth: [2, 23, 24], bone: [9, 7, 8], glass: [12, 13, 14], leaf: [15, 16, 17], stone: [2, 12, 13] });
const elementColors = Object.freeze({ none: [12, 13, 14], fire: [18, 19, 20], frost: [21, 22, 14], nature: [15, 16, 17], void: [23, 24, 7], holy: [9, 10, 11] });
const rarityColors = Object.freeze({ common: 13, uncommon: 16, rare: 22, epic: 24, legendary: 11 });
const canonical = new Map([...ITEM_BASES.map(item => [item.id, item]), ...Object.entries(ITEMS), ...Object.entries(RESOURCES).map(([id, item]) => [id, { ...item, id, name: item.name || item.label, type: 'resource' }]), ['gold', { id: 'gold', name: 'Gold', type: 'resource' }]]);
const variants = new Map([...canonical.keys()].map((id, index) => [id, index % 3]));
const sprites = new Map(), svgBodies = new Map(), bitmaps = new Map();
const own = (object, key) => Object.hasOwn(object, key);
const finite = value => Number.isFinite(value);
const freeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); } return value; };
const retain = (cache, key, value) => { if (cache.has(key)) cache.delete(key); cache.set(key, value); if (cache.size > ITEM_ART_STYLE.cacheLimit) cache.delete(cache.keys().next().value); return value; };

function familyFor(base) {
  const text = `${base.id} ${base.name || ''}`.toLowerCase(), slot = base.slot || base.type;
  if (base.type === 'resource') return ({ wood: 'log', ore: 'ore', herb: 'herb', crystal: 'crystal', ruby: 'crystal', sapphire: 'crystal', emerald: 'crystal', wheat: 'wheat', seed: 'seed', dust: 'dust', raidSigil: 'talisman', gold: 'gold' })[base.id] || 'bag';
  if (base.type === 'consumable') {
    if (/stew|eintopf/.test(text)) return 'stew';
    if (/ration|proviant/.test(text)) return 'ration';
    if (/meal|bread|brot/.test(text)) return 'bread';
    return base.family === 'hybrid' || /elixir|recovery/.test(text) ? 'elixir' : 'potion';
  }
  if (slot === 'helmet') return base.category === 'heavy' ? 'helm' : base.category === 'ritual' ? 'circlet' : 'hood';
  if (slot === 'gloves') return base.category === 'heavy' ? 'gauntlets' : base.category === 'ritual' ? 'wraps' : 'gloves';
  if (slot === 'boots') return base.category === 'heavy' ? 'sabatons' : base.category === 'ritual' ? 'slippers' : 'boots';
  if (slot === 'ring') return base.category === 'martial' ? 'signet' : base.category === 'arcane' ? 'gem_ring' : 'band';
  if (slot === 'armor') return base.category === 'heavy' || /plate|scale|mail|carapace|guard|harnisch/.test(text) ? 'plate' : base.category === 'ritual' || /robes|shroud|weave|mantle|ritual|cloak/.test(text) ? 'robe' : 'leather';
  if (slot === 'charm') {
    if (/tooth|zahn/.test(text)) return 'tooth';
    if (/chime|glöckchen/.test(text)) return 'chime';
    if (/lens|linse|sundial|sonnenuhr/.test(text)) return 'lens';
    return /rune|talisman|sigil|seed/.test(text) ? 'talisman' : 'amulet';
  }
  if (slot !== 'weapon') return 'bag';
  if (/grimoire|tome/.test(text)) return 'grimoire';
  if (/lantern|laterne/.test(text)) return 'lantern';
  if (/candle|kerze/.test(text)) return 'candle';
  if (/mirror|spiegel/.test(text)) return 'mirror';
  if (/crown|krone/.test(text)) return 'circlet';
  if (/censer|räucherpfanne/.test(text)) return 'censer';
  if (/hourglass|sand[u]?uhr/.test(text)) return 'hourglass';
  if (/bell|glocke/.test(text)) return 'bell';
  if (/crossbow|arbalest|armbrust|repeater|repetierer/.test(text)) return 'crossbow';
  if (/bow|bogen|string|sehne|recurve/.test(text)) return 'bow';
  if (/dagger|dolch|shivs|kukri|kniv|fang|teeth|rapier|sabre|sab[eé]l|requiem/.test(text)) return 'daggers';
  if (/halberd|hellebarde|pike|lanze|glaive|gleve|spear/.test(text)) return 'spear';
  if (/flail|flegel|chains|ketten/.test(text)) return 'flail';
  if (/axe|axt|beil|cleaver|sichel/.test(text)) return 'axe';
  if (/hammer|maul|mace|keule|kryptenbrecher/.test(text)) return 'hammer';
  if (/focus|fokus|oracle|orakel/.test(text)) return 'orb';
  if (/scepter|sceptre|zepter/.test(text)) return 'scepter';
  if (/staff|wand|stab|branch|ast|crozier|crook|root|totem|covenant/.test(text)) return 'staff';
  return (base.stats?.spellDamage || 0) > (base.stats?.damage || 0) ? 'staff' : 'sword';
}
function elementFor(base, item) {
  if (typeof item.element === 'string' && own(elementColors, item.element)) return item.element;
  const setElement = { ashen_oath: 'fire', winter_memory: 'frost', living_grove: 'nature', abyssal_pact: 'void' };
  if (typeof item.setId === 'string' && own(setElement, item.setId)) return setElement[item.setId];
  const gems = Array.isArray(item.sockets) ? item.sockets.slice(0, 3).map(gem => typeof gem === 'string' ? gem : gem?.id) : [];
  for (const gem of gems) if (['ruby', 'sapphire', 'emerald'].includes(gem)) return { ruby: 'fire', sapphire: 'frost', emerald: 'nature' }[gem];
  const text = `${base.id} ${base.name || ''}`.toLowerCase(), traits = [...(base.lootTraits || []), ...(Array.isArray(item.traits) ? item.traits.slice(0, 8) : [])];
  if (base.family === 'health' || base.id === 'heal_potion' || base.id === 'ruby') return 'fire';
  if (base.family === 'mana' || base.id === 'mana_potion' || base.id === 'sapphire') return 'frost';
  if (base.family === 'hybrid') return 'void';
  if (base.id === 'emerald' || ['herb', 'seed', 'wheat'].includes(base.id)) return 'nature';
  if (base.id === 'dust' || base.id === 'raidSigil') return 'void';
  if (traits.includes('frost') || /rime|frost|ice|winter|reif|snow/.test(text)) return 'frost';
  if (traits.includes('burning') || /ember|cinder|coal|fire|glut|flamme|pyre/.test(text)) return 'fire';
  if (traits.includes('venom') || /living|grove|branch|root|thorn|bark|wild|hain|dorn/.test(text)) return 'nature';
  if (traits.includes('draining') || /soul|void|abyss|shade|shadow|seelen|abgrund|mitternacht/.test(text)) return 'void';
  if (/oath|penitent|vigil|confessor|benediction|judgement|eid|buß/.test(text)) return 'holy';
  return 'none';
}

/** Cosmetic-only finite descriptor. Unknown IDs never become cache keys. */
export function itemArtDescriptor(item = {}) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) item = {};
  const base = canonical.get(item.baseId) || canonical.get(item.id), family = base ? familyFor(base) : 'bag';
  const rarity = item.rarity === 'mythic' ? 'legendary' : own(rarityColors, item.rarity) ? item.rarity : own(rarityColors, base?.rarity) ? base.rarity : 'common';
  const level = finite(item.level) ? Math.max(1, Math.min(100, item.level)) : base?.minLevel || 1;
  const tier = level >= 80 ? 3 : level >= 50 ? 2 : level >= 20 ? 1 : 0;
  const element = base ? elementFor(base, item) : 'none', variant = base ? variants.get(base.id) : 0;
  let material = ['plate', 'helm', 'gauntlets', 'sabatons', 'sword', 'daggers', 'axe', 'hammer', 'spear', 'flail', 'ore'].includes(family) ? 'steel'
    : ['robe', 'circlet', 'wraps', 'slippers'].includes(family) ? 'cloth'
    : ['bow', 'crossbow', 'staff', 'log'].includes(family) ? 'wood'
    : ['potion', 'elixir', 'crystal', 'orb', 'lens', 'mirror'].includes(family) ? 'glass'
    : ['herb', 'wheat'].includes(family) ? 'leaf'
    : ['amulet', 'signet', 'gem_ring', 'band', 'talisman', 'chime', 'lantern', 'censer', 'bell', 'hourglass', 'scepter', 'gold'].includes(family) ? 'bronze' : family === 'candle' ? 'bone' : 'leather';
  const id = base?.id || '';
  if (/bone|ossuary|ivory|tooth|knochen/.test(id)) material = 'bone';
  if (/sunforged|oath|cenotaph|rusty/.test(id)) material = 'bronze';
  return freeze({ version: 1, key: `item-art-1:${family}:${material}:${element}:${rarity}:${tier}:${variant}`, family, material, element, rarity, tier, variant, palette: ITEM_ART_PALETTE, canonicalId: base?.id || 'unknown' });
}

class Grid {
  constructor() { this.cells = new Uint8Array(1024); }
  dot(x, y, color) { if (x >= 0 && x < 32 && y >= 0 && y < 32) this.cells[y * 32 + x] = color; }
  rect(x, y, width, height, color) { for (let row = y; row < y + height; row++) for (let col = x; col < x + width; col++) this.dot(col, row, color); }
  line(x0, y0, x1, y1, color, width = 1) {
    const steps = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))), half = Math.floor(width / 2);
    for (let step = 0; step <= steps; step++) this.rect(Math.round(x0 + (x1 - x0) * step / steps) - half, Math.round(y0 + (y1 - y0) * step / steps) - half, width, width, color);
  }
  poly(points, color) {
    const left = Math.min(...points.map(p => p[0])), right = Math.max(...points.map(p => p[0])), top = Math.min(...points.map(p => p[1])), bottom = Math.max(...points.map(p => p[1]));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i], [xj, yj] = points[j];
        if ((yi > y + .5) !== (yj > y + .5) && x + .5 < (xj - xi) * (y + .5 - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.dot(x, y, color);
    }
  }
  ellipse(cx, cy, rx, ry, color) { for (let y = cy - ry; y < cy + ry; y++) for (let x = cx - rx; x < cx + rx; x++) if (((x + .5 - cx) / rx) ** 2 + ((y + .5 - cy) / ry) ** 2 <= 1) this.dot(x, y, color); }
  finish(descriptor) {
    const runs = []; let pixelCount = 0;
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32;) {
      const color = this.cells[y * 32 + x], start = x++;
      while (x < 32 && this.cells[y * 32 + x] === color) x++;
      if (color) { runs.push(Object.freeze({ x: start, y, w: x - start, h: 1, color })); pixelCount += x - start; }
    }
    return Object.freeze({ key: descriptor.key, width: 32, height: 32, pivot: ITEM_ART_STYLE.pivot, palette: ITEM_ART_PALETTE, runs: Object.freeze(runs), pixelCount });
  }
}
function drawShape(g, d) {
  const [shade, body, light] = materialColors[d.material], [as, accent, ah] = elementColors[d.element], trim = d.rarity === 'common' ? P.bronzeShade : rarityColors[d.rarity];
  const r = (x, y, w, h, color) => g.rect(x, y, w, h, color), l = (a, b, c, e, color, w = 1) => g.line(a, b, c, e, color, w), poly = (p, color) => g.poly(p, color), ellipse = (x, y, a, b, color) => g.ellipse(x, y, a, b, color);
  switch (d.family) {
    case 'sword':
      poly([[24, 2], [29, 2], [28, 9], [14, 23], [9, 18]], P.ink); poly([[25, 3], [28, 3], [26, 9], [14, 21], [11, 18]], body); l(25, 4, 12, 17, light, 2); l(26, 7, 14, 19, shade);
      l(7, 16, 17, 26, P.ink, 4); l(7, 17, 16, 26, P.bronze, 2); l(11, 22, 5, 28, P.ink, 5); l(11, 22, 5, 28, P.bark, 3); l(9, 24, 6, 27, P.leather); r(3, 26, 4, 4, P.ink); r(4, 27, 2, 2, trim); r(13, 19, 2, 2, accent); break;
    case 'daggers':
      poly([[3, 3], [8, 5], [17, 16], [13, 20], [3, 8]], P.ink); poly([[4, 5], [7, 6], [15, 16], [13, 18], [5, 8]], body); l(5, 6, 13, 16, light, 2); l(10, 16, 18, 20, P.ink, 3); l(10, 16, 17, 19, trim); l(15, 20, 20, 26, P.ink, 4); l(15, 20, 20, 26, P.bark, 2);
      poly([[26, 3], [29, 3], [28, 8], [16, 22], [12, 18]], P.ink); poly([[27, 4], [28, 4], [26, 8], [16, 20], [14, 18]], body); l(26, 6, 15, 18, light, 2); l(12, 16, 20, 24, P.ink, 3); l(12, 16, 20, 24, trim); l(14, 22, 9, 28, P.ink, 5); l(14, 22, 9, 28, P.bark, 3); r(7, 27, 4, 3, P.bronze); break;
    case 'axe':
      l(7, 28, 23, 7, P.ink, 5); l(7, 28, 23, 7, P.bark, 3); l(8, 26, 20, 10, P.woodLight); poly([[16, 3], [22, 3], [25, 7], [29, 8], [30, 14], [25, 20], [18, 18], [19, 13], [14, 8]], P.ink); poly([[17, 5], [21, 5], [24, 9], [28, 10], [28, 14], [24, 18], [20, 17], [21, 12], [16, 8]], body); poly([[25, 9], [28, 10], [28, 14], [24, 18], [22, 17], [26, 13]], light); poly([[17, 6], [20, 6], [22, 11], [20, 13]], shade); r(18, 10, 5, 3, trim); l(9, 25, 6, 28, P.leather, 3); break;
    case 'hammer':
      l(7, 28, 23, 8, P.ink, 5); l(7, 28, 23, 8, P.bark, 3); l(8, 27, 21, 10, P.woodLight); poly([[17, 2], [30, 10], [24, 20], [10, 12]], P.ink); poly([[17, 4], [28, 10], [23, 18], [12, 11]], body); poly([[17, 4], [28, 10], [25, 12], [15, 6]], light); poly([[25, 13], [23, 18], [12, 11], [14, 8]], shade); l(20, 8, 16, 13, trim, 3); r(18, 9, 2, 2, accent); l(6, 28, 10, 24, P.leather, 3); break;
    case 'spear':
      l(4, 29, 25, 7, P.ink, 5); l(4, 29, 25, 7, P.bark, 3); l(5, 28, 22, 11, P.woodLight); poly([[28, 1], [30, 7], [25, 14], [19, 11], [24, 4]], P.ink); poly([[27, 3], [28, 7], [24, 12], [21, 10], [25, 5]], body); l(26, 5, 22, 10, light, 2); l(22, 12, 26, 15, trim, 2); if (d.variant === 1) { poly([[17, 8], [21, 7], [23, 10], [18, 16], [15, 15]], P.ink); poly([[18, 10], [21, 9], [20, 13], [17, 15]], body); } break;
    case 'flail':
      l(6, 28, 15, 18, P.ink, 5); l(6, 28, 15, 18, P.bark, 3); l(6, 26, 12, 20, P.woodLight); l(14, 18, 22, 13, P.ink, 3); l(15, 18, 22, 13, P.silver); r(17, 15, 2, 2, shade); ellipse(24, 9, 6, 6, P.ink); ellipse(24, 9, 4, 4, body); r(22, 5, 4, 3, light); r(25, 9, 3, 3, shade); r(23, 1, 2, 4, P.ink); r(29, 8, 2, 2, P.ink); r(22, 13, 2, 4, P.ink); r(17, 7, 3, 2, P.ink); r(23, 8, 2, 2, trim); break;
    case 'bow':
      poly([[10, 2], [17, 3], [23, 8], [26, 15], [25, 23], [20, 29], [16, 30], [19, 22], [20, 15], [17, 9]], P.ink);
      poly([[12, 4], [16, 4], [21, 9], [24, 15], [23, 22], [20, 27], [18, 28], [21, 22], [22, 15], [19, 9]], body); l(13, 5, 19, 10, light); l(23, 16, 22, 22, shade, 2); l(11, 4, 17, 28, P.linenShade); l(3, 22, 28, 9, P.ink, 3); l(4, 22, 27, 10, P.bark, 1); poly([[23, 8], [29, 7], [28, 13]], P.silver); r(19, 12, 4, 7, P.ink); r(20, 13, 2, 5, trim); break;
    case 'crossbow':
      poly([[3, 9], [6, 4], [14, 3], [24, 8], [29, 17], [26, 22], [21, 13], [14, 9], [7, 10]], P.ink); poly([[5, 9], [7, 6], [13, 5], [23, 10], [26, 17], [26, 19], [23, 12], [14, 7], [7, 8]], body); l(8, 6, 14, 5, light, 2); l(6, 9, 14, 21, P.linenShade); l(14, 21, 26, 18, P.linenShade); l(7, 27, 23, 7, P.ink, 6); l(7, 27, 23, 7, P.bark, 4); l(8, 25, 21, 9, P.woodLight); l(14, 19, 25, 5, P.steel, 2); poly([[24, 2], [29, 2], [27, 8]], P.silver); r(10, 23, 5, 3, P.ink); r(11, 23, 3, 1, trim); r(15, 15, 3, 3, trim); break;
    case 'staff':
      l(7, 29, 20, 9, P.ink, 5); l(7, 29, 20, 9, body, 3); l(8, 27, 19, 10, light); l(10, 21, 13, 24, P.bronze, 2); ellipse(21, 7, 7, 6, P.ink); ellipse(21, 7, 5, 4, shade); ellipse(21, 7, 3, 3, accent); r(19, 5, 2, 2, ah); r(21, 8, 2, 2, as); l(16, 8, 19, 11, light, 2); if (d.element === 'nature') { poly([[11, 12], [16, 12], [17, 16], [13, 16]], P.moss); poly([[23, 10], [28, 9], [27, 14], [23, 15]], P.mossShade); r(24, 11, 2, 2, P.leaf); } break;
    case 'scepter':
      l(9, 28, 19, 12, P.ink, 6); l(9, 28, 19, 12, body, 4); l(10, 26, 18, 13, light); poly([[20, 2], [27, 5], [28, 12], [20, 17], [13, 12], [14, 5]], P.ink); poly([[20, 4], [25, 6], [26, 11], [20, 15], [15, 11], [16, 6]], body); poly([[20, 5], [24, 8], [21, 12], [17, 9]], accent); r(19, 6, 2, 2, ah); r(23, 11, 2, 2, shade); l(15, 14, 21, 17, trim, 2); r(7, 27, 5, 3, trim); break;
    case 'grimoire':
      poly([[7, 3], [27, 6], [27, 28], [6, 26], [3, 22], [3, 6]], P.ink); poly([[7, 5], [25, 8], [25, 25], [7, 23]], body); r(4, 7, 3, 15, shade); l(8, 5, 25, 8, light, 2); poly([[7, 23], [25, 25], [24, 27], [7, 25]], P.linen); l(9, 24, 23, 26, P.linenShade); r(8, 8, 2, 14, shade); poly([[16, 10], [22, 16], [17, 21], [12, 15]], P.ink); poly([[16, 12], [20, 16], [17, 19], [14, 15]], accent); r(16, 13, 2, 2, ah); r(23, 9, 2, 3, trim); r(23, 21, 2, 3, trim); l(13, 25, 13, 30, P.redShade, 2); break;
    case 'lantern':
      ellipse(16, 6, 6, 5, P.ink); ellipse(16, 6, 4, 3, 0); l(12, 4, 18, 3, light); poly([[10, 9], [22, 9], [27, 14], [25, 27], [22, 29], [10, 29], [7, 27], [5, 14]], P.ink); poly([[10, 11], [22, 11], [24, 14], [8, 14]], body); r(8, 15, 16, 10, as); poly([[17, 15], [21, 21], [19, 25], [12, 25], [13, 20]], accent); r(15, 20, 3, 5, ah); r(8, 15, 2, 11, body); r(21, 15, 2, 11, shade); r(15, 15, 2, 11, trim); r(9, 25, 14, 2, body); r(11, 28, 10, 1, light); break;
    case 'candle':
      poly([[17, 1], [22, 7], [20, 12], [13, 12], [11, 8]], P.ink); poly([[17, 3], [20, 7], [18, 10], [14, 10], [13, 8]], accent); r(16, 7, 2, 3, ah); r(11, 12, 11, 13, P.ink); r(12, 13, 9, 11, body); r(13, 13, 3, 11, light); r(19, 14, 2, 9, shade); r(10, 14, 3, 5, P.ink); r(11, 14, 2, 4, body); r(18, 12, 2, 5, light); ellipse(16, 25, 12, 5, P.ink); ellipse(16, 25, 10, 3, P.bronzeShade); l(8, 25, 13, 27, P.bronze, 2); r(12, 24, 10, 2, P.linenShade); break;
    case 'mirror':
      l(12, 28, 17, 18, P.ink, 6); l(12, 28, 17, 18, P.bronze, 4); l(13, 27, 16, 20, P.gold); ellipse(18, 12, 11, 11, P.ink); ellipse(18, 12, 9, 9, P.bronzeShade); ellipse(18, 12, 7, 7, as); poly([[14, 7], [21, 6], [25, 12], [22, 18], [15, 18], [12, 12]], accent); poly([[15, 7], [19, 6], [14, 15], [12, 13]], ah); l(22, 8, 17, 18, ah); r(10, 9, 2, 2, P.gold); r(26, 13, 2, 3, trim); r(10, 27, 4, 3, trim); break;
    case 'censer':
      r(14, 2, 4, 4, P.ink); r(15, 3, 2, 2, trim); l(15, 6, 8, 17, P.ink, 3); l(15, 6, 8, 17, light); l(17, 6, 24, 17, shade); poly([[4, 17], [28, 17], [25, 25], [20, 29], [12, 29], [7, 25]], P.ink); poly([[6, 18], [26, 18], [23, 24], [19, 27], [13, 27], [9, 24]], body); l(8, 19, 23, 19, light, 2); poly([[19, 21], [24, 21], [21, 26], [18, 27]], shade); r(10, 22, 3, 2, P.ink); r(16, 23, 3, 2, accent); r(22, 21, 2, 2, P.ink); r(13, 12, 2, 3, P.steel); r(16, 10, 2, 2, P.steelShade); r(19, 13, 1, 2, P.steel); break;
    case 'bell':
      ellipse(16, 5, 4, 4, P.ink); ellipse(16, 5, 2, 2, 0); poly([[11, 7], [21, 7], [24, 20], [29, 24], [27, 27], [5, 27], [3, 24], [8, 20]], P.ink); poly([[12, 8], [20, 8], [22, 21], [26, 24], [6, 24], [10, 21]], body); poly([[12, 10], [16, 9], [14, 22], [9, 23]], light); poly([[18, 10], [20, 10], [22, 21], [25, 23], [18, 23]], shade); r(6, 25, 20, 1, trim); ellipse(16, 28, 3, 2, P.ink); r(15, 27, 2, 2, body); r(14, 16, 4, 3, accent); break;
    case 'hourglass':
      r(6, 2, 20, 5, P.ink); r(7, 3, 18, 3, body); r(8, 3, 16, 1, light); r(6, 26, 20, 5, P.ink); r(7, 27, 18, 3, body); r(8, 27, 16, 1, light); l(9, 7, 9, 25, shade, 2); l(23, 7, 23, 25, shade, 2); poly([[10, 7], [22, 7], [20, 12], [17, 16], [20, 21], [22, 26], [10, 26], [12, 21], [15, 16], [12, 12]], P.ink); poly([[12, 8], [20, 8], [18, 13], [16, 15], [14, 12]], P.silver); poly([[16, 17], [19, 22], [20, 25], [12, 25], [14, 21]], P.steel); poly([[13, 10], [19, 10], [16, 14]], accent); poly([[16, 20], [20, 25], [12, 25]], accent); r(15, 15, 1, 5, ah); r(13, 22, 2, 2, ah); break;
    case 'orb':
      ellipse(16, 13, 11, 11, P.ink); ellipse(16, 13, 9, 9, as); poly([[10, 7], [18, 5], [23, 12], [20, 20], [11, 20], [8, 14]], accent); poly([[11, 7], [16, 6], [14, 11], [10, 13], [9, 11]], ah); poly([[20, 11], [23, 13], [20, 20], [14, 21], [17, 17]], as); r(11, 8, 3, 2, P.linen); l(6, 18, 12, 24, P.bronze, 3); l(25, 18, 19, 24, P.bronzeShade, 3); r(13, 23, 6, 4, P.ink); r(14, 24, 4, 3, trim); r(10, 27, 12, 3, P.ink); r(11, 27, 10, 1, P.bronze); break;
    case 'plate':
      poly([[9, 5], [12, 7], [20, 7], [23, 5], [29, 10], [27, 17], [24, 17], [25, 27], [7, 27], [8, 17], [5, 17], [3, 10]], P.ink);
      poly([[10, 7], [12, 9], [20, 9], [22, 7], [27, 11], [25, 15], [22, 15], [23, 25], [9, 25], [10, 15], [7, 15], [5, 11]], body);
      poly([[11, 10], [16, 12], [15, 23], [10, 23]], light); poly([[17, 12], [21, 10], [22, 23], [17, 23]], shade); l(8, 9, 5, 12, light, 2); r(22, 9, 4, 3, shade); r(9, 22, 14, 3, P.barkShade); r(14, 22, 4, 3, trim); r(15, 23, 2, 1, P.linen); l(12, 17, 20, 17, shade); break;
    case 'leather':
      poly([[10, 4], [14, 7], [18, 7], [22, 4], [29, 11], [26, 18], [23, 17], [24, 27], [8, 27], [9, 17], [6, 18], [3, 11]], P.ink); poly([[10, 6], [14, 9], [18, 9], [22, 6], [27, 11], [25, 15], [21, 14], [22, 25], [10, 25], [11, 14], [7, 15], [5, 11]], body); poly([[10, 7], [13, 10], [14, 23], [11, 23]], light); poly([[18, 10], [22, 8], [22, 23], [18, 23]], shade); l(16, 10, 16, 21, P.ink); r(9, 21, 14, 3, shade); r(14, 21, 4, 3, trim); r(15, 22, 2, 1, P.gold); for (const y of [12, 15, 18]) r(15, y, 3, 1, P.linenShade); break;
    case 'robe':
      poly([[11, 3], [14, 7], [18, 7], [21, 3], [28, 9], [29, 18], [25, 20], [22, 14], [27, 29], [5, 29], [10, 14], [7, 20], [3, 18], [4, 9]], P.ink); poly([[11, 5], [14, 9], [18, 9], [21, 5], [26, 10], [27, 17], [25, 18], [20, 11], [25, 27], [7, 27], [12, 11], [7, 18], [5, 17], [6, 10]], body); poly([[12, 10], [15, 11], [14, 27], [9, 27]], light); poly([[18, 10], [20, 12], [24, 27], [18, 27]], shade); l(15, 10, 16, 27, accent, 2); r(9, 16, 14, 3, P.ink); r(10, 17, 12, 1, trim); l(7, 27, 24, 27, trim); r(7, 12, 2, 4, accent); r(24, 13, 2, 3, as); break;
    case 'helm':
      ellipse(16, 15, 12, 11, P.ink); ellipse(16, 15, 10, 9, body); poly([[8, 10], [12, 6], [16, 6], [15, 12], [7, 14]], light); r(18, 8, 7, 14, shade); r(6, 15, 20, 6, P.ink); r(8, 16, 16, 2, P.steelShade); r(14, 14, 4, 10, body); r(15, 13, 1, 10, light); r(10, 22, 3, 5, body); r(20, 21, 3, 5, shade); r(13, 4, 6, 4, P.ink); r(14, 3, 4, 5, trim); break;
    case 'hood':
      poly([[15, 2], [20, 4], [26, 12], [25, 22], [29, 28], [20, 29], [16, 26], [11, 29], [3, 28], [7, 21], [6, 12], [10, 5]], P.ink); poly([[15, 4], [19, 6], [24, 13], [23, 22], [26, 27], [21, 27], [16, 24], [10, 27], [6, 27], [9, 20], [8, 12], [11, 7]], body); poly([[14, 6], [16, 6], [10, 14], [10, 22], [7, 25], [9, 11]], light); poly([[18, 7], [22, 13], [21, 23], [18, 24]], shade); poly([[15, 9], [20, 14], [19, 22], [12, 22], [11, 14]], P.ink); r(13, 21, 5, 2, shade); r(14, 6, 4, 2, trim); break;
    case 'circlet':
      poly([[4, 12], [8, 15], [10, 8], [15, 14], [18, 6], [22, 15], [28, 11], [28, 22], [22, 26], [10, 26], [4, 22]], P.ink); poly([[6, 15], [9, 17], [11, 12], [15, 17], [18, 11], [21, 18], [26, 15], [26, 21], [21, 24], [11, 24], [6, 21]], P.bronze); l(7, 19, 24, 19, P.gold, 2); r(7, 21, 3, 2, P.bronzeShade); r(22, 21, 3, 2, P.bronzeShade); poly([[16, 14], [21, 19], [16, 24], [12, 19]], P.ink); poly([[16, 16], [19, 19], [16, 22], [14, 19]], accent); r(15, 17, 2, 2, ah); r(8, 18, 2, 2, trim); r(23, 18, 2, 2, trim); break;
    case 'gauntlets':
    case 'gloves':
    case 'wraps': {
      for (const [ox, oy] of [[0, 0], [13, 2]]) {
        poly([[ox + 4, oy + 4], [ox + 13, oy + 4], [ox + 13, oy + 12], [ox + 16, oy + 15], [ox + 14, oy + 21], [ox + 10, oy + 27], [ox + 4, oy + 26], [ox + 2, oy + 20], [ox + 2, oy + 13], [ox + 5, oy + 11]], P.ink);
        poly([[ox + 6, oy + 6], [ox + 11, oy + 6], [ox + 11, oy + 13], [ox + 14, oy + 16], [ox + 12, oy + 21], [ox + 9, oy + 25], [ox + 6, oy + 24], [ox + 4, oy + 19], [ox + 4, oy + 14], [ox + 7, oy + 12]], body); r(ox + 6, oy + 6, 2, 7, light); r(ox + 10, oy + 14, 3, 5, shade); r(ox + 5, oy + 12, 6, 2, trim);
        if (d.family === 'gauntlets') { for (const y of [15, 19, 22]) l(ox + 5, oy + y, ox + 10, oy + y, light); r(ox + 10, oy + 17, 2, 2, accent); }
        if (d.family === 'wraps') for (const y of [8, 12, 16, 20, 23]) l(ox + 5, oy + y, ox + 10, oy + y + 1, P.linenShade, 2);
        if (d.family === 'gloves') { l(ox + 6, oy + 17, ox + 9, oy + 23, shade); r(ox + 5, oy + 9, 6, 1, P.leather); }
      } break;
    }
    case 'sabatons':
    case 'boots':
    case 'slippers': {
      const low = d.family === 'slippers';
      for (const [ox, oy] of [[0, 0], [13, 2]]) {
        poly([[ox + 5, oy + (low ? 13 : 4)], [ox + 13, oy + (low ? 13 : 4)], [ox + 13, oy + 20], [ox + 15, oy + 25], [ox + 13, oy + 28], [ox + 2, oy + 28], [ox + 1, oy + 24], [ox + 5, oy + 20]], P.ink);
        poly([[ox + 7, oy + (low ? 15 : 6)], [ox + 11, oy + (low ? 15 : 6)], [ox + 11, oy + 21], [ox + 13, oy + 25], [ox + 12, oy + 26], [ox + 3, oy + 26], [ox + 3, oy + 24], [ox + 7, oy + 21]], body); r(ox + 7, oy + (low ? 15 : 7), 2, low ? 7 : 13, light); r(ox + 9, oy + 21, 3, 4, shade); r(ox + 3, oy + 26, 10, 1, P.barkShade);
        if (d.family === 'sabatons') for (const y of [9, 14, 19, 23]) l(ox + 7, oy + y, ox + 11, oy + y, shade);
        if (d.family === 'boots') { r(ox + 7, oy + 10, 5, 2, shade); r(ox + 8, oy + 10, 2, 2, trim); }
        if (low) r(ox + 4, oy + 24, 3, 2, accent);
      } break;
    }
    case 'signet':
    case 'gem_ring':
    case 'band':
      ellipse(16, 19, 11, 10, P.ink); ellipse(16, 19, 9, 8, body); ellipse(16, 19, 5, 5, P.ink); ellipse(16, 19, 3, 3, 0); l(7, 18, 10, 24, light, 2); l(21, 24, 25, 19, shade, 3); r(11, 10, 10, 7, P.ink);
      if (d.family === 'signet') { r(12, 7, 9, 8, body); r(13, 8, 7, 5, light); r(16, 9, 1, 3, shade); r(14, 11, 4, 1, shade); }
      else if (d.family === 'gem_ring') { poly([[16, 3], [23, 9], [20, 15], [12, 15], [9, 9]], P.ink); poly([[16, 5], [21, 9], [18, 13], [13, 13], [11, 9]], accent); r(14, 7, 3, 2, ah); r(17, 10, 2, 2, as); }
      else { r(11, 11, 10, 4, body); l(12, 11, 20, 11, light); r(15, 12, 2, 2, trim); } break;
    case 'amulet':
      l(9, 3, 5, 13, P.ink, 3); l(9, 3, 5, 13, light); l(23, 3, 27, 13, shade, 2); l(5, 13, 12, 21, body, 2); l(27, 13, 20, 21, body, 2); ellipse(16, 22, 9, 9, P.ink); ellipse(16, 22, 7, 7, body); ellipse(16, 22, 5, 5, as); poly([[16, 17], [20, 21], [17, 26], [12, 23]], accent); r(14, 19, 3, 2, ah); r(12, 15, 8, 2, trim); break;
    case 'tooth':
      l(8, 3, 5, 11, P.bark, 2); l(5, 11, 12, 18, P.bark, 2); l(24, 3, 27, 11, P.bark, 2); l(27, 11, 19, 18, P.bark, 2); poly([[11, 12], [23, 13], [22, 21], [15, 29], [10, 30], [13, 23]], P.ink); poly([[13, 14], [21, 15], [20, 20], [14, 27], [13, 27], [15, 22]], P.linenShade); poly([[13, 14], [18, 15], [17, 20], [14, 24], [15, 19]], P.linen); r(11, 13, 12, 3, P.bark); r(12, 14, 10, 1, trim); break;
    case 'talisman':
      l(10, 3, 6, 12, P.bark, 2); l(22, 3, 26, 12, P.bark, 2); l(6, 12, 13, 20, P.bronzeShade, 2); l(26, 12, 19, 20, P.bronzeShade, 2); poly([[16, 12], [26, 21], [17, 30], [6, 22]], P.ink); poly([[16, 14], [23, 21], [17, 27], [9, 22]], body); l(15, 15, 10, 22, light, 2); l(23, 22, 17, 27, shade, 2); l(15, 18, 19, 22, accent, 2); l(19, 18, 15, 23, accent); r(13, 22, 5, 1, ah); break;
    case 'chime':
      l(16, 2, 16, 9, P.ink, 3); l(16, 2, 16, 9, light); poly([[6, 8], [26, 8], [29, 12], [3, 12]], P.ink); r(7, 9, 18, 2, body); r(8, 9, 12, 1, light); for (const [x, top, bottom] of [[6, 15, 25], [14, 13, 29], [22, 15, 24]]) { l(x + 1, 12, x + 1, top, P.bark); r(x, top, 5, bottom - top, P.ink); r(x + 1, top + 1, 3, bottom - top - 2, body); r(x + 1, top + 1, 1, bottom - top - 2, light); r(x + 2, bottom - 3, 2, 1, accent); } break;
    case 'lens':
      ellipse(16, 16, 13, 13, P.ink); ellipse(16, 16, 11, 11, P.bronze); ellipse(16, 16, 9, 9, as); ellipse(16, 16, 7, 7, accent); poly([[11, 9], [17, 9], [12, 19], [9, 18]], ah); r(11, 10, 3, 3, P.linen); r(16, 5, 1, 3, P.gold); r(6, 15, 2, 1, P.gold); r(24, 15, 2, 1, P.bronzeShade); r(15, 24, 1, 2, P.bronzeShade); r(24, 25, 4, 4, P.ink); r(24, 25, 2, 2, trim); break;
    case 'potion':
    case 'elixir': {
      const tall = d.family === 'elixir'; r(12, 2, 8, 5, P.ink); r(13, 3, 6, 3, P.bark); r(13, 3, 5, 1, P.woodLight); r(11, 7, 10, 3, P.ink); r(13, 7, 6, 3, P.silver);
      poly(tall ? [[12, 10], [20, 10], [25, 20], [23, 29], [9, 29], [7, 20]] : [[11, 10], [21, 10], [26, 16], [26, 25], [21, 29], [11, 29], [6, 25], [6, 16]], P.ink);
      poly([[12, 11], [20, 11], [24, 17], [23, 25], [20, 27], [12, 27], [8, 24], [8, 17]], shade); poly([[9, 18], [23, 18], [22, 25], [20, 27], [12, 27], [9, 24]], accent); r(10, 19, 3, 5, ah); r(18, 23, 4, 3, as); l(10, 15, 13, 11, P.silver, 2); r(9, 16, 2, 5, P.silver); r(13, 16, 2, 2, P.linen); r(14, 20, 5, 5, P.linenShade); r(15, 21, 3, 3, P.linen); if (d.element === 'fire') { r(16, 21, 1, 3, P.redShade); r(15, 22, 3, 1, P.redShade); } else r(16, 21, 1, 2, accent); break;
    }
    case 'bread':
      poly([[7, 10], [12, 6], [21, 6], [26, 10], [29, 16], [26, 24], [21, 27], [10, 27], [5, 24], [3, 17]], P.ink); poly([[8, 11], [12, 8], [20, 8], [25, 12], [27, 17], [24, 22], [20, 24], [10, 24], [6, 22], [5, 17]], P.bark); poly([[8, 12], [13, 9], [20, 9], [24, 13], [23, 18], [10, 19], [6, 17]], P.woodLight); l(10, 11, 8, 16, P.linenShade, 2); l(17, 9, 14, 16, P.linenShade, 2); l(23, 12, 20, 17, P.linenShade, 2); poly([[23, 22], [29, 20], [27, 26], [22, 28]], P.mossShade); l(23, 25, 27, 22, P.leaf); break;
    case 'stew':
      r(11, 3, 2, 4, P.steelShade); r(14, 1, 2, 4, P.steel); r(19, 3, 2, 4, P.steelShade); ellipse(16, 15, 14, 7, P.ink); ellipse(16, 14, 12, 5, P.bronzeShade); ellipse(16, 14, 10, 3, P.bark); poly([[3, 15], [29, 15], [26, 25], [22, 29], [10, 29], [6, 25]], P.ink); poly([[5, 17], [27, 17], [24, 24], [21, 27], [11, 27], [8, 24]], P.bark); l(7, 18, 10, 24, P.leather, 2); poly([[19, 19], [25, 18], [23, 24], [20, 27]], P.barkShade); ellipse(16, 16, 12, 4, P.bronzeShade); r(10, 14, 4, 2, P.woodLight); r(19, 15, 3, 2, P.moss); r(14, 17, 3, 2, P.red); l(23, 11, 29, 5, P.bronze, 2); break;
    case 'ration':
      poly([[5, 10], [22, 5], [28, 11], [29, 23], [10, 29], [4, 24]], P.ink); poly([[7, 11], [21, 7], [26, 12], [27, 22], [11, 27], [6, 23]], P.bark); poly([[7, 11], [21, 7], [24, 11], [11, 16]], P.leather); poly([[12, 17], [26, 13], [27, 22], [12, 26]], P.barkShade); l(7, 15, 26, 10, P.linenShade, 2); l(17, 8, 18, 25, P.linenShade, 2); r(16, 14, 5, 4, P.ink); r(17, 15, 3, 2, P.bronze); poly([[5, 9], [9, 3], [17, 6], [16, 8], [10, 7]], P.woodLight); r(10, 5, 2, 2, P.linenShade); break;
    case 'log':
      poly([[10, 3], [29, 10], [29, 21], [21, 28], [2, 20], [2, 10]], P.ink); poly([[11, 5], [27, 11], [27, 20], [21, 26], [4, 19], [4, 11]], body); l(12, 6, 25, 11, light, 2); l(9, 13, 22, 18, shade, 2); l(7, 18, 19, 23, P.leather); ellipse(8, 14, 6, 8, P.ink); ellipse(8, 14, 4, 6, P.woodLight); ellipse(8, 14, 2, 4, P.bark); r(7, 11, 1, 4, P.linenShade); r(20, 8, 2, 3, P.ink); r(21, 9, 2, 3, shade); break;
    case 'ore':
      poly([[8, 7], [19, 3], [26, 8], [30, 20], [22, 28], [7, 27], [2, 20], [4, 12]], P.ink); poly([[9, 9], [19, 5], [24, 9], [27, 19], [21, 25], [8, 25], [4, 19], [6, 13]], shade); poly([[9, 9], [19, 5], [22, 9], [18, 17], [6, 17]], body); poly([[20, 11], [24, 9], [27, 19], [21, 24], [18, 19]], P.dark); l(10, 10, 17, 7, light, 2); r(8, 19, 4, 3, P.bronze); r(9, 19, 2, 1, P.gold); r(18, 13, 3, 3, P.bronzeShade); r(17, 22, 3, 2, body); break;
    case 'herb':
      l(9, 29, 21, 5, P.ink, 3); l(9, 29, 21, 5, P.bark, 1); poly([[15, 20], [6, 18], [2, 11], [9, 10], [15, 14]], P.ink); poly([[13, 18], [7, 16], [5, 12], [9, 12], [13, 15]], body); l(6, 13, 12, 17, light); poly([[15, 23], [21, 16], [28, 17], [25, 24], [17, 27]], P.ink); poly([[17, 24], [22, 18], [26, 19], [23, 23]], body); l(19, 23, 24, 20, light); poly([[18, 13], [13, 7], [15, 2], [22, 3], [23, 8]], P.ink); poly([[18, 11], [15, 7], [17, 4], [21, 5], [21, 8]], body); r(17, 5, 2, 2, light); r(8, 25, 8, 2, P.bronzeShade); break;
    case 'crystal':
      poly([[15, 2], [24, 8], [28, 22], [17, 30], [6, 24], [3, 10]], P.ink); poly([[15, 4], [22, 9], [25, 21], [17, 27], [8, 23], [5, 11]], as); poly([[15, 4], [17, 12], [9, 22], [5, 11]], ah); poly([[17, 12], [22, 9], [25, 21], [17, 27]], accent); poly([[17, 12], [17, 27], [9, 23]], as); l(15, 5, 7, 11, P.linen, 2); l(17, 14, 18, 24, ah); r(24, 24, 3, 2, P.steelShade); break;
    case 'wheat':
      l(8, 29, 18, 7, P.ink, 3); l(8, 29, 18, 7, P.bronze); l(16, 28, 25, 8, P.ink, 3); l(16, 28, 25, 8, P.bronzeShade); for (const [x, y] of [[15, 6], [12, 12], [10, 18], [23, 7], [21, 13], [18, 19]]) { poly([[x, y], [x - 5, y - 3], [x - 6, y + 1], [x - 2, y + 5]], P.ink); poly([[x - 1, y], [x - 4, y - 1], [x - 4, y + 2], [x - 2, y + 3]], P.linenShade); poly([[x, y], [x + 4, y - 4], [x + 5, y], [x + 1, y + 5]], P.ink); poly([[x + 1, y], [x + 3, y - 1], [x + 3, y + 1], [x + 1, y + 3]], P.gold); } r(6, 26, 15, 2, P.barkShade); r(7, 26, 12, 1, P.leather); break;
    case 'seed':
    case 'dust':
      poly([[8, 3], [23, 3], [21, 11], [27, 19], [26, 27], [22, 30], [9, 30], [5, 26], [5, 18], [11, 10]], P.ink); poly([[10, 5], [21, 5], [19, 11], [25, 20], [24, 26], [21, 28], [10, 28], [7, 25], [7, 19], [13, 11]], P.bark); poly([[8, 20], [13, 14], [15, 16], [13, 26], [9, 25]], P.leather); r(10, 10, 12, 3, P.ink); r(11, 11, 10, 1, P.linenShade); r(12, 17, 10, 9, P.ink); r(13, 18, 8, 7, P.linenShade);
      if (d.family === 'seed') { poly([[16, 20], [19, 19], [19, 23], [15, 24]], P.bark); r(16, 21, 1, 2, P.woodLight); r(25, 25, 2, 3, P.woodLight); r(28, 28, 2, 1, P.bronzeShade); } else { l(17, 19, 17, 24, P.night); l(14, 22, 20, 22, P.violet); r(27, 22, 1, 2, P.violet); r(28, 27, 2, 1, P.linenShade); } break;
    case 'gold':
      for (const [x, y] of [[12, 22], [22, 19], [15, 12]]) { ellipse(x, y, 9, 7, P.ink); ellipse(x, y, 7, 5, P.bronzeShade); ellipse(x, y - 1, 7, 4, P.bronze); l(x - 4, y - 2, x + 1, y - 3, P.gold, 2); r(x, y - 2, 1, 3, P.bronzeShade); r(x - 2, y - 1, 4, 1, P.bronzeShade); } break;
    default:
      poly([[10, 5], [22, 5], [20, 11], [27, 18], [26, 27], [22, 30], [9, 30], [5, 27], [5, 18], [12, 11]], P.ink); poly([[11, 7], [20, 7], [18, 12], [24, 19], [24, 26], [21, 28], [10, 28], [7, 25], [7, 19], [14, 12]], body); poly([[8, 20], [13, 14], [15, 15], [13, 27], [9, 26]], light); poly([[19, 14], [24, 20], [23, 27], [19, 27]], shade); r(10, 10, 12, 3, P.ink); r(11, 11, 10, 1, P.bronze); l(16, 12, 19, 18, P.barkShade, 2); r(17, 22, 5, 4, trim); break;
  }
  const jewelAt = { sword: [18, 12], daggers: [15, 20], axe: [22, 11], hammer: [20, 10], spear: [23, 10], flail: [24, 9], bow: [21, 15], crossbow: [17, 16], staff: [20, 7], scepter: [20, 8], plate: [16, 14], leather: [16, 15], robe: [16, 12], helm: [16, 10], hood: [16, 7], gauntlets: [9, 17], boots: [9, 15], sabatons: [9, 15], grimoire: [17, 16] }[d.family];
  if (jewelAt && ['rare', 'epic', 'legendary'].includes(d.rarity)) {
    const [x, y] = jewelAt, gem = d.element === 'none' ? trim : accent;
    r(x - 2, y - 2, 5, 5, trim); r(x - 1, y - 1, 3, 3, gem); r(x - 1, y - 1, 1, 1, d.element === 'none' ? P.linen : ah);
    if (d.rarity === 'legendary') { l(x - 3, y, x, y + 3, P.gold); l(x, y + 3, x + 3, y, P.bronzeShade); }
  }
  // A material fitting and small rarity seal; never a full-item colour wash.
  if (d.tier > 0 && !['herb', 'wheat', 'gold', 'dust', 'seed'].includes(d.family)) { r(25, 26, 4, 3, P.ink); r(26, 27, 2, 1, trim); if (d.tier > 1) r(26, 25, 2, 1, P.bronze); }
  if (d.rarity === 'legendary') { r(3, 4, 3, 1, P.gold); r(4, 3, 1, 3, P.gold); r(27, 20, 3, 1, P.linenShade); }
}

function bitmapFor(sprite) {
  const cached = bitmaps.get(sprite.key);
  if (cached) { bitmaps.delete(sprite.key); bitmaps.set(sprite.key, cached); return cached; }
  let canvas;
  try {
    if (typeof globalThis.OffscreenCanvas === 'function') canvas = new globalThis.OffscreenCanvas(32, 32);
    else if (typeof globalThis.document?.createElement === 'function') { canvas = globalThis.document.createElement('canvas'); canvas.width = canvas.height = 32; }
    else return null;
    const ctx = canvas.getContext('2d'); if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    for (const run of sprite.runs) { ctx.fillStyle = sprite.palette[run.color]; ctx.fillRect(run.x, run.y, run.w, 1); }
  } catch { return null; }
  bitmaps.set(sprite.key, canvas);
  if (bitmaps.size > ITEM_ART_STYLE.bitmapCacheLimit) {
    const key = bitmaps.keys().next().value, retired = bitmaps.get(key); bitmaps.delete(key);
    // Release the backing store immediately, rather than waiting for GC.
    retired.width = retired.height = 0;
  }
  return canvas;
}

/** Immutable horizontal cell runs, shared by preview, inline SVG and Canvas. */
export function getPixelItem(item) {
  const descriptor = itemArtDescriptor(item), cached = sprites.get(descriptor.key);
  if (cached) return retain(sprites, descriptor.key, cached);
  const grid = new Grid(); drawShape(grid, descriptor); return retain(sprites, descriptor.key, grid.finish(descriptor));
}
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function classes(value) { return typeof value === 'string' ? value.split(/\s+/).filter(token => /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/.test(token)).slice(0, 8).join(' ') : ''; }
export function itemSpriteMarkup(item, { className = '', decorative = true } = {}) {
  const sprite = getPixelItem(item); let body = svgBodies.get(sprite.key);
  if (body === undefined) {
    const colors = new Map();
    for (const run of sprite.runs) { const path = `M${run.x} ${run.y}h${run.w}v1h-${run.w}z`; colors.set(run.color, (colors.get(run.color) || '') + path); }
    body = [...colors].map(([index, path]) => `<path d="${path}" style="fill:${sprite.palette[index]};stroke:none"/>`).join(''); retain(svgBodies, sprite.key, body);
  } else retain(svgBodies, sprite.key, body);
  const customClass = classes(className), base = canonical.get(item?.baseId) || canonical.get(item?.id);
  const label = typeof item?.name === 'string' ? item.name.slice(0, 120) : base?.name || 'Fundstück';
  const accessible = decorative ? 'aria-hidden="true"' : `role="img" aria-label="${escape(label)}"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="pixel-item-art${customClass ? ' ' + customClass : ''}" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges" style="image-rendering:pixelated;stroke:none" focusable="false" ${accessible}>${body}</svg>`;
}

/** x/y are the object CENTRE; cell boundaries round to whole canvas pixels. */
export function drawPixelItem(ctx, item, x, y, { size = 32, opacity = 1 } = {}) {
  if (!ctx || !finite(x) || !finite(y) || !finite(size) || size < 8 || size > 256 || !finite(opacity)) return false;
  const sprite = getPixelItem(item), width = Math.round(size), left = Math.round(x - width / 2), top = Math.round(y - width / 2);
  ctx.save();
  try {
    ctx.imageSmoothingEnabled = false; ctx.globalAlpha *= Math.max(0, Math.min(1, opacity));
    const bitmap = typeof ctx.drawImage === 'function' ? bitmapFor(sprite) : null;
    if (bitmap) { ctx.drawImage(bitmap, left, top, width, width); return true; }
    let color = 0;
    for (const run of sprite.runs) {
      if (color !== run.color) { color = run.color; ctx.fillStyle = sprite.palette[color]; }
      const x1 = left + Math.round(run.x * width / 32), x2 = left + Math.round((run.x + run.w) * width / 32), y1 = top + Math.round(run.y * width / 32), y2 = top + Math.round((run.y + 1) * width / 32);
      if (x2 > x1 && y2 > y1) ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }
  } finally { ctx.restore(); }
  return true;
}
export function itemArtCacheInfo() { return Object.freeze({ sprites: sprites.size, svgBodies: svgBodies.size, bitmaps: bitmaps.size, limit: ITEM_ART_STYLE.cacheLimit, bitmapLimit: ITEM_ART_STYLE.bitmapCacheLimit }); }
export function clearItemArtCache() { sprites.clear(); svgBodies.clear(); for (const bitmap of bitmaps.values()) bitmap.width = bitmap.height = 0; bitmaps.clear(); }

/**
 * Emberfall's original, code-authored pixel sprites. No external art or filters.
 *
 * The native grid is deliberately small: creatures 32×40, wolves 48×28,
 * bosses 64×72–72×84 (Eon 88×88), trees 56×68, stones 32×24. Sprites use a shared
 * 39-colour palette and hard clusters. Every cell is drawn at 2×2 world pixels.
 * The pivot is the contact point of feet / roots, never the image's centre.
 * Facing is mirrored in the source grid; no fractional transforms or rotations.
 *
 * Public draw functions accept a normal CanvasRenderingContext2D. They do not
 * draw combat telegraphs, health bars or hit flashes; the renderer owns those.
 * A DOM canvas is an optional bounded cache. Node / recording contexts work
 * with fillRect alone. getPixelSprite() exposes pixels for QA and contact sheets.
 */

import { ENEMY_TYPES } from './catalog.js';

export const PIXEL_WORLD_PALETTE = Object.freeze([
  null, '#161b21', '#283632', '#445046', '#707263', '#a69a7c', '#e0d3b3',
  '#202a25', '#35432b', '#516044', '#7b895c', '#aab778', '#d2cf9b',
  '#30262a', '#513a32', '#79543c', '#b08458', '#dbaf7b',
  '#2c2d39', '#525262', '#8a8794', '#beb5c6', '#ebe0df',
  '#29454d', '#3e6973', '#66939e', '#9bc6cf', '#d6edf0',
  '#40272c', '#813c38', '#bc5a40', '#ec9351', '#ffe0a0',
  '#28233d', '#504063', '#846598', '#b994c6', '#edbfd6', '#080e17a8',
]);

const C = Object.freeze({
  clear: 0, ink: 1, dark: 2, stone: 3, grey: 4, dust: 5, ivory: 6,
  forest: 7, leafDark: 8, leaf: 9, leafLight: 10, lime: 11, pollen: 12,
  woodDark: 13, wood: 14, bark: 15, barkLight: 16, sand: 17,
  ironDark: 18, iron: 19, steel: 20, silver: 21, white: 22,
  iceDark: 23, ice: 24, iceMid: 25, iceLight: 26, snow: 27,
  ash: 28, emberDark: 29, ember: 30, fire: 31, flame: 32,
  voidDark: 33, void: 34, violet: 35, lilac: 36, pink: 37, shadow: 38,
});

export const PIXEL_WORLD_STYLE = Object.freeze({
  pixelSize: 2, filtering: 'nearest', light: 'upper-left', paletteSize: 39,
  pivot: 'feet / root contact point', source: 'Original pixel clusters authored in src/pixel-world.js',
  cacheLimit: 192, normal: [32, 40], wolf: [48, 28], boss: [64, 72], tree: [56, 68], rock: [32, 24],
});

const ORIGINAL_ENEMY_TYPES = Object.freeze([
  'wolf', 'slime', 'frostwolf', 'skeleton', 'wraith', 'imp',
  'thorn_guardian', 'frost_sentinel', 'emberlord', 'steppe_raider',
  'jade_stalker', 'tide_reaver', 'thorn_hunter', 'obsidian_knight',
  'moon_construct', 'frost_colossus', 'sand_revenant', 'void_watcher',
  'echo_guard', 'root_matron', 'drowned_archon', 'thorn_abbess', 'chronar',
  'skadi', 'storm_king', 'night_devourer', 'world_heart',
]);

export const PIXEL_ENEMY_TYPES = Object.freeze(Object.keys(ENEMY_TYPES));

const BOSSES = new Set(['thorn_guardian', 'frost_sentinel', 'emberlord', 'root_matron',
  'drowned_archon', 'thorn_abbess', 'chronar', 'skadi', 'storm_king', 'night_devourer', 'world_heart']);
const TALL_ARMOUR = new Set(['frost_sentinel', 'chronar', 'skadi']);
const cache = new Map();
const canvasCache = new Map();

// Shapes are rasterised onto the native grid once, rather than on the browser
// canvas. This preserves deliberate one-pixel edges at every camera position.
class Brush {
  constructor(w, h, pivot = [Math.floor(w / 2), h - 3]) {
    this.width = w; this.height = h; this.pivot = pivot; this.pixels = new Uint8Array(w * h); this.clippedPixels = 0;
  }
  dot(x, y, colour) {
    x = Math.round(x) + this.pivot[0]; y = Math.round(y) + this.pivot[1];
    if (x >= 0 && x < this.width && y >= 0 && y < this.height) this.pixels[y * this.width + x] = colour;
    else if (colour !== C.clear) this.clippedPixels++;
  }
  rect(x, y, w, h, colour) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.dot(x + i, y + j, colour);
  }
  poly(points, colour) {
    const top = Math.ceil(Math.min(...points.map(p => p[1]))), bottom = Math.floor(Math.max(...points.map(p => p[1])));
    for (let y = top; y <= bottom; y++) {
      const intersections = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if (a[1] <= y && b[1] > y || b[1] <= y && a[1] > y) intersections.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      intersections.sort((a, b) => a - b);
      for (let i = 0; i + 1 < intersections.length; i += 2) {
        for (let x = Math.ceil(intersections[i]); x <= Math.floor(intersections[i + 1]); x++) this.dot(x, y, colour);
      }
    }
  }
  line(x0, y0, x1, y1, colour, width = 1) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    for (;;) {
      this.rect(x0 - Math.floor(width / 2), y0 - Math.floor(width / 2), width, width, colour);
      if (x0 === x1 && y0 === y1) break;
      const e = err * 2; if (e > -dy) { err -= dy; x0 += sx; } if (e < dx) { err += dx; y0 += sy; }
    }
  }
  oval(x, y, rx, ry, colour) {
    for (let row = -ry; row <= ry; row++) {
      const half = Math.floor(rx * Math.sqrt(Math.max(0, 1 - row * row / (ry * ry))));
      this.rect(x - half, y + row, half * 2 + 1, 1, colour);
    }
  }
  diamond(x, y, rx, ry, colour) { this.poly([[x, y - ry], [x + rx, y], [x, y + ry + 1], [x - rx, y]], colour); }
  shadow(rx = 10) { this.rect(-rx, 0, rx * 2 + 1, 2, C.shadow); this.rect(-rx + 3, -1, rx * 2 - 5, 4, C.shadow); }
  finish(key, mirror = false) {
    const runs = [], pixels = mirror ? new Uint8Array(this.pixels.length) : this.pixels;
    if (mirror) for (let y = 0; y < this.height; y++) for (let x = 0; x < this.width; x++) pixels[y * this.width + x] = this.pixels[y * this.width + this.width - 1 - x];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width;) {
        const colour = pixels[y * this.width + x], start = x++;
        while (x < this.width && pixels[y * this.width + x] === colour) x++;
        if (colour) runs.push(Object.freeze({ x: start, y, w: x - start, h: 1, colour }));
      }
    }
    return Object.freeze({ key, width: this.width, height: this.height,
      pivot: Object.freeze(mirror ? [this.width - 1 - this.pivot[0], this.pivot[1]] : [...this.pivot]),
      pixels, runs: Object.freeze(runs), palette: PIXEL_WORLD_PALETTE, clippedPixels: this.clippedPixels });
  }
}

function remember(key, make) {
  if (cache.has(key)) { const sprite = cache.get(key); cache.delete(key); cache.set(key, sprite); return sprite; }
  const sprite = make(); cache.set(key, sprite);
  if (cache.size > PIXEL_WORLD_STYLE.cacheLimit) { const oldest = cache.keys().next().value; cache.delete(oldest); canvasCache.delete(oldest); }
  return sprite;
}

function frameFor(actor, time) {
  if (actor.phase === 'windup') return 2;
  if (actor.phase === 'recover' || actor.phase === 'attack') return 3;
  const moving = actor.phase === 'chase' || actor.moving || Math.hypot(actor.vx || 0, actor.vy || 0) > 5;
  return moving ? Math.floor(Math.max(0, time || 0) * 7) % 2 : 0;
}

function boots(b, frame, colour = C.woodDark, spread = 5) {
  const step = frame === 1 ? 1 : 0;
  b.rect(-spread - 2, -5 - step, 5, 6, C.ink); b.rect(spread - 2, -5 + step, 5, 6 - step, C.ink);
  b.rect(-spread - 1, -4 - step, 4, 4, colour); b.rect(spread - 1, -4 + step, 4, 4 - step, colour);
}

function eyes(b, y, colour = C.flame, half = 3) {
  b.rect(-half - 1, y, 2, 2, C.ink); b.rect(half, y, 2, 2, C.ink);
  b.dot(-half, y, colour); b.dot(half, y, colour);
}

function wolf(b, cold, frame) {
  const dark = cold ? C.ice : C.dark, fur = cold ? C.iceLight : C.grey, light = cold ? C.snow : C.dust;
  const crouch = frame === 2 ? 2 : 0;
  b.shadow(17);
  b.poly([[-14, -10], [-20, -15], [-21, -11], [-17, -5], [-10, -4]], C.ink);
  b.poly([[-14, -10], [-20, -13], [-18, -8], [-12, -6]], dark);
  b.poly([[-13, -15 + crouch], [-6, -17 + crouch], [7, -15 + crouch], [13, -9], [9, -2], [-10, -3], [-15, -8]], C.ink);
  b.poly([[-12, -13 + crouch], [-5, -15 + crouch], [6, -13 + crouch], [11, -8], [7, -4], [-9, -5]], fur);
  b.rect(-8, -14 + crouch, 11, 2, light); b.rect(-10, -6, 14, 2, dark);
  for (const [x, offset] of [[-8, frame === 1 ? -1 : 0], [7, frame === 1 ? 1 : 0]]) {
    b.rect(x - 2, -5, 4, 6, C.ink); b.rect(x - 1 + offset, -4, 2, 4, dark);
    b.rect(x - 2 + offset, 0, 4, 1, light);
  }
  const head = frame === 3 ? 3 : frame === 2 ? -1 : 0;
  b.poly([[4 + head, -14], [4 + head, -23], [9 + head, -19], [13 + head, -24], [16 + head, -17], [20 + head, -12], [19 + head, -9], [10 + head, -9]], C.ink);
  b.poly([[6 + head, -14], [6 + head, -21], [9 + head, -17], [13 + head, -22], [15 + head, -15], [19 + head, -12], [17 + head, -10], [10 + head, -11]], fur);
  b.rect(6 + head, -15, 4, 3, dark); b.rect(16 + head, -12, 4, 2, light);
  b.dot(13 + head, -16, C.ink); b.dot(14 + head, -16, cold ? C.iceDark : C.fire);
  b.rect(19 + head, -12, 2, 2, C.ink);
  if (frame === 2 || frame === 3) { b.rect(16 + head, -9, 4, 3, C.ink); b.dot(17 + head, -9, C.ivory); b.dot(19 + head, -9, C.ivory); }
  if (cold) { b.rect(-4, -16 + crouch, 3, 1, C.snow); b.dot(-11, -10, C.snow); }
}

function slime(b, frame) {
  b.shadow(11); const squish = frame === 1 ? 2 : frame === 2 ? -2 : 0;
  b.oval(0, -9 + squish, 12 + (squish > 0 ? 1 : 0), 9 - squish, C.ink);
  b.oval(0, -10 + squish, 10 + (squish > 0 ? 1 : 0), 8 - squish, C.leaf);
  b.rect(-6, -14 + squish, 9, 3, C.leafLight); b.rect(-6, -13 + squish, 3, 2, C.lime);
  b.rect(-9, -6 + squish, 17, 3, C.leafDark); b.rect(-5, -9 + squish, 2, 3, C.ink); b.rect(4, -9 + squish, 2, 3, C.ink);
  b.poly([[-10, -16 + squish], [-12, -22 + squish], [-5, -18 + squish]], C.leafDark);
  b.poly([[0, -17 + squish], [2, -27 + squish], [6, -20 + squish]], C.lime);
  b.poly([[9, -15 + squish], [14, -22 + squish], [13, -12 + squish]], C.leafDark);
  if (frame === 2) { b.rect(-2, -6, 4, 2, C.ink); b.dot(0, -6, C.pollen); }
}

function skeleton(b, frame) {
  b.shadow(9); boots(b, frame, C.dust, 4);
  b.rect(-5, -22, 11, 18, C.ironDark); b.rect(-3, -24, 7, 6, C.dust);
  b.line(0, -21, 0, -6, C.ivory, 2);
  for (const y of [-19, -15, -11]) { b.rect(-5, y, 11, 2, C.dust); b.rect(-3, y, 6, 1, C.ivory); }
  b.line(-6, -21, -10, -10, C.dust, 3);
  const raised = frame === 2, hit = frame === 3;
  b.line(7, -21, hit ? 15 : 11, raised ? -28 : -14, C.dust, 3);
  b.line(hit ? 13 : 11, raised ? -33 : -19, hit ? 13 : 11, raised ? -14 : -4, C.wood, 2);
  b.poly(raised ? [[10, -35], [13, -35], [14, -22], [11, -19], [9, -23]] : [[10, -26], [13, -26], [14, -14], [11, -11], [9, -15]], C.ink);
  b.rect(11, raised ? -33 : -24, 2, 10, C.silver);
  b.rect(-7, -35, 14, 12, C.ink); b.rect(-6, -34, 12, 10, C.dust); b.rect(-5, -33, 8, 3, C.ivory);
  b.rect(-4, -30, 3, 3, C.ink); b.rect(2, -30, 3, 3, C.ink); b.rect(-2, -26, 5, 3, C.woodDark); b.dot(0, -28, C.woodDark);
  b.rect(-2, -26, 1, 2, C.ivory); b.dot(1, -25, C.ivory);
}

function hooded(b, type, frame) {
  const thorn = type === 'thorn_hunter', ghost = type === 'wraith', sand = type === 'sand_revenant';
  const dark = ghost ? C.voidDark : thorn ? C.forest : C.woodDark;
  const cloth = ghost ? C.void : thorn ? C.leaf : sand ? C.bark : C.wood;
  const light = ghost ? C.violet : thorn ? C.leafLight : C.sand;
  b.shadow(10); if (!ghost) boots(b, frame, C.woodDark, 4);
  b.poly([[-7, -24], [-11, -4], [-7, 0], [-3, -2], [0, 0], [4, -3], [9, 0], [11, -5], [7, -24]], C.ink);
  b.poly([[-6, -23], [-9, -5], [-5, -3], [-2, -5], [1, -2], [5, -6], [8, -3], [9, -6], [6, -23]], cloth);
  b.poly([[-6, -21], [-8, -5], [-3, -7], [-1, -22]], light); b.rect(3, -19, 3, 10, dark);
  b.poly([[-8, -25], [-8, -31], [-4, -36], [4, -36], [9, -30], [8, -24], [3, -21], [-3, -21]], C.ink);
  b.poly([[-7, -25], [-6, -31], [-3, -34], [3, -34], [7, -29], [6, -24]], light);
  b.poly([[-5, -27], [-3, -31], [3, -31], [5, -26], [3, -23], [-3, -23]], dark);
  eyes(b, -28, ghost ? C.pink : C.flame, 2);
  if (thorn) {
    b.line(-6, -33, -11, -36, C.leafLight, 2); b.line(6, -33, 10, -37, C.lime, 2);
    b.line(12, -31, 12, -7, C.wood, 2); b.line(12, -31, 15, -20, C.lime); b.line(15, -20, 12, -7, C.lime);
    b.line(11, -30, 11, -8, C.ivory); b.line(5, -20, 11, -20, C.sand, 2);
    if (frame === 2) b.line(1, -21, 10, -21, C.ivory);
  } else if (!ghost) {
    b.oval(-10, -16, 5, 7, C.ink); b.oval(-10, -17, 4, 6, sand ? C.barkLight : C.bark); b.rect(-12, -19, 4, 2, C.sand);
    const raised = frame === 2; b.line(9, -16, raised ? 12 : 15, raised ? -30 : -19, C.steel, 2);
    b.line(raised ? 12 : 15, raised ? -32 : -25, raised ? 12 : 15, raised ? -24 : -18, C.ivory, 2);
  } else {
    b.line(-7, -20, -14, frame === 2 ? -27 : -13, C.lilac, 2); b.line(7, -20, 14, frame === 2 ? -27 : -13, C.violet, 2);
    b.rect(-1, -18, 3, 4, C.lilac); b.dot(0, -17, C.white);
  }
  if (sand) { b.rect(-5, -32, 7, 2, C.sand); b.rect(-6, -23, 11, 3, C.barkLight); }
}

function serpent(b, type, frame) {
  const jade = type === 'jade_stalker', big = type === 'drowned_archon', k = big ? 2 : 1;
  const dark = jade ? C.leafDark : C.iceDark, skin = jade ? C.leaf : C.ice, light = jade ? C.lime : C.iceLight;
  const tail = frame === 1 ? 1 : 0;
  b.shadow(big ? 22 : 12);
  b.poly([[-14*k, -2*k], [-8*k, -8*k], [2*k, -6*k], [6*k, -1*k], [2*k, 1*k], [-7*k, 0], [-15*k, 2*k]], C.ink);
  b.poly([[-13*k, -2*k], [-7*k, -6*k], [2*k, -4*k], [4*k, -1*k], [1*k, 0], [-7*k, -2*k], [-12*k, 0]], skin);
  b.line(-12*k, -1*k, -15*k, -4*k-tail, light, k);
  b.poly([[-6*k, -10*k], [-5*k, -20*k], [-1*k, -25*k], [6*k, -22*k], [9*k, -10*k], [5*k, -3*k], [-3*k, -5*k]], C.ink);
  b.poly([[-4*k, -10*k], [-3*k, -19*k], [0, -23*k], [5*k, -20*k], [7*k, -10*k], [4*k, -5*k], [-2*k, -6*k]], skin);
  b.poly([[-2*k, -19*k], [2*k, -19*k], [4*k, -7*k], [0, -6*k]], light);
  b.poly([[-6*k, -23*k], [-10*k, -31*k], [-2*k, -28*k], [4*k, -34*k], [8*k, -26*k], [9*k, -22*k]], C.ink);
  b.poly([[-5*k, -24*k], [-8*k, -29*k], [-1*k, -26*k], [4*k, -31*k], [6*k, -25*k], [7*k, -23*k]], light);
  b.rect(-2*k, -26*k, 8*k, 6*k, skin); b.rect(0, -24*k, 2*k, k, C.flame); b.rect(5*k, -24*k, k, k, C.flame);
  b.rect(2*k, -20*k, 3*k, k, dark);
  const raised = frame === 2, armY = raised ? -26*k : -13*k;
  b.line(5*k, -15*k, 12*k, armY, skin, 2*k); b.line(12*k, -30*k, 12*k, -6*k, C.sand, k);
  b.line(9*k, -30*k, 15*k, -30*k, light, k); b.line(9*k, -33*k, 9*k, -28*k, light, k); b.line(15*k, -33*k, 15*k, -28*k, light, k);
  if (big) { b.rect(-4, -41, 4, 12, C.iceMid); b.rect(-3, -40, 1, 8, C.snow); b.rect(1, -7, 6, 3, C.iceMid); }
}

function armoured(b, type, frame) {
  const cold = ['frost_colossus', 'frost_sentinel', 'skadi'].includes(type), moon = ['moon_construct', 'chronar'].includes(type);
  const boss = BOSSES.has(type), k = boss ? 2 : 1;
  const dark = cold ? C.iceDark : moon ? C.voidDark : C.ironDark;
  const metal = cold ? C.iceMid : moon ? C.violet : type === 'obsidian_knight' ? C.iron : C.steel;
  const light = cold ? C.snow : moon ? C.lilac : C.silver;
  b.shadow(11*k);
  if(type==='chronar') {
    // A broken, solid-pixel clock halo is Chronar's signature silhouette.
    b.oval(0,-40,29,31,C.woodDark); b.oval(0,-40,27,29,C.clear);
    for(const [x,y] of [[0,-69],[16,-63],[26,-51],[27,-35],[17,-17],[0,-11],[-17,-17],[-27,-35],[-26,-51],[-16,-63]]) {
      b.rect(x-1,y-2,3,4,C.sand); b.dot(x-1,y-2,C.ivory);
    }
  }
  if(type==='skadi') {
    b.poly([[-13,-55],[-23,-33],[-26,-9],[-17,-12],[-11,-4],[0,-7],[11,-4],[17,-12],[26,-9],[23,-33],[13,-55]],C.ink);
    b.poly([[-12,-51],[-20,-32],[-23,-12],[-17,-16],[-11,-8],[0,-11],[11,-8],[17,-16],[23,-12],[20,-32],[12,-51]],C.ice);
    b.line(-18,-33,-20,-16,C.iceLight,2); b.line(18,-33,20,-16,C.iceMid,2);
  }
  boots(b, frame, dark, 5*k);
  b.rect(-8*k, -25*k, 17*k, 22*k, C.ink); b.rect(-7*k, -23*k, 15*k, 16*k, dark);
  b.poly([[-7*k, -23*k], [0, -25*k], [7*k, -23*k], [5*k, -12*k], [0, -9*k], [-5*k, -12*k]], metal);
  b.rect(-5*k, -21*k, 4*k, 2*k, light); b.rect(-5*k, -16*k, 3*k, 3*k, light);
  b.rect(-7*k, -7*k, 15*k, 3*k, metal);
  for (const side of [-1, 1]) {
    const raised = frame === 2 ? -5*k : 0;
    b.poly([[side*7*k, -23*k], [side*13*k, -26*k+raised], [side*16*k, -22*k+raised], [side*14*k, -17*k+raised], [side*8*k, -18*k]], C.ink);
    b.poly([[side*8*k, -23*k], [side*13*k, -24*k+raised], [side*14*k, -21*k+raised], [side*12*k, -19*k+raised], [side*9*k, -19*k]], metal);
    b.line(side*12*k, -18*k+raised, side*13*k, -9*k+raised, dark, 3*k);
    b.rect(side*12*k-1, -10*k+raised, 3*k, 3*k, light);
  }
  b.poly([[-7*k, -26*k], [-7*k, -32*k], [0, -36*k], [7*k, -32*k], [7*k, -26*k], [3*k, -23*k], [-3*k, -23*k]], C.ink);
  b.poly([[-6*k, -27*k], [-6*k, -31*k], [0, -34*k], [6*k, -31*k], [6*k, -27*k], [2*k, -25*k], [-2*k, -25*k]], metal);
  b.rect(-5*k, -31*k, 6*k, k, light); b.rect(-5*k, -29*k, 10*k, 3*k, dark);
  b.rect(-3*k, -29*k, 2*k, k, cold ? C.snow : C.flame); b.rect(2*k, -29*k, 2*k, k, cold ? C.snow : C.flame);
  b.diamond(0, -16*k, 3*k, 4*k, dark); b.diamond(0, -16*k, 2*k, 3*k, moon ? C.pink : cold ? C.snow : C.fire);
  if (cold) {
    for (const [x, y] of [[-5, -33], [0, -35], [5, -32]]) b.poly([[x*k, y*k+3*k], [x*k-2*k, y*k-5*k], [x*k+3*k, y*k+2*k]], light);
    if (type === 'skadi' || type === 'frost_sentinel') { b.line(14*k, -6*k, 14*k, -29*k, C.iceMid, k); b.diamond(14*k, -32*k, 3*k, 6*k, C.snow); }
    if(type==='skadi') {b.rect(-9,-70,18,3,C.snow);b.diamond(0,-70,3,7,C.iceLight);b.diamond(-15,-56,3,5,C.snow);}
  }
  if (type === 'obsidian_knight') {
    b.line(-4, -20, 0, -16, C.ember); b.line(0, -16, 4, -22, C.fire); b.line(-2, -32, 1, -29, C.ember);
    b.line(14, -25, 14, -6, C.ink, 3); b.rect(14, -24, 1, 12, C.ember);
  }
  if (moon) {
    b.diamond(-12*k, -30*k, 2*k, 4*k, light); b.diamond(12*k, -32*k, 2*k, 4*k, light);
    b.rect(-3*k, -35*k, 6*k, k, C.ivory);
    if (type === 'chronar') { b.rect(-2, -57, 4, 11, C.sand); b.line(0, -39, 6, -44, C.ivory, 2); b.rect(-5, -13, 10, 3, C.sand); }
  }
  if (type === 'echo_guard') { b.rect(-2, -35, 4, 2, C.lilac); b.rect(-1, -18, 2, 5, C.lilac); }
}

function demon(b, big, frame) {
  const k = big ? 2 : 1; b.shadow(10*k); boots(b, frame, C.ash, 4*k);
  const spread = frame === 2 ? 2 : 0;
  for (const side of [-1, 1]) {
    b.poly([[side*5*k, -23*k], [side*(12+spread)*k, -28*k], [side*16*k, -17*k], [side*11*k, -19*k], [side*9*k, -12*k], [side*6*k, -16*k]], C.ink);
    b.poly([[side*7*k, -22*k], [side*(11+spread)*k, -25*k], [side*14*k, -18*k], [side*10*k, -20*k], [side*8*k, -14*k]], C.emberDark);
  }
  b.poly([[-6*k, -25*k], [-8*k, -8*k], [-4*k, -3*k], [4*k, -3*k], [8*k, -8*k], [6*k, -25*k]], C.ink);
  b.poly([[-5*k, -24*k], [-6*k, -9*k], [-3*k, -5*k], [3*k, -5*k], [6*k, -9*k], [5*k, -24*k]], C.emberDark);
  b.rect(-4*k, -23*k, 3*k, 9*k, C.ember); b.rect(-2*k, -11*k, 5*k, 3*k, C.fire);
  b.rect(-6*k, -33*k, 13*k, 12*k, C.ink); b.rect(-5*k, -32*k, 11*k, 10*k, C.ember); b.rect(-4*k, -31*k, 5*k, 2*k, C.fire);
  b.poly([[-6*k, -29*k], [-9*k, -37*k], [-3*k, -33*k]], C.ivory); b.poly([[6*k, -29*k], [9*k, -37*k], [3*k, -33*k]], C.sand);
  b.rect(-4*k, -28*k, 3*k, k, C.flame); b.rect(2*k, -28*k, 3*k, k, C.flame); b.rect(-2*k, -24*k, 5*k, k, C.ash);
  if (big) {
    b.poly([[15, -12], [16, -24], [21, -19], [24, -34], [30, -17], [28, -9], [19, -8]], C.fire);
    b.poly([[20, -10], [20, -20], [24, -26], [27, -15], [24, -9]], C.flame);
    b.rect(-2, -47, 4, 13, C.fire); b.rect(-1, -44, 2, 8, C.flame);
  } else { b.line(-3, -6, -11, -3, C.ember, 2); b.poly([[-12, -3], [-15, -7], [-10, -6]], C.fire); }
}

function plantBoss(b, type, frame) {
  const mother = type === 'root_matron', bloom = type === 'thorn_abbess';
  b.shadow(23);
  for (const side of [-1, 1]) {
    b.line(side*6, -8, side*17, -2, C.woodDark, 5); b.line(side*17, -2, side*27, 0, C.woodDark, 3);
    b.line(side*7, -7, side*16, -9, C.bark, 2); b.line(side*17, -9, side*23, -4, C.bark, 2);
    const raise = frame === 2 ? -12 : 0;
    b.poly([[side*8, -38], [side*21, -34+raise], [side*29, -20+raise], [side*26, -11+raise], [side*19, -17+raise], [side*14, -26+raise], [side*7, -26]], C.ink);
    b.poly([[side*9, -36], [side*19, -32+raise], [side*26, -20+raise], [side*25, -16+raise], [side*20, -19+raise], [side*15, -28+raise], [side*9, -27]], C.wood);
    b.line(side*19, -30+raise, side*24, -20+raise, C.barkLight, 2);
    b.poly([[side*15, -32+raise], [side*21, -40+raise], [side*22, -30+raise]], C.leafLight);
  }
  if (bloom) {
    // A five-petalled altar-flower, visibly distinct from the two tree bosses.
    for (const [x, y, lean] of [[-20,-40,-1],[-13,-49,-1],[0,-53,0],[13,-49,1],[20,-40,1]]) {
      b.poly([[x-7,y+12], [x-9,y-3], [x-3+lean*3,y-10], [x+5+lean*3,y-8], [x+9,y+3], [x+5,y+14]], C.ink);
      b.poly([[x-5,y+9], [x-7,y-2], [x-2+lean*3,y-7], [x+4+lean*3,y-5], [x+6,y+3], [x+3,y+11]], C.sand);
      b.line(x-2, y+7, x+lean*3, y-3, C.pollen, 2);
    }
  }
  b.poly([[-12,-43], [-17,-15], [-12,-5], [0,0], [12,-5], [17,-15], [12,-43]], C.ink);
  b.poly([[-10,-40], [-14,-16], [-10,-8], [0,-3], [10,-8], [14,-16], [10,-40]], mother ? C.wood : C.leafDark);
  b.poly([[-9,-35], [-11,-15], [-6,-11], [-3,-34]], mother ? C.bark : C.leaf);
  b.line(4, -32, 7, -12, mother ? C.barkLight : C.leafLight, 2);
  b.diamond(0, -21, 5, 8, C.forest); b.diamond(0, -21, 3, 5, C.lime); b.rect(-1, -25, 2, 5, C.pollen);
  b.poly([[-11,-42], [-12,-52], [-8,-59], [0,-62], [8,-59], [12,-52], [11,-42], [5,-36], [-5,-36]], C.ink);
  b.poly([[-9,-43], [-10,-51], [-6,-57], [0,-59], [6,-57], [10,-51], [9,-43], [4,-39], [-4,-39]], mother ? C.bark : C.leaf);
  b.rect(-7, -52, 7, 2, mother ? C.barkLight : C.leafLight); eyes(b, -48, C.flame, 5);
  b.rect(-3, -41, 7, 2, C.woodDark);
  if (!bloom) {
    b.line(-8, -54, -15, -61, C.wood, 3); b.line(-15, -61, -14, -65, C.bark, 2);
    b.line(8, -54, 16, -62, C.wood, 3); b.line(16, -62, 21, -61, C.bark, 2);
    b.poly([[-9,-54], [-12,-63], [-5,-59], [0,-67], [5,-58], [12,-61], [10,-52]], C.leafDark);
    b.poly([[-7,-56], [-8,-61], [-3,-58], [0,-64], [4,-56], [8,-58], [7,-53]], C.leafLight);
  }
  if (mother) { b.rect(-8, -32, 3, 4, C.leafLight); b.rect(-6, -29, 2, 2, C.pollen); b.rect(6, -16, 2, 4, C.leaf); }
}

function stormKing(b, frame) {
  b.shadow(23); boots(b, frame, C.woodDark, 8);
  const rise = frame === 2 ? -4 : frame === 1 ? 2 : 0;
  for (const side of [-1, 1]) {
    b.poly([[side*9,-41], [side*18,-53+rise], [side*29,-41+rise], [side*31,-28+rise], [side*25,-34+rise], [side*25,-21+rise], [side*20,-28+rise], [side*17,-16+rise], [side*12,-25]], C.ink);
    b.poly([[side*11,-40], [side*18,-49+rise], [side*27,-40+rise], [side*28,-33+rise], [side*23,-37+rise], [side*23,-26+rise], [side*19,-31+rise], [side*16,-22+rise], [side*13,-28]], C.bark);
    b.line(side*13,-38,side*22,-36+rise,C.sand,2); b.line(side*14,-33,side*20,-28+rise,C.barkLight,2);
  }
  b.poly([[-9,-40],[-13,-9],[-7,-3],[7,-3],[13,-9],[9,-40]],C.ink);
  b.poly([[-8,-38],[-10,-10],[-6,-6],[6,-6],[10,-10],[8,-38]],C.barkLight);
  b.poly([[-7,-34],[-8,-17],[-3,-13],[-1,-35]],C.sand); b.rect(-2,-34,4,22,C.woodDark);
  b.rect(-9,-52,18,16,C.ink); b.rect(-8,-50,16,12,C.sand); b.rect(-6,-49,7,3,C.ivory);
  eyes(b,-45,C.flame,4); b.poly([[-3,-41],[0,-38],[4,-41]],C.woodDark);
  b.poly([[-9,-50],[-11,-61],[-4,-57],[0,-65],[5,-56],[11,-61],[9,-50]],C.ink);
  b.poly([[-7,-51],[-8,-58],[-3,-54],[0,-62],[4,-53],[8,-58],[7,-51]],C.ivory);
  b.diamond(0,-21,4,6,C.iceDark); b.diamond(0,-21,2,4,C.snow);
  b.line(18,-13,18,-34,C.woodDark,3); b.poly([[18,-39],[12,-30],[18,-32],[22,-26],[24,-29]],C.flame);
}

function devourer(b, frame) {
  b.shadow(23);
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) {
    const raised = frame === 2 ? -4 : 0;
    b.line(side*10,-18-i*7,side*(23+i*2),-33+i*10+raised,C.ink,4);
    b.line(side*(23+i*2),-33+i*10+raised,side*(29-i),-10+i*4,C.ink,3);
    b.line(side*11,-18-i*7,side*(23+i*2),-33+i*10+raised,i%2?C.violet:C.lilac,2);
  }
  b.poly([[-18,-14],[-17,-42],[-10,-55],[0,-64],[10,-55],[17,-42],[18,-14],[10,-3],[0,2],[-10,-3]],C.ink);
  b.poly([[-15,-14],[-14,-41],[-8,-53],[0,-61],[8,-53],[14,-41],[15,-14],[8,-5],[0,-2],[-8,-5]],C.voidDark);
  b.poly([[-12,-31],[-10,-44],[-5,-52],[0,-57],[3,-53],[-3,-44],[-4,-27]],C.void);
  b.oval(0,-28,11,18,C.ink); b.oval(0,-28,9,15,C.ironDark);
  for (const x of [-8,-4,0,4,8]) { b.poly([[x-1,-41],[x+2,-41],[x,-34]],C.ivory); b.poly([[x-1,-15],[x+2,-15],[x,-23]],C.silver); }
  b.rect(-9,-49,5,2,C.pink); b.rect(5,-49,5,2,C.pink); b.dot(-8,-50,C.white); b.dot(6,-50,C.white);
  b.rect(-2,-31,4,7,frame===2?C.pink:C.violet);
}

function watcher(b, frame, heart) {
  const k = heart ? 2 : 1, y = heart ? -34 : -19;
  b.shadow(heart?24:10);
  const rays = [[0,-1],[1,-1],[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1]];
  for (let i=0;i<rays.length;i++) {
    const [dx,dy]=rays[i], reach=heart? (frame===2?37:34) : 14;
    const x=dx*reach, yy=y+dy*reach;
    b.poly([[dx*10*k,y+dy*10*k],[x-dy*3,yy+dx*3],[x+dx*4,yy+dy*4],[x+dy*3,yy-dx*3]],C.ink);
    b.poly([[dx*12*k,y+dy*12*k],[x-dy*2,yy+dx*2],[x+dx*2,yy+dy*2],[x+dy*2,yy-dx*2]],i%2?C.violet:C.lilac);
    if(heart)b.dot(x,yy,C.pink);
  }
  b.oval(0,y,12*k,13*k,C.ink); b.oval(0,y,10*k,11*k,C.void); b.oval(-2*k,y-2*k,8*k,8*k,C.violet);
  if(heart) {
    b.diamond(0,y,7*k,10*k,C.lilac); b.diamond(0,y,4*k,7*k,frame===2?C.white:C.pink);
    b.diamond(-1,y-1,2,5,C.flame); b.rect(-14,y-10,4,2,C.pink); b.rect(11,y+7,3,3,C.lilac);
  } else {
    b.oval(0,y,8,5,C.lilac); b.oval(1,y,3,5,C.voidDark); b.rect(1,y-3,1,3,C.white);
    if(frame===2)b.rect(-7,y-1,15,1,C.pink);
  }
}

function objective(b, name, frame) {
  b.shadow(9);
  if (/Dornen|Knospe/i.test(name)) {
    b.line(0,-3,0,-16,C.wood,3); b.poly([[-9,-18],[-7,-26],[0,-31],[7,-26],[9,-18],[3,-12],[-3,-12]],C.ink);
    b.poly([[-7,-18],[-5,-25],[0,-28],[5,-25],[7,-18],[2,-14],[-2,-14]],C.leaf);
    b.line(0,-27,0,-15,C.lime,2); b.poly([[-2,-14],[-12,-19],[-9,-9]],C.leafDark);
  } else if (/Seele|Hungrig/i.test(name)) {
    b.poly([[-8,-3],[-8,-23],[0,-31],[8,-23],[8,-3],[3,-6],[0,-1],[-3,-6]],C.voidDark);
    b.poly([[-6,-7],[-5,-22],[0,-28],[5,-22],[6,-7],[0,-4]],C.violet); eyes(b,-22,C.pink,2); b.rect(-1,-17,3,5,C.ink);
  } else {
    b.rect(-8,-5,17,5,C.ink); b.rect(-6,-5,13,3,C.iron);
    b.diamond(0,-19,8,15,C.ink); b.diamond(0,-20,6,12,C.violet); b.poly([[-5,-20],[0,-31],[0,-9]],C.lilac);
    b.diamond(0,-20,2,4,frame===2?C.white:C.pink);
  }
}

// New bestiary art is authored from anatomy, equipment and species details.
// IDs select a stable body plan; attack poses change the actual native pixels.
const speciesSeed = id => [...id].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
const familyColours = {
  beast:[C.woodDark,C.bark,C.sand,C.fire], undead:[C.ironDark,C.grey,C.ivory,C.fire],
  cultist:[C.voidDark,C.void,C.lilac,C.pink], demon:[C.ash,C.emberDark,C.ember,C.flame],
  insect:[C.forest,C.leafDark,C.lime,C.pollen], abomination:[C.ash,C.emberDark,C.sand,C.pink],
  construct:[C.ironDark,C.iron,C.silver,C.fire], spectral:[C.voidDark,C.violet,C.lilac,C.pink],
  plant:[C.woodDark,C.leafDark,C.leafLight,C.pollen],
};
function newCreature(type, def, frame, mirror) {
  const id=def.baseType||type,seed=speciesSeed(type===`${id}_boss`?id:type),family=def.family||'abomination';
  const boss=!!def.boss,body=new Brush(52,58,[26,54]),b=body;
  let [dark,mid,light,eye]=familyColours[family]||familyColours.abomination;
  // Material families keep deliberate clusters while each species has its own
  // contour, asymmetric equipment and identifying marks.
  const silhouette=def.silhouette||'',a=def.archetype||'brute';
  if(/frost|ice|winter|snow/.test(id)){dark=C.iceDark;mid=C.ice;light=C.snow;eye=C.iceLight;}
  else if(/void|night|shade|soul/.test(id)){dark=C.voidDark;mid=C.violet;light=C.lilac;eye=C.pink;}
  const wide=a==='brute'||a==='guardian'?3:0,lean=frame===2?2:frame===3?-2:0,step=frame===1?2:0;
  b.shadow(19+wide);
  if(/serpent|worm|leech/.test(silhouette)) {
    b.oval(-3,-10,20,10,C.ink);b.oval(-3,-11,17,7,mid);b.oval(-3,-11,11,4,dark);b.oval(-3,-11,7,2,C.ink);
    b.poly([[7,-12],[3,-21],[3,-35],[8,-43],[17,-41],[20,-34],[16,-26],[18,-16],[13,-7]],C.ink);
    b.poly([[9,-13],[6,-22],[6,-34],[10,-40],[15,-38],[17,-33],[13,-25],[15,-16],[12,-10]],mid);
    b.line(8,-32,11,-15,light,3);b.rect(10,-35,6,3,light);b.dot(14,-36,eye);b.rect(16,-32,4,3,dark);
    for(let i=0;i<6;i++)b.line(-18+i*5,-12+(i%2)*3,-17+i*5,-7+(i%2)*2,light);
    if(frame===2){b.line(18,-31,24,-32,eye);b.line(23,-32,24,-34,eye);}
    if(family==='construct')for(let i=0;i<5;i++)b.diamond(-13+i*6,-13,3,4,C.silver);
  } else if(/beholder|eye|portal/.test(silhouette)) {
    for(const side of [-1,1])for(let i=0;i<3;i++){b.line(side*9,-21-i*6,side*20,-37+i*9-lean,dark,4);b.line(side*20,-37+i*9-lean,side*24,-22+i*5,mid,2);}
    b.oval(0,-26,17,22,C.ink);b.oval(0,-27,14,19,mid);b.oval(-3,-30,10,13,light);
    if(silhouette==='portal'){b.oval(0,-25,10,17,dark);b.oval(0,-25,7,14,C.ink);for(const x of [-6,-2,2,6]){b.poly([[x-1,-40],[x+2,-40],[x,-32]],C.ivory);b.poly([[x-1,-10],[x+2,-10],[x,-18]],light);}b.rect(-1,-25,3,6,frame===2?eye:mid);}
    else {b.oval(0,-29,11,7,C.ivory);b.oval(3,-29,5,7,eye);b.oval(4,-29,2,6,C.ink);b.rect(2,-33,2,3,C.white);b.line(-5,-16,6,-16,dark,2);}
  } else if(silhouette==='bell') {
    b.rect(-4,-47,8,8,C.ink);b.rect(-3,-46,6,6,light);b.poly([[-21,-7],[-15,-14],[-12,-34],[-6,-40],[6,-40],[12,-34],[15,-14],[21,-7]],C.ink);b.poly([[-18,-9],[-12,-15],[-9,-33],[-4,-37],[5,-37],[9,-31],[12,-14],[18,-9]],mid);b.poly([[-10,-15],[-7,-32],[-3,-35],[-1,-13]],light);b.rect(-20,-9,40,5,dark);b.rect(-17,-8,34,2,light);b.oval(0,-3,5,4,eye);b.line(-2,-20,6,-26,dark,2);
  } else if(silhouette==='scarecrow') {
    boots(b,frame,C.woodDark,8);b.line(-21,-31,21,-31,C.ink,5);b.line(-20,-32,20,-32,C.barkLight,3);b.poly([[-9,-4],[-11,-30],[-5,-36],[8,-34],[11,-7],[5,-11],[0,-3],[-5,-8]],mid);b.line(-6,-27,-4,-8,light,3);b.line(7,-28,5,-13,dark,2);b.rect(-7,-45,14,12,C.sand);eyes(b,-40,eye,3);b.line(-3,-35,4,-35,C.woodDark);b.poly([[-14,-46],[-6,-47],[-3,-52],[6,-52],[8,-46],[15,-45]],C.ink);b.line(-11,-46,12,-45,light);b.line(19,-4,19,-43,C.wood,2);b.poly([[19,-43],[10,-48],[2,-42],[11,-44],[19,-39]],C.ivory);
  } else if(family==='plant'&&silhouette==='fungus') {
    b.poly([[-8,1],[-7,-17],[-11,-31],[9,-31],[7,-16],[9,1]],C.ink);b.poly([[-5,0],[-4,-16],[-7,-28],[6,-28],[4,-16],[6,0]],mid);b.line(-2,-24,-2,-2,light,2);
    b.poly([[-23,-28],[-20,-38],[-10,-45],[0,-48],[11,-44],[20,-36],[23,-28],[9,-25],[-11,-25]],C.ink);b.poly([[-20,-29],[-17,-37],[-9,-42],[0,-45],[10,-41],[17,-35],[20,-29]],mid);b.line(-13,-37,-3,-41,light,3);for(const x of [-12,0,10])b.oval(x,-33,3,2,light);eyes(b,-21,eye,3);b.rect(-3,-13,7,3,dark);
  } else if(family==='insect'&&silhouette==='swarm') {
    for(let i=0;i<5;i++){const x=(i%3-1)*14,y=-11-Math.floor(i/3)*17;for(const side of [-1,1]){b.line(x+side*3,y-2,x+side*7,y-6-step,C.ink,2);b.line(x+side*3,y+2,x+side*7,y+6+step,dark,2);}b.oval(x,y,5,8,C.ink);b.oval(x,y-1,4,6,mid);b.line(x,y-5,x,y+3,light);b.dot(x+2,y+4,eye);}
  } else if(family==='beast'||/hound|mammoth/.test(silhouette)) {
    if(/bat|bird|raven|crow|gull|vulture/.test(silhouette)) {
      for(const side of [-1,1]){b.poly([[side*4,-30],[side*19,-43-lean],[side*24,-17],[side*17,-22],[side*12,-12],[side*5,-20]],C.ink);b.poly([[side*6,-29],[side*18,-39-lean],[side*21,-21],[side*14,-23],[side*10,-16]],mid);b.line(side*6,-27,side*17,-28,light);}
      b.oval(0,-25,7,15,C.ink);b.oval(0,-26,5,12,dark);b.rect(-5,-40,10,9,mid);eyes(b,-36,eye,2);b.poly([[-2,-32],[0,-27],[3,-32]],light);
    } else {
      const tall=/bear|boar|hound|werewolf|mammoth/.test(silhouette),h=tall?8:0;
      b.poly([[-18,-15],[-23,-24-h],[-17,-21],[-12,-28-h],[7,-26-h],[18,-18-h],[18,-7],[9,-4],[-13,-4]],C.ink);
      b.poly([[-16,-14],[-18,-20-h],[-10,-25-h],[6,-23-h],[15,-16-h],[14,-8],[7,-6],[-11,-6]],mid);
      b.poly([[-12,-22-h],[0,-24-h],[8,-19-h],[1,-14],[-10,-15]],light);
      for(const x of [-12,9]){b.rect(x-2,-9,5,10,C.ink);b.rect(x-1+step*(x<0?1:-1),-8,3,8,dark);b.rect(x-2,-1,5,2,light);}
      const headY=-29-h+lean;
      b.poly([[7,headY+10],[5,headY-3],[10,headY-12],[14,headY-6],[20,headY-10],[22,headY+1],[24,headY+6],[18,headY+11]],C.ink);
      b.poly([[9,headY+7],[8,headY-2],[11,headY-8],[15,headY-2],[19,headY-6],[20,headY+2],[22,headY+6],[16,headY+8]],mid);
      b.rect(16,headY+1,5,2,light);b.dot(16,headY-2,eye);b.rect(22,headY+5,2,2,C.ink);
      if(/boar|rat|hound|mammoth/.test(silhouette)){b.line(19,headY+9,21,headY+4,C.ivory,2);b.line(-17,-10,-24,-6,dark,2);}
      if(/ram|stag/.test(silhouette)){b.line(9,headY-6,4,headY-17,C.ivory,2);b.line(4,headY-17,-1,headY-14,C.ivory,2);b.line(17,headY-7,22,headY-15,C.ivory,2);}
      if(silhouette==='mammoth'){b.line(22,headY+4,23,headY+19,mid,4);b.line(19,headY+7,16,headY+17,C.ivory,2);}
      if(frame===2)b.rect(17,headY+8,5,3,C.ivory);
    }
  } else if(family==='insect') {
    if(silhouette==='mosquito')for(const side of [-1,1]){b.poly([[side*4,-30],[side*18,-42],[side*23,-34],[side*8,-22]],C.ink);b.poly([[side*6,-29],[side*18,-38],[side*20,-34],[side*9,-25]],C.silver);}
    for(const side of [-1,1])for(let i=0;i<3;i++){const rise=frame===2?-3:0;b.line(side*8,-11-i*6,side*(18+i),-25+i*5+rise,C.ink,3);b.line(side*(18+i),-25+i*5+rise,side*23,-6+i*2+step,mid,2);}
    b.oval(0,-24,12+wide,17,C.ink);b.oval(0,-25,10+wide,14,dark);b.poly([[-9,-29],[-6,-39],[1,-41],[8,-32],[7,-20],[0,-12],[-6,-19]],mid);
    b.line(0,-40,0,-12,light,2);for(let i=0;i<3;i++)b.line(-7,-33+i*6,7,-33+i*6,light);
    b.oval(0,-8,7,6,C.ink);b.oval(0,-9,5,4,mid);eyes(b,-10,eye,2);
    b.poly([[-4,-5],[-9,0],[-9,-7]],light);b.poly([[4,-5],[9,0],[9,-7]],light);
    if(/scorpion|mantis/.test(silhouette)){b.line(6,-35,17,-44,mid,4);b.line(17,-44,21,-38,light,3);b.diamond(20,-35,3,5,eye);}
  } else if(family==='spectral') {
    if(silhouette==='seraph')for(const side of [-1,1]){b.poly([[side*7,-28],[side*23,-45],[side*19,-24],[side*24,-18],[side*13,-15]],C.ink);b.line(side*10,-25,side*21,-40,light,3);b.line(side*12,-19,side*21,-26,mid,3);}
    b.poly([[-13,-5],[-15,-28],[-10,-43],[0,-50],[10,-43],[15,-28],[13,-5],[6,-10],[1,-1],[-4,-7],[-10,-1]],C.ink);
    b.poly([[-10,-8],[-12,-27],[-8,-41],[0,-47],[8,-41],[12,-27],[10,-9],[5,-14],[0,-6],[-5,-11]],dark);
    b.poly([[-7,-37],[-2,-42],[4,-36],[1,-17],[-4,-11]],mid);b.line(-6,-38,-8,-16,light);
    b.oval(0,-36,7,7,C.ink);eyes(b,-38,eye,3);b.rect(-1,-32,3,5,light);
    for(const side of [-1,1]){b.line(side*10,-31,side*19,-22-lean,mid,4);b.line(side*19,-22-lean,side*22,-34-lean,light,2);}
    if(a==='reaper'){b.line(20,-4,20,-45,C.wood,2);b.poly([[20,-44],[9,-49],[-1,-44],[11,-46],[20,-39]],light);}
  } else if(family==='plant') {
    for(const side of [-1,1]){b.poly([[side*4,-13],[side*13,-5],[side*22,0],[side*17,1],[side*7,-3],[side*2,1]],dark);b.line(side*8,-24,side*18,-37-lean,mid,5);b.poly([[side*16,-32-lean],[side*22,-39-lean],[side*19,-28-lean]],light);}
    b.poly([[-10,-5],[-12,-32],[-6,-44],[0,-49],[8,-40],[12,-24],[10,-5]],C.ink);b.poly([[-8,-7],[-9,-31],[-4,-42],[1,-45],[6,-38],[9,-23],[7,-7]],mid);
    b.line(-4,-34,-2,-8,dark,3);b.line(3,-33,5,-9,light,2);b.rect(-7,-36,14,9,dark);eyes(b,-34,eye,3);
    for(let i=0;i<4;i++){const x=(i-2)*5;b.poly([[x,-40],[x-4,-48-(seed%3)],[x+3,-43]],light);}
    if(frame===2)b.diamond(0,-25,4,6,eye);
  } else if(family==='abomination') {
    const hump=seed%5;b.oval(-2,-25,16+wide,19,C.ink);b.oval(-2,-25,13+wide,16,mid);b.oval(-8,-31,7,9,light);
    b.oval(5,-39,10,10,C.ink);b.oval(5,-39,8,8,mid);b.rect(0,-40,12,3,C.ink);b.dot(1,-40,eye);b.dot(10,-40,eye);
    b.rect(1,-34,10,4,C.ink);for(let x=2;x<11;x+=3)b.rect(x,-34,1,2,C.ivory);
    for(const side of [-1,1]){b.line(side*10,-26,side*(20+wide),-18-lean,mid,6);b.line(side*(20+wide),-18-lean,side*19,-4,light,3);b.rect(side*6-2,-9,6,10,dark);}
    for(let i=0;i<3;i++)b.line(-11+i*7,-32,-15+i*6,-45-hump,C.ivory,2);
    b.line(-10,-18,9,-16,dark);b.line(-8,-14,8,-12,dark);if(frame===2)b.oval(1,-21,4,6,eye);
  } else {
    // Armed humanoids: armour, bones, ritual robes and infernal anatomy.
    const skeletal=family==='undead',robe=family==='cultist',demonic=family==='demon',iron=family==='construct';
    const torsoW=9+wide,headY=-40-(seed%3),armY=frame===2?-35:frame===3?-17:-26;
    boots(b,frame,dark,6+Math.floor(wide/2));
    b.poly([[-torsoW,-8],[-torsoW-2,-31],[-5,-36],[7,-35],[torsoW+2,-29],[torsoW,-8]],C.ink);
    b.poly([[-torsoW+2,-9],[-torsoW,-29],[-4,-33],[6,-32],[torsoW,-27],[torsoW-2,-9]],mid);
    b.poly([[-torsoW,-26],[-3,-31],[-1,-11],[-torsoW+2,-12]],light);b.line(1,-30,3,-10,dark,3);
    if(robe){b.poly([[-9,-27],[-14,-4],[-7,-1],[0,-5],[8,-1],[14,-4],[9,-27]],dark);b.line(-7,-25,-10,-5,light);b.line(7,-25,10,-5,mid);}
    if(skeletal){for(let y=-29;y<-13;y+=4){b.line(-7,y,7,y+1,C.ivory);b.dot(0,y,C.ink);}b.rect(-7,-12,15,3,C.ivory);}
    if(iron){for(const side of [-1,1]){b.rect(side*10-3,-31,7,8,C.ink);b.rect(side*10-2,-30,5,5,light);b.rect(side*10-1,-28,2,2,eye);}b.diamond(0,-22,3,5,eye);}
    b.rect(-9,headY-4,18,14,C.ink);b.rect(-7,headY-2,14,10,robe?dark:skeletal?C.ivory:light);b.rect(0,headY-2,7,10,mid);eyes(b,headY+1,eye,3);
    b.rect(-3,headY+6,7,3,dark);if(skeletal)b.rect(-2,headY+7,2,2,C.ivory);
    if(robe){b.poly([[-10,headY+7],[-9,headY-7],[0,headY-12],[9,headY-7],[10,headY+7],[6,headY+3],[0,headY-4],[-6,headY+3]],mid);eyes(b,headY+1,eye,3);}
    if(demonic){for(const side of [-1,1]){b.poly([[side*5,headY-2],[side*12,headY-12],[side*14,headY-6],[side*10,headY+2]],C.ink);b.line(side*7,headY-3,side*12,headY-9,light,2);}b.line(-8,-11,-17,-8,dark,3);b.line(-17,-8,-22,-13,mid,2);}
    for(const side of [-1,1]){b.line(side*(torsoW-1),-29,side*17,armY,C.ink,5);b.line(side*(torsoW-1),-29,side*17,armY,mid,3);b.rect(side*17-2,armY-2,4,4,light);}
    if(a==='archer'){b.line(19,armY-12,23,armY,light,2);b.line(23,armY,19,armY+12,light,2);b.line(19,armY-12,19,armY+12,dark);b.line(9,armY,24,armY,C.ivory);}
    else if(['sorcerer','summoner','spitter'].includes(a)){b.line(18,-3,18,-42,C.wood,2);b.diamond(18,-43,4,5,C.ink);b.diamond(18,-43,2,3,frame===2?C.white:eye);}
    else if(a==='guardian'){b.poly([[12,-30],[23,-26],[22,-12],[16,-7],[10,-14]],C.ink);b.poly([[14,-27],[21,-24],[20,-14],[16,-10],[12,-15]],dark);b.line(16,-25,17,-14,light,2);}
    else {b.line(18,armY+8,18,armY-14,C.wood,2);b.poly([[18,Math.max(-51,armY-20)],[14,armY-10],[18,armY-12],[23,armY-8],[23,armY-14]],light);}
  }
  // Species-specific scars, growths and sigils keep related anatomy distinct.
  for(let i=0;i<4;i++){const x=-8+((seed>>>(i*5))%15),y=-12-i*5;b.rect(x,y,1+(seed>>>(i*3))%3,1,i%2?dark:light);}
  const sigil=(seed%7)+1;b.rect(-3,-18,7,6,dark);for(let i=0;i<3;i++)if(sigil&(1<<i))b.rect(-2+i*2,-17,1,3,eye);
  if(frame===2){b.rect(-1,-24,3,2,eye);b.line(-6,-23,-3,-25,light);}
  if(boss){b.poly([[-10,-45],[-12,-51],[-5,-48],[0,-54],[5,-48],[12,-51],[10,-45]],C.ink);b.line(-9,-47,0,-51,C.fire,2);b.line(0,-51,9,-47,C.flame,2);}
  const key=`enemy:${type}:${frame}:${mirror?1:0}:`;
  if(!boss)return b.finish(key,mirror);
  const sprite=b.finish(key);
  return resize(sprite,Math.min(88,Math.round(52*Math.min(def.size||1.35,1.5))),Math.min(88,Math.round(58*Math.min(def.size||1.35,1.5))),key,mirror);
}

function buildEnemy(type, frame, mirror, objectiveName = '') {
  if(!objectiveName&&!ORIGINAL_ENEMY_TYPES.includes(type))return newCreature(type,ENEMY_TYPES[type]||{},frame,mirror);
  const boss = BOSSES.has(type), wolfType = type === 'wolf' || type === 'frostwolf';
  const wide = TALL_ARMOUR.has(type) || type === 'emberlord', construct = ['obsidian_knight','moon_construct','frost_colossus','echo_guard'].includes(type);
  const width=type==='world_heart'?88:wide?72:boss?64:wolfType?48:type==='void_watcher'?40:construct||type==='skeleton'?36:32;
  const height=TALL_ARMOUR.has(type)?84:type==='world_heart'?88:type==='emberlord'?80:type==='drowned_archon'?74:boss?72:wolfType?28:construct?44:type==='thorn_hunter'?42:40;
  const pivot=type==='world_heart'?[44,80]:type==='drowned_archon'?[32,69]:undefined;
  const b = new Brush(width,height,pivot);
  if(objectiveName) objective(b,objectiveName,frame);
  else if(wolfType) wolf(b,type==='frostwolf',frame);
  else if(type==='slime') slime(b,frame);
  else if(type==='skeleton') skeleton(b,frame);
  else if(['wraith','steppe_raider','thorn_hunter','sand_revenant'].includes(type)) hooded(b,type,frame);
  else if(['jade_stalker','tide_reaver','drowned_archon'].includes(type)) serpent(b,type,frame);
  else if(['obsidian_knight','moon_construct','frost_colossus','echo_guard','frost_sentinel','chronar','skadi'].includes(type)) armoured(b,type,frame);
  else if(type==='imp'||type==='emberlord') demon(b,boss,frame);
  else if(['thorn_guardian','root_matron','thorn_abbess'].includes(type)) plantBoss(b,type,frame);
  else if(type==='storm_king') stormKing(b,frame);
  else if(type==='night_devourer') devourer(b,frame);
  else watcher(b,frame,type==='world_heart');
  return b.finish(`enemy:${type}:${frame}:${mirror?1:0}:${objectiveName}`, mirror);
}

export const PIXEL_PROP_TYPES=Object.freeze(['tombstone','bone_pile','skull_pike','banner','broken_pillar','raven_perch','cart_wreck','stone_lantern','reeds','frost_shards','ash_vent','drowned_marker','fungal_patch']);
function worldProp(variant,frame,detail,key) {
  const b=new Brush(48,58,[24,54]);b.shadow(variant==='cart_wreck'?21:14);
  if(variant==='tombstone'){
    b.poly([[-14,1],[-13,-28],[-7,-39],[4,-42],[13,-34],[14,1]],C.ink);b.poly([[-11,-1],[-10,-27],[-5,-36],[4,-38],[10,-32],[11,-1]],C.stone);b.line(-7,-30,-7,-6,C.grey,2);b.rect(-2,-29,4,18,C.dust);b.rect(-7,-24,14,3,C.dust);b.line(6,-19,2,-12,C.ink);b.line(2,-12,6,-6,C.ink);b.rect(-12,-4,6,2,C.leafDark);b.rect(4,-2,8,2,C.leaf);
  }else if(variant==='bone_pile'){
    for(const [x,y,a] of [[-14,-5,1],[-5,-9,-1],[4,-5,1],[11,-8,-1]]){b.line(x-4,y-a*3,x+6,y+a*3,C.dust,2);b.dot(x-4,y-a*3,C.ivory);b.dot(x+6,y+a*3,C.ivory);}
    b.oval(0,-13,6,6,C.ink);b.oval(0,-14,5,4,C.ivory);b.rect(-4,-14,3,2,C.ironDark);b.rect(2,-14,3,2,C.ironDark);b.rect(-1,-11,2,2,C.woodDark);b.rect(-3,-8,7,2,C.grey);b.line(-6,-21,-14,-18,C.dust,2);b.line(7,-19,16,-16,C.ivory,2);
  }else if(variant==='skull_pike'){
    b.line(-1,1,0,-47,C.ink,5);b.line(-1,-1,0,-45,C.wood,3);b.oval(0,-41,7,7,C.ink);b.oval(0,-42,6,5,C.ivory);b.rect(-5,-43,3,3,C.woodDark);b.rect(2,-43,3,3,C.woodDark);b.rect(-1,-40,2,3,C.grey);b.rect(-4,-36,9,2,C.dust);b.poly([[0,-30],[12,-29],[8,-15],[2,-20]],C.emberDark);b.line(-5,-10,5,-10,C.barkLight);
  }else if(variant==='banner'){
    b.line(-12,1,-12,-48,C.ink,4);b.line(-12,0,-12,-47,C.bark,2);b.diamond(-12,-50,3,3,C.silver);b.line(-14,-44,20,-44,C.iron,2);const sway=frame?2:0;
    b.poly([[-9,-43],[19,-43+sway],[16,-17+sway],[11,-20],[5,-13],[1,-19],[-7,-14]],C.ink);b.poly([[-8,-41],[16,-41+sway],[14,-21+sway],[10,-23],[5,-17],[0,-21],[-5,-18]],C.emberDark);b.line(-5,-36,13,-35+sway,C.barkLight);b.diamond(5,-30,4,6,C.dust);b.line(5,-34,5,-26,C.ash,2);b.rect(11,-25,3,4,C.clear);b.rect(-5,-20,2,3,C.clear);
  }else if(variant==='broken_pillar'){
    b.rect(-18,-6,37,8,C.ink);b.rect(-16,-5,33,5,C.iron);b.poly([[-11,-6],[-12,-31],[-7,-44],[0,-40],[6,-45],[12,-33],[11,-6]],C.ink);b.poly([[-8,-7],[-9,-30],[-5,-40],[0,-36],[6,-40],[9,-32],[8,-7]],C.stone);b.line(-5,-31,-5,-10,C.grey,2);b.line(3,-32,4,-10,C.dark,2);b.rect(-11,-27,23,4,C.dust);b.line(-2,-24,2,-17,C.ink);b.line(2,-17,-1,-13,C.ink);b.rect(13,-7,7,4,C.grey);
  }else if(variant==='raven_perch'){
    b.line(-3,1,-3,-32,C.woodDark,5);b.line(-3,-10,10,-24,C.bark,3);b.line(-3,-20,-15,-28,C.bark,2);b.line(0,-31,13,-32,C.woodDark,3);b.oval(9,-38,5,7,C.ink);b.poly([[5,-35],[0,-31],[6,-32]],C.ironDark);b.oval(10,-43,4,4,C.voidDark);b.dot(12,-44,C.pink);b.poly([[13,-43],[19,-41],[13,-40]],C.sand);b.line(7,-34,7,-31,C.grey);b.line(11,-34,11,-31,C.grey);
  }else if(variant==='cart_wreck'){
    for(const x of [-15,15]){b.oval(x,-6,7,8,C.ink);b.oval(x,-6,5,6,C.wood);b.line(x-4,-6,x+4,-6,C.barkLight);b.line(x,-11,x,-1,C.barkLight);}
    b.rect(-20,-17,39,7,C.woodDark);b.line(-19,-22,17,-18,C.bark,4);for(let x=-17;x<18;x+=7)b.line(x,-17,x+2,-28+detail*2,C.barkLight,3);b.line(-18,-29,15,-24,C.wood,3);b.line(13,-13,22,-1,C.bark,3);b.rect(-8,-23,15,7,C.ironDark);b.rect(-7,-22,13,3,C.iron);
  }else if(variant==='stone_lantern'){
    b.rect(-13,-3,27,5,C.ink);b.rect(-11,-2,23,3,C.stone);b.rect(-4,-29,9,27,C.ink);b.rect(-2,-27,5,24,C.iron);b.poly([[-13,-27],[-13,-44],[0,-51],[13,-44],[13,-27]],C.ink);b.rect(-10,-41,21,13,C.ironDark);b.rect(-7,-39,15,10,C.emberDark);b.diamond(0,-35,3,5,frame?C.fire:C.flame);for(const x of [-9,-1,8])b.rect(x,-42,2,15,C.steel);b.line(-12,-27,12,-27,C.grey,2);b.poly([[-14,-43],[0,-51],[14,-43]],C.stone);
  }else if(variant==='reeds'){
    for(let i=0;i<7;i++){const x=-18+i*6,y=-15-(i%3)*7;b.line(x,0,x+(frame&&i%2?2:-1),y,C.iceDark,2);b.line(x,y+8,x+5,y+3,C.leafDark);b.rect(x-2,y-7,4,8,i%2?C.bark:C.sand);b.rect(x-1,y-6,2,3,C.dust);}
    b.rect(-21,-2,40,3,C.forest);
  }else if(variant==='frost_shards'){
    for(const [x,y,h] of [[-13,-1,22],[0,1,36],[13,-2,25]]){b.poly([[x-6,y],[x-7,y-h+8],[x,y-h],[x+6,y-h+8],[x+5,y]],C.ink);b.poly([[x-4,y-1],[x-5,y-h+9],[x,y-h+3],[x+4,y-h+9],[x+3,y-1]],C.ice);b.line(x-1,y-h+5,x-2,y-3,C.iceLight,2);b.dot(x-2,y-h+7,C.snow);}
  }else if(variant==='ash_vent'){
    b.poly([[-23,0],[-15,-8],[-7,-15],[4,-17],[17,-9],[23,0],[10,3],[-12,3]],C.ink);b.poly([[-19,-1],[-12,-7],[-5,-12],[4,-14],[13,-7],[19,-1]],C.ash);b.line(-10,-4,-3,-7,C.emberDark,2);b.line(-3,-7,2,-4,frame?C.fire:C.ember,2);b.line(2,-4,11,-8,C.emberDark,2);b.dot(0,-6,C.flame);
  }else if(variant==='drowned_marker'){
    b.line(-1,1,-4,-45,C.ink,5);b.line(-1,0,-4,-43,C.wood,3);b.line(-14,-35,11,-37,C.bark,4);b.line(-14,-35,11,-36,C.dust);b.poly([[-11,-34],[10,-35],[7,-23],[-1,-26],[-10,-19]],C.iceDark);b.rect(-2,-32,3,10,C.grey);b.line(-16,-2,-13,-18,C.leafDark,2);b.line(15,0,16,-13,C.leaf,2);b.oval(3,-3,4,2,C.sand);
  }else {
    for(const [x,y,h] of [[-13,-1,11],[0,0,20],[14,1,13]]){b.rect(x-2,y-h+3,4,h-2,C.woodDark);b.rect(x-1,y-h+3,2,h-3,C.dust);b.poly([[x-8,y-h+4],[x-5,y-h-3],[x,y-h-6],[x+6,y-h-2],[x+8,y-h+4]],C.ink);b.poly([[x-6,y-h+2],[x-3,y-h-2],[x,y-h-4],[x+4,y-h-1],[x+6,y-h+2]],C.violet);b.dot(x-2,y-h-1,C.lilac);}
  }
  return b.finish(key);
}

export const PIXEL_CLASS_IDS=Object.freeze(['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder']);
function classAccent(classId,phase,direction,frame,key) {
  const b=new Brush(64,96,[32,70]),dx=[1,0,-1,0][direction],dy=[0,1,0,-1][direction];
  const palettes={guardian:[C.ironDark,C.silver,C.fire],paladin:[C.woodDark,C.ivory,C.flame],ranger:[C.leafDark,C.lime,C.pollen],nightblade:[C.voidDark,C.lilac,C.pink],flamecaller:[C.emberDark,C.fire,C.flame],frostweaver:[C.iceDark,C.iceLight,C.snow],druid:[C.leafDark,C.leafLight,C.pollen],shadowbinder:[C.voidDark,C.violet,C.pink]};
  const [dark,light,bright]=palettes[classId],ax=dx*12,ay=-16+dy*4,shift=frame?3:0;
  if(phase==='dash'){
    for(let i=0;i<5;i++){const x=-dx*(10+i*4)+(i%2?dy*4:-dy*4),y=-12-dy*(10+i*4)+(i%2?-dx*4:dx*4);b.diamond(x,y,i<2?3:2,i<2?4:2,i%2?light:dark);}
    if(classId==='nightblade'||classId==='shadowbinder')b.poly([[-10,-30],[-19,-26],[-26,-14],[-15,-20]],light);
    if(classId==='flamecaller')for(let i=0;i<4;i++)b.poly([[-12+i*7,-5],[-14+i*7,-14-shift],[-9+i*7,-10]],i%2?C.ember:C.fire);
    if(classId==='frostweaver')for(let i=0;i<4;i++)b.diamond(-11+i*7,-7,2,5,C.iceLight);
    if(classId==='druid'||classId==='ranger')for(let i=0;i<3;i++)b.poly([[-14+i*12,-5],[-18+i*12,-10],[-11+i*12,-12]],light);
    if(classId==='guardian'||classId==='paladin'){b.line(-11,-3,11,-3,light,2);b.line(-6,-6,6,-6,bright);}
  }else if(classId==='guardian'){
    b.poly([[ax-5,ay+7],[ax-7,ay-9],[ax,ay-17],[ax+7,ay-9],[ax+5,ay+7],[ax,ay+10]],C.ink);b.poly([[ax-3,ay+5],[ax-5,ay-8],[ax,ay-13],[ax+5,ay-8],[ax+3,ay+5],[ax,ay+7]],dark);b.line(ax,ay-10,ax,ay+5,light,2);b.line(ax-3,ay-4,ax+3,ay-4,bright);
  }else if(classId==='paladin'){
    b.line(ax,ay+11,ax,ay-11,C.wood,3);b.rect(ax-9,ay-17-shift,18,8,C.ink);b.rect(ax-7,ay-15-shift,14,5,light);b.line(ax,ay-17-shift,ax,ay-9-shift,bright,2);b.line(ax-12,ay-12-shift,ax-9,ay-12-shift,bright);b.line(ax+10,ay-12-shift,ax+13,ay-12-shift,bright);
  }else if(classId==='ranger'){
    b.line(ax-5,ay-12,ax+3,ay,C.ink,3);b.line(ax+3,ay,ax-5,ay+12,C.ink,3);b.line(ax-4,ay-10,ax+1,ay,C.sand);b.line(ax+1,ay,ax-4,ay+10,C.sand);b.line(ax-4,ay-10,ax-4,ay+10,light);b.line(ax-11,ay,ax+10+shift,ay,C.ivory);b.poly([[ax+12+shift,ay],[ax+7+shift,ay-3],[ax+7+shift,ay+3]],bright);b.line(ax-10,ay,ax-14,ay-3,light);
  }else if(classId==='nightblade'){
    for(const side of [-1,1]){b.line(ax+side*6,ay+8,ax+side*10,ay-8,C.ink,4);b.line(ax+side*6,ay+5,ax+side*10,ay-6,light,2);b.dot(ax+side*10,ay-9-shift,bright);b.line(ax+side*4,ay+4,ax+side*9,ay+5,C.iron,2);}
  }else if(classId==='flamecaller'){
    b.line(ax,ay+12,ax,ay-16,C.wood,3);b.poly([[ax-8,ay-8],[ax-9,ay-18],[ax-3,ay-27-shift],[ax,ay-17],[ax+5,ay-25],[ax+9,ay-15],[ax+5,ay-8]],dark);b.poly([[ax-5,ay-11],[ax-5,ay-18],[ax-1,ay-23-shift],[ax+2,ay-16],[ax+5,ay-18],[ax+5,ay-11]],light);b.rect(ax-2,ay-17,4,5,bright);
  }else if(classId==='frostweaver'){
    b.line(ax,ay+12,ax,ay-17,C.iron,2);b.diamond(ax,ay-19,7,11,C.ink);b.diamond(ax,ay-19,5,9,light);b.line(ax,ay-25,ax,ay-12,bright,2);b.line(ax-12,ay-19,ax-8,ay-19,light);b.line(ax+9,ay-19,ax+12,ay-19,light);
  }else if(classId==='druid'){
    b.line(ax,ay+13,ax,ay-14,C.bark,3);b.line(ax,ay-7,ax-8,ay-20,dark,3);b.line(ax,ay-8,ax+8,ay-21,dark,3);for(const [x,y] of [[ax-8,ay-22],[ax+8,ay-23],[ax,ay-15]]){b.poly([[x-4,y],[x-2,y-5],[x+4,y-2],[x+2,y+2]],light);b.dot(x,y-2,bright);}
  }else {
    b.line(ax,ay+12,ax,ay-12,C.void,3);b.oval(ax,ay-18,9,11,C.ink);b.oval(ax,ay-19,7,9,dark);b.oval(ax,ay-19,5,3,light);b.rect(ax,ay-22,2,6,C.ink);b.dot(ax,ay-22,bright);for(const side of [-1,1])b.line(ax+side*8,ay-16,ax+side*14,ay-24-shift,light,2);
  }
  if(phase==='cast')for(let i=0;i<4;i++){const a=i*Math.PI/2+frame*.4,x=Math.round(Math.cos(a)*16),y=-5+Math.round(Math.sin(a)*6);b.diamond(x,y,2,3,i%2?bright:light);}
  return b.finish(key);
}

function projectile(variant,direction,frame,key) {
  const b=new Brush(40,40,[20,20]),a=direction*Math.PI/8,dx=Math.cos(a),dy=Math.sin(a),dot=(x,y,c)=>b.dot(dx*x-dy*y,dy*x+dx*y,c);
  const colors=variant==='frost'?[C.iceDark,C.iceLight,C.snow]:variant==='fire'?[C.emberDark,C.fire,C.flame]:variant==='nature'?[C.leafDark,C.lime,C.pollen]:variant==='holy'?[C.bark,C.sand,C.flame]:variant==='hostile'?[C.ash,C.ember,C.pink]:[C.voidDark,C.lilac,C.pink];
  const [dark,light,bright]=colors;
  if(variant==='arrow'){
    for(let x=-16;x<3;x++)dot(x,0,C.ivory);for(let x=-15;x<-10;x++){dot(x,-2,C.grey);dot(x,2,C.grey);}for(let x=0;x<6;x++)for(let y=-3+Math.floor(x/2);y<=3-Math.floor(x/2);y++)dot(x,y,C.silver);dot(5,0,C.ivory);
  }else {
    for(let x=-16;x<-3;x++){const width=Math.max(1,Math.floor((x+17)/5));for(let y=-width;y<=width;y++)if((x+y+frame)%3)dot(x,y,dark);}
    for(let x=-4;x<=5;x++)for(let y=-4;y<=4;y++)if(Math.abs(x)+Math.abs(y)<7)dot(x,y,light);
    for(let x=-2;x<=3;x++)for(let y=-2;y<=2;y++)if(Math.abs(x)+Math.abs(y)<4)dot(x,y,bright);
    if(variant==='frost'){for(let x=-11;x<3;x++)dot(x,-2,C.snow);for(const [x,y] of [[-9,4],[-13,-3],[-4,-5]])dot(x,y,C.iceLight);}
    if(variant==='fire')for(const [x,y] of [[-14,-4],[-10,4],[-6,-5]]){dot(x+frame,y,C.fire);dot(x+frame-1,y,C.emberDark);}
    if(variant==='void'){dot(1,-2,C.ink);dot(1,2,C.ink);dot(0,0,C.white);}
    if(variant==='nature')for(const [x,y] of [[-10,-3],[-7,4],[-3,-4]]){dot(x,y,C.leafLight);dot(x+1,y,C.pollen);}
  }
  return b.finish(key);
}

function impact(variant,frame,key) {
  const b=new Brush(40,40,[20,20]),colors=variant==='frost'?[C.ice,C.iceLight,C.snow]:variant==='void'?[C.void,C.lilac,C.pink]:variant==='nature'?[C.leafDark,C.lime,C.pollen]:variant==='fire'?[C.emberDark,C.fire,C.flame]:[C.emberDark,C.ivory,C.flame];
  const [dark,light,bright]=colors,reach=frame===0?7:frame===1?12:16;
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=Math.round(Math.cos(a)*reach),y=Math.round(Math.sin(a)*reach);b.line(Math.round(x*.45),Math.round(y*.45),x,y,i%2?light:dark,2);b.dot(x,y,bright);}
  if(frame<2){b.diamond(0,0,frame?4:6,frame?6:8,dark);b.line(-3,0,3,0,bright,2);b.line(0,-3,0,3,light,2);}
  return b.finish(key);
}

export const PIXEL_COMPANION_TYPES = Object.freeze(['cinder_moth','ossuary_hound','root_wisp','rime_lynx','gloam_raven','tide_lantern','iron_beetle','moon_eidolon','blood_weasel','abyss_sentinel']);
function companion(type,frame,mirror,key) {
  const quadruped=['ossuary_hound','rime_lynx','blood_weasel'].includes(type),b=new Brush(quadruped?48:40,42,[quadruped?24:20,37]);
  b.shadow(quadruped?15:9);
  if(quadruped){
    wolf(b,type==='rime_lynx',frame);
    b.rect(-7,-6,12,2,type==='blood_weasel'?C.emberDark:C.wood);b.rect(9,-12,2,5,C.fire);b.dot(10,-9,C.flame);
    if(type==='ossuary_hound'){b.rect(8,-19,9,7,C.ivory);b.rect(13,-16,2,2,C.ink);b.rect(17,-13,3,2,C.ironDark);b.rect(-7,-13,8,2,C.silver);}
    if(type==='rime_lynx'){b.line(6,-21,5,-26,C.ink);b.line(13,-22,14,-27,C.ink);b.rect(-9,-12,3,2,C.iceDark);b.rect(-2,-14,3,2,C.iceDark);}
    if(type==='blood_weasel'){b.rect(-6,-16,10,3,C.emberDark);b.line(-14,-9,-21,-17,C.wood,3);b.line(-21,-17,-22,-22,C.sand,2);}
  }else if(type==='cinder_moth'){
    const flap=frame===1?3:0;
    for(const side of [-1,1]){b.poly([[side*2,-25],[side*13,-33+flap],[side*17,-26],[side*11,-20],[side*16,-14],[side*9,-6],[side*2,-17]],C.ink);b.poly([[side*3,-24],[side*12,-30+flap],[side*14,-25],[side*9,-21],[side*13,-14],[side*9,-10],[side*3,-17]],C.bark);b.diamond(side*10,-24+flap,3,4,C.fire);b.diamond(side*9,-14,2,3,C.flame);}
    b.rect(-2,-27,5,17,C.ink);b.rect(-1,-25,3,13,C.emberDark);b.dot(0,-25,C.flame);b.line(-1,-27,-5,-33,C.sand);b.line(2,-27,6,-33,C.sand);
  }else if(type==='gloam_raven'){
    const wing=frame===1?4:0;
    for(const side of [-1,1]){b.poly([[side*3,-20],[side*15,-32+wing],[side*18,-19],[side*13,-15],[side*10,-9],[side*4,-12]],C.ink);b.poly([[side*4,-20],[side*14,-28+wing],[side*15,-19],[side*9,-14]],C.iron);b.line(side*6,-19,side*13,-24+wing,C.silver);}
    b.poly([[-5,-12],[-5,-26],[0,-31],[5,-26],[4,-13],[0,-6]],C.voidDark);b.rect(-3,-26,7,5,C.iron);b.dot(2,-24,C.flame);b.poly([[4,-24],[10,-22],[4,-21]],C.sand);b.line(-2,-10,-5,-5,C.bark);b.line(2,-10,5,-5,C.bark);
  }else if(type==='iron_beetle'){
    for(const side of [-1,1])for(let i=0;i<3;i++){b.line(side*6,-8-i*4,side*13,-10-i*4+(frame===1?2:0),C.ink,2);b.line(side*13,-10-i*4+(frame===1?2:0),side*15,-5-i*4,C.steel);}
    b.oval(0,-16,9,12,C.ink);b.oval(0,-17,7,9,C.iron);b.line(0,-25,0,-9,C.sand,2);b.line(-6,-18,6,-18,C.silver);b.rect(-5,-8,11,6,C.ink);b.rect(-4,-8,9,4,C.wood);eyes(b,-6,C.flame,2);b.line(-3,-7,-8,-2,C.silver);b.line(3,-7,8,-2,C.silver);
  }else if(type==='tide_lantern'){
    b.line(0,-32,0,-36,C.silver,2);b.rect(-5,-31,11,3,C.ink);b.poly([[-10,-25],[-5,-29],[5,-29],[10,-25],[8,-8],[-8,-8]],C.ink);b.rect(-6,-24,13,14,C.ice);b.rect(-4,-22,9,9,C.iceLight);b.diamond(0,-18,3,6,C.snow);for(const x of [-7,0,7])b.rect(x,-24,2,15,C.ironDark);b.rect(-10,-9,21,4,C.steel);b.poly([[-7,-4],[0,1],[7,-4]],C.iceDark);b.dot(0,-1,C.iceLight);
  }else if(type==='abyss_sentinel'){
    boots(b,frame,C.voidDark,5);b.rect(-7,-22,15,18,C.ink);b.rect(-6,-21,13,15,C.iron);b.rect(0,-21,6,15,C.voidDark);b.line(-4,-20,-4,-7,C.silver,2);b.rect(-7,-32,15,12,C.ink);b.rect(-5,-30,11,8,C.void);b.rect(-5,-27,11,2,C.lilac);b.dot(0,-27,C.pink);b.poly([[-8,-22],[-13,-18],[-12,-10],[-7,-7]],C.ironDark);b.line(12,-2,12,-32,C.bark,2);b.poly([[12,-36],[9,-29],[15,-29]],C.silver);b.diamond(0,-14,2,3,C.pink);
  }else if(type==='moon_eidolon'){
    b.poly([[-9,-3],[-10,-19],[-6,-30],[0,-35],[6,-30],[10,-19],[9,-3],[3,-7],[0,-1],[-3,-7]],C.ink);b.poly([[-7,-6],[-7,-19],[-4,-28],[0,-32],[4,-28],[7,-19],[7,-6],[0,-5]],C.void);b.poly([[-3,-29],[-5,-21],[-2,-9],[1,-20],[2,-29]],C.lilac);eyes(b,-25,C.pink,2);b.diamond(0,-17,2,4,C.silver);for(const side of [-1,1])b.line(side*7,-18,side*14,-22+(frame===1?3:0),C.violet,2);
  }else {
    b.poly([[-7,-4],[-11,-15],[-7,-28],[0,-34],[7,-28],[11,-15],[7,-4],[0,0]],C.ink);b.poly([[-5,-5],[-8,-15],[-5,-26],[0,-31],[5,-26],[8,-15],[5,-5],[0,-3]],C.leafDark);b.poly([[-3,-22],[0,-28],[4,-21],[0,-13]],C.lime);eyes(b,-20,C.pollen,2);b.line(-6,-15,-14,-22+(frame===1?2:0),C.leafLight,2);b.line(6,-15,14,-22+(frame===1?2:0),C.leafLight,2);b.dot(-8,-10,C.pollen);b.dot(8,-11,C.pollen);
  }
  return b.finish(key,mirror);
}

function tree(variant, detail) {
  const b = new Brush(56,68,[28,65]); b.shadow(22);
  const burnt = variant === 'burnt', dead = variant === 'dead' || burnt;
  if(dead) {
    b.poly([[-5,1],[-3,-17],[-5,-36],[-2,-53],[2,-59],[4,-39],[3,-21],[6,1]],C.ink);
    b.poly([[-3,0],[-1,-17],[-3,-36],[0,-52],[2,-54],[2,-38],[1,-20],[4,0]],burnt?C.ash:C.wood);
    b.line(-1,-25,-13,-37,burnt?C.woodDark:C.bark,3); b.line(-13,-37,-17,-49,C.woodDark,3);
    b.line(1,-38,12,-48,C.woodDark,3); b.line(12,-48,16,-59,C.woodDark,2);
    b.line(2,-18,14,-29,C.woodDark,3); b.line(14,-29,23,-41,C.woodDark,2);
    b.line(-8,-31,-20,-25,C.woodDark,2); b.line(-20,-25,-24,-33,C.woodDark,2);
    b.rect(0,-21,1,18,burnt?C.emberDark:C.barkLight);
    if(burnt){b.rect(-4,-38,2,2,C.ember);b.dot(-3,-37,C.fire);b.rect(2,-20,2,3,C.emberDark);}
    else {b.rect(-4,-15,3,1,C.barkLight);b.rect(3,-38,2,2,C.bark);}
  } else if(variant==='pine') {
    b.rect(-3,-17,7,18,C.ink); b.rect(-2,-16,5,16,C.wood); b.rect(-1,-15,1,12,C.barkLight);
    const tiers=[[-52,11],[-39,17],[-24,24]];
    for(const [y,w] of tiers) {
      b.poly([[-w,y+16],[0,y-12],[w,y+16],[w-5,y+20],[-w+5,y+20]],C.ink);
      b.poly([[-w+2,y+16],[0,y-9],[w-2,y+16],[w-6,y+18],[-w+6,y+18]],C.iceDark);
      b.poly([[-w+4,y+11],[0,y-9],[w-9,y+9],[w-4,y+13],[7,y+12],[0,y+16],[-10,y+13]],C.iceMid);
      b.poly([[-w+5,y+10],[0,y-9],[w-11,y+7],[3,y+5],[-3,y+9]],C.snow);
      b.rect(-w+6,y+13,5,1,C.iceLight); b.rect(2,y+12,4,1,C.iceLight);
    }
  } else {
    b.poly([[-6,1],[-4,-19],[-5,-37],[4,-42],[6,-24],[7,1]],C.ink);
    b.poly([[-4,0],[-2,-19],[-3,-36],[3,-39],[4,-24],[5,0]],C.wood);
    b.rect(1,-24,2,23,C.barkLight); b.line(-1,-20,-12,-34,C.bark,3); b.line(3,-25,14,-40,C.bark,3);
    const edge=[[-24,-31],[-27,-40],[-24,-49],[-19,-51],[-20,-56],[-13,-62],[-5,-62],[-1,-65],[8,-64],[14,-60],[20,-59],[22,-53],[26,-48],[25,-37],[21,-29],[14,-26],[7,-28],[0,-25],[-8,-28],[-15,-26]];
    b.poly(edge,C.ink);
    b.poly([[-22,-32],[-24,-41],[-21,-49],[-16,-51],[-17,-55],[-12,-60],[-5,-60],[0,-62],[8,-61],[13,-58],[19,-57],[20,-51],[23,-47],[22,-37],[19,-31],[13,-29],[7,-31],[0,-28],[-8,-31],[-14,-29]],C.leafDark);
    b.poly([[-20,-43],[-17,-53],[-10,-58],[-3,-57],[1,-60],[10,-57],[13,-50],[21,-47],[19,-39],[10,-37],[3,-40],[-4,-36],[-13,-38]],C.leaf);
    b.poly([[-17,-48],[-12,-57],[-5,-55],[-1,-59],[7,-57],[10,-52],[8,-46],[0,-48],[-7,-43],[-13,-45]],C.leafLight);
    b.poly([[9,-50],[13,-55],[18,-51],[21,-47],[18,-42],[13,-42]],C.leafLight);
    const clusters=[[-12,-53,4,2],[-5,-57,4,1],[-15,-47,3,2],[-2,-49,5,2],[6,-54,3,1],[15,-48,3,2],[-8,-41,3,1],[4,-44,3,2],[10,-36,2,1],[-17,-37,3,1]];
    for(let i=0;i<clusters.length;i++){const [x,y,w,h]=clusters[i];b.rect(x+(detail===1&&i%3===0?1:0),y,w,h,i%3?C.lime:C.pollen);}
    b.rect(-18,-33,4,2,C.forest);b.rect(15,-34,4,2,C.forest); b.rect(-2,-33,3,2,C.forest);
  }
  return b;
}

function resize(source, w, h, key, mirror = false) {
  const b = new Brush(w,h,[Math.round(source.pivot[0]*w/source.width),Math.round(source.pivot[1]*h/source.height)]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)b.pixels[y*w+x]=source.pixels[Math.min(source.height-1,Math.floor(y*source.height/h))*source.width+Math.min(source.width-1,Math.floor(x*source.width/w))];
  return b.finish(key,mirror);
}

function rock(variant, detail, key) {
  const b=new Brush(32,24,[16,19]);b.shadow(13);
  const cold=variant==='ice',ash=variant==='ash';
  const dark=cold?C.iceDark:ash?C.ash:C.dark,mid=cold?C.iceMid:ash?C.ironDark:C.stone,light=cold?C.iceLight:ash?C.iron:C.grey;
  b.poly([[-13,1],[-12,-8],[-6,-15],[5,-16],[12,-10],[15,-3],[12,3],[1,5],[-8,4]],C.ink);
  b.poly([[-11,0],[-10,-7],[-5,-13],[5,-14],[10,-9],[13,-3],[11,1],[1,3],[-7,2]],mid);
  b.poly([[-10,-7],[-5,-13],[5,-14],[7,-10],[2,-5],[-5,-4]],light);
  b.poly([[6,-12],[10,-9],[13,-3],[11,1],[1,3],[2,-5]],dark);
  b.line(-4,-11,2,-12,cold?C.snow:ash?C.steel:C.dust,1);
  b.line(-6,-3,-2,-4,dark,1);b.line(-2,-4,0,0,dark,1);
  b.rect(detail?-9:-7,-7,2,1,cold?C.snow:light);
  if(ash){b.line(3,-10,0,-6,C.emberDark);b.dot(1,-7,C.ember);}
  if(cold){b.rect(-7,-11,2,1,C.snow);b.rect(6,-6,1,3,C.iceLight);}
  return b.finish(key);
}

/** Inspectable native sprite. kind is 'enemy', 'companion', 'tree' or 'rock'. */
export function getPixelSprite(kind, subject = {}, time = 0) {
  if(kind==='prop'){
    const variant=PIXEL_PROP_TYPES.includes(subject.variant)?subject.variant:'tombstone',detail=Math.abs(Math.floor((subject.x||0)*.07+(subject.y||0)*.03))%2,frame=['banner','reeds','stone_lantern','ash_vent'].includes(variant)?Math.floor(Math.max(0,time)*3)%2:0,key=`prop:${variant}:${frame}:${detail}`;
    return remember(key,()=>worldProp(variant,frame,detail,key));
  }
  if(kind==='classAccent'){
    const classId=PIXEL_CLASS_IDS.includes(subject.classId)?subject.classId:'guardian',phase=['cast','dash','strike'].includes(subject.accentPhase)?subject.accentPhase:'strike',face=subject.face||0,direction=((Math.round(face/(Math.PI/2))%4)+4)%4,frame=subject.accentFrame===1?1:0,key=`classAccent:${classId}:${phase}:${direction}:${frame}`;
    return remember(key,()=>classAccent(classId,phase,direction,frame,key));
  }
  if(kind==='projectile'){
    const variant=['arrow','fire','frost','nature','holy','void','hostile'].includes(subject.variant)?subject.variant:'void',direction=((Math.round((subject.angle||0)/(Math.PI/8))%16)+16)%16,frame=subject.projectileFrame===1?1:0,key=`projectile:${variant}:${direction}:${frame}`;
    return remember(key,()=>projectile(variant,direction,frame,key));
  }
  if(kind==='impact'){
    const variant=['frost','void','nature','fire','physical'].includes(subject.variant)?subject.variant:'physical',frame=Math.max(0,Math.min(2,subject.impactFrame||0)),key=`impact:${variant}:${frame}`;
    return remember(key,()=>impact(variant,frame,key));
  }
  if(kind==='companion'){
    const type=PIXEL_COMPANION_TYPES.includes(subject.visualType||subject.type)?subject.visualType||subject.type:'root_wisp',frame=frameFor({...subject,moving:subject.walking??subject.moving??true},time),mirror=Math.cos(subject.face||0)<-.25,key=`companion:${type}:${frame}:${mirror?1:0}`;
    return remember(key,()=>companion(type,frame,mirror,key));
  }
  if(kind==='enemy') {
    const type=PIXEL_ENEMY_TYPES.includes(subject.type)?subject.type:'void_watcher', frame=frameFor(subject,time);
    const face=Number.isFinite(subject.face)?subject.face:0,mirror=Math.cos(face)<-.25;
    const objectiveName=subject.bossObjectiveId&&subject.stationary?(/Dornen|Knospe/i.test(subject.name||'')?'Dornenknospe':/Seele|Hungrig/i.test(subject.name||'')?'Hungrige Seele':'Prismatischer Anker'):'';
    const key=`enemy:${type}:${frame}:${mirror?1:0}:${objectiveName}`;
    return remember(key,()=>buildEnemy(type,frame,mirror,objectiveName));
  }
  if(kind==='tree') {
    const variant=['oak','pine','dead','burnt'].includes(subject.variant)?subject.variant:'oak';
    const size=subject.scale<.86?'small':subject.scale>1.18?'large':'normal',detail=Math.abs(Math.floor((subject.x||0)*.13+(subject.y||0)*.07))%2;
    const key=`tree:${variant}:${size}:${detail}`;
    return remember(key,()=>{const base=tree(variant,detail).finish(key);return size==='small'?resize(base,42,51,key):size==='large'?resize(base,64,78,key):base;});
  }
  if(kind==='rock') {
    const variant=['ice','ash','stone'].includes(subject.variant)?subject.variant:'stone',detail=Math.abs(Math.floor((subject.x||0)+(subject.y||0)))%2;
    const size=subject.scale<.8?'small':subject.scale>1.2?'large':'normal',key=`rock:${variant}:${size}:${detail}`;
    return remember(key,()=>{const base=rock(variant,detail,key);return size==='small'?resize(base,24,18,key):size==='large'?resize(base,40,30,key):base;});
  }
  throw new RangeError(`Unknown pixel sprite family: ${kind}`);
}

function draw(c,sprite,x,y) {
  // Every world cell starts on the same even coordinate; the root renderer
  // renders at half resolution and upsamples without interpolation.
  const left=Math.round((Number.isFinite(x)?x:0)/2)*2-sprite.pivot[0]*2;
  const top=Math.round((Number.isFinite(y)?y:0)/2)*2-sprite.pivot[1]*2;
  let canvas=canvasCache.get(sprite.key);
  if(canvas===undefined&&typeof document!=='undefined'&&typeof c.drawImage==='function') {
    const candidate=document.createElement?.('canvas'),ctx=candidate?.getContext?.('2d');
    if(ctx&&typeof ctx.fillRect==='function') {
      candidate.width=sprite.width;candidate.height=sprite.height;ctx.imageSmoothingEnabled=false;
      for(const run of sprite.runs){ctx.fillStyle=sprite.palette[run.colour];ctx.fillRect(run.x,run.y,run.w,run.h);}
      canvas=candidate;canvasCache.set(sprite.key,canvas);
    } else {canvas=null;canvasCache.set(sprite.key,null);}
  }
  if(canvas) {c.imageSmoothingEnabled=false;c.drawImage(canvas,left,top,sprite.width*2,sprite.height*2);}
  else {for(const run of sprite.runs){c.fillStyle=sprite.palette[run.colour];c.fillRect(left+run.x*2,top+run.y*2,run.w*2,run.h*2);}}
  return {x:left,y:top,w:sprite.width*2,h:sprite.height*2,pivotX:left+sprite.pivot[0]*2,pivotY:top+sprite.pivot[1]*2};
}

export function drawPixelProp(c,p,time=0){return draw(c,getPixelSprite('prop',p,time),p.x,p.y);}
export function drawPixelClassAccent(c,p){return draw(c,getPixelSprite('classAccent',p),p.x,p.y);}
export function drawPixelProjectile(c,p){return draw(c,getPixelSprite('projectile',p),p.x,p.y);}
export function drawPixelImpact(c,p){return draw(c,getPixelSprite('impact',p),p.x,p.y);}
export function drawPixelTree(c,t,time=0) {return draw(c,getPixelSprite('tree',t,time),t.x,t.y);}
export function drawPixelRock(c,r) {return draw(c,getPixelSprite('rock',r),r.x,r.y);}
export function drawPixelCompanion(c,p,time=0){return draw(c,getPixelSprite('companion',p,time),p.x,p.y);}
export function drawPixelEnemy(c,e,time=0) {return draw(c,getPixelSprite('enemy',e,time),e.x,e.y);}
/** Safe label offset above the highest native pixel, including raised weapons. */
export function pixelEnemyHeight(type) {
  let height = 0;
  for (const phase of ['idle','windup','recover']) {
    const sprite=getPixelSprite('enemy',{type,phase},0);
    const first=sprite.runs.reduce((top,run)=>Math.min(top,run.y),sprite.height);
    height=Math.max(height,(sprite.pivot[1]-first)*2);
  }
  return height;
}
export function pixelWorldCacheInfo() {return {sprites:cache.size,canvases:canvasCache.size,limit:PIXEL_WORLD_STYLE.cacheLimit};}
export function clearPixelWorldCache() {cache.clear();canvasCache.clear();}

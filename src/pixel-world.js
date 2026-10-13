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

export const PIXEL_WORLD_PALETTE = Object.freeze([
  null, '#202a2b', '#33423d', '#4f5946', '#76775a', '#a8a078', '#ded1a1',
  '#34372b', '#4b5131', '#626c38', '#83934d', '#b1bd68', '#d6d88f',
  '#3e302b', '#614837', '#886443', '#b88d59', '#e1b57a',
  '#413942', '#665767', '#94839a', '#c1aec5', '#ede0e1',
  '#29454d', '#3e6973', '#66939e', '#9bc6cf', '#d6edf0',
  '#553737', '#8b4b3d', '#c06b47', '#ed9b59', '#ffe0a0',
  '#433451', '#685079', '#9772ac', '#c19dcd', '#edc5e4', '#17292a80',
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

export const PIXEL_ENEMY_TYPES = Object.freeze([
  'wolf', 'slime', 'frostwolf', 'skeleton', 'wraith', 'imp',
  'thorn_guardian', 'frost_sentinel', 'emberlord', 'steppe_raider',
  'jade_stalker', 'tide_reaver', 'thorn_hunter', 'obsidian_knight',
  'moon_construct', 'frost_colossus', 'sand_revenant', 'void_watcher',
  'echo_guard', 'root_matron', 'drowned_archon', 'thorn_abbess', 'chronar',
  'skadi', 'storm_king', 'night_devourer', 'world_heart',
]);

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

function buildEnemy(type, frame, mirror, objectiveName = '') {
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

function resize(source, w, h, key) {
  const b = new Brush(w,h,[Math.round(source.pivot[0]*w/source.width),Math.round(source.pivot[1]*h/source.height)]);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)b.pixels[y*w+x]=source.pixels[Math.min(source.height-1,Math.floor(y*source.height/h))*source.width+Math.min(source.width-1,Math.floor(x*source.width/w))];
  return b.finish(key);
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

/** Inspectable native sprite. kind is 'enemy', 'tree' or 'rock'. */
export function getPixelSprite(kind, subject = {}, time = 0) {
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

export function drawPixelTree(c,t,time=0) {return draw(c,getPixelSprite('tree',t,time),t.x,t.y);}
export function drawPixelRock(c,r) {return draw(c,getPixelSprite('rock',r),r.x,r.y);}
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

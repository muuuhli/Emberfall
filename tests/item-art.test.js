import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { ITEM_BASES } from '../src/loot.js';
import { ITEMS, RESOURCES } from '../src/catalog.js';
import { EQUIPMENT_SLOTS } from '../src/equipment-system.js';
import { ITEM_ART_STYLE, ITEM_ART_PALETTE, ITEM_ART_FAMILIES, itemArtDescriptor, getPixelItem, itemSpriteMarkup, drawPixelItem, itemArtCacheInfo, clearItemArtCache } from '../src/item-art.js';

const catalog = [...ITEM_BASES, ...Object.values(ITEMS), ...Object.entries(RESOURCES).map(([id, item]) => ({ ...item, id, type: 'resource' }))];
const digest = sprite => createHash('sha256').update(JSON.stringify(sprite.runs)).digest('hex');
function context() {
  return { globalAlpha: .8, imageSmoothingEnabled: true, fillStyle: '#abcdef', stack: [], rects: [],
    save() { this.stack.push([this.globalAlpha, this.imageSmoothingEnabled, this.fillStyle]); },
    restore() { [this.globalAlpha, this.imageSmoothingEnabled, this.fillStyle] = this.stack.pop(); },
    fillRect(x, y, w, h) { this.rects.push({ x, y, w, h, fill: this.fillStyle, alpha: this.globalAlpha }); },
  };
}

test('all authored equipment, fixed supplies and resources resolve to dense transparent pixel objects', () => {
  const families = new Set(), silhouettes = new Set();
  for (const item of [...catalog, { id: 'gold' }, { id: 'unknown-world-loot' }]) {
    const before = structuredClone(item), d = itemArtDescriptor(item), sprite = getPixelItem(item);
    assert.deepEqual(item, before); assert.equal(d.version, 1); assert.ok(ITEM_ART_FAMILIES.includes(d.family));
    assert.equal(sprite.width, 32); assert.equal(sprite.height, 32); assert.ok(sprite.pixelCount >= 70 && sprite.pixelCount < 900, `${item.id} pixel density`);
    assert.equal(sprite.palette, ITEM_ART_PALETTE); assert.ok(Object.isFrozen(sprite) && Object.isFrozen(sprite.runs) && Object.isFrozen(d));
    assert.ok(sprite.runs.every(run => Number.isInteger(run.x) && Number.isInteger(run.y) && run.h === 1 && run.w > 0 && run.x >= 0 && run.x + run.w <= 32 && run.y >= 0 && run.y < 32 && run.color > 0 && run.color < 25));
    assert.equal(sprite.pixelCount, sprite.runs.reduce((sum, run) => sum + run.w, 0)); families.add(d.family);
    const mask = new Uint8Array(1024); for (const run of sprite.runs) mask.fill(1, run.y * 32 + run.x, run.y * 32 + run.x + run.w);
    silhouettes.add(createHash('sha256').update(mask).digest('hex'));
  }
  assert.equal(families.size, ITEM_ART_FAMILIES.length); assert.ok(silhouettes.size >= 24, 'at least 24 genuinely distinct filled object silhouettes');
  assert.equal(ITEM_ART_PALETTE.length, 25); assert.equal(ITEM_ART_PALETTE[0], null); assert.ok(ITEM_ART_PALETTE.slice(1).every(c => /^#[0-9a-f]{6}$/.test(c)));
});

test('seven equipment slots and unusual canonical weapons have concrete object identities', () => {
  const expected = { iron_longsword: 'sword', twilight_daggers: 'daggers', vanguard_axe: 'axe', oath_hammer: 'hammer', grave_halberd: 'spear', reliquary_flail: 'flail', greenwood_bow: 'bow', witchhunter_crossbow: 'crossbow', ember_wand: 'staff', rime_scepter: 'scepter', ash_tongue_grimoire: 'grimoire', funeral_lantern: 'lantern', crypt_candle: 'candle', pyre_censer: 'censer', bell_of_embers: 'bell', reaper_hourglass: 'hourglass', obsidian_soulmirror: 'mirror', last_winter_crown: 'circlet', soul_focus: 'orb' };
  for (const [id, family] of Object.entries(expected)) assert.equal(itemArtDescriptor({ id }).family, family, id);
  for (const slot of EQUIPMENT_SLOTS) assert.ok(ITEM_BASES.some(base => (base.slot || base.type) === slot.id && itemArtDescriptor(base).family !== 'bag'), slot.id);
  assert.equal(itemArtDescriptor({ id: 'relic_helmet_1_1' }).family, 'helm');
  assert.equal(itemArtDescriptor({ id: 'relic_helmet_1_2' }).family, 'hood');
  assert.equal(itemArtDescriptor({ id: 'relic_helmet_1_3' }).family, 'circlet');
});

test('actual resources, gems and food keep their silhouettes and elemental colour roles', () => {
  const expected = { wood: 'log', ore: 'ore', herb: 'herb', wheat: 'wheat', seed: 'seed', dust: 'dust', ruby: 'crystal', sapphire: 'crystal', emerald: 'crystal', crystal: 'crystal', raidSigil: 'talisman', gold: 'gold', hearty_meal: 'bread', mourning_stew: 'stew', blackgrain_ration: 'ration' };
  for (const [id, family] of Object.entries(expected)) assert.equal(itemArtDescriptor({ id }).family, family);
  assert.equal(itemArtDescriptor({ id: 'heal_potion' }).element, 'fire'); assert.equal(itemArtDescriptor({ id: 'mana_potion' }).element, 'frost');
  assert.equal(itemArtDescriptor({ id: 'ruby' }).element, 'fire'); assert.equal(itemArtDescriptor({ id: 'emerald' }).element, 'nature');
  assert.notEqual(digest(getPixelItem({ id: 'heal_potion' })), digest(getPixelItem({ id: 'mana_potion' })));
  assert.equal(new Set(['none', 'fire', 'frost', 'nature', 'void', 'holy'].map(element => digest(getPixelItem({ baseId: 'starfall_staff', rarity: 'rare', element })))).size, 6, 'rarity fittings preserve all six elemental gem colours');
  assert.equal(itemArtDescriptor({ baseId: 'iron_longsword', sockets: [{ id: 'sapphire', tier: 2 }] }).element, 'frost');
  assert.equal(itemArtDescriptor({ baseId: 'iron_longsword', setId: 'abyssal_pact' }).element, 'void');
});

test('rarity fittings and progression vary art without borrowing rolled stats or names', () => {
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
  assert.equal(new Set(rarities.map(rarity => digest(getPixelItem({ baseId: 'iron_longsword', rarity, level: 27 })))).size, 5);
  for (const [level, tier] of [[1, 0], [20, 1], [50, 2], [80, 3], [NaN, 0], [1000000, 3]]) assert.equal(itemArtDescriptor({ baseId: 'iron_longsword', level }).tier, tier);
  const item = { id: 'loot:uuid', baseId: 'grave_halberd', rarity: 'rare', level: 27, name: 'Name A', stats: { damage: 99999999 }, classId: 'ranger' };
  const d = itemArtDescriptor(item), changed = itemArtDescriptor({ ...item, id: 'loot:other', name: 'Name B', stats: { damage: 0 } });
  assert.deepEqual(d, changed); assert.equal(itemArtDescriptor({ ...item, rarity: 'mythic' }).rarity, 'legendary');
  assert.equal(itemArtDescriptor({ ...item, rarity: '__proto__', element: 'url(evil)' }).rarity, ITEMS.grave_halberd.rarity);
});

test('Canvas fallback paints exactly the canonical cells at a documented centre anchor', () => {
  const item = { id: 'iron_longsword', rarity: 'rare' }, sprite = getPixelItem(item), ctx = context();
  assert.equal(drawPixelItem(ctx, item, 16, 16), true);
  assert.deepEqual(ctx.rects.map(({ x, y, w, h, fill }) => ({ x, y, w, h, fill })), sprite.runs.map(run => ({ x: run.x, y: run.y, w: run.w, h: run.h, fill: sprite.palette[run.color] })));
  assert.equal(ctx.globalAlpha, .8); assert.equal(ctx.imageSmoothingEnabled, true); assert.equal(ctx.fillStyle, '#abcdef'); assert.equal(ctx.stack.length, 0);
  const scaled = context(); drawPixelItem(scaled, item, 30.2, 41.7, { size: 48, opacity: .5 });
  assert.ok(scaled.rects.every(run => [run.x, run.y, run.w, run.h].every(Number.isInteger) && run.alpha === .4));
  assert.ok(scaled.rects.every(run => run.x >= 6 && run.x + run.w <= 54 && run.y >= 18 && run.y + run.h <= 66));
  assert.equal(drawPixelItem(scaled, item, NaN, 1), false); assert.equal(drawPixelItem(scaled, item, 1, 1, { size: Infinity }), false);
});

test('SVG uses the exact same opaque cell runs, crisp edges and inline stroke protection', () => {
  const item = { id: 'frost_blade' }, sprite = getPixelItem(item), svg = itemSpriteMarkup(item);
  assert.match(svg, /viewBox="0 0 32 32"/); assert.match(svg, /shape-rendering="crispEdges"/); assert.match(svg, /aria-hidden="true"/);
  assert.ok(!/<(?:image|filter|linearGradient|circle|line)\b/.test(svg));
  const paths = [...svg.matchAll(/<path d="([^"]+)" style="fill:(#[0-9a-f]{6});stroke:none"\/>/g)];
  const cells = paths.flatMap(([, path, fill]) => [...path.matchAll(/M(\d+) (\d+)h(\d+)v1h-(\d+)z/g)].map(([, x, y, w, sameW]) => { assert.equal(w, sameW); return { x: +x, y: +y, w: +w, fill }; }));
  assert.deepEqual(cells.sort((a, b) => a.y - b.y || a.x - b.x), sprite.runs.map(run => ({ x: run.x, y: run.y, w: run.w, fill: sprite.palette[run.color] })));
});

test('SVG escaping and fixed palette contain hostile names, classes and fake canonical IDs', () => {
  const item = { id: 'loot:<script>', baseId: 'iron_longsword', name: '\"><script>alert(1)</script>&\' onload="x', rarity: 'url(evil)', element: '#ff00ff" onload="evil' };
  const svg = itemSpriteMarkup(item, { decorative: false, className: 'item-thumb x" onload="evil <script>' });
  assert.match(svg, /class="pixel-item-art item-thumb"/); assert.match(svg, /role="img"/); assert.match(svg, /aria-label="&quot;&gt;&lt;script&gt;/);
  assert.ok(!svg.includes('<script>') && !svg.includes('onload="') && !svg.includes('url('));
  assert.equal(itemArtDescriptor({ id: '__proto__', name: 'greenwood_bow' }).family, 'bag');
  assert.equal(itemArtDescriptor({ id: 'constructor' }).canonicalId, 'unknown');
});

test('loot UIDs and custom names never create art caches or leak into canonical keys', () => {
  clearItemArtCache(); let first;
  for (let i = 0; i < 2000; i++) {
    const item = { id: `loot:${i}`, baseId: 'iron_longsword', rarity: 'rare', level: 27, name: `Player ${i}` };
    const sprite = getPixelItem(item); first ??= sprite; assert.equal(sprite, first); assert.ok(!sprite.key.includes('loot:') && !sprite.key.includes('Player'));
    itemSpriteMarkup(item, { decorative: false });
  }
  assert.equal(itemArtCacheInfo().sprites, 1); assert.equal(itemArtCacheInfo().svgBodies, 1);
  assert.notEqual(itemSpriteMarkup({ baseId: 'iron_longsword', name: 'A' }, { decorative: false }), itemSpriteMarkup({ baseId: 'iron_longsword', name: 'B' }, { decorative: false }));
  const unknowns = new Set(Array.from({ length: 1000 }, (_, i) => itemArtDescriptor({ id: `foreign-${i}`, name: `evil ${i}` }).key)); assert.equal(unknowns.size, 1);
});

test('all authored combinations retain bounded sprite and SVG LRUs', () => {
  clearItemArtCache();
  for (const base of ITEM_BASES.slice(0, 90)) for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary']) for (const level of [1, 27, 60, 100]) itemSpriteMarkup({ baseId: base.id, rarity, level });
  const info = itemArtCacheInfo(); assert.equal(info.sprites, ITEM_ART_STYLE.cacheLimit); assert.equal(info.svgBodies, ITEM_ART_STYLE.cacheLimit); assert.equal(info.bitmaps, 0);
});

test('browser bitmap path caches one draw surface per finite style and evicts its backing store', () => {
  const previous = globalThis.OffscreenCanvas, surfaces = [];
  class MockCanvas {
    constructor(width, height) { this.width = width; this.height = height; this.ctx = context(); surfaces.push(this); }
    getContext(kind) { assert.equal(kind, '2d'); return this.ctx; }
  }
  try {
    globalThis.OffscreenCanvas = MockCanvas; clearItemArtCache(); const ctx = context(); ctx.images = []; ctx.drawImage = (...args) => ctx.images.push(args);
    drawPixelItem(ctx, { id: 'iron_longsword' }, 16, 16); drawPixelItem(ctx, { id: 'iron_longsword' }, 16, 16);
    assert.equal(surfaces.length, 1); assert.equal(ctx.images.length, 2); assert.equal(ctx.rects.length, 0); assert.ok(surfaces[0].ctx.rects.length > 50);
    assert.deepEqual(ctx.images[0].slice(1), [0, 0, 32, 32]); assert.equal(ctx.globalAlpha, .8);
    for (const base of ITEM_BASES.slice(0, 90)) for (const rarity of ['common', 'rare', 'legendary']) drawPixelItem(ctx, { baseId: base.id, rarity, level: 80 }, 16, 16);
    assert.equal(itemArtCacheInfo().bitmaps, 128); assert.equal(surfaces[0].width, 0); assert.equal(surfaces[0].height, 0);
  } finally { clearItemArtCache(); if (previous === undefined) delete globalThis.OffscreenCanvas; else globalThis.OffscreenCanvas = previous; }
});

test('own asset manifest lists every native object family and original source provenance', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../assets/item-art-manifest.json', import.meta.url)));
  assert.equal(manifest.nativeSize[0], 32); assert.equal(manifest.nativeSize[1], 32); assert.equal(manifest.source, 'src/item-art.js');
  assert.deepEqual(manifest.palette, ITEM_ART_PALETTE); assert.equal(manifest.families.length, ITEM_ART_FAMILIES.length);
  assert.deepEqual(new Set(manifest.families.map(row => row.family)), new Set(ITEM_ART_FAMILIES)); assert.equal(manifest.provenance.thirdPartyContent, false);
  for (const row of manifest.families) { assert.equal(itemArtDescriptor(row.representative).family, row.family); assert.ok(getPixelItem(row.representative).pixelCount >= 70); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { ITEMS, RESOURCES, RECIPES } from '../src/catalog.js';
import { generateLoot } from '../src/loot.js';
import { EQUIPMENT_SLOTS } from '../src/equipment-system.js';
import { itemArtDescriptor, itemSpriteMarkup } from '../src/item-art.js';
import { NoticeQueue } from '../src/ui-notices.js';

function fixture(level = 100) {
  const game = new Game({ storage:null, random:() => .5 });
  game.player.level = level; game.player.gold = 10000; game.start();
  const ui = Object.assign(Object.create(GameUI.prototype), { game, inventoryTab:'equipment', inventoryPage:0, inventorySearch:'', inventoryType:'all', inventoryRarity:'all', inventoryFlags:'all', inventorySort:'default', craftFilter:'all', activePanel:null });
  return { game, ui };
}
let serial = 0;
function loot(game, baseId = 'iron_longsword', level = game.player.level, changes = {}) {
  const item = generateLoot({ baseId, level, classId:game.player.classId, rarity:'rare', rng:() => .5, uid:`pixel-ui-${++serial}`, ...changes });
  assert.equal(game.addItem(item), true); return item;
}
const state = game => { const data = structuredClone(game.capture()); delete data.savedAt; return data; };
const art = item => itemSpriteMarkup(item, { decorative:true });
const cards = markup => [...markup.matchAll(/<button type="button" class="item-grid-card [\s\S]*?<\/button>/g)].map(match => match[0]);

// These exercise production UI with canonical Game items and the real shared art,
// without claiming to measure browser layout or to replace the visual smoke check.
test('each of seven real equipped objects keeps the same pixel image in bag, belt, paperdoll and slot list', () => {
  const { game, ui } = fixture(), bases = { weapon:'iron_longsword', armor:'grave_heavy_8', charm:'grave_martial_charm_8', helmet:'relic_helmet_4_1', gloves:'relic_gloves_4_2', boots:'relic_boots_4_2', ring:'relic_ring_4_1' };
  const items = EQUIPMENT_SLOTS.map(slot => { const item = loot(game, bases[slot.id]); assert.equal(game.equip(item.id), true); return item; });
  assert.equal(new Set(items.map(item => itemArtDescriptor(item).family)).size, 7, 'The seven places depict seven recognizable object families.');
  const before = state(game), bag = cards(ui.inventory());
  for (const markup of [ui.equipmentBelt(), ui.paperdoll(), ui.equipmentSlots()]) {
    assert.equal((markup.match(/class="pixel-item-art"/g) || []).length, 7);
    for (const item of items) assert.ok(markup.includes(art(item)), item.id);
  }
  for (const item of items) {
    const card = bag.find(markup => markup.includes(`data-id="${item.id}"`)); assert.ok(card, item.id);
    assert.ok(card.includes(art(item))); assert.match(card, /aria-pressed="(?:true|false)"/); assert.match(card, /angelegt/);
    assert.doesNotMatch(card, /<use href="#i-(?:sword|shield|gem|helmet|gloves|boots|ring)"/);
  }
  assert.deepEqual(state(game), before, 'Rendering art never equips, spends resources or changes a save.');
});

test('selected pixel detail preserves canonical level locks and actual total-stat comparison', () => {
  const { game, ui } = fixture(27), item = loot(game, 'iron_longsword', 68), equipped = game.item(game.equipment.weapon), preview = game.previewEquipment(item.id);
  item.minLevel = 1; // Legacy metadata cannot lower the actual generated requirement.
  const html = ui.itemInspector(item.id);
  assert.match(html, /item-detail-row/); assert.match(html, /item-detail-header/); assert.match(html, /item-detail-content/);
  assert.ok(html.includes(art(item))); assert.ok(html.includes(art(equipped)));
  assert.match(html, /pixel-item-tile rare/); assert.match(html, /Stufe 68/); assert.match(html, /Benötigt Stufe 68/);
  assert.match(html, /data-command="equip"[^>]*disabled/); assert.match(html, /Ersetzt:/);
  for (const value of [preview.before.damage, preview.after.damage]) assert.ok(html.includes(value.toLocaleString('de-DE', { maximumFractionDigits:2 })));
  const foreign = loot(game, 'greenwood_bow', 27, { classId:'ranger' });
  assert.match(ui.itemInspector(foreign.id), /Nur Waldläufer/); assert.match(ui.itemInspector(foreign.id), /data-command="equip"[^>]*disabled/);
  item.name = '<script>alert(1)</script>'; const escaped = ui.itemInspector(item.id);
  assert.match(escaped, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/); assert.doesNotMatch(escaped, /<script>/);
  assert.match(art(item), /aria-hidden="true"/); assert.match(art(item), /focusable="false"/);
});

test('merchant stock, recipes, ingredients and material rows use actual catalog object art', () => {
  const { game, ui } = fixture(40); ui.dialogueNPC = { id:'oren', name:'Oren', role:'Händler', dialogue:'Vorräte für den Weg.' };
  const before = state(game), shop = ui.dialogue();
  for (const id of ['heal_potion', 'mana_potion', 'leather_armor', 'forest_blade']) assert.ok(shop.includes(art(ITEMS[id])), id);
  assert.ok(shop.includes(art({ ...RESOURCES.seed, id:'seed', type:'resource' })));
  const future = RECIPES.find(recipe => recipe.minLevel > 40 && (!recipe.classIds || recipe.classIds.includes('guardian'))); assert.ok(future);
  const recipe = ui.craft().split('<article').find(markup => markup.includes(`data-id="${future.id}"`)); assert.ok(recipe);
  assert.ok(recipe.includes(art(ITEMS[future.output]))); assert.match(recipe, /data-command="craft"[^>]*disabled/);
  for (const id of Object.keys(future.ingredients)) assert.ok(recipe.includes(art({ ...RESOURCES[id], id, type:'resource' })), id);
  ui.inventoryTab = 'resources'; const materials = ui.inventory();
  for (const [id, resource] of Object.entries(RESOURCES)) assert.ok(materials.includes(art({ ...resource, id, type:'resource' })), id);
  assert.deepEqual(state(game), before);
});

test('loot references remain bounded, reject unsafe IDs and follow the latest find without extending a toast', () => {
  let now = 0; const queue = new NoticeQueue({ now:() => now }), first = queue.push('Klinge gefunden', 'loot', 'loot:first');
  assert.equal(queue.push('Unsichere Referenz gefunden', 'loot', '<img src=x>').itemId, 'loot:first');
  now = 250; queue.advance(); const deadline = first.visibleUntil, expiry = first.expiresAt;
  now += 200;
  for (let index = 0; index < 100; index++) queue.push(`Fund ${index} gefunden`, 'loot', `loot:next-${index}`);
  queue.push('+45 EP erhalten', 'xp'); assert.equal(first.itemId, 'loot:next-99');
  for (const invalid of [null, {}, 'x'.repeat(121), 'a b', '" onclick="bad']) queue.push('Weiterer Fund gefunden', 'loot', invalid);
  assert.equal(first.itemId, 'loot:next-99'); assert.equal(first.visibleUntil, deadline); assert.equal(first.expiresAt, expiry);
  assert.equal(queue.history.length, 1); assert.ok(first.fullMessages.length <= 80);
  now = deadline; assert.equal(queue.advance(), null); assert.equal(queue.history[0].itemId, 'loot:next-99');
  for (let index = 0; index < 60; index++) queue.push(`Hinweis ${index}`, 'info', 'owned_item');
  assert.equal(queue.history.length, 40); assert.ok(queue.pending.length <= 8);
  const fresh = new NoticeQueue(); assert.equal(fresh.push('Klinge gefunden', 'loot', 'x'.repeat(121)).itemId, null);
});

class Element {
  constructor() { this.dataset = {}; this.attributes = new Map(); this.children = []; this.hidden = false; this.writes = 0; this._html = ''; }
  set innerHTML(value) {
    this._html = value; this.writes++;
    if (value.includes('class="notice-item-art"')) this.parts = Object.fromEntries(['notice-item-art','notice-text','notice-inspect','notice-dismiss'].map(name => [`.${name}`, new Element()]));
  }
  get innerHTML() { return this._html; }
  querySelector(selector) { return this.parts?.[selector] || null; }
  appendChild(child) { this.children.push(child); child.parent = this; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
}

test('loot notice updates a mounted accessible button and pixel image, then hides them for an absent item', () => {
  const { game, ui } = fixture(), first = loot(game), second = loot(game, 'relic_helmet_4_1'), stack = new Element(), previous = globalThis.document;
  let now = 0; Object.assign(ui, { elements:{ 'notice-stack':stack }, notices:[], noticeQueue:new NoticeQueue({ now:() => now }), renderInformation() {}, updateHudLayout() {} });
  globalThis.document = { createElement:() => new Element() };
  try {
    ui.showNotice('Klinge gefunden', 'loot', first.id); now = 250; ui.renderNotice();
    const notice = stack.children[0], image = notice.querySelector('.notice-item-art'), button = notice.querySelector('.notice-inspect');
    assert.equal(button.dataset.id, first.id); assert.equal(button.getAttribute('aria-label'), `${first.name} ansehen`); assert.equal(image.innerHTML, art(first));
    assert.equal(button.hidden, false); const writes = image.writes;
    ui.renderNotice(); assert.equal(image.writes, writes, 'Repeated updates do not reconstruct the SVG.');
    ui.showNotice('Helm gefunden', 'loot', second.id); assert.equal(stack.children[0], notice); assert.equal(notice.querySelector('.notice-inspect'), button);
    assert.equal(button.dataset.id, second.id); assert.equal(image.innerHTML, art(second));
    game.inventory[second.id] = 0; ui.renderNotice(); assert.equal(button.hidden, true); assert.equal(image.hidden, true); assert.equal(button.dataset.id, undefined);
    assert.doesNotMatch(ui.noticeHistory(), /data-command="open-loot-item"/);
    now = 3250; ui.renderNotice(); assert.equal(stack.hidden, true); assert.equal(stack.children.length, 0);
  } finally { globalThis.document = previous; }
});

test('native loot-inspect routing finds the exact owned item beyond page one and never mutates gameplay', async () => {
  const { game, ui } = fixture(); for (let index = 0; index < 20; index++) loot(game);
  const selected = loot(game), inspector = { focus(options) { this.focused = options; }, scrollIntoView(options) { this.scrolled = options; } }, frames = [], previous = { document:globalThis.document, requestAnimationFrame:globalThis.requestAnimationFrame };
  Object.assign(ui, { activePanel:'party', infoOpen:true, inventoryTab:'stash', inventorySearch:'not-this-item', inventoryRarity:'epic', inventoryType:'armor', inventorySort:'power', inventoryUsable:true,
    closeInformation() { this.infoOpen = false; }, togglePanel(name) { this.activePanel = name; this.markup = this.inventory(); }, renderPanel() { this.markup = this.inventory(); } });
  globalThis.document = { getElementById:id => id === 'inventory-inspector' ? inspector : null };
  globalThis.requestAnimationFrame = callback => frames.push(callback);
  try {
    const before = state(game); await ui.command('open-loot-item', selected.id);
    assert.equal(ui.activePanel, 'inventory'); assert.equal(ui.infoOpen, false); assert.equal(ui.inventorySelected, selected.id); assert.equal(ui.inventoryPage, 1);
    assert.equal(ui.inventorySort, 'default'); assert.ok(ui.markup.includes(`data-id="${selected.id}"`)); assert.ok(ui.itemInspector(ui.inventorySelected).includes(art(selected)));
    for (const callback of frames.splice(0)) callback(); assert.deepEqual(inspector.focused, { preventScroll:true });
    assert.deepEqual(state(game), before, 'Opening the detail does not pick up, equip, consume or pause directly.');
    game.addItem('heal_potion'); await ui.command('open-loot-item', 'heal_potion'); assert.equal(ui.inventoryTab, 'consumables'); assert.equal(ui.inventorySelected, 'heal_potion');
    assert.match(ui.markup, /data-command="consume"/); assert.match(ui.markup, /tabindex="-1" aria-label="Gegenstandsdetails"/);
    const panel = ui.activePanel, current = ui.inventorySelected; await ui.command('open-loot-item', 'missing'); assert.equal(ui.activePanel, panel); assert.equal(ui.inventorySelected, current);
    game.inventory[selected.id] = 0; await ui.command('open-loot-item', selected.id); assert.equal(ui.inventorySelected, current);
    game.worldMode = 'pvp'; ui.showNotice = () => {}; await ui.command('open-loot-item', 'heal_potion'); assert.equal(ui.inventorySelected, current);
  } finally { Object.assign(globalThis, previous); }
});

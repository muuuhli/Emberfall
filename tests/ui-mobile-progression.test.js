import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { GameUI } from '../src/ui.js';
import { generateLoot } from '../src/loot.js';

function view(game=new Game({storage:null})) {
  const ui=Object.create(GameUI.prototype);Object.assign(ui,{game,inventoryTab:'equipment',inventoryPage:0,talentTab:'abilities',update(){}});return ui;
}
test('equipment UI exposes all slots, unequips, total character comparison and visible level/class locks',()=>{
  const ui=view(),game=ui.game;game.player.level=8;
  const candidate=generateLoot({level:8,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:'ui-candidate',rng:()=>.4});game.addItem(candidate);
  const row=ui.itemRow(candidate,1),preview=game.previewEquipment(candidate.id);
  assert.match(row,/Ersetzt:/);assert.match(row,/Waffenschaden/);assert.ok(row.includes(preview.before.damage.toLocaleString('de-DE',{maximumFractionDigits:2})));
  assert.ok(row.includes(preview.after.damage.toLocaleString('de-DE',{maximumFractionDigits:2})));assert.match(row,/data-command="equip"/);
  const slots=ui.equipmentSlots();for(const name of ['WAFFE','RÜSTUNG','AMULETT'])assert.ok(slots.includes(name));assert.match(slots,/data-command="unequip"/);assert.match(slots,/Noch unbesetzt/);
  const wrongClass=generateLoot({level:8,classId:'ranger',rarity:'rare',baseId:'greenwood_bow',uid:'ui-ranger',rng:()=>.4});game.addItem(wrongClass);
  assert.match(ui.itemRow(wrongClass,1),/Nur Waldläufer/);assert.match(ui.itemRow(wrongClass,1),/data-command="equip"[^>]*disabled/);
  const highLevel=generateLoot({level:40,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:'ui-level',rng:()=>.4});game.addItem(highLevel);
  assert.match(ui.itemRow(highLevel,1),/Benötigt Stufe 40/);assert.match(ui.itemRow(highLevel,1),/data-command="equip"[^>]*disabled/);
});
test('inventory paginates a full bag while every candidate remains accessible',()=>{
  const ui=view();ui.game.player.level=8;
  for(let index=0;index<35;index++)ui.game.addItem(generateLoot({level:8,classId:'guardian',rarity:'rare',baseId:'iron_longsword',uid:`ui-bag-${index}`,rng:()=>.4}));
  const first=ui.inventory();assert.ok((first.match(/class="item-row/g)||[]).length<=12);assert.match(first,/Weiter/);assert.match(first,/data-id="loot:ui-bag-0"/);
  ui.inventoryPage=3;const last=ui.inventory();assert.match(last,/data-id="loot:ui-bag-34"/);assert.match(last,/4 \/ 4/);
});
test('learning UI explains prerequisites and turns a learned technique into a real movable loadout',async()=>{
  const ui=view(),game=ui.game;game.player.level=4;game.player.skillPoints=6;
  const before=ui.activeAbilities();assert.match(before,/LERNBAR/);assert.match(before,/Benötigt Level 12/);assert.match(before,/Benötigt Schildstoß/);
  assert.equal(game.learnAbility('guardian_bulwark'),true);assert.equal(game.abilityLoadout[0],'guardian_bulwark');
  assert.match(ui.activeAbilities(),/ERLERNT · AUF PLATZ 3/);await ui.assignAbility(1,'guardian_bulwark');
  assert.deepEqual(game.abilityLoadout,[null,'guardian_bulwark']);assert.match(ui.activeAbilities(),/ERLERNT · AUF PLATZ 4/);
  await ui.assignAbility(1,null);assert.deepEqual(game.abilityLoadout,[null,null]);assert.match(ui.activeAbilities(),/ERLERNT/);
  game.player.level=12;assert.equal(game.learnAbility('guardian_challenge'),true);assert.match(ui.activeAbilities(),/Herausforderung/);
});

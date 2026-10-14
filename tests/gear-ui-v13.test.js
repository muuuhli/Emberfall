import test from 'node:test';
import assert from 'node:assert/strict';
import { GameUI } from '../src/ui.js';
import { generateLoot } from '../src/loot.js';
import { ITEMS } from '../src/catalog.js';
import { equipmentSlot } from '../src/equipment-system.js';
import { CRAFT_ITEMS, getConsumableProfile } from '../src/professions.js';

function fixture(items) {
  const records=Object.fromEntries(items.map(item=>[item.id,item]));
  const game={player:{level:27,classId:'guardian',gold:100,hp:100,mana:100},inventory:Object.fromEntries(items.map(item=>[item.id,1])),equipment:{},itemFlags:{},resources:{},cooldowns:{},
    item:id=>records[id]||ITEMS[id],itemStats:id=>(records[id]||ITEMS[id])?.stats||{},stats:()=>({maxHp:200,mana:200}),inCombat:()=>false};
  return Object.assign(Object.create(GameUI.prototype),{game,inventoryTab:'equipment',inventoryPage:0,inventoryUsable:false});
}
const loot=level=>generateLoot({level,baseId:'iron_longsword',classId:'guardian',rarity:'rare',uid:`ui-required-${level}`,rng:()=>.5});

test('equipment details, inventory cards and usability filters agree on generated and fixed requirements',()=>{
  const fixed=Object.values(ITEMS).find(item=>equipmentSlot(item)&&item.minLevel>27);assert.ok(fixed);
  const high={...loot(68),minLevel:1},own=loot(27),authored={...fixed,level:1},ui=fixture([high,own,authored]);
  const details=ui.itemRow(high,1);assert.match(details,/Stufe 68/);assert.match(details,/Benötigt Stufe 68/);assert.match(details,/data-command="equip"[^>]* disabled/);
  const cards=ui.inventory();assert.match(cards,new RegExp(`aria-label="[^\"]*Stufe ${authored.minLevel}"`),'A fixed item uses its documented minLevel, even if a legacy level field differs');
  ui.inventoryUsable=true;const filtered=ui.inventory();assert.doesNotMatch(filtered,new RegExp(`data-command="inspect-item" data-id="${high.id}"`));assert.doesNotMatch(filtered,new RegExp(`data-command="inspect-item" data-id="${authored.id}"`));assert.match(filtered,new RegExp(`data-command="inspect-item" data-id="${own.id}"`));
});

test('consumable requirements continue to come from their existing profile when filtering and displaying supplies',()=>{
  const usable={...CRAFT_ITEMS.greater_heal,level:99},locked=CRAFT_ITEMS.superior_heal,ui=fixture([usable,locked]);ui.inventoryTab='consumables';ui.inventoryUsable=true;
  assert.equal(getConsumableProfile(usable).minLevel,24);assert.equal(getConsumableProfile(locked).minLevel,55);
  const filtered=ui.inventory();assert.match(filtered,/data-command="inspect-item" data-id="greater_heal"/);assert.doesNotMatch(filtered,/data-command="inspect-item" data-id="superior_heal"/);assert.match(filtered,/Stufe 24/);
  const details=ui.itemRow(locked,1);assert.match(details,/Benötigt Stufe 55/);assert.match(details,/data-command="consume"[^>]* disabled/);
});

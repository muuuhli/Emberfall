import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentRequiredLevel, generateLoot, ITEM_BASES, validateLootItem } from '../src/loot.js';
import { ITEMS } from '../src/catalog.js';
import { EQUIPMENT_SLOT_IDS, equipmentSlot } from '../src/equipment-system.js';

const loot=(level=27,baseId='iron_longsword')=>generateLoot({level,baseId,classId:'guardian',rarity:'rare',rng:()=>.5,uid:`requirement-${level}-${baseId}`,source:'isolated_requirement_fixture'});

test('a canonical level68 roll cannot use imported minLevel1 to become wearable at level27',()=>{
  const item=loot(68),metadata={...item,minLevel:1},before=structuredClone(metadata);
  assert.equal(validateLootItem(metadata),true,'This previously accepted extra metadata must not override the canonical roll level');
  assert.equal(equipmentRequiredLevel(item),68);assert.equal(equipmentRequiredLevel(metadata),68);assert.deepEqual(metadata,before,'The existing item remains intact in saved inventory');
  assert.equal(equipmentRequiredLevel({...metadata,minLevel:75}),75,'A genuinely higher explicit requirement cannot be lowered either');
});

test('ordinary own-level generated equipment uses its roll level across all seven slots',()=>{
  for(const slot of EQUIPMENT_SLOT_IDS){
    const base=ITEM_BASES.find(base=>equipmentSlot(base)===slot&&base.minLevel<=27&&(!base.classIds||base.classIds.includes('guardian')));assert.ok(base,slot);
    const item=loot(27,base.id);assert.equal(validateLootItem(item),true);assert.equal(equipmentRequiredLevel(item),27);
    assert.equal(equipmentRequiredLevel({...item,minLevel:1}),27,`${slot} rejects a lowered requirement`);
  }
});

test('canonical base requirements cannot be lowered by a malformed generated or fixed item record',()=>{
  const base=ITEM_BASES.find(base=>base.minLevel>=60);assert.ok(base);
  assert.equal(equipmentRequiredLevel({id:'loot:too-young',baseId:base.id,level:1,minLevel:1}),base.minLevel);
  assert.equal(equipmentRequiredLevel({id:base.id,level:1,minLevel:1}),base.minLevel);
});

test('fixed equipment retains authored minLevel and original starter items remain level one',()=>{
  for(const id of ['rusty_blade','leather_armor','ember_charm']){assert.ok(ITEMS[id]);assert.equal(equipmentRequiredLevel(ITEMS[id]),1);}
  for(const item of Object.values(ITEMS).filter(item=>equipmentSlot(item))){
    assert.equal(equipmentRequiredLevel(item),item.minLevel??item.level??1,item.id);
  }
  assert.equal(equipmentRequiredLevel({id:'authored-test',type:'armor',minLevel:22,level:68}),22,'A documented fixed requirement remains the source of truth');
  assert.equal(equipmentRequiredLevel({id:'legacy-level-only',type:'armor',level:12}),12);
});

test('requirement queries handle absent and invalid fields without mutating or rejecting a whole journey',()=>{
  for(const value of [null,undefined,false,'item',[],{}])assert.equal(equipmentRequiredLevel(value),1);
  assert.equal(equipmentRequiredLevel({id:'loot:bad-values',level:NaN,minLevel:Infinity}),1);
  assert.equal(equipmentRequiredLevel({id:'loot:bounded-values',level:10000,minLevel:-100}),100);
  const old=loot(27);delete old.balanceVersion;delete old.classId;assert.equal(equipmentRequiredLevel(old),27);
});

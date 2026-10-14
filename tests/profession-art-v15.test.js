import test from 'node:test';
import assert from 'node:assert/strict';
import {ITEMS, RESOURCES} from '../src/catalog.js';
import {CRAFT_ITEMS, PROFESSION_RESOURCES} from '../src/professions.js';
import {itemArtDescriptor, getPixelItem} from '../src/item-art.js';
import {generateLoot, salvageYield, validateLootItem} from '../src/loot.js';
import {Renderer} from '../src/renderer.js';

test('regional raw materials, refined alloys and gems are concrete resource pictures rather than bags',()=>{
  for(const [id,resource] of Object.entries(PROFESSION_RESOURCES)) {
    assert.ok(RESOURCES[id],`active resource ${id}`);
    const descriptor=itemArtDescriptor({id}),family=resource.kind==='gem'?'crystal':resource.kind==='alloy'?'ore':{wood:'log',herb:'herb',ore:'ore',crystal:'crystal'}[resource.baseResource];
    assert.equal(descriptor.family,family,id);assert.equal(descriptor.tier,resource.tier-1,id);
    assert.ok(getPixelItem({id}).pixelCount>=70);
  }
  assert.equal(itemArtDescriptor({id:'ruby_t3'}).element,'fire');
  assert.equal(itemArtDescriptor({id:'sapphire_t2'}).element,'frost');
  assert.equal(itemArtDescriptor({id:'emerald_t3'}).element,'nature');
});

test('new usable raid supplies have actual potion or food art and distinct health/mana roles',()=>{
  for(const [id,item] of Object.entries(CRAFT_ITEMS)) {
    assert.ok(ITEMS[id]);const descriptor=itemArtDescriptor({id});
    assert.equal(descriptor.family,item.cooldownGroup==='food'?'stew':'potion');
    if(item.cooldownGroup!=='food')assert.equal(descriptor.element,item.stats.hpRestore?'fire':'frost');
  }
});

test('salvage returns exactly the original grade of every socket without downcasting valuable crafted gems',()=>{
  const item=generateLoot({level:90,classId:'guardian',baseId:'iron_longsword',rarity:'legendary',rng:()=>.5,uid:'profession-socket-recovery'});
  item.sockets=['ruby',{id:'sapphire',tier:2},{id:'emerald',tier:3}];
  assert.equal(validateLootItem(item),true);
  const materials=salvageYield(item);
  assert.equal(materials.ruby,1);assert.equal(materials.sapphire_t2,1);assert.equal(materials.emerald_t3,1);
  assert.equal(materials.sapphire,undefined);assert.equal(materials.emerald,undefined);
  assert.deepEqual(salvageYield({...item,sockets:[{id:'ruby',tier:4},null,null]}),{});
});

function context(){const calls=[],stack=[];return{calls,globalAlpha:1,fillStyle:'',imageSmoothingEnabled:true,
  save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},fillRect(...args){calls.push([this.fillStyle,this.globalAlpha,...args]);}};}

test('gather nodes use crisp real resource pixels and depleted alpha stays local to the node',()=>{
  const game={time:20,player:{x:100,y:100,level:27},regionAt:()=>({id:'daemmerhain'})};
  const ready=context(),empty=context(),node={type:'wood',x:150,y:150,readyAt:0};
  Renderer.prototype.node.call({},ready,node,game);Renderer.prototype.node.call({},empty,{...node,readyAt:30},game);
  assert.ok(ready.calls.length>40,'filled original sprite rows');assert.ok(empty.calls.every(call=>call[1]<1));
  assert.equal(ready.globalAlpha,1);assert.equal(empty.globalAlpha,1);
  assert.ok(ready.calls.every(call=>call.slice(2).every(Number.isInteger)));
});

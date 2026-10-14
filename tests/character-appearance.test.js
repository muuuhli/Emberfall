import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ITEM_BASES, generateLoot } from '../src/loot.js';
import { equipmentSlot } from '../src/equipment-system.js';
import { deriveCharacterAppearance, isCharacterAppearance, getCharacterAppearanceSprite, drawCharacterAppearance, CHARACTER_APPEARANCE_PALETTE, CHARACTER_APPEARANCE_STYLE, characterAppearanceCacheInfo, clearCharacterAppearanceCache } from '../src/character-appearance.js';

const slots=['weapon','armor','charm','helmet','gloves','boots','ring'];
const classes=['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder'];
const weapons={iron_longsword:'sword',oath_hammer:'hammer',greenwood_bow:'bow',twilight_daggers:'daggers',ember_wand:'staff',rime_scepter:'scepter',mourning_axe:'axe',grave_halberd:'spear',reliquary_flail:'flail',witchhunter_crossbow:'crossbow'};
const base=id=>ITEM_BASES.find(item=>item.id===id);
const digest=sprite=>Buffer.from(sprite.pixels).toString('base64');
function lookFor(equipment,classId='guardian'){return deriveCharacterAppearance({classId,equipment});}
function recording(){return {calls:[],fillStyle:'',imageSmoothingEnabled:true,drawImage(...args){this.calls.push({method:'drawImage',args});},fillRect(...args){this.calls.push({method:'fillRect',args,color:this.fillStyle});},clearRect(...args){this.calls.push({method:'clearRect',args});}};}
const atlas={naturalWidth:1024,naturalHeight:384};

test('appearance follows actual seven equipped items, binds the real Game resolver and excludes gameplay data',()=>{
  const game=new Game({storage:null,random:()=>.5});game.start();game.player.level=100;
  for(const slot of slots){const itemBase=ITEM_BASES.filter(item=>equipmentSlot(item)===slot&&(!item.classIds||item.classIds.includes('guardian')))[0];const item=generateLoot({level:100,classId:'guardian',baseId:itemBase.id,rarity:'rare',rng:()=>.5,uid:`appearance-${slot}`});assert.ok(game.addItem(item));assert.ok(game.equip(item.id));}
  const state=()=>{const snapshot=game.capture();delete snapshot.savedAt;return JSON.stringify(snapshot);},before=state(),look=deriveCharacterAppearance(game);
  assert.equal(isCharacterAppearance(look),true);assert.equal(look.classId,'guardian');assert.ok(slots.every(slot=>look.slots[slot]));
  assert.equal(state(),before,'Visual derivation cannot alter inventory, equipment, stats or progression');
  const serialized=JSON.stringify(look);assert.ok(serialized.length<=1024);assert.ok(!/baseId|damage|armor":\d|mana|stats|appearance-weapon|loot|tokens|currency|inventory/.test(serialized));
  assert.deepEqual(deriveCharacterAppearance(game),look);assert.ok(Object.isFrozen(look)&&Object.isFrozen(look.slots)&&Object.values(look.slots).every(Object.isFrozen));
});

test('actual weapon bases determine ten genuinely different weapon forms even when the displayed class is identical',()=>{
  const forms=new Set();
  for(const [id,kind] of Object.entries(weapons)) {
    const look=lookFor({weapon:base(id)});assert.equal(look.slots.weapon.kind,kind,id);
    const sprite=getCharacterAppearanceSprite(look);assert.ok(sprite.runs.length>20);const shape=digest(sprite);assert.ok(!forms.has(shape),`${id} is an original structural form`);forms.add(shape);
  }
  assert.equal(forms.size,10);
});

test('generated gear retains its actual base category and item level, rarity, element and set alter local structure',()=>{
  const plain=generateLoot({level:1,classId:'guardian',baseId:'iron_longsword',rarity:'common',rng:()=>.5,uid:'appearance-plain'});
  const advanced=generateLoot({level:100,classId:'guardian',baseId:'iron_longsword',rarity:'legendary',rng:()=>.5,uid:'appearance-advanced'});
  const cold={...advanced,setId:'winter_memory'},burning={...advanced,setId:null,element:'fire'},plainLook=lookFor({weapon:plain}),advancedLook=lookFor({weapon:advanced});
  assert.equal(plainLook.slots.weapon.tier,0);assert.equal(advancedLook.slots.weapon.tier,3);assert.equal(lookFor({weapon:cold}).slots.weapon.element,'frost');
  const signatures=[plainLook,advancedLook,lookFor({weapon:cold}),lookFor({weapon:burning})].map(look=>digest(getCharacterAppearanceSprite(look)));
  assert.equal(new Set(signatures).size,4);
  const highCommon={...plain,level:100,setId:null,element:'none'},highLegendary={...highCommon,rarity:'legendary'},lowCommon={...highCommon,level:1};
  const levelLow=getCharacterAppearanceSprite(lookFor({weapon:lowCommon})),levelHigh=getCharacterAppearanceSprite(lookFor({weapon:highCommon})),rarityHigh=getCharacterAppearanceSprite(lookFor({weapon:highLegendary}));
  assert.notEqual(digest(levelLow),digest(levelHigh),'Level changes native weapon fittings while base, rarity, element and set stay identical');
  assert.notEqual(digest(levelHigh),digest(rarityHigh),'Rarity changes the real fittings while item level, base, element and set stay identical');
  const rarityPixels=levelHigh.pixels.reduce((count,color,index)=>count+(color!==rarityHigh.pixels[index]?1:0),0);
  assert.ok(rarityPixels>0&&rarityPixels<=24,'Rarity marks stay local instead of tinting every pixel');
  const heavy=generateLoot({level:100,classId:'guardian',baseId:'relic_helmet_4_1',rarity:'rare',rng:()=>.5,uid:'appearance-heavy'}),light=generateLoot({level:100,classId:'ranger',baseId:'relic_helmet_4_2',rarity:'rare',rng:()=>.5,uid:'appearance-light'}),ritual=generateLoot({level:100,classId:'flamecaller',baseId:'relic_helmet_4_3',rarity:'rare',rng:()=>.5,uid:'appearance-ritual'});
  assert.equal(lookFor({helmet:heavy}).slots.helmet.kind,'helm');assert.equal(lookFor({helmet:light}).slots.helmet.kind,'hood');assert.equal(lookFor({helmet:ritual}).slots.helmet.kind,'circlet');
  const masks=[heavy,light,ritual].map(item=>Array.from(getCharacterAppearanceSprite(lookFor({helmet:item})).pixels,index=>index?1:0).join(''));
  assert.equal(new Set(masks).size,3,'Helm, hood and circlet differ in silhouette, not merely a rarity tint');
  assert.equal(lookFor({weapon:{...plain,rarity:'mythic'}}).slots.weapon.rarity,'legendary');
});

test('all eight class anatomies and ten weapon forms stay inside the original native tile in every direction and pose',()=>{
  const gear={};for(const slot of slots)gear[slot]={...ITEM_BASES.find(item=>equipmentSlot(item)===slot),level:100,rarity:'legendary',setId:'winter_memory'};
  for(const classId of classes)for(const direction of [0,1,2,3])for(let pose=0;pose<8;pose++) {
    const sprite=getCharacterAppearanceSprite(lookFor(gear,classId),{direction,pose});assert.equal(sprite.clippedPixels,0,`${classId}/${direction}/${pose}`);
    assert.equal(sprite.width,32);assert.equal(sprite.height,48);assert.deepEqual(sprite.pivot,[16,40]);assert.ok(sprite.pixels.every(index=>index<25));
    assert.ok(sprite.runs.every(run=>run.x>=0&&run.y>=0&&run.x+run.w<=32&&run.y+run.h<=48));
  }
  for(const id of Object.keys(weapons))for(const direction of [0,1,2,3])for(let pose=0;pose<8;pose++)assert.equal(getCharacterAppearanceSprite(lookFor({weapon:{...base(id),level:100,rarity:'legendary'}}),{direction,pose}).clippedPixels,0,`${id}/${direction}/${pose}`);
});

test('every physical equipment slot contributes visible original pixels while jewelry stays a small readable detail',()=>{
  for(const slot of slots) {
    const item={...ITEM_BASES.find(item=>equipmentSlot(item)===slot),level:100,rarity:'epic'},sprite=getCharacterAppearanceSprite(lookFor({[slot]:item}));
    assert.ok(sprite.runs.length>0,slot);
    if(['ring','charm'].includes(slot))assert.ok(sprite.pixels.filter(value=>value>0).length<=24,`${slot} remains a small detail instead of an aura`);
  }
});

test('west mirrors around the native x16 contact pivot and downed gear follows the horizontal body',()=>{
  const equipment={};for(const slot of slots.filter(slot=>slot!=='weapon'))equipment[slot]={...ITEM_BASES.find(item=>equipmentSlot(item)===slot),level:100,rarity:'rare'};
  const look=lookFor(equipment);
  for(let pose=0;pose<7;pose++) {
    const east=getCharacterAppearanceSprite(look,{direction:1,pose}),west=getCharacterAppearanceSprite(look,{direction:3,pose});
    for(let y=0;y<48;y++)for(let x=1;x<32;x++)assert.equal(west.pixels[y*32+x],east.pixels[y*32+32-x],`pose${pose}/${x}/${y}`);
  }
  const down=getCharacterAppearanceSprite(look,{direction:0,pose:7});assert.ok(down.runs.every(run=>run.y>=27),'A downed character has no upright helmet, torso or floating weapon');
  const withWeapon=getCharacterAppearanceSprite(lookFor({...equipment,weapon:base('iron_longsword')}),{direction:0,pose:7});assert.equal(digest(withWeapon),digest(down));
  const front=getCharacterAppearanceSprite(look),back=getCharacterAppearanceSprite(look,{direction:2});assert.notEqual(digest(front),digest(back),'North is a real back view, not a repeated face');
});

test('partial armor, helmet and boots preserve the original staff head, shaft and shield when weapon is empty',()=>{
  for(const slot of ['armor','helmet','boots']) {
    const item=ITEM_BASES.find(item=>equipmentSlot(item)===slot);
    for(const direction of [0,1,2,3])for(const [pose,headY,shaftY] of [[0,16,31],[2,15,30],[5,9,30],[6,13,31]]) {
      const sprite=getCharacterAppearanceSprite(lookFor({[slot]:item},'flamecaller'),{direction,pose}),staffX=direction>=2?6:26;
      assert.equal(sprite.pixels[headY*32+staffX],11,`${slot}/${direction}/${pose}: original gold flame core remains whole`);
      assert.equal(sprite.pixels[shaftY*32+staffX],11,`${slot}/${direction}/${pose}: original gold grip is preserved`);
    }
    for(const [direction,shieldX] of [[0,9],[1,15],[2,25],[3,17]]) {
      const sprite=getCharacterAppearanceSprite(lookFor({[slot]:item}),{direction});
      assert.equal(sprite.pixels[30*32+shieldX],14,`${slot}/${direction}: original shield's silver cross survives anatomy replacement`);
    }
  }
});

test('equipped downed anatomy remains one connected horizontal silhouette in all four directions',()=>{
  const gear={};for(const slot of slots)gear[slot]={...ITEM_BASES.find(item=>equipmentSlot(item)===slot),level:100,rarity:'legendary'};
  for(const classId of classes)for(const direction of [0,1,2,3]) {
    const sprite=getCharacterAppearanceSprite(lookFor(gear,classId),{direction,pose:7}),remaining=new Set();
    sprite.pixels.forEach((color,index)=>{if(color)remaining.add(index);});let components=0;
    while(remaining.size){components++;const queue=[remaining.values().next().value];remaining.delete(queue[0]);for(let index=0;index<queue.length;index++){const pixel=queue[index],x=pixel%32,y=Math.floor(pixel/32);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const nx=x+dx,ny=y+dy,next=ny*32+nx;if(nx>=0&&nx<32&&ny>=0&&ny<48&&remaining.delete(next))queue.push(next);}}}
    assert.equal(components,1,`${classId}/${direction}: helmet, torso and feet cannot become detached objects`);
  }
  for(const direction of [0,1,2,3]) {
    const helmet=ITEM_BASES.find(item=>equipmentSlot(item)==='helmet'),sprite=getCharacterAppearanceSprite(lookFor({helmet},'druid'),{direction,pose:7}),antlerX=direction>=2?29:3;
    assert.equal(sprite.eraseMask[26*32+antlerX],1,'The original fallen druid antler must be replaced with the equipped headwear');
    assert.equal(sprite.pixels[26*32+antlerX],0,'No detached old antler pixel remains above the new downed helmet');
  }
});

test('staff and scepter stay visibly connected to the real side-facing hand during both attack frames',()=>{
  for(const id of ['ember_wand','rime_scepter'])for(const direction of [1,3])for(const [pose,handY] of [[0,29],[5,26],[6,26]]) {
    const look=lookFor({weapon:base(id),gloves:base('relic_gloves_4_3')},'flamecaller'),sprite=getCharacterAppearanceSprite(look,{direction,pose});
    for(let x=21;x<=25;x++){const nativeX=direction===3?32-x:x;assert.ok(sprite.pixels[handY*32+nativeX],`${id}/${direction}/${pose}: hand-to-grip contact at ${nativeX}/${handY}`);}
  }
});

test('a completely unequipped avatar keeps exactly the original atlas call and fixed scale/pivot',()=>{
  const c=recording(),bounds=drawCharacterAppearance(c,deriveCharacterAppearance({classId:'frostweaver'}),{atlas,direction:3,pose:6,x:101.3,y:205.7,scale:2});
  assert.equal(c.calls.length,1);assert.deepEqual(c.calls[0].args,[atlas,960,240,32,48,70,126,64,96]);
  assert.equal(bounds.pivotX,102);assert.equal(bounds.pivotY,206);assert.equal(c.imageSmoothingEnabled,false);
  const sprite=getCharacterAppearanceSprite(deriveCharacterAppearance());assert.equal(sprite.runs.length,0);assert.ok(sprite.eraseMask.every(value=>value===0));
});

test('without offscreen canvas the compositor omits baked equipment via atlas row spans and never clears world pixels',()=>{
  const originalDocument=globalThis.document,originalOffscreen=globalThis.OffscreenCanvas;delete globalThis.document;delete globalThis.OffscreenCanvas;clearCharacterAppearanceCache();
  try {
    const c=recording(),look=lookFor({weapon:base('rime_scepter'),helmet:base('relic_helmet_3_1')}),bounds=drawCharacterAppearance(c,look,{atlas,x:80,y:100});
    assert.ok(c.calls.some(call=>call.method==='drawImage'));assert.ok(c.calls.some(call=>call.method==='fillRect'));assert.ok(c.calls.every(call=>call.method!=='clearRect'));
    for(const call of c.calls.filter(call=>call.method==='drawImage')){assert.equal(call.args[4],1);assert.equal(call.args[8],2);}
    for(const call of c.calls.filter(call=>call.method==='fillRect')){const [x,y,w,h]=call.args;assert.ok(x>=bounds.x&&y>=bounds.y&&x+w<=bounds.x+bounds.w&&y+h<=bounds.y+bounds.h);}
  } finally {globalThis.document=originalDocument;globalThis.OffscreenCanvas=originalOffscreen;clearCharacterAppearanceCache();}
});

test('native offscreen composition is cached, readback-free and evicted under changing real items',()=>{
  const previous=globalThis.OffscreenCanvas;let created=0;
  class Canvas {constructor(width,height){this.width=width;this.height=height;this.context=recording();created++;}getContext(){return this.context;}}
  globalThis.OffscreenCanvas=Canvas;clearCharacterAppearanceCache();
  try {
    const look=lookFor({weapon:base('iron_longsword')}),c=recording();drawCharacterAppearance(c,look,{atlas});drawCharacterAppearance(c,look,{atlas});
    assert.equal(created,1);assert.equal(c.calls.length,2);assert.equal(c.calls[0].args[0],c.calls[1].args[0]);assert.equal(c.calls[0].args[0].width,32);assert.equal(c.calls[0].args[0].height,48);
    assert.ok(c.calls[0].args[0].context.calls.some(call=>call.method==='clearRect'),'Erasing is confined to the avatar composition surface');
    for(const [id,index] of Object.keys(weapons).map((id,index)=>[id,index]))for(const direction of [0,1,2,3])for(let pose=0;pose<8;pose++)drawCharacterAppearance(c,lookFor({weapon:{...base(id),level:100,rarity:index%2?'rare':'epic'}}),{atlas,direction,pose});
    const info=characterAppearanceCacheInfo();assert.ok(info.sprites<=info.limit);assert.ok(info.canvases<=info.limit);assert.equal(info.limit,160);
  } finally {globalThis.OffscreenCanvas=previous;clearCharacterAppearanceCache();}
});

test('network descriptors are strict, bounded, canonical and reject arbitrary pixels or gameplay fields',()=>{
  const look=lookFor({weapon:base('greenwood_bow')},'ranger');assert.equal(isCharacterAppearance(JSON.parse(JSON.stringify(look))),true);
  for(const mutate of [value=>{value.slots.weapon.material='url(secret)';},value=>{value.slots.weapon.stats={damage:999};},value=>{value.slots.weapon.tier=900;},value=>{value.slots.fake=null;},value=>{value.key='forged';},value=>{value.inventory={};},value=>{value.slots.weapon.kind='canvas-command';}]){const changed=structuredClone(look);mutate(changed);assert.equal(isCharacterAppearance(changed),false);}
  const wrong=lookFor({helmet:base('iron_longsword'),weapon:base('linen_robes')});assert.equal(wrong.slots.weapon,null);assert.equal(wrong.slots.helmet,null);
  assert.equal(CHARACTER_APPEARANCE_PALETTE.length,25);assert.deepEqual(CHARACTER_APPEARANCE_STYLE.pivot,[16,40]);
});

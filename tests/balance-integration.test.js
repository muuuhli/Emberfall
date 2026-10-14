import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, SAVE_KEY } from '../src/game.js';
import { ITEMS } from '../src/catalog.js';
import { generateLoot, computeItemStats, validateLootItem } from '../src/loot.js';
import { incomingDamage } from '../src/balance.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function memoryStorage(){
  const values=new Map();
  return {getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key)};
}
function arena(level=25,storage=null){
  const game=new Game({storage,random:()=>.5});
  Object.assign(game.player,{level,x:2000,y:1000,face:0,invulnerable:0,shield:0});
  for(const field of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies','dungeonEntrances'])game.world[field]=[];
  game.npcs=[];game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  game.start();return game;
}
function advance(game,seconds){
  for(let remaining=seconds;remaining>1e-9;remaining-=.02)game.update(Math.min(.02,remaining),{simulateWorld:false});
}
function armor(game,uid='defensive-armor'){
  const item=generateLoot({level:100,classId:'guardian',rarity:'epic',baseId:'eternal_carapace',rng:()=>.5,uid});
  assert.equal(game.addItem(item),true);assert.equal(game.equip(item.id),true);return item;
}

test('inventory consumption and quick healing share three real seconds of cooldown across item types',()=>{
  const game=arena();game.inventory={heal_potion:2,mana_potion:2,hearty_meal:2};
  game.player.hp=10;game.player.mana=0;
  let healSounds=0;game.onSound=kind=>{if(kind==='heal')healSounds++;};
  assert.equal(game.consume('heal_potion'),true);
  assert.equal(game.player.hp,10+ITEMS.heal_potion.stats.hpRestore);
  assert.equal(game.cooldowns.potion,3);
  const inventory=clone(game.inventory),hp=game.player.hp,mana=game.player.mana;
  for(let attempt=0;attempt<20;attempt++){
    for(const id of ['heal_potion','mana_potion','hearty_meal'])assert.equal(game.consume(id),false);
    assert.equal(game.action('potion'),false);
  }
  assert.deepEqual(game.inventory,inventory);assert.equal(game.player.hp,hp);assert.equal(game.player.mana,mana);
  assert.equal(healSounds,1,'Blocked inventory spam must not trigger repeated healing or sound');
  advance(game,2.98);assert.ok(game.cooldowns.potion>0);assert.equal(game.consume('mana_potion'),false);
  advance(game,.04);game.player.mana=0;
  assert.equal(game.consume('mana_potion'),true);assert.equal(game.player.mana,ITEMS.mana_potion.stats.manaRestore);
  assert.equal(game.player.hp,hp);assert.equal(game.action('potion'),false);
  advance(game,3.02);assert.equal(game.action('potion'),true);
  assert.equal(game.consume('mana_potion'),false,'The quick action must also block inventory consumption');
  assert.equal(game.player.hp,hp+ITEMS.heal_potion.stats.hpRestore);
  assert.deepEqual(game.inventory,{heal_potion:0,mana_potion:1,hearty_meal:2});assert.equal(healSounds,3);
});

test('wearing and removing stronger armor changes actual stats without healing, drift or inventory loss',()=>{
  const game=arena(100);assert.equal(game.unequip('armor'),true);
  game.player.hp=350;game.player.mana=17;
  const bare=game.stats(),oldInventory=clone(game.inventory);
  const item=armor(game),after=game.stats(),roll=clone(item.stats);
  assert.ok(after.maxHp>bare.maxHp+300);assert.ok(after.armor>bare.armor+30);
  assert.equal(game.player.hp,350);assert.equal(game.player.mana,17);
  const inventory=clone(game.inventory);assert.equal(inventory[item.id],1);
  for(let attempt=0;attempt<8;attempt++){
    assert.equal(game.unequip('armor'),true);assert.deepEqual(game.stats(),bare);
    assert.equal(game.equip(item.id),true);assert.deepEqual(game.stats(),after);
    assert.equal(game.player.hp,350);assert.equal(game.player.mana,17);assert.deepEqual(game.inventory,inventory);
  }
  game.player.hp=after.maxHp;
  assert.equal(game.unequip('armor'),true);assert.equal(game.player.hp,bare.maxHp,'Removing bonus health clamps current HP');
  assert.equal(game.equip(item.id),true);assert.equal(game.player.hp,bare.maxHp,'Re-equipping cannot restore the clamped bonus HP');
  assert.deepEqual(game.inventory,inventory);assert.deepEqual(game.generatedItems[item.id].stats,roll);
  for(const [id,count]of Object.entries(oldInventory))assert.equal(game.inventory[id],count);
});

test('a real legacy loot save reloads with stronger equipment modifiers and unchanged serialized rolls',()=>{
  const storage=memoryStorage(),game=arena(100,storage);
  const legacy={id:'loot:pre-balance-sword',baseId:'iron_longsword',name:'Eisenlangschwert aus alter Reise',
    type:'weapon',rarity:'common',level:100,icon:'⚔',description:'Gespeicherter Originalroll',
    stats:{damage:59.45},price:100,power:119,affixes:[],sockets:[],setId:null,upgrade:0};
  assert.equal(validateLootItem(legacy),true);const original=clone(legacy);
  assert.equal(game.addItem(legacy),true);assert.equal(game.equip(legacy.id),true);
  game.player.hp=280;assert.equal(game.save(false),true);
  const encoded=JSON.parse(storage.getItem(SAVE_KEY));assert.deepEqual(encoded.generatedItems[legacy.id],original);
  const restored=new Game({storage,random:()=>.5});
  assert.equal(restored.hasSave,true);assert.equal(restored.equipment.weapon,legacy.id);assert.equal(restored.inventory[legacy.id],1);
  assert.deepEqual(restored.generatedItems[legacy.id],original);assert.equal(restored.player.hp,280);
  const bonus=restored.itemStats(legacy.id).damage,unarmed=restored.stats({...restored.equipment,weapon:null});
  assert.ok(bonus>original.stats.damage*2,'Old canonical damage receives the new meaningful runtime budget');
  assert.ok(Math.abs(restored.stats().damage-unarmed.damage-bonus)<1e-8);
  assert.deepEqual(restored.itemStats(legacy.id),computeItemStats(original));
  restored.stats();restored.previewEquipment(legacy.id);restored.save(false);
  assert.deepEqual(JSON.parse(storage.getItem(SAVE_KEY)).generatedItems[legacy.id],original);
});

test('enemy projectiles carry attacker level into actual armor mitigation with a safe player-level fallback',()=>{
  const game=arena(100);armor(game,'projectile-armor');
  const probe=attackerLevel=>{
    // Independent source-level samples happen after real same-source recovery.
    advance(game,.2);assert.equal(game.inSettlement(),false);
    game.player.hp=game.stats().maxHp;game.player.invulnerable=0;game.player.shield=0;
    game.projectiles=[{x:game.player.x,y:game.player.y,angle:0,speed:0,life:1,owner:'enemy',damage:200,...(attackerLevel===undefined?{}:{attackerLevel})}];
    const before=game.player.hp;game.updateWorld(.02,[game]);
    assert.equal(game.projectiles.length,0,'The projectile actually hits and is consumed');
    return before-game.player.hp;
  };
  const low=probe(1),high=probe(100),fallback=probe();
  assert.equal(low,incomingDamage(200,{armor:game.stats().armor,attackerLevel:1}));
  assert.equal(high,incomingDamage(200,{armor:game.stats().armor,attackerLevel:100}));
  assert.ok(high>low*2,'Endgame attackers pierce more rating than beginner attackers');
  assert.equal(fallback,high,'Missing source metadata falls back to the target level');
});

test('a failed mechanic can still kill an armored character through a shield and roll invulnerability',()=>{
  const game=arena(100);armor(game,'mechanic-armor');
  const health=game.stats().maxHp;game.player.hp=health;game.player.shield=health*.6;game.player.invulnerable=30;
  game.keys.add('w');let deaths=0;game.onDeath=()=>deaths++;
  game.damagePlayer(health*2,{attackerLevel:100});assert.equal(game.player.hp,health,'A regular hit respects roll invulnerability');
  game.damagePlayer(health*2,{trueDamage:true,ignoreInvulnerability:true,attackerLevel:100});
  assert.equal(game.player.hp,0);assert.equal(game.player.shield,0);assert.equal(game.dead,true);
  assert.equal(game.paused,true);assert.equal(game.keys.size,0);assert.equal(deaths,1);
});

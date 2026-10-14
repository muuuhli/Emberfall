import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { RECIPES, RESOURCES } from '../src/catalog.js';
import { CLASSES } from '../src/classes.js';
import { cumulativeXp } from '../src/progression.js';
import { generateLoot, computeItemStats, validateLootItem } from '../src/loot.js';
import { PVP_STATS } from '../src/pvp.js';
import { PROFESSIONS, PROFESSION_RECIPES, newProfessionState, awardProfessionXp, getCraftXp, validateProfessionState, socketDescriptor } from '../src/professions.js';
import { PROFESSION_TRAINERS, getRecipeProfession, craftProfessionGate } from '../src/profession-system.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(level=100,classId='guardian') {
  const game=new Game({storage:null,random:()=>.5});assert.equal(game.selectClass(classId),true);game.start();game.gainXp(cumulativeXp(level));
  game.world.enemies=[];game.gainGold(100);return game;
}
function atTeacher(game,id){const teacher=PROFESSION_TRAINERS[id];game.player.x=teacher.x+24;game.player.y=teacher.y;return teacher;}
// Position and stocked materials are isolated test inputs, not claimed gameplay
// earnings or duration. Character levels use gainXp; actual craft methods earn
// every profession rank in the ladder test below.
function stock(game,recipe){for(const [id,count] of Object.entries(recipe.ingredients))if(Object.hasOwn(RESOURCES,id))game.resources[id]=(game.resources[id]||0)+count;else assert.equal(game.addItem(id,count),true);}
function trained(game,id){atTeacher(game,id);assert.equal(game.trainProfession(id),true);}
function advanced(game,id,level=100){trained(game,id);game.professions=awardProfessionXp(game.professions,id,1e9,{playerLevel:game.player.level}).state;if(level<100){game.professions[id].level=level;game.professions[id].xp=0;}assert.equal(validateProfessionState(game.professions,{playerLevel:game.player.level}),true);}
function state(game){return clone({gold:game.player.gold,hp:game.player.hp,mana:game.player.mana,inventory:game.inventory,resources:game.resources,generatedItems:game.generatedItems,professions:game.professions,training:game.professionTraining,cooldowns:game.cooldowns,lootSerial:game.lootSerial});}

test('native teacher training is once-only, paid, nearby and usable from a paused offline menu',()=>{
  const game=fixture(27),before=state(game);assert.equal(game.trainProfession('smith'),false);assert.deepEqual(state(game),before);atTeacher(game,'smith');game.paused=true;
  assert.equal(game.trainProfession('smith'),true);assert.equal(game.player.gold,before.gold-20);assert.deepEqual(game.professionTraining,['smith']);assert.deepEqual(game.professions,newProfessionState());
  const learned=state(game);assert.equal(game.trainProfession('smith'),false);assert.equal(game.trainProfession('invented'),false);assert.equal(game.trainProfession({id:'alchemy'}),false);assert.deepEqual(state(game),learned);
  atTeacher(game,'alchemy');game.player.lastDamageAt=game.time;assert.equal(game.trainProfession('alchemy'),false);delete game.player.lastDamageAt;
  game.dead=true;assert.equal(game.trainProfession('alchemy'),false);game.dead=false;game.worldMode='pvp';assert.equal(game.trainProfession('alchemy'),false);game.worldMode='overworld';game.started=false;assert.equal(game.trainProfession('alchemy'),false);
});

test('legacy recipes retain their original output and character XP but teach profession XP only after training',()=>{
  const game=fixture(27),recipe=RECIPES.find(recipe=>recipe.id==='brew_heal');stock(game,recipe);const xp=game.player.xp;
  assert.equal(game.craft(recipe.id),true);assert.equal(game.player.xp,xp+12);assert.deepEqual(game.professions,newProfessionState());
  trained(game,'alchemy');stock(game,recipe);const own=game.inventory.heal_potion;assert.equal(game.craft(recipe.id),true);assert.equal(game.inventory.heal_potion,own+1);assert.ok(game.professions.alchemy.level>1);assert.equal(game.professions.smith.level,1);
  game.resources.herb=0;game.inventory.herb=999;const before=state(game);assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before,'Invented inventory aliases cannot borrow a resource source and debit it below zero');
});

test('all three profession ladders advance through real native crafting with milestone caps and no dead-end',()=>{
  const game=fixture();
  for(const {id} of PROFESSIONS){
    trained(game,id);let crafts=0;
    while(game.professions[id].level<100&&crafts<500){
      const available=RECIPES.filter(recipe=>getRecipeProfession(recipe)===id&&craftProfessionGate(game,recipe).ok&&getCraftXp(recipe,game.professions[id].level)>0).sort((a,b)=>(b.minProfessionLevel||1)-(a.minProfessionLevel||1));
      assert.ok(available.length,`${id} must have a real usable recipe at ${game.professions[id].level}`);stock(game,available[0]);assert.equal(game.craft(available[0].id),true,available[0].id);crafts++;
    }
    assert.equal(game.professions[id].level,100,id);assert.equal(game.professions[id].xp,0);assert.ok(crafts<500);assert.ok(game.bagUsed()<=240);
  }
  const young=fixture(1);trained(young,'alchemy');const recipe=RECIPES.find(recipe=>recipe.id==='brew_heal');for(let i=0;i<10;i++){stock(young,recipe);assert.equal(young.craft(recipe.id),true);}assert.equal(young.professions.alchemy.level,10);assert.equal(young.professions.alchemy.xp,0);
});

test('new recipes enforce canonical training, rank, teacher and materials before changing a single resource',()=>{
  const game=fixture(27),recipe=PROFESSION_RECIPES.find(recipe=>recipe.id==='brew_greater_heal');stock(game,recipe);let before=state(game);
  assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before);trained(game,'alchemy');before=state(game);assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before);
  game.professions=awardProfessionXp(game.professions,'alchemy',1e9,{playerLevel:27}).state;assert.equal(game.professions.alchemy.level,50);const xp=game.player.xp;
  assert.equal(game.craft(recipe.id),true);assert.equal(game.inventory.greater_heal,1);assert.equal(game.player.xp,xp,'New profession recipes do not create a second character-XP farming payout');
  stock(game,recipe);game.player.x+=200;before=state(game);assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before);
});

test('every new recipe creates its canonical resource, supply or class-usable gear atomically',()=>{
  const game=fixture();for(const {id} of PROFESSIONS)advanced(game,id);
  for(const recipe of PROFESSION_RECIPES){
    atTeacher(game,recipe.profession);stock(game,recipe);const before=state(game);assert.equal(game.craft(recipe.id),true,recipe.id);
    for(const [id,count] of Object.entries(recipe.ingredients))assert.equal(game.resources[id],before.resources[id]-count,`${recipe.id} consumes ${id} exactly once`);
    if(recipe.outputProfile){const item=Object.values(game.generatedItems).find(item=>item.craftedRecipe===recipe.id);assert.ok(item);assert.equal(validateLootItem(item),true);assert.equal(game.canEquipItem(item.id),true);}
    else if(Object.hasOwn(RESOURCES,recipe.output))assert.equal(game.resources[recipe.output],(before.resources[recipe.output]||0)+(recipe.amount||1));
    else assert.equal(game.inventory[recipe.output],(before.inventory[recipe.output]||0)+(recipe.amount||1));
  }
});

test('all eight classes receive valid own-class native crafted weapons and armor, while a full bag never consumes ingredients',()=>{
  for(const cls of CLASSES){
    const game=fixture(100,cls.id);advanced(game,'smith');
    for(const recipe of PROFESSION_RECIPES.filter(recipe=>recipe.outputProfile)){stock(game,recipe);assert.equal(game.craft(recipe.id),true);const item=Object.values(game.generatedItems).find(item=>item.craftedRecipe===recipe.id);assert.equal(validateLootItem(item),true);assert.equal(game.canEquipItem(item.id),true);assert.equal(game.equip(item.id),true);}
  }
  const game=fixture();advanced(game,'smith');let uid=0;while(game.bagUsed()<240)assert.equal(game.addItem(generateLoot({level:100,classId:'guardian',rarity:'common',rng:()=>.5,uid:`profession-full-${++uid}`})),true);
  const recipe=PROFESSION_RECIPES.find(recipe=>recipe.outputProfile);stock(game,recipe);const before=state(game);assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before);
  game.bagUsed=()=>0;game.addItem=()=>false;assert.equal(game.craft(recipe.id),false);assert.deepEqual(state(game),before,'A late output rejection restores every debit');
});

test('regional gathering adds only a legal actual-node side yield while preserving old raw gathering credit',()=>{
  const game=fixture(100),node=game.world.nodes.find(node=>node.region==='sonnensteppe')||game.world.nodes.find(node=>game.regionAt(node.x,node.y).id==='sonnensteppe');assert.ok(node);
  game.npcs=[];game.world.interactions=[];game.world.eventObjects=[];game.world.dungeonEntrances=[];game.world.shrines=[];game.player.x=node.x+20;game.player.y=node.y;
  assert.equal(game.nearby().object,node);const raw=game.resources[node.type],credit=game.ledger[`gather:${node.type}`]||0;game.interact();
  assert.ok(game.resources[node.type]>raw);assert.equal(game.ledger[`gather:${node.type}`]-credit,game.resources[node.type]-raw);assert.equal(game.resources[`${node.type}_t2`],1);assert.equal(game.professions.alchemy.level,1,'Gathering never secretly grants untrained profession XP');
});

test('tier two/three socket resources are consumed once, retain item truth and return their exact tier on salvage',()=>{
  const game=fixture(),item=generateLoot({level:100,classId:'guardian',baseId:'iron_longsword',rarity:'epic',rng:()=>.5,uid:'profession-tier-sockets'});assert.equal(game.addItem(item),true);
  game.resources.ruby_t2=1;game.resources.emerald_t3=1;const before=computeItemStats(item);assert.equal(game.socket(item.id,'ruby_t2'),true);assert.equal(game.socket(item.id,'emerald_t3'),true);assert.deepEqual(item.sockets,[socketDescriptor('ruby_t2'),socketDescriptor('emerald_t3')]);assert.equal(game.resources.ruby_t2,0);assert.equal(game.socket(item.id,'ruby_t2'),false);assert.ok(computeItemStats(item).damage>before.damage);
  const saved=game.capture(),restored=fixture();restored.applySave(clone(saved));assert.deepEqual(restored.item(item.id).sockets,item.sockets);assert.equal(restored.salvage(item.id),true);assert.equal(restored.resources.ruby_t2,1);assert.equal(restored.resources.emerald_t3,1);assert.equal(restored.salvage(item.id),false);
});

test('masteries affect real stats and supplies without healing on switching or modifying normalized PvP',()=>{
  const game=fixture();advanced(game,'smith');const hp=game.player.hp,mana=game.player.mana;game.cooldowns.nova=4;assert.equal(game.chooseProfessionMastery('smith','armorer'),true);assert.equal(game.player.hp,hp);assert.equal(game.player.mana,mana);assert.equal(game.cooldowns.nova,4);
  const armor=game.stats().armor;assert.equal(game.chooseProfessionMastery('smith','weaponsmith'),true);assert.ok(game.stats().armor<armor);assert.ok(game.player.hp<=game.stats().maxHp);assert.equal(game.cooldowns.nova,4);
  advanced(game,'alchemy');assert.equal(game.chooseProfessionMastery('alchemy','healer'),true);game.damagePlayer(500,{trueDamage:true,ignoreInvulnerability:true});const wounded=game.player.hp;assert.equal(game.consume('heal_potion'),true);assert.ok(Math.abs(game.player.hp-wounded-65*1.12)<1e-9);
  game.worldMode='pvp';game.pvpStats={...PVP_STATS};assert.deepEqual(game.stats(),PVP_STATS);assert.equal(game.chooseProfessionMastery('alchemy','channeler'),false);
});

test('profession saves and optional old migrations are atomic and never derive real progress from legacy professionXp',()=>{
  const game=fixture();advanced(game,'runecraft',75);assert.equal(game.chooseProfessionMastery('runecraft','clarity'),true);game.resources.crystal_t3=9;
  const save=clone(game.capture()),restored=fixture();restored.applySave(save);assert.deepEqual(restored.professions,game.professions);assert.deepEqual(restored.professionTraining,game.professionTraining);assert.equal(restored.resources.crystal_t3,9);
  for(const mutate of [data=>data.professionTraining.push('runecraft'),data=>data.professionTraining=['fake'],data=>data.professions.runecraft.mastery='armorer',data=>data.professions.runecraft.xp=Infinity,data=>data.professionTraining=[]]){const corrupt=clone(save);mutate(corrupt);const before=state(restored);assert.throws(()=>restored.applySave(corrupt),/Beruf/);assert.deepEqual(state(restored),before);}
  const old=clone(save);delete old.professions;delete old.professionTraining;old.professionXp={alchemy:99999};restored.applySave(old);assert.deepEqual(restored.professions,newProfessionState());assert.deepEqual(restored.professionTraining,[]);assert.equal(restored.player.level,100);assert.equal(restored.resources.crystal_t3,9);
});

test('derived profession and socket caches follow native mastery swaps, new sockets and save restoration',()=>{
  const game=fixture();advanced(game,'runecraft');assert.equal(game.chooseProfessionMastery('runecraft','weaving'),true);
  const item=generateLoot({level:100,classId:'guardian',baseId:'iron_longsword',rarity:'epic',rng:()=>.5,uid:'profession-memo'});assert.equal(game.addItem(item),true);game.resources.ruby=1;game.resources.emerald_t2=1;assert.equal(game.socket(item.id,'ruby'),true);
  const first=game.itemStats(item.id),entry=game._professionSocketCache.get(item);assert.deepEqual(game.itemStats(item.id),first);assert.equal(game._professionSocketCache.get(item),entry,'Unchanged socket/mastery input reuses its derived bonus');
  assert.equal(game.socket(item.id,'emerald_t2'),true);const second=game.itemStats(item.id);assert.notEqual(game._professionSocketCache.get(item),entry);assert.ok(second.maxHp>(first.maxHp||0));
  assert.equal(game.chooseProfessionMastery('runecraft','clarity'),true);assert.deepEqual(game.itemStats(item.id),computeItemStats(item));assert.equal(game.chooseProfessionMastery('runecraft','weaving'),true);assert.deepEqual(game.itemStats(item.id),second);
  const saved=clone(game.capture());game.applySave(saved);assert.deepEqual(game.itemStats(item.id),second);assert.notEqual(game.item(item.id),item);
});

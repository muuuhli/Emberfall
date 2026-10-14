import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { NPCS, QUESTS, REGIONS } from '../src/catalog.js';
import { EQUIPMENT_SLOT_IDS, getEquipmentShopStock, equipmentSlot } from '../src/equipment-system.js';
import { generateLoot } from '../src/loot.js';
import { CLASSES } from '../src/classes.js';
import { PROFESSION_RECIPES, makeCraftedEquipment } from '../src/professions.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS } from '../src/world-events.js';

const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
function sparseGame() {
  const game=new Game({storage:null,random:()=>.5});
  for(const key of ['trees','rocks','structures','nodes','plots','chests','enemies'])game.world[key]=[];
  return game;
}
async function fixture() {
  const storage=memoryStorage();let hub,server,base;
  const open=async()=>{
    hub=new MultiplayerHub({createGame:sparseGame,storage,autoStart:false});
    server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;
  };
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async token=>{const response=await fetch(`${base}/api/session/${token}`);assert.equal(response.status,200);return response.json();};
  const created=await post('/api/rooms',{playerName:'Reliktträger',classId:'guardian'});assert.equal(created.status,201);
  const session=created.data;
  return {session,post,get,get hub(){return hub;},get base(){return base;},get game(){return hub.sessions.get(session.token).game;},
    method:(name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args}),
    async restart(){await close();await open();return get(session.token);},close};
}
const approach=(game,object)=>{Object.assign(game.player,{x:object.x,y:object.y});};

test('HTTP expansion commands accept only their exact arguments and nullable companion removal',async()=>{
  const f=await fixture();
  try {
    const malformed=[
      ['setItemFlag','rusty_blade','invented'],['setItemFlag','rusty_blade'],['depositItem','rusty_blade',99],
      ['withdrawItem',null],['saveLoadout',{name:'Forged',equipment:{weapon:'ember_charm'}}],['applyLoadout','loadout-1',1],
      ['deleteLoadout',1],['respecTalents',1],['trackQuest',null],['setWaypoint','invented','npc'],
      ['setWaypoint','npc',{id:'oren',x:99999,y:99999}],['claimAchievement','first_horizons',9999],
      ['selectCompanion',{id:'cinder_moth',power:9999}],['selectCompanion','cinder_moth',null],
      ['chooseMastery',123],['interactWorldEvent','event-daemmerhain:start',{reward:9999}],['claimWorldEvent','event-daemmerhain',9999],
    ];
    const before=f.game.player.gold;
    for(const [name,...args] of malformed)assert.equal((await f.method(name,...args)).status,400,`${name} rejects forged arguments`);
    assert.equal(f.game.player.gold,before);
    const removed=await f.method('selectCompanion',null);assert.equal(removed.status,200);assert.equal(removed.data.accepted,true);
    assert.equal((await f.method('trackQuest','')).status,200);assert.equal((await f.method('setWaypoint','clear','')).status,200);
    const snapshot=await f.get(f.session.token);
    for(const field of ['itemFlags','stash','loadouts','trackedQuestId','waypoint','journey'])assert.ok(Object.hasOwn(snapshot,field),`${field} travels in authoritative snapshots`);
  } finally{await f.close();}
});

test('HTTP shops sell four new equipment slots and seven-slot unequip restores exact stats without inventory loss',async()=>{
  const f=await fixture();
  try {
    f.game.player.level=100;f.game.player.gold=1e7;f.game.npcs=NPCS;approach(f.game,NPCS.find(npc=>npc.id==='elin'));
    assert.deepEqual(Object.keys(f.game.equipment),EQUIPMENT_SLOT_IDS);
    const stock=getEquipmentShopStock({level:100,classId:'guardian',merchant:'elin'});assert.equal(stock.length,4);
    const before=f.game.stats(),legacyWeapon=f.game.equipment.weapon,legacyArmor=f.game.equipment.armor;
    for(const item of stock) {
      const gold=f.game.player.gold;assert.equal((await f.method('buy',item.id)).data.accepted,true);assert.equal(f.game.player.gold,gold-item.price);
      assert.equal((await f.method('equip',item.id)).data.accepted,true);assert.equal(f.game.equipment[item.slot],item.id);
      assert.equal(f.game.equipment.weapon,legacyWeapon);assert.equal(f.game.equipment.armor,legacyArmor);
      assert.equal((await f.method('unequip',item.slot)).data.accepted,true);assert.equal(f.game.equipment[item.slot],null);assert.equal(f.game.inventory[item.id],1);
    }
    assert.deepEqual(f.game.stats(),before);
    assert.equal((await f.method('unequip','invented')).status,400);
    const snapshot=await f.get(f.session.token);assert.deepEqual(Object.keys(snapshot.equipment),EQUIPMENT_SLOT_IDS);
    assert.deepEqual((await f.restart()).equipment,snapshot.equipment);
  } finally{await f.close();}
});

test('HTTP protection flags, stash and three gear/ability loadouts persist without resetting cooldowns or sharing personal items',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Zeuge',classId:'ranger'});assert.equal(joined.status,201);
    f.game.player.level=10;f.game.player.skillPoints=20;f.game.player.gold=2000;approach(f.game,{x:520,y:1250});
    const item=generateLoot({level:10,classId:'guardian',baseId:'iron_longsword',rarity:'rare',rng:()=>.5,uid:'network-protected-stash'});assert.equal(f.game.addItem(item),true);
    assert.equal((await f.method('setItemFlag',item.id,'favorite')).data.accepted,true);assert.equal(f.game.itemFlags[item.id].favorite,true);
    assert.equal((await f.method('salvage',item.id)).data.accepted,false);assert.equal(f.game.inventory[item.id],1);
    assert.equal((await f.method('setItemFlag',item.id,'locked')).data.accepted,true);assert.equal(f.game.itemFlags[item.id].locked,true);
    assert.equal((await f.method('equip',item.id)).data.accepted,true);
    assert.equal((await f.method('depositItem',item.id)).data.accepted,false,'Equipped gear stays in inventory');
    assert.equal((await f.method('learnAbility','guardian_bulwark')).data.accepted,true);
    assert.equal((await f.method('useLearnedAbility',0)).data.accepted,true);
    const cooldown=f.game.cooldowns['ability:guardian_bulwark'],mana=f.game.player.mana;assert.ok(cooldown>0);
    assert.equal((await f.method('saveLoadout','Frontwacht')).data.accepted,true);
    assert.equal((await f.method('unequip','weapon')).data.accepted,true);assert.equal((await f.method('setAbilityLoadout',0,null)).data.accepted,true);
    assert.equal((await f.method('depositItem',item.id)).data.accepted,true);assert.equal(f.game.stash[item.id],1);assert.equal(f.game.inventory[item.id],undefined);
    const emptyEquipment={...f.game.equipment};assert.equal((await f.method('applyLoadout','loadout-1')).data.accepted,false);assert.deepEqual(f.game.equipment,emptyEquipment);
    assert.equal((await f.method('withdrawItem',item.id)).data.accepted,true);assert.equal(f.game.inventory[item.id],1);
    assert.equal((await f.method('applyLoadout','loadout-1')).data.accepted,true);assert.equal(f.game.equipment.weapon,item.id);assert.equal(f.game.abilityLoadout[0],'guardian_bulwark');
    assert.equal(f.game.cooldowns['ability:guardian_bulwark'],cooldown);assert.equal(f.game.player.mana,mana);
    assert.equal((await f.method('saveLoadout','Fernsicht')).data.accepted,true);assert.equal((await f.method('saveLoadout','Wanderung')).data.accepted,true);
    assert.equal((await f.method('saveLoadout','Vierte Vorlage')).data.accepted,false);assert.equal(f.game.loadouts.length,3);
    const second=await f.get(joined.data.token);assert.equal(second.itemFlags[item.id],undefined);assert.equal(second.inventory[item.id],undefined);assert.equal(second.loadouts.length,0);
    const before=await f.get(f.session.token),after=await f.restart();
    assert.deepEqual(after.itemFlags,before.itemFlags);assert.deepEqual(after.stash,before.stash);assert.deepEqual(after.loadouts,before.loadouts);
    assert.equal(after.cooldowns['ability:guardian_bulwark'],cooldown);
    assert.equal((await f.method('deleteLoadout','loadout-2')).data.accepted,true);assert.equal(f.game.loadouts.length,2);
  } finally{await f.close();}
});

test('HTTP talent respec pays the trusted village cost and quest waypoints survive restart without remote progress forgery',async()=>{
  const f=await fixture();
  try {
    f.game.player.level=10;f.game.player.gold=1000;f.game.player.skillPoints=20;approach(f.game,{x:520,y:1250});
    assert.equal((await f.method('learn','guardian_vigor')).data.accepted,true);
    const points=f.game.player.skillPoints,gold=f.game.player.gold,cost=20+f.game.player.level*5;
    approach(f.game,{x:2000,y:1400});assert.equal((await f.method('respecTalents')).data.accepted,false);assert.equal(f.game.player.gold,gold);
    approach(f.game,{x:520,y:1250});assert.equal((await f.method('respecTalents')).data.accepted,true);assert.equal(f.game.player.gold,gold-cost);assert.equal(f.game.player.skillPoints,points+1);assert.deepEqual(f.game.skills,{});
    assert.equal((await f.method('respecTalents')).data.accepted,false,'An empty talent tree cannot mint free points');
    const npc=NPCS.find(candidate=>candidate.id==='mira');approach(f.game,npc);
    const quest=QUESTS.find(candidate=>candidate.giver===npc.id&&f.game.canAccept(candidate));assert.ok(quest);
    assert.equal((await f.method('questAccept',quest.id)).data.accepted,true);
    assert.equal((await f.method('trackQuest',quest.id)).data.accepted,true);assert.equal(f.game.trackedQuestId,quest.id);assert.equal(f.game.waypoint.kind,'quest');
    assert.equal((await f.method('trackQuest','unknown')).data.accepted,false);
    const before=await f.get(f.session.token),after=await f.restart();assert.equal(after.trackedQuestId,quest.id);assert.equal(after.waypoint.kind,before.waypoint.kind);assert.equal(after.waypoint.id,before.waypoint.id);
    assert.equal((await f.method('setWaypoint','npc','oren')).data.accepted,true);assert.equal(f.game.waypoint.id,'oren');
    assert.equal((await f.method('setWaypoint','clear','')).data.accepted,true);assert.equal(f.game.waypoint,null);
  } finally{await f.close();}
});

test('actual exploration and lore unlock a personal companion and an achievement pays only its canonical reward once across restart',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Ungereister',classId:'ranger'});assert.equal(joined.status,201);
    assert.equal((await f.method('claimAchievement','first_horizons')).data.accepted,false);assert.equal((await f.method('selectCompanion','cinder_moth')).data.accepted,false);
    f.game.player.level=4;
    for(const id of ['frostgrat','aschenmoor']) {
      const region=REGIONS.find(candidate=>candidate.id===id);approach(f.game,{x:region.x+region.w*.5,y:region.y+region.h*.5});f.hub.tick(.04);
    }
    assert.ok(f.game.journey.records.explored.length>=3,'Real region entry advances the authority journey');
    const lore=f.game.world.interactions.find(object=>object.kind==='lore'&&object.region==='daemmerhain');approach(f.game,lore);
    assert.equal((await f.method('interactWorldObject',lore.id)).data.accepted,true);assert.ok(f.game.journey.ownedCompanions.includes('cinder_moth'));
    const before=f.game.stats();assert.equal((await f.method('selectCompanion','cinder_moth')).data.accepted,true);assert.equal(f.game.journey.activeCompanion,'cinder_moth');
    assert.ok(f.game.stats().mana>before.mana);assert.ok(f.game.stats().manaRegen>before.manaRegen);
    const gold=f.game.player.gold;assert.equal((await f.method('claimAchievement','first_horizons')).data.accepted,true);assert.equal(f.game.player.gold,gold+80);
    assert.equal((await f.method('claimAchievement','first_horizons')).data.accepted,false);assert.equal(f.game.player.gold,gold+80);
    const second=await f.get(joined.data.token);assert.equal(second.journey.activeCompanion,null);assert.equal(second.journey.claimed.includes('first_horizons'),false);
    const journey=structuredClone(f.game.journey),restored=await f.restart();assert.deepEqual(restored.journey,journey);
    assert.equal((await f.method('claimAchievement','first_horizons')).data.accepted,false);
    assert.equal((await f.method('selectCompanion',null)).data.accepted,true);assert.equal(f.game.journey.activeCompanion,null);
    assert.equal((await f.method('chooseMastery','wardens_oath')).data.accepted,false,'A companion unlock cannot bypass faction mastery gates');
  } finally{await f.close();}
});

async function killEventEnemies(f,eventId) {
  for(const enemy of f.game.world.enemies.filter(actor=>actor.eventId===eventId&&actor.alive)) {
    // Fixtures isolate choreography from gear strength; attacks still commit
    // kills through the real HTTP-authoritative combat path.
    enemy.hp=1;Object.assign(f.game.player,{x:enemy.x-35,y:enemy.y,face:0});f.game.cooldowns.attack=0;
    const hit=await f.post(`/api/session/${f.session.token}/command`,{type:'action',name:'attack'});assert.equal(hit.data.accepted,true);assert.equal(enemy.alive,false);
  }
}

test('two HTTP players solve one shared ritual, kill its spawned guards and each claim their own event reward once across restart',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Siegelgefährte',classId:'ranger'});assert.equal(joined.status,201);
    const second=f.hub.sessions.get(joined.data.token).game;
    let event=f.game.world.worldEvents.find(candidate=>candidate.id==='event-aschenmoor');assert.ok(event);
    const start=f.game.world.eventObjects.find(object=>object.id===`${event.id}:start`);assert.ok(start);
    f.game.player.level=10;second.player.level=10;f.game.player.invulnerable=100;second.player.invulnerable=100;
    approach(second,start);approach(f.game,{x:start.x+500,y:start.y});assert.equal((await f.method('interactWorldEvent',start.id)).data.accepted,false,'A remote caller cannot use a nearby teammate as a proxy');assert.equal(event.state,'idle');
    approach(f.game,start);approach(second,start);assert.equal((await f.method('interactWorldEvent',start.id)).data.accepted,true);
    f.hub.tick(.04);assert.equal(event.state,'active');assert.equal(event.participants.length,1,'Standing nearby alone does not establish contribution');
    assert.equal((await f.method('claimWorldEvent',event.id)).data.accepted,false,'Opening an event cannot mint completion rewards');
    for(const symbol of ['asche','knochen','name']) {
      const rune=f.game.world.eventObjects.find(object=>object.eventId===event.id&&object.role==='rune'&&object.symbol===symbol);assert.ok(rune);
      if(symbol==='asche') {
        approach(second,rune);
        const helped=await f.post(`/api/session/${joined.data.token}/command`,{type:'method',name:'interactWorldEvent',args:[rune.id]});assert.equal(helped.data.accepted,true);
      } else {approach(f.game,rune);assert.equal((await f.method('interactWorldEvent',rune.id)).data.accepted,true);}
    }
    assert.equal(event.participants.length,2,'The second player earns contribution by solving a real rune');
    for(let frame=0;frame<400&&event.state==='active';frame++) {
      await killEventEnemies(f,event.id);approach(f.game,event);approach(second,event);f.hub.tick(.04);
    }
    assert.equal(event.state,'success');assert.ok(f.game.world.enemies.filter(actor=>actor.eventId===event.id).length>0,'The ritual spawned real guarded opposition');
    const snap=await f.get(f.session.token),other=await f.get(joined.data.token);
    assert.equal(other.world.worldEvents.find(candidate=>candidate.id===event.id).state,'success');assert.equal(snap.authoritativeWorldEventSummary.length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);
    approach(f.game,event);approach(second,event);const firstGold=f.game.player.gold,secondGold=second.player.gold;
    assert.equal((await f.method('claimWorldEvent',event.id)).data.accepted,true);assert.ok(f.game.player.gold>firstGold);assert.equal(second.player.gold,secondGold);
    const secondClaim=await f.post(`/api/session/${joined.data.token}/command`,{type:'method',name:'claimWorldEvent',args:[event.id]});assert.equal(secondClaim.data.accepted,true);assert.ok(second.player.gold>secondGold);
    const paid=f.game.player.gold;assert.equal((await f.method('claimWorldEvent',event.id)).data.accepted,false);assert.equal(f.game.player.gold,paid);
    const restored=await f.restart();event=f.game.world.worldEvents.find(candidate=>candidate.id===event.id);
    assert.equal(event.state,'rewarded');assert.equal(event.claimedBy.length,2);assert.equal(restored.player.gold,paid);assert.equal((await f.method('claimWorldEvent',event.id)).data.accepted,false);
  } finally{await f.close();}
});

test('server restart fails an interrupted event and cannot revive its guards or accept forged progress',async()=>{
  const f=await fixture();
  try {
    let event=f.game.world.worldEvents.find(candidate=>candidate.id==='event-daemmerhain');assert.ok(event);
    const start=f.game.world.eventObjects.find(object=>object.id===`${event.id}:start`);approach(f.game,start);
    assert.equal((await f.method('interactWorldEvent',start.id)).data.accepted,true);
    for(let frame=0;frame<80;frame++)f.hub.tick(.04);
    assert.ok(f.game.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.alive));
    const forged=await f.post(`/api/session/${f.session.token}/command`,{type:'method',name:'claimWorldEvent',args:[event.id],state:'success',participants:[f.session.playerId],reward:{gold:999999}});assert.equal(forged.status,400);
    const restored=await f.restart();event=f.game.world.worldEvents.find(candidate=>candidate.id===event.id);
    assert.equal(event.state,'failure');assert.ok(event.readyAt>restored.time);assert.equal(f.game.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.alive),false);
    assert.equal((await f.method('claimWorldEvent',event.id)).data.accepted,false);assert.equal((await f.method('interactWorldEvent',start.id)).data.accepted,false);
  } finally{await f.close();}
});

test('browser expansion methods use HTTP authority and global adventure summaries stay complete after spatial culling',async()=>{
  const f=await fixture();
  class EventSourceStub {constructor(){queueMicrotask(()=>this.onopen?.());}addEventListener(){}close(){}}
  try {
    const local=sparseGame();local.start();
    const network=new NetworkClient(local,{baseUrl:f.base,EventSourceImpl:EventSourceStub,storage:memoryStorage()});
    await network.connect({token:f.session.token,roomCode:f.session.roomCode,snapshot:await f.get(f.session.token)});await Promise.resolve();
    const id=f.game.equipment.weapon;
    assert.equal(local.setItemFlag(id,'favorite'),true);assert.equal(local.itemFlags[id],undefined,'The browser cannot protect or grant items ahead of the authority');
    await network._actionQueue;assert.equal(f.game.itemFlags[id].favorite,true);
    network.applySnapshot(await f.get(f.session.token));
    for(const field of ['itemFlags','stash','loadouts','trackedQuestId','waypoint','journey'])assert.deepEqual(local[field],f.game[field],`${field} follows server truth`);
    assert.deepEqual(local.worldEventSummary(),f.game.worldEventSummary());assert.equal(local.worldEventSummary().length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);
    assert.ok(local.world.worldEvents.length<WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length,'Nearby simulation objects are still spatially filtered');
    assert.equal(local.selectCompanion(null),true);await network._actionQueue;
    await network.disconnect();assert.equal(local.networkWorldEventSummary,null);assert.equal(local.networkActive,false);
  } finally{await f.close();}
});

test('a legacy save keeps its already equipped foreign-class weapon while newly equipping it still enforces class restrictions',()=>{
  const source=sparseGame();source.player.level=25;
  const bow=generateLoot({baseId:'greenwood_bow',classId:'ranger',level:25,rarity:'rare',rng:()=>.5,uid:'foreign-legacy-weapon'});
  assert.equal(source.addItem(bow),true);source.equipment.weapon=bow.id;
  const save=structuredClone(source.capture());save.version=1;
  for(const field of ['journey','stash','itemFlags','loadouts'])delete save[field];
  const loaded=sparseGame();loaded.applySave(save);
  assert.equal(loaded.inventory[bow.id],1);assert.deepEqual(loaded.generatedItems[bow.id],bow);
  assert.equal(loaded.equipment.weapon,bow.id);assert.equal(loaded.canEquipItem(bow.id),false);
  assert.equal(loaded.unequip('weapon'),true);assert.equal(loaded.equip(bow.id),false);
});

test('profession recipes for body armor never select one of the new helmet, glove or boot bases',()=>{
  for(const recipe of PROFESSION_RECIPES.filter(candidate=>candidate.outputProfile?.slot==='armor'))for(const cls of CLASSES)for(const value of [.1,.5,.9]) {
    const item=makeCraftedEquipment(recipe.id,{classId:cls.id,playerLevel:recipe.minLevel,rng:()=>value,uid:`body-craft-${recipe.id}-${cls.id}-${Math.round(value*10)}`});
    assert.ok(item);assert.equal(equipmentSlot(item),'armor',`${recipe.id} produces body armor for ${cls.id}`);
  }
});

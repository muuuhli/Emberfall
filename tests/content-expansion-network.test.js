import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { QUESTS, NPCS, ENEMY_TYPES, RECIPES } from '../src/catalog.js';
import { QUESTS as STARTING_QUESTS } from '../src/content.js';
import { EXPANSION_QUESTS } from '../src/expansion.js';
import { createBestiaryEnemy, bestiaryCombatStats, BESTIARY_ENEMIES } from '../src/bestiary.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS, WORLD_EVENT_ENEMIES } from '../src/world-events.js';
import { SIDE_STORY_CHAINS } from '../src/side-stories.js';
import { getContractOffers } from '../src/contracts.js';
import { advanceJourney, validateJourneyState } from '../src/journey.js';
import { EXPEDITION_CONTENT } from '../src/expedition-content.js';
import { TRIALS } from '../src/trial-content.js';

const LEGACY_QUESTS=[...STARTING_QUESTS,...EXPANSION_QUESTS];
const legacyIds=new Set(LEGACY_QUESTS.map(quest=>quest.id));
const SIDE_QUESTS=QUESTS.filter(quest=>!legacyIds.has(quest.id));
// Captured from the native v5.1 seeded Game before new boss-hunt definitions
// were appended. Compatibility checks do not derive old coordinates from the
// new layout, which could otherwise disguise a placement-order regression.
const LEGACY_EVENT_LAYOUT=[
  ['event-daemmerhain',552,1883],['event-frostgrat',394,644],['event-aschenmoor',2486,770],['event-glutoede',2202,2037],
  ['event-sonnensteppe',5024,1968],['event-jadeauen',8433,1810],['event-sturmkueste',11904,1680],['event-dornwildnis',14752,1920],
  ['event-obsidianpass',17824,1872],['event-mondbruch',16384,5280],['event-permafrost',10240,5360],['event-sandsenke',3520,5320],
  ['event-traumsenke',3520,9480],['event-blutmark',9984,9600],['event-sternensund',16384,9600],['event-nexusriss',9984,13120],
  ['expedition-trauerweg',285,1680],['expedition-salzzug',10631,1967],['expedition-ofenpfad',16960,1896],['expedition-schlafgericht',1792,9480],
];
const legacyEventIds=new Set(LEGACY_EVENT_LAYOUT.map(([id])=>id));
const LOOP2_EVENT_LAYOUT=[...LEGACY_EVENT_LAYOUT,
  ['event-sivra',975,684],['event-irdan',4064,1320],['event-orsa',10906,706],
  ['event-vey',14592,4960],['event-nera',4608,8360],['event-asterion',15552,12520],
];
const loop2EventIds=new Set(LOOP2_EVENT_LAYOUT.map(([id])=>id));
const LOOP3_EVENT_LAYOUT=[...LOOP2_EVENT_LAYOUT,
  ['expedition-weisshorn',1200,315],['expedition-schilfzug',7104,1920],
  ['expedition-zeitbruch',17920,4000],['expedition-namenlos',2432,7800],
];
const loop3EventIds=new Set(LOOP3_EVENT_LAYOUT.map(([id])=>id));
const namedBossEvents=()=>WORLD_EVENT_DEFINITIONS.filter(definition=>definition.mode==='boss_hunt'&&WORLD_EVENT_ENEMIES[definition.boss]);
const clone=value=>JSON.parse(JSON.stringify(value));
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
function sparseGame(){
  const game=new Game({storage:null,random:()=>.5}),initialize=game.initialize.bind(game);
  const clear=()=>{for(const key of ['trees','rocks','structures','enemies'])game.world[key]=[];};
  game.initialize=()=>{initialize();clear();};clear();return game;
}
async function fixture(){
  const storage=memoryStorage();let hub,server,base,now=Date.now();
  const open=async()=>{hub=new MultiplayerHub({createGame:sparseGame,storage,clock:()=>now,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async session=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const first=(await post('/api/rooms',{playerName:'Chronikwacht',classId:'guardian'})).data;
  const second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Spurenleser',classId:'ranger'})).data;
  const method=(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args});
  return {first,second,post,get,method,close,get hub(){return hub;},game:session=>hub.sessions.get(session.token).game,
    action:(session,name)=>post(`/api/session/${session.token}/command`,{type:'action',name}),
    // Advance rate-limit/presence time together with simulated gameplay, so
    // accelerated native encounters do not masquerade as a command flood.
    step(seconds){for(let frame=0;frame<Math.ceil(seconds/.04);frame++){now+=40;hub.tick(.04);}},
    async restart(mutate){await close();if(mutate){const data=JSON.parse(storage.getItem('emberfall.multiplayer.v1'));mutate(data);storage.setItem('emberfall.multiplayer.v1',JSON.stringify(data));}await open();},
  };
}
function establishLegacyProgress(game){
  game.player.level=100;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.player.invulnerable=100;
  for(const quest of LEGACY_QUESTS)game.questState[quest.id]={status:'done',counts:quest.objectives.map(objective=>objective.count)};
}
function approachGiver(game,quest){const npc=NPCS.find(candidate=>candidate.id===quest.giver);assert.ok(npc,`Canonical giver exists for ${quest.id}`);Object.assign(game.player,{x:npc.x,y:npc.y});return npc;}
function prerequisites(quest){return Array.isArray(quest.prerequisite)?quest.prerequisite:quest.prerequisite?[quest.prerequisite]:[];}
function establishEarlierSidePhases(game,quest){for(const id of prerequisites(quest)){const previous=SIDE_QUESTS.find(candidate=>candidate.id===id);if(previous){establishEarlierSidePhases(game,previous);game.questState[id]={status:'done',counts:previous.objectives.map(objective=>objective.count)};}}}
async function killThroughHttp(f,type,{id='story-native-actor',region,level=9}={}){
  const game=f.game(f.first),enemy=createBestiaryEnemy(type,id,game.player.x+35,game.player.y,{level,region});
  // A trusted one-hit fixture isolates event emission from combat balance. The
  // actual HTTP action and Game.killEnemy path commit every quest milestone.
  enemy.hp=1;game.world.enemies.push(enemy);game.cooldowns.attack=0;game.player.face=0;
  assert.equal((await f.action(f.first,'attack')).data.accepted,true);assert.equal(enemy.alive,false);return enemy;
}
async function completeWorldEvent(f,id,{verifyStages=false}={}){
  const game=f.game(f.first),event=game.world.worldEvents.find(value=>value.id===id),definition=[...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS].find(value=>value.id===id);assert.ok(event);assert.ok(definition);
  game.player.invulnerable=Math.max(game.player.invulnerable||0,100);
  const start=game.world.eventObjects.find(object=>object.id===`${id}:start`);Object.assign(game.player,{x:start.x,y:start.y});assert.equal((await f.method(f.first,'interactWorldEvent',start.id)).data.accepted,true);
  let serial=0;const visited=new Set();
  for(let frame=0;frame<2000&&event.state==='active';frame++){
    if(!visited.has(event.stageIndex)){
      visited.add(event.stageIndex);
      if(verifyStages){const before={gold:game.player.gold,xp:game.player.xp,dust:game.resources.dust,lootSerial:game.lootSerial};assert.equal((await f.method(f.first,'claimWorldEvent',id)).data.accepted,false);assert.deepEqual({gold:game.player.gold,xp:game.player.xp,dust:game.resources.dust,lootSerial:game.lootSerial},before,'An unfinished stage cannot pay completion rewards');}
    }
    const stage=definition.mode==='expedition'?definition.stages[event.stageIndex]:{...definition,type:definition.mode};
    const props=game.world.eventObjects.filter(object=>object.eventId===id&&!object.hidden);
    let clickable;
    if(stage.type==='choice'||stage.type==='seal_choice')clickable=props.find(object=>object.role==='choice');
    if(stage.type==='ambush'||stage.type==='boss_hunt')clickable=props.find(object=>object.role==='rune'&&!object.active);
    if(stage.type==='ritual'&&stage.rule==='sequence')clickable=props.find(object=>object.role==='rune'&&!object.active&&object.symbol===stage.symbols[event.objective.progress]);
    if(stage.type==='ritual'&&stage.rule==='switches')clickable=props.find(object=>object.role==='rune'&&object.active!==stage.pattern[object.index]);
    if(stage.type==='ritual'&&stage.rule==='alignment')clickable=props.find(object=>object.role==='rune'&&object.rotation!==stage.rotations[object.index]);
    if(clickable){Object.assign(game.player,{x:clickable.x,y:clickable.y});const interacted=await f.method(f.first,'interactWorldEvent',clickable.id);assert.equal(interacted.status,200,interacted.data.error);assert.equal(interacted.data.accepted,true);}
    for(const enemy of game.world.enemies.filter(actor=>actor.eventId===id&&actor.alive)){
      enemy.hp=1;Object.assign(game.player,{x:enemy.x-35,y:enemy.y,face:0});game.cooldowns.attack=0;assert.equal((await f.action(f.first,'attack')).data.accepted,true);assert.equal(enemy.alive,false);serial++;
    }
    const escort=props.find(object=>object.role==='escort'),objective=props.find(object=>object.role==='objective'),hold=stage.rule==='hold'&&props.find(object=>object.role==='rune');
    const anchor=escort||objective||hold||event;Object.assign(game.player,{x:anchor.x,y:anchor.y});f.step(.08);
  }
  assert.equal(event.state,'success',`Native event ${id} reaches its actual completion condition`);assert.ok(serial>0,'Event completion required real spawned opposition');
  return {visited:[...visited],kills:serial,choice:event.choice,bonus:event.bonus};
}
const eventActors=(game,event)=>game.world.enemies.filter(actor=>actor.eventId===event.id&&actor.eventRun===event.run&&actor.alive);
const purse=game=>({gold:game.player.gold,xp:game.player.xp,dust:game.resources.dust,lootSerial:game.lootSerial});
async function startTrial(f,id){
  const game=f.game(f.first),event=game.world.worldEvents.find(value=>value.id===id),start=game.world.eventObjects.find(object=>object.id===`${id}:start`);
  assert.ok(event);assert.ok(start);game.player.invulnerable=100;Object.assign(game.player,{x:start.x,y:start.y});
  assert.equal((await f.method(f.first,'interactWorldEvent',start.id)).data.accepted,true);assert.equal(event.phase,'wave-warning');return event;
}
async function killEventActors(f,event){
  const game=f.game(f.first),actors=eventActors(game,event);
  // Only HP is shortened by this trusted balance-isolation fixture. Actors,
  // wave order, damage commands, deaths and completion hooks remain native.
  for(const actor of actors)actor.hp=1;
  for(const actor of actors.filter(value=>value.alive)){
    if(!actor.alive)continue;
    Object.assign(game.player,{x:actor.x-35,y:actor.y,face:0});game.cooldowns.attack=0;
    assert.equal((await f.action(f.first,'attack')).data.accepted,true);assert.equal(actor.alive,false);
  }
  Object.assign(game.player,{x:event.x,y:event.y});f.step(.08);return actors.length;
}
async function fulfillObjective(f,quest,index){
  const game=f.game(f.first),objective=quest.objectives[index];if(game.questState[quest.id].counts[index]>=objective.count)return;
  if(objective.kind==='interact'){
    const object=game.world.interactions.find(value=>value.id===objective.target);assert.ok(object);Object.assign(game.player,{x:object.x,y:object.y});assert.equal((await f.method(f.first,'interactWorldObject',object.id)).data.accepted,true);
  } else if(objective.kind==='craft'){
    const recipe=RECIPES.find(value=>value.id===objective.target);assert.ok(recipe);for(const [resource,amount] of Object.entries(recipe.ingredients))game.resources[resource]=(game.resources[resource]||0)+amount;
    assert.equal((await f.method(f.first,'craft',recipe.id)).data.accepted,true);
  } else if(objective.kind==='boss'){
    const type=Object.keys(ENEMY_TYPES).find(id=>ENEMY_TYPES[id].boss&&ENEMY_TYPES[id].baseType===objective.target);assert.ok(type);
    for(let count=game.questState[quest.id].counts[index];count<objective.count;count++)await killThroughHttp(f,type,{id:`side-http-${quest.id}-${count}`,region:quest.region,level:quest.minLevel||9});
  } else if(objective.kind==='world_event')await completeWorldEvent(f,objective.target);
  else throw new Error(`Fixture needs an explicit native producer for ${objective.kind}`);
  assert.equal(game.questState[quest.id].counts[index],objective.count);
}

test('a native legacy room save preserves its identities and original quests without completing newly added side stories',async()=>{
  const f=await fixture();try {
    assert.equal(SIDE_QUESTS.length,24);assert.equal(LEGACY_QUESTS.length,72);
    establishLegacyProgress(f.game(f.first));const original=clone(f.game(f.first).questState),inventory=clone(f.game(f.first).inventory);
    await f.restart(data=>{for(const member of data.rooms[0].members)for(const quest of SIDE_QUESTS)delete member.save.questState[quest.id];});
    const resumed=await f.get(f.first);assert.equal(resumed.playerId,f.first.playerId);assert.equal(resumed.roomCode,f.first.roomCode);assert.equal(resumed.player.name,'Chronikwacht');assert.equal(resumed.player.classId,'guardian');assert.deepEqual(resumed.inventory,inventory);
    for(const quest of LEGACY_QUESTS)assert.deepEqual(resumed.questState[quest.id],original[quest.id]);
    for(const quest of SIDE_QUESTS)assert.equal(resumed.questState[quest.id],undefined,'Added story content starts unaccepted, not completed');
    assert.equal(JSON.stringify(resumed).includes(f.first.token),false,'Room identity does not expose private session tokens');
  }finally{await f.close();}
});

test('actual shared one-use lore remains eligible for a remembered story objective without forging personal progress',async()=>{
  const f=await fixture();try {
    const quest=SIDE_QUESTS.find(candidate=>candidate.objectives.some(objective=>objective.kind==='interact'&&objective.remembered));assert.ok(quest);
    const objective=quest.objectives.find(value=>value.kind==='interact'&&value.remembered),game=f.game(f.first),other=f.game(f.second);establishLegacyProgress(game);establishLegacyProgress(other);establishEarlierSidePhases(game,quest);
    const object=game.world.interactions.find(candidate=>candidate.id===objective.target);assert.ok(object);Object.assign(other.player,{x:object.x,y:object.y});
    assert.equal((await f.method(f.second,'interactWorldObject',object.id)).data.accepted,true);assert.equal(object.used,true);assert.equal(game.ledger[`interact:${object.id}`]||0,0,'The accepting character did not receive the other character’s personal interaction ledger');
    approachGiver(game,quest);assert.equal((await f.method(f.first,'questAccept',quest.id)).data.accepted,true);
    const index=quest.objectives.indexOf(objective);assert.equal(game.questState[quest.id].counts[index],objective.count,'The canonical shared object supplies the remembered once-only fact');
    const saved=clone(game.questState[quest.id]);await f.restart();assert.deepEqual((await f.get(f.first)).questState[quest.id],saved);assert.equal(f.game(f.first).world.interactions.find(value=>value.id===object.id).used,true);
  }finally{await f.close();}
});

test('new world-event story objectives start fresh and HTTP refuses client-supplied counts, status or reward',async()=>{
  const f=await fixture();try {
    const quest=SIDE_QUESTS.find(candidate=>candidate.objectives.some(objective=>objective.kind==='world_event'));assert.ok(quest);const game=f.game(f.first);establishLegacyProgress(game);establishEarlierSidePhases(game,quest);
    for(const objective of quest.objectives)game.ledger[`${objective.kind}:${objective.target}`]=999;
    Object.assign(game.player,{x:19000,y:14000});assert.equal((await f.method(f.first,'questAccept',quest.id)).status,409,'A remote browser must approach the real NPC');approachGiver(game,quest);
    const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'method',name:'questAccept',args:[quest.id],counts:[999],status:'ready',reward:{gold:999999}});assert.equal(forged.status,400);assert.equal(game.questState[quest.id],undefined);
    assert.equal((await f.method(f.first,'questAccept',quest.id)).data.accepted,true);
    quest.objectives.forEach((objective,index)=>{if(objective.kind==='world_event'||objective.fresh)assert.equal(game.questState[quest.id].counts[index],0);});
    const beforeGold=game.player.gold;assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,false);assert.equal(game.player.gold,beforeGold);
    assert.equal((await f.method(f.first,'event','world_event',quest.objectives.find(value=>value.kind==='world_event').target)).status,400,'Only native authoritative completions can advance a story');
    const before=clone(game.questState[quest.id]);await f.restart();assert.deepEqual((await f.get(f.first)).questState[quest.id],before);
  }finally{await f.close();}
});

test('native HTTP champion kills advance fresh boss-kind story objectives and completion pays only once across restart',async()=>{
  const f=await fixture();try {
    const quest=SIDE_QUESTS.find(candidate=>candidate.objectives.length===1&&candidate.objectives[0].kind==='boss')||SIDE_QUESTS.find(candidate=>candidate.objectives.some(objective=>objective.kind==='boss'));assert.ok(quest);
    const game=f.game(f.first);establishLegacyProgress(game);establishEarlierSidePhases(game,quest);approachGiver(game,quest);assert.equal((await f.method(f.first,'questAccept',quest.id)).data.accepted,true);
    for(let index=0;index<quest.objectives.length;index++)await fulfillObjective(f,quest,index);
    assert.equal(game.questState[quest.id].status,'ready');approachGiver(game,quest);const gold=game.player.gold,points=game.player.skillPoints;
    assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,true);assert.equal(game.player.gold,gold+(quest.reward.gold||0));assert.equal(game.player.skillPoints,points+(quest.reward.skillPoints||0));
    const paid=clone(game.questState[quest.id]),paidGold=game.player.gold;assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,false);assert.equal(game.player.gold,paidGold);
    await f.restart();const snapshot=await f.get(f.first);assert.deepEqual(snapshot.questState[quest.id],paid);assert.equal(snapshot.player.gold,paidGold);approachGiver(f.game(f.first),quest);assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,false);
    assert.equal((await f.method(f.first,'questAccept',quest.id)).data.accepted,false,'Completed side-story phases cannot be replayed for a second reward');
  }finally{await f.close();}
});

test('a three-chapter side story gates each phase, follows native objects and crafting, and resumes its finale without replay rewards',async()=>{
  const f=await fixture();try {
    const chain=SIDE_STORY_CHAINS.find(value=>value.id==='moor-inheritance');assert.ok(chain);const quests=chain.quests.map(id=>SIDE_QUESTS.find(quest=>quest.id===id));assert.equal(quests.length,3);
    const game=f.game(f.first);establishLegacyProgress(game);approachGiver(game,quests[1]);assert.equal((await f.method(f.first,'questAccept',quests[1].id)).data.accepted,false,'The second chapter cannot bypass the first conclusion');
    for(const [phase,quest] of quests.entries()){
      const current=f.game(f.first);approachGiver(current,quest);assert.equal((await f.method(f.first,'questAccept',quest.id)).data.accepted,true);
      for(let index=0;index<quest.objectives.length;index++)await fulfillObjective(f,quest,index);
      assert.equal(current.questState[quest.id].status,'ready');
      if(phase===2){const ready=clone(current.questState[quest.id]);await f.restart();assert.deepEqual((await f.get(f.first)).questState[quest.id],ready,'A genuinely completed finale resumes ready for NPC turn-in');}
      const resumed=f.game(f.first);approachGiver(resumed,quest);const before=resumed.player.gold;
      assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,true);assert.equal(resumed.player.gold,before+quest.reward.gold);
      assert.equal((await f.method(f.first,'questTurnIn',quest.id)).data.accepted,false);assert.equal(resumed.player.gold,before+quest.reward.gold);
      assert.equal(resumed.questState[quest.id].status,'done');
    }
    await f.restart();const completed=await f.get(f.first);for(const quest of quests)assert.equal(completed.questState[quest.id].status,'done');
    assert.equal((await f.get(f.second)).questState[quests[2].id],undefined,'Shared battles do not implicitly accept another character’s personal narrative');
  }finally{await f.close();}
});

test('starting-region contracts retain canonical Rowan proximity after side stories add Mira as a regional giver',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first),rowan=NPCS.find(npc=>npc.id==='rowan'),mira=NPCS.find(npc=>npc.id==='mira');game.player.level=8;
    assert.ok(SIDE_QUESTS.some(quest=>quest.region==='daemmerhain'&&quest.giver==='mira'));
    assert.equal(game.contractGiver('daemmerhain').id,'rowan');const offer=getContractOffers({regionId:'daemmerhain',level:8,completed:0})[0];
    Object.assign(game.player,{x:mira.x,y:mira.y});assert.equal((await f.method(f.first,'acceptContract',offer.id)).data.accepted,false,'Mira cannot replace the original contract giver');
    Object.assign(game.player,{x:rowan.x,y:rowan.y});assert.equal((await f.method(f.first,'acceptContract',offer.id)).data.accepted,true);assert.equal(game.contracts.active[0].id,offer.id);
    await f.restart();assert.equal(f.game(f.first).contractGiver('daemmerhain').id,'rowan');assert.equal((await f.get(f.first)).contracts.active[0].id,offer.id);
  }finally{await f.close();}
});

test('a legacy room keeps original event coordinates and reward history while acquiring every new canonical event and prop',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);await completeWorldEvent(f,'event-aschenmoor');assert.equal((await f.method(f.first,'claimWorldEvent','event-aschenmoor')).data.accepted,true);
    const paidGold=game.player.gold,paidLoot=clone(game.inventory),claimed=clone(game.world.worldEvents.find(event=>event.id==='event-aschenmoor').claimedBy);
    const pending=game.world.worldEvents.find(event=>event.id==='event-jadeauen'),start=game.world.eventObjects.find(object=>object.id===`${pending.id}:start`);Object.assign(game.player,{x:start.x,y:start.y});assert.equal((await f.method(f.first,'interactWorldEvent',start.id)).data.accepted,true);f.step(8.04);
    assert.equal(pending.state,'active');assert.ok(game.world.enemies.some(enemy=>enemy.eventId===pending.id&&enemy.alive));
    await f.restart(data=>{
      const room=data.rooms[0];room.world.worldEvents=room.world.worldEvents.filter(event=>legacyEventIds.has(event.id));room.world.eventObjects=room.world.eventObjects.filter(object=>legacyEventIds.has(object.eventId));
      for(const member of room.members)member.save.world.worldEvents=member.save.world.worldEvents.filter(event=>legacyEventIds.has(event.id));
    });
    const restored=f.game(f.first),world=restored.world,snapshot=await f.get(f.first);assert.equal(world.worldEvents.length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);assert.equal(snapshot.authoritativeWorldEventSummary.length,world.worldEvents.length);
    for(const [id,x,y] of LEGACY_EVENT_LAYOUT){const event=world.worldEvents.find(value=>value.id===id);assert.ok(event);assert.equal(event.x,x);assert.equal(event.y,y);}
    for(const definition of [...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS].filter(value=>!legacyEventIds.has(value.id))){const event=world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'idle');assert.ok(world.eventObjects.some(object=>object.id===`${event.id}:start`&&!object.hidden));assert.ok(world.eventObjects.some(object=>object.id===`${event.id}:reward`&&object.hidden));}
    const oldPaid=world.worldEvents.find(event=>event.id==='event-aschenmoor');assert.equal(oldPaid.state,'rewarded');assert.deepEqual(oldPaid.claimedBy,claimed);assert.equal(restored.player.gold,paidGold);assert.deepEqual(restored.inventory,paidLoot);Object.assign(restored.player,{x:oldPaid.x,y:oldPaid.y});assert.equal((await f.method(f.first,'claimWorldEvent',oldPaid.id)).data.accepted,false);
    const oldActive=world.worldEvents.find(event=>event.id===pending.id);assert.equal(oldActive.state,'failure');assert.ok(oldActive.readyAt>restored.time);assert.equal(world.enemies.some(enemy=>enemy.eventId===pending.id&&enemy.alive),false,'An interrupted old run cannot revive its guards');
    assert.equal(namedBossEvents().length,6);
  }finally{await f.close();}
});

test('all six named regional bosses require actual HTTP traces, opposition and participation before paying each completion once',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first),other=f.game(f.second);establishLegacyProgress(game);assert.equal(namedBossEvents().length,6);
    for(const definition of namedBossEvents()){
      const event=game.world.worldEvents.find(value=>value.id===definition.id);assert.ok(event);assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);
      const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'method',name:'interactWorldEvent',args:[`${event.id}:start`],state:'success',participants:[f.first.playerId],reward:{gold:999999}});assert.equal(forged.status,400);
      assert.equal((await f.method(f.first,'claimWorldEvent',event.id,999999)).status,400);assert.equal((await f.method(f.first,'event','world_event',event.id)).status,400);
      await completeWorldEvent(f,event.id);assert.ok(game.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.type===definition.boss&&!enemy.alive));
      assert.ok(game.journey.records.events.includes(event.id));assert.ok(game.journey.records.bosses.includes(definition.boss),'A rewardless named boss is recorded through its canonical completed world event');
      Object.assign(other.player,{x:event.x,y:event.y,level:100});const unearned=other.player.gold;assert.equal((await f.method(f.second,'claimWorldEvent',event.id)).data.accepted,false);assert.equal(other.player.gold,unearned,'An arriving spectator cannot collect a completed encounter');
      Object.assign(game.player,{x:event.x,y:event.y});const gold=game.player.gold;assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,true);assert.ok(game.player.gold>gold);const paid=game.player.gold;
      assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);assert.equal(game.player.gold,paid);
      Object.assign(other.player,{x:520,y:1250,level:1});
    }
    const before=clone(game.journey),gold=game.player.gold;await f.restart();const resumed=await f.get(f.first);assert.deepEqual(resumed.journey,before);assert.equal(resumed.player.gold,gold);
    for(const definition of namedBossEvents()){const event=f.game(f.first).world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'rewarded');Object.assign(f.game(f.first).player,{x:event.x,y:event.y});assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);}
  }finally{await f.close();}
});

test('the permanent event chronicle accepts the complete expanded registry without truncating at the former cap',()=>{
  const game=sparseGame();game.player.level=100;const definitions=[...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS];
  for(const definition of definitions)advanceJourney(game,'world_event',definition.id);
  assert.equal(game.journey.records.events.length,definitions.length);assert.equal(validateJourneyState(game.journey,{level:100}),true);
  const before=clone(game.journey);for(const definition of definitions)advanceJourney(game,'world_event',definition.id);assert.deepEqual(game.journey,before,'Repeated completions do not mint permanent reputation twice');
  const loaded=sparseGame();loaded.applySave(clone(game.capture()));assert.deepEqual(loaded.journey,game.journey);
});

test('all four new expeditions traverse five native HTTP stages before once-only payment and durable completion',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);assert.equal(EXPEDITION_CONTENT.length,4);
    for(const definition of EXPEDITION_CONTENT){
      assert.ok(EXPEDITIONS.some(expedition=>expedition.id===definition.id));assert.equal(definition.stages.length,5);
      const result=await completeWorldEvent(f,definition.id,{verifyStages:true});assert.deepEqual(result.visited,[0,1,2,3,4]);assert.equal(result.choice,'safe');assert.equal(result.bonus,1);
      const event=game.world.worldEvents.find(value=>value.id===definition.id),boss=definition.stages.find(stage=>stage.type==='boss_hunt').boss;
      assert.ok(game.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.type===boss&&!enemy.alive),'Each authored named finale was spawned and actually killed');assert.ok(game.journey.records.events.includes(event.id));assert.ok(game.journey.records.bosses.includes(boss));
      Object.assign(game.player,{x:event.x,y:event.y});const preview=game.worldEventSummary().find(value=>value.id===event.id);assert.equal(preview.stages,5);assert.equal(preview.claimable,true);
      const before={gold:game.player.gold,xp:game.player.xp,dust:game.resources.dust};assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,true);
      assert.equal(game.player.gold,before.gold+preview.reward.gold);assert.equal(game.resources.dust,before.dust+preview.reward.dust);const paid=game.player.gold;
      assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);assert.equal(game.player.gold,paid);
    }
    const gold=game.player.gold,inventory=clone(game.inventory),journey=clone(game.journey);await f.restart();const restored=await f.get(f.first);assert.equal(restored.player.gold,gold);assert.deepEqual(restored.inventory,inventory);assert.deepEqual(restored.journey,journey);
    for(const definition of EXPEDITION_CONTENT){const event=f.game(f.first).world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'rewarded');assert.ok(event.claimedBy.includes(f.first.playerId));Object.assign(f.game(f.first).player,{x:event.x,y:event.y});assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);}
  }finally{await f.close();}
});

test('a saved twenty-six-activity room acquires four new expeditions without moving paid legacy activities or duplicating props',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);await completeWorldEvent(f,'expedition-trauerweg');assert.equal((await f.method(f.first,'claimWorldEvent','expedition-trauerweg')).data.accepted,true);
    const paid=game.world.worldEvents.find(event=>event.id==='expedition-trauerweg'),history={state:paid.state,run:paid.run,completions:paid.completions,rewardedRuns:paid.rewardedRuns,claimedBy:[...paid.claimedBy]},gold=game.player.gold;
    await f.restart(data=>{
      const room=data.rooms[0];room.world.worldEvents=room.world.worldEvents.filter(event=>loop2EventIds.has(event.id));room.world.eventObjects=room.world.eventObjects.filter(object=>loop2EventIds.has(object.eventId));
      for(const member of room.members)member.save.world.worldEvents=member.save.world.worldEvents.filter(event=>loop2EventIds.has(event.id));
    });
    const restored=f.game(f.first);assert.equal(restored.world.worldEvents.length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);
    for(const [id,x,y] of LOOP2_EVENT_LAYOUT){const event=restored.world.worldEvents.find(value=>value.id===id);assert.ok(event);assert.equal(event.x,x);assert.equal(event.y,y);}
    const unchanged=restored.world.worldEvents.find(event=>event.id===paid.id);assert.deepEqual({state:unchanged.state,run:unchanged.run,completions:unchanged.completions,rewardedRuns:unchanged.rewardedRuns,claimedBy:unchanged.claimedBy},history);assert.equal(restored.player.gold,gold);
    for(const definition of EXPEDITION_CONTENT){const event=restored.world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'idle');assert.equal(restored.world.eventObjects.filter(object=>object.id===`${event.id}:start`).length,1);assert.equal(restored.world.eventObjects.filter(object=>object.id===`${event.id}:reward`).length,1);}
    await completeWorldEvent(f,EXPEDITION_CONTENT[0].id,{verifyStages:true});assert.equal(f.game(f.first).world.worldEvents.find(event=>event.id===EXPEDITION_CONTENT[0].id).state,'success','A newly acquired expedition is immediately playable after a genuine old room restart');
  }finally{await f.close();}
});

test('an interrupted new expedition cannot resume at its finale or pay rewards from a forged completion',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);const definition=EXPEDITION_CONTENT.find(value=>value.id==='expedition-zeitbruch'),event=game.world.worldEvents.find(value=>value.id===definition.id),start=game.world.eventObjects.find(object=>object.id===`${event.id}:start`);
    Object.assign(game.player,{x:start.x,y:start.y});assert.equal((await f.method(f.first,'interactWorldEvent',start.id)).data.accepted,true);
    const safe=game.world.eventObjects.find(object=>object.eventId===event.id&&object.role==='choice'&&object.choice==='safe');Object.assign(game.player,{x:safe.x,y:safe.y});assert.equal((await f.method(f.first,'interactWorldEvent',safe.id)).data.accepted,true);f.step(2.04);
    assert.equal(event.stageIndex,1);assert.ok(game.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.alive));const gold=game.player.gold,xp=game.player.xp,dust=game.resources.dust;
    const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'method',name:'claimWorldEvent',args:[event.id],stageIndex:5,state:'success',participants:[f.first.playerId]});assert.equal(forged.status,400);await f.restart();
    const restored=f.game(f.first),failed=restored.world.worldEvents.find(value=>value.id===event.id);assert.equal(failed.state,'failure');assert.ok(failed.readyAt>restored.time);assert.equal(restored.world.enemies.some(enemy=>enemy.eventId===event.id&&enemy.alive),false);
    Object.assign(restored.player,{x:failed.x,y:failed.y});assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);assert.equal((await f.method(f.first,'interactWorldEvent',`${event.id}:start`)).data.accepted,false);
    assert.equal(restored.player.gold,gold);assert.equal(restored.player.xp,xp);assert.equal(restored.resources.dust,dust);assert.equal(restored.journey.records.events.includes(event.id),false);
  }finally{await f.close();}
});

test('all three HTTP trials honor native six-second wave order, bounded pushing and a once-only boss completion reward',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);assert.equal(TRIALS.length,3);
    for(const definition of TRIALS){
      const event=await startTrial(f,definition.id);assert.equal(definition.mode,'gauntlet');assert.equal(definition.contentType,'challenge');
      for(let index=0;index<definition.waves.length;index++){
        const plan=definition.waves[index],before=purse(game);assert.equal(event.waveIndex,index);assert.equal(event.phase,'wave-warning');
        assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);
        f.step(5.92);assert.equal(eventActors(game,event).length,0,'An actual six-second warning precedes every wave');f.step(.12);
        const actors=eventActors(game,event),expected=plan.boss?1:Math.min(7,plan.count+(index?1:0));assert.equal(actors.length,expected);
        assert.deepEqual(actors.map(actor=>actor.type),Array.from({length:expected},(_,actorIndex)=>plan.boss||plan.types[actorIndex%plan.types.length]));
        assert.equal(event.phase,'wave-combat');const summary=(await f.get(f.first)).authoritativeWorldEventSummary.find(value=>value.id===event.id);
        assert.deepEqual(summary.wave,{current:index+1,total:definition.waves.length,cleared:index,bossFinal:true});
        for(const actor of actors){
          assert.equal(actor.rewardless,true);assert.equal(actor.xp,0);assert.equal(actor.gold,0);assert.equal(actor.eventRun,event.run);
          const base=bestiaryCombatStats(WORLD_EVENT_ENEMIES[actor.type]||BESTIARY_ENEMIES[actor.type],event.level);
          assert.equal(actor.maxHp,plan.boss?base.maxHp:Math.round(Math.round(base.maxHp*.65)*(plan.hpScale||1)),'Pushing changes only normal actor count, never the authored per-actor HP budget');
        }
        assert.equal(await killEventActors(f,event),expected);assert.deepEqual(purse(game),before,'Rewardless trial waves cannot pay ordinary monster or partial completion rewards');
        if(index<definition.waves.length-1){
          assert.equal(event.phase,'intermission');const choice=game.world.eventObjects.find(object=>object.eventId===event.id&&object.role==='choice'&&object.choice==='push'&&!object.hidden);assert.ok(choice);
          Object.assign(game.player,{x:choice.x,y:choice.y});const state=clone({phase:event.phase,waveIndex:event.waveIndex,bonus:event.bonus,pending:event.pending});
          const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'method',name:'interactWorldEvent',args:[choice.id],count:999,bonus:999,participants:[f.first.playerId]});assert.equal(forged.status,400);
          assert.equal((await f.method(f.first,'interactWorldEvent',choice.id,999)).status,400);
          assert.equal((await f.method(f.first,'interactWorldEvent',choice.id,'unlimited')).data.accepted,false);assert.deepEqual({phase:event.phase,waveIndex:event.waveIndex,bonus:event.bonus,pending:event.pending},state);
          assert.equal((await f.method(f.first,'interactWorldEvent',choice.id)).data.accepted,true);assert.equal(event.bonus,Math.min(1.25,1+(index+1)*.05));
          assert.equal((await f.method(f.first,'interactWorldEvent',choice.id)).data.accepted,false,'The same hidden choice cannot increase the bonus twice');
        }
      }
      assert.equal(event.state,'success');assert.equal(event.waveIndex,definition.waves.length);const boss=definition.waves.at(-1).boss,record=boss.endsWith('_boss')?boss.slice(0,-5):boss;
      assert.ok(game.world.enemies.some(actor=>actor.eventId===event.id&&actor.type===boss&&!actor.alive));assert.ok(game.journey.records.events.includes(event.id));assert.ok(game.journey.records.bosses.includes(record));
      const preview=game.worldEventSummary().find(value=>value.id===event.id),before=purse(game);assert.equal(preview.claimable,true);
      assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,true);assert.equal(game.player.gold,before.gold+preview.reward.gold);assert.equal(game.resources.dust,before.dust+preview.reward.dust);
      const paid=purse(game);assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);assert.deepEqual(purse(game),paid);
    }
    const paid=purse(game),journey=clone(game.journey);await f.restart();const restored=f.game(f.first);assert.deepEqual(purse(restored),paid);assert.deepEqual(restored.journey,journey);
    for(const definition of TRIALS){const event=restored.world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'rewarded');Object.assign(restored.player,{x:event.x,y:event.y});assert.equal((await f.method(f.first,'claimWorldEvent',event.id)).data.accepted,false);}
  }finally{await f.close();}
});

test('native HTTP trial rest heals qualified nearby living party members once and excludes distant, dead and unqualified players',async()=>{
  const f=await fixture();try {
    const join=async playerName=>{const result=await f.post(`/api/rooms/${f.first.roomCode}/join`,{playerName,classId:'guardian'});assert.equal(result.status,201);return result.data;};
    const distant=await join('Fernwacht'),fallen=await join('Gefallene'),game=f.game(f.first);establishLegacyProgress(game);const event=await startTrial(f,TRIALS[0].id);
    for(const session of [f.second,distant,fallen]){const ally=f.game(session);establishLegacyProgress(ally);Object.assign(ally.player,{x:event.x,y:event.y});}
    f.step(6.04);for(const session of [f.first,f.second,distant,fallen])assert.ok(event.participants.includes(session.playerId),'Participation is earned by actual time near the active trial');
    assert.ok(eventActors(game,event).length);await killEventActors(f,event);assert.equal(event.phase,'intermission');
    const newcomer=await join('Spätankunft'),sessions=[f.first,f.second,distant,fallen,newcomer];
    for(const session of sessions){const ally=f.game(session);ally.player.level=100;ally.player.hp=ally.stats().maxHp*.35;ally.player.mana=ally.stats().mana*.25;Object.assign(ally.player,{x:event.x,y:event.y});}
    Object.assign(f.game(distant).player,{x:event.x+300});f.game(fallen).dead=true;f.game(fallen).player.hp=0;f.game(fallen).player.mana=0;
    assert.equal(event.participants.includes(newcomer.playerId),false,'An arriving bystander has not earned participation');
    const rest=game.world.eventObjects.find(object=>object.eventId===event.id&&object.role==='choice'&&object.choice==='rest'&&!object.hidden);assert.ok(rest);
    const before=sessions.map(session=>({hp:f.game(session).player.hp,mana:f.game(session).player.mana}));
    Object.assign(game.player,{x:rest.x+86,y:rest.y});assert.equal((await f.method(f.first,'interactWorldEvent',rest.id)).data.accepted,false,'A choice cannot be issued outside its real interaction radius');
    assert.deepEqual(sessions.map(session=>({hp:f.game(session).player.hp,mana:f.game(session).player.mana})),before);
    Object.assign(game.player,{x:rest.x,y:rest.y});assert.equal((await f.method(f.first,'interactWorldEvent',rest.id)).data.accepted,true);assert.equal(event.phase,'wave-warning');assert.equal(event.bonus,1);
    sessions.forEach((session,index)=>{const ally=f.game(session),eligible=index<2;assert.equal(ally.player.hp,before[index].hp+(eligible?ally.stats().maxHp*.2:0));assert.equal(ally.player.mana,before[index].mana+(eligible?ally.stats().mana*.15:0));});
    assert.equal(f.game(fallen).dead,true);assert.equal(event.participants.includes(newcomer.playerId),false);
    const healed=sessions.map(session=>({hp:f.game(session).player.hp,mana:f.game(session).player.mana}));assert.equal((await f.method(f.first,'interactWorldEvent',rest.id)).data.accepted,false);assert.deepEqual(sessions.map(session=>({hp:f.game(session).player.hp,mana:f.game(session).player.mana})),healed);
  }finally{await f.close();}
});

test('a legacy thirty-activity HTTP room retains canonical layout and paid history while new trials restore idle and interrupted trials fail safely',async()=>{
  const f=await fixture();try {
    const game=f.game(f.first);establishLegacyProgress(game);await completeWorldEvent(f,'expedition-weisshorn');assert.equal((await f.method(f.first,'claimWorldEvent','expedition-weisshorn')).data.accepted,true);
    const paid=game.world.worldEvents.find(value=>value.id==='expedition-weisshorn'),history=clone({state:paid.state,run:paid.run,completions:paid.completions,rewardedRuns:paid.rewardedRuns,claimedBy:paid.claimedBy}),before=purse(game);
    await f.restart(data=>{const room=data.rooms[0];room.world.worldEvents=room.world.worldEvents.filter(event=>loop3EventIds.has(event.id));room.world.eventObjects=room.world.eventObjects.filter(object=>loop3EventIds.has(object.eventId));for(const member of room.members)member.save.world.worldEvents=member.save.world.worldEvents.filter(event=>loop3EventIds.has(event.id));});
    let restored=f.game(f.first);assert.equal(restored.world.worldEvents.length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);assert.deepEqual(purse(restored),before);
    for(const [id,x,y] of LOOP3_EVENT_LAYOUT){const event=restored.world.worldEvents.find(value=>value.id===id);assert.ok(event);assert.equal(event.x,x);assert.equal(event.y,y);}
    const oldPaid=restored.world.worldEvents.find(value=>value.id===paid.id);assert.deepEqual({state:oldPaid.state,run:oldPaid.run,completions:oldPaid.completions,rewardedRuns:oldPaid.rewardedRuns,claimedBy:oldPaid.claimedBy},history);
    Object.assign(restored.player,{x:oldPaid.x,y:oldPaid.y});assert.equal((await f.method(f.first,'claimWorldEvent',oldPaid.id)).data.accepted,false);
    for(const definition of TRIALS){const event=restored.world.worldEvents.find(value=>value.id===definition.id);assert.equal(event.state,'idle');assert.equal(restored.world.eventObjects.filter(object=>object.id===`${event.id}:start`&&!object.hidden).length,1);assert.equal(restored.world.eventObjects.filter(object=>object.id===`${event.id}:reward`&&object.hidden).length,1);}
    const interrupted=await startTrial(f,TRIALS[0].id);f.step(6.04);assert.ok(eventActors(restored,interrupted).length);const interruptedPurse=purse(restored);
    const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'method',name:'claimWorldEvent',args:[interrupted.id],waveIndex:99,state:'success',bonus:99});assert.equal(forged.status,400);await f.restart();
    restored=f.game(f.first);const failed=restored.world.worldEvents.find(value=>value.id===interrupted.id);assert.equal(failed.state,'failure');assert.ok(failed.readyAt>restored.time);assert.equal(eventActors(restored,failed).length,0);assert.deepEqual(purse(restored),interruptedPurse);
    Object.assign(restored.player,{x:failed.x,y:failed.y});assert.equal((await f.method(f.first,'claimWorldEvent',failed.id)).data.accepted,false);assert.equal((await f.method(f.first,'interactWorldEvent',`${failed.id}:start`)).data.accepted,false);assert.equal(restored.journey.records.events.includes(failed.id),false);
  }finally{await f.close();}
});

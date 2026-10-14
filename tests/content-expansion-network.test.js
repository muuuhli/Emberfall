import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { QUESTS, NPCS, ENEMY_TYPES, RECIPES } from '../src/catalog.js';
import { QUESTS as STARTING_QUESTS } from '../src/content.js';
import { EXPANSION_QUESTS } from '../src/expansion.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS } from '../src/world-events.js';
import { SIDE_STORY_CHAINS } from '../src/side-stories.js';

const LEGACY_QUESTS=[...STARTING_QUESTS,...EXPANSION_QUESTS];
const legacyIds=new Set(LEGACY_QUESTS.map(quest=>quest.id));
const SIDE_QUESTS=QUESTS.filter(quest=>!legacyIds.has(quest.id));
const clone=value=>JSON.parse(JSON.stringify(value));
function memoryStorage(){const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value)};}
function sparseGame(){
  const game=new Game({storage:null,random:()=>.5}),initialize=game.initialize.bind(game);
  const clear=()=>{for(const key of ['trees','rocks','structures','enemies'])game.world[key]=[];};
  game.initialize=()=>{initialize();clear();};clear();return game;
}
async function fixture(){
  const storage=memoryStorage();let hub,server,base;
  const open=async()=>{hub=new MultiplayerHub({createGame:sparseGame,storage,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async session=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const first=(await post('/api/rooms',{playerName:'Chronikwacht',classId:'guardian'})).data;
  const second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Spurenleser',classId:'ranger'})).data;
  const method=(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args});
  return {first,second,post,get,method,close,get hub(){return hub;},game:session=>hub.sessions.get(session.token).game,
    action:(session,name)=>post(`/api/session/${session.token}/command`,{type:'action',name}),
    step(seconds){for(let frame=0;frame<Math.ceil(seconds/.04);frame++)hub.tick(.04);},
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
async function completeWorldEvent(f,id){
  const game=f.game(f.first),event=game.world.worldEvents.find(value=>value.id===id),definition=[...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS].find(value=>value.id===id);assert.ok(event);assert.ok(definition);
  const start=game.world.eventObjects.find(object=>object.id===`${id}:start`);Object.assign(game.player,{x:start.x,y:start.y});assert.equal((await f.method(f.first,'interactWorldEvent',start.id)).data.accepted,true);
  let serial=0;
  for(let frame=0;frame<2000&&event.state==='active';frame++){
    const stage=definition.mode==='expedition'?definition.stages[event.stageIndex]:{...definition,type:definition.mode};
    const props=game.world.eventObjects.filter(object=>object.eventId===id&&!object.hidden);
    let clickable;
    if(stage.type==='choice'||stage.type==='seal_choice')clickable=props.find(object=>object.role==='choice');
    if(stage.type==='ambush'||stage.type==='boss_hunt')clickable=props.find(object=>object.role==='rune'&&!object.active);
    if(stage.type==='ritual'&&stage.rule==='sequence')clickable=props.find(object=>object.role==='rune'&&!object.active&&object.symbol===stage.symbols[event.objective.progress]);
    if(stage.type==='ritual'&&stage.rule==='switches')clickable=props.find(object=>object.role==='rune'&&object.active!==stage.pattern[object.index]);
    if(stage.type==='ritual'&&stage.rule==='alignment')clickable=props.find(object=>object.role==='rune'&&object.rotation!==stage.rotations[object.index]);
    if(clickable){Object.assign(game.player,{x:clickable.x,y:clickable.y});assert.equal((await f.method(f.first,'interactWorldEvent',clickable.id)).data.accepted,true);}
    for(const enemy of game.world.enemies.filter(actor=>actor.eventId===id&&actor.alive)){
      enemy.hp=1;Object.assign(game.player,{x:enemy.x-35,y:enemy.y,face:0});game.cooldowns.attack=0;assert.equal((await f.action(f.first,'attack')).data.accepted,true);assert.equal(enemy.alive,false);serial++;
    }
    const escort=props.find(object=>object.role==='escort'),objective=props.find(object=>object.role==='objective'),hold=stage.rule==='hold'&&props.find(object=>object.role==='rune');
    const anchor=escort||objective||hold||event;Object.assign(game.player,{x:anchor.x,y:anchor.y});f.step(.08);
  }
  assert.equal(event.state,'success',`Native event ${id} reaches its actual completion condition`);assert.ok(serial>0,'Event completion required real spawned opposition');
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

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { PVP_STATS } from '../src/pvp.js';
import { HUNTS, HUNT_REWARDS } from '../src/endgame.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { generateLoot, validateLootItem, computeItemStats } from '../src/loot.js';
import { equipmentSlot } from '../src/equipment-system.js';
import { ENEMY_TYPES } from '../src/catalog.js';

const storage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};};
const clone=value=>JSON.parse(JSON.stringify(value));
const saved=game=>{const value=clone(game.capture());delete value.savedAt;return value;};
function sparseGame() {
  const game=new Game({storage:null,random:()=>.5});
  for(const key of ['trees','rocks','structures','enemies','nodes','plots','chests'])game.world[key]=[];
  return game;
}
class EventSourceStub {constructor(){queueMicrotask(()=>this.onopen?.());}addEventListener(){}close(){}}
async function fixture() {
  let hub,server,base,now=10000;const persistence=storage();
  const open=async()=>{hub=new MultiplayerHub({createGame:sparseGame,storage:persistence,clock:()=>now,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async session=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const first=(await post('/api/rooms',{playerName:'Reisewacht',classId:'guardian'})).data;
  const second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Duellgast',classId:'ranger'})).data;
  const method=(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args});
  const client=async(session,game=sparseGame())=>{game.start();const network=new NetworkClient(game,{baseUrl:base,EventSourceImpl:EventSourceStub,storage:storage()});await network.connect({...session,snapshot:await get(session)});await Promise.resolve();return network;};
  return {first,second,get,post,method,client,close,get hub(){return hub;},game:session=>hub.sessions.get(session.token).game,
    async step(seconds){for(let frame=0;frame<Math.ceil(seconds/.04);frame++){now+=40;hub.tick(.04);if(frame%25===0)await Promise.all([get(first),get(second)]);}},
    async restart(){await close();await open();},
    async duel(){assert.equal((await method(first,'pvpInvite',second.playerId)).data.accepted,true);const invite=(await get(second)).pvp.invites[0];assert.equal((await method(second,'pvpAccept',invite.id)).data.accepted,true);},
  };
}
const pull=async(f,network,session)=>network.applySnapshot(await f.get(session));

test('browser PvP methods use HTTP authority, preserve travel capture and return exact ordinary state',async()=>{
  const f=await fixture();let one,two;
  try {
    f.game(f.first).player.level=55;f.game(f.first).player.gold=2345;f.game(f.first).player.hp=87;f.game(f.first).cooldowns.bolt=4;
    one=await f.client(f.first);two=await f.client(f.second);let worldChanges=0;one.onWorldChange=()=>worldChanges++;
    const original=saved(f.game(f.first)),overworld=one.game.overworld;
    one.game.pvpInvite(f.second.playerId);await one._actionQueue;await pull(f,two,f.second);
    assert.equal(two.game.pvp.invites.length,1);one.game.pvpCancel();await one._actionQueue;
    one.game.pvpInvite(f.second.playerId);await one._actionQueue;await pull(f,two,f.second);
    two.game.pvpDecline(two.game.pvp.invites[0].id);await two._actionQueue;
    one.game.pvpInvite(f.second.playerId);await one._actionQueue;await pull(f,two,f.second);
    two.game.pvpAccept(two.game.pvp.invites[0].id);await two._actionQueue;
    assert.equal(one.game.worldMode,'overworld','A queued browser command does not predict authority state');
    one.game.aim={x:3000,y:2000};one.game.keys.add('w');await pull(f,one,f.first);await pull(f,two,f.second);
    assert.equal(one.game.worldMode,'pvp');assert.equal(one.game.player.x,210);assert.equal(one.game.player.level,1);assert.deepEqual(one.game.stats(),PVP_STATS);
    assert.equal(one.game.aim,null);assert.equal(one.game.keys.size,0,'Old world movement and absolute aiming do not leak into the arena');
    assert.equal(worldChanges,1);
    assert.equal(one.game.overworld,overworld);assert.deepEqual(saved(one.game),original,'Export retains the canonical server journey, not arena normalization');
    const arena=one.game.world;await pull(f,one,f.first);assert.equal(one.game.world,arena,'Repeated full arena layouts retain static terrain cache identity');assert.equal(worldChanges,1,'Repeated snapshots do not reset live input');
    await f.step(3.1);await pull(f,one,f.first);await pull(f,two,f.second);
    two.game.pvpForfeit();await two._actionQueue;await pull(f,one,f.first);assert.equal(one.game.pvp.duel.result,'victory');
    one.game.pvpReturn();await one._actionQueue;await pull(f,one,f.first);
    two.game.pvpReturn();await two._actionQueue;await pull(f,two,f.second);
    assert.equal(one.game.worldMode,'overworld');assert.equal(one.game.pvpStats,null);assert.equal(one.game._pvpTravelSave,null);assert.equal(one.game.overworld,one.game.world);
    assert.equal(worldChanges,2,'The return transition clears held inputs once');
    assert.equal(one.game.player.x,original.player.x);assert.equal(one.game.player.level,55);assert.equal(one.game.player.hp,87);assert.equal(one.game.player.maxHp,undefined,'Arena-only player fields are removed on return');
    assert.deepEqual(saved(f.game(f.first)),original);assert.equal(one.game.cooldowns.bolt,4);
  } finally{await one?.disconnect();await two?.disconnect();await f.close();}
});

test('connecting directly to an active arena exports the server journey and disconnect restores a different offline save',async()=>{
  const f=await fixture();let network;
  try {
    f.game(f.first).player.level=60;f.game(f.first).player.gold=777;const serverSave=saved(f.game(f.first));await f.duel();
    const local=sparseGame();local.start();local.player.level=7;local.player.gold=111;local.setSetting('musicVolume',.23);const offline=saved(local),offlineStats=local.stats();
    network=await f.client(f.first,local);
    assert.equal(local.worldMode,'pvp');assert.equal(local.player.level,1);assert.deepEqual(saved(local),serverSave);
    assert.deepEqual(network._offlineSave.player,offline.player);
    await network.disconnect();network=null;
    assert.equal(local.networkActive,false);assert.equal(local.pvpStats,null);assert.equal(local.pvp,null);assert.equal(local._pvpTravelSave,null);assert.equal(local.worldMode,'overworld');
    assert.equal(local.player.level,7);assert.equal(local.player.gold,111);assert.equal(local.settings.musicVolume,.23);assert.deepEqual(local.stats(),offlineStats);
  } finally{await network?.disconnect();await f.close();}
});

async function killByHttp(f,type,{boss=false,serial=0}={}) {
  const game=f.game(f.first),enemy=createBestiaryEnemy(type,`audit-hunt-${serial}`,game.player.x+35,game.player.y,{level:55,boss});
  enemy.hp=1;game.world.enemies.push(enemy);game.cooldowns.attack=0;game.player.face=0;
  const result=await f.post(`/api/session/${f.first.token}/command`,{type:'action',name:'attack'});assert.equal(result.data.accepted,true);assert.equal(enemy.alive,false);
  return enemy;
}

test('actual HTTP kills advance personal non-expiring hunts and one trusted claim survives server restart',async()=>{
  const f=await fixture();
  try {
    const game=f.game(f.first);game.player.level=55;game.random=()=>.9;const hunt=HUNTS.find(h=>h.id==='hunt-moon');assert.ok(hunt);
    for(const args of [[hunt.id,123],[{id:hunt.id}],[]])assert.equal((await f.method(f.first,'startHunt',...args)).status,400);
    assert.equal((await f.method(f.first,'startHunt',hunt.id)).data.accepted,true);assert.equal((await f.method(f.first,'claimHunt',hunt.id)).data.accepted,false);
    await killByHttp(f,hunt.objectives[0].target,{serial:1});assert.equal(game.endgame.active[0].counts[0],1);assert.equal(f.game(f.second).endgame.active.length,0);
    await f.restart();assert.equal(f.game(f.first).endgame.active[0].counts[0],1,'Partial progress is durable');f.game(f.first).random=()=>.9;
    let serial=2;
    for(const [index,objective] of hunt.objectives.entries())for(let count=f.game(f.first).endgame.active[0].counts[index];count<objective.count;count++)await killByHttp(f,objective.target,{boss:objective.kind==='boss',serial:serial++});
    const completed=f.game(f.first);assert.equal(completed.endgameSummary().active[0].ready,true);const dust=completed.resources.dust;
    assert.equal((await f.method(f.first,'claimHunt',hunt.id)).data.accepted,true);assert.equal(completed.endgame.tokens,hunt.reward.tokens);assert.equal(completed.resources.dust,dust+hunt.reward.dust);
    assert.equal((await f.method(f.first,'claimHunt',hunt.id)).data.accepted,false);assert.equal(completed.endgame.totalClaims,1);
    const before=clone(completed.endgame),snapshot=await f.get(f.first);assert.deepEqual(snapshot.endgame,before);
    await f.restart();assert.deepEqual(f.game(f.first).endgame,before);assert.equal((await f.method(f.first,'claimHunt',hunt.id)).data.accepted,false);
  } finally{await f.close();}
});

test('hunt rewards keep tokens on a full bag and pay a compatible fixed-rarity slot without a seal lottery',async()=>{
  const f=await fixture();
  try {
    const game=f.game(f.first),hunt=HUNTS.find(h=>h.id==='hunt-moon');game.player.level=55;
    game.endgame={version:1,tokens:80,totalClaims:10,active:[],completed:{[hunt.id]:10}};
    for(let index=0;index<240;index++)assert.equal(game.addItem(generateLoot({level:55,classId:'guardian',baseId:'iron_longsword',rarity:'rare',uid:`full-hunt-${index}`,rng:()=>.5})),true);
    const reward=HUNT_REWARDS.find(r=>r.id==='hunt-weapon'),serial=game.lootSerial;
    assert.equal((await f.method(f.first,'redeemHuntReward',reward.id)).data.accepted,false);assert.equal(game.endgame.tokens,80);assert.equal(game.lootSerial,serial);
    const removed=Object.keys(game.inventory).find(id=>id.startsWith('loot:'));assert.equal(game.depositItem(removed),true);
    const before=new Set(Object.keys(game.generatedItems));assert.equal((await f.method(f.first,'redeemHuntReward',reward.id)).data.accepted,true);
    const item=Object.values(game.generatedItems).find(item=>!before.has(item.id));assert.ok(item);assert.equal(item.rarity,'rare');assert.equal(item.level,55);assert.equal(item.classId,'guardian');assert.equal(equipmentSlot(item),'weapon');assert.equal(item.source,'hunt_reward');assert.equal(item.relic,undefined);assert.equal(validateLootItem(item),true);assert.equal(game.endgame.tokens,80-reward.cost);
    const endgame=clone(game.endgame);await f.restart();assert.deepEqual(f.game(f.first).endgame,endgame);assert.equal(f.game(f.first).inventory[item.id],1);assert.equal(f.game(f.second).inventory[item.id],undefined);
  } finally{await f.close();}
});

test('real Game relic procs share a persisted actor cooldown and reject forged save powers or origins',()=>{
  const game=sparseGame();game.start();game.player.level=60;
  const options={level:60,classId:'guardian',baseId:'iron_longsword',rarity:'rare',source:'furnace_acolyte_boss',relicOrigin:{kind:'boss',enemyId:'furnace_acolyte_boss',dungeonId:null},rng:()=>0};
  const first=generateLoot({...options,uid:'relic-audit-first'}),second=generateLoot({...options,uid:'relic-audit-second'});assert.equal(first.relic.id,'star_seal');
  game.addItem(first);game.addItem(second);game.equip(first.id);const enemy=createBestiaryEnemy('obsidian_knight','relic-target',555,1250,{level:55});game.world.enemies.push(enemy);
  const expectedStats=computeItemStats(first);game.hitEnemy(enemy,1,0);assert.equal(game.cooldowns.relic,16);assert.ok(game.player.shield>0);assert.ok(game.player.shield<=85);
  game.player.shield=0;game.equip(second.id);game.hitEnemy(enemy,1,0);assert.equal(game.player.shield,0,'Switching sealed weapons cannot bypass the shared cooldown');assert.deepEqual(computeItemStats(first),expectedStats);
  game.world.enemies=[];game.time+=5;
  assert.equal(game.unequip('weapon'),true);assert.equal(game.depositItem(first.id),true);assert.equal(game.equip(second.id),true);assert.equal(game.saveLoadout('Siegelwacht'),true);
  const captured=clone(game.capture()),restored=sparseGame();restored.applySave(captured);assert.deepEqual(restored.item(first.id).relic,first.relic);assert.equal(restored.stash[first.id],1);assert.equal(restored.cooldowns.relic,16);assert.equal(restored.loadouts[0].equipment.weapon,second.id);
  for(const corrupt of [value=>value.generatedItems[first.id].relic.power=99999,value=>value.generatedItems[first.id].relic.origin.enemyId='wolf',value=>value.relicCooldown=-1]) {
    const forged=clone(captured);corrupt(forged);const before=saved(restored);assert.throws(()=>restored.applySave(forged));assert.deepEqual(saved(restored),before);
  }
});

test('numeric audio settings round-trip with old boolean saves and malformed hunt balances are atomic',()=>{
  const game=sparseGame();game.start();game.setSetting('masterVolume',.31);game.setSetting('musicVolume',0);game.setSetting('effectsVolume',.91);game.setSetting('sound',false);
  const captured=clone(game.capture()),restored=sparseGame();restored.applySave(captured);assert.deepEqual(restored.settings,game.settings);
  const legacy=clone(captured);legacy.settings={sound:true,shake:false,reducedMotion:true};delete legacy.endgame;delete legacy.relicCooldown;const older=sparseGame();older.applySave(legacy);
  assert.equal(older.settings.sound,true);assert.equal(older.settings.shake,false);assert.equal(older.settings.reducedMotion,true);assert.equal(older.settings.masterVolume,.75);assert.equal(older.endgame.tokens,0);
  const forged=clone(captured);forged.endgame.tokens=99999;const before=saved(restored);assert.throws(()=>restored.applySave(forged));assert.deepEqual(saved(restored),before);
});

test('a genuinely killed optional champion restores its remaining respawn and waits for every nearby party member',()=>{
  const game=new Game({storage:null,random:()=>.9});game.start();game.player.level=55;
  const enemy=game.world.enemies.find(actor=>ENEMY_TYPES[actor.type]?.boss&&ENEMY_TYPES[actor.type]?.baseType&&!actor.challengeId);assert.ok(enemy);
  game.player.x=enemy.x-35;game.player.y=enemy.y;enemy.hp=1;game.hitEnemy(enemy,2,0);assert.equal(enemy.alive,false);assert.equal(enemy.respawnAt,game.time+360);
  const captured=clone(game.capture()),entry=captured.world.championRespawns.find(record=>record.id===enemy.id);assert.equal(entry.remaining,360);
  const restored=new Game({storage:null,random:()=>.9});restored.applySave(captured);const champion=restored.world.enemies.find(actor=>actor.id===enemy.id);assert.equal(champion.alive,false);assert.equal(champion.respawnAt,restored.time+360);
  restored.world.enemies=[champion];restored.player.x=champion.x+550;restored.player.y=champion.y;restored.time=champion.respawnAt+.01;
  const other=sparseGame();other.world=restored.world;other.player.x=champion.x+50;other.player.y=champion.y;restored.updateWorld(.04,[restored,other]);assert.equal(champion.alive,false,'A nearby teammate delays the respawn even when the authority player is distant');
  other.player.x=champion.x+550;restored.updateWorld(.04,[restored,other]);assert.equal(champion.alive,true);assert.equal(champion.hp,champion.maxHp);
  const legacy=clone(captured);delete legacy.world.championRespawns;const older=new Game({storage:null,random:()=>.9});older.applySave(legacy);const oldChampion=older.world.enemies.find(actor=>actor.id===enemy.id);assert.equal(oldChampion.alive,false);assert.equal(oldChampion.respawnAt,older.time+360);
});

test('HTTP hunt purchases cap item level by completed hunting history and unlock epic gear only after relevant progress',async()=>{
  const f=await fixture();
  try {
    const game=f.game(f.first),early=HUNTS.find(h=>h.maxLevel===34),late=HUNTS.find(h=>h.id==='hunt-nexus');assert.ok(early&&late);game.player.level=100;
    game.endgame={version:1,tokens:80,totalClaims:20,active:[],completed:{[early.id]:20}};
    const summary=game.endgameSummary();assert.equal(summary.rewardLevel,34);assert.equal(summary.rewards.find(r=>r.id==='hunt-epic').affordable,false);
    assert.equal((await f.method(f.first,'redeemHuntReward','hunt-epic')).data.accepted,false);assert.equal(game.endgame.tokens,80);
    let before=new Set(Object.keys(game.generatedItems));assert.equal((await f.method(f.first,'redeemHuntReward','hunt-weapon')).data.accepted,true);
    const low=Object.values(game.generatedItems).find(item=>!before.has(item.id));assert.equal(low.level,34);assert.equal(low.rarity,'rare');assert.equal(low.classId,'guardian');
    game.endgame.completed[late.id]=1;game.endgame.totalClaims++;game.endgame.tokens+=late.reward.tokens;
    assert.equal(game.endgameSummary().rewardLevel,100);before=new Set(Object.keys(game.generatedItems));assert.equal((await f.method(f.first,'redeemHuntReward','hunt-epic')).data.accepted,true);
    const high=Object.values(game.generatedItems).find(item=>!before.has(item.id));assert.equal(high.level,100);assert.equal(high.rarity,'epic');assert.equal(high.relic,undefined);
    const captured=clone(game.endgame);await f.restart();assert.deepEqual(f.game(f.first).endgame,captured);assert.equal(f.game(f.first).inventory[high.id],1);
  } finally{await f.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server.mjs';
import { getContractOffers, MAX_ACTIVE_CONTRACTS } from '../src/contracts.js';
import { NPCS, ENEMY_TYPES } from '../src/catalog.js';

async function contractServer() {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-contracts-'));
  const options={port:0,host:'127.0.0.1',storagePath:path.join(directory,'rooms.json'),autoTick:false};
  let running=await startServer(options);
  const post=async(route,body)=>{const response=await fetch(running.origin+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const created=await post('/api/rooms',{playerName:'Auftragsheld',classId:'guardian'});assert.equal(created.status,201);
  const {token,roomCode}=created.data;
  const game=running.hub.sessions.get(token).game;
  // Trusted fixtures establish the level and sparse arena; the HTTP interface
  // never accepts these character values or arbitrary coordinates from clients.
  game.player.level=8;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.random=()=>.5;
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  const command=body=>post(`/api/session/${token}/command`,body);
  const method=(name,...args)=>command({type:'method',name,args});
  const snapshot=async()=>{const response=await fetch(`${running.origin}/api/session/${token}`);assert.equal(response.status,200);return response.json();};
  return {
    token,roomCode,post,command,method,snapshot,
    get game(){return running.hub.sessions.get(token).game;},
    get hub(){return running.hub;},
    async restart(){await running.close();running=await startServer(options);return snapshot();},
    async close(){await running.close();await fs.rm(directory,{recursive:true,force:true});},
  };
}
const rowan=NPCS.find(npc=>npc.id==='rowan');
const atRowan=game=>Object.assign(game.player,{x:rowan.x,y:rowan.y});
const offers=()=>getContractOffers({regionId:'daemmerhain',level:8,completed:0});
function prepareKills(game,objective) {
  Object.assign(game.player,{x:1000,y:1400,face:0});game.cooldowns.attack=0;
  game.world.enemies=Array.from({length:objective.count},(_,index)=>({id:`contract-foe-${index}`,type:objective.target,x:game.player.x+38+index,y:game.player.y,homeX:game.player.x+38+index,homeY:game.player.y,hp:1,maxHp:ENEMY_TYPES[objective.target].hp,alive:true,boss:false,attackTimer:10,phase:'idle',respawnAt:0}));
}
async function killObjective(fixture,objective) {
  prepareKills(fixture.game,objective);
  await fixture.command({type:'input',keys:[],angle:0});
  assert.equal((await fixture.command({type:'action',name:'attack'})).data.accepted,true);
  assert.ok(fixture.game.world.enemies.every(enemy=>!enemy.alive),'Real server combat commits every kill event');
}
function prepareNodes(game,type,count,{x=1000,y=1400}={}) {
  Object.assign(game.player,{x,y});
  game.world.nodes=Array.from({length:count},(_,index)=>({id:`contract-node-${index}`,type,x:x+30,y,readyAt:0}));
}

test('HTTP contracts require Rowan proximity, cap active slots at three and reject client reward/progress forgery',async()=>{
  const fixture=await contractServer();
  try {
    const available=offers();assert.equal(available.length,3);
    Object.assign(fixture.game.player,{x:2000,y:1000});
    assert.equal((await fixture.method('acceptContract',available[0].id)).data.accepted,false);
    assert.equal(fixture.game.contracts.active.length,0);
    atRowan(fixture.game);
    assert.equal((await fixture.command({type:'method',name:'acceptContract',args:[{id:available[0].id,reward:{gold:999999,xp:999999},counts:[999],status:'ready'}]})).status,400);
    const higherLevelOffer=getContractOffers({regionId:'daemmerhain',level:12})[0];
    assert.equal((await fixture.method('acceptContract',higherLevelOffer.id)).data.accepted,false,'The server cannot be asked to pay an offer from a different character level');
    for(const offer of available)assert.equal((await fixture.method('acceptContract',offer.id)).data.accepted,true);
    assert.equal(fixture.game.contracts.active.length,MAX_ACTIVE_CONTRACTS);
    assert.equal((await fixture.method('acceptContract',available[0].id)).data.accepted,false);
    const fourth=getContractOffers({regionId:'frostgrat',level:8})[0];
    assert.equal((await fixture.method('acceptContract',fourth.id)).data.accepted,false);
    const gold=fixture.game.player.gold,xp=fixture.game.player.xp;
    assert.equal((await fixture.command({type:'method',name:'turnInContract',args:[available[0].id],counts:[999],status:'ready',reward:{gold:999999,xp:999999}})).status,400);
    assert.equal((await fixture.command({type:'method',name:'event',args:['kill','wolf']})).status,400);
    assert.equal((await fixture.command({type:'contract',id:available[0].id,counts:[999],reward:{gold:999999}})).status,400);
    assert.equal(fixture.game.player.gold,gold);assert.equal(fixture.game.player.xp,xp);
    assert.ok(fixture.game.contracts.active.every(contract=>contract.status==='active'&&contract.counts.every(count=>count===0)));
    assert.equal((await fixture.method('cancelContract',available[2].id)).data.accepted,true);assert.equal(fixture.game.contracts.active.length,2);
    assert.equal((await fixture.method('acceptContract',fourth.id)).data.accepted,true,'Freeing a slot permits the otherwise valid fourth offer');
    assert.equal((await fixture.method('cancelContract',fourth.id)).data.accepted,true);
    const state=await fixture.snapshot();assert.equal(state.contracts.active.length,2);
  } finally{await fixture.close();}
});

test('HTTP contracts count newly committed local kills and gathers, not previous ledger or remote region activity',async()=>{
  const fixture=await contractServer();
  try {
    const [hunt,gather]=offers();
    fixture.game.ledger[`kill:${hunt.objectives[0].target}`]=999;fixture.game.ledger[`gather:${gather.objectives[0].target}`]=999;fixture.game.resources[gather.objectives[0].target]=999;
    atRowan(fixture.game);
    assert.equal((await fixture.method('acceptContract',hunt.id)).data.accepted,true);assert.equal((await fixture.method('acceptContract',gather.id)).data.accepted,true);
    let state=await fixture.snapshot();assert.deepEqual(state.contracts.active.map(contract=>contract.counts),[[0],[0]]);
    prepareNodes(fixture.game,gather.objectives[0].target,1,{x:1000,y:500});
    assert.equal((await fixture.command({type:'action',name:'interact'})).data.accepted,true);
    assert.equal(fixture.game.resources[gather.objectives[0].target],1001,'The gather action really committed resources');
    assert.deepEqual(fixture.game.contracts.active.find(contract=>contract.id===gather.id).counts,[0],'Gathering in Frostgrat cannot complete a Dämmerhain contract');
    await killObjective(fixture,hunt.objectives[0]);
    state=await fixture.snapshot();const killed=state.contracts.active.find(contract=>contract.id===hunt.id);
    assert.deepEqual(killed.counts,[hunt.objectives[0].count]);assert.equal(killed.status,'ready');
    prepareNodes(fixture.game,gather.objectives[0].target,gather.objectives[0].count/2);
    for(let index=0;index<gather.objectives[0].count/2;index++)assert.equal((await fixture.command({type:'action',name:'interact'})).data.accepted,true);
    assert.ok(fixture.game.world.nodes.every(node=>node.readyAt>fixture.game.time));
    state=await fixture.snapshot();const gathered=state.contracts.active.find(contract=>contract.id===gather.id);
    assert.deepEqual(gathered.counts,[gather.objectives[0].count]);assert.equal(gathered.status,'ready');
    assert.equal((await fixture.method('turnInContract',hunt.id)).data.accepted,false,'Ready contracts still require returning to their giver');
  } finally{await fixture.close();}
});

test('server restart resumes a ready contract and its token; turn-in pays the trusted reward once and remains complete after restart',async()=>{
  const fixture=await contractServer();
  try {
    const hunt=offers()[0];atRowan(fixture.game);
    assert.equal((await fixture.method('acceptContract',hunt.id)).data.accepted,true);
    await killObjective(fixture,hunt.objectives[0]);
    const progress=await fixture.snapshot();assert.equal(progress.contracts.active[0].status,'ready');
    const resumed=await fixture.restart();assert.equal(resumed.player.level,8);assert.equal(resumed.player.name,'Auftragsheld');
    assert.deepEqual(resumed.contracts,progress.contracts);assert.equal(resumed.player.gold,progress.player.gold);assert.equal(resumed.player.xp,progress.player.xp);
    assert.equal(resumed.roomCode,fixture.roomCode);
    atRowan(fixture.game);
    const before={gold:fixture.game.player.gold,xp:fixture.game.player.xp,dust:fixture.game.resources.dust,item:hunt.reward.item?fixture.game.inventory[hunt.reward.item]||0:0};
    assert.equal((await fixture.method('turnInContract',hunt.id)).data.accepted,true);
    assert.equal(fixture.game.player.gold,before.gold+hunt.reward.gold);assert.equal(fixture.game.player.xp,before.xp+hunt.reward.xp);assert.equal(fixture.game.resources.dust,before.dust+hunt.reward.dust);
    if(hunt.reward.item)assert.equal(fixture.game.inventory[hunt.reward.item],before.item+1);
    assert.equal(fixture.game.contracts.active.length,0);assert.equal(fixture.game.contracts.completed.daemmerhain,1);
    const paid=await fixture.snapshot();
    assert.equal((await fixture.method('turnInContract',hunt.id)).data.accepted,false);assert.equal(fixture.game.player.gold,paid.player.gold);assert.equal(fixture.game.player.xp,paid.player.xp);
    const persisted=await fixture.restart();assert.deepEqual(persisted.contracts,paid.contracts);assert.equal(persisted.player.gold,paid.player.gold);assert.equal(persisted.resources.dust,paid.resources.dust);
    assert.equal((await fixture.method('turnInContract',hunt.id)).data.accepted,false);
    assert.equal((await fixture.method('acceptContract',hunt.id)).data.accepted,false,'An old completed cycle cannot be replayed for another reward');
    const next=getContractOffers({regionId:'daemmerhain',level:8,completed:1})[0];assert.equal((await fixture.method('acceptContract',next.id)).data.accepted,true);
    assert.deepEqual(fixture.game.contracts.active[0].counts,[0]);
  } finally{await fixture.close();}
});

test('actual server restart preserves the shared clock and remaining crop/node growth time',async()=>{
  const fixture=await contractServer();
  try {
    atRowan(fixture.game);
    const room=fixture.hub.rooms.get(fixture.roomCode);room.time=900;fixture.game.time=900;
    fixture.game.world.nodes=[{id:'timed-node',type:'wood',x:rowan.x+30,y:rowan.y,readyAt:925}];
    fixture.game.world.plots=[{id:'timed-crop',x:rowan.x+60,y:rowan.y,state:'growing',readyAt:925}];
    for(let frame=0;frame<250;frame++)fixture.hub.tick(.04);
    const before=await fixture.snapshot();assert.ok(Math.abs(before.time-910)<1e-6);assert.equal(before.world.plots[0].state,'growing');
    const restored=await fixture.restart();
    assert.ok(Math.abs(restored.time-before.time)<1e-6,'The common room clock must not reset to zero while absolute readyAt values survive');
    assert.equal(fixture.game.time,fixture.hub.rooms.get(fixture.roomCode).time);
    const crop=fixture.game.world.plots.find(plot=>plot.id==='timed-crop'),node=fixture.game.world.nodes.find(node=>node.id==='timed-node');
    assert.ok(crop.readyAt-restored.time>14.9&&crop.readyAt-restored.time<15.1);assert.equal(node.readyAt,crop.readyAt);
    for(let frame=0;frame<350;frame++)fixture.hub.tick(.04);
    assert.equal(crop.state,'growing');assert.ok(node.readyAt>fixture.game.time);
    for(let frame=0;frame<26;frame++)fixture.hub.tick(.04);
    assert.equal(crop.state,'ripe');assert.ok(node.readyAt<=fixture.game.time,'Only the original remaining fifteen seconds are required after restart');
    const state=await fixture.snapshot();assert.equal(state.world.plots.find(plot=>plot.id==='timed-crop').state,'ripe');
  } finally{await fixture.close();}
});

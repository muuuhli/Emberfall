import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { createEncounterDirector, captureEncounterDirector } from '../src/encounter-director.js';

const storage=()=>{const entries=new Map();return {getItem:key=>entries.get(key)||null,setItem:(key,value)=>entries.set(key,value),removeItem:key=>entries.delete(key)};};
const clone=value=>JSON.parse(JSON.stringify(value));
class EventSourceStub {constructor(){queueMicrotask(()=>this.onopen?.());}addEventListener(){}close(){}}
function sparseGame() {
  const game=new Game({storage:null,random:()=>.5});
  const clear=()=>{for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies','dungeonEntrances'])game.world[key]=[];game.npcs=[];};
  // Class selection and save import call initialize again; keep the fixture's
  // isolated collision layout through those real production transitions.
  const initialize=game.initialize.bind(game);game.initialize=()=>{initialize();clear();};clear();
  return game;
}
async function fixture() {
  let hub,server,base;const persistence=storage();
  const open=async()=>{hub=new MultiplayerHub({createGame:sparseGame,storage:persistence,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async session=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const first=(await post('/api/rooms',{playerName:'Nachtwacht',classId:'guardian'})).data;
  const second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Pfadgefährte',classId:'ranger'})).data;
  return {first,second,post,get,close,get hub(){return hub;},game:session=>hub.sessions.get(session.token).game,
    method:(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args}),
    async restart(mutate){await close();if(mutate){const data=JSON.parse(persistence.getItem('emberfall.multiplayer.v1'));mutate(data);persistence.setItem('emberfall.multiplayer.v1',JSON.stringify(data));}await open();},
    step(seconds){for(let frame=0;frame<Math.ceil(seconds/.04);frame++)hub.tick(.04);},
    async client(session,game=sparseGame()){const network=new NetworkClient(game,{baseUrl:base,storage:storage(),EventSourceImpl:EventSourceStub});await network.connect({...session,snapshot:await get(session)});await Promise.resolve();return network;},
  };
}

function prepareWilderness(f) {
  for(const session of [f.first,f.second]){const game=f.game(session);Object.assign(game.player,{x:2200,y:1700,level:25,invulnerable:100});game.npcs=[];}
  const world=f.game(f.first).world;world.enemies=[];world.encounterDirector=createEncounterDirector();world.encounterDirector.nextIn=.04;
}
async function spawnEncounter(f) {
  prepareWilderness(f);f.hub.tick(.04);assert.equal(f.game(f.first).world.encounterDirector.stage,'warning');f.step(8.04);
  const game=f.game(f.first);assert.equal(game.world.encounterDirector.stage,'active');const actors=game.world.enemies.filter(enemy=>enemy.directorId);assert.ok(actors.length>=2);return actors;
}

test('three HTTP clients share one director update per authoritative room tick and cannot command difficulty',async()=>{
  const f=await fixture();try {
    const third=(await f.post(`/api/rooms/${f.first.roomCode}/join`,{playerName:'Dritter',classId:'paladin'})).data;
    const games=[f.game(f.first),f.game(f.second),f.game(third)];
    for(const game of games){Object.assign(game.player,{x:1700,y:1400,level:25,invulnerable:100});game.world.enemies=[];}
    const before=captureEncounterDirector(games[0].world),calls=new Map(games.map(game=>[game,0]));
    for(const game of games){const original=game.updateWorld;game.updateWorld=function(...args){calls.set(game,calls.get(game)+1);return original.apply(this,args);};}
    f.hub.tick(.04);
    assert.equal([...calls.values()].reduce((a,b)=>a+b,0),1);assert.equal(calls.get(games[0]),1);assert.equal(games[0].world,games[1].world);assert.equal(games[1].world,games[2].world);
    const snapshots=await Promise.all([f.get(f.first),f.get(f.second),f.get(third)]);
    assert.deepEqual(snapshots[0].world.encounterDirector,snapshots[1].world.encounterDirector);assert.deepEqual(snapshots[1].world.encounterDirector,snapshots[2].world.encounterDirector);
    assert.ok(Math.abs(captureEncounterDirector(games[0].world).elapsed-before.elapsed-.04)<1e-6,'Director wilderness time advances once rather than per player');
    for(const command of [{type:'method',name:'setDifficulty',args:[100]},{type:'method',name:'updateEncounterDirector',args:[100]},{type:'input',keys:[],angle:0,encounterDirector:{tier:30}},{type:'action',name:'attack',difficulty:0}])assert.equal((await f.post(`/api/session/${f.first.token}/command`,command)).status,400);
  }finally{await f.close();}
});

test('director context reaches browser snapshots despite spatial enemy culling and offline restoration stays personal',async()=>{
  const f=await fixture();let network;try {
    const game=f.game(f.first);game.world.encounterDirector=createEncounterDirector();
    const local=sparseGame();const offline=clone(local.capture());network=await f.client(f.first,local);
    const snapshot=await f.get(f.first);assert.deepEqual(local.world.encounterDirector,snapshot.world.encounterDirector);
    assert.equal(network.active,true);const before=clone(game.world.encounterDirector);local.update(.4);assert.deepEqual(game.world.encounterDirector,before,'Browser network mode cannot advance server difficulty');
    await network.disconnect();network=null;assert.deepEqual(captureEncounterDirector(local.world),offline.world.encounterDirector);
  }finally{await network?.disconnect();await f.close();}
});

test('shared room restart preserves warning seconds, canonical live and spent actors, and rejects poisoned raw spawn budgets',async()=>{
  const f=await fixture();try {
    prepareWilderness(f);f.hub.tick(.04);f.step(2);const warning=clone(captureEncounterDirector(f.game(f.first).world));
    await f.restart();assert.deepEqual(captureEncounterDirector(f.game(f.first).world),warning,'Restart retains exact wilderness remaining time instead of replaying the entire warning');
    for(const session of [f.first,f.second])assert.equal(f.game(session).overworld,f.game(session).world,'Portable captures reference the restored shared overworld');
    await Promise.all([f.get(f.first),f.get(f.second)]);f.game(f.first).npcs=[];f.game(f.second).npcs=[];f.step(warning.remaining+.08);
    const game=f.game(f.first),actors=game.world.enemies.filter(enemy=>enemy.directorId);assert.ok(actors.length>=2);actors[0].hp=1;
    Object.assign(game.player,{x:actors[0].x-35,y:actors[0].y,face:0});game.cooldowns.attack=0;
    const kill=await f.post(`/api/session/${f.first.token}/command`,{type:'action',name:'attack'});assert.equal(kill.data.accepted,true);assert.equal(actors[0].alive,false);
    actors[1].hp=Math.round(actors[1].maxHp*.65);const canonical=clone(captureEncounterDirector(game.world)),gold=game.player.gold,xp=game.player.xp,expectedMaxHp=actors[1].maxHp;
    await f.restart(data=>{
      const room=data.rooms[0];for(const enemy of room.world.enemies.filter(actor=>actor.directorId)){enemy.hp=999999;enemy.maxHp=999999;enemy.alive=true;enemy.gold=999999;enemy.xp=999999;}
      room.world.enemies.push({...room.world.enemies.find(enemy=>enemy.directorId),id:'rogue-raw-director',directorId:'rogue-director',damage:999999});
      room.world.encounterDirector={version:1,tier:'forged',stage:'active',sequence:999999,nextIn:0};
    });
    const restored=f.game(f.first),after=captureEncounterDirector(restored.world);assert.deepEqual(after,canonical,'Portable plan and actor ledger win over raw room values');
    const spent=restored.world.enemies.find(enemy=>enemy.id===actors[0].id),live=restored.world.enemies.find(enemy=>enemy.id===actors[1].id);assert.equal(spent.alive,false);assert.equal(spent.hp,0);assert.equal(live.maxHp,expectedMaxHp);assert.equal(restored.world.enemies.some(enemy=>enemy.id==='rogue-raw-director'),false);
    assert.equal(restored.player.gold,gold);assert.equal(restored.player.xp,xp);
    await Promise.all([f.get(f.first),f.get(f.second)]);Object.assign(restored.player,{x:spent.x-35,y:spent.y,face:0});restored.cooldowns.attack=0;
    await f.post(`/api/session/${f.first.token}/command`,{type:'action',name:'attack'});assert.equal(restored.player.gold,gold);assert.equal(restored.player.xp,xp,'Hitting a spent actor cannot grant its reward a second time');
    assert.equal(captureEncounterDirector(restored.world).remaining,canonical.remaining);
  }finally{await f.close();}
});

test('a remote browser exports the complete canonical actor ledger despite culled enemies',async()=>{
  const f=await fixture();let network;try {
    const actors=await spawnEncounter(f),game=f.game(f.first);actors[0].alive=false;actors[0].hp=0;actors[1].hp=Math.round(actors[1].maxHp*.55);
    Object.assign(f.game(f.second).player,{x:520,y:1250});const canonical=clone(captureEncounterDirector(game.world));
    // The second client's view is far from the wave but must retain its save
    // context: otherwise disconnect/export could reset remote dead spawns.
    for(const enemy of actors){enemy.x=2250;enemy.y=1900;}
    const updated=clone(captureEncounterDirector(game.world));const snapshot=await f.get(f.second);assert.ok(snapshot.world.enemies.filter(enemy=>enemy.directorId).length<actors.length);assert.deepEqual(snapshot.authoritativeEncounterDirectorSave,updated);
    const local=sparseGame();network=await f.client(f.second,local);assert.deepEqual(local.networkEncounterDirectorSave,updated);assert.deepEqual(local.capture().world.encounterDirector,updated);
    assert.notDeepEqual(updated,canonical,'The global context includes current canonical actor positions');
    await network.disconnect();network=null;assert.equal(local.networkEncounterDirectorSave,null);
  }finally{await network?.disconnect();await f.close();}
});

test('legacy raw director actors are removed and arena-only PvP leaves wilderness scheduling untouched',async()=>{
  const f=await fixture();try {
    await spawnEncounter(f);
    await f.restart(data=>{for(const member of data.rooms[0].members)delete member.save.world.encounterDirector;});
    const game=f.game(f.first);assert.equal(game.world.enemies.some(enemy=>enemy.directorId),false);assert.deepEqual(captureEncounterDirector(game.world),{...createEncounterDirector(),actors:[]});
    const before=clone(captureEncounterDirector(game.world));
    // Restart restored the saved wilderness position. Move both originals to
    // the trusted village fixture so the ordinary mutual-consent gate applies.
    for(const session of [f.first,f.second]){Object.assign(f.game(session).player,{x:520,y:1250});await f.get(session);}
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,true);const invite=(await f.get(f.second)).pvp.invites[0];assert.equal((await f.method(f.second,'pvpAccept',invite.id)).data.accepted,true);
    f.step(4);const arena=await f.get(f.first);assert.equal(arena.worldMode,'pvp');assert.equal(arena.world.encounterDirector,undefined);assert.equal(arena.authoritativeEncounterDirectorSave,undefined);assert.deepEqual(captureEncounterDirector(game.world),before);
  }finally{await f.close();}
});

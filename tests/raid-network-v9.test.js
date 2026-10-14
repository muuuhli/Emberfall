import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { DUNGEONS } from '../src/dungeons.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};};

async function serve(storage=null) {
  const hub=new MultiplayerHub({storage,autoStart:false,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});
  const server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const controllers=[];
  const request=async(route,body)=>{
    const response=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    return {status:response.status,data:await response.json()};
  };
  const stream=async token=>{
    const controller=new AbortController();controllers.push(controller);
    const response=await fetch(`${base}/api/session/${token}/events`,{signal:controller.signal});
    assert.equal(response.status,200);const reader=response.body.getReader();let text='';
    while(!text.includes('\n\n')){const chunk=await reader.read();assert.equal(chunk.done,false);text+=new TextDecoder().decode(chunk.value);}
    return JSON.parse(text.split('\n').find(line=>line.startsWith('data: ')).slice(6));
  };
  const close=async()=>{for(const controller of controllers)controller.abort();hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  return {hub,server,base,request,stream,close};
}

async function raid(id='sturmzitadelle',storage=null) {
  const host=await serve(storage),definition=DUNGEONS.find(d=>d.id===id),sessions=[];
  for(let index=0;index<definition.partyRequired;index++){
    const created=await host.request(index?`/api/rooms/${sessions[0].roomCode}/join`:'/api/rooms',{
      playerName:`Koopprüfung ${index+1}`,classId:index===0?'guardian':index===1?'druid':'ranger',
    });assert.equal(created.status,201);sessions.push(created.data);
  }
  const members=sessions.map(s=>host.hub.sessions.get(s.token));
  for(const member of members){const game=member.game;game.player.level=definition.level;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;Object.assign(game.player,definition.entrance);}
  assert.equal((await host.request(`/api/session/${sessions[0].token}/command`,{type:'method',name:'enterDungeon',args:[id,1]})).data.accepted,true);
  const leader=members[0].game,instance=leader.dungeonInstance,boss=leader.world.enemies.find(e=>e.id===`${id}:boss`),room=members[0].room;
  // Isolate transport and checkpoint behavior from the already-tested entrance
  // puzzles/trash. HP, damage and class stats remain the real product budgets.
  leader.world.enemies=[boss];instance.gateOpened=true;instance.bossEngaged=true;
  for(const puzzle of instance.puzzles)puzzle.solved=true;
  const gate=leader.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
  for(const [index,member]of members.entries())Object.assign(member.game.player,{x:boss.x+40+index*10,y:boss.y});
  boss.phase='idle';boss.attackTimer=0;
  return {...host,definition,sessions,members,leader,instance,boss,room};
}

function advance(host,seconds){for(let left=seconds;left>1e-8;left-=.04)host.hub.tick(Math.min(.04,left));}
function uniqueWarning(host){for(let index=0;index<400&&!host.instance.raidEncounter?.pending;index++)host.hub.tick(.04);assert.ok(host.instance.raidEncounter?.pending,'A real unique cast must begin');}

test('HTTP and SSE deliver the same real raid warning before its authoritative delayed hit',async()=>{
  const host=await raid();
  try {
    uniqueWarning(host);const before=host.members.map(m=>m.game.player.hp),pending=clone(host.instance.raidEncounter.pending);
    const httpSnapshot=(await host.request(`/api/session/${host.sessions[0].token}`)).data;
    const sseSnapshot=await host.stream(host.sessions[1].token);
    assert.deepEqual(httpSnapshot.dungeonInstance.raidEncounter.pending,pending);
    assert.deepEqual(sseSnapshot.dungeonInstance.raidEncounter.pending,pending);
    assert.equal(httpSnapshot.authoritativeDungeonCheckpoint.id,'sturmzitadelle');
    assert.ok(httpSnapshot.hazards.some(h=>h.raidEncounter&&h.shape.kind==='cone'));
    advance(host,pending.resolveAt-host.instance.bossTime-.08);
    assert.deepEqual(host.members.map(m=>m.game.player.hp),before,'No impact before its advertised deadline');
    advance(host,.12);assert.ok(host.members.some((m,i)=>m.game.player.hp<before[i]));
    assert.equal((await host.request(`/api/session/${host.sessions[0].token}/command`,{type:'method',name:'updateRaidEncounter',args:[]})).status,400);
    assert.equal((await host.request(`/api/rooms/${host.sessions[0].roomCode}/join`,{classId:'ranger'})).status,409,'A fresh level-one character cannot fill an ongoing raid seat');
  }finally{await host.close();}
});

test('downed humans return as downed at their saved positions and count as returned without granting a free rescue',async()=>{
  const storage=memoryStorage(),host=await raid('nachtschlund',storage);let restored;
  try {
    uniqueWarning(host);
    const fallen=host.members[1].game;fallen.player.invulnerable=0;
    fallen.damagePlayer(fallen.stats().maxHp*20,{trueDamage:true});assert.equal(fallen.dead,true);
    const position={x:fallen.player.x,y:fallen.player.y},receipt=clone(fallen.deathPenalty.lastReceipt);
    const alivePosition={x:host.members[2].game.player.x,y:host.members[2].game.player.y};
    host.hub.persist();restored=await serve(storage);
    for(const session of host.sessions)assert.equal((await restored.request(`/api/session/${session.token}`)).status,200);
    const member=restored.hub.sessions.get(host.sessions[1].token),game=member.game;
    assert.equal(game.dead,true);assert.equal(game.player.hp,0);assert.equal(game.paused,true);
    assert.deepEqual({x:game.player.x,y:game.player.y},position);
    assert.deepEqual(game.deathPenalty.lastReceipt,receipt,'Restart does not settle the pending rescue receipt');
    const alive=restored.hub.sessions.get(host.sessions[2].token).game;
    assert.deepEqual({x:alive.player.x,y:alive.player.y},alivePosition,'Same-context rejoin cannot teleport a spread target');
    restored.hub.tick(.04);assert.equal(member.room.waitingForRaidResume,false,'Returned downed humans do not deadlock the room pause');
    assert.equal(game.respawn(),false,'Self-return cannot bypass the live raid revival budget');
    assert.equal(game.player.hp,0);assert.equal(game.dead,true);
  }finally{if(restored)await restored.close();await host.close();}
});

test('a shared generic warning also survives server restart with its original positions and remaining time',async()=>{
  const storage=memoryStorage(),host=await raid('sturmzitadelle',storage);let restored;
  try {
    for(let i=0;i<200&&host.boss.phase!=='windup';i++)host.hub.tick(.04);
    assert.ok(['stack','spread'].includes(host.boss.telegraphMechanic));
    const checkpoint=clone(host.leader.captureDungeonCheckpoint());assert.ok(checkpoint.pendingGeneric);
    host.hub.persist();restored=await serve(storage);
    for(const session of host.sessions)await restored.request(`/api/session/${session.token}`);
    const game=restored.hub.sessions.get(host.sessions[0].token).game;
    assert.deepEqual(game.captureDungeonCheckpoint().pendingGeneric,checkpoint.pendingGeneric);
    assert.equal(game.world.enemies.find(e=>e.id===host.boss.id).attackTimer,checkpoint.pendingGeneric.remaining);
    restored.hub.tick(.04);assert.ok(game.captureDungeonCheckpoint().pendingGeneric.remaining<checkpoint.pendingGeneric.remaining);
  }finally{if(restored)await restored.close();await host.close();}
});

test('after a saved full wipe the first returning player can use the normal rescue without waiting for the group',async()=>{
  const storage=memoryStorage(),host=await raid('sturmzitadelle',storage);let restored;
  try {
    uniqueWarning(host);
    for(const member of host.members){member.game.player.invulnerable=0;member.game.damagePlayer(member.game.stats().maxHp*20,{trueDamage:true});}
    host.hub.tick(.04);assert.equal(host.instance.bossEngaged,false);assert.equal(host.instance.raidWipes,1);
    restored=await serve(storage);
    const result=await restored.request(`/api/session/${host.sessions[0].token}`);
    assert.equal(result.data.dead,true);assert.equal(result.data.raidResume,null);
    assert.equal(result.data.authoritativeDungeonCheckpoint.raidWipes,1,'The completed wipe is persisted immediately after the authoritative tick');
    const returned=await restored.request(`/api/session/${host.sessions[0].token}/command`,{type:'method',name:'respawn',args:[]});
    assert.equal(returned.data.accepted,true);
    const game=restored.hub.sessions.get(host.sessions[0].token).game;assert.equal(game.dead,false);assert.equal(game.player.hp,game.stats().maxHp);
  }finally{if(restored)await restored.close();await host.close();}
});

test('a portable network export retains boss and cast data even when they are culled from the rendered view',async()=>{
  const host=await raid('weltenkern');
  try {
    uniqueWarning(host);host.boss.hp-=12345;
    Object.assign(host.members[7].game.player,{x:100,y:100});
    const snapshot=(await host.request(`/api/session/${host.sessions[7].token}`)).data;
    assert.equal(snapshot.world.enemies.some(e=>e.id===host.boss.id),false,'Boss intentionally lies outside the client view');
    assert.equal(snapshot.authoritativeDungeonCheckpoint.enemies.find(e=>e.id===host.boss.id).hp,host.boss.hp);
    const view=new Game({storage:null}),network=new NetworkClient(view,{baseUrl:host.base,storage:null});
    view.networkActive=true;network.applySnapshot(snapshot);
    const exported=clone(view.capture()),restored=new Game({storage:null});restored.applySave(exported);
    assert.equal(restored.world.enemies.find(e=>e.id===host.boss.id).hp,host.boss.hp);
    assert.deepEqual(restored.dungeonInstance.raidEncounter.pending,host.instance.raidEncounter.pending);
    assert.ok(restored.hazards.some(h=>h.raidEncounter));
  }finally{await host.close();}
});

test('a real server restart keeps one shared raid checkpoint, resume tokens and the remaining unique deadline',async()=>{
  const storage=memoryStorage(),host=await raid('nachtschlund',storage);let restored;
  try {
    uniqueWarning(host);advance(host,.4);host.boss.hp-=6789;
    const pending=clone(host.instance.raidEncounter.pending),time=host.instance.bossTime;
    host.hub.persist();restored=await serve(storage);
    for(const session of host.sessions)assert.equal((await restored.request(`/api/session/${session.token}`)).status,200);
    const members=host.sessions.map(s=>restored.hub.sessions.get(s.token)),leader=members[0].game;
    assert.equal(leader.dungeonInstance.id,'nachtschlund');
    assert.equal(leader.dungeonInstance.bossTime,time);
    assert.deepEqual(leader.dungeonInstance.raidEncounter.pending,pending);
    assert.ok(members.every(m=>m.game.world===leader.world&&m.game.dungeonInstance===leader.dungeonInstance));
    assert.equal(leader.world.enemies.find(e=>e.id===host.boss.id).hp,host.boss.hp);
    const checkpoint=clone(leader.captureDungeonCheckpoint());restored.hub.tick(.04);
    assert.ok(leader.dungeonInstance.bossTime>time);assert.equal(leader.dungeonInstance.raidEncounter.pending.resolveAt,pending.resolveAt);
    assert.equal(checkpoint.raidEncounter.pending.id,pending.id);
  }finally{if(restored)await restored.close();await host.close();}
});

test('legacy room saves still return safely while new shared checkpoints survive a partial resume',async()=>{
  const storage=memoryStorage(),host=await raid();let legacy,newHost;
  try {
    uniqueWarning(host);
    const saved=host.hub.capture();saved.rooms[0].worldMode='overworld';delete saved.rooms[0].dungeonCheckpoint;
    storage.setItem('emberfall.multiplayer.v1',JSON.stringify(saved));legacy=await serve(storage);
    assert.equal((await legacy.request(`/api/session/${host.sessions[0].token}`)).data.worldMode,'overworld');
    storage.setItem('emberfall.multiplayer.v1',JSON.stringify(host.hub.capture()));newHost=await serve(storage);
    const resumed=(await newHost.request(`/api/session/${host.sessions[0].token}`)).data;
    assert.equal(resumed.worldMode,'dungeon');assert.equal(resumed.raidResume.waiting,true);
    assert.equal(resumed.raidResume.ready,1);assert.equal(resumed.raidResume.required,3);
    const beforeTime=resumed.authoritativeDungeonCheckpoint.bossTime;newHost.hub.tick(.04);
    const game=newHost.hub.sessions.get(host.sessions[0].token).game,boss=game.world.enemies.find(e=>e.id===host.boss.id);
    assert.equal(boss.hp,host.boss.hp,'Missing companions cannot reset or heal the encounter');
    assert.equal(game.dungeonInstance.raidWipes||0,0);assert.equal(boss.insufficientParty,true);
    assert.equal(game.dungeonInstance.bossTime,beforeTime,'The warning waits until the saved group returns');
    assert.equal(game.hitEnemy(boss,1000000,0),0,'A partial resume cannot bypass the living human requirement');
  }finally{if(legacy)await legacy.close();if(newHost)await newHost.close();await host.close();}
});

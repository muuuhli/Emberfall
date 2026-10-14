import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { CLASSES } from '../src/classes.js';
import { DUNGEONS } from '../src/dungeons.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { SnapshotAccumulator, SnapshotResyncError, cloneSnapshot } from '../src/network-snapshots.js';

async function fixture(storage=null){
  const hub=new MultiplayerHub({autoStart:false,storage,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});
  const server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const base=`http://127.0.0.1:${server.address().port}`,controllers=[];
  const request=async(route,body)=>{const response=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const stream=async(token,deltas=false)=>{
    const controller=new AbortController();controllers.push(controller);
    const response=await fetch(`${base}/api/session/${token}/events${deltas?'?deltas=1':''}`,{signal:controller.signal});assert.equal(response.status,200);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='';
    return {close(){controller.abort();},async next(){
      const timeout=setTimeout(()=>controller.abort(),5000);
      try{for(;;){const end=buffer.indexOf('\n\n');if(end>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=block.split('\n').find(value=>value.startsWith('data: '));if(line)return JSON.parse(line.slice(6));}const read=await reader.read();if(read.done)throw new Error('Test stream ended.');buffer+=decoder.decode(read.value,{stream:true});}}
      finally{clearTimeout(timeout);}
    }};
  };
  const close=async()=>{for(const controller of controllers)controller.abort();hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  return {hub,base,request,stream,close};
}
async function group(host,count=8){
  const sessions=[];
  for(let i=0;i<count;i++){const response=await host.request(i?`/api/rooms/${sessions[0].roomCode}/join`:'/api/rooms',{playerName:`Delta ${i+1}`,classId:CLASSES[i].id});assert.equal(response.status,201);sessions.push(response.data);}
  return sessions;
}
function comparable(value){const copy=cloneSnapshot(value);delete copy.snapshotContext;return copy;}
function frames(host,count=2){for(let i=0;i<count;i++)host.hub.tick(.04);}

test('eight real HTTP/SSE characters retain full-v1 compatibility while negotiated patches are lossless and smaller',async()=>{
  const host=await fixture();
  try{
    const sessions=await group(host),streams=await Promise.all(sessions.map(s=>host.stream(s.token,true))),states=sessions.map(()=>new SnapshotAccumulator());
    for(let i=0;i<streams.length;i++){const initial=await streams[i].next();assert.equal(initial.snapshotDelta,undefined);states[i].accept(initial);}
    const legacy=await host.stream(sessions[0].token);assert.equal((await legacy.next()).snapshotContext,undefined);
    await host.request(`/api/session/${sessions[0].token}/command`,{type:'input',keys:['d'],angle:0});frames(host);
    const packets=await Promise.all(streams.map(stream=>stream.next())),old=await legacy.next();
    assert.equal(old.protocol,1);assert.equal(old.snapshotDelta,undefined);assert.ok(old.world.enemies.length>0);
    for(let i=0;i<packets.length;i++){
      assert.equal(packets[i].snapshotDelta,1);const assembled=states[i].accept(packets[i]);
      const full=(await host.request(`/api/session/${sessions[i].token}`)).data;
      assert.deepEqual(comparable(assembled),full);assert.equal(assembled.party.length,8);assert.equal(assembled.player.classId,CLASSES[i].id);
    }
    assert.ok(JSON.stringify(packets[0]).length<JSON.stringify(old).length*.2,'Moving-client patch must omit unchanged global catalogues');
    const http=(await host.request(`/api/session/${sessions[0].token}`)).data;assert.ok(http.layout);assert.equal(http.snapshotDelta,undefined);
  }finally{await host.close();}
});

test('two tabs and a reconnected stream own independent immutable baselines',async()=>{
  const host=await fixture();
  try{
    const [session]=await group(host,1),a=await host.stream(session.token,true),stateA=new SnapshotAccumulator();stateA.accept(await a.next());
    frames(host);stateA.accept(await a.next());
    const b=await host.stream(session.token,true),stateB=new SnapshotAccumulator(),initialB=await b.next();assert.equal(initialB.snapshotDelta,undefined);stateB.accept(initialB);
    frames(host);const [patchA,patchB]=await Promise.all([a.next(),b.next()]);assert.equal(patchA.baseSequence,2);assert.equal(patchB.baseSequence,2);stateA.accept(patchA);stateB.accept(patchB);
    a.close();frames(host);stateB.accept(await b.next());
    const reconnected=await host.stream(session.token,true),full=await reconnected.next();assert.equal(full.snapshotDelta,undefined);assert.ok(full.layout);
    const newState=new SnapshotAccumulator();newState.accept(full);frames(host);const patch=await reconnected.next();assert.equal(patch.baseSequence,full.sequence);newState.accept(patch);
    assert.equal(newState.snapshot.player.id,session.playerId);assert.equal(newState.snapshot.inventory.heal_potion,host.hub.sessions.get(session.token).game.inventory.heal_potion);
  }finally{await host.close();}
});

test('semantic summary caches invalidate for completion, membership, rewards, level and personal interaction credit',async()=>{
  const host=await fixture();
  try{
    const sessions=await group(host,2),member=host.hub.sessions.get(sessions[0].token),other=host.hub.sessions.get(sessions[1].token),game=member.game;
    delete member.summaryCache;let computations=0;const original=game.worldEventSummary.bind(game);game.worldEventSummary=()=>{computations++;return original();};
    const first=host.hub.snapshot(member),event=game.world.worldEvents[0];assert.equal(computations,1);
    event.clock+=100;host.hub.snapshot(member);assert.equal(computations,1,'Invisible idle clock cannot invalidate the global catalogue');
    event.state='success';event.participants.push(game.player.id);event.bonus=1.2;
    const next=host.hub.snapshot(member),row=next.authoritativeWorldEventSummary.find(row=>row.id===event.id);
    assert.equal(row.claimable,true);assert.equal(host.hub.snapshot(other).authoritativeWorldEventSummary.find(row=>row.id===event.id).claimable,false);
    assert.notEqual(row.reward.xp,first.authoritativeWorldEventSummary.find(row=>row.id===event.id).reward.xp);
    event.claimedBy.push(game.player.id);assert.equal(host.hub.snapshot(member).authoritativeWorldEventSummary.find(row=>row.id===event.id).claimable,false);
    game.player.level=event.level+20;assert.equal(host.hub.snapshot(member).authoritativeWorldEventSummary.find(row=>row.id===event.id).reward.xp,0);
    const object=game.world.interactions.find(object=>!object.used),before=host.hub.snapshot(member).authoritativeInteractionSummary.find(row=>row.kind===object.kind).completed;
    game.ledger[`interact:${object.id}`]=1;assert.equal(host.hub.snapshot(member).authoritativeInteractionSummary.find(row=>row.kind===object.kind).completed,before+1);
    assert.equal(host.hub.snapshot(other).authoritativeInteractionSummary.find(row=>row.kind===object.kind).completed,before);
  }finally{await host.close();}
});

test('dungeon entry and return force full worlds; raid patches preserve culled boss progress and portable warning deadlines',async()=>{
  const host=await fixture();
  try{
    const sessions=await group(host),members=sessions.map(s=>host.hub.sessions.get(s.token)),definition=DUNGEONS.find(d=>d.id==='weltenkern');
    const stream=await host.stream(sessions[7].token,true),accumulator=new SnapshotAccumulator();accumulator.accept(await stream.next());
    for(const member of members){member.game.player.level=definition.level;member.game.player.hp=member.game.stats().maxHp;member.game.player.mana=member.game.stats().mana;Object.assign(member.game.player,definition.entrance);}
    assert.equal((await host.request(`/api/session/${sessions[0].token}/command`,{type:'method',name:'enterDungeon',args:[definition.id,1]})).data.accepted,true);
    frames(host);const entered=await stream.next();assert.equal(entered.snapshotDelta,undefined);assert.equal(entered.worldMode,'dungeon');assert.ok(entered.layout.isDungeon);accumulator.accept(entered);
    const mapView=new Game({storage:null}),mapNetwork=new NetworkClient(mapView,{baseUrl:host.base,storage:null});mapView.networkActive=true;mapNetwork.applySnapshot(entered);
    assert.deepEqual(mapView.networkDungeonLayout.structures,entered.layout.structures);assert.notEqual(mapView.networkDungeonLayout,entered.layout);
    const completeGeometry=cloneSnapshot(mapView.networkDungeonLayout);
    const leader=members[0].game,instance=leader.dungeonInstance,boss=leader.world.enemies.find(e=>e.id===`${definition.id}:boss`);
    // Transport fixture isolates an already-tested arena. Boss HP, player
    // damage and native cast clocks are retained; clients cannot submit coords.
    for(const enemy of leader.world.enemies)if(enemy!==boss){enemy.alive=false;enemy.hp=0;enemy.respawnAt=Infinity;}instance.gateOpened=true;instance.bossEngaged=true;for(const puzzle of instance.puzzles)puzzle.solved=true;
    const gate=leader.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
    for(const [i,member]of members.entries())Object.assign(member.game.player,{x:boss.x+40+i*10,y:boss.y});boss.phase='idle';boss.attackTimer=0;
    for(let i=0;i<200&&!instance.raidEncounter?.pending;i++){frames(host);accumulator.accept(await stream.next());}
    assert.ok(instance.raidEncounter?.pending);
    boss.hp-=12345;Object.assign(members[7].game.player,{x:100,y:100});frames(host);
    const patch=await stream.next();assert.equal(patch.snapshotDelta,1);const current=accumulator.accept(patch);
    mapNetwork.applySnapshot(current); // Full resync to the latest authoritative frame.
    const sameWorld=mapView.world;frames(host);const geometryDelta=await stream.next();accumulator.accept(geometryDelta);mapNetwork.applySnapshot(geometryDelta);
    assert.equal(mapView.world,sameWorld,'An ordinary delta must preserve renderer terrain identity');assert.deepEqual(mapView.networkDungeonLayout,completeGeometry);
    assert.ok(mapView.world.structures.length<mapView.networkDungeonLayout.structures.length,'View culling cannot erase the complete dungeon atlas');
    assert.equal(current.world.enemies.some(e=>e.id===boss.id),false);assert.equal(current.authoritativeDungeonCheckpoint.enemies.find(e=>e.id===boss.id).hp,boss.hp);
    const view=new Game({storage:null}),network=new NetworkClient(view,{baseUrl:host.base,storage:null});view.networkActive=true;network.applySnapshot(current);
    const restored=new Game({storage:null});restored.applySave(cloneSnapshot(view.capture()));
    assert.equal(restored.world.enemies.find(e=>e.id===boss.id).hp,boss.hp);assert.deepEqual(restored.dungeonInstance.raidEncounter.pending,instance.raidEncounter.pending);
    assert.equal((await host.request(`/api/session/${sessions[0].token}/command`,{type:'method',name:'exitDungeon',args:[]})).data.accepted,true);
    frames(host);const returned=await stream.next();assert.equal(returned.snapshotDelta,undefined);assert.equal(returned.worldMode,'overworld');assert.equal(returned.dungeonInstance,null);assert.equal(returned.authoritativeDungeonCheckpoint,null);
    accumulator.accept(returned);mapNetwork.applySnapshot(returned);assert.equal(mapView.networkDungeonLayout,null);assert.ok(accumulator.snapshot.world.enemies.length>1);assert.ok(!accumulator.snapshot.layout.isDungeon);
  }finally{await host.close();}
});

test('browser canonical state remains authoritative through interpolation and rejects a missing patch atomically',async()=>{
  const host=await fixture();
  try{
    const [session]=await group(host,1),stream=await host.stream(session.token,true),view=new Game({storage:null}),network=new NetworkClient(view,{baseUrl:host.base,storage:null});
    network.active=true;view.networkActive=true;network.applySnapshot(await stream.next());
    await host.request(`/api/session/${session.token}/command`,{type:'input',keys:['d'],angle:0});frames(host);const first=await stream.next();network.applySnapshot(first);
    const authoritativeX=network._snapshotState.snapshot.player.x;network.update(.016);view.player.x=-999;view.world.enemies[0].x=-999;view.inventory.heal_potion=99;
    frames(host);const second=await stream.next();network.applySnapshot(second);assert.ok(network._snapshotState.snapshot.player.x>=authoritativeX);assert.notEqual(network._snapshotState.snapshot.world.enemies[0].x,-999);assert.notEqual(network._snapshotState.snapshot.inventory.heal_potion,99);
    frames(host);await stream.next();frames(host);const missing=await stream.next(),before=cloneSnapshot(network._snapshotState.snapshot);
    assert.throws(()=>network.applySnapshot(missing),SnapshotResyncError);assert.deepEqual(network._snapshotState.snapshot,before);
    network.active=false;
  }finally{await host.close();}
});

test('HTTP technique learning/selection validate IDs, persist earned spending immediately and propagate through patches',async()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},host=await fixture(storage);
  try{
    const [session]=await group(host,1),member=host.hub.sessions.get(session.token),game=member.game;
    game.player.level=70;game.player.hp=game.stats().maxHp;game.resources.raidSigil=24;
    assert.equal(game.inSettlement(),true);assert.equal(game.inCombat(),false);
    const stream=await host.stream(session.token,true),state=new SnapshotAccumulator();state.accept(await stream.next());
    const route=`/api/session/${session.token}/command`,method=(name,args)=>host.request(route,{type:'method',name,args});
    for(const [name,args]of [['learnTechniqueSpecialization',[null]],['learnTechniqueSpecialization',[7]],['selectTechniqueSpecialization',[]],['selectTechniqueSpecialization',['guardian_enduring_wall','guardian_impact_wall']],['coreAbilityProfile',['nova']]])assert.equal((await method(name,args)).status,400);
    assert.equal((await method('learnTechniqueSpecialization',['ranger_focused_arrow'])).data.accepted,false);
    assert.equal((await method('learnTechniqueSpecialization',['guardian_enduring_wall'])).data.accepted,true);
    assert.equal(game.resources.raidSigil,12);assert.deepEqual(game.techniqueSpecializations.learned,['guardian_enduring_wall']);
    const restart=new MultiplayerHub({autoStart:false,storage,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});
    try{const restored=restart.sessions.get(session.token).game;assert.equal(restored.resources.raidSigil,12);assert.deepEqual(restored.techniqueSpecializations.learned,['guardian_enduring_wall']);}finally{restart.dispose();}
    frames(host);state.accept(await stream.next());assert.deepEqual(state.snapshot.techniqueSpecializations,game.techniqueSpecializations);
    assert.equal((await method('selectTechniqueSpecialization',['guardian_enduring_wall'])).data.accepted,true);frames(host);state.accept(await stream.next());assert.equal(state.snapshot.techniqueSpecializations.active,'guardian_enduring_wall');
    assert.equal((await method('selectTechniqueSpecialization',[null])).data.accepted,true);frames(host);state.accept(await stream.next());assert.equal(state.snapshot.techniqueSpecializations.active,null);
    assert.equal((await method('learnTechniqueSpecialization',['guardian_enduring_wall'])).data.accepted,false);assert.equal(game.resources.raidSigil,12);
    const lastRestart=new MultiplayerHub({autoStart:false,storage,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});
    try{assert.equal(lastRestart.sessions.get(session.token).game.techniqueSpecializations.active,null);}finally{lastRestart.dispose();}
  }finally{await host.close();}
});

test('native route and boss milestones persist once at the transition instead of every broadcast',async()=>{
  const saved=new Map();let writes=0;const storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>{writes++;saved.set(key,value);}},host=await fixture(storage);
  try{
    const [session]=await group(host,1),member=host.hub.sessions.get(session.token),game=member.game,definition=DUNGEONS.find(d=>!d.raid);
    game.player.level=definition.level;game.player.hp=game.stats().maxHp;Object.assign(game.player,definition.entrance);
    assert.equal((await host.request(`/api/session/${session.token}/command`,{type:'method',name:'enterDungeon',args:[definition.id,1]})).data.accepted,true);
    const instance=game.dungeonInstance,chamber=instance.routes.chambers.find(c=>c.stage==='A'&&c.kind==='martial');
    Object.assign(game.player,{x:chamber.centerX,y:chamber.y+100});
    for(const id of chamber.enemyIds)game.killEnemy(game.world.enemies.find(e=>e.id===id));
    const before=writes;frames(host,1);assert.equal(writes,before+1);assert.ok(instance.routes.completed.includes(chamber.id));
    frames(host,4);assert.equal(writes,before+1,'Unchanged route journal does not write again on SSE frames');
    const recorded=JSON.parse(saved.get('emberfall.multiplayer.v1'));assert.ok(recorded.rooms[0].dungeonCheckpoint.routes.completed.includes(chamber.id));
    const restart=new MultiplayerHub({autoStart:false,storage,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});
    try{assert.ok(restart.sessions.get(session.token).game.dungeonInstance.routes.completed.includes(chamber.id));}finally{restart.dispose();}
    const boss=game.world.enemies.find(e=>e.id===`${definition.id}:boss`);game.killEnemy(boss);
    const beforeBoss=writes;frames(host,1);assert.equal(instance.bossDefeated,true);assert.equal(writes,beforeBoss+1);
    const bossSaved=JSON.parse(saved.get('emberfall.multiplayer.v1'));assert.equal(bossSaved.rooms[0].dungeonCheckpoint.bossDefeated,true);
    frames(host,4);assert.equal(writes,beforeBoss+1);
  }finally{await host.close();}
});

test('PvP availability is memoized only within one synchronous broadcast and HTTP commands stay fresh between ticks',async()=>{
  const host=await fixture();
  try{
    const sessions=await group(host,2),members=sessions.map(s=>host.hub.sessions.get(s.token)),streams=await Promise.all(sessions.map(s=>host.stream(s.token,true)));
    for(const stream of streams)await stream.next();let calls=0;
    for(const member of members){const original=member.game.inCombat.bind(member.game);member.game.inCombat=()=>{calls++;return original();};}
    host.hub._broadcastRoom(members[0].room);assert.equal(calls,2,'Each character is scanned once for this batch, across both client rosters');
    members[1].game.player.lastDamageAt=members[1].game.time;
    const fresh=(await host.request(`/api/session/${sessions[0].token}`)).data;
    assert.equal(fresh.sequence,0,'No simulation tick is needed to invalidate availability');assert.equal(fresh.pvp.roster[0].available,false);assert.equal(fresh.pvp.roster[0].reason,'Im Kampf');
    const invitation=await host.request(`/api/session/${sessions[0].token}/command`,{type:'method',name:'pvpInvite',args:[members[1].id]});assert.equal(invitation.data.accepted,false);
    delete members[1].game.player.lastDamageAt;
    const ready=(await host.request(`/api/session/${sessions[0].token}`)).data;assert.equal(ready.pvp.roster[0].available,true);
    members[1].game.dead=true;members[1].game.player.hp=0;
    const downed=(await host.request(`/api/session/${sessions[0].token}`)).data;assert.equal(downed.pvp.roster[0].reason,'Am Boden');
    assert.equal(host.hub._broadcastAvailabilityCache,null);
  }finally{await host.close();}
});

test('server address changes validate a real protocol handshake before replacing preference and preserve other server tokens',async()=>{
  const host=await fixture();
  try{
    const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)},oldSession=JSON.stringify({baseUrl:'http://old.example.test',roomCode:'ABCDEF01',token:'private-test-session'});
    values.set('emberfall.network.v1',oldSession);
    const network=new NetworkClient(new Game({storage:null}),{baseUrl:'http://old.example.test',storage});
    assert.equal(await network.setServerAddress(host.base+'/'),host.base);assert.equal(network.serverAvailable,true);assert.equal(network.error,null);assert.equal(network.status,'offline');
    assert.equal(values.get('emberfall.server-address.v1'),host.base);assert.equal(values.get('emberfall.network.v1'),oldSession);assert.equal(network.savedSession,null);
    for(const status of ['connecting','reconnecting','online']){network.status=status;await assert.rejects(network.setServerAddress(host.base),/Beende zuerst/);}network.status='offline';network.active=true;await assert.rejects(network.setServerAddress(host.base),/Beende zuerst/);network.active=false;
    const previous=network.baseUrl;network.fetchImpl=async()=>({ok:true,json:async()=>({protocol:2,rooms:[]})});
    await assert.rejects(network.setServerAddress('https://wrong.example.test'),/keinen unterstützten/);assert.equal(network.baseUrl,previous);assert.equal(values.get('emberfall.server-address.v1'),previous);
  }finally{await host.close();}
});

test('aborted address checks cannot commit late answers and concurrent character creation waits for the chosen authority',async()=>{
  let answer,signal;const network=new NetworkClient(new Game({storage:null}),{baseUrl:'http://old.example.test',storage:null,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(resolve=>{answer=resolve;});}});
  const changing=network.setServerAddress('https://next.example.test');await assert.rejects(network.create(),/noch geprüft/);
  await network.disconnect({leave:false});assert.equal(signal.aborted,true);
  answer({ok:true,json:async()=>({protocol:1,rooms:[]})});await assert.rejects(changing,/wurde beendet/);assert.equal(network.baseUrl,'http://old.example.test');
});

test('unresponsive server discovery times out with abort and preserves the existing authority',async()=>{
  let signal;const network=new NetworkClient(new Game({storage:null}),{baseUrl:'http://old.example.test',storage:null,fetchImpl:async(url,options)=>{signal=options.signal;return new Promise(()=>{});}});
  await assert.rejects(network.setServerAddress('https://slow.example.test'),/antwortet nicht/);assert.equal(signal.aborted,true);assert.equal(network.baseUrl,'http://old.example.test');assert.equal(network.status,'offline');assert.equal(network._addressOperation,null);
});

test('a ninth lifetime character retains its token and progress on restart while only eight sessions can be active',async()=>{
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)},host=await fixture(storage);let restarted;
  try{
    const sessions=await group(host,8),first=host.hub.sessions.get(sessions[0].token);first.game.player.gold=171;first.game.resources.wood=19;
    assert.equal((await host.request(`/api/session/${sessions[0].token}/leave`,{})).data.ok,true);
    const ninth=await host.request(`/api/rooms/${sessions[0].roomCode}/join`,{playerName:'Neunte Lebenszeitreise',classId:'druid'});assert.equal(ninth.status,201);
    const newest=host.hub.sessions.get(ninth.data.token);newest.game.player.gold=919;newest.game.resources.wood=27;host.hub.persist();
    restarted=await fixture(storage);
    assert.equal(restarted.hub.rooms.get(sessions[0].roomCode).members.size,9);assert.ok([...restarted.hub.sessions.values()].every(member=>!member.active));
    const retained=(await restarted.request(`/api/session/${ninth.data.token}`)).data;assert.equal(retained.player.gold,919);assert.equal(retained.resources.wood,27);assert.equal(retained.player.classId,'druid');
    const original=(await restarted.request(`/api/session/${sessions[0].token}`)).data;assert.equal(original.player.gold,171);assert.equal(original.resources.wood,19);
    for(const session of sessions.slice(1,7))assert.equal((await restarted.request(`/api/session/${session.token}`)).status,200);
    assert.equal((await restarted.request(`/api/session/${sessions[7].token}`)).status,409,'Eight active slots remain enforced after restoring nine personal records');
    assert.equal(restarted.hub.sessions.get(sessions[7].token).active,false);
    await restarted.request(`/api/session/${ninth.data.token}/leave`,{});
    assert.equal((await restarted.request(`/api/session/${sessions[7].token}`)).status,200,'A retained character returns when a real active slot becomes free');
  }finally{await restarted?.close();await host.close();}
});

test('initial overworld geometry preserves the real dungeon portal for client interaction and later culled updates',async()=>{
  const host=await fixture();
  try{
    const [session]=await group(host,1),member=host.hub.sessions.get(session.token),definition=DUNGEONS.find(d=>d.id==='wurzelgewoelbe');Object.assign(member.game.player,definition.entrance);
    const stream=await host.stream(session.token,true),initial=await stream.next(),view=new Game({storage:null}),network=new NetworkClient(view,{baseUrl:host.base,storage:null});view.networkActive=true;
    assert.deepEqual(initial.layout.dungeonEntrances,member.game.world.dungeonEntrances);network.applySnapshot(initial);
    assert.deepEqual(view.world.npcs,member.game.world.npcs,'Static NPC hearth lights keep their existing renderer input');
    assert.equal(view.nearby().kind,'dungeon');assert.equal(view.nearby().object.id,definition.id);
    const geometry=view.world.dungeonEntrances;frames(host);network.applySnapshot(await stream.next());
    assert.equal(view.world.dungeonEntrances,geometry);assert.equal(view.nearby().kind,'dungeon');assert.equal(view.nearby().object.id,definition.id);
  }finally{await host.close();}
});

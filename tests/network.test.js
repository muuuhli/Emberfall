import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { DUNGEONS } from '../src/dungeons.js';
import { startServer } from '../server.mjs';
import { NPCS, ITEMS } from '../src/catalog.js';

const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
function arenaGame({enemy=true}={}) {
  const game=new Game({storage:null,random:()=>.5});
  game.world.trees=[];game.world.rocks=[];game.world.structures=[];game.world.nodes=[];game.world.plots=[];game.world.chests=[];game.world.shrines=[];game.npcs=[];
  game.player.x=900;game.player.y=700;game.player.face=0;
  game.world.enemies=enemy?[{id:'shared-wolf',type:'wolf',x:950,y:700,homeX:950,homeY:700,hp:48,maxHp:48,alive:true,attackTimer:5,phase:'idle',respawnAt:0,aggro:false}]:[];
  return game;
}
async function serverFixture(options={}) {
  const hub=new MultiplayerHub({createGame:()=>arenaGame(options),autoStart:false,...options});
  const server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(route,body,headers={})=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async route=>{const response=await fetch(base+route);return {status:response.status,data:await response.json()};};
  const sessions=[];
  const stream=async token=>{
    const controller=new AbortController();sessions.push(controller);
    const response=await fetch(`${base}/api/session/${token}/events`,{signal:controller.signal});assert.equal(response.status,200);
    const reader=response.body.getReader();let buffer='';
    return {async next(){while(true){const end=buffer.indexOf('\n\n');if(end>=0){const message=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=message.split('\n').find(line=>line.startsWith('data: '));if(line)return JSON.parse(line.slice(6));}const read=await reader.read();if(read.done)throw new Error('Snapshot stream closed.');buffer+=new TextDecoder().decode(read.value);}}};
  };
  const close=async()=>{sessions.forEach(controller=>controller.abort());hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  return {hub,base,post,get,stream,close};
}
async function twoPlayers(fixture) {
  const created=await fixture.post('/api/rooms',{name:'Testgruppe',playerName:'Tank',classId:'guardian'});assert.equal(created.status,201);
  const joined=await fixture.post(`/api/rooms/${created.data.roomCode}/join`,{playerName:'Gefährte',classId:'guardian'});assert.equal(joined.status,201);
  return [created.data,joined.data];
}

test('two real HTTP/SSE clients damage and kill one authoritative shared enemy',async()=>{
  const fixture=await serverFixture();
  try {
    const [first,second]=await twoPlayers(fixture);
    assert.notEqual(first.token,second.token);
    const [a,b]=await Promise.all([fixture.stream(first.token),fixture.stream(second.token)]);
    const [initialA,initialB]=await Promise.all([a.next(),b.next()]);
    assert.equal(initialA.party.length,2);assert.equal(initialB.party.length,2);
    assert.equal(initialA.world.enemies[0].id,initialB.world.enemies[0].id);
    const firstPath=`/api/session/${first.token}/command`,secondPath=`/api/session/${second.token}/command`;
    await fixture.post(firstPath,{type:'input',keys:[],angle:0});
    const attacked=await fixture.post(firstPath,{type:'action',name:'attack'});assert.equal(attacked.data.accepted,true);
    const afterFirst=(await fixture.get(`/api/session/${second.token}`)).data;
    assert.ok(afterFirst.world.enemies[0].hp<initialB.world.enemies[0].hp,'The second browser observes the first player damage');
    for(let attempt=0;attempt<8&&fixture.hub.rooms.get(first.roomCode).world.enemies[0].alive;attempt++) {
      const target=fixture.hub.rooms.get(first.roomCode).world.enemies[0];
      const member=fixture.hub.sessions.get(second.token);
      await fixture.post(secondPath,{type:'input',keys:[],angle:Math.atan2(target.y-member.game.player.y,target.x-member.game.player.x)});
      await fixture.post(secondPath,{type:'action',name:'attack'});
      for(let frame=0;frame<10;frame++)fixture.hub.tick(.04);
    }
    const [deadA,deadB]=await Promise.all([fixture.get(`/api/session/${first.token}`),fixture.get(`/api/session/${second.token}`)]);
    assert.equal(deadA.data.world.enemies[0].alive,false);assert.equal(deadB.data.world.enemies[0].alive,false);
    assert.equal(deadA.data.world.enemies[0].hp,0);assert.equal(deadB.data.world.enemies[0].hp,0);
    assert.ok(deadA.data.ledger['kill:wolf']>=1,'Nearby party members receive real quest kill credit');
    assert.ok(deadB.data.ledger['kill:wolf']>=1);
    assert.ok(deadA.data.player.xp>0||deadA.data.player.level>1);
    assert.ok(deadB.data.player.xp>0||deadB.data.player.level>1);
    const streamedDeath=async stream=>{for(let count=0;count<100;count++){const snapshot=await stream.next();if(snapshot.world.enemies[0]?.alive===false)return snapshot;}throw new Error('Shared death did not reach SSE clients.');};
    const [streamedA,streamedB]=await Promise.all([streamedDeath(a),streamedDeath(b)]);
    assert.equal(streamedA.world.enemies[0].hp,0);assert.equal(streamedB.world.enemies[0].hp,0);
    assert.equal(JSON.stringify(deadA.data).includes(first.token),false,'Snapshots never expose session tokens');
  } finally{await fixture.close();}
});

test('server accepts bounded input, rejects forged character values and keeps one world clock',async()=>{
  const fixture=await serverFixture({enemy:false});
  try {
    const [first,second]=await twoPlayers(fixture),route=`/api/session/${first.token}/command`;
    const before=(await fixture.get(`/api/session/${first.token}`)).data;
    const cheat=await fixture.post(route,{type:'input',keys:['d'],angle:0,x:99999,hp:999999,level:100,inventory:{ember_charm:99}});assert.equal(cheat.status,400);
    assert.equal((await fixture.post(route,{type:'method',name:'gainXp',args:[999999]})).status,400);
    assert.equal((await fixture.post(route,{type:'input',keys:['teleport'],angle:0})).status,400);
    assert.equal((await fixture.post(route,{type:'input',keys:['d'],angle:0})).data.accepted,true);
    for(let frame=0;frame<10;frame++)fixture.hub.tick(.04);
    const [a,b]=await Promise.all([fixture.get(`/api/session/${first.token}`),fixture.get(`/api/session/${second.token}`)]);
    assert.ok(a.data.player.x>before.player.x);
    assert.ok(a.data.player.x-before.player.x<=300*.4+.001,'Movement uses server speed and elapsed simulation time');
    assert.equal(a.data.player.level,1);assert.equal(a.data.player.gold,before.player.gold);
    assert.ok(Math.abs(a.data.time-.4)<1e-6);assert.equal(a.data.time,b.data.time);
    assert.equal((await fixture.post(route,{type:'action',name:'attack'},{Origin:'https://attacker.invalid'})).status,403);
  } finally{await fixture.close();}
});

test('one defeated player cannot pause the other player or the world simulation',async()=>{
  const fixture=await serverFixture({enemy:false});
  try {
    const [first,second]=await twoPlayers(fixture);
    const fallen=fixture.hub.sessions.get(first.token).game;fallen.dead=true;fallen.paused=true;fallen.player.hp=0;
    const partner=fixture.hub.sessions.get(second.token).game,start=partner.player.x;
    await fixture.post(`/api/session/${second.token}/command`,{type:'input',keys:['d'],angle:0});fixture.hub.tick(.04);
    assert.ok(partner.player.x>start);assert.equal(fallen.dead,true);assert.ok(fixture.hub.rooms.get(first.roomCode).time>0);
    assert.equal((await fixture.post(`/api/session/${first.token}/command`,{type:'method',name:'respawn',args:[]})).data.accepted,true);
    assert.equal(fallen.dead,false);assert.equal(fallen.player.hp,fallen.stats().maxHp);
  } finally{await fixture.close();}
});

test('group slots are bounded, disconnect stops movement, and saved tokens resume characters',async()=>{
  let now=1000;const store=memoryStorage();const fixture=await serverFixture({enemy:false,maxPlayers:2,clock:()=>now,disconnectMs:100,storage:store});
  try {
    const [first,second]=await twoPlayers(fixture);
    assert.equal((await fixture.post(`/api/rooms/${first.roomCode}/join`,{classId:'guardian'})).status,409);
    const member=fixture.hub.sessions.get(first.token);member.game.player.gold=713;
    await fixture.post(`/api/session/${first.token}/command`,{type:'input',keys:['d'],angle:0});
    now+=200;fixture.hub.tick(.04);assert.equal(member.active,false);assert.equal(member.game.keys.size,0);
    const resumed=await fixture.get(`/api/session/${first.token}`);assert.equal(resumed.status,200);assert.equal(resumed.data.player.gold,713);assert.equal(member.active,true);
    await fixture.post(`/api/session/${second.token}/leave`,{});
    assert.equal(fixture.hub.sessions.get(second.token).active,false,'Leaving retains the server character for later sessions');
    fixture.hub.persist();
    const restored=new MultiplayerHub({createGame:()=>arenaGame({enemy:false}),autoStart:false,storage:store,clock:()=>now});
    try{assert.equal(restored.sessions.get(first.token).game.player.gold,713);assert.equal(restored.sessions.get(first.token).active,false);}finally{restored.dispose();}
  } finally{await fixture.close();}
});

test('browser client applies server state and routes gameplay methods to HTTP instead of local mutation',async()=>{
  const fixture=await serverFixture({enemy:false});
  class MockEventSource {
    constructor(url){this.url=url;this.handlers=new Map();queueMicrotask(()=>this.onopen?.());}
    addEventListener(name,handler){this.handlers.set(name,handler);}
    close(){this.closed=true;}
  }
  try {
    const game=arenaGame({enemy:false});game.start();game.player.gold=500;const offlineGold=game.player.gold;
    const network=new NetworkClient(game,{baseUrl:fixture.base,EventSourceImpl:MockEventSource,storage:memoryStorage()});
    await network.create({playerName:'Browser',classId:'guardian'});await Promise.resolve();
    assert.equal(network.online,true);assert.equal(network.connected,true);assert.equal(game.networkActive,true);
    assert.notEqual(game.player.gold,offlineGold,'The browser cannot upload its offline gold into a server character');
    const before=game.player.gold;await network.command('buy','ember_charm');assert.equal(game.player.gold,before);
    const actor=fixture.hub.sessions.get(network.token).game;actor.player.gold=123;
    network.applySnapshot((await fixture.get(`/api/session/${network.token}`)).data);assert.equal(game.player.gold,123);
    await network.disconnect();assert.equal(game.player.gold,offlineGold);assert.equal(network.online,false);assert.equal(game.networkActive,false);
    assert.ok(network.savedSession,'The saved server character can be resumed after returning to solo play');
  } finally{await fixture.close();}
});

test('eight HTTP sessions must hold distinct raid seals before the shared gate and boss shield open',async()=>{
  const fixture=await serverFixture({enemy:false});
  try {
    const classes=['guardian','paladin','ranger','nightblade','flamecaller','frostweaver','druid','shadowbinder'];
    const catalog=(await fixture.get('/api/rooms')).data;assert.deepEqual(catalog.classes,classes);
    const first=(await fixture.post('/api/rooms',{playerName:'Held 1',classId:classes[0]})).data;const players=[first];
    for(let i=1;i<7;i++)players.push((await fixture.post(`/api/rooms/${first.roomCode}/join`,{playerName:`Held ${i+1}`,classId:classes[i]})).data);
    const entrance=DUNGEONS.find(d=>d.id==='weltenkern').entrance;
    for(const member of fixture.hub.rooms.get(first.roomCode).members.values()){member.game.player.level=95;member.game.player.hp=member.game.stats().maxHp;Object.assign(member.game.player,entrance);}
    const route=`/api/session/${first.token}/command`;
    assert.equal((await fixture.post(route,{type:'method',name:'enterDungeon',args:['weltenkern',1]})).data.accepted,false,'Seven sessions cannot enter the eight-player raid');
    const eighth=await fixture.post(`/api/rooms/${first.roomCode}/join`,{playerName:'Held 8',classId:classes[7]});assert.equal(eighth.status,201);players.push(eighth.data);
    const members=players.map(p=>fixture.hub.sessions.get(p.token));
    for(let i=0;i<members.length;i++) {members[i].game.player.level=95;members[i].game.player.hp=members[i].game.stats().maxHp;Object.assign(members[i].game.player,entrance);assert.equal(members[i].game.player.classId,classes[i]);}
    assert.equal((await fixture.post(route,{type:'method',name:'enterDungeon',args:['weltenkern',1]})).data.accepted,true);
    const room=fixture.hub.rooms.get(first.roomCode),instance=members[0].game.dungeonInstance;
    assert.ok(members.every(m=>m.game.world===room.world&&m.game.dungeonInstance===instance),'The party shares one authoritative instance');
    const boss=room.world.enemies.find(e=>e.id==='weltenkern:boss');
    // This test isolates cooperative seals. Stack/spread/enrage damage is
    // exercised with the actual combat timer in raid-combat.test.js.
    boss.phase='recover';boss.attackTimer=60;
    const plates=room.world.puzzleObjects.filter(o=>o.kind==='plate');assert.equal(plates.length,8);
    // The fixture places authoritative actors at known coordinates to isolate
    // occupancy mechanics from travel; browsers cannot send these coordinates.
    for(let i=0;i<members.length;i++){Object.assign(members[i].game.player,i<7?{x:plates[i].x,y:plates[i].y}:{x:150,y:300});members[i].game.player.invulnerable=100;}
    for(let frame=0;frame<55;frame++)fixture.hub.tick(.04);
    assert.equal(instance.gateOpened,false,'Seven distinct characters cannot solve eight simultaneous plates');
    Object.assign(members[7].game.player,{x:plates[7].x,y:plates[7].y});
    for(let frame=0;frame<55;frame++)fixture.hub.tick(.04);
    assert.equal(instance.gateOpened,true);
    const [stateA,stateB]=await Promise.all([fixture.get(`/api/session/${players[0].token}`),fixture.get(`/api/session/${players[7].token}`)]);
    assert.equal(stateA.data.world.structures.find(s=>s.id==='weltenkern:gate').blocking,false);assert.equal(stateB.data.world.structures.find(s=>s.id==='weltenkern:gate').blocking,false);
    assert.equal(boss.shielded,true);
    const hp=boss.hp;
    Object.assign(members[0].game.player,{x:boss.x-50,y:boss.y});
    await fixture.post(route,{type:'input',keys:[],angle:0});await fixture.post(route,{type:'action',name:'attack'});assert.equal(boss.hp,hp,'A solo damage dealer cannot bypass the raid shield');
    const bossPlates=room.world.puzzleObjects.filter(o=>o.kind==='boss_plate');assert.equal(bossPlates.length,4);
    for(let i=0;i<4;i++)Object.assign(members[i+1].game.player,{x:bossPlates[i].x,y:bossPlates[i].y});
    for(let frame=0;frame<55;frame++)fixture.hub.tick(.04);
    assert.equal(boss.shielded,false,'Four distinct companions create the shared damage window');
    Object.assign(members[0].game.player,{x:boss.x-50,y:boss.y});
    await fixture.post(route,{type:'input',keys:[],angle:0});await fixture.post(route,{type:'action',name:'attack'});assert.ok(boss.hp<hp);
    assert.equal((await fixture.get(`/api/session/${players[7].token}`)).data.world.enemies.find(e=>e.id===boss.id).hp,boss.hp);
  } finally{await fixture.close();}
});

test('integrated game server serves runtime files and HEAD while keeping saves and tooling private',async()=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'emberfall-http-'));
  const storagePath=path.join(temporary,'rooms.json');
  const running=await startServer({port:0,host:'127.0.0.1',storagePath,autoTick:false});
  try {
    assert.equal((await fetch(`${running.origin}/`)).status,200);
    assert.equal((await fetch(`${running.origin}/src/network.js`)).status,200);
    const image=await fetch(`${running.origin}/assets/characters.png`,{method:'HEAD'});assert.equal(image.status,200);assert.ok(Number(image.headers.get('content-length'))>0);assert.equal(await image.text(),'');
    for(const route of ['/server.mjs','/server/multiplayer.mjs','/.emberfall-server/rooms.json','/src/.secret.json','/assets/characters.blend','/assets/build_characters.py','/package.json','/README.md','/src/%2e%2e/server.mjs'])assert.equal((await fetch(running.origin+route)).status,404,route);
    assert.equal((await fetch(`${running.origin}/src/main.js`,{method:'POST'})).status,405);
    const response=await fetch(`${running.origin}/api/rooms`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playerName:'Gespeichert',classId:'druid'})});assert.equal(response.status,201);
    const created=await response.json();assert.equal(created.snapshot.player.classId,'druid');
    const saved=JSON.parse(await fs.readFile(storagePath,'utf8'));assert.ok(Object.values(saved).some(value=>JSON.parse(value).rooms.some(room=>room.code===created.roomCode)));
    assert.equal((await fs.stat(storagePath)).mode&0o777,0o600);
  } finally{await running.close();await fs.rm(temporary,{recursive:true,force:true});}
});

test('HTTP shops sell their authoritative stock at Elin, Sera and Oren and reject remote or spoofed purchases',async()=>{
  const fixture=await serverFixture({enemy:false});
  try {
    const created=await fixture.post('/api/rooms',{playerName:'Käufer',classId:'guardian'});assert.equal(created.status,201);
    const token=created.data.token,game=fixture.hub.sessions.get(token).game;game.npcs=NPCS;game.player.gold=2000;
    const buy=args=>fixture.post(`/api/session/${token}/command`,{type:'method',name:'buy',args});
    const stocks={elin:['forest_blade','sentinel_mail'],sera:['heal_potion','mana_potion'],oren:['heal_potion','mana_potion','leather_armor','forest_blade','seed']};
    for(const [npcId,ids]of Object.entries(stocks)) {
      const npc=NPCS.find(n=>n.id===npcId);Object.assign(game.player,{x:npc.x,y:npc.y});
      for(const id of ids) {
        const gold=game.player.gold,count=id==='seed'?game.resources.seed:game.inventory[id]||0;
        const bought=await buy([id]);assert.equal(bought.status,200);assert.equal(bought.data.accepted,true,`${npcId} must sell ${id}`);
        assert.equal(game.player.gold,gold-(id==='seed'?4:ITEMS[id].price));
        assert.equal(id==='seed'?game.resources.seed:game.inventory[id],count+(id==='seed'?3:1));
      }
      const gold=game.player.gold;
      const unavailable=await buy(['ember_charm',npcId]);assert.equal(unavailable.status,409);assert.equal(game.player.gold,gold);
    }
    Object.assign(game.player,{x:455,y:1100});
    assert.equal((await buy(['forest_blade','elin'])).status,409,'A client-supplied shop id cannot access a distant smith');
    Object.assign(game.player,{x:390,y:1280});
    const smithGold=game.player.gold;assert.equal((await buy(['forest_blade',0])).data.accepted,true);
    assert.equal(game.player.gold,smithGold-ITEMS.forest_blade.price,'The server price cannot be replaced with a client-supplied zero');
    Object.assign(game.player,{x:2000,y:1000});const distantGold=game.player.gold;
    assert.equal((await buy(['heal_potion'])).status,409);assert.equal(game.player.gold,distantGold);
    assert.equal((await fixture.post(`/api/session/${token}/command`,{type:'method',name:'sell',args:['forest_blade']})).status,409);
    const state=(await fixture.get(`/api/session/${token}`)).data;assert.equal(state.player.gold,game.player.gold);assert.equal(state.inventory.forest_blade,game.inventory.forest_blade);
  } finally{await fixture.close();}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { PVP_STATS } from '../src/pvp.js';
import { DUNGEONS } from '../src/dungeons.js';

const memoryStorage=()=>{const map=new Map();return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};};
async function fixture() {
  let now=10000,hub,server,base;const storage=memoryStorage();
  const createGame=()=>{const game=new Game({storage:null,random:()=>.5});for(const key of ['trees','rocks','structures','enemies'])game.world[key]=[];return game;};
  const open=async()=>{hub=new MultiplayerHub({createGame,clock:()=>now,storage,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async(session)=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  const first=(await post('/api/rooms',{playerName:'Erstling',classId:'guardian'})).data;
  const second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Veteran',classId:'ranger'})).data;
  const method=(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args});
  const action=(session,name)=>post(`/api/session/${session.token}/command`,{type:'action',name});
  const input=(session,keys=[],angle=0)=>post(`/api/session/${session.token}/command`,{type:'input',keys,angle});
  const step=async(seconds,{refresh=true}={})=>{for(let frame=0;frame<Math.ceil(seconds/.04);frame++){now+=40;hub.tick(.04);if(refresh&&frame%25===0)await Promise.all([get(first),get(second)]);}};
  return {first,second,get,post,method,action,input,step,close,storage,get hub(){return hub;},member:session=>hub.sessions.get(session.token),
    async start(){assert.equal((await method(first,'pvpInvite',second.playerId)).data.accepted,true);const snap=await get(second),id=snap.pvp.invites[0].id;assert.equal((await method(second,'pvpAccept',id)).data.accepted,true);await step(3.1);assert.equal((await get(first)).pvp.duel.state,'active');},
    async restart(){await close();await open();},advanceClock(seconds){now+=seconds*1000;}};
}

test('duels require explicit mutual HTTP opt-in, bounded invitation ownership and exact parameters',async()=>{
  const f=await fixture();try {
    assert.equal((await f.get(f.first)).worldMode,'overworld');
    assert.equal((await f.method(f.first,'pvpInvite',f.first.playerId)).data.accepted,false);
    const invalid=[['pvpInvite',{id:f.second.playerId,power:999}],['pvpInvite',f.second.playerId,99],['pvpAccept',null],['pvpCancel','forced'],['pvpForfeit',1],['pvpReturn',true]];
    for(const [name,...args] of invalid)assert.equal((await f.method(f.first,name,...args)).status,400);
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,true);
    const pending=await f.get(f.second),id=pending.pvp.invites[0].id;assert.equal(pending.worldMode,'overworld');assert.equal(pending.pvp.duel,null);assert.equal(pending.pvp.invites[0].outgoing,false);
    assert.equal((await f.method(f.first,'pvpAccept',id)).data.accepted,false,'An inviter cannot consent on behalf of another player');
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,false,'Invitation spam is bounded');
    assert.equal((await f.method(f.second,'pvpDecline',id)).data.accepted,true);assert.equal((await f.get(f.first)).pvp.invites.length,0);
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,true);
    assert.equal((await f.method(f.first,'pvpCancel')).data.accepted,true);
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,true);f.advanceClock(31);
    assert.equal((await f.method(f.second,'pvpAccept',(await f.get(f.second)).pvp.invites[0].id)).data.accepted,false);assert.equal((await f.get(f.first)).pvp.invites.length,0);
  }finally{await f.close();}
});

test('trusted readiness, proximity and countdown prevent remote, dungeon or combat duels',async()=>{
  const f=await fixture();try {
    const one=f.member(f.first).game,two=f.member(f.second).game;
    two.player.x=3000;assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,false);two.player.x=548;
    two.player.lastDamageAt=two.time;assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,false);delete two.player.lastDamageAt;
    two.dead=true;assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,false);two.dead=false;
    assert.equal((await f.method(f.first,'pvpInvite',f.second.playerId)).data.accepted,true);const id=(await f.get(f.second)).pvp.invites[0].id;
    two.dungeonInstance={id:'forbidden'};assert.equal((await f.method(f.second,'pvpAccept',id)).data.accepted,false);two.dungeonInstance=null;one.dungeonInstance=null;
    assert.equal((await f.method(f.second,'pvpAccept',id)).data.accepted,true);
    const countdown=await f.get(f.first);assert.equal(countdown.worldMode,'pvp');assert.equal(countdown.pvp.duel.state,'countdown');assert.equal(countdown.player.x,210);
    assert.equal((await f.action(f.first,'attack')).data.accepted,false);await f.input(f.first,['d']);await f.step(1);assert.equal((await f.get(f.first)).player.x,210,'Countdown movement stays locked');
    assert.equal((await f.method(f.first,'pvpForfeit')).data.accepted,true);const finished=await f.get(f.first);assert.equal(finished.pvp.duel.result,'draw');assert.equal(finished.pvp.duel.reason,'Abgebrochen');assert.equal(one.dead,false);
  }finally{await f.close();}
});

test('normalization ignores veteran gear, talents, level and companion while keeping both real PvE saves intact',async()=>{
  const f=await fixture();try {
    const veteran=f.member(f.second).game;veteran.player.level=100;veteran.player.gold=7777;veteran.player.hp=37;veteran.player.mana=23;veteran.skills={ranger_aim:10};veteran.cooldowns.bolt=4;
    const comparableSave=game=>{const save=game.capture();delete save.savedAt;return save;};
    const original=[comparableSave(f.member(f.first).game),comparableSave(veteran)];
    await f.start();const [a,b]=await Promise.all([f.get(f.first),f.get(f.second)]);
    assert.deepEqual(a.pvpStats,PVP_STATS);assert.deepEqual(b.pvpStats,PVP_STATS);assert.equal(a.player.hp,300);assert.equal(b.player.hp,300);assert.equal(b.player.level,1);assert.equal(b.player.classId,'ranger');assert.equal(a.dungeonInstance,null);assert.equal(a.world.isPvp,true);
    assert.equal((await f.method(f.second,'equip','novice_bow')).data.accepted,false);assert.equal((await f.action(f.first,'potion')).data.accepted,false);assert.equal((await f.method(f.first,'useLearnedAbility',0)).data.accepted,false);
    assert.equal((await f.method(f.second,'pvpForfeit')).data.accepted,true);
    const result=await f.get(f.first);assert.equal(result.pvp.duel.result,'victory');assert.equal((await f.get(f.second)).pvp.duel.result,'defeat');
    await f.method(f.first,'pvpReturn');await f.method(f.second,'pvpReturn');
    for(const [index,session] of [f.first,f.second].entries()){const snap=await f.get(session);assert.equal(snap.worldMode,'overworld');assert.equal(snap.pvp.duel,null);assert.equal(snap.pvpStats,null);assert.ok(snap.layout);assert.deepEqual(comparableSave(f.member(session).game),original[index],'Arena never changes the original saved journey');}
  }finally{await f.close();}
});

test('two HTTP clients move and aim in bounded arena, telegraph projectiles and evade with native dash',async()=>{
  const f=await fixture();try {
    await f.start();assert.equal((await f.input(f.first,[],0)).data.accepted,true);assert.equal((await f.action(f.first,'bolt')).data.accepted,true);
    const warning=await f.get(f.second);assert.equal(warning.hazards.length,1);assert.equal(warning.hazards[0].pending,true);assert.equal(warning.player.hp,300);
    await f.step(.32);assert.equal((await f.get(f.second)).player.hp,300,'Warning happens before launch');await f.step(.12);assert.equal((await f.get(f.second)).projectiles.length,1);
    await f.input(f.second,[],Math.PI/2);assert.equal((await f.action(f.second,'dash')).data.accepted,true);await f.step(1.6);assert.equal((await f.get(f.second)).player.hp,300,'A real sidestep avoids the locked projectile');
    await f.input(f.second,['w'],Math.PI);await f.step(.6);await f.input(f.second,[],Math.PI);const aligned=await f.get(f.second);assert.ok(Math.abs(aligned.player.y-320)<8);
    await f.step(1);await f.action(f.first,'bolt');assert.equal((await f.action(f.first,'bolt')).data.accepted,false,'Ability cooldown is authoritative');await f.step(1.7);assert.equal((await f.get(f.second)).player.hp,264,'Second projectile applies canonical 36 damage');
    await f.input(f.first,['a'],Math.PI);await f.step(.6);await f.input(f.first,['a'],Math.PI);await f.step(.6);await f.input(f.first,['a'],Math.PI);await f.step(.6);assert.ok((await f.get(f.first)).player.x>=41,'No key input escapes arena bounds');
    const forged=await f.post(`/api/session/${f.first.token}/command`,{type:'input',keys:['d'],angle:0,x:99999,hp:99999});assert.equal(forged.status,400);
  }finally{await f.close();}
});

test('announced melee and target-circle attacks resolve through real input and cannot damage PvE actors',async()=>{
  const f=await fixture();try {
    await f.start();const originalHp=f.member(f.second).game.player.hp;
    for(let part=0;part<4;part++){await f.input(f.first,['d'],0);await f.step(.55);}await f.input(f.first,[],0);
    const approached=await f.get(f.first);assert.ok(690-approached.player.x<85);
    assert.equal((await f.action(f.first,'attack')).data.accepted,true);assert.equal((await f.get(f.second)).player.hp,300);await f.step(.2);assert.equal((await f.get(f.second)).player.hp,268);
    await f.input(f.first,['a'],0);await f.step(.6);await f.input(f.first,['a'],0);await f.step(.15);await f.input(f.first,[],0);
    assert.equal((await f.action(f.first,'nova')).data.accepted,true);const circle=(await f.get(f.second)).hazards[0];assert.equal(circle.kind,'meteor');assert.equal(circle.radius,95);await f.step(.8);assert.equal((await f.get(f.second)).player.hp,268);await f.step(.16);assert.equal((await f.get(f.second)).player.hp,220);
    assert.equal(f.member(f.second).game.player.hp,originalHp,'Original PvE body never receives arena damage');
    for(let hit=0;hit<7;hit++){await f.step(3.1);await f.action(f.first,'bolt');await f.step(1);}
    assert.equal((await f.get(f.first)).pvp.duel.result,'victory');assert.equal(f.member(f.second).game.dead,false);
    await f.step(8.1);assert.equal((await f.get(f.first)).worldMode,'overworld');assert.equal((await f.get(f.second)).worldMode,'overworld');
  }finally{await f.close();}
});

test('time limit yields a draw, stale connections forfeit safely, and restarts preserve only PvE state',async()=>{
  const f=await fixture();try {
    await f.start();await f.step(90.1);assert.equal((await f.get(f.first)).pvp.duel.result,'draw');assert.equal((await f.get(f.first)).pvp.duel.reason,'Zeitlimit');
    await f.method(f.first,'pvpReturn');await f.method(f.second,'pvpReturn');await f.start();
    f.advanceClock(6);await f.get(f.first);f.hub.tick(.04);
    assert.equal((await f.get(f.first)).pvp.duel.result,'victory');assert.equal((await f.get(f.second)).worldMode,'overworld');
    await f.method(f.first,'pvpReturn');await f.start();const original=f.member(f.first).game.capture();await f.restart();
    const restored=await f.get(f.first);assert.equal(restored.pvp.duel,null);assert.equal(restored.worldMode,'overworld');assert.equal(restored.player.hp,original.player.hp);assert.equal(restored.player.gold,original.player.gold);assert.equal(restored.inventory.rusty_blade,original.inventory.rusty_blade);assert.equal(restored.pvp.lastResult,null);
  }finally{await f.close();}
});

test('third party cannot observe arena coordinates as an overworld teammate or enter another duel',async()=>{
  const f=await fixture();try {
    const third=(await f.post(`/api/rooms/${f.first.roomCode}/join`,{playerName:'Unbeteiligt',classId:'paladin'})).data;
    await f.start();const observer=await f.get(third);assert.equal(observer.worldMode,'overworld');assert.equal(observer.player.hp,f.member(third).game.player.hp);
    assert.equal((await f.method(third,'pvpInvite',f.first.playerId)).data.accepted,false);assert.equal((await f.method(third,'pvpForfeit')).data.accepted,false);
    const observerGame=f.member(third).game,dungeon=DUNGEONS[0];observerGame.player.level=100;Object.assign(observerGame.player,dungeon.entrance);
    assert.equal((await f.method(third,'enterDungeon',dungeon.id)).data.accepted,false,'An uninvolved party member cannot move the frozen PvE world to a dungeon');
    assert.equal((await f.get(f.first)).pvp.duel.state,'active');assert.equal(f.member(f.first).game.dungeonInstance,null);
    const arena=await f.get(f.first);assert.equal(arena.party.length,2);assert.equal(arena.party.some(p=>p.id===third.playerId),false);assert.equal(f.member(f.first).game.partyGames.some(g=>g===f.member(f.second).game),false);
    assert.equal(observer.party.some(p=>p.id===f.first.playerId&&p.x===210&&p.y===320),false);
  }finally{await f.close();}
});

test('HTTP movement and projectiles obey arena pillars, while simultaneous canonical hits produce a draw',async()=>{
  const f=await fixture();try {
    await f.start();
    // Arena-only fixture positions isolate pillar collision from approach time.
    const duel=f.hub.pvp.duel(f.member(f.first)),a=duel.fighters.get(f.first.playerId),b=duel.fighters.get(f.second.playerId);
    Object.assign(a,{x:360,y:160});Object.assign(b,{x:560,y:160});
    await f.input(f.first,['d'],0);await f.step(.6);await f.input(f.first,[],0);assert.ok((await f.get(f.first)).player.x<400,'Native movement stops at the authored pillar');
    await f.action(f.first,'bolt');await f.step(1);assert.equal((await f.get(f.second)).player.hp,300,'The pillar blocks actual launched projectiles');assert.equal((await f.get(f.second)).projectiles.length,0);
    await f.step(2);Object.assign(a,{x:210,y:320,hp:36});Object.assign(b,{x:690,y:320,hp:36});
    await f.input(f.first,[],0);await f.input(f.second,[],Math.PI);await f.action(f.first,'bolt');await f.action(f.second,'bolt');await f.step(1.8);
    assert.equal((await f.get(f.first)).pvp.duel.result,'draw');assert.equal((await f.get(f.second)).pvp.duel.reason,'Gleichzeitiger Treffer');
  }finally{await f.close();}
});

test('two lost connections finish as draw and voluntary leave never destroys a saved journey',async()=>{
  const f=await fixture();try {
    await f.start();f.advanceClock(6);f.hub.tick(.04);
    assert.equal((await f.get(f.first)).pvp.lastResult.result,'draw');assert.equal((await f.get(f.second)).worldMode,'overworld');
    await f.start();const before=f.member(f.second).game.player.gold;
    const left=await f.post(`/api/session/${f.second.token}/leave`,{});assert.equal(left.status,200);
    assert.equal((await f.get(f.first)).pvp.duel.result,'victory');assert.equal(f.member(f.second).game.dead,false);assert.equal(f.member(f.second).game.player.gold,before);
    const resumed=await f.get(f.second);assert.equal(resumed.worldMode,'overworld');assert.equal(resumed.pvp.duel,null);
  }finally{await f.close();}
});

test('a third HTTP paladin cannot heal or shield frozen original duelists between simulation ticks',async()=>{
  const f=await fixture();try {
    const third=(await f.post(`/api/rooms/${f.first.roomCode}/join`,{playerName:'Heilungszeuge',classId:'paladin'})).data;
    const firstGame=f.member(f.first).game,secondGame=f.member(f.second).game,healer=f.member(third).game;
    firstGame.player.hp=20;secondGame.player.hp=35;healer.player.level=100;healer.player.skillPoints=100;
    await f.start();
    // Every following command is sent between ticks. Its _syncRoom call must
    // preserve arena exclusion before the next ability chooses its targets.
    for(const id of ['paladin_mend','paladin_consecration','paladin_aegis'])assert.equal((await f.method(third,'learnAbility',id)).data.accepted,true);
    assert.equal((await f.method(third,'setAbilityLoadout',0,'paladin_mend')).data.accepted,true);
    assert.equal((await f.method(third,'setAbilityLoadout',1,'paladin_aegis')).data.accepted,true);
    assert.deepEqual(healer.partyGames.map(game=>game.player.id),[third.playerId]);
    healer.player.mana=healer.stats().mana;healer.player.hp=healer.stats().maxHp-100;
    const beforeNative=healer.player.hp;assert.equal((await f.action(third,'bolt')).data.accepted,true);assert.ok(healer.player.hp>beforeNative,'Native heal executes on a real permitted PvE target');
    healer.player.hp=healer.stats().maxHp-100;const beforeLearned=healer.player.hp;assert.equal((await f.method(third,'useLearnedAbility',0)).data.accepted,true);assert.ok(healer.player.hp>beforeLearned,'Learned heal also executes on the permitted PvE target');
    assert.equal((await f.method(third,'useLearnedAbility',1)).data.accepted,true);assert.ok(healer.player.shield>0,'The party shield executes on the permitted PvE target');
    assert.equal(firstGame.player.hp,20);assert.equal(secondGame.player.hp,35);assert.equal(firstGame.player.shield||0,0);assert.equal(secondGame.player.shield||0,0);
    const [firstArena,secondArena]=await Promise.all([f.get(f.first),f.get(f.second)]);assert.equal(firstArena.player.hp,300);assert.equal(secondArena.player.hp,300);assert.equal(firstArena.player.shield||0,0);assert.equal(secondArena.player.shield||0,0);
  }finally{await f.close();}
});

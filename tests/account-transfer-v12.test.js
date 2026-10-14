import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { WORLD_BOONS } from '../src/interactions.js';

const credentials={username:'TransferProbe',password:'test-only-transfer-password',playerName:'Reiseheld',classId:'guardian'};
async function fixture(options={}){
  const values=new Map();let fail=false,writes=0;
  const storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(fail)throw new Error('test disk full');values.set(key,value);writes++;}};
  const createGame=()=>{const game=new Game({storage:null});game.world.enemies=[];game.world.structures=[];game.world.trees=[];game.world.rocks=[];return game;};
  const hub=new MultiplayerHub({createGame,storage,autoStart:false,...options}),server=http.createServer(async(req,res)=>{const handling=hub.handle(req,res);server.emit('test-request',req.url);if(!await handling)res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(route,body,cookie='')=>{const response=await fetch(base+route,{headers:{Cookie:cookie,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  const registered=await request('/api/account/register',credentials);assert.equal(registered.status,201);const cookie=registered.cookie,member=hub.accountMembers.get(registered.data.account.id);
  return {hub,server,base,request,cookie,member,get writes(){return writes;},setFail:value=>{fail=value;},async close(){fail=false;hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},async pendingCommand(route='/api/account/play/command'){
    const reached=once(server,'test-request');let responseResolve;const response=new Promise(resolve=>{responseResolve=resolve;});
    const req=http.request(base+route,{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','X-Emberfall-Player-Id':member.id}},res=>{let text='';res.on('data',chunk=>text+=chunk);res.on('end',()=>responseResolve({status:res.statusCode,data:JSON.parse(text)}));});
    req.write('{"type":"input",');await reached;
    return {finish(){req.end('"keys":["w"],"angle":0}');return response;}};
  }};
}

test('join, group creation and leave preserve one server character, equipment, skills, XP and cooldowns',async()=>{
  const f=await fixture();try{
    const firstId=f.member.id,originalHome=f.member.room.code;f.member.game.gainXp(2000);assert.equal(f.member.game.learnAbility('guardian_bulwark'),true);f.member.game.player.gold=987;f.member.game.resources.wood=23;f.member.game.cooldowns['ability:guardian_bulwark']=4;
    const expected=f.member.game.capture(),guest=await f.request('/api/rooms',{name:'Freunde',playerName:'Gruppenleiter'}),target=f.hub.rooms.get(guest.data.roomCode),originalWorld=target.world;
    const joined=await f.request(`/api/account/rooms/${target.code}/join`,{},f.cookie);assert.equal(joined.status,200);assert.equal(joined.data.accountOwned,true);assert.equal(joined.data.privateWorld,false);assert.equal(joined.data.token,undefined);assert.equal(joined.data.playerId,firstId);
    assert.equal(f.member.game.player.level,expected.player.level);assert.equal(f.member.game.player.gold,987);assert.equal(f.member.game.resources.wood,23);assert.equal(f.member.game.learnedAbilities.guardian_bulwark,true);assert.deepEqual(f.member.game.equipment,expected.equipment);assert.equal(f.member.game.cooldowns['ability:guardian_bulwark'],4);
    assert.equal(target.world,originalWorld,'Joining cannot overwrite the existing shared world');assert.equal(f.hub.rooms.has(originalHome),false);assert.equal(target.members.size,2);
    const created=await f.request('/api/account/rooms',{name:'Neue Freunde'},f.cookie);assert.equal(created.status,201);assert.equal(created.data.playerId,firstId);assert.equal(created.data.privateWorld,false);assert.equal(target.members.size,1);assert.notEqual(f.member.game.world,originalWorld,'Two rooms must not simulate the same world reference');
    const publicCode=f.member.room.code,solo=await f.request('/api/account/play/leave',{},f.cookie);assert.equal(solo.status,200);assert.equal(solo.data.privateWorld,true);assert.equal(solo.data.snapshot.privateWorld,true);assert.equal(solo.data.playerId,firstId);assert.equal(solo.data.snapshot.player.gold,987);assert.equal(f.hub.rooms.has(publicCode),false,'Empty public rooms do not exhaust saved-room capacity');
    assert.equal([...f.hub.rooms.values()].flatMap(r=>[...r.members.values()]).filter(m=>m.id===firstId).length,1);assert.equal(f.hub.accountMembers.size,1);
    assert.equal((await f.request('/api/rooms')).data.rooms.some(r=>r.code===f.member.room.code),false);
  }finally{await f.close();}
});

test('group transfer rebases buffs and protection to the destination clock without refreshing their remaining time',async()=>{
  const f=await fixture();try{
    const game=f.member.game,boonId=Object.keys(WORLD_BOONS)[0];game.time=1200;f.member.room.time=1200;game.addWorldBoon(boonId,1230);game.player.shield=8;game.player.shieldUntil=1210;game.player.slowUntil=1201;game.cooldowns.bolt=4;game.damageGrace.set('old-source',1200.3);game.restoreLeechCredit(.4);
    const guest=await f.request('/api/rooms',{playerName:'Junge Welt'}),room=f.hub.rooms.get(guest.data.roomCode);room.time=5;room.members.values().next().value.game.time=5;
    const before=f.writes,result=await f.request(`/api/account/rooms/${room.code}/join`,{},f.cookie);assert.equal(result.status,200);assert.equal(f.writes,before+1,'The transfer persists one coherent membership and credential snapshot');
    assert.equal(game.time,5);assert.equal(game.buffs[0].expiresAt-game.time,30);assert.equal(game.player.shieldUntil-game.time,10);assert.equal(game.player.slowUntil-game.time,1);assert.equal(game.cooldowns.bolt,4);assert.ok(Math.abs(game.damageGrace.get('old-source')-game.time-.3)<1e-9);assert.ok(Math.abs(game.currentLeechCredit()-.4)<1e-9);
  }finally{await f.close();}
});

test('full groups, private codes, combat, death and dungeons reject transfers without losing existing progression',async()=>{
  const f=await fixture({maxPlayers:2});try{
    const source=f.member.room,first=await f.request('/api/rooms',{playerName:'Erster'}),code=first.data.roomCode;
    assert.equal((await f.request(`/api/rooms/${code}/join`,{playerName:'Zweiter'})).status,201);
    f.member.game.player.gold=556;assert.equal((await f.request(`/api/account/rooms/${code}/join`,{},f.cookie)).status,409);assert.equal(f.member.room,source);assert.equal(f.member.game.player.gold,556);
    const other=await f.request('/api/account/register',{...credentials,username:'private_friend'});assert.equal((await f.request(`/api/account/rooms/${other.data.roomCode}/join`,{},f.cookie)).status,404);assert.equal((await f.request(`/api/rooms/${source.code}/join`,{})).status,404);
    const guest=await f.request('/api/rooms',{playerName:'Freier Platz'}),route=`/api/account/rooms/${guest.data.roomCode}/join`;
    f.member.game.player.lastDamageAt=f.member.game.time;assert.equal((await f.request(route,{},f.cookie)).status,409);delete f.member.game.player.lastDamageAt;
    f.member.game.dead=true;assert.equal((await f.request(route,{},f.cookie)).status,409);f.member.game.dead=false;
    f.member.game.dungeonInstance={id:'test-in-progress'};assert.equal((await f.request(route,{},f.cookie)).status,409);f.member.game.dungeonInstance=null;
    const original=f.hub.pvp.occupied;f.hub.pvp.occupied=member=>member===f.member;assert.equal((await f.request(route,{},f.cookie)).status,409);f.hub.pvp.occupied=original;
    assert.equal(f.member.room,source);assert.equal(f.member.game.player.gold,556);
  }finally{f.member.game.dungeonInstance=null;await f.close();}
});

test('disk failure rolls back both rosters, source world, auth ownership, timers and movement state',async()=>{
  const f=await fixture();try{
    const guest=await f.request('/api/rooms',{playerName:'Zielgruppe'}),target=f.hub.rooms.get(guest.data.roomCode),source=f.member.room,sourceWorld=source.world,targetWorld=target.world,token=f.member.token,version=f.member.membershipVersion;
    f.member.game.player.gold=414;f.member.game.keys.add('w');const player=f.member.game.player;
    f.setFail(true);const result=await f.request(`/api/account/rooms/${target.code}/join`,{},f.cookie);assert.equal(result.status,503);assert.equal(f.member.room,source);assert.equal(source.members.get(f.member.id),f.member);assert.equal(target.members.has(f.member.id),false);assert.equal(f.member.game.player,player);assert.equal(f.member.game.player.gold,414);assert.equal(f.member.game.world,sourceWorld);assert.equal(target.world,targetWorld);assert.equal(f.member.token,token);assert.equal(f.member.membershipVersion,version);assert.equal(f.hub.sessions.get(token),f.member);assert.equal(f.member.game.keys.has('w'),true);assert.equal(f.hub.rooms.has(source.code),true);
    f.setFail(false);assert.equal((await f.request(`/api/account/rooms/${target.code}/join`,{},f.cookie)).status,200);
  }finally{await f.close();}
});

test('late command bodies cannot reactivate a logged-out account or command a different group after transfer',async()=>{
  const f=await fixture();try{
    const first=f.member.room,guest=await f.request('/api/rooms',{playerName:'Neues Ziel'}),pending=await f.pendingCommand();
    assert.equal((await f.request(`/api/account/rooms/${guest.data.roomCode}/join`,{},f.cookie)).status,200);
    assert.equal((await pending.finish()).status,409);assert.equal(f.member.game.keys.size,0);assert.notEqual(f.member.room,first);
    const late=await f.pendingCommand();assert.equal((await f.request('/api/account/logout',{},f.cookie)).status,200);assert.equal((await late.finish()).status,401);assert.equal(f.member.active,false);assert.equal(f.member.game.keys.size,0);
  }finally{await f.close();}
});

test('private dormant accounts do not consume public saved-room quota but active worlds retain their cap',async()=>{
  const f=await fixture({maxRooms:1,maxSavedRooms:1});try{
    const guest=await f.request('/api/rooms',{playerName:'Bestehende Gruppe'});assert.equal(guest.status,201);
    assert.equal((await f.request('/api/account/register',{...credentials,username:'second_home'})).status,201);assert.equal(f.hub._publicRoomCount(),1);assert.equal(f.hub.rooms.size,3);
    assert.equal((await f.request('/api/account/play',{},f.cookie)).status,503);assert.equal(f.member.active,false);
    assert.equal((await f.request(`/api/account/rooms/${guest.data.roomCode}/join`,{},f.cookie)).status,200);assert.equal(f.hub._activeRoomCount(),1);
    assert.equal((await f.request('/api/account/rooms',{name:'Zu viele Gruppen'},f.cookie)).status,503);assert.equal(f.hub._activeRoomCount(),1);assert.equal(f.member.room.code,guest.data.roomCode);
  }finally{await f.close();}
});

test('a group departure removes only that actor’s delayed attacks and retains cooldowns and other players’ effects',async()=>{
  const f=await fixture();try{
    const guest=await f.request('/api/rooms',{playerName:'Bleibender Held'}),source=f.hub.rooms.get(guest.data.roomCode);assert.equal((await f.request(`/api/account/rooms/${source.code}/join`,{},f.cookie)).status,200);
    const leader=source.members.values().next().value.game,otherId=leader.player.id;
    for(const key of ['projectiles','hazards','summons'])leader[key]=[{actorId:f.member.id,life:3},{actorId:otherId,life:3}];f.hub._syncRoom(source,leader);f.member.game.cooldowns.bolt=4;
    assert.equal((await f.request('/api/account/play/leave',{},f.cookie)).status,200);
    for(const key of ['projectiles','hazards','summons']){assert.deepEqual(leader[key].map(effect=>effect.actorId),[otherId]);assert.equal(f.member.game[key].some(effect=>effect.actorId===f.member.id),false);}
    assert.equal(f.member.game.cooldowns.bolt,4);
  }finally{await f.close();}
});

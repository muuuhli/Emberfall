import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';

const memoryStorage=()=>{
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
};

// Exercise the real HTTP handler without sockets or production storage. The
// response models Node's close event so SSE slot ownership is also exercised.
class Response extends EventEmitter {
  constructor(){super();this.headers={};this.body='';this.writableLength=0;this.writeHeadHistory=[];this.headersSent=false;this.writableEnded=false;}
  setHeader(name,value){this.headers[name.toLowerCase()]=value;}
  writeHead(status,headers={}){this.status=status;this.writeHeadHistory.push({status,headers});for(const [name,value]of Object.entries(headers))this.setHeader(name,value);this.headersSent=true;return this;}
  write(body){this.body+=body;return true;}
  end(body=''){if(this.writableEnded)return this;this.body+=body;this.writableEnded=true;this.emit('close');return this;}
}

function fixture(options={}){
  let now=1000;
  const hub=new MultiplayerHub({createGame:()=>new Game({storage:null,random:()=>.5}),autoStart:false,clock:()=>now,...options});
  const request=async(route,body,{address='198.51.100.10',headers={}}={})=>{
    const response=new Response(),request={
      method:body===undefined?'GET':'POST',url:route,
      headers:{host:'game.example.test',...(body===undefined?{}:{'content-type':'application/json'}),...headers},
      socket:{remoteAddress:address},
      async *[Symbol.asyncIterator](){if(body!==undefined)yield Buffer.from(JSON.stringify(body));},
    };
    assert.equal(await hub.handle(request,response),true);
    let data;try{data=JSON.parse(response.body);}catch{}
    return {status:response.status,data,response};
  };
  const create=(options={})=>request('/api/rooms',{playerName:'Reisender',classId:'guardian'},options);
  const join=(room,options={})=>request(`/api/rooms/${room}/join`,{playerName:'Gefährte',classId:'druid'},options);
  const leave=token=>request(`/api/session/${token}/leave`,{});
  return {hub,request,create,join,leave,advance:milliseconds=>{now+=milliseconds;},close:()=>hub.dispose()};
}

test('new group creation and joins share the socket-IP minute limit while saved token resume remains available',async()=>{
  const f=fixture();
  try{
    const first=await f.create();assert.equal(first.status,201);
    const tokens=[first.data.token];
    f.hub.sessions.get(first.data.token).game.player.gold=713;
    for(let count=1;count<10;count++){
      const joined=await f.join(first.data.roomCode);assert.equal(joined.status,201);tokens.push(joined.data.token);
      assert.equal((await f.leave(joined.data.token)).status,200);
    }
    assert.equal((await f.join(first.data.roomCode)).status,429);
    const denied=await f.create();assert.equal(denied.status,429);assert.equal(denied.data.error,'Zu viele neue Gruppensitzungen.');
    assert.equal(f.hub.rooms.get(first.data.roomCode).members.size,10);
    await f.leave(first.data.token);
    const resumed=await f.request(`/api/session/${first.data.token}`);assert.equal(resumed.status,200);assert.equal(resumed.data.player.gold,713);
    f.advance(60001);
    assert.equal((await f.join(first.data.roomCode)).status,201);
    assert.ok(tokens.every(token=>f.hub.sessions.has(token)),'Admission limits never erase an earlier character');
  }finally{f.close();}
});

test('another socket IP gets its own admission window and forwarded client headers cannot bypass a used window',async()=>{
  const f=fixture();
  try{
    const first=await f.create();assert.equal(first.status,201);
    for(let count=1;count<10;count++){
      const joined=await f.join(first.data.roomCode);assert.equal(joined.status,201);await f.leave(joined.data.token);
    }
    const spoofed=await f.join(first.data.roomCode,{headers:{'x-forwarded-for':'203.0.113.91','x-real-ip':'203.0.113.92',forwarded:'for=203.0.113.93'}});
    assert.equal(spoofed.status,429);
    assert.equal((await f.join(first.data.roomCode,{address:'198.51.100.11'})).status,201);
    assert.equal(f.hub.creations.size,2);
    const unauthorized=await f.create({address:'198.51.100.12',headers:{origin:'https://attacker.example.test','x-forwarded-host':'game.example.test'}});
    assert.equal(unauthorized.status,403);assert.equal(f.hub.creations.has('198.51.100.12'),false);
  }finally{f.close();}
});

test('a retained-character ceiling rejects new joins without deleting departed progress or blocking token resume',async()=>{
  const f=fixture({maxSavedCharactersPerRoom:3});
  try{
    const first=await f.create();assert.equal(first.status,201);const tokens=[first.data.token];
    await f.leave(first.data.token);
    for(let count=0;count<2;count++){
      const joined=await f.join(first.data.roomCode);assert.equal(joined.status,201);tokens.push(joined.data.token);
      f.hub.sessions.get(joined.data.token).game.player.gold=500+count;await f.leave(joined.data.token);
    }
    const denied=await f.join(first.data.roomCode);assert.equal(denied.status,409);assert.match(denied.data.error,/keine weiteren Charaktere/);
    const room=f.hub.rooms.get(first.data.roomCode);assert.equal(room.members.size,3);assert.equal(f.hub.sessions.size,3);
    const resumed=await f.request(`/api/session/${tokens[2]}`);assert.equal(resumed.status,200);assert.equal(resumed.data.player.gold,501);
  }finally{f.close();}
});

test('dormant saved rooms remain bounded even when active group slots are free',async()=>{
  const f=fixture({maxSavedRooms:2,maxRooms:1});
  try{
    const first=await f.create();assert.equal(first.status,201);await f.leave(first.data.token);
    const second=await f.create();assert.equal(second.status,201);await f.leave(second.data.token);
    const denied=await f.create();assert.equal(denied.status,503);assert.match(denied.data.error,/keine weiteren Gruppen speichern/);
    assert.equal(f.hub.rooms.size,2);assert.equal(f.hub.sessions.size,2);
    assert.equal((await f.request(`/api/session/${first.data.token}`)).status,200);
    const thirdCharacter=await f.join(first.data.roomCode);assert.equal(thirdCharacter.status,201,'The room ceiling does not prohibit new characters in an existing active room');
    assert.equal(f.hub.rooms.size,2);
  }finally{f.close();}
});

test('new joins cannot reactivate another dormant group after active room capacity is reached',async()=>{
  const f=fixture({maxRooms:1});
  try{
    const first=await f.create();assert.equal(first.status,201);await f.leave(first.data.token);
    const second=await f.create();assert.equal(second.status,201);
    const denied=await f.join(first.data.roomCode);assert.equal(denied.status,503);assert.match(denied.data.error,/Gruppenplätze/);
    assert.equal(f.hub.rooms.get(first.data.roomCode).members.size,1);
    assert.equal((await f.create()).status,503);
    const existing=await f.request(`/api/session/${first.data.token}`);assert.equal(existing.status,200,'Existing personal resume tokens are not rejected by new-admission limits');
  }finally{f.close();}
});

test('restore keeps every earlier room and character above new ceilings and preserves active-player resume rules',async()=>{
  const storage=memoryStorage(),original=fixture({storage,maxPlayers:2});let restored;
  try{
    const first=await original.create();assert.equal(first.status,201);
    const second=await original.join(first.data.roomCode);assert.equal(second.status,201);await original.leave(first.data.token);
    const third=await original.join(first.data.roomCode);assert.equal(third.status,201);original.hub.sessions.get(third.data.token).game.player.gold=919;
    await original.leave(second.data.token);await original.leave(third.data.token);
    const otherRooms=[];
    for(let count=0;count<2;count++){const other=await original.create();assert.equal(other.status,201);otherRooms.push(other.data);await original.leave(other.data.token);}
    original.hub.persist();
    restored=fixture({storage,strictRestore:true,maxPlayers:2,maxSavedRooms:1,maxSavedCharactersPerRoom:1});
    assert.equal(restored.hub.rooms.size,3);assert.equal(restored.hub.sessions.size,5);assert.equal(restored.hub.rooms.get(first.data.roomCode).members.size,3);
    assert.equal((await restored.create()).status,503);assert.equal((await restored.join(first.data.roomCode)).status,409);
    assert.equal((await restored.request(`/api/session/${first.data.token}`)).status,200);
    assert.equal((await restored.request(`/api/session/${second.data.token}`)).status,200);
    assert.equal((await restored.request(`/api/session/${third.data.token}`)).status,409,'The preexisting active-player ceiling remains enforced');
    assert.equal(restored.hub.sessions.get(third.data.token).active,false);
    await restored.leave(first.data.token);
    const resumed=await restored.request(`/api/session/${third.data.token}`);assert.equal(resumed.status,200);assert.equal(resumed.data.player.gold,919);
    for(const room of otherRooms)assert.equal((await restored.request(`/api/session/${room.token}`)).status,200);
    assert.equal(restored.hub.rooms.size,3);assert.equal(restored.hub.sessions.size,5);
    restored.hub.persist();const saved=JSON.parse(storage.getItem('emberfall.multiplayer.v1'));assert.equal(saved.rooms.length,3);assert.equal(saved.rooms.reduce((sum,room)=>sum+room.members.length,0),5);
  }finally{restored?.close();original.close();}
});

test('four SSE streams per token are accepted and the next is rejected before activation or snapshot headers',async()=>{
  const f=fixture();
  try{
    const first=await f.create();assert.equal(first.status,201);const member=f.hub.sessions.get(first.data.token);
    let snapshots=0;const snapshot=f.hub.snapshot.bind(f.hub);f.hub.snapshot=(...args)=>{snapshots++;return snapshot(...args);};
    const streams=[];
    for(let count=0;count<4;count++){const stream=await f.request(`/api/session/${first.data.token}/events?deltas=1`);assert.equal(stream.status,200);streams.push(stream.response);}
    assert.equal(member.streams.size,4);assert.equal(snapshots,4);
    member.active=false;member.lastSeen=123;
    const denied=await f.request(`/api/session/${first.data.token}/events?deltas=1`);
    assert.equal(denied.status,429);assert.match(denied.data.error,/Gruppenverbindungen/);
    assert.equal(member.active,false);assert.equal(member.lastSeen,123);assert.equal(snapshots,4);
    assert.deepEqual(denied.response.writeHeadHistory.map(entry=>entry.status),[429]);
    assert.equal(denied.response.headers['content-type'],'application/json; charset=utf-8');assert.ok(!denied.response.body.includes('event: snapshot'));
    streams[0].end();assert.equal(member.streams.size,3);
    const replacement=await f.request(`/api/session/${first.data.token}/events?deltas=1`);assert.equal(replacement.status,200);assert.equal(member.active,true);assert.equal(member.streams.size,4);assert.equal(snapshots,5);
  }finally{f.close();}
});

test('SSE stream limits belong to each token and close or leave frees all owned slots',async()=>{
  const f=fixture({maxSessionStreams:2});
  try{
    const first=await f.create(),second=await f.join(first.data.roomCode);assert.equal(second.status,201);
    const firstStreams=[];
    for(const session of [first.data,second.data])for(let count=0;count<2;count++){
      const stream=await f.request(`/api/session/${session.token}/events`);assert.equal(stream.status,200);if(session.token===first.data.token)firstStreams.push(stream.response);
    }
    assert.equal((await f.request(`/api/session/${first.data.token}/events`)).status,429);
    assert.equal(f.hub.sessions.get(second.data.token).streams.size,2);
    firstStreams[0].end();assert.equal(f.hub.sessions.get(first.data.token).streams.size,1);
    assert.equal((await f.request(`/api/session/${first.data.token}/events`)).status,200);
    await f.leave(first.data.token);assert.equal(f.hub.sessions.get(first.data.token).streams.size,0);
    assert.equal((await f.request(`/api/session/${first.data.token}/events`)).status,200);
    assert.equal(f.hub.sessions.get(second.data.token).streams.size,2);
  }finally{f.close();}
});

test('resource-limit options cannot disable admission bounds through zero, fractions or oversized values',()=>{
  for(const options of [{maxSavedRooms:0},{maxSavedRooms:33},{maxSavedCharactersPerRoom:0},{maxSavedCharactersPerRoom:65},{maxSavedCharactersPerRoom:1.5},{maxSessionStreams:0},{maxSessionStreams:5},{maxSessionStreams:Infinity}])assert.throws(()=>new MultiplayerHub({autoStart:false,...options}),RangeError);
});

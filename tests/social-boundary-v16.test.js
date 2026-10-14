import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { createServerGameFactory } from '../server/game-factory.mjs';
import { validateRoomStorage } from '../server/validate-storage.mjs';

const STORE_KEY='emberfall.multiplayer.v1',TTL=30*24*60*60*1000;
const emptySocial=()=>({version:1,friendships:[],requests:[],blocks:[],guilds:[]});
const copy=value=>structuredClone(value);

/** This fixture uses native character creation and cookie hashing. Credential
 * bytes are synthetic; it does not claim to exercise registration or KDFs. */
async function fixture({maxSessions=8}={}) {
  const values=new Map();let failed=false,now=100000;
  const storage={getItem:key=>values.get(key)||null,setItem(key,value){if(failed)throw new Error('Isolated social storage failure');values.set(key,value);}};
  const factory=createServerGameFactory(),createGame=options=>{const game=factory(options);game.world.enemies=[];return game;};
  const hub=new MultiplayerHub({createGame,storage,autoStart:false,clock:()=>now,accountOptions:{maxSessions}});
  const accounts={};
  for(const label of ['a','b','c']) {
    const account={id:randomUUID(),username:`social_boundary_${label}`,createdAt:now,memberId:null,password:{algorithm:'scrypt',N:32768,r:8,p:3,...hub.accounts.dummy}};
    hub.accounts.add(account);
    const room={code:hub._code(),name:'Persönliche Reise',accountHome:true,accountOwnerId:account.id,createdAt:now,lastActive:now,time:0,members:new Map(),world:null};
    hub.rooms.set(room.code,room);
    const member=hub._createMember(room,{playerName:`Boundary ${label.toUpperCase()}`,classId:'guardian'},account.id);
    member.active=false;account.memberId=member.id;
    const issued=hub.accounts.issue(account);
    accounts[label]={account,member,cookie:hub.accounts.cookie(issued.token).split(';')[0],sessionKey:issued.key};
  }
  assert.equal(hub.persist(),true);
  const server=http.createServer(async(req,res)=>{const handling=hub.handle(req,res);server.emit('boundary-request',req.url);if(!await handling)res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,streams=new Set();
  const headers=actor=>({Cookie:actor.cookie,'X-Emberfall-Account-Id':actor.account.id,'X-Emberfall-Player-Id':actor.member.id});
  async function request(route,body,actor=accounts.a,extraHeaders={}) {
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{...(actor?headers(actor):{}),...extraHeaders,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(5000)});
    return{status:response.status,data:await response.json()};
  }
  async function eventStream(route,actor) {
    const controller=new AbortController();
    const response=await fetch(base+route,{headers:headers(actor),signal:controller.signal});
    if(response.status!==200){controller.abort();return{status:response.status};}
    const stream={status:response.status,frames:[],done:false,abort:()=>controller.abort()},reader=response.body.getReader();streams.add(stream);
    stream.reading=(async()=>{
      let buffer='';const decoder=new TextDecoder();
      try{for(;;){const next=await reader.read();if(next.done)break;buffer+=decoder.decode(next.value,{stream:true});let boundary;while((boundary=buffer.indexOf('\n\n'))>=0){const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);const line=frame.split('\n').find(line=>line.startsWith('data: '));if(line)stream.frames.push(JSON.parse(line.slice(6)));}}}
      catch(error){if(error.name!=='AbortError')throw error;}
      finally{stream.done=true;streams.delete(stream);}
    })();
    await until(()=>stream.frames.length>0||stream.done,'initial native SSE frame');
    return stream;
  }
  const socialStream=(actor=accounts.a,{accountId=actor.account.id,playerId=actor.member.id}={})=>eventStream(`/api/account/social/events?${new URLSearchParams({accountId,playerId})}`,actor);
  const gameStream=actor=>eventStream(`/api/account/play/events?${new URLSearchParams({playerId:actor.member.id})}`,actor);
  return{hub,accounts,createGame,request,socialStream,gameStream,headers,base,server,storage,
    action:(actor,action,data={})=>request('/api/account/social',{action,...data},actor),
    get raw(){return values.get(STORE_KEY);},get now(){return now;},fail:value=>{failed=value;},
    pulse(){now+=1100;hub.tick(0);hub._flushSocial();},expire(){now+=TTL+1;hub.tick(0);hub._flushSocial();},
    async pending(actor,bodyStart){
      const reached=once(server,'boundary-request');let resolve,reject;
      const result=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const req=http.request(base+'/api/account/social',{method:'POST',headers:{...headers(actor),'Content-Type':'application/json'}},res=>{let text='';res.on('data',chunk=>{text+=chunk;});res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text)}));});
      req.on('error',reject);req.write(bodyStart);await reached;
      return{finish(bodyEnd){req.end(bodyEnd);return result;}};
    },
    async close(){failed=false;for(const stream of [...streams])stream.abort();hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));},
  };
}
async function until(predicate,label){for(let attempt=0;attempt<80;attempt++){if(predicate())return;await delay(10);}assert.fail(`Timed out waiting for ${label}`);}
const ok=async promise=>{const result=await promise;assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.ok,true);return result.data.snapshot;};
async function friends(f){await ok(f.action(f.accounts.a,'friend_request',{username:f.accounts.b.account.username}));await ok(f.action(f.accounts.b,'friend_accept',{accountId:f.accounts.a.account.id}));}
async function guild(f){await ok(f.action(f.accounts.a,'guild_create',{guildName:'Boundary Guild'}));await ok(f.action(f.accounts.a,'guild_invite',{username:f.accounts.b.account.username}));const invited=(await f.request('/api/account/social',undefined,f.accounts.b)).data.guildInvites[0];await ok(f.action(f.accounts.b,'guild_accept',{guildId:invited.guildId}));return invited.guildId;}

test('a genuine legacy authority checkpoint migrates with empty social state and unchanged account journeys',async()=>{
  const f=await fixture();try{
    const original=f.raw,checkpoint=JSON.parse(original);delete checkpoint.social;
    const before=checkpoint.rooms.flatMap(room=>room.members);
    const outer=JSON.stringify({[STORE_KEY]:JSON.stringify(checkpoint)}),restored=validateRoomStorage(outer,{createGame:f.createGame,clock:()=>f.now});
    assert.deepEqual(restored.social.capture(),emptySocial());
    assert.equal(restored.accounts.records.size,3);
    for(const source of before){
      const member=restored.accountMembers.get(source.accountId),saved=member.game.capture();
      assert.equal(member.id,source.id);assert.equal(member.game.classId,source.classId);
      for(const field of ['name','level','xp','gold','hp','mana','x','y'])assert.deepEqual(saved.player[field],source.save.player[field],field);
      for(const field of ['resources','inventory','equipment','generatedItems','learnedAbilities','professions','professionTraining','questState','flags','stash','loadouts'])assert.deepEqual(saved[field],source.save[field],field);
    }
    assert.equal(restored.persist(),false,'The compatibility validator cannot write back a migration');
    assert.equal(f.raw,original,'No original checkpoint write occurs during validation');
  }finally{await f.close();}
});

test('the real strict validator rejects malformed social data and inconsistent account relationships',async()=>{
  const f=await fixture();try{
    const checkpoint=JSON.parse(f.raw),[a,b,c]=Object.values(f.accounts).map(actor=>actor.account.id),pair=[a,b].sort();
    const guildRecord={id:randomUUID(),name:'Strict Guild',createdAt:f.now,leaderId:a,members:[{accountId:a,role:'leader'},{accountId:b,role:'member'}],invites:[],messages:[]};
    const bad=[null,[],{...emptySocial(),version:2},
      {...emptySocial(),friendships:[[a,a]]},
      {...emptySocial(),friendships:[pair,pair]},
      {...emptySocial(),friendships:[[a,'missing-account'].sort()]},
      {...emptySocial(),friendships:[pair],blocks:[{from:b,to:a}]},
      {...emptySocial(),requests:[{from:a,to:b,createdAt:f.now},{from:b,to:a,createdAt:f.now}]},
      {...emptySocial(),requests:[{from:a,to:'missing-account',createdAt:f.now}]},
      {...emptySocial(),guilds:[{...guildRecord,leaderId:c}]},
      {...emptySocial(),guilds:[{...guildRecord,members:[{accountId:a,role:'leader'},{accountId:b,role:'leader'}]}]},
      {...emptySocial(),guilds:[guildRecord,{...guildRecord,id:randomUUID(),name:'Other Guild',leaderId:b,members:[{accountId:b,role:'leader'}]}]},
      {...emptySocial(),guilds:[{...guildRecord,messages:[{id:randomUUID(),accountId:'missing-account',playerName:'Missing',text:'private fixture',createdAt:f.now}]}]},
    ];
    for(const social of bad){const raw=JSON.stringify({[STORE_KEY]:JSON.stringify({...checkpoint,social})});assert.throws(()=>validateRoomStorage(raw,{createGame:f.createGame,clock:()=>f.now}),undefined,JSON.stringify(social));}
    const valid={...emptySocial(),guilds:[{...guildRecord,messages:[{id:randomUUID(),accountId:c,playerName:'Former member',text:'Historical message',createdAt:f.now}]}]};
    const restored=validateRoomStorage(JSON.stringify({[STORE_KEY]:JSON.stringify({...checkpoint,social:valid})}),{createGame:f.createGame,clock:()=>f.now});
    assert.deepEqual(restored.social.capture(),valid,'Historical authors may leave a guild without destroying its valid history');
  }finally{await f.close();}
});

test('save failures roll social mutations back and cannot publish uncommitted friend, guild or chat data',async()=>{
  const f=await fixture();try{
    const a=f.accounts.a,b=f.accounts.b,stream=await f.socialStream(a);
    const rejects=async(actor,action,data)=>{const social=copy(f.hub.social.capture()),raw=f.raw,start=stream.frames.length;f.fail(true);try{const result=await f.action(actor,action,data);assert.equal(result.status,503,JSON.stringify(result.data));assert.deepEqual(f.hub.social.capture(),social);assert.equal(f.raw,raw);f.pulse();await delay(30);const expected=(await f.request('/api/account/social',undefined,a)).data;for(const frame of stream.frames.slice(start))assert.deepEqual(frame,expected,'SSE may never expose the rolled-back mutation');}finally{f.fail(false);}};
    await rejects(a,'friend_request',{username:b.account.username});
    await ok(f.action(a,'friend_request',{username:b.account.username}));
    await rejects(b,'friend_accept',{accountId:a.account.id});
    await ok(f.action(b,'friend_accept',{accountId:a.account.id}));
    await rejects(a,'guild_create',{guildName:'Failed Guild'});
    await guild(f);
    await rejects(a,'guild_chat',{text:'This must not become visible'});
    await rejects(a,'guild_transfer',{accountId:b.account.id});
    await rejects(a,'block',{accountId:b.account.id});
    assert.equal((await f.request('/api/account/social',undefined,b)).data.guild.role,'member');
  }finally{await f.close();}
});

test('social streams are session-bound and logout, session eviction and expiry close only unauthorized streams',async()=>{
  const f=await fixture({maxSessions:2});try{
    const a=f.accounts.a,b=f.accounts.b,first=await f.socialStream(a),issued=f.hub.accounts.issue(a.account);
    const secondActor={...a,cookie:f.hub.accounts.cookie(issued.token).split(';')[0]},second=await f.socialStream(secondActor),other=await f.socialStream(b);
    assert.equal((await f.socialStream(secondActor)).status,429,'The social stream limit is account-wide, across devices');
    assert.equal((await f.request('/api/account/logout',{},a)).status,200);
    await until(()=>first.done,'logged-out social stream end');assert.equal(second.done,false);assert.equal(other.done,false);
    assert.equal((await f.request('/api/account/social',undefined,a)).status,401);
    const third=f.hub.accounts.issue(a.account),thirdActor={...a,cookie:f.hub.accounts.cookie(third.token).split(';')[0]};
    const thirdStream=await f.socialStream(thirdActor);f.hub.accounts.issue(a.account);f.pulse();
    await until(()=>second.done,'evicted session social stream end');assert.equal(thirdStream.done,false);assert.equal(other.done,false);
    f.expire();await until(()=>thirdStream.done&&other.done,'expired social stream end');
    assert.equal((await f.request('/api/account/social',undefined,thirdActor)).status,401);assert.equal(f.hub.accounts.records.size,3);
    assert.equal(f.hub.accountMembers.get(a.account.id).id,a.member.id,'Stream revocation retains the authoritative character');
  }finally{await f.close();}
});

test('social requests bind the account identity, reject owner metadata and recheck logout after a delayed body',async()=>{
  const f=await fixture();try{
    const a=f.accounts.a,b=f.accounts.b,initial=copy(f.hub.social.capture());
    assert.equal((await f.request('/api/account/social',undefined,null)).status,401);
    assert.equal((await f.request('/api/account/social',{action:'friend_request',username:b.account.username},a,{'X-Emberfall-Account-Id':b.account.id})).status,409);
    assert.equal((await f.socialStream(a,{accountId:b.account.id})).status,409);
    assert.equal((await f.socialStream(a,{playerId:b.member.id})).status,409);
    for(const body of [null,[],{action:'friend_request',username:b.account.username,ownerId:b.account.id},{action:'friend_request',username:b.account.username,accountId:a.account.id},{action:'guild_create',guildName:'Guild',leaderId:b.account.id}])assert.equal((await f.request('/api/account/social',body,a)).status,400);
    const pending=await f.pending(a,'{"action":"friend_request",');
    assert.equal((await f.request('/api/account/logout',{},a)).status,200);
    assert.equal((await pending.finish(`"username":${JSON.stringify(b.account.username)}}`)).status,401);
    assert.deepEqual(f.hub.social.capture(),initial);
  }finally{await f.close();}
});

test('a contact join never exposes a private room and retains the one native actor on join or save failure',async()=>{
  const f=await fixture();try{
    const a=f.accounts.a,b=f.accounts.b,c=f.accounts.c;
    const stranger=await f.request('/api/account/social/join',{accountId:b.account.id},c);assert.ok([403,404].includes(stranger.status));
    await friends(f);
    const privateView=(await f.request('/api/account/social',undefined,a)).data,contact=privateView.friends[0];assert.equal(contact.canJoin,false);
    assert.ok(!JSON.stringify(privateView).includes(b.member.room.code),'A contact snapshot must not disclose a private room invitation code');
    assert.ok([403,404,409].includes((await f.request('/api/account/social/join',{accountId:b.account.id},a)).status));
    assert.equal((await f.request('/api/account/rooms',{name:'Contact Group'},b)).status,201);
    assert.equal((await f.request('/api/account/social',undefined,a)).data.friends[0].canJoin,false,'A public party without a live game stream is not a connected contact');
    assert.ok([403,404,409].includes((await f.request('/api/account/social/join',{accountId:b.account.id},a)).status),'An offline contact cannot be joined');
    const connected=await f.gameStream(b);assert.equal(connected.status,200);assert.ok(b.member.streams.size>0,'The target has an actual authenticated game SSE');
    assert.equal((await f.request('/api/account/social',undefined,a)).data.friends[0].canJoin,true);
    const source=a.member.room,sourceWorld=source.world,target=b.member.room,token=a.member.token,version=a.member.membershipVersion;
    f.fail(true);assert.equal((await f.request('/api/account/social/join',{accountId:b.account.id},a)).status,503);f.fail(false);
    assert.equal(a.member.room,source);assert.equal(a.member.game.world,sourceWorld);assert.equal(a.member.token,token);assert.equal(a.member.membershipVersion,version);assert.equal(target.members.has(a.member.id),false);
    const joined=await f.request('/api/account/social/join',{accountId:b.account.id},a);assert.equal(joined.status,200);assert.equal(joined.data.playerId,a.member.id);assert.equal(a.member.room,target);assert.equal(f.hub.accountMembers.get(a.account.id),a.member);assert.equal([...f.hub.rooms.values()].flatMap(room=>[...room.members.values()]).filter(member=>member.accountId===a.account.id).length,1);
    assert.equal((await f.request('/api/account/social/join',{accountId:b.account.id,ownerId:b.account.id},c)).status,400);
  }finally{f.fail(false);await f.close();}
});

test('guild chat remains private and leaving invalidates the live guild view without ending unrelated social access',async()=>{
  const f=await fixture();try{
    const a=f.accounts.a,b=f.accounts.b,c=f.accounts.c;await guild(f);
    const stream=await f.socialStream(b);
    await ok(f.action(a,'guild_chat',{text:'Only our guild may read this'}));f.pulse();await until(()=>stream.frames.some(frame=>frame.guild?.messages.some(message=>message.text==='Only our guild may read this')),'guild chat frame');
    const outsider=(await f.request('/api/account/social',undefined,c)).data;assert.equal(outsider.guild,null);assert.ok(!JSON.stringify(outsider).includes('Only our guild'));
    assert.ok([403,409].includes((await f.action(c,'guild_chat',{text:'Forged outsider message'})).status));
    await ok(f.action(b,'guild_leave'));f.pulse();await until(()=>stream.frames.at(-1).guild===null,'guild authorization removal');
    const start=stream.frames.length;await ok(f.action(a,'guild_chat',{text:'After the member left'}));f.pulse();await delay(30);
    assert.equal(stream.done,false,'Leaving a guild retains the authenticated social session');
    for(const frame of stream.frames.slice(start)){assert.equal(frame.guild,null);assert.ok(!JSON.stringify(frame).includes('After the member left'));}
    assert.equal((await f.request('/api/account/social',undefined,b)).data.guild,null);
  }finally{await f.close();}
});

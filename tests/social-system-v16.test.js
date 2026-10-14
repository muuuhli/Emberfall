import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { SocialManager } from '../server/social.mjs';
import { MultiplayerHub } from '../server/multiplayer.mjs';

function fixture(count=6){
  let now=1000;const accounts=new Map(),ids=[];
  for(let i=0;i<count;i++){const id=randomUUID();ids.push(id);accounts.set(id,{id,username:`tester_${i}`});}
  const social=new SocialManager({accounts:()=>accounts,clock:()=>now,profile:id=>({accountId:id,username:accounts.get(id).username,playerName:`Character ${ids.indexOf(id)}`,classId:'guardian',level:27}),presence:()=>({online:true,inParty:true,canJoin:true,joinReason:'',roomName:'Public expedition'})});
  const action=(index,name,fields={})=>social.action(ids[index],{action:name,...fields});
  const request=(from,to)=>action(from,'friend_request',{username:accounts.get(ids[to]).username});
  const accept=(to,from)=>action(to,'friend_accept',{accountId:ids[from]});
  const guild=(leader=0,name='Ember Companions')=>{action(leader,'guild_create',{guildName:name});return social.guildFor(ids[leader]);};
  const invite=(leader,target)=>action(leader,'guild_invite',{username:accounts.get(ids[target]).username});
  const join=(index,g)=>action(index,'guild_accept',{guildId:g.id});
  return{social,ids,accounts,action,request,accept,guild,invite,join,advance(ms=10000){now+=ms;}};
}
const denied=(work,status)=>assert.throws(work,error=>error.status===status);

test('friendship requires recipient consent and exposes detailed canonical profiles only after consent',()=>{
  const f=fixture();f.request(0,1);
  assert.equal(f.social.snapshot(f.ids[1]).friendRequests.incoming.length,1);
  assert.equal(f.social.snapshot(f.ids[0]).friendRequests.outgoing[0].classId,undefined);
  denied(()=>f.action(0,'friend_accept',{accountId:f.ids[1]}),409);
  denied(()=>f.request(1,0),409);f.accept(1,0);
  for(const [a,b]of [[0,1],[1,0]]){const p=f.social.snapshot(f.ids[a]).friends[0];assert.equal(p.accountId,f.ids[b]);assert.equal(p.level,27);assert.equal(p.classId,'guardian');assert.equal(p.canJoin,true);}
  f.action(0,'friend_remove',{accountId:f.ids[1]});assert.equal(f.social.isContact(f.ids[0],f.ids[1]),false);assert.equal(f.social.snapshot(f.ids[1]).friends.length,0);
});

test('decline and cancel apply only to the native request direction',()=>{
  const f=fixture();f.request(0,1);denied(()=>f.action(1,'friend_cancel',{accountId:f.ids[0]}),409);f.action(1,'friend_decline',{accountId:f.ids[0]});
  f.request(0,1);f.action(0,'friend_cancel',{accountId:f.ids[1]});assert.deepEqual(f.social.capture().requests,[]);
});

test('blocking removes bilateral friendship/requests, hides guild presence and filters blocked authors',()=>{
  const f=fixture();f.request(0,1);f.accept(1,0);const g=f.guild();f.invite(0,1);f.join(1,g);f.invite(0,2);
  f.action(1,'guild_chat',{text:'Guild message before blocking'});f.action(0,'block',{accountId:f.ids[1]});
  assert.equal(f.social.isContact(f.ids[0],f.ids[1]),false);assert.equal(f.social.snapshot(f.ids[0]).friends.length,0);
  const blocked=f.social.snapshot(f.ids[0]).guild.members.find(p=>p.accountId===f.ids[1]);assert.equal(blocked.online,false);assert.equal(blocked.level,undefined);assert.equal(f.social.snapshot(f.ids[0]).guild.messages.length,0);
  denied(()=>f.request(1,0),403);f.action(2,'block',{accountId:f.ids[0]});assert.equal(g.invites.length,0);
  f.action(0,'unblock',{accountId:f.ids[1]});assert.equal(f.social.isContact(f.ids[0],f.ids[1]),true,'Unblocking retains already consented guild membership');assert.equal(f.social.isFriend(f.ids[0],f.ids[1]),false,'Removed friendship is not silently restored');
});

test('guild consent, unique normalized names, and invite cancellation retain exact roles',()=>{
  const f=fixture(),g=f.guild(0,'  Ember   Companions  ');assert.equal(g.name,'Ember Companions');
  denied(()=>f.guild(1,'EMBER COMPANIONS'),409);denied(()=>f.guild(2,'<script>'),400);
  f.invite(0,1);assert.equal(f.social.guildFor(f.ids[1]),null);assert.equal(f.social.snapshot(f.ids[0]).guild.invites[0].accountId,f.ids[1]);
  f.action(0,'guild_cancel',{accountId:f.ids[1]});assert.equal(f.social.snapshot(f.ids[1]).guildInvites.length,0);
  f.invite(0,1);f.action(1,'guild_decline',{guildId:g.id});assert.equal(g.invites.length,0);
  f.invite(0,1);f.join(1,g);assert.equal(f.social.snapshot(f.ids[1]).guild.role,'member');assert.deepEqual(f.social.snapshot(f.ids[1]).guild.invites,[]);
  denied(()=>f.action(1,'guild_invite',{username:f.accounts.get(f.ids[2]).username}),403);
});

test('officers cannot assign roles or kick officers; leadership transfer and departure clean invitations',()=>{
  const f=fixture(),g=f.guild();for(const i of [1,2,3]){f.invite(0,i);f.join(i,g);}
  for(const i of [1,2])f.action(0,'guild_role',{accountId:f.ids[i],role:'officer'});
  denied(()=>f.action(1,'guild_role',{accountId:f.ids[3],role:'officer'}),403);denied(()=>f.action(1,'guild_kick',{accountId:f.ids[2]}),403);denied(()=>f.action(1,'guild_transfer',{accountId:f.ids[3]}),403);
  f.invite(1,4);f.action(0,'guild_role',{accountId:f.ids[1],role:'member'});assert.equal(g.invites.length,0,'A demoted inviter cannot retain invitation authority');
  f.action(2,'guild_kick',{accountId:f.ids[3]});assert.equal(f.social.guildFor(f.ids[3]),null);
  denied(()=>f.action(0,'guild_leave'),409);f.action(0,'guild_transfer',{accountId:f.ids[2]});assert.equal(g.leaderId,f.ids[2]);assert.equal(g.members.find(m=>m.accountId===f.ids[0]).role,'officer');
  f.action(0,'guild_leave');f.action(1,'guild_leave');f.action(2,'guild_leave');assert.deepEqual(f.social.capture().guilds,[]);
});

test('accepting a guild removes other pending invitations and histories survive a former author departure',()=>{
  const f=fixture(),first=f.guild(0,'First guild'),second=f.guild(1,'Second guild');f.invite(0,2);f.invite(1,2);f.join(2,first);
  assert.equal(second.invites.length,0);f.action(2,'guild_chat',{text:' Historical   account message\n'});f.action(2,'guild_leave');
  assert.equal(first.messages[0].text,'Historical account message');const capture=f.social.capture();f.social.restore(capture);assert.deepEqual(f.social.capture(),capture);
  assert.equal(f.social.snapshot(f.ids[2]).guild,null);assert.equal(f.social.snapshot(f.ids[0]).guild.messages[0].accountId,f.ids[2]);
});

test('guild history is bounded to the latest fifty real messages and never accepts client author metadata',()=>{
  const f=fixture();f.guild();for(let i=0;i<55;i++){f.action(0,'guild_chat',{text:`message ${i}`});f.advance(1);}
  const history=f.social.snapshot(f.ids[0]).guild.messages;assert.equal(history.length,50);assert.equal(history[0].text,'message 5');assert.equal(history.at(-1).text,'message 54');assert.equal(new Set(history.map(m=>m.id)).size,50);
  for(const text of ['',' '.repeat(5),'x'.repeat(241),'bad\u0000text'])denied(()=>f.action(0,'guild_chat',{text}),400);
  denied(()=>f.social.action(f.ids[0],{action:'guild_chat',text:'fake',accountId:f.ids[1]}),400);assert.equal(f.social.capture().guilds[0].messages.length,50);
});

test('friend and guild member bounds reject additions without removing existing consented relationships',()=>{
  const f=fixture(35);for(let i=1;i<=32;i++){f.request(0,i);f.accept(i,0);}denied(()=>f.request(0,33),429);assert.equal(f.social.snapshot(f.ids[0]).friends.length,32);
  const g=f.guild();for(let i=1;i<=31;i++){f.invite(0,i);f.join(i,g);}denied(()=>f.invite(0,32),429);assert.equal(g.members.length,32);
  const capture=f.social.capture();f.social.restore(capture);assert.deepEqual(f.social.capture(),capture);
});

test('strict storage rejects malformed shape, typed IDs, correlated invites and noncanonical chat',()=>{
  const f=fixture();for(const body of [{action:['guild_leave']},{action:'__proto__'},{action:'friend_request',username:null},{action:'block',accountId:5},{action:'guild_create',guildName:'Valid',memberId:f.ids[1]}])denied(()=>f.social.action(f.ids[0],body),400);
  const g=f.guild();f.invite(0,1);const valid=f.social.capture(),bad=structuredClone(valid);bad.guilds[0].invites[0].inviterId=f.ids[2];assert.throws(()=>f.social.restore(bad));assert.deepEqual(f.social.capture(),valid);
  for(const value of [null,{...valid,extra:true},{...valid,guilds:[{...valid.guilds[0],members:[...g.members,{accountId:f.ids[2],role:'leader'}]}]}])assert.throws(()=>f.social.restore(value));
});

test('slow Social SSE readers are bounded while legitimate initial backpressure may drain',()=>{
  const hub=new MultiplayerHub({autoStart:false});
  const res=new EventEmitter();Object.assign(res,{destroyed:false,writableEnded:false,writableLength:0,writes:[],write(payload){this.writes.push(payload);return false;},end(){this.writableEnded=true;}});
  const stream={res};hub.socialStreams.add(stream);
  assert.equal(hub._writeSocial(stream,'initial legitimate snapshot'),true);assert.equal(hub.socialStreams.has(stream),true);assert.equal(stream.waitingDrain,true);
  res.emit('drain');assert.equal(stream.waitingDrain,false);assert.equal(hub._writeSocial(stream,'next legitimate snapshot'),true);
  assert.equal(hub._writeSocial(stream,'more data while still blocked'),false);assert.equal(hub.socialStreams.has(stream),false);assert.equal(res.writableEnded,true);
  const large={res:new EventEmitter()};Object.assign(large.res,{writableLength:256*1024,destroyed:false,writableEnded:false,end(){this.writableEnded=true;}});hub.socialStreams.add(large);
  assert.equal(hub._writeSocial(large,'overflow'),false);assert.equal(large.res.writableEnded,true);hub.dispose();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkClient,validateSocialSnapshot} from '../src/network.js';
import {Game} from '../src/game.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const profile=(id='friend',details={})=>({accountId:id,username:id,playerName:id,online:false,inParty:false,canJoin:false,joinReason:'Offline',...details});
const snapshot=(revision=1,fields={})=>({version:1,revision,accountId:'owner',friends:[],friendRequests:{incoming:[],outgoing:[]},blocked:[],guildInvites:[],guild:null,...fields});
function fixture(handler=()=>snapshot()){
 const calls=[],sources=[];
 class Source{constructor(url,options){this.url=url;this.options=options;this.listeners=new Map();sources.push(this);}addEventListener(name,fn){this.listeners.set(name,fn);}close(){this.closed=true;}open(){this.onopen?.();}emit(value){this.listeners.get('social')?.({data:JSON.stringify(value)});}}
 const game=new Game({storage:null}),network=new NetworkClient(game,{baseUrl:'https://play.example.test',storage:null,EventSourceImpl:Source,fetchImpl:async(url,options)=>{calls.push({url,options});const result=await handler(url,options);return result?.httpStatus?{ok:false,status:result.httpStatus,json:async()=>({error:result.error})}:{ok:true,status:200,json:async()=>result};}});
 network.account={id:'owner',username:'owner'};network.accountStatus='authenticated';return {network,game,calls,sources};
}

test('social streams open only explicitly, use a separate credentialed stream, and never close the game stream',async()=>{
 const f=fixture();assert.equal(f.calls.length,0);assert.equal(f.sources.length,0);let gameClosed=0;f.network.source={close(){gameClosed++;}};
 f.network.accountOwned=true;f.network.playerId='canonical-hero';await f.network.openSocial();await f.network.openSocial();
 assert.equal(f.sources.length,1);assert.match(f.sources[0].url,/\/api\/account\/social\/events\?accountId=owner&playerId=canonical-hero$/);assert.deepEqual(f.sources[0].options,{withCredentials:true});
 assert.equal(f.calls[0].options.credentials,'include');assert.equal(f.calls[0].options.headers['X-Emberfall-Account-Id'],'owner');assert.equal(f.calls[0].options.headers['X-Emberfall-Player-Id'],'canonical-hero');
 f.sources[0].open();f.sources[0].emit(snapshot(2));assert.equal(f.network.social.revision,2);f.network.closeSocial();assert.equal(f.sources[0].closed,true);assert.equal(f.network.socialSource,null);assert.equal(gameClosed,0);
 f.sources[0].emit(snapshot(99));assert.equal(f.network.social.revision,2);await f.network.openSocial();assert.equal(f.sources.length,2);f.network.closeSocial();
});

test('closing a panel during its initial read never creates a background social stream',async()=>{
 const flight=deferred(),f=fixture(()=>flight.promise);const pending=f.network.openSocial();assert.equal(f.network.socialStatus,'loading');f.network.closeSocial();flight.resolve(snapshot());await pending;assert.equal(f.sources.length,0);assert.equal(f.network.socialSource,null);
});

test('anonymous, checking and plaintext origins cannot send authenticated social requests',async()=>{
 for(const mutate of [n=>{n.account=null;n.accountStatus='anonymous';},n=>n.accountStatus='checking',n=>n.requiresHTTPS=true]){
  const f=fixture();mutate(f.network);await assert.rejects(f.network.openSocial(),/sicher/);await assert.rejects(f.network.socialAction('friend_request',{username:'friend'}),/sicher/);assert.equal(f.calls.length,0);assert.equal(f.sources.length,0);
 }
});

test('social actions bind exact account and actor identity, await the response and do not persist social state',async()=>{
 const flight=deferred(),f=fixture(()=>flight.promise);f.network.accountOwned=true;f.network.playerId='hero';let writes=0;f.network.storage={setItem(){writes++;}};
 const pending=f.network.socialAction('friend_request',{username:'Friend_12'});await assert.rejects(f.network.socialAction('guild_create',{guildName:'Too soon'}),/noch bearbeitet/);
 assert.deepEqual(JSON.parse(f.calls[0].options.body),{username:'Friend_12',action:'friend_request'});assert.equal(f.calls[0].options.headers['X-Emberfall-Account-Id'],'owner');assert.equal(f.calls[0].options.headers['X-Emberfall-Player-Id'],'hero');
 flight.resolve({ok:true,snapshot:snapshot(4,{friendRequests:{incoming:[],outgoing:[profile('Friend_12')]}})});await pending;assert.equal(f.network.social.friendRequests.outgoing.length,1);assert.equal(writes,0);assert.equal(f.network._socialMutation,null);
});

test('older HTTP responses cannot replace newer SSE and a restarted stream establishes a lower fresh revision',async()=>{
 const flight=deferred();let reads=0;const f=fixture(()=>++reads===1?snapshot(20):flight.promise);await f.network.openSocial();const source=f.sources[0];source.open();source.emit(snapshot(20));
 const refresh=f.network.refreshSocial();source.emit(snapshot(23,{friends:[profile()]}));flight.resolve(snapshot(21));await refresh;assert.equal(f.network.social.revision,23);assert.equal(f.network.social.friends.length,1);
 source.open();source.emit(snapshot(0));assert.equal(f.network.social.revision,0);source.emit(snapshot(2));source.emit(snapshot(1,{friends:[profile()]}));assert.equal(f.network.social.revision,2);assert.equal(f.network.social.friends.length,0);f.network.closeSocial();
});

test('foreign account snapshots and oversized or malformed payloads cannot reach the UI cache',()=>{
 assert.throws(()=>validateSocialSnapshot(snapshot(1,{accountId:'other'}),'owner'),/ungültig/);
 assert.throws(()=>validateSocialSnapshot(snapshot(1,{friends:Array.from({length:33},()=>profile())}),'owner'));
 assert.throws(()=>validateSocialSnapshot(snapshot(-1),'owner'));
 const unknown=validateSocialSnapshot(snapshot(1,{friendRequests:{incoming:[profile('newcomer')],outgoing:[]}}),'owner');assert.equal(unknown.friendRequests.incoming[0].level,undefined);
 const guild={id:'guild',name:'Test Guild',role:'member',leaderId:'owner',members:[{...profile('owner',{classId:'guardian',level:1}),role:'member'}],invites:[],messages:[{id:'message',accountId:'owner',playerName:'Owner',text:'Hello',createdAt:NaN}]};
 assert.throws(()=>validateSocialSnapshot(snapshot(1,{guild}),'owner'));
 guild.messages[0].createdAt=1;guild.messages[0].text='x'.repeat(241);assert.throws(()=>validateSocialSnapshot(snapshot(1,{guild}),'owner'));
 const original=snapshot(4,{friends:[profile()]});const copy=validateSocialSnapshot(original,'owner');copy.friends[0].playerName='changed';assert.equal(original.friends[0].playerName,'friend');
});

test('a cookie identity change clears old social state and rejects a late mutation before it can assign the new account',async()=>{
 const flight=deferred(),f=fixture(url=>url.endsWith('/api/account')?{account:{id:'new-owner',username:'new'}}:flight.promise);
 f.network.social=snapshot(3,{friends:[profile()]});let closed=0;f.network.socialSource={close(){closed++;}};
 const pending=f.network.socialAction('friend_remove',{accountId:'friend'});await f.network.refreshAccount();assert.equal(closed,1);assert.equal(f.network.account.id,'new-owner');assert.equal(f.network.social,null);
 flight.resolve({ok:true,snapshot:snapshot(4)});await assert.rejects(pending,/gewechselt/);assert.equal(f.network.social,null);assert.equal(f.network._socialMutation,null);
});

test('an expired social request refreshes account metadata, closes its stream and reports authentication loss',async()=>{
 let reads=0;const f=fixture(url=>url.endsWith('/api/account')?{account:null}:++reads===1?snapshot():{httpStatus:401,error:'Bitte anmelden.'});await f.network.openSocial();const source=f.sources[0];
 await assert.rejects(f.network.socialAction('guild_leave'),/anmelden/);assert.equal(f.network.accountStatus,'anonymous');assert.equal(f.network.social,null);assert.equal(source.closed,true);assert.equal(f.network.socialSource,null);
});

test('logout closes the authenticated stream immediately before awaiting the server',async()=>{
 const flight=deferred(),f=fixture(url=>url.endsWith('/logout')?flight.promise:snapshot());await f.network.openSocial();let disconnected=false;f.network.disconnect=async()=>{disconnected=true;};
 const pending=f.network.logoutAccount();assert.equal(f.sources[0].closed,true);assert.equal(f.network.social,null);assert.equal(disconnected,false);flight.resolve({ok:true});await pending;assert.equal(disconnected,true);assert.equal(f.network.account,null);
});

test('contact joining asks the authority for a contact account and reconnects its canonical actor without a supplied room code',async()=>{
 const f=fixture(()=>({accountOwned:true,roomCode:'AB1234CD',playerId:'same-hero',snapshot:{privateWorld:false}})),connections=[];f.network.accountOwned=true;f.network.playerId='same-hero';f.network.active=true;f.network.connect=async data=>connections.push(data);
 await f.network.joinContact('friend');assert.deepEqual(JSON.parse(f.calls[0].options.body),{accountId:'friend'});assert.match(f.calls[0].url,/\/api\/account\/social\/join$/);assert.equal(f.calls[0].options.headers['X-Emberfall-Account-Id'],'owner');assert.equal(connections[0].accountOwned,true);assert.equal(connections[0].playerId,'same-hero');assert.equal(f.network._transferring,false);
});


test('a rapid close and reopen cannot revive the old opening request as a second background stream',async()=>{
 const oldRead=deferred(),newRead=deferred();let reads=0;const f=fixture(()=>++reads===1?oldRead.promise:newRead.promise);
 const oldOpen=f.network.openSocial();f.network.closeSocial();const newOpen=f.network.openSocial();newRead.resolve(snapshot(2));await newOpen;assert.equal(f.sources.length,1);
 oldRead.resolve(snapshot(1));await oldOpen;assert.equal(f.sources.length,1);assert.equal(f.network.socialSource,f.sources[0]);f.network.closeSocial();
});

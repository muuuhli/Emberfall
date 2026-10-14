import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { AccountManager } from '../server/accounts.mjs';

// These are disposable test credentials, never player or deployment secrets.
const credentials={username:'AccountProbe',password:'test-only-password-2026',playerName:'Kontoheld',classId:'guardian'};
async function fixture(options={}){
  const values=new Map();let failWrites=false,writes=0;
  const storage=options.storage||{getItem:key=>values.get(key)||null,setItem:(key,value)=>{if(failWrites)throw new Error('test write failure');values.set(key,value);writes++;}};
  let hub,server,base;const controllers=[];
  const open=async()=>{hub=new MultiplayerHub({storage,autoStart:false,strictRestore:true,...options});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{controllers.forEach(c=>c.abort());hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const request=async(route,body,cookie='',extra={})=>{const principal=hub.accounts.authenticate({headers:{cookie},socket:{}}),playerId=principal&&hub.accountMembers.get(principal.account.id)?.id;const response=await fetch(base+route,{...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,...(route==='/api/account/play/command'&&playerId?{'X-Emberfall-Player-Id':playerId}:{}),...extra},body:JSON.stringify(body)}),...(body===undefined?{headers:{Cookie:cookie,...extra}}:{})});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')};};
  return {request,close,get hub(){return hub;},get base(){return base;},get writes(){return writes;},get raw(){return [...values.values()][0];},setFail:value=>{failWrites=value;},async restart(){await close();await open();},async stream(cookie){const principal=hub.accounts.authenticate({headers:{cookie},socket:{}}),playerId=hub.accountMembers.get(principal.account.id).id,controller=new AbortController();controllers.push(controller);const response=await fetch(base+`/api/account/play/events?deltas=1&playerId=${playerId}`,{headers:{Cookie:cookie},signal:controller.signal});return {response,controller,reader:response.body.getReader()};}};
}
const cookieOf=response=>response.cookie?.split(';')[0];

test('registration stores one canonical character and only salted credentials and session digests',async()=>{
  const f=await fixture({accountOptions:{cookieSecure:true}});try{
    const before=f.writes,created=await f.request('/api/account/register',credentials);assert.equal(created.status,201);assert.equal(f.writes,before+1,'Account, roster and auth session have one atomic write');
    assert.match(created.cookie,/Path=\/api\/account/);assert.match(created.cookie,/HttpOnly/);assert.match(created.cookie,/SameSite=Strict/);assert.match(created.cookie,/Secure/);
    assert.equal(created.data.account.username,'accountprobe');assert.equal(created.data.account.playerName,'Kontoheld');assert.equal(created.data.token,undefined);
    const saved=JSON.parse(f.raw),account=saved.accounts.records[0],member=saved.rooms[0].members[0];
    assert.equal(member.accountId,account.id);assert.equal(account.memberId,member.id);assert.equal(member.token,undefined);assert.equal(account.save,undefined);assert.equal(account.password.p,3);
    assert.ok(!f.raw.includes(credentials.password));assert.ok(!f.raw.includes(cookieOf(created).split('=')[1]));assert.equal(saved.accounts.sessions[0].digest.length,64);
    const me=await f.request('/api/account',undefined,cookieOf(created));assert.equal(me.status,200);assert.equal(me.data.privateWorld,true);assert.equal(me.data.account.level,1);assert.equal(me.data.account.password,undefined);
    assert.deepEqual((await f.request('/api/rooms')).data.rooms,[],'Private account worlds are never publicly listed');
    const ready=await f.request('/api/account/play',{},cookieOf(created));
    assert.equal(ready.data.snapshot.events.find(event=>event.kind==='notice')?.text,'Deine persönliche Serverreise ist bereit.');
    assert.equal(ready.data.snapshot.events.some(event=>event.text?.includes(ready.data.roomCode)),false,'A personal journey does not advertise a group invitation code');
  }finally{await f.close();}
});

test('another device and server restart resume the same authoritative progression and character identity',async()=>{
  const f=await fixture();try{
    const registered=await f.request('/api/account/register',credentials),firstCookie=cookieOf(registered);
    const connected=await f.request('/api/account/play',{},firstCookie);assert.equal(connected.status,200);assert.equal(connected.data.accountOwned,true);assert.equal(connected.data.privateWorld,true);
    const member=f.hub.accountMembers.get(registered.data.account.id);member.game.gainXp(600);member.game.player.gold=713;member.game.resources.wood=19;const id=member.id,level=member.game.player.level;
    await f.restart();assert.equal(f.hub.accountMembers.get(registered.data.account.id).active,false);
    const loggedIn=await f.request('/api/account/login',{username:'ACCOUNTPROBE',password:credentials.password});assert.equal(loggedIn.status,200);
    const resumed=await f.request('/api/account/play',{},cookieOf(loggedIn));assert.equal(resumed.data.playerId,id);assert.equal(resumed.data.snapshot.player.level,level);assert.equal(resumed.data.snapshot.player.gold,713);assert.equal(resumed.data.snapshot.resources.wood,19);
    assert.equal(f.hub.accountMembers.size,1);assert.equal([...f.hub.rooms.values()].reduce((sum,r)=>sum+r.members.size,0),1);
    assert.equal((await f.request('/api/account',undefined,firstCookie)).data.account.id,registered.data.account.id,'Unexpired hashes also survive restart');
  }finally{await f.close();}
});

test('wrong and unknown usernames have the same public failure and registration is case insensitive',async()=>{
  const f=await fixture();try{
    assert.equal((await f.request('/api/account/register',credentials)).status,201);
    const bad=await f.request('/api/account/login',{username:'AccountProbe',password:'wrong-test-password-2026'}),unknown=await f.request('/api/account/login',{username:'UnknownProbe',password:'wrong-test-password-2026'});
    assert.equal(bad.status,401);assert.deepEqual(bad.data,unknown.data);assert.equal(unknown.status,401);assert.equal(bad.cookie,null);
    assert.equal((await f.request('/api/account/register',{...credentials,username:'accountprobe'})).status,409);
    for(const body of [{...credentials,username:'a b'}, {...credentials,password:'short'},{...credentials,password:'x'.repeat(129)},{...credentials,password:'ä'.repeat(65)},{...credentials,classId:'fake'}])assert.equal((await f.request('/api/account/register',body)).status,400);
    assert.equal(f.hub.accounts.records.size,1);
  }finally{await f.close();}
});

test('account transport rejects remote plaintext password endpoints without trusting browser proxy headers',async()=>{
  const f=await fixture({accountOptions:{requireSecure:true,cookieSecure:true,secureOrigin:'https://127.0.0.1:9443'}});try{
    const me=await f.request('/api/account');assert.equal(me.data.account,null);assert.equal(me.data.requiresHTTPS,true);assert.equal(me.data.secureOrigin,'https://127.0.0.1:9443');
    const denied=await f.request('/api/account/register',credentials,'',{'X-Forwarded-Proto':'https'});assert.equal(denied.status,426);assert.equal(denied.cookie,null);assert.equal(f.hub.accounts.records.size,0);
  }finally{await f.close();}
});

test('credential hashing is asynchronous and bounded to two concurrent jobs',async()=>{
  const manager=new AccountManager();const req=address=>({headers:{},socket:{remoteAddress:address}});let ticks=0;const interval=setInterval(()=>ticks++,1);
  try{
    const first=manager.prepareRegistration({...credentials,username:'first_job'},req('one')),second=manager.prepareRegistration({...credentials,username:'second_job'},req('two'));
    await assert.rejects(manager.prepareRegistration({...credentials,username:'third_job'},req('three')),error=>error.status===429);
    const prepared=await Promise.all([first,second]);assert.equal(prepared.length,2);assert.ok(ticks>0,'The simulation event loop can run during password hashing');assert.equal(manager.runningKdfs,0);assert.equal(manager.pendingNames.size,0);
  }finally{clearInterval(interval);}
});

test('failed registration and login persistence issue no usable cookie or partial account',async()=>{
  const f=await fixture();try{
    f.setFail(true);const rejected=await f.request('/api/account/register',credentials);assert.equal(rejected.status,503);assert.equal(rejected.cookie,null);assert.equal(f.hub.accounts.records.size,0);assert.equal(f.hub.accountMembers.size,0);assert.equal(f.hub.rooms.size,0);
    f.setFail(false);const registered=await f.request('/api/account/register',credentials),cookie=cookieOf(registered),sessions=f.hub.accounts.sessions.size;
    f.setFail(true);const failedLogin=await f.request('/api/account/login',{username:credentials.username,password:credentials.password});assert.equal(failedLogin.status,503);assert.equal(failedLogin.cookie,null);assert.equal(f.hub.accounts.sessions.size,sessions);assert.ok((await f.request('/api/account',undefined,cookie)).data.account);
  }finally{f.setFail(false);await f.close();}
});

test('logout revokes only that browser session, closes its SSE and preserves another device and character',async()=>{
  const f=await fixture();try{
    const registered=await f.request('/api/account/register',credentials),first=cookieOf(registered),second=cookieOf(await f.request('/api/account/login',{username:credentials.username,password:credentials.password}));
    const stream=await f.stream(first);assert.equal(stream.response.status,200);assert.match(new TextDecoder().decode((await stream.reader.read()).value),/event: snapshot/);
    const member=f.hub.accountMembers.get(registered.data.account.id);member.game.player.gold=612;
    const loggedOut=await f.request('/api/account/logout',{},first);assert.equal(loggedOut.status,200);assert.match(loggedOut.cookie,/Max-Age=0/);assert.equal(member.streams.size,0);
    assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},first)).status,401);
    assert.equal((await f.request('/api/account',undefined,first)).data.account,null);assert.ok((await f.request('/api/account',undefined,second)).data.account);assert.equal(member.game.player.gold,612);
  }finally{await f.close();}
});

test('logging out one connected device stops its held movement while the other valid stream remains connected',async()=>{
  const f=await fixture();try{
    const registered=await f.request('/api/account/register',credentials),first=cookieOf(registered),second=cookieOf(await f.request('/api/account/login',{username:credentials.username,password:credentials.password}));
    const a=await f.stream(first),b=await f.stream(second);assert.equal(a.response.status,200);assert.equal(b.response.status,200);await a.reader.read();await b.reader.read();
    const member=f.hub.accountMembers.get(registered.data.account.id);member.game.keys.add('w');assert.equal(member.streams.size,2);
    assert.equal((await f.request('/api/account/logout',{},first)).status,200);assert.equal(member.streams.size,1);assert.equal(member.active,true);assert.equal(member.game.keys.size,0);
    assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['d'],angle:0},second)).data.accepted,true);assert.equal(member.game.keys.has('d'),true);
  }finally{await f.close();}
});

test('account character bearer tokens cannot bypass cookie ownership and unrelated accounts cannot control them',async()=>{
  const f=await fixture();try{
    const owner=await f.request('/api/account/register',credentials),intruder=await f.request('/api/account/register',{...credentials,username:'other_account'}),member=f.hub.accountMembers.get(owner.data.account.id);
    for(const cookie of ['',cookieOf(intruder)]){assert.equal((await f.request(`/api/session/${member.token}`,undefined,cookie)).status,401);assert.equal((await f.request(`/api/session/${member.token}/command`,{type:'input',keys:['w'],angle:0},cookie)).status,401);}
    assert.equal(member.active,false);assert.deepEqual([...member.game.keys],[]);
    const guest=await f.request('/api/rooms',{playerName:'Gast'});assert.equal(guest.status,201);assert.equal((await f.request(`/api/session/${guest.data.token}`)).status,200);
  }finally{await f.close();}
});

test('invalid account payload fails closed while a legacy room store resumes without accounts',async()=>{
  const f=await fixture();try{
    const guest=await f.request('/api/rooms',{playerName:'Altstand'});f.hub.persist();const legacy=f.raw;
    const store=value=>({getItem:()=>value,setItem:()=>{}});
    const restored=new MultiplayerHub({autoStart:false,strictRestore:true,storage:store(legacy)});try{assert.ok(restored.sessions.has(guest.data.token));assert.equal(restored.accounts.records.size,0);}finally{restored.dispose();}
    const corrupted=JSON.parse(legacy);corrupted.accounts={version:1,records:[{id:'broken'}],sessions:[]};assert.throws(()=>new MultiplayerHub({autoStart:false,strictRestore:true,storage:store(JSON.stringify(corrupted))}),/Kontenspeicher/);
  }finally{await f.close();}
});

test('account lifetime capacity and session count are explicit and do not erase existing journeys',async()=>{
  const f=await fixture({accountOptions:{maxAccounts:1,maxSessions:2}});try{
    const created=await f.request('/api/account/register',credentials),first=cookieOf(created);
    assert.equal((await f.request('/api/account/register',{...credentials,username:'capacity_probe'})).status,503);
    const second=cookieOf(await f.request('/api/account/login',{username:credentials.username,password:credentials.password})),third=cookieOf(await f.request('/api/account/login',{username:credentials.username,password:credentials.password}));
    assert.equal(f.hub.accounts.sessions.size,2);assert.equal((await f.request('/api/account',undefined,first)).data.account,null);assert.ok((await f.request('/api/account',undefined,second)).data.account);assert.ok((await f.request('/api/account',undefined,third)).data.account);assert.equal(f.hub.accountMembers.size,1);
  }finally{await f.close();}
});

test('expired cookies cannot read snapshots or command and their live stream closes without deleting the hero',async()=>{
  let now=1000;const f=await fixture({clock:()=>now});try{
    const created=await f.request('/api/account/register',credentials),cookie=cookieOf(created),stream=await f.stream(cookie);assert.equal(stream.response.status,200);await stream.reader.read();
    const member=f.hub.accountMembers.get(created.data.account.id);member.game.player.gold=333;now+=30*24*60*60*1000+1;
    assert.equal((await f.request('/api/account',undefined,cookie)).data.account,null);assert.equal((await f.request('/api/account/play',undefined,cookie)).status,401);assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},cookie)).status,401);
    f.hub._broadcast(member);assert.equal(member.streams.size,0);assert.equal(member.active,false);assert.equal(member.game.player.gold,333);assert.equal(f.hub.accounts.records.size,1);
  }finally{await f.close();}
});

test('injected trusted client addresses have separate rate limits and account cookies cannot downgrade to HTTP',async()=>{
  const manager=new AccountManager({requireSecure:true,isSecure:req=>req.secure===true,clientAddress:req=>req.clientAddress});
  const account=await manager.prepareRegistration(credentials,{secure:true,clientAddress:'one',socket:{remoteAddress:'shared-proxy'}});account.memberId='fixture-hero';manager.add(account);const issued=manager.issue(account),req={secure:true,headers:{cookie:manager.cookie(issued.token)},clientAddress:'one'};
  assert.ok(manager.authenticate(req));assert.equal(manager.authenticate({...req,secure:false,headers:{...req.headers,'x-forwarded-proto':'https'}}),null);
  for(let i=0;i<20;i++)manager._limit('login:one',20,15*60*1000);
  await assert.rejects(manager.verifyLogin(credentials,{secure:true,clientAddress:'one',socket:{remoteAddress:'shared-proxy'}}),error=>error.status===429);
  assert.equal((await manager.verifyLogin(credentials,{secure:true,clientAddress:'two',socket:{remoteAddress:'shared-proxy'}})).id,account.id);
});

test('the cookie-owned command route accepts canonical actions and rejects forged character imports and positions',async()=>{
  const f=await fixture();try{
    const created=await f.request('/api/account/register',credentials),cookie=cookieOf(created),member=f.hub.accountMembers.get(created.data.account.id),gold=member.game.player.gold,x=member.game.player.x;
    for(const body of [{type:'input',keys:[],angle:0,x:999999},{type:'save',player:{gold:999999}},{type:'method',name:'importSave',args:['{}']},{type:'method',name:'reset',args:[]}])assert.equal((await f.request('/api/account/play/command',body,cookie)).status,400);
    assert.equal(member.game.player.gold,gold);assert.equal(member.game.player.x,x);
    assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},cookie)).data.accepted,true);assert.equal(member.game.keys.has('w'),true);
  }finally{await f.close();}
});

test('account commands and SSE require the connected character identity when another tab changes its cookie',async()=>{
  const f=await fixture();try{
    const first=await f.request('/api/account/register',credentials),firstMember=f.hub.accountMembers.get(first.data.account.id),second=await f.request('/api/account/register',{...credentials,username:'different_hero'}),secondMember=f.hub.accountMembers.get(second.data.account.id);
    const stale=await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},cookieOf(second),{'X-Emberfall-Player-Id':firstMember.id});assert.equal(stale.status,409);assert.equal(secondMember.active,false);assert.equal(secondMember.game.keys.size,0);
    assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},cookieOf(second),{'X-Emberfall-Player-Id':''})).status,409);
    for(const query of ['',`?playerId=${firstMember.id}`]){const response=await fetch(f.base+'/api/account/play/events'+query,{headers:{Cookie:cookieOf(second)}});assert.equal(response.status,409);}
    assert.equal((await f.request('/api/account/play/command',{type:'input',keys:['w'],angle:0},cookieOf(second))).data.accepted,true);
    const stream=await f.stream(cookieOf(second));assert.equal(stream.response.status,200);
  }finally{await f.close();}
});

test('hyphenated usernames use the same case-insensitive login and persistable canonical name',async()=>{
  const manager=new AccountManager(),req={headers:{},socket:{remoteAddress:'local-test'}},account=await manager.prepareRegistration({...credentials,username:'Hero-Name_12'},req);
  account.memberId='hyphen-character';manager.add(account);const restored=new AccountManager();restored.restore(JSON.parse(JSON.stringify(manager.capture())));
  assert.equal(restored.names.get('hero-name_12'),account.id);assert.equal((await restored.verifyLogin({username:'HERO-NAME_12',password:credentials.password},req)).id,account.id);
});

test('legacy guest create and join cannot inject an account owner or overwrite its canonical character',async()=>{
  const f=await fixture();try{
    const owner=await f.request('/api/account/register',credentials),accountId=owner.data.account.id,cookie=cookieOf(owner),canonical=f.hub.accountMembers.get(accountId);canonical.game.player.gold=909;
    const forged={playerName:'Fremder Gast',classId:'guardian',accountId,accountHome:true,accountOwnerId:accountId,memberId:canonical.id,id:canonical.id,token:'A'.repeat(43)};
    const created=await f.request('/api/rooms',forged);assert.equal(created.status,201);assert.equal(f.hub.sessions.get(created.data.token).accountId,null);assert.equal(f.hub.accountMembers.get(accountId),canonical);assert.notEqual(created.data.playerId,canonical.id);assert.notEqual(created.data.token,forged.token);assert.equal(created.data.snapshot.privateWorld,false);
    const joined=await f.request(`/api/rooms/${created.data.roomCode}/join`,forged);assert.equal(joined.status,201);assert.equal(f.hub.sessions.get(joined.data.token).accountId,null);assert.equal(f.hub.accountMembers.get(accountId),canonical);
    assert.equal((await f.request('/api/account/play',{},cookie)).data.playerId,canonical.id);assert.equal((await f.request('/api/account',undefined,cookie)).data.account.playerName,'Kontoheld');
    assert.equal((await f.request(`/api/rooms/${canonical.room.code}/join`,forged)).status,404);
    await f.restart();assert.equal(f.hub.accountMembers.get(accountId).id,canonical.id);assert.equal(f.hub.accountMembers.get(accountId).game.player.gold,909);assert.equal(f.hub.accounts.records.size,1);
    assert.equal([...f.hub.rooms.values()].flatMap(room=>[...room.members.values()]).filter(member=>member.accountId===accountId).length,1);
  }finally{await f.close();}
});

test('null, scalar and array JSON bodies cannot create guest actors or mutate an account journey',async()=>{
  const f=await fixture();try{
    const registered=await f.request('/api/account/register',credentials),cookie=cookieOf(registered),member=f.hub.accountMembers.get(registered.data.account.id),roomCount=f.hub.rooms.size;
    for(const body of [null,true,false,3,'text',[]]){
      assert.equal((await f.request('/api/rooms',body)).status,400);assert.equal((await f.request('/api/account/rooms',body,cookie)).status,400);assert.equal((await f.request('/api/account/play/command',body,cookie)).status,400);
    }
    assert.equal(f.hub.rooms.size,roomCount);assert.equal(f.hub.accountMembers.get(registered.data.account.id),member);assert.equal(member.active,false);assert.equal(member.game.keys.size,0);
  }finally{await f.close();}
});

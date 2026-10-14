import test from 'node:test';
import assert from 'node:assert/strict';
import {accountTransportOptions} from '../server/transport-security.mjs';
import {NetworkClient,invitationCode} from '../src/network.js';
import {Game} from '../src/game.js';
import {startServer} from '../server.mjs';

test('account transport trusts only the private proxy network, exact HTTPS host and validated client IP',()=>{
 const options=accountTransportOptions({EMBERFALL_AUTH_REQUIRE_HTTPS:'1',EMBERFALL_AUTH_COOKIE_SECURE:'1',EMBERFALL_SECURE_ORIGIN:'https://play.example.test:9443',EMBERFALL_TRUSTED_PROXY_CIDR:'172.20.0.0/16'});
 const request={socket:{remoteAddress:'::ffff:172.20.0.3'},headers:{host:'play.example.test:9443','x-forwarded-proto':'https','x-forwarded-for':'203.0.113.42'}};
 assert.equal(options.isSecure(request),true);assert.equal(options.clientAddress(request),'203.0.113.42');
 request.socket.remoteAddress='198.51.100.42';assert.equal(options.isSecure(request),false);assert.equal(options.clientAddress(request),'198.51.100.42');
 request.socket.remoteAddress='172.21.0.3';assert.equal(options.isSecure(request),false);
 request.socket.remoteAddress='172.20.0.3';request.headers.host='play.example.test:8088';assert.equal(options.isSecure(request),false);
 request.headers.host='play.example.test:9443';request.headers['x-forwarded-for']='203.0.113.42, 198.51.100.42';assert.equal(options.clientAddress(request),'172.20.0.3');
});

test('production account settings fail closed without HTTPS and Secure cookies',()=>{
 assert.throws(()=>accountTransportOptions({EMBERFALL_AUTH_REQUIRE_HTTPS:'1'}));
 for(const cidr of ['0.0.0.0/0','*','172.20.0.0/99','::/0'])assert.throws(()=>accountTransportOptions({EMBERFALL_TRUSTED_PROXY_CIDR:cidr}));
 assert.throws(()=>accountTransportOptions({EMBERFALL_SECURE_ORIGIN:'http://public.example.test'}));
 assert.equal(accountTransportOptions({}).requireSecure,false);
 assert.equal(accountTransportOptions({EMBERFALL_MAX_ACCOUNTS:'32'}).maxAccounts,32);
 for(const value of ['0','129','NaN','1.5'])assert.throws(()=>accountTransportOptions({EMBERFALL_MAX_ACCOUNTS:value}));
});

test('a pinned proxy address excludes the Docker gateway and another container',()=>{
 const options=accountTransportOptions({EMBERFALL_SECURE_ORIGIN:'https://play.example.test:9443',EMBERFALL_TRUSTED_PROXY_CIDR:'172.20.0.3/32'});
 const request={socket:{remoteAddress:'172.20.0.3'},headers:{host:'play.example.test:9443','x-forwarded-proto':'https'}};
 assert.equal(options.isSecure(request),true);
 for(const address of ['172.20.0.1','172.20.0.2','172.20.0.4']){request.socket.remoteAddress=address;assert.equal(options.isSecure(request),false);}
});

test('invitation links accept only eight hexadecimal characters and preserve a safe public origin',()=>{
 assert.equal(invitationCode('https://play.example.test/?join=ab1234cd'),'AB1234CD');
 assert.equal(invitationCode('https://play.example.test/?join=<script>'),null);
 const network=new NetworkClient(new Game({storage:null}),{baseUrl:'https://play.example.test',storage:null,fetchImpl:async()=>{throw Error('unused');}});
 assert.equal(network.inviteUrl('AB1234CD'),'https://play.example.test/?join=AB1234CD');
 network.accountOwned=true;network.privateWorld=true;assert.equal(network.inviteUrl('AB1234CD'),null);
});

test('account metadata and authentication use cookie credentials and never persist a password',async()=>{
 const calls=[],writes=[];
 const network=new NetworkClient(new Game({storage:null}),{baseUrl:'https://play.example.test',storage:{getItem:()=>null,setItem:(...args)=>writes.push(args)},fetchImpl:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.endsWith('/api/account')?{account:{id:'account',username:'ember',level:1}}:{ok:true}};}});
 await network.loginAccount({username:'ember',password:'a-demo-passphrase'});
 assert.equal(network.accountStatus,'authenticated');assert.equal(calls[0].options.credentials,'include');assert.equal(calls[1].options.credentials,'include');assert.deepEqual(writes,[]);
});

test('public HTTP binding rejects account passwords even with spoofed forwarded headers',async()=>{
 const running=await startServer({host:'0.0.0.0',port:0,storagePath:null,autoTick:false});
 try{
  const base=`http://127.0.0.1:${running.port}`;
  const meta=await fetch(base+'/api/account').then(r=>r.json());assert.equal(meta.requiresHTTPS,true);assert.equal(meta.account,null);
  const response=await fetch(base+'/api/account/register',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-Proto':'https'},body:JSON.stringify({username:'publicProbe',password:'test-only-passphrase',playerName:'Probe',classId:'guardian'})});
  assert.equal(response.status,426);assert.equal(response.headers.get('set-cookie'),null);assert.equal(running.hub.accounts.records.size,0);
 }finally{await running.close();}
});

test('a configured public HTTPS link cannot enable plaintext accounts through omitted flags',async()=>{
 const running=await startServer({host:'0.0.0.0',port:0,storagePath:null,autoTick:false,accountOptions:accountTransportOptions({EMBERFALL_SECURE_ORIGIN:'https://play.example.test:9443'})});
 try{
  assert.equal(running.hub.accounts.requireSecure,true);assert.equal(running.hub.accounts.cookieSecure,true);
  const response=await fetch(`http://127.0.0.1:${running.port}/api/account/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'publicProbe',password:'test-only-passphrase'})});assert.equal(response.status,426);
 }finally{await running.close();}
});

test('account requests and event streams bind this tab to its connected character',async()=>{
 const calls=[],streams=[];
 const game=new Game({storage:null});
 const network=new NetworkClient(game,{baseUrl:'https://play.example.test',storage:null,EventSourceImpl:class{constructor(url,options){streams.push({url,options});}addEventListener(){}close(){}},fetchImpl:async(url,options)=>{calls.push({url,options});return{ok:true,json:async()=>({accepted:true})};}});
 network.accountOwned=true;network.active=true;network.playerId='owned-character';network._openSnapshotStream();
 await network._request('/api/account/play/command',{type:'input',keys:[],angle:0});
 assert.match(streams[0].url,/playerId=owned-character/);assert.equal(streams[0].options.withCredentials,true);
 assert.equal(calls[0].options.headers['X-Emberfall-Player-Id'],'owned-character');assert.equal(calls[0].options.credentials,'include');
});

test('a changed account cookie disconnects the old tab character before new metadata appears',async()=>{
 const network=new NetworkClient(new Game({storage:null}),{baseUrl:'https://play.example.test',storage:null,fetchImpl:async()=>({ok:true,json:async()=>({account:{id:'new-account',username:'new'}})})});
 network.account={id:'old-account'};network.accountOwned=true;network.active=true;let disconnected=false;
 network.disconnect=async options=>{assert.deepEqual(options,{leave:false,logout:true});disconnected=true;network.active=false;network.accountOwned=false;};
 await network.refreshAccount();assert.equal(disconnected,true);assert.equal(network.account.id,'new-account');assert.equal(network.active,false);
});

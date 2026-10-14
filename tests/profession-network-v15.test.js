import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { cumulativeXp } from '../src/progression.js';
import { PROFESSIONS, PROFESSION_RECIPES, awardProfessionXp, newProfessionState } from '../src/professions.js';
import { PROFESSION_TRAINERS } from '../src/profession-system.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function roomGame(){const game=new Game({storage:null,random:()=>.5});game.world.enemies=[];return game;}
const memory=()=>{const values=new Map();let fail=false;return{getItem:key=>values.get(key)||null,setItem(key,value){if(fail)throw new Error('Isolated write failure');values.set(key,value);},setFailure:value=>{fail=value;}};};
async function fixture({storage=memory()}={}) {
  const hub=new MultiplayerHub({createGame:roomGame,autoStart:false,storage}),server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(route,body,headers={})=>{const response=await fetch(base+route,{headers:{...headers,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return{status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};};
  return{hub,server,base,storage,request,async close(){storage.setFailure(false);hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function guests(f){const first=(await f.request('/api/rooms',{playerName:'Apprentice'})).data,second=(await f.request(`/api/rooms/${first.roomCode}/join`,{playerName:'Companion'})).data;return[first,second];}
function teacher(game,id){const t=PROFESSION_TRAINERS[id];Object.assign(game.player,{x:t.x+24,y:t.y});}
function current(game){return clone({gold:game.player.gold,hp:game.player.hp,mana:game.player.mana,professions:game.professions,training:game.professionTraining,resources:game.resources,inventory:game.inventory,cooldowns:Object.fromEntries(Object.entries(game.cooldowns).filter(([,value])=>value>0))});}

test('HTTP teachers charge once and reject remote, injected state and wrong arity while leaving other characters untouched',async()=>{
  const f=await fixture();try {
    const [first,second]=await guests(f),member=f.hub.sessions.get(first.token),other=f.hub.sessions.get(second.token),route=`/api/session/${first.token}/command`,call=(name,args,extra={})=>f.request(route,{type:'method',name,args,...extra});
    assert.equal((await call('trainProfession',['alchemy'])).data.accepted,false);teacher(member.game,'alchemy');const gold=member.game.player.gold;
    for(const args of [[],[{}],[1],['alchemy',999]])assert.equal((await call('trainProfession',args)).status,400);
    assert.equal((await call('trainProfession',['alchemy'],{professions:{alchemy:{level:100}},gold:999})).status,400);
    assert.equal((await call('trainProfession',['alchemy'])).data.accepted,true);assert.equal(member.game.player.gold,gold-20);assert.equal((await call('trainProfession',['alchemy'])).data.accepted,false);assert.deepEqual(other.game.professionTraining,[]);
    const snapshot=(await f.request(`/api/session/${first.token}`)).data;assert.deepEqual(snapshot.professionTraining,['alchemy']);assert.deepEqual(snapshot.professions,member.game.professions);assert.equal(snapshot.professionXp,undefined);
    const clientGame=roomGame(),client=new NetworkClient(clientGame,{baseUrl:f.base,storage:null,fetchImpl:fetch,EventSourceImpl:null});client.applySnapshot(snapshot);assert.deepEqual(clientGame.professionTraining,['alchemy']);assert.deepEqual(clientGame.professions,member.game.professions);
  }finally{await f.close();}
});

test('HTTP crafting uses canonical output and profession requirements, never client materials or generated gear values',async()=>{
  const f=await fixture();try {
    const [first]=await guests(f),member=f.hub.sessions.get(first.token),game=member.game,route=`/api/session/${first.token}/command`,call=(name,args,extra={})=>f.request(route,{type:'method',name,args,...extra});
    game.gainXp(cumulativeXp(100));teacher(game,'smith');assert.equal((await call('trainProfession',['smith'])).data.accepted,true);game.professions=awardProfessionXp(game.professions,'smith',1e9,{playerLevel:100}).state;
    const recipe=PROFESSION_RECIPES.find(recipe=>recipe.id==='forge_frontier_weapon');for(const [id,count]of Object.entries(recipe.ingredients))game.resources[id]=count;
    const before=current(game);assert.equal((await call('craft',[recipe.id],{output:{level:100,stats:{damage:9999}}})).status,400);assert.deepEqual(current(game),before);
    assert.equal((await call('craft',[recipe.id,99999])).status,400);assert.equal((await call('craft',[recipe.id])).data.accepted,true);
    const item=Object.values(game.generatedItems).find(item=>item.craftedRecipe===recipe.id);assert.ok(item);assert.equal(item.level,recipe.outputProfile.level);assert.equal(game.canEquipItem(item.id),true);
    for(const id of Object.keys(recipe.ingredients))assert.equal(game.resources[id],0);assert.equal((await call('craft',[recipe.id])).data.accepted,false);
    game.resources.ruby_t2=1;assert.equal((await call('socket',[item.id,'ruby_t2'])).data.accepted,true);assert.deepEqual(item.sockets[0],{id:'ruby',tier:2});assert.equal((await call('socket',[item.id,{id:'ruby',tier:3}])).status,400);
  }finally{await f.close();}
});

test('paid training and mastery transactions roll back gold, chosen bonuses, health and notices after persistence failure',async()=>{
  const f=await fixture();try {
    const [first]=await guests(f),member=f.hub.sessions.get(first.token),game=member.game,route=`/api/session/${first.token}/command`,call=(name,args)=>f.request(route,{type:'method',name,args});teacher(game,'smith');
    let before=current(game),events=clone(member.events);f.storage.setFailure(true);assert.equal((await call('trainProfession',['smith'])).status,503);assert.deepEqual(current(game),before);assert.deepEqual(member.events,events);
    f.storage.setFailure(false);assert.equal((await call('trainProfession',['smith'])).data.accepted,true);game.gainXp(cumulativeXp(100));game.professions=awardProfessionXp(game.professions,'smith',1e9,{playerLevel:100}).state;
    assert.equal((await call('chooseProfessionMastery',['smith','armorer'])).data.accepted,true);game.damagePlayer(50,{trueDamage:true,ignoreInvulnerability:true});delete game.player.lastDamageAt;game.cooldowns.nova=4;before=current(game);const statsBefore=game.stats();events=clone(member.events);f.storage.setFailure(true);
    assert.equal((await call('chooseProfessionMastery',['smith','weaponsmith'])).status,503);assert.deepEqual(current(game),before);assert.deepEqual(member.events,events);assert.deepEqual(game.stats(),statsBefore);
    f.storage.setFailure(false);delete game.player.lastDamageAt;assert.equal((await call('chooseProfessionMastery',['smith','weaponsmith'])).data.accepted,true);assert.equal(game.player.hp,before.hp);assert.equal(game.cooldowns.nova,4);
    for(const args of [[],['smith'],['smith','armorer','extra'],['smith',{}]])assert.equal((await call('chooseProfessionMastery',args)).status,400);
  }finally{await f.close();}
});

test('account profession progress, regional materials and mastery survive SSE, native restart and group transfer with one canonical actor',async()=>{
  const f=await fixture();try {
    const registered=await f.request('/api/account/register',{username:'profession_audit',password:'isolated-native-fixture-15',playerName:'Crafter',classId:'guardian'});assert.equal(registered.status,201);
    const cookie=registered.cookie,account=f.hub.accounts.names.get('profession_audit'),member=f.hub.accountMembers.get(account),game=member.game,headers={Cookie:cookie,'X-Emberfall-Player-Id':member.id};game.gainXp(cumulativeXp(100));teacher(game,'runecraft');
    assert.equal((await f.request('/api/account/play/command',{type:'method',name:'trainProfession',args:['runecraft']},headers)).data.accepted,true);game.professions=awardProfessionXp(game.professions,'runecraft',1e9,{playerLevel:100}).state;
    assert.equal((await f.request('/api/account/play/command',{type:'method',name:'chooseProfessionMastery',args:['runecraft','clarity']},headers)).data.accepted,true);game.resources.crystal_t4=12;assert.equal(f.hub.persist(),true);
    const controller=new AbortController(),response=await fetch(`${f.base}/api/account/play/events?playerId=${member.id}`,{headers:{Cookie:cookie},signal:controller.signal});assert.equal(response.status,200);const reader=response.body.getReader();let buffer='';
    while(!buffer.includes('\n\n'))buffer+=new TextDecoder().decode((await reader.read()).value);
    const snapshot=JSON.parse(buffer.split('\n').find(line=>line.startsWith('data: ')).slice(6));assert.deepEqual(snapshot.professionTraining,['runecraft']);assert.equal(snapshot.professions.runecraft.mastery,'clarity');controller.abort();
    const saved=current(game),restored=new MultiplayerHub({createGame:roomGame,autoStart:false,storage:f.storage,strictRestore:true});const continued=restored.accountMembers.get(account);assert.equal(continued.id,member.id);assert.deepEqual(current(continued.game),saved);
    const target={code:'ABCDEF12',name:'Transfer',createdAt:Date.now(),lastActive:Date.now(),time:0,members:new Map(),world:null};restored.rooms.set(target.code,target);restored._createMember(target,{playerName:'Companion'});const id=continued.id;restored._transferAccount(continued,target);assert.equal(continued.id,id);assert.deepEqual(continued.game.professions,game.professions);assert.deepEqual(continued.game.professionTraining,['runecraft']);assert.equal(continued.game.resources.crystal_t4,12);restored.dispose();
  }finally{await f.close();}
});

test('the browser bridge waits for training and mastery authority results rather than changing local gold or bonuses',async()=>{
  const game=roomGame(),client=new NetworkClient(game,{storage:null,baseUrl:'https://play.example.test',EventSourceImpl:null,fetchImpl:async()=>{}}),calls=[];game.start();teacher(game,'smith');client.active=true;client.command=(...args)=>{calls.push(args);return Promise.resolve(true);};client._install();
  const gold=game.player.gold,training=game.trainProfession('smith'),mastery=game.chooseProfessionMastery('smith','armorer');assert.ok(training instanceof Promise);assert.ok(mastery instanceof Promise);assert.equal(await training,true);assert.equal(await mastery,true);assert.deepEqual(calls,[['trainProfession','smith'],['chooseProfessionMastery','smith','armorer']]);assert.equal(game.player.gold,gold);assert.deepEqual(game.professions,newProfessionState());
});

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { CLASSES } from '../src/classes.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { COMBAT_SUSTAIN } from '../src/balance.js';

const ROOM_KEY='emberfall.multiplayer.v1';
const clone=value=>JSON.parse(JSON.stringify(value));
function memory(initial={}){
  const values=new Map(Object.entries(initial));let writes=0;
  return {getItem:key=>values.get(key)??null,setItem(key,value){values.set(key,value);writes++;},get writes(){return writes;},snapshot:()=>Object.fromEntries(values)};
}
function sparseGame(){
  const game=new Game({storage:null,random:()=>.5}),initialize=game.initialize.bind(game);
  game.initialize=()=>{initialize();game.world.enemies=[];};game.world.enemies=[];return game;
}
async function fixture(storage=memory()){
  const hub=new MultiplayerHub({createGame:sparseGame,storage,autoStart:false,clock:()=>1700000000000});let closed=false;
  const server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(route,body)=>{const response=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  return {hub,storage,base,request,game:session=>hub.sessions.get(session.token).game,
    method:(session,name,args=[])=>request(`/api/session/${session.token}/command`,{type:'method',name,args}),
    get:session=>request(`/api/session/${session.token}`),
    async close(){if(closed)return;closed=true;hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
async function players(f){
  const first=await f.request('/api/rooms',{name:'Rettungsbelege',playerName:'Schuldner',classId:'guardian'});assert.equal(first.status,201);
  const second=await f.request(`/api/rooms/${first.data.roomCode}/join`,{playerName:'Goldträger',classId:'guardian'});assert.equal(second.status,201);
  return [first.data,second.data];
}
function prepare(game,{level=25,gold=3,xp=19}={}){game.player.level=level;game.player.gold=gold;game.player.xp=xp;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.player.shield=0;game.player.invulnerable=0;}
function fall(game){game.damagePlayer(100000,{trueDamage:true,ignoreInvulnerability:true});assert.equal(game.dead,true);assert.equal(game.player.hp,0);return game.deathSummary();}
const financial=game=>({gold:game.player.gold,xp:game.player.xp,penalty:clone(game.deathPenalty)});
const storedMember=(raw,session)=>JSON.parse(raw[ROOM_KEY]).rooms.flatMap(room=>room.members).find(member=>member.token===session.token);

test('a real fatal hit persists both personal receipts before tick or dispose and restores each dead token exactly once',async()=>{
  const original=await fixture();let restored;
  try{
    const [first,second]=await players(original),a=original.game(first),b=original.game(second);
    prepare(a);prepare(b,{level:1,gold:77,xp:11});const bBefore=financial(b),writes=original.storage.writes;
    const receiptA=fall(a);
    assert.equal(original.hub.frames,0);assert.ok(original.storage.writes>writes,'onDeath writes synchronously, before any tick, GET or disposal');
    let frozen=original.storage.snapshot(),savedA=storedMember(frozen,first),savedB=storedMember(frozen,second);
    assert.equal(savedA.save.player.hp,0);assert.equal(savedA.save.deathPenalty.lastReceipt.pendingRescue,true);assert.deepEqual(savedA.save.deathPenalty,a.deathPenalty);
    assert.equal(savedA.save.player.gold,0);assert.equal(receiptA.lastReceipt.goldLost,3);assert.equal(receiptA.debt,15);assert.deepEqual(financial(b),bBefore);assert.equal(savedB.save.player.gold,77);
    const writesAfterA=original.storage.writes,receiptB=fall(b);assert.ok(original.storage.writes>writesAfterA);assert.equal(original.hub.frames,0);
    frozen=original.storage.snapshot();savedA=storedMember(frozen,first);savedB=storedMember(frozen,second);
    assert.equal(savedA.save.player.hp,0);assert.equal(savedB.save.player.hp,0);assert.equal(savedB.save.player.gold,69);assert.equal(receiptB.lastReceipt.goldLost,8);assert.equal(receiptB.debt,0);assert.equal(savedA.save.deathPenalty.debt,15);
    // Freeze the actually persisted dead image BEFORE disposal can write again.
    const restartStorage=memory(frozen);await original.close();restored=await fixture(restartStorage);
    for(const [session,expected,gold] of [[first,receiptA,0],[second,receiptB,69]]){
      assert.ok(restored.hub.sessions.has(session.token),'The old HTTP token survives fresh-hub restoration');
      const result=await restored.get(session);assert.equal(result.status,200);assert.equal(result.data.dead,false);assert.equal(result.data.player.hp,result.data.party.find(player=>player.id===session.playerId).maxHp);
      assert.equal(result.data.player.gold,gold);assert.equal(result.data.deathPenalty.debt,expected.debt);assert.equal(result.data.deathPenalty.deaths,expected.deaths);
      assert.deepEqual(result.data.deathPenalty.lastReceipt,{...expected.lastReceipt,pendingRescue:false});
      const before=financial(restored.game(session));for(let attempt=0;attempt<2;attempt++){const duplicate=await restored.method(session,'respawn');assert.equal(duplicate.status,200);assert.equal(duplicate.data.accepted,false);assert.deepEqual(financial(restored.game(session)),before);}
      assert.equal((await restored.get(session)).data.deathPenalty.deaths,expected.deaths);
    }
  }finally{if(restored)await restored.close();else await original.close();}
});

test('NetworkClient imports personal debt from actual HTTP snapshots without sharing the other player wallet or charging on replay',async()=>{
  const f=await fixture();try{
    const [first,second]=await players(f);prepare(f.game(first));prepare(f.game(second),{level:1,gold:77,xp:11});fall(f.game(first));
    const [a,b]=await Promise.all([f.get(first),f.get(second)]);assert.equal(a.status,200);assert.equal(b.status,200);
    const firstClient=new NetworkClient(sparseGame(),{baseUrl:f.base,storage:null}),secondClient=new NetworkClient(sparseGame(),{baseUrl:f.base,storage:null});
    firstClient.applySnapshot(a.data);secondClient.applySnapshot(b.data);assert.equal(firstClient.game.deathSummary().debt,15);assert.equal(firstClient.game.player.gold,0);assert.equal(secondClient.game.deathSummary().debt,0);assert.equal(secondClient.game.player.gold,77);
    const before=financial(firstClient.game);firstClient.applySnapshot(a.data);assert.deepEqual(financial(firstClient.game),before,'Receiving a death event twice never runs a second fee');
    const response=await f.method(first,'respawn');assert.equal(response.status,200);assert.equal(response.data.accepted,true);firstClient.applySnapshot((await f.get(first)).data);
    assert.equal(firstClient.game.dead,false);assert.equal(firstClient.game.deathSummary().lastReceipt.pendingRescue,false);assert.equal(firstClient.game.deathSummary().debt,15);assert.equal(firstClient.game.player.gold,0);
    assert.equal((await f.method(first,'respawn')).data.accepted,false);assert.equal((await f.get(second)).data.player.gold,77);
  }finally{await f.close();}
});

test('invalid rescue arguments and forged wallet or debt fields cannot revive or alter the charged receipt',async()=>{
  const f=await fixture();try{
    const [first,second]=await players(f);prepare(f.game(first));fall(f.game(first));const before=financial(f.game(first)),otherBefore=financial(f.game(second));
    for(const args of [[0],['erase-debt'],[true],[null],[0,0]]){
      const result=await f.method(first,'respawn',args);assert.equal(result.status,400,`respawn accepts zero arguments: ${JSON.stringify(args)}`);assert.equal(f.game(first).dead,true);assert.deepEqual(financial(f.game(first)),before);
    }
    for(const payload of [{type:'input',keys:[],angle:0,gold:999999,deathPenalty:{version:1,deaths:0,debt:0,repayQuarters:0,lastReceipt:null}},{type:'method',name:'respawn',args:[],debt:0},{type:'method',name:'gainGold',args:[999999]}]){
      const result=await f.request(`/api/session/${first.token}/command`,payload);assert.equal(result.status,400);assert.deepEqual(financial(f.game(first)),before);
    }
    const valid=await f.method(first,'respawn');assert.equal(valid.status,200);assert.equal(valid.data.accepted,true);assert.deepEqual(financial(f.game(first)),{...before,penalty:{...before.penalty,lastReceipt:{...before.penalty.lastReceipt,pendingRescue:false}}});
    const alive=financial(f.game(first));for(const args of [[0],['erase-debt'],[null]]){const rejected=await f.method(first,'respawn',args);assert.equal(rejected.status,400);assert.deepEqual(financial(f.game(first)),alive);}
    assert.deepEqual(financial(f.game(second)),otherBefore);
  }finally{await f.close();}
});

const nearly=(actual,expected)=>assert.ok(Number.isFinite(actual)&&Math.abs(actual-expected)<1e-7,`${actual} != ${expected}`);
async function learnOnServer(f,session,id,rank=1){
  const game=f.game(session),talent=CLASSES.find(cls=>cls.id===game.player.classId).talents.find(talent=>talent.id===id);assert.ok(talent,id);
  for(const requirement of !talent.requires?[]:Array.isArray(talent.requires)?talent.requires:[talent.requires])await learnOnServer(f,session,typeof requirement==='string'?requirement:requirement.id,typeof requirement==='string'?talent.requiresRank||1:requirement.rank||1);
  while((game.skills[id]||0)<rank){const learned=await f.method(session,'learn',[id]);assert.equal(learned.status,200);assert.equal(learned.data.accepted,true,id);}
}

test('a native HTTP hit exports spent owner leech, fractional server recovery and canonical PvP travel without a fresh burst',async()=>{
  const f=await fixture();try{
    const [first,second]=await players(f),game=f.game(first);prepare(game,{level:100,gold:45,xp:0});game.player.skillPoints=200;
    await learnOnServer(f,first,'guardian_siphon',3);assert.equal(game.stats().lifeSteal,.08);
    game.player.face=0;game.player.hp=game.stats().maxHp/2;const hp=game.player.hp,rate=game.stats().maxHp*COMBAT_SUSTAIN.leechMaxHpPerSecond;
    const targets=Array.from({length:5},(_,index)=>{const target=createBestiaryEnemy('wolf',`network-leech-${index}`,game.player.x+20+index*6,game.player.y,{level:100,region:'daemmerhain'});target.rewardless=true;game.world.enemies.push(target);return {target,hp:target.hp};});
    const hit=await f.request(`/api/session/${first.token}/command`,{type:'action',name:'attack'});assert.equal(hit.status,200);assert.equal(hit.data.accepted,true);
    assert.ok(targets.filter(({target,hp:before})=>target.hp<before).length>=3,'The native swing really damages several canonical enemies');nearly(game.player.hp-hp,rate);nearly(game.currentLeechCredit(),0);
    const exhausted=await f.get(first);assert.equal(exhausted.status,200);nearly(exhausted.data.leechCredit,0);
    const client=new NetworkClient(sparseGame(),{baseUrl:f.base,storage:null});client.applySnapshot(exhausted.data);nearly(client.game.capture().leechCredit,0);nearly(client.game.currentLeechCredit(),0);
    // Advancing real shared simulation time, rather than editing a saved budget,
    // must recover only a quarter of the one-second burst.
    game.world.enemies=[];for(const dt of [.04,.04,.04,.04,.04,.04,.01])f.hub.tick(dt);
    const delayed=await f.get(first);nearly(delayed.data.time,.25);nearly(delayed.data.leechCredit,.25);
    const recoveredClient=new NetworkClient(sparseGame(),{baseUrl:f.base,storage:null});recoveredClient.applySnapshot(exhausted.data);recoveredClient.applySnapshot(delayed.data);nearly(recoveredClient.game.capture().leechCredit,.25);nearly(recoveredClient.game.leechBudget.time,delayed.data.time);
    const freshClient=new NetworkClient(sparseGame(),{baseUrl:f.base,storage:null});freshClient.applySnapshot(delayed.data);nearly(freshClient.game.capture().leechCredit,.25);nearly(freshClient.game.leechBudget.time,delayed.data.time);
    const exported=clone(freshClient.game.capture()),loaded=sparseGame();loaded.applySave(exported);nearly(loaded.currentLeechCredit(),.25);
    const target=createBestiaryEnemy('wolf','imported-leech',loaded.player.x+30,loaded.player.y,{level:100,region:'daemmerhain'});target.rewardless=true;loaded.world.enemies.push(target);const before=loaded.player.hp;
    assert.ok(loaded.hitEnemy(target,2000,0)>0);nearly(loaded.player.hp-before,loaded.stats().maxHp*COMBAT_SUSTAIN.leechMaxHpPerSecond*.25);nearly(loaded.capture().leechCredit,0);
    // The original client is deliberately stale at credit zero. The arena's
    // authoritative travel save must preserve the newer owner budget instead.
    nearly(client.game.capture().leechCredit,0);const invite=await f.method(first,'pvpInvite',[second.playerId]);assert.equal(invite.status,200);assert.equal(invite.data.accepted,true);
    const invitation=(await f.get(second)).data.pvp.invites[0];assert.ok(invitation);assert.equal((await f.method(second,'pvpAccept',[invitation.id])).data.accepted,true);
    const arena=await f.get(first);assert.equal(arena.data.worldMode,'pvp');nearly(arena.data.pvpTravelSave.leechCredit,.25);client.applySnapshot(arena.data);nearly(client.game.capture().leechCredit,.25);
    assert.equal((await f.method(second,'pvpForfeit')).data.accepted,true);assert.equal((await f.method(first,'pvpReturn')).data.accepted,true);
    const returned=await f.get(first);assert.equal(returned.data.worldMode,'overworld');nearly(returned.data.leechCredit,.25);client.applySnapshot(returned.data);nearly(client.game.capture().leechCredit,.25);nearly(client.game.leechBudget.time,returned.data.time);
  }finally{await f.close();}
});

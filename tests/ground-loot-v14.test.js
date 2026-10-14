import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { generateLoot } from '../src/loot.js';

function arena() {
  const game=new Game({storage:null,random:()=>.2});game.start();
  for(const key of ['trees','rocks','structures','enemies','nodes','plots','chests','shrines','interactions','worldEvents','eventObjects','dungeonEntrances'])game.world[key]=[];
  game.npcs=[];Object.assign(game.player,{x:900,y:700});return game;
}
let serial=0;
const loot=()=>generateLoot({level:27,baseId:'iron_longsword',classId:'guardian',rarity:'rare',rng:()=>.5,uid:`ground-v14-${++serial}`});
function ground(game,{item=loot(),ownerId=game.player.id||'local',distance=60,life=120,pickupAfter}={}) {
  const drop={x:game.player.x+distance,y:game.player.y,item:item.id,loot:item,ownerId,life,...(pickupAfter===undefined?{}:{pickupAfter})};game.drops.push(drop);return drop;
}

test('E names and picks the actual owned ground roll once without equipping or immediate save work',()=>{
  const game=arena(),drop=ground(game),equipment=structuredClone(game.equipment),notices=[];let writes=0;
  game.onNotice=(...args)=>notices.push(args);game.save=()=>writes++;
  assert.equal(game.nearby().kind,'loot');assert.equal(game.nearby().object,drop);assert.equal(game.nearby().label,`${drop.loot.name} aufnehmen`);
  const roll=structuredClone(drop.loot);assert.equal(game.interact(),true);assert.equal(game.inventory[drop.item],1);assert.deepEqual(game.item(drop.item),roll);assert.deepEqual(game.equipment,equipment);assert.equal(writes,0);
  assert.equal(game.pickupLoot(drop.item),false);assert.equal(game.inventory[drop.item],1);assert.deepEqual(notices,[[`${drop.loot.name} gefunden`,'loot',drop.item]]);
});

test('nearby and pickup reject foreign, distant, expired, airborne and mismatched ground objects',()=>{
  const game=arena(),foreign=ground(game,{ownerId:'someone-else'}),far=ground(game,{distance:85}),expired=ground(game,{life:0}),air=ground(game,{pickupAfter:game.time+.55}),mismatch=ground(game),inherited=ground(game);mismatch.loot=loot();inherited.item='toString';delete inherited.loot;
  for(const drop of [foreign,far,expired,air,mismatch,inherited])assert.equal(game.pickupLoot(drop.item),false,drop.item);
  assert.equal(game.nearby(),null,'Invalid ground records do not become interactive labels either');
  for(const invalid of [null,{},[],123,'','x'.repeat(121)])assert.equal(game.pickupLoot(invalid),false);
  assert.equal(game.pickupLoot(mismatch.item,'extra'),false);assert.equal(Object.keys(game.generatedItems).length,0);
  const forged=ground(game);forged.loot.stats.damage=Infinity;assert.equal(game.pickupLoot(forged.item),false);assert.equal(Object.keys(game.generatedItems).length,0);
});

test('pickup requires a living active non-PvP journey and preserves untouched inventory on denial',()=>{
  const game=arena(),drop=ground(game),before=structuredClone(game.inventory);
  for(const [key,value] of [['started',false],['paused',true],['dead',true],['worldMode','pvp']]){const previous=game[key];game[key]=value;assert.equal(game.pickupLoot(drop.item),false,key);game[key]=previous;}
  const hp=game.player.hp;game.player.hp=0;assert.equal(game.pickupLoot(drop.item),false);game.player.hp=hp;
  game.world.isPvp=true;assert.equal(game.pickupLoot(drop.item),false);delete game.world.isPvp;
  assert.deepEqual(game.inventory,before);assert.equal(drop.life,120);
});

test('full bags warn once across manual and automatic attempts and retain the existing expiry',()=>{
  const game=arena(),notices=[];game.onNotice=text=>notices.push(text);
  for(let i=0;i<240;i++)assert.equal(game.addItem(loot()),true);
  const drop=ground(game,{distance:0});assert.equal(game.pickupLoot(drop.item),false);assert.equal(game.pickupLoot(drop.item),false);game.updateWorld(.04);
  assert.equal(notices.filter(text=>text==='Dein Gepäck ist voll. Die Beute liegt noch am Boden.').length,1);assert.equal(game.inventory[drop.item]||0,0);assert.equal(game.drops.length,1);assert.ok(drop.life<120);
  const freed=Object.keys(game.generatedItems)[0];assert.equal(game.salvage(freed),true);game.updateWorld(.04);assert.equal(game.inventory[drop.item],1);assert.equal(game.drops.length,0);
});

test('a real native attack kill creates a visible roll before automatic or E pickup can consume it',()=>{
  const game=new Game({storage:null,random:()=>.2}),enemy=game.world.enemies.find(enemy=>enemy.type==='wolf');assert.ok(enemy);game.start();
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','interactions','worldEvents','eventObjects','dungeonEntrances'])game.world[key]=[];
  game.npcs=[];game.world.enemies=[enemy];Object.assign(game.player,{x:enemy.x-10,y:enemy.y,face:0});
  // Native attacks and cooldown updates use the canonical wolf HP; no forced kill
  // or altered health/damage budget is used to manufacture this loot transition.
  for(let count=0;enemy.alive&&count<500;count++){game.action('attack');game.update(.04,{simulateWorld:false});}
  assert.equal(enemy.alive,false);assert.equal(game.drops.length,1);const drop=game.drops[0],spawnTime=drop.pickupAfter-.55;
  game.keys.add(drop.x>=game.player.x?'d':'a');while(Math.hypot(drop.x-game.player.x,drop.y-game.player.y)>=30&&game.time<drop.pickupAfter)game.update(.04,{simulateWorld:false});game.keys.clear();
  assert.ok(drop.pickupAfter>game.time);assert.equal(game.pickupLoot(drop.item),false);game.updateWorld(.04);assert.equal(game.inventory[drop.item]||0,0);assert.equal(game.drops.length,1);
  while(game.time-spawnTime<.55){game.update(.04,{simulateWorld:false});game.updateWorld(.04);}
  assert.equal(game.inventory[drop.item],1);assert.equal(game.drops.length,0);
});

async function serverFixture() {
  const hub=new MultiplayerHub({createGame:arena,autoStart:false}),server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:response.status,data:await response.json()};};
  const first=(await post('/api/rooms',{name:'Lootprobe',playerName:'Owner'})).data,second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Other'})).data;
  const owner=hub.sessions.get(first.token),other=hub.sessions.get(second.token);Object.assign(owner.game.player,{x:900,y:700});Object.assign(other.game.player,{x:900,y:700});
  return{hub,base,post,owner,other,first,second,async close(){hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}

test('real HTTP pickup rejects foreign ownership, malformed payloads, distance and expiry and pays exactly once',async()=>{
  const f=await serverFixture();try {
    const drop=ground(f.owner.game);f.hub._syncRoom(f.owner.room,f.owner.game);
    const command=(session,args,extra={})=>f.post(`/api/session/${session.token}/command`,{type:'method',name:'pickupLoot',args,...extra});
    assert.equal((await command(f.second,[drop.item])).data.accepted,false);assert.equal(f.other.game.inventory[drop.item]||0,0);
    for(const args of [[],[drop.item,'extra'],[{}],[1],['']])assert.equal((await command(f.first,args)).status,400);
    assert.equal((await command(f.first,[drop.item],{loot:{stats:{damage:999999}}})).status,400);
    drop.x=f.owner.game.player.x+85;assert.equal((await command(f.first,[drop.item])).data.accepted,false);drop.x=f.owner.game.player.x+60;
    drop.life=0;assert.equal((await command(f.first,[drop.item])).data.accepted,false);drop.life=120;
    drop.pickupAfter=f.owner.game.time+.55;assert.equal((await command(f.first,[drop.item])).data.accepted,false);delete drop.pickupAfter;
    const original=structuredClone(drop.loot),equipment=structuredClone(f.owner.game.equipment);
    assert.equal((await command(f.first,[drop.item])).data.accepted,true);assert.equal((await command(f.first,[drop.item])).data.accepted,false);
    assert.equal(f.owner.game.inventory[drop.item],1);assert.deepEqual(f.owner.game.item(drop.item),original);assert.deepEqual(f.owner.game.equipment,equipment);assert.equal(f.other.game.inventory[drop.item]||0,0);
    const notice=f.owner.events.find(event=>event.itemId===drop.item);assert.equal(notice.text,`${original.name} gefunden`);assert.equal(f.other.events.some(event=>event.itemId===drop.item),false);
    f.owner.game.notice('Arbitrary notice','loot','missing-item');assert.equal(f.owner.events.at(-1).itemId,undefined);
  } finally{await f.close();}
});

test('a real HTTP E interaction uses the same owned-roll path and the snapshot carries its optional item notice',async()=>{
  const f=await serverFixture();try {
    const drop=ground(f.owner.game);f.hub._syncRoom(f.owner.room,f.owner.game);
    const result=await f.post(`/api/session/${f.first.token}/command`,{type:'action',name:'interact'});assert.equal(result.data.accepted,true);
    const snapshot=await(await fetch(`${f.base}/api/session/${f.first.token}`)).json();assert.equal(snapshot.inventory[drop.item],1);assert.equal(snapshot.generatedItems[drop.item].name,drop.loot.name);assert.ok(snapshot.events.some(event=>event.itemId===drop.item));
    const game=arena(),notices=[],client=new NetworkClient(game,{baseUrl:f.base,storage:null,fetchImpl:fetch,EventSourceImpl:null});game.onNotice=(...args)=>notices.push(args);
    client.applySnapshot(snapshot);assert.ok(notices.some(args=>args[2]===drop.item));
    const bad=structuredClone(snapshot);bad.sequence++;bad.events.push({id:999,kind:'notice',text:'Not owned',tone:'loot',itemId:'loot:not-owned'});client.applySnapshot(bad);assert.deepEqual(notices.at(-1),['Not owned','loot']);
  } finally{await f.close();}
});

test('the production browser bridge intercepts pickupLoot instead of locally minting an inventory entry',()=>{
  const game=arena(),drop=ground(game),calls=[],client=new NetworkClient(game,{baseUrl:'https://play.example.test',storage:null,fetchImpl:async()=>{},EventSourceImpl:null});
  client.active=true;client.command=(...args)=>{calls.push(args);return Promise.resolve(true);};client._install();
  assert.equal(game.pickupLoot(drop.item),true);assert.deepEqual(calls,[['pickupLoot',drop.item]]);assert.equal(game.inventory[drop.item]||0,0);assert.equal(drop.life,120);
});

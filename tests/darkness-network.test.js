import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { NetworkClient } from '../src/network.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NPCS } from '../src/catalog.js';
import { getArsenalShopStock } from '../src/arsenal.js';
import { generateLoot } from '../src/loot.js';

const memoryStorage=()=>{const values=new Map();return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};
function sparseGame() {
  const game=new Game({storage:null,random:()=>.5});
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  return game;
}
async function fixture() {
  const storage=memoryStorage();let hub,server,base;
  const open=async()=>{
    hub=new MultiplayerHub({createGame:sparseGame,storage,autoStart:false});
    server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    base=`http://127.0.0.1:${server.address().port}`;
  };
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async token=>{const response=await fetch(`${base}/api/session/${token}`);assert.equal(response.status,200);return response.json();};
  const created=await post('/api/rooms',{name:'Aschetest',playerName:'Glutträger',classId:'guardian'});assert.equal(created.status,201);
  const session=created.data;
  return {
    session,post,get,storage,
    get hub(){return hub;},get base(){return base;},
    get game(){return hub.sessions.get(session.token).game;},
    method:(name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args}),
    async restart(){await close();await open();return get(session.token);},close,
  };
}
const approach=(game,object)=>{Object.assign(game.player,{x:object.x,y:object.y});};

test('HTTP arsenal shops offer current class gear, charge trusted prices and reject remote or locked goods',async()=>{
  const f=await fixture();
  try {
    f.game.npcs=NPCS;f.game.player.gold=1e7;f.game.player.level=100;
    for(const merchant of ['elin','sera','oren']) {
      approach(f.game,NPCS.find(npc=>npc.id===merchant));
      const stock=getArsenalShopStock({level:100,classId:'guardian',merchant});assert.ok(stock.length>0);
      const item=stock.find(candidate=>!['forest_blade','sentinel_mail','leather_armor','heal_potion','mana_potion','seed'].includes(candidate.id));assert.ok(item,`${merchant} offers expanded stock`);
      const gold=f.game.player.gold,count=f.game.inventory[item.id]||0;
      const bought=await f.method('buy',item.id);assert.equal(bought.status,200);assert.equal(bought.data.accepted,true);
      assert.equal(f.game.player.gold,gold-item.price);assert.equal(f.game.inventory[item.id],count+1);
      const beforeForged=f.game.player.gold;
      const forged=await f.method('buy',item.id,0);assert.equal(forged.data.accepted,true);
      assert.equal(f.game.player.gold,beforeForged-item.price,'A legacy second argument cannot change the trusted price');
      assert.equal(f.game.inventory[item.id],count+2,'A legacy second argument cannot change quantity');
    }
    const endgame=getArsenalShopStock({level:100,classId:'guardian',merchant:'elin'}).find(item=>(item.minLevel||item.level||1)>1);assert.ok(endgame);
    f.game.player.level=1;approach(f.game,NPCS.find(npc=>npc.id==='elin'));
    const before=f.game.player.gold;
    assert.equal((await f.method('buy',endgame.id)).status,409,'Unavailable stock rejects before mutation');
    assert.equal(f.game.player.gold,before);
    const alien=getArsenalShopStock({level:100,classId:'flamecaller',merchant:'elin'}).find(item=>item.classIds&&!item.classIds.includes('guardian'));assert.ok(alien);
    f.game.player.level=100;assert.equal((await f.method('buy',alien.id)).status,409);
    approach(f.game,{x:19000,y:14000});assert.equal((await f.method('buy',endgame.id)).status,409);
  } finally{await f.close();}
});

test('HTTP world interactions require approach, commit a shared reward once and persist after room restart',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Aschegefährte',classId:'ranger'});assert.equal(joined.status,201);
    const second=f.hub.sessions.get(joined.data.token).game;
    const object=f.game.world.interactions.find(candidate=>candidate.kind==='barrel');assert.ok(object,'The live world contains destructible barrels');
    approach(f.game,{x:object.x+500,y:object.y});
    const gold=f.game.player.gold;
    assert.equal((await f.method('interactWorldObject',object.id)).data.accepted,false);assert.equal(object.used,false);assert.equal(f.game.player.gold,gold);
    assert.equal((await f.method('interactWorldObject',object.id,99)).status,400);
    assert.equal((await f.method('interactWorldObject',123)).status,400);
    assert.equal((await f.method('interactWorldObject',{id:object.id,reward:99999})).status,400);
    approach(f.game,object);approach(second,object);
    assert.equal((await f.method('interactWorldObject',object.id)).data.accepted,true);assert.equal(object.used,true);
    const committed=f.game.player.gold;
    const repeated=await f.post(`/api/session/${joined.data.token}/command`,{type:'method',name:'interactWorldObject',args:[object.id]});
    assert.equal(repeated.data.accepted,false);assert.equal(f.game.player.gold,committed);
    const snapshot=await f.get(joined.data.token);
    assert.equal(snapshot.world.interactions.find(candidate=>candidate.id===object.id).used,true,'Both players receive shared depletion');
    const restored=await f.restart();
    assert.equal(restored.world.interactions.find(candidate=>candidate.id===object.id).used,true);
    assert.equal((await f.method('interactWorldObject',object.id)).data.accepted,false);
  } finally{await f.close();}
});

test('HTTP altar buffs stay personal, survive snapshots and expire against the authoritative room clock',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Gefährte',classId:'ranger'});assert.equal(joined.status,201);
    const altar=f.game.world.interactions.find(object=>object.kind==='altar');assert.ok(altar);
    approach(f.game,altar);f.game.resources.crystal=10;const unbuffed=f.game.stats();
    assert.equal((await f.method('interactWorldObject',altar.id)).data.accepted,true);
    const a=await f.get(f.session.token),b=await f.get(joined.data.token);
    assert.ok(a.buffs.length>0);assert.equal(b.buffs.length,0);
    assert.ok(a.buffs.every(buff=>Number.isFinite(buff.expiresAt)&&buff.expiresAt>a.time));
    assert.ok(Object.keys(unbuffed).some(key=>f.game.stats()[key]>unbuffed[key]),'The altar changes actual combat stats');
    const expiresAt=Math.max(...a.buffs.map(buff=>buff.expiresAt));
    const restored=await f.restart();assert.deepEqual(restored.buffs,a.buffs);assert.equal(restored.time,a.time);
    const remaining=expiresAt-restored.time;
    f.hub.rooms.get(f.session.roomCode).time=expiresAt-.04;
    f.game.time=expiresAt-.04;f.hub.tick(.04);
    assert.equal(f.game.buffs.length,0);assert.ok(remaining>0);
  } finally{await f.close();}
});

test('a shared cursed chest preserves its boss across restart and grants the chest reward only after a real combat kill',async()=>{
  const f=await fixture();
  try {
    const joined=await f.post(`/api/rooms/${f.session.roomCode}/join`,{playerName:'Zeuge',classId:'ranger'});assert.equal(joined.status,201);
    let chest=f.game.world.interactions.find(object=>object.kind==='cursed_chest');assert.ok(chest);
    approach(f.game,chest);const gold=f.game.player.gold;
    assert.equal((await f.method('interactWorldObject',chest.id)).data.accepted,true);
    assert.equal(chest.used,false);assert.equal(chest.active,true);assert.equal(f.game.player.gold,gold);
    assert.equal(f.game.world.enemies.filter(enemy=>enemy.challengeId===chest.id&&enemy.alive&&enemy.boss).length,1);
    assert.equal((await f.method('interactWorldObject',chest.id)).data.accepted,false);
    const restored=await f.restart();chest=f.game.world.interactions.find(object=>object.id===chest.id);
    assert.equal(chest.active,true);assert.equal(chest.used,false);
    let guards=f.game.world.enemies.filter(enemy=>enemy.challengeId===chest.id&&enemy.alive);assert.equal(guards.length,1,'Restoring two characters does not duplicate the shared guardian');
    const enemy=guards[0];
    // Only the trusted test fixture reduces HP; clients still use real combat.
    enemy.hp=1;Object.assign(f.game.player,{x:enemy.x-35,y:enemy.y,face:0});f.game.cooldowns.attack=0;
    const killed=await f.post(`/api/session/${f.session.token}/command`,{type:'action',name:'attack'});assert.equal(killed.data.accepted,true);assert.equal(enemy.alive,false);
    f.hub.tick(.04);assert.equal(chest.challengeCompleted,true);
    approach(f.game,chest);const beforeReward=f.game.player.gold,previousLoot=new Set(Object.keys(f.game.generatedItems));
    assert.equal((await f.method('interactWorldObject',chest.id)).data.accepted,true);assert.equal(chest.used,true);assert.ok(f.game.player.gold>beforeReward);
    const rewardId=Object.keys(f.game.generatedItems).find(id=>!previousLoot.has(id));assert.ok(rewardId,'The reward enters inventory before it is saved');
    const secondSnapshot=await f.get(joined.data.token);
    assert.equal(secondSnapshot.world.interactions.find(object=>object.id===chest.id)?.used,true,'Both nearby clients see the completed chest');
    assert.equal((await f.method('interactWorldObject',chest.id)).data.accepted,false);
    const rewardRestored=await f.restart();assert.equal(rewardRestored.world.interactions.find(object=>object.id===chest.id).used,true);
    assert.equal(rewardRestored.inventory[rewardId],1,'Restart cannot consume the chest while losing its guaranteed equipment');
    assert.ok(restored.world.interactions.some(object=>object.id===chest.id));
  } finally{await f.close();}
});

test('a full bag keeps a lever-unsealed cache intact until its trusted equipment can be received',async()=>{
  const f=await fixture();
  try {
    const lever=f.game.world.interactions.find(object=>object.kind==='lever');assert.ok(lever);
    const cache=f.game.world.interactions.find(object=>object.id===lever.linkedId);assert.ok(cache);
    approach(f.game,lever);assert.equal((await f.method('interactWorldObject',lever.id)).data.accepted,true);assert.equal(cache.locked,false);
    for(let index=0;index<240;index++)assert.equal(f.game.addItem(generateLoot({level:1,classId:'guardian',rng:()=>.5,uid:`cache-bag-${index}`})),true);
    assert.equal(f.game.bagUsed(),240);
    approach(f.game,cache);const gold=f.game.player.gold,dust=f.game.resources.dust;
    assert.equal((await f.method('interactWorldObject',cache.id)).data.accepted,false);
    assert.equal(cache.used,false);assert.equal(f.game.player.gold,gold);assert.equal(f.game.resources.dust,dust);
    f.game.inventory[Object.keys(f.game.generatedItems)[0]]=0;
    assert.equal((await f.method('interactWorldObject',cache.id)).data.accepted,true);assert.equal(cache.used,true);assert.equal(f.game.bagUsed(),240);
  } finally{await f.close();}
});

test('browser interaction commands reach the authority and server buffs replace local state',async()=>{
  const f=await fixture();
  class EventSourceStub {
    constructor(){queueMicrotask(()=>this.onopen?.());}
    addEventListener(){}
    close(){}
  }
  try {
    const local=sparseGame();local.start();
    const object=f.game.world.interactions.find(candidate=>candidate.kind==='barrel');approach(f.game,object);
    const network=new NetworkClient(local,{baseUrl:f.base,EventSourceImpl:EventSourceStub,storage:memoryStorage()});
    await network.connect({token:f.session.token,roomCode:f.session.roomCode,snapshot:await f.get(f.session.token)});await Promise.resolve();
    const localObject=local.world.interactions.find(candidate=>candidate.id===object.id);assert.equal(localObject.used,false);
    assert.equal(local.interactWorldObject(object.id),true);assert.equal(localObject.used,false,'The browser waits for authority instead of granting a reward');
    await network._actionQueue;assert.equal(object.used,true);
    network.applySnapshot(await f.get(f.session.token));assert.equal(local.world.interactions.find(candidate=>candidate.id===object.id).used,true);
    assert.equal(local.overworld,local.world);
    assert.deepEqual(local.interactionSummary(),f.game.interactionSummary(),'Global progress includes far-away objects omitted from the local world snapshot');
    assert.deepEqual(local.buffs,f.game.buffs);
    await network.disconnect();
    assert.equal(local.networkInteractionSummary,null,'Disconnect restores independent solo progress');
  } finally{await f.close();}
});

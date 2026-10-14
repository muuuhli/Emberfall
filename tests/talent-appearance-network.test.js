import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { NetworkClient } from '../src/network.js';
import { CLASSES, CLASS_TALENTS } from '../src/classes.js';
import { deriveCharacterAppearance, isCharacterAppearance } from '../src/character-appearance.js';
import { EQUIPMENT_SLOT_IDS } from '../src/equipment-system.js';
import { generateLoot } from '../src/loot.js';
import { PVP_STATS } from '../src/pvp.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)||null,setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};};
function sparseGame(){const game=new Game({storage:null,random:()=>.5}),init=game.initialize.bind(game),clear=()=>{for(const key of ['trees','rocks','structures','enemies'])game.world[key]=[];};game.initialize=()=>{init();clear();};clear();return game;}
async function fixture(){
  const storage=memory(),controllers=[];let now=Date.now(),hub,server,base;
  const open=async()=>{hub=new MultiplayerHub({createGame:sparseGame,clock:()=>now,storage,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{for(const controller of controllers)controller.abort();hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const first=(await post('/api/rooms',{playerName:'Ausrüstungswacht',classId:'guardian'})).data;
  const get=async session=>{const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();};
  return {first,post,get,close,get hub(){return hub;},get base(){return base;},game:session=>hub.sessions.get(session.token).game,
    method:(session,name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args}),action:(session,name)=>post(`/api/session/${session.token}/command`,{type:'action',name}),
    async join(classId){const result=await post(`/api/rooms/${first.roomCode}/join`,{playerName:`Zeuge ${classId}`,classId});assert.equal(result.status,201);return result.data;},
    step(seconds){for(let frame=0;frame<Math.ceil(seconds/.04);frame++){now+=40;hub.tick(.04);}},
    async restart(){await close();await open();},
    async stream(session){const controller=new AbortController();controllers.push(controller);const response=await fetch(`${base}/api/session/${session.token}/events`,{signal:controller.signal});assert.equal(response.status,200);const reader=response.body.getReader();let buffer='';return {async next(){for(;;){const end=buffer.indexOf('\n\n');if(end>=0){const block=buffer.slice(0,end);buffer=buffer.slice(end+2);const line=block.split('\n').find(value=>value.startsWith('data: '));if(line)return JSON.parse(line.slice(6));}const result=await reader.read();if(result.done)throw new Error('Snapshot stream ended');buffer+=new TextDecoder().decode(result.value);}}};},
  };
}
async function gear(f,session){const game=f.game(session);game.player.level=100;for(const slot of EQUIPMENT_SLOT_IDS){const item=generateLoot({level:100,classId:game.classId,slot,rarity:'legendary',rng:()=>.5,uid:`private-gear-${session.playerId}-${slot}`});assert.equal(game.addItem(item),true);assert.equal((await f.method(session,'equip',item.id)).data.accepted,true);}game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;}
async function learnTo(f,session,id,rank=1){const skill=CLASS_TALENTS.find(value=>value.id===id);assert.ok(skill);if(skill.requires)await learnTo(f,session,skill.requires,skill.requiresRank||1);while((f.game(session).skills[id]||0)<rank){const result=await f.method(session,'learn',id);assert.equal(result.status,200,result.data.error);assert.equal(result.data.accepted,true,id);}}
const persistent=game=>{const saved=clone(game.capture());delete saved.savedAt;return saved;};

test('eight actual HTTP clients receive bounded seven-slot derived looks and native action stamps through SSE without remote inventory leaks',async()=>{
  const f=await fixture();try {
    const sessions=[f.first];for(const cls of CLASSES.slice(1))sessions.push(await f.join(cls.id));for(const session of sessions)await gear(f,session);
    const extra=await f.post(`/api/rooms/${f.first.roomCode}/join`,{playerName:'Über Grenze',classId:'guardian'});assert.equal(extra.status,409);
    const observer=sessions.at(-1),stream=await f.stream(observer),snapshot=await stream.next();assert.equal(snapshot.party.length,8);
    for(const session of sessions){const remote=snapshot.party.find(player=>player.id===session.playerId),look=deriveCharacterAppearance(f.game(session));assert.deepEqual(remote.appearance,look);assert.equal(isCharacterAppearance(remote.appearance),true);assert.equal(Object.values(look.slots).filter(Boolean).length,7);assert.ok(JSON.stringify(look).length<=1200);assert.equal(remote.inventory,undefined);assert.equal(remote.generatedItems,undefined);assert.equal(remote.equipment,undefined);assert.equal(JSON.stringify(remote).includes(session.token),false);assert.equal(JSON.stringify(remote).includes('private-gear-'),false);}
    assert.ok(JSON.stringify(snapshot.party.map(player=>player.appearance)).length<=9600,'Eight cosmetic descriptors have a fixed small packet budget');
    const caster=sessions[1];assert.equal((await f.action(caster,'bolt')).data.accepted,true);f.step(.08);const action=await stream.next(),shown=action.party.find(player=>player.id===caster.playerId);
    assert.equal(shown.presentation.kind,'heal');assert.ok(shown.presentation.endAt-shown.presentation.startedAt<=4);assert.ok(shown.castUntil>shown.presentation.startedAt);
    const old=snapshot.party[0].appearance;assert.equal((await f.method(f.first,'unequip','helmet')).data.accepted,true);f.step(.08);const changed=await stream.next(),look=changed.party.find(player=>player.id===f.first.playerId).appearance;assert.equal(look.slots.helmet,null);assert.notEqual(look.key,old.key);assert.deepEqual(look,deriveCharacterAppearance(f.game(f.first)));
    await f.restart();await Promise.all(sessions.map(session=>f.get(session)));const restored=await f.get(observer);assert.equal(restored.party.length,8);assert.deepEqual(restored.party.find(player=>player.id===f.first.playerId).appearance,look);assert.ok(restored.party.every(player=>player.presentation===null),'Transient animations do not replay from persistent saves');
  }finally{await f.close();}
});

test('cosmetics and presentation cannot be forged over HTTP and the browser rejects noncanonical remote appearance descriptors',async()=>{
  const f=await fixture();try {
    const second=await f.join('ranger'),game=f.game(second),before=deriveCharacterAppearance(game);
    for(const body of [{type:'input',keys:[],angle:0,appearance:{classId:'guardian'}},{type:'action',name:'attack',presentation:{kind:'heal',endAt:999}},{type:'method',name:'setAppearance',args:['legendary']},{type:'method',name:'equip',args:[{id:'novice_bow',stats:{damage:9999}}]}])assert.equal((await f.post(`/api/session/${second.token}/command`,body)).status,400);
    assert.deepEqual(deriveCharacterAppearance(game),before);
    const local=sparseGame();class Source{addEventListener(){}close(){}}const client=new NetworkClient(local,{baseUrl:f.base,EventSourceImpl:Source,storage:memory()});
    const snapshot=await f.get(f.first);await client.connect({token:f.first.token,roomCode:f.first.roomCode,snapshot});assert.deepEqual(local.otherPlayers[0].appearance,before);
    const malformed=clone(snapshot);malformed.party.find(player=>player.id===second.playerId).appearance.slots.weapon.damage=99999;client.applySnapshot(malformed);assert.equal(local.otherPlayers[0].appearance,null);
    client.applySnapshot(snapshot);assert.deepEqual(local.otherPlayers[0].appearance,before);assert.equal((await f.method(second,'unequip','weapon')).data.accepted,true);client.applySnapshot(await f.get(f.first));assert.equal(local.otherPlayers[0].appearance.slots.weapon,null);
    await client.disconnect({leave:false});assert.deepEqual(local.otherPlayers,[]);
  }finally{await f.close();}
});

test('eight HTTP classes learn their own mechanical branches with real costs, reject rival or forged ranks and resume durable legal choices',async()=>{
  const f=await fixture();try {
    const sessions=[f.first];for(const cls of CLASSES.slice(1))sessions.push(await f.join(cls.id));const saves=[];
    for(const session of sessions){const game=f.game(session),cls=CLASSES.find(value=>value.id===game.classId),[support,oath,,rival]=cls.talents.filter(value=>value.combatDepth);game.player.level=100;game.player.skillPoints=198;game.player.hp=game.stats().maxHp;
      const look=deriveCharacterAppearance(game);assert.equal((await f.method(session,'learn',oath.id)).data.accepted,false);assert.equal((await f.method(session,'learn',oath.id,99)).status,400);
      const forged=await f.post(`/api/session/${session.token}/command`,{type:'method',name:'learn',args:[oath.id],skills:{[oath.id]:99},skillPoints:999});assert.equal(forged.status,400);
      await learnTo(f,session,support.id,2);const points=game.player.skillPoints;assert.equal((await f.method(session,'learn',oath.id)).data.accepted,true);assert.equal(game.player.skillPoints,points-5);
      await learnTo(f,session,rival.requires,2);const paid=game.player.skillPoints;assert.equal((await f.method(session,'learn',rival.id)).data.accepted,false);assert.equal(game.player.skillPoints,paid);
      const foreign=CLASS_TALENTS.find(value=>value.combatDepth&&value.classId!==cls.id);assert.equal((await f.method(session,'learn',foreign.id)).data.accepted,false);assert.deepEqual(deriveCharacterAppearance(game),look,'Talent power never changes equipped cosmetics');
      saves.push({session,skills:clone(game.skills),points:game.player.skillPoints,mods:game.combatTalentModifiers()});
    }
    await f.restart();for(const saved of saves){const snapshot=await f.get(saved.session);assert.equal(snapshot.skills[CLASSES.find(value=>value.id===snapshot.player.classId).talents.find(value=>value.combatDepth&&value.keystone).id],1);assert.equal(snapshot.player.skillPoints,saved.points);for(const [id,rank] of Object.entries(saved.skills))assert.equal(snapshot.skills[id],rank);assert.deepEqual(f.game(saved.session).combatTalentModifiers(),saved.mods);}
  }finally{await f.close();}
});

test('real PvP keeps original equipped looks and precise telegraph animations while talents and gear grant no arena strength or saved mutations',async()=>{
  const f=await fixture();try {
    const second=await f.join('ranger');await gear(f,f.first);await gear(f,second);const veteran=f.game(f.first);veteran.player.skillPoints=198;await learnTo(f,f.first,'guardian_gate_oath');
    for(const session of [f.first,second])Object.assign(f.game(session).player,{x:520+(session===second?28:0),y:1250});const original=[persistent(veteran),persistent(f.game(second))],looks=[deriveCharacterAppearance(veteran),deriveCharacterAppearance(f.game(second))];
    assert.equal((await f.method(f.first,'pvpInvite',second.playerId)).data.accepted,true);const invitation=(await f.get(second)).pvp.invites[0].id;assert.equal((await f.method(second,'pvpAccept',invitation)).data.accepted,true);f.step(3.04);
    let snapshot=await f.get(f.first);assert.equal(snapshot.worldMode,'pvp');assert.deepEqual(snapshot.pvpStats,PVP_STATS);assert.deepEqual(snapshot.player.appearance,looks[0]);assert.deepEqual(snapshot.party.find(player=>player.id===second.playerId).appearance,looks[1]);assert.equal(snapshot.party.find(player=>player.id===second.playerId).level,1);
    assert.equal((await f.action(f.first,'bolt')).data.accepted,true);snapshot=await f.get(second);const stamp=snapshot.party.find(player=>player.id===f.first.playerId).presentation;assert.equal(stamp.kind,'projectile');assert.ok(Math.abs(stamp.impactAt-stamp.startedAt-.4)<1e-8);assert.equal(snapshot.player.hp,300);f.step(.32);assert.equal((await f.get(second)).player.hp,300);f.step(1.4);assert.equal((await f.get(second)).player.hp,264,'A legendary talented hero still deals the same native arena 36 damage');
    assert.equal((await f.method(f.first,'equip',veteran.equipment.weapon)).data.accepted,false);assert.equal((await f.method(f.first,'learn','guardian_iron_momentum')).data.accepted,false);
    assert.equal((await f.method(second,'pvpForfeit')).data.accepted,true);await f.method(f.first,'pvpReturn');await f.method(second,'pvpReturn');
    for(const [index,session] of [f.first,second].entries()){const returned=await f.get(session);assert.equal(returned.worldMode,'overworld');assert.deepEqual(returned.party.find(player=>player.id===session.playerId).appearance,looks[index]);assert.deepEqual(persistent(f.game(session)),original[index]);}
  }finally{await f.close();}
});

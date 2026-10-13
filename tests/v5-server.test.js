import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { BESTIARY_ENEMIES, createBestiaryEnemy } from '../src/bestiary.js';
import { ENEMY_TYPES } from '../src/catalog.js';

async function fixture() {
  const saved=new Map(),storage={getItem:key=>saved.get(key)||null,setItem:(key,value)=>saved.set(key,value)};let hub,server,base;
  const open=async()=>{hub=new MultiplayerHub({autoStart:false,storage,createGame:()=>new Game({storage:null,random:()=>.5})});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const session=(await post('/api/rooms',{playerName:'Langzeitprobe',classId:'guardian'})).data;
  return {session,post,close,get hub(){return hub;},get game(){return hub.sessions.get(session.token).game;},
    method:(name,...args)=>post(`/api/session/${session.token}/command`,{type:'method',name,args}),
    async restart(mutate){await close();if(mutate)for(const [key,json] of saved){const data=JSON.parse(json);mutate(data);saved.set(key,JSON.stringify(data));}await open();const response=await fetch(`${base}/api/session/${session.token}`);assert.equal(response.status,200);return response.json();}};
}

test('HTTP audio and accessibility options require exact bools or finite bounded volume values',async()=>{
  const f=await fixture();try {
    const invalid=[['sound',1],['shake','yes'],['reducedMotion',0],['masterVolume',true],['musicVolume',1.01],['effectsVolume',-.01],['masterVolume',null],['invented',.5]];
    for(const [key,value] of invalid)assert.equal((await f.method('setSetting',key,value)).status,400);
    for(const [key,value] of [['sound',false],['shake',false],['reducedMotion',true],['masterVolume',0],['musicVolume',.35],['effectsVolume',1]]){assert.equal((await f.method('setSetting',key,value)).data.accepted,true);assert.equal(f.game.settings[key],value);}
    await f.restart();assert.equal(f.game.settings.masterVolume,0);assert.equal(f.game.settings.musicVolume,.35);assert.equal(f.game.settings.effectsVolume,1);assert.equal(f.game.settings.reducedMotion,true);
  }finally{await f.close();}
});

test('shared world restore preserves remaining optional champion rest and migrates old null deadlines without reviving story bosses',async()=>{
  const f=await fixture();try {
    const type=Object.keys(BESTIARY_ENEMIES).find(id=>BESTIARY_ENEMIES[id].boss&&BESTIARY_ENEMIES[id].baseType);
    const champion=createBestiaryEnemy(type,'server-rest-champion',2000,1400,{level:8,region:'daemmerhain'});
    const dead={...champion,alive:false,hp:0,respawnAt:281.5};f.game.time=81.5;f.hub.rooms.get(f.session.roomCode).time=81.5;f.game.world.enemies.push(dead);
    const story=f.game.world.enemies.find(enemy=>ENEMY_TYPES[enemy.type]?.boss&&!ENEMY_TYPES[enemy.type]?.baseType);assert.ok(story);story.alive=false;story.hp=0;story.respawnAt=Infinity;
    await f.restart();const restored=f.game.world.enemies.find(enemy=>enemy.id===dead.id);assert.equal(restored.alive,false);assert.equal(restored.respawnAt-f.game.time,200);
    await f.restart(data=>{const room=data.rooms[0];const actor=room.world.enemies.find(enemy=>enemy.id===dead.id);actor.respawnAt=null;for(const member of room.members)delete member.save.world.championRespawns;});
    const migrated=f.game.world.enemies.find(enemy=>enemy.id===dead.id);assert.equal(migrated.alive,false);assert.equal(migrated.respawnAt-f.game.time,360);
    const unchanged=f.game.world.enemies.find(enemy=>enemy.id===story.id);assert.equal(unchanged.alive,false);assert.ok(unchanged.respawnAt===null||unchanged.respawnAt===Infinity,'Authored story boss does not receive a champion cooldown');
  }finally{await f.close();}
});

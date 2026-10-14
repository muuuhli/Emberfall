import { MultiplayerHub } from '../../server/multiplayer.mjs';
import { Game } from '../../src/game.js';
import { CLASSES } from '../../src/classes.js';
import { DUNGEONS } from '../../src/dungeons.js';
import { SnapshotEncoder } from '../../src/network-snapshots.js';
import { performance } from 'node:perf_hooks';

// Native simulation + serialization sink, not a real-network capacity claim.
// Run: node --expose-gc tests/scripts/network-v10-benchmark.mjs
const quantile=(values,q)=>values.slice().sort((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*q))];
const argument=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.split('=')[1];
const roomChoices=argument('rooms')?[Number(argument('rooms'))]:[1,32],modes=argument('mode')?[argument('mode')==='delta-v1']:[false,true],ticks=Number(argument('ticks')||200);
const scenario=argument('scenario')||'overworld-idle';
if(roomChoices.some(value=>!Number.isInteger(value)||value<1||value>32)||!Number.isInteger(ticks)||ticks<1||ticks>10000)throw new RangeError('Bounded benchmark arguments required.');
if(!['overworld-idle','overworld-moving','raid'].includes(scenario))throw new RangeError('Unknown benchmark scenario.');
for(const rooms of roomChoices)for(const deltas of modes){
  global.gc?.();
  const hub=new MultiplayerHub({autoStart:false,storage:null,clock:()=>1000,createGame:()=>new Game({storage:null,random:()=>.5})});let bytes=0,packets=0;
  for(let ri=0;ri<rooms;ri++){
    const room={code:(ri+1).toString(16).padStart(8,'0').toUpperCase(),name:'Transportprobe',createdAt:1000,lastActive:1000,time:0,members:new Map(),world:null};hub.rooms.set(room.code,room);
    for(const profile of CLASSES){
      const member=hub._createMember(room,{playerName:profile.name,classId:profile.id}),initial=hub.snapshot(member,{includeLayout:true});
      const stream={writableLength:0,write(value){bytes+=Buffer.byteLength(value);packets++;},end(){}};member.streams.add(stream);
      if(deltas){const encoder=new SnapshotEncoder();encoder.encode(initial,{context:hub._snapshotContext(member,initial)});hub.snapshotStreams.set(stream,encoder);}
    }
  }
  if(scenario==='raid')for(const room of hub.rooms.values()){
    const definition=DUNGEONS.find(d=>d.id==='weltenkern'),members=[...room.members.values()],leader=members[0].game;
    for(const member of members){member.game.player.level=definition.level;member.game.player.hp=member.game.stats().maxHp;member.game.player.mana=member.game.stats().mana;Object.assign(member.game.player,definition.entrance);}
    if(!hub.command(members[0],{type:'method',name:'enterDungeon',args:[definition.id,1]}))throw new Error('Native raid entry failed.');hub._syncRoom(room,leader);
    const instance=leader.dungeonInstance,boss=leader.world.enemies.find(e=>e.id===`${definition.id}:boss`);
    // Serialization fixture preserves canonical guards/checkpoints, isolating
    // upper-arena traffic from navigation. No balance/clear-time claim follows.
    for(const enemy of leader.world.enemies)if(enemy!==boss){enemy.alive=false;enemy.hp=0;enemy.respawnAt=Infinity;}
    instance.gateOpened=true;instance.bossEngaged=true;for(const puzzle of instance.puzzles)puzzle.solved=true;
    const gate=leader.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
    for(const [i,member]of members.entries())Object.assign(member.game.player,{x:boss.x+40+i*10,y:boss.y});boss.phase='idle';boss.attackTimer=0;
  }
  for(let i=0;i<40;i++)hub.tick(.04);bytes=0;packets=0;global.gc?.();
  const heap=process.memoryUsage().heapUsed,times=[],cpuStart=process.cpuUsage();let distanceMoved=0,raidWarningFrames=0;
  for(let i=0;i<ticks;i++){
    if(scenario==='overworld-moving')for(const member of hub.sessions.values()){const key=['d','s','a','w'][Math.floor(i/20)%4];member.game.keys=new Set([key]);member.lastInput=1000;member.aimAngle=Math.floor(i/20)%4*Math.PI/2;}
    const before=[...hub.sessions.values()].map(member=>({member,x:member.game.player.x,y:member.game.player.y})),at=performance.now();hub.tick(.04);times.push(performance.now()-at);
    for(const previous of before)distanceMoved+=Math.hypot(previous.member.game.player.x-previous.x,previous.member.game.player.y-previous.y);
    if([...hub.rooms.values()].some(room=>room.members.values().next().value.game.dungeonInstance?.raidEncounter?.pending))raidWarningFrames++;
  }
  const cpu=process.cpuUsage(cpuStart);
  console.log(JSON.stringify({scenario,mode:deltas?'delta-v1':'full-v1',rooms,players:hub.sessions.size,samples:times.length,node:process.version,heapMiB:+(heap/1048576).toFixed(2),tickMedianMs:+quantile(times,.5).toFixed(3),tickP95Ms:+quantile(times,.95).toFixed(3),tickMaxMs:+Math.max(...times).toFixed(3),cpuMsPerTick:+((cpu.user+cpu.system)/1000/times.length).toFixed(3),rawMiBPerSimulatedSecond:+(bytes/1048576/(ticks*.04)).toFixed(4),meanPacketKiB:+(bytes/packets/1024).toFixed(3),distanceMoved:+distanceMoved.toFixed(2),raidWarningFrames}));
  hub.dispose();
}

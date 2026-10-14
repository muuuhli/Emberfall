import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { REGIONS, ENEMY_TYPES } from '../src/catalog.js';
import { BESTIARY_ENEMIES, createBestiaryEnemy } from '../src/bestiary.js';
import { ENCOUNTER_RULES, captureEncounterDirector, validateEncounterDirectorSave, restoreEncounterDirector, updateEncounterDirector } from '../src/encounter-director.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const actors=game=>game.world.enemies.filter(enemy=>enemy.directorId);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function field({level=20,region='jadeauen',classId='guardian'}={}) {
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.start();game.player.level=level;
  // Isolate director timing and combat from existing foes and scenery.
  for(const key of ['enemies','trees','rocks','structures','nodes','plots','chests','worldEvents','interactions','river','bridges'])game.world[key]=[];
  const area=REGIONS.find(candidate=>candidate.id===region);game.player.x=area.x+area.w*.55;game.player.y=area.y+area.h*.45;
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;return game;
}
function tick(game,seconds) {for(let frame=0;frame<Math.ceil(seconds/.04);frame++)game.update(.04);}
function warning(game,sequence=0) {game.world.encounterDirector.sequence=sequence;game.world.encounterDirector.nextIn=.04;game.update(.04);assert.equal(game.world.encounterDirector.stage,'warning');return game.world.encounterDirector;}
function spawn(game,sequence=0){warning(game,sequence);tick(game,8.04);assert.equal(game.world.encounterDirector.stage,'active');return actors(game);}

test('actual Game wilderness clock waits 75 seconds and exposes a full warning before a real mixed pack',()=>{
  const game=field({level:12,region:'sonnensteppe'});tick(game,74.9);assert.equal(game.world.encounterDirector.stage,'calm');assert.equal(actors(game).length,0);
  tick(game,.2);const state=game.world.encounterDirector;assert.equal(state.stage,'warning');assert.ok(state.remaining>7.8);assert.equal(state.plan.length,3);
  assert.equal(game.hazards.filter(h=>h.directorId).length,3);assert.equal(actors(game).length,0);const points=clone(state.plan);
  tick(game,7.7);assert.equal(state.stage,'warning');assert.equal(actors(game).length,0);tick(game,.4);
  assert.equal(state.stage,'active');assert.equal(actors(game).length,3);assert.equal(game.hazards.filter(h=>h.directorId).length,0);
  assert.ok(new Set(actors(game).map(e=>BESTIARY_ENEMIES[e.type].combat.pattern)).size>=2);
  for(const enemy of actors(game)){assert.ok(enemy.aggro);assert.ok(distance(enemy,game.player)>=ENCOUNTER_RULES.minSpawnDistance);assert.ok(points.some(point=>point.type===enemy.type&&distance(point,{x:enemy.homeX,y:enemy.homeY})<1e-8));assert.ok(enemy.level<=game.regionAt().maxLevel);}
});

test('midgame and late-game first warnings arrive after real 40 and 25 seconds of eligible exploration',()=>{
  for(const [level,region,delay] of [[20,'jadeauen',40],[52,'mondbruch',25]]){
    const game=field({level,region});tick(game,delay-.12);assert.equal(game.world.encounterDirector.stage,'calm');assert.equal(actors(game).length,0);tick(game,.2);assert.equal(game.world.encounterDirector.stage,'warning');assert.equal(actors(game).length,0);
  }
});

test('village, shrine, onboarding, pause, dungeon and PvP do not advance the wilderness pressure clock',()=>{
  const game=field();const before=game.world.encounterDirector.nextIn;
  Object.assign(game.player,{x:520,y:1250});tick(game,3);assert.equal(game.world.encounterDirector.nextIn,before);
  const shrine=game.world.shrines.find(s=>s.region==='jadeauen');Object.assign(game.player,{x:shrine.x,y:shrine.y});tick(game,3);assert.equal(game.world.encounterDirector.nextIn,before);
  Object.assign(game.player,{x:8200,y:1200,level:3});tick(game,3);assert.equal(game.world.encounterDirector.nextIn,before);
  game.player.level=20;game.paused=true;tick(game,3);assert.equal(game.world.encounterDirector.nextIn,before);game.paused=false;
  game.worldMode='pvp';updateEncounterDirector(game,3,[game]);assert.equal(game.world.encounterDirector.nextIn,before);game.worldMode='overworld';
  game.dungeonInstance={id:'isolated'};updateEncounterDirector(game,3,[game]);assert.equal(game.world.encounterDirector.nextIn,before);
});

test('frozen warning markers never spawn an actor underneath a player and allow a real retreat',()=>{
  const game=field();const state=warning(game),point={...state.plan[0]},planned=state.plan.length;
  Object.assign(game.player,{x:point.x,y:point.y});tick(game,8.04);assert.ok(actors(game).length<planned);assert.ok(actors(game).every(enemy=>distance(enemy,game.player)>=160));
  const fleeing=field();const retreat=warning(fleeing),anchor={...retreat.anchor};Object.assign(fleeing.player,{x:anchor.x+800,y:anchor.y});tick(fleeing,8.04);
  assert.equal(actors(fleeing).length,0);assert.equal(retreat.stage,'calm');assert.ok(retreat.nextIn>50);
});

test('third high-level wave creates seven regional foes with two elites while early waves remain bounded',()=>{
  const game=field({level:100,region:'sonnensteppe'}),pack=spawn(game,2);assert.equal(game.world.encounterDirector.tier,'relentless');assert.equal(pack.length,7);assert.equal(pack.filter(enemy=>enemy.elite).length,2);
  assert.ok(pack.every(enemy=>enemy.level<=20&&!ENEMY_TYPES[enemy.type].boss&&!enemy.boss));
  const early=field({level:5,region:'frostgrat'});early.world.shrines=[];const small=spawn(early,2);assert.ok(small.length<=4);assert.ok(small.every(enemy=>!enemy.elite));
});

test('a real Bloodnight melee elite warns its locked lunge, hits a stationary target and permits a perpendicular native dodge',()=>{
  const setup=()=>{
    const game=field(),pack=spawn(game,2),elite=pack.find(enemy=>enemy.elite&&['melee','brute','cleave'].includes(BESTIARY_ENEMIES[enemy.type].combat.pattern));assert.ok(elite);
    game.world.enemies=[elite];Object.assign(game.player,{x:elite.x+200,y:elite.y});const start=game.time;
    while(elite.phase!=='windup'&&game.time-start<2)game.update(.04);
    assert.equal(elite.phase,'windup');assert.equal(elite.telegraphPattern,'charge');assert.ok(elite.telegraphDuration>=1.15);assert.ok(elite.telegraphChargeDistance<=260);return {game,elite};
  };
  const stationary=setup(),before=stationary.game.player.hp;tick(stationary.game,stationary.elite.telegraphDuration+.08);assert.ok(stationary.game.player.hp<before,'The warned elite lunge creates actual stationary pressure');
  const reactive=setup(),healthy=reactive.game.player.hp,locked=reactive.elite.telegraphAngle;
  reactive.game.keys.add('s');assert.equal(reactive.game.action('dash'),true);tick(reactive.game,reactive.elite.telegraphDuration+.08);
  assert.equal(reactive.game.player.hp,healthy);assert.equal(reactive.elite.telegraphAngle,locked,'The lunge does not retarget during the warning');assert.ok(reactive.elite.cycle>=1);
});

test('local threat capacity includes existing enemies and group additions never exceed the actor cap',()=>{
  const game=field();game.world.encounterDirector.nextIn=0;
  for(let index=0;index<12;index++)game.world.enemies.push(createBestiaryEnemy('jade_stalker',`existing-${index}`,game.player.x+100,game.player.y+index*8,{level:20}));
  updateEncounterDirector(game,.04,[game]);assert.equal(game.world.encounterDirector.stage,'calm');assert.equal(actors(game).length,0);assert.equal(game.world.encounterDirector.nextIn,15);
  game.world.enemies.length=0;game.world.encounterDirector.sequence=2;game.world.encounterDirector.nextIn=0;
  const party=[game];for(let index=1;index<8;index++){const ally=field();ally.world=game.world;Object.assign(ally.player,{x:game.player.x+index*12,y:game.player.y});party.push(ally);}
  updateEncounterDirector(game,.04,party);assert.equal(game.world.encounterDirector.stage,'warning');assert.ok(game.world.encounterDirector.plan.length<=10);assert.ok(game.world.encounterDirector.plan.every(point=>party.every(g=>distance(point,g.player)>=240)));
});

test('a trial cannot erase an incoming pursuit and its own warned waves pause further wilderness scheduling',()=>{
  const game=field({level:100,region:'nexusriss'}),canonical=new Game({storage:null});
  const event=canonical.world.worldEvents.find(e=>e.id==='trial-last-scar');
  game.world.worldEvents=[event];game.world.eventObjects=canonical.world.eventObjects.filter(o=>o.eventId===event.id);
  Object.assign(game.player,{x:event.x,y:event.y});const state=warning(game,2),plan=clone(state.plan);
  assert.equal(game.interactWorldEvent(`${event.id}:start`),false);
  assert.equal(event.state,'idle');assert.equal(state.stage,'warning');assert.deepEqual(state.plan,plan);
  tick(game,8.04);assert.ok(actors(game).some(e=>e.alive));
  // Controlled native damage isolates the scheduling transition, not a fight.
  for(const actor of actors(game))game.hitEnemy(actor,actor.hp*2,0);
  game.update(.04);assert.equal(state.stage,'calm');
  assert.equal(game.interactWorldEvent(`${event.id}:start`),true);state.nextIn=.04;
  const elapsed=state.elapsed;tick(game,1);
  assert.equal(state.stage,'calm');assert.equal(state.elapsed,elapsed);assert.equal(state.nextIn,.04);
  assert.equal(actors(game).length,0);assert.equal(event.phase,'wave-warning');
  assert.equal(game.world.enemies.filter(e=>e.alive&&e.eventId===event.id).length,0);
});

test('enemies arriving during the eight-second warning consume the live spawn capacity before materialization',()=>{
  const game=field();warning(game,2);assert.equal(game.world.encounterDirector.plan.length,7);tick(game,7.9);
  for(let index=0;index<12;index++)game.world.enemies.push(createBestiaryEnemy('jade_stalker',`late-existing-${index}`,game.player.x+200,game.player.y+index*6,{level:20}));
  tick(game,.2);assert.equal(actors(game).length,0);assert.equal(game.world.enemies.filter(enemy=>enemy.alive).length,12);assert.equal(game.world.encounterDirector.stage,'calm');assert.ok(game.world.encounterDirector.nextIn>54);
});

test('warning save reload preserves the countdown, exact visible markers and canonical future enemies',()=>{
  const game=field();warning(game,1);tick(game,2);const captured=clone(game.capture()),saved=captured.world.encounterDirector;assert.equal(validateEncounterDirectorSave(saved),true);
  const restored=new Game({storage:null,random:()=>.5});restored.applySave(captured);restored.start();
  assert.deepEqual(restored.world.encounterDirector.plan,saved.plan);assert.equal(restored.world.encounterDirector.remaining,saved.remaining);assert.equal(actors(restored).length,0);restored.update(.04);
  assert.equal(restored.hazards.filter(h=>h.directorId).length,saved.plan.length,'A restored warning remains visible before its enemies appear');
  assert.ok(restored.hazards.filter(h=>h.directorId).every(h=>h.life<=restored.world.encounterDirector.remaining&&h.life>=saved.remaining-.1));assert.equal(actors(restored).length,0);
});

test('actual director kill has bounded rewards, remains dead after reload and cannot respawn for another payment',()=>{
  const game=field();const enemy=spawn(game)[0],gold=game.player.gold,kills=game.kills;game.random=()=>.16;
  enemy.hp=1;Object.assign(game.player,{x:enemy.x-35,y:enemy.y,face:0});game.cooldowns.attack=0;assert.equal(game.action('attack'),true);assert.equal(enemy.alive,false);
  assert.equal(game.player.gold,gold+enemy.gold);assert.equal(game.kills,kills+1);assert.equal(game.drops.length,0,'16% is outside the 15% director loot gate');assert.equal(enemy.respawnAt,Infinity);
  const captured=clone(game.capture()),restored=new Game({storage:null});restored.applySave(captured);const dead=actors(restored).find(actor=>actor.id===enemy.id);assert.ok(dead);assert.equal(dead.alive,false);assert.equal(dead.hp,0);assert.equal(dead.respawnAt,Infinity);
  const paid=restored.player.gold;restored.killEnemy(dead);assert.equal(restored.player.gold,paid);assert.equal(restored.kills,game.kills);
});

test('corrupt director actors are rejected atomically while restore ignores raw injected combat stats and old saves gain a calm clock',()=>{
  const game=field();spawn(game,1);const captured=clone(game.capture());
  for(const corrupt of [s=>s.actors[0].hp=1e9,s=>s.actors[0].id='director-forged',s=>s.plan[0].type='world_heart',s=>s.plan[0].level=100,s=>s.remaining=-1,s=>s.actors.push({...s.actors[0]})]){
    const forged=clone(captured);corrupt(forged.world.encounterDirector);const before=clone(game.world.encounterDirector);assert.throws(()=>game.applySave(forged));assert.deepEqual(game.world.encounterDirector,before);
  }
  const record=clone(captured.world.encounterDirector);record.actors[0].damage=1e9;record.actors[0].maxHp=1e9;const restored=field();restoreEncounterDirector(restored.world,record);assert.ok(actors(restored)[0].damage<1e9);assert.ok(actors(restored)[0].maxHp<1e9);
  delete captured.world.encounterDirector;const legacy=new Game({storage:null});legacy.applySave(captured);assert.equal(legacy.world.encounterDirector.stage,'calm');assert.equal(legacy.world.encounterDirector.nextIn,75);assert.equal(actors(legacy).length,0);
});

test('leaving for a safe area withdraws the pack and victory starts a genuine calm cooldown',()=>{
  const safe=field();spawn(safe,2);Object.assign(safe.player,{x:520,y:1250});safe.update(.04);assert.equal(actors(safe).length,0);assert.equal(safe.world.encounterDirector.stage,'calm');
  const won=field();const wave=spawn(won);for(const enemy of wave)won.hitEnemy(enemy,enemy.maxHp+1,0);won.update(.04);
  assert.equal(won.world.encounterDirector.stage,'calm');assert.ok(won.world.encounterDirector.nextIn>=39.9);assert.equal(actors(won).length,0);tick(won,10);assert.equal(won.world.encounterDirector.stage,'calm');
});

test('early damage recovery remains forgiving while late damage and respawn spacing increase pressure',()=>{
  const early=field({level:5}),late=field({level:20});early.damagePlayer(10,{trueDamage:true});late.damagePlayer(10,{trueDamage:true});
  assert.equal(early.damageGrace.get('environment'),early.time+.24);assert.equal(late.damageGrace.get('environment'),late.time+.16);
  for(const game of [early,late]){const hp=game.player.hp;game.damagePlayer(10,{trueDamage:true});assert.equal(game.player.hp,hp,'One source cannot hit twice during its grace window');game.damagePlayer(10,{trueDamage:true,attackerId:'second-enemy'});assert.equal(game.player.hp,hp-10,'Another enemy still creates real pack pressure');assert.equal(game.player.invulnerable,0);}
  for(const game of [early,late]){const enemy=createBestiaryEnemy('jade_stalker','real-respawn',game.player.x+35,game.player.y,{level:game.player.level});game.world.enemies=[enemy];game.killEnemy(enemy);assert.equal(enemy.respawnAt-game.time,game.player.level>=12?32:55);}
});

test('two real HTTP players share one director clock and a restart cannot resurrect a paid wave actor',async()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};let hub,server,base;
  const open=async()=>{hub=new MultiplayerHub({createGame:()=>field(),storage,autoStart:false});server=http.createServer(async(req,res)=>{if(!await hub.handle(req,res))res.writeHead(404).end();});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`;};
  const close=async()=>{hub.dispose();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));};
  await open();
  const post=async(route,body)=>{const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return {status:response.status,data:await response.json()};};
  const get=async token=>(await fetch(`${base}/api/session/${token}`)).json();
  try {
    const first=(await post('/api/rooms',{playerName:'Druckwacht',classId:'guardian'})).data,second=(await post(`/api/rooms/${first.roomCode}/join`,{playerName:'Mitwacht',classId:'ranger'})).data;
    const one=hub.sessions.get(first.token).game,two=hub.sessions.get(second.token).game;
    for(const g of [one,two]){g.player.level=20;g.player.hp=g.stats().maxHp;Object.assign(g.player,{x:8160,y:1080});}
    const before=one.world.encounterDirector.elapsed;hub.tick(.04);assert.equal(one.world.encounterDirector.elapsed-before,.04,'Party size does not multiply wilderness time');assert.equal(one.world.encounterDirector,two.world.encounterDirector);
    one.world.encounterDirector.nextIn=.04;hub.tick(.04);for(let index=0;index<202;index++)hub.tick(.04);const wave=actors(one);assert.ok(wave.length>=3);assert.ok(wave.length<=4);
    const a=await get(first.token),b=await get(second.token);assert.deepEqual(a.world.encounterDirector,b.world.encounterDirector);
    const forged=await post(`/api/session/${first.token}/command`,{type:'method',name:'directorSpawn',args:['relentless']});assert.equal(forged.status,400);
    const enemy=wave[0];enemy.hp=1;one.random=()=>.5;Object.assign(one.player,{x:enemy.x-35,y:enemy.y,face:0});one.cooldowns.attack=0;
    assert.equal((await post(`/api/session/${first.token}/command`,{type:'action',name:'attack'})).data.accepted,true);assert.equal(enemy.alive,false);const paid=one.player.gold;
    await close();await open();const after=await get(first.token),restored=hub.sessions.get(first.token).game;assert.equal(after.player.gold,paid);const dead=actors(restored).find(actor=>actor.id===enemy.id);assert.ok(dead);assert.equal(dead.alive,false);assert.equal(dead.respawnAt,Infinity);
  } finally{await close();}
});

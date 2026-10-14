import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { updateBestiaryEnemy } from '../src/enemy-ai.js';

function arena() {
  const game=new Game({storage:null,random:()=>.5});game.start();game.player.level=52;game.player.x=6000;game.player.y=6000;game.player.hp=game.stats().maxHp;
  game.world.trees=[];game.world.rocks=[];game.world.structures=[];game.world.shrines=[];game.world.enemies=[];game.world.worldEvents=[];game.world.interactions=[];
  return game;
}
function member(game,id,type='mirror_shade',x=6250,y=6000,extra={}) {
  const enemy=createBestiaryEnemy(type,id,x,y,{level:52,region:'mondbruch'});
  Object.assign(enemy,{directorId:'director-test',packId:'director-test',encounterTier:'hard',flankSide:1},extra);
  game.world.enemies.push(enemy);return enemy;
}
const update=(game,enemy,dt=.04)=>updateBestiaryEnemy(game,enemy,ENEMY_TYPES[enemy.type],dt,[game]);

test('a director alert wakes at most four sleeping members of its own region and pack',()=>{
  const game=arena(),source=member(game,'source','mirror_shade',6350);source.aggro=true;
  const allies=Array.from({length:7},(_,i)=>member(game,`ally-${i}`,'mirror_shade',6330+i*3,6030));
  const foreign=member(game,'foreign','mirror_shade',6350,6000,{packId:'other-pack',directorId:'other-pack'});
  const otherRegion=member(game,'region','mirror_shade',6350,6000,{region:'blutmark'});
  const challenge=member(game,'challenge','mirror_shade',6350,6000,{challengeId:'chest'});
  const event=member(game,'event','mirror_shade',6350,6000,{eventId:'event-mondbruch'});
  const boss=member(game,'boss','mirror_shade_boss',6350);
  const ambient=member(game,'ambient','mirror_shade',6350,6000,{directorId:undefined,packId:undefined});
  update(game,source);
  assert.equal(allies.filter(e=>e.aggro).length,4);
  for(const enemy of [foreign,otherRegion,challenge,event,boss,ambient])assert.ok(!enemy.aggro,`${enemy.id} cannot join a director alarm`);
  update(game,allies[0]);assert.equal(allies.filter(e=>e.aggro).length,4,'An alerted member cannot cascade the alarm in the same frame');
  game.time+=4;update(game,source);assert.equal(allies.filter(e=>e.aggro).length,4,'The four-member alert budget belongs to the whole pack');
});

test('melee pack members approach opposite flanks while casters move during recovery, never during a locked windup',()=>{
  const game=arena(),left=member(game,'left','mirror_shade',6330,6000,{flankSide:-1,aggro:true,attackTimer:1}),right=member(game,'right','mirror_shade',6330,6000,{flankSide:1,aggro:true,attackTimer:1});
  update(game,left,.1);update(game,right,.1);
  assert.ok((left.y-6000)*(right.y-6000)<0,'Opposite roles create two approaches instead of one straight line');
  assert.equal(left.tacticalRole,'flanker');
  const caster=member(game,'caster','moon_construct',6200,6000,{aggro:true,phase:'recover',attackTimer:1});
  update(game,caster,.1);assert.notEqual(caster.y,6000);assert.equal(caster.tacticalRole,'support');
  caster.phase='windup';caster.attackTimer=.8;caster.attackAngle=0;caster.telegraphAngle=0;
  const before={x:caster.x,y:caster.y};update(game,caster,.1);
  assert.deepEqual({x:caster.x,y:caster.y},before);assert.equal(caster.telegraphAngle,0);
});

test('pack attacks are staggered instead of launching every windup in the same frame',()=>{
  const game=arena(),members=Array.from({length:5},(_,i)=>member(game,`caster-${i}`,'moon_construct',6250,6000+i*5,{aggro:true,attackTimer:0}));
  for(const enemy of members)update(game,enemy);
  assert.equal(members.filter(e=>e.phase==='windup').length,1);
  game.time+=.3;for(const enemy of members)update(game,enemy);
  assert.equal(members.filter(e=>e.phase==='windup').length,2);
  game.time+=.3;for(const enemy of members)update(game,enemy);
  assert.equal(members.filter(e=>e.phase==='windup').length,3);
  game.time+=.3;for(const enemy of members)update(game,enemy);
  assert.ok(members.filter(e=>e.phase==='windup').length<=3,'The hard-pack warning cap remains bounded');
});

test('a relentless pack can sustain four staggered warnings but never a fifth simultaneous attack',()=>{
  const game=arena(),members=Array.from({length:7},(_,i)=>member(game,`bloodnight-${i}`,'moon_construct',6250,6000+i*4,{encounterTier:'relentless',aggro:true,attackTimer:0}));
  for(const enemy of members)update(game,enemy);
  assert.equal(members.filter(e=>e.phase==='windup').length,1,'Even a bloodnight announces only one new attack in its first frame');
  for(const expected of [2,3,4,4]) {
    game.time+=.19;for(const enemy of members)update(game,enemy,.19);
    assert.equal(members.filter(e=>e.phase==='windup').length,expected);
  }
  for(let frame=0;frame<50;frame++) {
    game.time+=.04;for(const enemy of members)update(game,enemy);
    assert.ok(members.filter(e=>e.phase==='windup').length<=4,'Released warning slots never allow an overlapping fifth attack');
  }
  assert.ok(members.some(e=>e.cycle>0),'The bounded warnings still resolve into real attacks');
});

test('bloodnight melee elites lock their full warned lunge, with side steps and cover as counterplay',()=>{
  for(const counterplay of ['stationary','side-step','cover']) {
    const game=arena(),enemy=member(game,`elite-${counterplay}`,'mirror_shade',6230,6000,{encounterTier:'relentless',elite:true,aggro:true,attackTimer:0});
    const hp=game.player.hp;update(game,enemy);
    assert.equal(enemy.phase,'windup');assert.equal(enemy.telegraphPattern,'charge');
    assert.ok(enemy.telegraphDuration>=1.15);assert.equal(enemy.telegraphChargeDistance,260);assert.equal(enemy.telegraphRange,260);
    const angle=enemy.telegraphAngle;
    if(counterplay==='side-step')game.player.y+=100;
    if(counterplay==='cover')game.world.structures=[{x:6100,y:5930,w:25,h:140,blocking:true,collision:{x:6100,y:5930,w:25,h:140}}];
    game.time+=1.1;update(game,enemy,1.1);
    assert.equal(enemy.phase,'windup');assert.equal(enemy.telegraphAngle,angle);assert.equal(enemy.x,6230);assert.equal(enemy.y,6000);assert.equal(game.player.hp,hp,'The warning itself inflicts no damage');
    game.time+=.06;update(game,enemy,.06);
    assert.equal(enemy.cycle,1);assert.equal(enemy.phase,'recover');assert.ok(Math.abs(enemy.y-6000)<1e-8,'The lunge follows the warned angle, never the moved player');
    if(counterplay==='cover')assert.ok(enemy.x>6125,'Cover blocks the warned attack before it can reach the player');
    else assert.ok(Math.abs(enemy.x-5970)<1e-8,'Actual travel reaches exactly the announced 260 pixels');
    if(counterplay==='stationary')assert.ok(game.player.hp<hp,'Ignoring the visible path permits a real hit');
    else assert.equal(game.player.hp,hp,'A side step or cover prevents the hit without forced damage');
  }
  const game=arena(),hard=member(game,'ordinary-hard-elite','mirror_shade',6230,6000,{encounterTier:'hard',elite:true,aggro:true,attackTimer:0});
  update(game,hard);assert.equal(hard.phase,'chase');assert.notEqual(hard.telegraphPattern,'charge','The new reach is restricted to bloodnight elites');
});

test('director pursuit reaches a distant spawned enemy, is bounded, and never regenerates a withdrawn pack to full life',()=>{
  const game=arena(),enemy=member(game,'pursuit','mirror_shade',6440,6000,{aggro:true,attackTimer:1});
  const x=enemy.x;update(game,enemy,.1);assert.ok(enemy.aggro);assert.ok(enemy.x<x,'A 440-pixel spawn pursues the player');
  enemy.hp=enemy.maxHp*.5;game.player.x=enemy.homeX+900;update(game,enemy,.1);
  assert.equal(enemy.aggro,false);const hp=enemy.hp;update(game,enemy,1);assert.equal(enemy.hp,hp);
  const slow=member(game,'normal','mirror_shade',6350,6000,{aggro:true,attackTimer:1}),elite=member(game,'elite','mirror_shade',6350,6000,{aggro:true,attackTimer:1,elite:true});
  game.player.x=6000;const normalAt={x:slow.x,y:slow.y},eliteAt={x:elite.x,y:elite.y};update(game,slow,.1);update(game,elite,.1);
  const moved=e=>Math.hypot(e.x-6350,e.y-6000);
  assert.ok(moved(elite)>moved(slow));assert.ok(moved(elite)/moved(slow)<=1.121);
});

test('champions announce pressure thresholds once and freeze their full warning and shorter recovery',()=>{
  const game=arena(),boss=createBestiaryEnemy('lunatic_seer_boss','pressure',6250,6000,{level:52});game.world.enemies=[boss];
  const cues=[];game.onNotice=(text,tone)=>cues.push({text,tone});boss.hp=boss.maxHp*.64;
  update(game,boss);assert.equal(boss.pressurePhase,2);assert.equal(cues.length,1);assert.equal(cues[0].tone,'danger');
  const base=ENEMY_TYPES[boss.type].combat;
  assert.equal(boss.telegraphDuration,base.windup);assert.ok(Math.abs(boss.telegraphRecovery-base.recovery*.82)<1e-8);
  const frozen=boss.telegraphRecovery;boss.hp=boss.maxHp*.29;game.time+=.1;update(game,boss,.1);
  assert.equal(boss.pressurePhase,3);assert.equal(cues.length,2);assert.equal(boss.telegraphRecovery,frozen,'A pressure transition cannot rewrite the current warning');
  update(game,boss,.1);assert.equal(cues.length,2);
  boss.phase='idle';boss.attackTimer=0;update(game,boss);
  assert.equal(boss.telegraphDuration,base.windup);assert.ok(Math.abs(boss.telegraphRecovery-base.recovery*.66)<1e-8);
});

test('early fights and the PvP arena do not acquire pack or champion pressure behavior',()=>{
  const game=arena(),early=member(game,'early','wolf_boss',6200,6000,{level:3,aggro:true});early.hp=early.maxHp*.2;
  const notices=[];game.onNotice=(...args)=>notices.push(args);update(game,early);
  assert.equal(early.pressurePhase,undefined);assert.equal(notices.length,0);
  const enemy=member(game,'arena-inert','mirror_shade',6250,6000,{aggro:true});game.worldMode='pvp';
  const state=structuredClone(enemy);update(game,enemy,1);assert.deepEqual(enemy,state);
});

test('a respawned champion starts a fresh life with base pressure and complete original warnings',()=>{
  const game=arena(),boss=createBestiaryEnemy('lunatic_seer_boss','respawn-pressure',6600,6000,{level:52});game.world.enemies=[boss];
  Object.assign(boss,{alive:false,hp:0,respawnAt:1,pressurePhase:3,telegraphExtraFan:{count:3},burstQueue:[{at:5,angle:0,damage:30}]});game.time=2;
  update(game,boss);assert.equal(boss.alive,true);assert.equal(boss.hp,boss.maxHp);assert.equal(boss.pressurePhase,1);assert.deepEqual(boss.burstQueue,[]);assert.equal(boss.telegraphExtraFan,null);
  game.player.x=6400;boss.hp--;update(game,boss);
  assert.equal(boss.telegraphDuration,ENEMY_TYPES[boss.type].combat.windup);assert.equal(boss.telegraphRecovery,ENEMY_TYPES[boss.type].combat.recovery);
});

test('a vanished pack leaves no attack-slot or alert history that affects its replacement',()=>{
  const game=arena(),source=member(game,'old','moon_construct',6250,6000,{aggro:true});update(game,source);
  assert.equal(source.phase,'windup');game.world.enemies=[];game.time+=.05;
  const next=member(game,'replacement','moon_construct',6250,6000,{aggro:true});update(game,next);
  assert.equal(next.phase,'windup','A new population with the same external pack ID does not inherit a vanished pack slot');
});

test('an ordinary enemy killed far from its home cannot respawn beside a living player',()=>{
  const game=arena(),enemy=createBestiaryEnemy('jade_stalker','home-safety',6040,6000,{level:25});
  Object.assign(enemy,{x:6520,alive:false,hp:0,respawnAt:32});game.world.enemies=[enemy];game.time=33;
  update(game,enemy);assert.equal(enemy.alive,false,'The corpse is 520 pixels away, but the home is only 40 pixels away');
  game.player.x=enemy.homeX-501;update(game,enemy);
  assert.equal(enemy.alive,true);assert.equal(enemy.x,enemy.homeX);assert.equal(enemy.y,enemy.homeY);
});

test('an ambient home respawn shares the active encounter cap and resumes only after a threat slot opens',()=>{
  for(const type of ['jade_stalker','jade_stalker_boss']) {
    const game=arena(),enemy=createBestiaryEnemy(type,`ambient-${type}`,6550,6000,{level:25});
    Object.assign(enemy,{alive:false,hp:0,respawnAt:1});game.world.enemies=[enemy];game.time=2;
    game.world.encounterDirector={stage:'active',anchor:{x:6000,y:6000}};
    for(let index=0;index<12;index++)member(game,`live-${index}`,'mirror_shade',6100+index*5,6050);
    update(game,enemy);assert.equal(enemy.alive,false,'A safe home 550 pixels away must not become the thirteenth local threat');
    assert.equal(game.world.enemies.filter(e=>e.alive).length,12);
    game.world.enemies[1].alive=false;update(game,enemy);
    assert.equal(enemy.alive,true);assert.equal(enemy.x,enemy.homeX);assert.equal(game.world.enemies.filter(e=>e.alive).length,12);
  }
});

test('director and nearby ambient summoners respect the twelve-threat cap before each real minion spawn',()=>{
  for(const managed of [true,false]) {
    const game=arena(),summoner=member(game,'capped-caster','grave_cantor',6200,6000,{aggro:true,phase:'windup',attackTimer:0,
      ...(managed?{}:{directorId:undefined,packId:undefined})});
    game.world.encounterDirector={stage:'active',anchor:{x:6000,y:6000}};
    for(let index=0;index<10;index++)member(game,`existing-${index}`,'mirror_shade',6000+index*3,6050,{directorId:undefined,packId:undefined});
    update(game,summoner);
    assert.equal(game.world.enemies.filter(e=>e.alive).length,12);
    assert.equal(game.world.enemies.filter(e=>e.summonedBy===summoner.id).length,1,'Only the one free threat slot may be filled');
    summoner.phase='windup';summoner.attackTimer=0;update(game,summoner);
    assert.equal(game.world.enemies.filter(e=>e.alive).length,12,'The next summon cannot overflow the existing cap');
  }
});

test('summon capacity counts the union of anchor and nearby-player threats, including overlapping enemies only once',()=>{
  const game=arena();game.player.x=6500;
  const summoner=member(game,'union-caster','grave_cantor',6170,6000,{aggro:true,phase:'windup',attackTimer:0});
  game.world.encounterDirector={stage:'active',anchor:{x:6000,y:6000}};
  for(let index=0;index<5;index++) {
    member(game,`anchor-only-${index}`,'mirror_shade',5600+index*3,6000);
    member(game,`player-only-${index}`,'mirror_shade',6950+index*3,6000);
  }
  const localCount=point=>game.world.enemies.filter(e=>e.alive&&Math.hypot(e.x-point.x,e.y-point.y)<600).length;
  assert.equal(localCount(game.world.encounterDirector.anchor),6);assert.equal(localCount(game.player),6);
  update(game,summoner);
  assert.equal(game.world.enemies.filter(e=>e.summonedBy===summoner.id).length,1,'Eleven unique threats leave one slot despite the shared caster appearing in both radius counts');
  assert.equal(game.world.enemies.filter(e=>e.alive).length,12,'The union reaches capacity although neither individual circle contains twelve enemies');
});

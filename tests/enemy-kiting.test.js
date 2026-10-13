import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { bestiaryCombatStats } from '../src/bestiary.js';
import { WORLD_EVENT_ENEMIES } from '../src/world-events.js';
import { updateBestiaryEnemy } from '../src/enemy-ai.js';

function arena(type='mourning_bell',range=210,{damaged=true}={}) {
  const game=new Game({storage:null,random:()=>.5});game.selectClass('ranger');game.start();
  game.world.trees=[];game.world.rocks=[];game.world.structures=[];game.world.shrines=[];game.world.worldEvents=[];game.world.interactions=[];
  game.player.level=3;game.player.x=6000+range;game.player.y=6000;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  const def=ENEMY_TYPES[type],enemy={id:'kiting-regression',type,x:6000,y:6000,homeX:6000,homeY:6000,
    ...bestiaryCombatStats(def,3),alive:true,boss:def.boss,bestiary:true,phase:'idle',attackTimer:0,respawnAt:Infinity,rewardless:true};
  if(damaged)enemy.hp--;
  game.world.enemies=[enemy];return {game,enemy,def};
}
const tick=(game,seconds)=>{for(let elapsed=0;elapsed<seconds;elapsed+=.04)game.update(.04);};

test('all named expedition bosses warn and execute attacks at a ranger opening beyond preferred spacing',()=>{
  for(const type of Object.keys(WORLD_EVENT_ENEMIES)) {
    const {game,enemy}=arena(type,210),hp=game.player.hp;
    game.update(.04);
    assert.equal(enemy.phase,'windup',`${type} must answer a ranged attack at 210 pixels`);
    assert.ok(enemy.telegraphRange>=210);assert.ok(enemy.telegraphDuration>=1.15);
    assert.equal(enemy.cycle||0,0);assert.equal(game.player.hp,hp,'The warning itself never damages');
    tick(game,enemy.telegraphDuration+.05);
    assert.equal(enemy.cycle,1,`${type} executes the announced attack`);
    tick(game,3.5);assert.ok(enemy.cycle>=2,`${type} keeps attacking without having to outrun the player`);
  }
});

test('a level-three ranger using only native basic attacks cannot kill the first expedition boss before multiple real attack cycles',()=>{
  const {game,enemy}=arena(),hp=game.player.hp;
  for(let elapsed=0;elapsed<25&&enemy.alive&&!game.dead;elapsed+=.04) {
    game.aim={x:enemy.x,y:enemy.y};game.action('attack');game.update(.04);
  }
  assert.equal(enemy.alive,false,'Starter gear can still finish the solo boss');
  assert.equal(game.dead,false);
  assert.ok(enemy.cycle>=2,'The boss must participate before it dies');
  assert.ok(game.player.hp<hp,'Standing outside preferred spacing does not silently disable its projectiles');
});

test('a warning locks its projectile aim and moving into a ring gap avoids its first volley',()=>{
  const stationary=arena(),moving=arena();
  stationary.game.update(.04);moving.game.update(.04);
  const aim=moving.enemy.telegraphAngle;
  moving.game.keys.add('w');tick(moving.game,.64);moving.game.keys.clear();
  tick(stationary.game,.64);
  assert.equal(moving.enemy.telegraphAngle,aim,'The telegraph never follows a player during its windup');
  const beforeStationary=stationary.game.player.hp,beforeMoving=moving.game.player.hp;
  let captured=false;
  for(let elapsed=0;elapsed<5;elapsed+=.04) {
    stationary.game.update(.04);moving.game.update(.04);
    if(!captured&&moving.enemy.cycle===1) {
      captured=true;moving.enemy.attackTimer=100;stationary.enemy.attackTimer=100;
      const shots=moving.game.projectiles.filter(p=>p.owner==='enemy');
      assert.equal(shots.length,8);assert.ok(shots.every(p=>p.speed<=145),'Main ring gaps remain readable');
    }
  }
  assert.ok(captured);assert.ok(stationary.game.player.hp<beforeStationary);
  assert.equal(moving.game.player.hp,beforeMoving,'A short side step avoids the locked ring without forced damage');
});

test('optional champion nests keep their short aggro radius and slow melee champions warn before a ranged gap closer',()=>{
  const {game,enemy}=arena('wolf_boss',210,{damaged:false}),hp=game.player.hp;
  tick(game,2);assert.equal(enemy.aggro,undefined);assert.equal(enemy.cycle||0,0);assert.equal(game.player.hp,hp);
  game.hitEnemy(enemy,1,0);game.update(.04);
  assert.equal(enemy.phase,'windup');assert.equal(enemy.telegraphPattern,'charge');
  assert.ok(enemy.telegraphChargeDistance<=300);assert.equal(game.player.hp,hp);
  game.world.structures=[{x:6080,y:5930,w:25,h:140,blocking:true,collision:{x:6080,y:5930,w:25,h:140}}];
  tick(game,enemy.telegraphDuration+.05);
  assert.ok(enemy.x<6080,'Cover blocks the entire warned lunge');assert.equal(game.player.hp,hp);
});

test('crossing half health during a windup adds no unannounced second-phase fan',()=>{
  const {game,enemy}=arena();enemy.cycle=2;enemy.hp=enemy.maxHp*.6;
  game.update(.04);assert.equal(enemy.telegraphExtraFan,null);
  enemy.hp=enemy.maxHp*.4;tick(game,enemy.telegraphDuration+.05);
  assert.equal(game.projectiles.filter(p=>p.owner==='enemy').length,8,'The attack matches the warning already shown');
  enemy.phase='idle';enemy.attackTimer=0;enemy.cycle=5;game.projectiles=[];
  game.update(.04);assert.equal(enemy.telegraphExtraFan.count,3);assert.ok(enemy.telegraphExtraFan.speed<=320);
  tick(game,enemy.telegraphDuration+.05);
  assert.equal(game.projectiles.filter(p=>p.owner==='enemy').length,11,'The next announced pressure attack remains bounded');
});

test('a ring executes its locked count, speed and full warning reach even if the next phase changes its profile',()=>{
  const {game,enemy}=arena('frost_witch_boss'),definition=structuredClone(ENEMY_TYPES[enemy.type]);
  updateBestiaryEnemy(game,enemy,definition,.01,[game]);
  const locked={count:enemy.telegraphProjectileCount,speed:enemy.telegraphProjectileSpeed,range:enemy.telegraphProjectileRange,angle:enemy.telegraphAngle};
  assert.equal(locked.count,6);assert.equal(enemy.telegraphRange,locked.range);
  definition.combat.projectileCount=12;definition.combat.projectileSpeed=500;definition.combat.projectileRange=1200;
  game.time=enemy.attackTimer+.01;updateBestiaryEnemy(game,enemy,definition,game.time,[game]);
  assert.equal(game.projectiles.length,locked.count);
  for(const [index,shot] of game.projectiles.entries()) {
    assert.equal(shot.speed,locked.speed);
    assert.ok(Math.abs(shot.life*shot.speed-locked.range)<1e-8);
    assert.ok(Math.abs(shot.angle-(locked.angle+index*Math.PI*2/locked.count))<1e-8);
  }
});

test('all shots of a boss salvo retain the first warning speed, reach, angle and damage',()=>{
  const {game,enemy}=arena('soot_priest_boss'),definition=structuredClone(ENEMY_TYPES[enemy.type]);
  updateBestiaryEnemy(game,enemy,definition,.01,[game]);
  const locked={count:enemy.telegraphProjectileCount,speed:enemy.telegraphProjectileSpeed,range:enemy.telegraphProjectileRange,angle:enemy.attackAngle};
  assert.ok(locked.speed>=260);
  definition.combat.projectileCount=1;definition.combat.projectileSpeed=50;definition.combat.projectileRange=80;
  game.time=enemy.attackTimer+.01;updateBestiaryEnemy(game,enemy,definition,game.time,[game]);
  const damage=game.projectiles[0].damage;
  game.player.y+=100;enemy.damage*=4;
  for(let index=0;index<locked.count-1;index++) {game.time+=.19;updateBestiaryEnemy(game,enemy,definition,.19,[game]);}
  assert.equal(game.projectiles.length,locked.count);
  for(const shot of game.projectiles) {
    assert.equal(shot.speed,locked.speed);assert.equal(shot.angle,locked.angle);assert.equal(shot.damage,damage);
    assert.ok(Math.abs(shot.life*shot.speed-locked.range)<1e-8);
  }
});

test('the announced second-phase fan expires at its own warning reach rather than the main ring range',()=>{
  const {game,enemy}=arena(),definition=structuredClone(ENEMY_TYPES[enemy.type]);enemy.cycle=5;enemy.hp=enemy.maxHp*.4;
  updateBestiaryEnemy(game,enemy,definition,.01,[game]);
  const fan={...enemy.telegraphExtraFan};
  assert.notEqual(fan.range,enemy.telegraphProjectileRange);
  game.time=enemy.attackTimer+.01;updateBestiaryEnemy(game,enemy,definition,game.time,[game]);
  const shots=game.projectiles.filter(p=>p.speed===fan.speed);
  assert.equal(shots.length,fan.count);
  for(const [index,shot] of shots.entries()) {
    assert.ok(Math.abs(shot.life*shot.speed-fan.range)<1e-8);
    assert.ok(Math.abs(shot.angle-(fan.angle+(index/(fan.count-1)-.5)*fan.spread))<1e-8);
  }
});

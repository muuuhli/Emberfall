import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES } from '../src/content.js';
import { getClass } from '../src/classes.js';

function storage() {
  const values=new Map();
  return {getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
}
function arena(type=null,distance=80) {
  const game=new Game({storage:storage(),random:()=>.5});
  game.start();
  game.world.trees=[];game.world.rocks=[];game.world.structures=[];
  game.world.nodes=[];game.world.plots=[];game.world.chests=[];game.world.shrines=[];game.npcs=[];
  game.player.x=2000+distance;game.player.y=1000;game.player.face=Math.PI;
  if(type) {
    const def=ENEMY_TYPES[type];
    game.world.enemies=[{id:`test-${type}`,type,x:2000,y:1000,homeX:2000,homeY:1000,hp:def.hp,maxHp:def.hp,alive:true,attackTimer:0,phase:'idle',respawnAt:0,aggro:true}];
  } else game.world.enemies=[];
  return game;
}
function advance(game,seconds,dt=.02) {
  for(let remaining=seconds;remaining>1e-7;remaining-=dt)game.update(Math.min(dt,remaining));
}
function resolveBoss(type,fraction=.75,distance=80) {
  const game=arena(type,60),enemy=game.world.enemies[0];
  enemy.hp=enemy.maxHp*fraction;game.update(.02);
  game.player.x=enemy.x+distance;enemy.attackTimer=.02;
  game.update(.02);
  return {game,enemy,shots:game.projectiles};
}

test('the village farm remains safe for a full crop growth cycle',()=>{
  const game=new Game({storage:storage(),random:()=>.5});game.start();
  const plot=game.world.plots.find(p=>p.id==='plot-1-3');
  game.player.x=plot.x+45;game.player.y=plot.y;
  const wolf=game.world.enemies.find(e=>e.type==='wolf');
  wolf.x=game.player.x;wolf.y=game.player.y+42;wolf.aggro=true;
  game.world.enemies=[wolf];
  game.interact();assert.equal(plot.state,'growing');
  advance(game,26);
  assert.equal(game.dead,false,'A first crop must not turn into a combat trap');
  assert.equal(game.player.hp,game.stats().maxHp);
  assert.equal(wolf.aggro,false);assert.equal(plot.state,'ripe');
  game.interact();assert.equal(game.resources.wheat,3);
});

test('diagonal movement preserves run speed and axis collision permits sliding',()=>{
  const straight=arena(),diagonal=arena();
  straight.keys.add('d');diagonal.keys.add('d');diagonal.keys.add('s');
  const origin={...straight.player};advance(straight,1);advance(diagonal,1);
  const distance=p=>Math.hypot(p.x-origin.x,p.y-origin.y);
  assert.ok(Math.abs(distance(straight.player)-distance(diagonal.player))<.001);
  const sliding=arena();sliding.world.structures=[{x:2100,y:950,w:30,h:200,collision:{x:2100,y:950,w:30,h:200}}];
  sliding.keys.add('d');sliding.keys.add('s');const startY=sliding.player.y;advance(sliding,.5);
  assert.ok(sliding.player.x<2100-11,'The wall must stop horizontal movement');
  assert.ok(sliding.player.y>startY+45,'Movement must continue along the wall');
});

test('dash follows movement input, holds its initial direction, and prevents damage',()=>{
  const game=arena();game.keys.add('d');game.aim={x:1800,y:1000};
  const x=game.player.x,y=game.player.y,hp=game.player.hp;
  assert.equal(game.action('dash'),true);game.update(.02);
  assert.ok(game.player.x>x,'Moving right must roll right even when aiming left');
  game.aim={x:game.player.x,y:1500};advance(game,.08);
  assert.ok(Math.abs(game.player.y-y)<.001,'A mouse move must not steer a roll already in progress');
  game.damagePlayer(80);assert.equal(game.player.hp,hp,'Roll invulnerability blocks a hit');
  assert.equal(game.action('dash'),false,'Roll cooldown prevents immediate repeat');
});

test('a dash cannot tunnel through an authored trunk at the maximum frame step',()=>{
  const game=arena();game.player.face=0;game.world.trees=[{x:2130,y:1000,scale:.72}];
  game.keys.add('d');game.action('dash');advance(game,.2,.04);
  assert.ok(game.player.x<=2130-12-8*.72,'The roll must stop before the trunk');
  assert.equal(game.collides(game.player.x,game.player.y),false);
});

test('sword attacks only the forward arc and enforce cooldown',()=>{
  const game=arena('wolf',50),front=game.world.enemies[0];
  const back={...front,id:'behind',x:game.player.x+50,homeX:game.player.x+50};game.world.enemies.push(back);
  assert.equal(game.action('attack'),true);assert.ok(front.hp<front.maxHp);assert.equal(back.hp,back.maxHp);
  const health=front.hp;assert.equal(game.action('attack'),false);assert.equal(front.hp,health);
});

test('melee windup gives reaction time and only damages after its warning',()=>{
  const game=arena('wolf',22),hp=game.player.hp,enemy=game.world.enemies[0];
  game.update(.02);assert.equal(enemy.phase,'windup');
  advance(game,.48);assert.equal(game.player.hp,hp);
  advance(game,.1);assert.ok(game.player.hp<hp);assert.equal(enemy.phase,'recover');
});

test('ranged attacks spawn enemy-owned projectiles and cannot damage another enemy',()=>{
  const game=arena('wraith',140),enemy=game.world.enemies[0];
  const bystander={...enemy,id:'friendly',x:2040,homeX:2040,phase:'idle',attackTimer:10};game.world.enemies.push(bystander);
  enemy.phase='windup';enemy.attackTimer=.02;game.update(.02);
  assert.equal(game.projectiles.length,1);assert.equal(game.projectiles[0].owner,'enemy');
  const otherHp=bystander.hp;advance(game,.4);assert.equal(bystander.hp,otherHp);
  advance(game,.4);assert.ok(game.player.hp<game.stats().maxHp);
});

test('glut bolt pays mana once, honors cooldown, and hits a target',()=>{
  const game=arena('wolf',130);game.selectClass('flamecaller');const enemy=game.world.enemies[0],mana=game.player.mana,cost=getClass('flamecaller').abilities.bolt.cost;
  assert.equal(game.action('bolt'),true);assert.equal(game.player.mana,mana-cost);
  assert.equal(game.action('bolt'),false);assert.equal(game.player.mana,mana-cost);
  assert.equal(game.projectiles[0].owner,'player');advance(game,.4);
  assert.ok(enemy.hp<enemy.maxHp);assert.equal(game.projectiles.length,0);
});

test('projectiles absorbed by cover cannot also hit a target behind it in the same frame',()=>{
  const game=arena('wolf',100);game.player.x=1900;game.player.face=0;
  const enemy=game.world.enemies[0];enemy.x=2033;enemy.homeX=2033;enemy.attackTimer=10;
  game.world.structures=[{x:2020,y:950,w:2,h:100,collision:{x:2020,y:950,w:2,h:100}}];
  game.projectiles=[{x:2010,y:1000,angle:0,type:'bolt',owner:'player',speed:420,damage:40,life:1}];
  game.update(.02);assert.equal(enemy.hp,enemy.maxHp,'Cover must consume the bolt before target collision');assert.equal(game.projectiles.length,0);
});

test('the flamecaller area ability distinguishes range and cannot cast without mana',()=>{
  const game=arena('skeleton',150);game.selectClass('flamecaller');const near=game.world.enemies[0],far={...game.world.enemies[0],id:'far',x:game.player.x+190,homeX:game.player.x+190};
  game.world.enemies.push(far);assert.equal(game.action('nova'),true);
  assert.ok(near.hp<near.maxHp);assert.equal(far.hp,far.maxHp);
  game.cooldowns.nova=0;game.player.mana=27;const hp=near.hp;assert.equal(game.action('nova'),false);assert.equal(near.hp,hp);
});

test('three bosses have different warning radii and no immediate damage outside them',()=>{
  const radii={thorn_guardian:105,frost_sentinel:150,emberlord:175};
  for(const [type,radius] of Object.entries(radii)) {
    const outside=resolveBoss(type,.75,radius+8);
    assert.equal(outside.game.player.hp,outside.game.stats().maxHp,`${type}: safe outside warning`);
    const inside=resolveBoss(type,.75,radius-10);
    assert.ok(inside.game.player.hp<inside.game.stats().maxHp,`${type}: strike inside warning`);
    const warning=arena(type,60);warning.update(.02);
    assert.equal(warning.world.enemies[0].telegraphRadius,radius,`${type}: warning and strike use the same radius`);
  }
});

test('Grimmwurzel adds an aimed root fan only after entering its second phase',()=>{
  assert.equal(resolveBoss('thorn_guardian',.75).shots.length,0);
  const {shots}=resolveBoss('thorn_guardian',.4);assert.equal(shots.length,3);
  assert.ok(shots.every(p=>p.owner==='enemy'&&Math.abs(p.angle)<.7),'Roots aim at the hero rather than a full circle');
});

test('Reifwächter sends a complete eight-way ring, intensified to twelve below half health',()=>{
  for(const [fraction,count] of [[.75,8],[.4,12]]) {
    const {shots}=resolveBoss('frost_sentinel',fraction);assert.equal(shots.length,count);
    const angles=shots.map(p=>(p.angle%(Math.PI*2)+Math.PI*2)%(Math.PI*2)).sort((a,b)=>a-b);
    for(let i=1;i<angles.length;i++)assert.ok(Math.abs(angles[i]-angles[i-1]-Math.PI*2/count)<.001);
    assert.ok(shots.every(p=>p.owner==='enemy'&&p.speed<=145),'A full ring retains dodgeable projectile speed');
  }
});

test('Veyr throws an aimed volley and alternates radial fire in its second phase',()=>{
  assert.equal(resolveBoss('emberlord',.75).shots.length,3);
  const game=arena('emberlord',80),enemy=game.world.enemies[0];enemy.hp=enemy.maxHp*.4;
  const counts=[];
  for(let i=0;i<2;i++) {game.projectiles=[];game.player.invulnerable=2;enemy.phase='windup';enemy.attackTimer=.02;game.update(.02);counts.push(game.projectiles.length);}
  assert.deepEqual(counts.sort((a,b)=>a-b),[5,17],'Every other volley adds twelve slower radial flames');
});

test('common foes respawn only out of view, while slain bosses remain dead after a save',()=>{
  const common=arena('wolf',80),enemy=common.world.enemies[0];common.killEnemy(enemy);
  common.time=enemy.respawnAt+.1;common.updateEnemies(.02);assert.equal(enemy.alive,false,'Do not respawn in front of the player');
  common.player.x=enemy.x+700;common.updateEnemies(.02);assert.equal(enemy.alive,true);assert.equal(enemy.hp,enemy.maxHp);
  const bossGame=new Game({storage:storage(),random:()=>.5});bossGame.start();
  const boss=bossGame.world.enemies.find(e=>e.type==='thorn_guardian');bossGame.killEnemy(boss);
  bossGame.time=10000;bossGame.updateEnemies(.02);assert.equal(boss.alive,false);
  const data=JSON.parse(JSON.stringify(bossGame.capture())),loaded=new Game({storage:storage(),random:()=>.5});loaded.applySave(data);
  assert.equal(loaded.world.enemies.find(e=>e.id===boss.id).alive,false);assert.equal(loaded.flags.thorn_guardian,true);
});

test('death stops the simulation and rescue restores control with a bounded gold penalty',()=>{
  const game=arena();game.player.gold=101;game.player.hp=1;game.damagePlayer(100);
  assert.equal(game.dead,true);assert.equal(game.paused,true);assert.equal(game.action('attack'),false);
  const time=game.time;advance(game,1);assert.equal(game.time,time);
  game.projectiles.push({owner:'enemy'});game.respawn();assert.equal(game.dead,false);assert.equal(game.paused,false);
  assert.equal(game.player.hp,game.stats().maxHp);assert.equal(game.player.gold,90);assert.equal(game.projectiles.length,0);
  assert.deepEqual({x:game.player.x,y:game.player.y},{x:520,y:1250});
});

test('reloading a defeated journey safely rescues the player instead of a death loop',()=>{
  const game=new Game({storage:storage(),random:()=>.5});game.start();
  game.player.x=2700;game.player.y=2000;game.player.gold=100;game.player.hp=0;
  const loaded=new Game({storage:storage()});loaded.applySave(game.capture());
  assert.deepEqual({x:loaded.player.x,y:loaded.player.y},{x:520,y:1250});
  assert.equal(loaded.player.hp,loaded.stats().maxHp);assert.equal(loaded.player.gold,90);
});

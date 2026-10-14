import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { NAMED_BOSS_ENEMIES, NAMED_BOSS_HUNTS, ENCOUNTER_PROFILES } from '../src/encounter-content.js';
import { bestiaryCombatStats, BESTIARY_ENEMIES } from '../src/bestiary.js';
import { updateEncounterBoss } from '../src/encounter-boss-ai.js';
import { hitShape, shapeBounds } from '../src/encounter-geometry.js';

const DT=.04;
function arena(type,range=210) {
  const def=NAMED_BOSS_ENEMIES[type],game=new Game({storage:null,random:()=>.5});game.selectClass('ranger');game.start();game.player.level=def.level;
  const region=game.world.regions.find(region=>region.id===def.region);
  game.player.x=region.x+region.w*.5;game.player.y=region.y+region.h*.4;
  for(const field of ['enemies','trees','rocks','structures','walls','shrines','worldEvents','interactions','river','bridges'])game.world[field]=[];
  game.world.encounterDirector.nextIn=1e6;
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  const enemy={id:`probe-${type}`,type,x:game.player.x+range,y:game.player.y,homeX:game.player.x+range,homeY:game.player.y,
    ...bestiaryCombatStats(def,def.level),boss:true,bestiary:true,alive:true,rewardless:true,eventId:'isolated-profile-probe',challengeId:'isolated-profile-probe',phase:'idle',attackTimer:0,respawnAt:Infinity};
  game.world.enemies=[enemy];return {game,enemy,def};
}
function until(game,predicate,seconds=20) {
  for(let frame=0;frame<Math.ceil(seconds/DT)&&!predicate();frame++)game.update(DT);
  assert.ok(predicate(),'The native controller must reach the expected combat state');
}
function finish(game,enemy) {
  const cycle=enemy.cycle||0;until(game,()=>enemy.cycle>cycle);return enemy.encounterAction;
}

test('six independent regional bosses own distinct action kits, correct real budgets and optional solo hunt metadata',()=>{
  const levels=[4,12,28,52,76,100];assert.equal(Object.keys(NAMED_BOSS_ENEMIES).length,6);assert.equal(NAMED_BOSS_HUNTS.length,6);
  for(const [index,hunt] of NAMED_BOSS_HUNTS.entries()) {
    const def=NAMED_BOSS_ENEMIES[hunt.boss],profile=ENCOUNTER_PROFILES[def.encounterProfile];
    assert.equal(hunt.level,levels[index]);assert.equal(hunt.minLevel,hunt.level);assert.equal(def.level,hunt.level);assert.equal(def.region,hunt.region);
    assert.equal(hunt.mode,'boss_hunt');assert.equal(hunt.contentType,'boss');assert.equal(hunt.partyRequired,1);assert.equal(hunt.repeatable,true);assert.ok(hunt.counterplay.length>60);
    assert.equal(BESTIARY_ENEMIES[def.id],undefined);assert.equal(def.baseType,undefined);assert.equal(ENEMY_TYPES[def.id],def);
    assert.ok(new Set(Object.values(profile.actions).map(action=>action.kind)).size>=2);assert.ok(profile.thresholds.length>=1);
    assert.ok(Object.values(profile.actions).every(action=>action.windup>=1.15));
    const stats=bestiaryCombatStats(def,hunt.level);assert.equal(stats.hp,def.hp);assert.equal(stats.damage,def.damage);assert.equal(stats.lootLevel,hunt.level);
    assert.ok(def.damage*1.1<(100+def.level*12)*.35,'Even the strongest individual action cannot one-shot a hero without gear');
  }
});

test('each real Game boss executes two different announced actions without using generic champion fans',()=>{
  for(const def of Object.values(NAMED_BOSS_ENEMIES)) {
    const {game,enemy}=arena(def.id),kinds=new Set();
    for(let index=0;index<2;index++) {
      until(game,()=>enemy.phase==='windup');const shapes=enemy.telegraphShapes;
      assert.ok(Object.isFrozen(shapes));assert.ok(shapes.length>0&&shapes.length<=6);assert.ok(shapes.every(shape=>Object.isFrozen(shape)&&shapeBounds(shape)));
      assert.equal(enemy.telegraphExtraFan,null);assert.equal(enemy.pressurePhase,undefined);assert.ok(enemy.telegraphDuration>=1.15);
      kinds.add(enemy.encounterAction.kind);finish(game,enemy);
    }
    assert.equal(kinds.size,2,`${def.id} resolves two genuinely different actions`);assert.ok(!game.dead);
  }
});

test('crossing a boss threshold changes only the next action, preserving frozen geometry and full warnings',()=>{
  const {game,enemy}=arena('asterion_scarwarden');game.update(DT);
  const action=enemy.encounterAction,shapes=enemy.telegraphShapes,before=JSON.stringify(shapes),cues=[];game.onNotice=(message,tone)=>cues.push({message,tone});
  enemy.hp=enemy.maxHp*.3;enemy.damage*=2;game.move(game.player,0,80);game.update(DT);
  assert.equal(enemy.encounterPhase,3);assert.equal(enemy.encounterAction,action);assert.equal(enemy.telegraphShapes,shapes);assert.equal(JSON.stringify(shapes),before);
  assert.equal(cues.filter(cue=>cue.tone==='danger').length,1);assert.equal(action.phase,1);
  finish(game,enemy);until(game,()=>enemy.phase==='windup');
  assert.equal(enemy.encounterAction.phase,3);assert.ok(enemy.telegraphDuration>=1.15);assert.equal(cues.filter(cue=>cue.tone==='danger').length,1);
});

test('curated bosses retain frozen windup origins and resist recovery knockback without changing ordinary enemies',()=>{
  const {game,enemy}=arena('orsa_tidewarden');game.update(DT);
  const start={x:enemy.x,y:enemy.y},shapes=JSON.stringify(enemy.telegraphShapes),hp=enemy.hp;
  game.hitEnemy(enemy,1,20);assert.ok(enemy.hp<hp);assert.equal(enemy.x,start.x);assert.equal(enemy.y,start.y);assert.equal(JSON.stringify(enemy.telegraphShapes),shapes);
  finish(game,enemy);const recovery={x:enemy.x,y:enemy.y};game.hitEnemy(enemy,1,20);
  assert.ok(Math.abs(Math.hypot(enemy.x-recovery.x,enemy.y-recovery.y)-1.6)<1e-8,'Recovery absorbs 92 percent of knockback instead of pushing the boss out of its encounter');
  const ordinary={...enemy,id:'ordinary-push',type:'mirror_shade',x:game.player.x+100,y:game.player.y,hp:500,maxHp:500,phase:'windup'};game.world.enemies.push(ordinary);
  const before={x:ordinary.x,y:ordinary.y};game.hitEnemy(ordinary,1,20);
  assert.ok(Math.abs(Math.hypot(ordinary.x-before.x,ordinary.y-before.y)-20)<1e-8,'The original species keeps its complete existing knockback');
});

test('a threshold preserves the current scythe and selects its actual successor so the full new kit can execute',()=>{
  const {game,enemy}=arena('irdan_reaper');game.update(DT);
  const frozenAction=enemy.encounterAction,frozenShapes=enemy.telegraphShapes;assert.equal(frozenAction.id,'scythe');
  enemy.hp=enemy.maxHp*.5;game.update(DT);
  assert.equal(enemy.encounterPhase,2);assert.equal(enemy.encounterAction,frozenAction);assert.equal(enemy.telegraphShapes,frozenShapes);
  finish(game,enemy);until(game,()=>enemy.phase==='windup');assert.equal(enemy.encounterAction.id,'counter');assert.ok(enemy.telegraphDuration>=1.35);
  finish(game,enemy);until(game,()=>enemy.phase==='windup');assert.equal(enemy.encounterAction.id,'furrows');assert.equal(enemy.telegraphShapes.length,3);assert.ok(enemy.telegraphDuration>=1.8);
});

test('Sivra marks a saved position and a native side step during the warning avoids its real hit',()=>{
  for(const dodge of [false,true]) {
    const {game,enemy}=arena('sivra_whitehorn');enemy.encounterActionIndex=1;game.update(DT);
    const shape=enemy.telegraphShapes[0],frozen=JSON.stringify(shape),hp=game.player.hp;assert.equal(shape.kind,'circle');assert.ok(hitShape(shape,game.player));
    assert.equal(game.player.hp,hp);if(dodge)game.keys.add('s');
    finish(game,enemy);game.keys.clear();assert.equal(JSON.stringify(shape),frozen);
    if(dodge)assert.equal(game.player.hp,hp);else assert.ok(game.player.hp<hp);
  }
  const {game,enemy}=arena('sivra_whitehorn');enemy.hp=enemy.maxHp*.5;game.update(DT);finish(game,enemy);until(game,()=>enemy.phase==='windup');
  assert.equal(enemy.encounterAction.id,'shards');assert.equal(enemy.telegraphShapes.length,2);assert.ok(enemy.telegraphDuration>=1.5);
});

test('Orsa executes its locked charge with real cover and side-step counterplay, then separately warns the return',()=>{
  for(const response of ['stationary','side-step','cover']) {
    const {game,enemy}=arena('orsa_tidewarden'),start={x:enemy.x,y:enemy.y},hp=game.player.hp;game.update(DT);
    const shape=enemy.telegraphShapes[0];assert.equal(shape.delivery,'charge');assert.equal(shape.width,35);assert.ok(hitShape(shape,game.player));
    if(response==='side-step')game.keys.add('s');
    if(response==='cover')game.world.structures=[{blocking:true,collision:{x:start.x-110,y:start.y-70,w:25,h:140}}];
    finish(game,enemy);game.keys.clear();assert.ok(Math.abs(enemy.y-start.y)<1e-8,'A moving target never bends the locked charge');
    if(response==='stationary')assert.ok(game.player.hp<hp);else assert.equal(game.player.hp,hp);
    if(response==='cover')assert.ok(enemy.x>start.x-110,'Actual cover stops the boss before the player');
  }
  const {game,enemy}=arena('orsa_tidewarden'),home={x:enemy.x,y:enemy.y};enemy.hp=enemy.maxHp*.54;game.update(DT);finish(game,enemy);
  until(game,()=>enemy.phase==='windup');assert.equal(enemy.encounterAction.id,'return');assert.ok(enemy.telegraphDuration>=1.4);
  const shape=enemy.telegraphShapes[0];assert.equal(shape.x2,home.x);assert.equal(shape.y2,home.y);
});

test('Vey uses real recorded movement positions and newly warns each crossing pendulum',()=>{
  const {game,enemy}=arena('vey_clockslayer');enemy.attackTimer=2;
  game.keys.add('s');for(let frame=0;frame<52;frame++)game.update(DT);game.keys.clear();
  assert.equal(enemy.encounterAction.id,'memories');const shapes=enemy.telegraphShapes;
  assert.equal(shapes.length,3);assert.equal(new Set(shapes.map(shape=>`${shape.x}:${shape.y}`)).size,3);
  assert.ok(shapes.every(shape=>shape.y<=game.player.y));const frozen=JSON.stringify(shapes);game.keys.add('w');game.update(DT);assert.equal(JSON.stringify(shapes),frozen);game.keys.clear();
  finish(game,enemy);until(game,()=>enemy.phase==='windup');const first=enemy.telegraphShapes[0];assert.equal(enemy.encounterAction.id,'pendulum');finish(game,enemy);
  until(game,()=>enemy.phase==='windup');const second=enemy.telegraphShapes[0];assert.equal(enemy.encounterAction.id,'cross');assert.ok(enemy.telegraphDuration>=1.4);
  const dot=(first.x2-first.x1)*(second.x2-second.x1)+(first.y2-first.y1)*(second.y2-second.y1);assert.ok(Math.abs(dot)<1e-6,'The second separately warned path is perpendicular to the first');
});

test('Nera freezes off-boss projectile origins and endpoints; a side step avoids the whole real volley',()=>{
  for(const dodge of [false,true]) {
    const {game,enemy}=arena('nera_nameless');enemy.encounterActionIndex=1;game.update(DT);
    const hp=game.player.hp,shapes=enemy.telegraphShapes;assert.equal(shapes.length,3);assert.ok(shapes.every(shape=>shape.delivery==='projectile'&&shape.width===23));
    if(dodge)game.keys.add('s');finish(game,enemy);game.keys.clear();enemy.attackTimer=20;
    const shots=game.projectiles.filter(projectile=>projectile.attackerId===enemy.id);assert.equal(shots.length,3);
    for(const [index,shot] of shots.entries()) {
      const plan=shapes[index].projectile;assert.equal(shot.speed,plan.speed);assert.equal(shot.angle,plan.angle);assert.equal(shot.maxDistance,plan.maxDistance);
      assert.ok(Math.hypot(shot.x-plan.originX,shot.y-plan.originY)<=plan.speed*DT+1e-8,'Only the native first movement frame separates the shot from its warned origin');
    }
    for(let frame=0;frame<80;frame++)game.update(DT);
    if(dodge)assert.equal(game.player.hp,hp);else assert.ok(game.player.hp<hp);
    assert.equal(game.projectiles.filter(projectile=>projectile.attackerId===enemy.id).length,0);
  }
});

test('Orsa exposes a real moving ring which hits each player once and can be escaped inside the wave',()=>{
  for(const escape of [false,true]) {
    const {game,enemy}=arena('orsa_tidewarden');enemy.encounterActionIndex=1;game.update(DT);const hp=game.player.hp;
    assert.equal(enemy.telegraphShapes[0].moving,true);
    if(escape) {game.keys.add('d');until(game,()=>Math.hypot(game.player.x-enemy.x,game.player.y-enemy.y)<35);game.keys.clear();}
    finish(game,enemy);enemy.attackTimer=20;assert.equal(enemy.activeShapes.length,1);
    const initialRadius=enemy.activeShapes[0].outerRadius;let hits=0;const damage=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{hits++;return damage(...args);};
    game.update(DT);assert.ok(enemy.activeShapes[0].outerRadius>initialRadius);
    for(let frame=0;frame<80;frame++)game.update(DT);game.keys.clear();
    if(escape) {assert.equal(game.player.hp,hp);assert.equal(hits,0);}else {assert.ok(game.player.hp<hp);assert.equal(hits,1);}
  }
});

test('Asterion visibly identifies exactly one safe field and moving into it prevents the real detonation',()=>{
  for(const safe of [false,true]) {
    const {game,enemy}=arena('asterion_scarwarden');enemy.encounterActionIndex=1;game.update(DT);const hp=game.player.hp;
    assert.equal(enemy.telegraphShapes.length,3);const fields=enemy.telegraphShapes,refuge=fields.find(shape=>shape.safe);
    assert.equal(fields.filter(shape=>shape.safe).length,1);assert.equal(refuge.color,'#8dbbb9');
    if(safe)game.move(game.player,refuge.x-game.player.x,refuge.y-game.player.y);
    finish(game,enemy);
    if(safe)assert.equal(game.player.hp,hp);else assert.ok(game.player.hp<hp);
  }
});

test('each optional hunt really spawns its independent boss at the authored level through native world-event actions',()=>{
  for(const hunt of NAMED_BOSS_HUNTS) {
    const game=new Game({storage:null,random:()=>.5});game.start();game.player.level=hunt.level;game.player.hp=game.stats().maxHp;game.world.encounterDirector.nextIn=1e6;
    const event=game.world.worldEvents.find(event=>event.id===hunt.id);assert.ok(event);game.player.x=event.x;game.player.y=event.y;
    assert.equal(game.interactWorldEvent(`${hunt.id}:start`),true);
    for(const rune of game.world.eventObjects.filter(object=>object.eventId===hunt.id&&object.role==='rune')) {
      game.player.x=rune.x;game.player.y=rune.y;assert.equal(game.interactWorldEvent(rune.id),true);
    }
    until(game,()=>game.world.enemies.some(enemy=>enemy.eventId===hunt.id&&enemy.type===hunt.boss));
    const enemy=game.world.enemies.find(enemy=>enemy.eventId===hunt.id&&enemy.type===hunt.boss),def=NAMED_BOSS_ENEMIES[hunt.boss];
    assert.equal(enemy.level,hunt.level);assert.equal(enemy.maxHp,def.hp);assert.equal(enemy.damage,def.damage);assert.equal(enemy.rewardless,true);assert.equal(enemy.respawnAt,Infinity);
    game.world.enemies=game.world.enemies.filter(actor=>actor===enemy);game.player.x=event.x;game.player.y=event.y;
    until(game,()=>enemy.phase==='windup');assert.ok(enemy.telegraphShapes.length>0);assert.equal(enemy.telegraphPattern,'encounter');
  }
});

test('curated control leaves ordinary species and PvP untouched and removes dead-boss active hazards',()=>{
  const {game,enemy,def}=arena('orsa_tidewarden');assert.equal(updateEncounterBoss(game,enemy,BESTIARY_ENEMIES.wolf,DT,[game]),false);
  game.worldMode='pvp';const before=structuredClone(enemy);assert.equal(updateEncounterBoss(game,enemy,def,1,[game]),true);assert.deepEqual(enemy,before);
  game.worldMode='pve';enemy.activeShapes=[{kind:'circle',x:enemy.x,y:enemy.y,radius:20}];enemy.encounterWaves=[{elapsed:0}];enemy.alive=false;
  updateEncounterBoss(game,enemy,def,DT,[game]);assert.deepEqual(enemy.activeShapes,[]);assert.deepEqual(enemy.telegraphShapes,[]);assert.deepEqual(enemy.encounterWaves,[]);assert.equal(enemy.alive,false);
});

test('a living party member inside a real settlement is protected from curated areas, waves, traits and projectiles',()=>{
  for(const type of ['sivra_whitehorn','irdan_reaper','orsa_tidewarden','nera_nameless']) {
    const {game,enemy,def}=arena(type),protectedGame=new Game({storage:null,random:()=>.5});protectedGame.start();protectedGame.player.level=def.level;
    protectedGame.world=game.world;protectedGame.overworld=game.world;
    Object.assign(game.player,{id:'outside',x:965,y:1250,hp:game.stats().maxHp});
    Object.assign(protectedGame.player,{id:'inside',x:900,y:1250,hp:protectedGame.stats().maxHp});
    Object.assign(enemy,{x:1050,y:1250,homeX:1050,homeY:1250,encounterActionIndex:['orsa_tidewarden','nera_nameless'].includes(type)?1:0});
    assert.equal(game.inSettlement(),false);assert.equal(protectedGame.inSettlement(),true);
    const protectedHp=protectedGame.player.hp,outsideHp=game.player.hp;
    for(let frame=0;frame<130;frame++) {
      game.update(DT,{simulateWorld:false});protectedGame.update(DT,{simulateWorld:false});game.updateWorld(DT,[game,protectedGame]);
    }
    assert.equal(protectedGame.player.hp,protectedHp,`${type} cannot hit the protected party member even while its target stays outside`);
    assert.ok(!protectedGame.player.afflictions?.length);assert.ok(!(protectedGame.player.slowUntil>protectedGame.time));
    assert.ok(game.player.hp<outsideHp,'The unprotected primary target still receives real damage');
    if(type==='sivra_whitehorn')assert.ok(game.player.slowUntil>0,'Sivra applies her actual frost trait after a successful area hit');
    if(type==='irdan_reaper')assert.ok(game.player.afflictions.some(effect=>effect.kind==='bleed'),'Irdan applies his actual bleeding trait after a successful cone hit');
  }
});

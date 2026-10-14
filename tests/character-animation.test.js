import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_ANIMATION_PROFILES, createCharacterPresentation, sampleCharacterAnimation, characterDirection } from '../src/character-animation.js';
import { Game } from '../src/game.js';

test('an accepted instant attack begins at impact instead of suggesting delayed damage',()=>{
  for(const kind of Object.keys(CHARACTER_ANIMATION_PROFILES)){
    const presentation=createCharacterPresentation(kind,12,{angle:.4,duration:undefined}),actor={face:2,presentation};
    assert.ok(Object.isFrozen(presentation));assert.equal(presentation.impactAt,12);assert.ok(presentation.endAt>12);
    const sample=sampleCharacterAnimation(actor,12);assert.equal(sample.phase,'impact');assert.equal(sample.pose,6);assert.equal(sample.angle,.4);
  }
});

test('a genuinely prepared action samples its distinct windup, impact and recovery from a single immutable stamp',()=>{
  for(const kind of Object.keys(CHARACTER_ANIMATION_PROFILES)){
    const presentation=createCharacterPresentation(kind,8,{windup:true}),actor={face:0,presentation},profile=CHARACTER_ANIMATION_PROFILES[kind];
    const windup=sampleCharacterAnimation(actor,8),impact=sampleCharacterAnimation(actor,presentation.impactAt+.001),recovery=sampleCharacterAnimation(actor,presentation.impactUntil+.001);
    assert.equal(windup.phase,'windup');assert.equal(windup.pose,profile.poses.windup);assert.equal(impact.phase,'impact');assert.equal(impact.pose,profile.poses.impact);assert.equal(recovery.phase,'recovery');assert.equal(recovery.pose,profile.poses.recovery);
    assert.equal(sampleCharacterAnimation(actor,presentation.endAt+.001).phase,'idle');assert.equal(sampleCharacterAnimation(actor,7).phase,'idle');
  }
});

test('a long prepared meteor keeps its actual 0.9 second warning before impact within the 1.2 second action',()=>{
  const presentation=createCharacterPresentation('cast',12,{windup:.9,duration:1.2,skillId:'meteor'}),actor={presentation};
  assert.equal(presentation.impactAt,12.9);assert.equal(presentation.endAt,13.2);
  for(const elapsed of [.84,.85,.899])assert.equal(sampleCharacterAnimation(actor,12+elapsed).phase,'windup','No strike pose before the native warning finishes');
  assert.equal(sampleCharacterAnimation(actor,presentation.impactAt).phase,'impact');
  assert.equal(sampleCharacterAnimation(actor,presentation.impactUntil+.001).phase,'recovery');
  const bounded=createCharacterPresentation('cast',0,{windup:99,duration:99});
  assert.equal(bounded.endAt,4);assert.ok(bounded.impactUntil<=bounded.endAt&&bounded.impactUntil>bounded.impactAt,'Invalid long inputs retain a bounded real impact phase');
});

test('movement follows real velocity, an action locks its facing, and a dash uses its own actual direction',()=>{
  const moving={walking:true,face:0,velocityX:0,velocityY:-90};assert.equal(sampleCharacterAnimation(moving,1).direction,2);
  const presentation=createCharacterPresentation('melee',1,{angle:Math.PI});assert.equal(sampleCharacterAnimation({...moving,presentation},1).direction,3);
  const dash=sampleCharacterAnimation({...moving,presentation,dashUntil:1.2,dashAngle:Math.PI/2},1);assert.equal(dash.phase,'dash');assert.equal(dash.direction,0);assert.equal(dash.afterimages.length,2);
  assert.ok(dash.afterimages.every(image=>Number.isInteger(image.x/2)&&Number.isInteger(image.y/2)&&image.alpha<=.1));
  assert.deepEqual([Math.PI/2,0,-Math.PI/2,Math.PI].map(characterDirection),[0,1,2,3]);
});

test('reduced motion freezes body poses and hit sparks and removes dash trails without suppressing damage feedback',()=>{
  const p=createCharacterPresentation('cast',2,{windup:true}),actor={presentation:p,hitUntil:2.4};
  const poses=[2,p.impactAt+.001,p.impactUntil+.001].map(time=>sampleCharacterAnimation(actor,time,{reducedMotion:true}));
  assert.deepEqual(poses.map(sample=>sample.pose),[6,6,6]);assert.ok(poses.every(sample=>sample.hit&&sample.hitFrame===0));
  const dash=sampleCharacterAnimation({dashUntil:3,dashAngle:.3},2.9,{reducedMotion:true});assert.equal(dash.pose,2);assert.equal(dash.afterimages.length,0);
  assert.equal(sampleCharacterAnimation({walking:true},2,{reducedMotion:true}).pose,0);
});

test('invalid clocks and stale snapshots cannot create immortal poses, and sampling never changes an actor',()=>{
  const p=createCharacterPresentation('unknown',NaN,{duration:undefined,angle:NaN});assert.equal(p.kind,'cast');assert.ok(Number.isFinite(p.endAt));assert.equal(p.angle,undefined);
  const actor={x:101.5,y:204.3,face:.7,presentation:createCharacterPresentation('shield',1),hp:30,hitUntil:2.3};
  const before=structuredClone(actor);for(let time=0;time<100;time+=.2)sampleCharacterAnimation(actor,time);assert.deepEqual(actor,before);
  assert.equal(sampleCharacterAnimation({...actor,presentation:{...actor.presentation,endAt:999}},1).phase,'idle');assert.equal(sampleCharacterAnimation({...actor,dead:true},1).pose,7);
});

test('native accepted attack, shield and potion hooks create presentation without changing instant hit or rejection semantics',()=>{
  const game=new Game({storage:null,random:()=>.5});game.start();game.world.enemies=[];game.player.x=2200;game.player.y=1700;
  assert.equal(game.action('attack'),true);assert.equal(game.player.presentation.kind,'melee');assert.equal(game.player.presentation.impactAt,game.time);
  const accepted=game.player.presentation;assert.equal(game.action('attack'),false);assert.equal(game.player.presentation,accepted);
  game.cooldowns.bolt=0;game.player.mana=game.stats().mana;assert.equal(game.action('bolt'),true);assert.equal(game.player.presentation.kind,'shield');
  game.player.hp=game.stats().maxHp*.5;game.cooldowns.potion=0;assert.equal(game.action('potion'),true);assert.equal(game.player.presentation.kind,'heal');
});

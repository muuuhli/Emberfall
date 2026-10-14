import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWorld } from '../src/world.js';
import { expandWorld } from '../src/expansion.js';
import { Game } from '../src/game.js';
import { addWorldEvents, WORLD_EVENT_DEFINITIONS, EXPEDITIONS, WORLD_EVENT_ENEMIES, interactWorldEvent, updateWorldEvents,
  claimWorldEventReward, captureWorldEvents, restoreWorldEvents, validateWorldEventSave, summarizeWorldEvents, recordWorldEventContribution, worldEventRewardPreview } from '../src/world-events.js';
import { NAMED_BOSS_HUNTS } from '../src/encounter-content.js';

const world = () => addWorldEvents(expandWorld(makeWorld()));
const hero = (event, changes={}) => ({id:'tester',level:100,hp:1000,x:event.x,y:event.y,...changes});
const getEvent = (w,id) => w.worldEvents.find(e=>e.id===id);
const props = (w,e) => w.eventObjects.filter(o=>o.eventId===e.id&&!o.hidden);
function touch(w,e,p,object,clock,choice) {p.x=object.x;p.y=object.y;return interactWorldEvent(w,object.id,[p],clock,{choice});}
function defeatOwn(w,e) {for(const enemy of w.enemies.filter(a=>a.eventId===e.id&&a.alive))Object.assign(enemy,{alive:false,hp:0});}
function solve(w,id,{risky=false,player,clock=0}={}) {
  const event=getEvent(w,id),p=player||hero(event),effects=[];
  const start=w.eventObjects.find(o=>o.id===`${id}:start`);
  const initial=touch(w,event,p,start,clock);assert.equal(initial.success,true,id);effects.push(...initial.effects);
  const use=object=>{const result=touch(w,event,p,object,clock);effects.push(...result.effects);return result;};
  for(let i=0;i<1500&&event.state==='active';i++) {
    const objects=props(w,event),stage=event.mode==='expedition'?EXPEDITIONS.find(d=>d.id===id).stages[event.stageIndex]:WORLD_EVENT_DEFINITIONS.find(d=>d.id===id);
    const choices=objects.filter(o=>o.role==='choice');
    if(choices.length)use(choices[risky?1:0]);
    else if(['ritual'].includes(event.stageType)) {
      const runes=objects.filter(o=>o.role==='rune');
      if(stage.rule==='sequence') {const next=runes.find(o=>o.symbol===stage.symbols[event.objective.progress]);if(next)use(next);}
      else if(stage.rule==='switches') {const wrong=runes.find((o,i)=>o.active!==stage.pattern[i]);if(wrong)use(wrong);}
      else if(stage.rule==='alignment') {const wrong=runes.find((o,i)=>o.rotation!==stage.rotations[i]);if(wrong)use(wrong);}
      else {p.x=runes[0].x;p.y=runes[0].y;}
    } else if(['ambush','boss_hunt'].includes(event.stageType)) {
      const next=objects.find(o=>o.role==='rune'&&!o.active);if(next)use(next);
    } else {
      const target=objects.find(o=>['objective','escort'].includes(o.role));p.x=target?.x??event.x;p.y=target?.y??event.y;
    }
    clock+=.25;effects.push(...updateWorldEvents(w,.25,[p],clock));defeatOwn(w,event);
  }
  assert.equal(event.state,'success',`${id} should be solvable by one living player`);
  return {event,player:p,clock,effects};
}

test('regional events, curated hunts and solo expeditions have distinct rules, visible objects and deterministic placement',()=>{
  const regional=WORLD_EVENT_DEFINITIONS.filter(e=>!NAMED_BOSS_HUNTS.includes(e)&&e.contentType!=='challenge');
  assert.equal(regional.length,16);assert.ok(EXPEDITIONS.length>=4);
  assert.equal(new Set(WORLD_EVENT_DEFINITIONS.map(e=>e.region)).size,16);
  assert.equal(new Set(regional.map(e=>e.mode)).size,6);
  assert.equal(Object.keys(WORLD_EVENT_ENEMIES).length,4+NAMED_BOSS_HUNTS.length);
  const a=world(),b=world();assert.deepEqual(a,b);
  const before=JSON.stringify(a);addWorldEvents(a);assert.equal(JSON.stringify(a),before);
  assert.equal(a.worldEvents.length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);assert.equal(a.eventObjects.length,a.worldEvents.length*2);
  for(const event of a.worldEvents) {
    assert.ok(event.description.length>90);
    assert.equal(event.state,'idle');
    const region=a.regions.find(r=>r.id===event.region);
    assert.ok(event.x>=region.x&&event.x<region.x+region.w&&event.y>=region.y&&event.y<region.y+region.h);
    for(const object of props(a,event)) {
      assert.ok(!a.trees.some(o=>Math.hypot(o.x-object.x,o.y-object.y)<50));
      assert.ok(!a.rocks.some(o=>Math.hypot(o.x-object.x,o.y-object.y)<50));
    }
  }
});

test('every authored event and all four branching expedition paths finish solo with genuine actors',()=>{
  const w=world();
  for(const definition of [...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS]) {
    const result=solve(w,definition.id);
    assert.ok(w.enemies.some(e=>e.eventId===definition.id),`${definition.id} must create playable foes`);
    assert.equal(result.effects.filter(e=>e.kind==='success').length,1);
    assert.ok(result.effects.some(e=>e.kind==='warning'));
  }
  for(const definition of EXPEDITIONS) {
    const isolated=world(),result=solve(isolated,definition.id,{risky:true});
    assert.equal(result.event.bonus,1.25);
    const bossType=definition.stages.at(-1).boss;
    assert.ok(isolated.enemies.some(e=>e.eventId===definition.id&&e.type===bossType&&e.boss));
  }
});

test('spawns respect their warning, and abandoning or losing the protected objective fails without a reward',()=>{
  const w=world(),event=getEvent(w,'event-daemmerhain'),p=hero(event);
  assert.equal(interactWorldEvent(w,`${event.id}:start`,[p],0).success,true);
  assert.equal(w.enemies.filter(e=>e.eventId===event.id).length,0);
  updateWorldEvents(w,1.9,[p],1.9);assert.equal(w.enemies.filter(e=>e.eventId===event.id).length,0);
  updateWorldEvents(w,.2,[p],2.1);assert.equal(w.enemies.filter(e=>e.eventId===event.id).length,2);
  updateWorldEvents(w,21,[],23.1);assert.equal(event.state,'failure');
  assert.equal(claimWorldEventReward(w,event.id,p,23.1),null);
  assert.ok(w.enemies.filter(e=>e.eventId===event.id).every(e=>!e.alive));
  updateWorldEvents(w,1,[p],84);assert.equal(event.state,'idle');
  assert.equal(interactWorldEvent(w,`${event.id}:start`,[p],84).success,true);
  w.eventObjects.find(o=>o.eventId===event.id&&o.role==='objective').hp=0;
  updateWorldEvents(w,.1,[p],84.1);assert.equal(event.state,'failure');
});

test('a sequence mistake resets its runes and warns before retaliation; three mistakes fail the ritual',()=>{
  const w=world(),event=getEvent(w,'event-aschenmoor'),p=hero(event);
  interactWorldEvent(w,`${event.id}:start`,[p],0);
  const runes=props(w,event).filter(o=>o.role==='rune');
  touch(w,event,p,runes[0],0);assert.equal(event.objective.progress,1);
  const wrong=touch(w,event,p,runes[2],.1);assert.ok(wrong.effects.some(e=>e.kind==='warning'));
  assert.equal(event.objective.progress,0);assert.ok(runes.every(o=>!o.active));
  touch(w,event,p,runes[2],.2);touch(w,event,p,runes[2],.3);assert.equal(event.state,'failure');
});

test('escort movement requires the nearby player and pauses for its real attackers',()=>{
  const w=world(),event=getEvent(w,'event-frostgrat'),p=hero(event);
  interactWorldEvent(w,`${event.id}:start`,[p],0);
  const escort=props(w,event).find(o=>o.role==='escort'),startX=escort.x;
  updateWorldEvents(w,3,[p],3);
  assert.equal(escort.x,startX,'The approaching pack blocks escort progress');
  defeatOwn(w,event);p.x=event.x+400;
  updateWorldEvents(w,1,[p],4);assert.equal(escort.x,startX,'A distant player cannot escort remotely');
  p.x=escort.x;p.y=escort.y;updateWorldEvents(w,1,[p],5);assert.ok(escort.x>startX);
});

test('completion rewards require participation, are claimed once, preserve party claims and diminish on repeat',()=>{
  const w=world(),event=getEvent(w,'event-aschenmoor'),p=hero(event,{level:8});
  let result=solve(w,event.id,{player:p}),clock=result.clock;
  const outsider=hero(event,{id:'outsider',level:8});assert.equal(claimWorldEventReward(w,event.id,outsider,clock),null);
  p.x=event.x;p.y=event.y;
  const first=claimWorldEventReward(w,event.id,p,clock);assert.ok(first.xp>0);
  assert.equal(claimWorldEventReward(w,event.id,p,clock),null);
  assert.equal(interactWorldEvent(w,`${event.id}:start`,[p],clock+1).success,false);
  clock=event.readyAt+1;updateWorldEvents(w,.1,[p],clock);
  result=solve(w,event.id,{player:p,clock});p.x=event.x;p.y=event.y;
  const second=claimWorldEventReward(w,event.id,p,result.clock);
  assert.ok(second.xp<=first.xp*.51);
  const gray=world(),old=solve(gray,'event-daemmerhain');old.player.x=old.event.x;old.player.y=old.event.y;
  assert.equal(claimWorldEventReward(gray,old.event.id,old.player,old.clock).xp,0);
});

test('a bystander at the event edge earns nothing, while defending for two seconds or dealing damage contributes',()=>{
  const w=world(),event=getEvent(w,'event-daemmerhain'),starter=hero(event,{id:'starter'});
  const edge=hero(event,{id:'edge',x:event.x+510}),defender=hero(event,{id:'defender'}),fighter=hero(event,{id:'fighter',x:event.x+450});
  interactWorldEvent(w,`${event.id}:start`,[starter],0);
  updateWorldEvents(w,1.9,[starter,edge,defender],1.9);
  assert.ok(!event.participants.includes('edge'));assert.ok(!event.participants.includes('defender'));
  updateWorldEvents(w,.2,[starter,edge,defender],2.1);
  assert.ok(event.participants.includes('defender'));assert.ok(!event.participants.includes('edge'));
  assert.equal(recordWorldEventContribution(w,event.id,fighter),true);
  assert.ok(event.participants.includes('fighter'));
  assert.equal(recordWorldEventContribution(w,event.id,{...fighter,id:'remote',x:event.x+900}),false);
  assert.equal(recordWorldEventContribution(w,event.id,{...fighter,id:'too-young',level:0,x:event.x}),false);
  for(let tick=0;tick<240&&event.state==='active';tick++) {
    defeatOwn(w,event);updateWorldEvents(w,.25,[starter,edge],2.35+tick*.25);
  }
  assert.equal(event.state,'success');
  edge.x=event.x;assert.equal(claimWorldEventReward(w,event.id,edge,65),null,'Approaching after completion does not grant participation');
  defender.x=event.x;fighter.x=event.x;
  const defended=claimWorldEventReward(w,event.id,defender,65),fought=claimWorldEventReward(w,event.id,fighter,65);
  assert.ok(defended&&fought);assert.equal(defended.gold,fought.gold,'Each qualified party member claims their own reward');
  assert.equal(claimWorldEventReward(w,event.id,defender,65),null);
});

test('save restoration cancels active combat, preserves claimed rewards and rejects invalid event identities',()=>{
  const w=world(),event=getEvent(w,'event-daemmerhain'),p=hero(event);
  interactWorldEvent(w,`${event.id}:start`,[p],0);updateWorldEvents(w,3,[p],3);
  const save=captureWorldEvents(w);assert.equal(validateWorldEventSave(save),true);
  restoreWorldEvents(w,save,3);assert.equal(event.state,'failure');assert.equal(event.readyAt,63);
  assert.ok(w.enemies.filter(e=>e.eventId===event.id).every(e=>!e.alive));
  const completed=world(),result=solve(completed,'event-aschenmoor');result.player.x=result.event.x;result.player.y=result.event.y;
  claimWorldEventReward(completed,result.event.id,result.player,result.clock);
  const target=world();restoreWorldEvents(target,captureWorldEvents(completed),result.clock);
  assert.equal(claimWorldEventReward(target,result.event.id,result.player,result.clock),null);
  assert.equal(summarizeWorldEvents(target).length,WORLD_EVENT_DEFINITIONS.length+EXPEDITIONS.length);
  const forged=structuredClone(save);forged[0].id='event-imaginary';assert.equal(validateWorldEventSave(forged),false);
  assert.throws(()=>restoreWorldEvents(target,forged,0),TypeError);
});

test('the real Game damage hook records an ally only after an applied hit, and a full bag leaves an event reward waiting',()=>{
  const game=new Game({storage:null,random:()=>.5}),ally=new Game({storage:null,random:()=>.5});game.start();ally.start();
  const event=getEvent(game.world,'event-daemmerhain');
  game.player.id='leader';game.player.level=3;game.player.x=event.x;game.player.y=event.y;
  ally.player.id='fighter';ally.player.level=3;ally.player.x=event.x+450;ally.player.y=event.y;ally.world=game.world;
  assert.equal(game.interactWorldEvent(`${event.id}:start`),true);
  updateWorldEvents(game.world,2.1,[game,ally],2.1);
  assert.ok(!event.participants.includes('fighter'));
  const enemy=game.world.enemies.find(e=>e.eventId===event.id&&e.alive);
  enemy.shielded=true;assert.equal(ally.hitEnemy(enemy,10,0),0);assert.ok(!event.participants.includes('fighter'));
  enemy.shielded=false;assert.ok(ally.hitEnemy(enemy,10,0)>0);assert.ok(event.participants.includes('fighter'));

  game.player.level=8;
  const completed=solve(game.world,'event-aschenmoor',{player:game.player});
  game.player.x=completed.event.x;game.player.y=completed.event.y;game.time=completed.clock;
  const originalBagUsed=game.bagUsed.bind(game),gold=game.player.gold;
  game.bagUsed=()=>240;
  assert.equal(game.claimWorldEvent(completed.event.id),false);
  assert.equal(completed.event.state,'success');assert.deepEqual(completed.event.claimedBy,[]);assert.equal(game.player.gold,gold);
  game.bagUsed=originalBagUsed;
  assert.equal(game.claimWorldEvent(completed.event.id),true);assert.ok(game.player.gold>gold);
  assert.equal(game.claimWorldEvent(completed.event.id),false);
});

test('personal previews match real payouts and distinguish an open party claim from the next diminished run',()=>{
  const w=world(),event=getEvent(w,'event-aschenmoor'),p=hero(event,{level:8}),ally=hero(event,{id:'ally',level:8});
  const result=solve(w,event.id,{player:p});event.participants.push('ally');event.bonus=1.25;
  p.x=event.x;p.y=event.y;ally.x=event.x;ally.y=event.y;
  const before=summarizeWorldEvents(w,p).find(e=>e.id===event.id);
  assert.equal(before.claimable,true);assert.deepEqual(claimWorldEventReward(w,event.id,p,result.clock),{...before.reward,eventId:event.id});
  const other=summarizeWorldEvents(w,ally).find(e=>e.id===event.id);
  assert.equal(other.state,'rewarded');assert.equal(other.claimable,true);assert.equal(other.reward.repeatFactor,1);
  assert.equal(summarizeWorldEvents(w,p).find(e=>e.id===event.id).claimable,false);
  assert.deepEqual(claimWorldEventReward(w,event.id,ally,result.clock),{...other.reward,eventId:event.id});
  updateWorldEvents(w,.1,[p],event.readyAt+1);
  assert.equal(worldEventRewardPreview(event,p).repeatFactor,.5);
  assert.equal(worldEventRewardPreview(event,p).gold,Math.round((18+event.level*5)*.5),'idle preview does not inherit the old risk bonus');
  assert.equal(worldEventRewardPreview(event,{level:event.level+20}).xp,0);
});

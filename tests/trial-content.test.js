import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { ENEMY_TYPES } from '../src/catalog.js';
import { REGION_ENEMY_POOLS, bestiaryCombatStats } from '../src/bestiary.js';
import { TRIALS } from '../src/trial-content.js';
import { createEncounterDirector, captureEncounterDirector } from '../src/encounter-director.js';
import { updateWorldEvents, summarizeWorldEvents, validateWorldEventSave } from '../src/world-events.js';

const DT=.04,clone=value=>JSON.parse(JSON.stringify(value));
// These 30 coordinates were captured from published commit c50f478 before the
// trials were appended. Tests need no Git history at runtime.
const PRE_TRIAL_POSITIONS=[
  ['event-daemmerhain',552,1883],['event-frostgrat',394,644],['event-aschenmoor',2486,770],['event-glutoede',2202,2037],
  ['event-sonnensteppe',5024,1968],['event-jadeauen',8433,1810],['event-sturmkueste',11904,1680],['event-dornwildnis',14752,1920],
  ['event-obsidianpass',17824,1872],['event-mondbruch',16384,5280],['event-permafrost',10240,5360],['event-sandsenke',3520,5320],
  ['event-traumsenke',3520,9480],['event-blutmark',9984,9600],['event-sternensund',16384,9600],['event-nexusriss',9984,13120],
  ['expedition-trauerweg',285,1680],['expedition-salzzug',10631,1967],['expedition-ofenpfad',16960,1896],['expedition-schlafgericht',1792,9480],
  ['event-sivra',975,684],['event-irdan',4064,1320],['event-orsa',10906,706],['event-vey',14592,4960],['event-nera',4608,8360],['event-asterion',15552,12520],
  ['expedition-weisshorn',1200,315],['expedition-schilfzug',7104,1920],['expedition-zeitbruch',17920,4000],['expedition-namenlos',2432,7800],
];
function fresh(level=100,id='starter') {
  const game=new Game({storage:null,random:()=>.5});game.start();Object.assign(game.player,{id,level,invulnerable:100});
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  // Isolate the authored wave population. Native AI, player damage, event
  // contribution and kill handling remain enabled throughout these tests.
  game.world.enemies=[];return game;
}
const eventFor=(game,id)=>game.world.worldEvents.find(event=>event.id===id);
const approach=(game,point)=>Object.assign(game.player,{x:point.x,y:point.y});
const actors=(game,event)=>game.world.enemies.filter(enemy=>enemy.eventId===event.id&&enemy.eventRun===event.run&&enemy.alive);
const properties=(game,event)=>game.world.eventObjects.filter(object=>object.eventId===event.id&&!object.hidden);
function step(game,seconds,party=[game]) {
  for(let left=seconds;left>1e-10;left-=DT){const dt=Math.min(DT,left);game.update(dt,{simulateWorld:false});game.updateWorld(dt,party);}
}
function start(game,definition) {
  const event=eventFor(game,definition.id);approach(game,event);assert.equal(game.interactWorldEvent(`${event.id}:start`),true);return event;
}
function spawnWave(game,event,party=[game]) {
  assert.equal(event.phase,'wave-warning');assert.equal(event.pending.length,1);
  const remaining=event.pending[0].at-event.elapsed;assert.ok(remaining>=6-1e-9);
  assert.equal(actors(game,event).length,0);step(game,remaining-.04,party);
  const warning=summarizeWorldEvents(game.world,game.player).find(summary=>summary.id===event.id);assert.ok(warning.warningRemaining>0&&warning.warningRemaining<.041,'The global summary tracks the actual remaining warning instead of a static six seconds');
  assert.equal(actors(game,event).length,0,'A wave cannot spawn before its complete six-second warning');step(game,.08,party);
  assert.equal(event.phase,'wave-combat');assert.equal(event.pending.length,0);return actors(game,event);
}
function defeat(game,event) {
  const alive=actors(game,event);assert.ok(alive.length);
  for(const enemy of alive){game.hitEnemy(enemy,enemy.maxHp*100,0);assert.equal(enemy.alive,false,'The native damage and kill path defeats the actor');}
  step(game,.04);assert.equal(actors(game,event).length,0);
}
function choose(game,event,choice) {
  const object=properties(game,event).find(prop=>prop.role==='choice'&&prop.choice===choice);assert.ok(object);approach(game,object);
  assert.equal(game.interactWorldEvent(object.id,choice),true);return object;
}
function complete(game,definition,{push=false,checkBoss=false}={}) {
  const prior=eventFor(game,definition.id),completedBefore=prior.completions,ledgerBefore=game.ledger[`world_event:${definition.id}`]||0;
  const event=start(game,definition),waves=[];
  for(let index=0;index<definition.waves.length;index++) {
    const plan=definition.waves[index],live=spawnWave(game,event),expected=plan.boss?1:Math.min(7,plan.count+(push&&index>0?1:0));
    assert.equal(live.length,expected);assert.equal(new Set(live.map(enemy=>enemy.id)).size,live.length);waves.push(live.map(enemy=>enemy.id));
    for(const [ordinal,enemy] of live.entries()) {
      const type=plan.boss||plan.types[ordinal%plan.types.length],stats=bestiaryCombatStats(ENEMY_TYPES[type],definition.level);assert.equal(enemy.type,type);
      assert.equal(enemy.maxHp,plan.boss?stats.maxHp:Math.round(Math.round(stats.maxHp*.65)*plan.hpScale));
      assert.equal(enemy.damage,plan.boss?stats.damage:Math.max(1,Math.round(Math.max(1,Math.round(stats.damage*.8))*plan.damageScale)));
      assert.equal(enemy.rewardless,true);assert.equal(enemy.xp,0);assert.equal(enemy.gold,0,'Wave bodies never pay an independent completion reward');
    }
    const before=event.waveIndex;step(game,.2);assert.equal(event.waveIndex,before);assert.equal(event.pending.length,0);assert.equal(actors(game,event).length,live.length,'Another wave cannot overlap a living wave');
    if(plan.boss&&checkBoss){
      const boss=live[0];for(let frame=0;frame<250&&boss.phase!=='windup';frame++)step(game,DT);
      assert.equal(boss.phase,'windup','The actual final boss executes its native AI');
      if(ENEMY_TYPES[boss.type].encounterProfile){assert.ok(boss.telegraphShapes.length>0);assert.ok(Object.isFrozen(boss.telegraphShapes));assert.equal(boss.telegraphExtraFan,null);}
    }
    defeat(game,event);
    if(index<definition.waves.length-1){assert.equal(event.phase,'intermission');assert.equal(properties(game,event).filter(p=>p.role==='choice').length,2);choose(game,event,push?'push':'rest');}
  }
  assert.equal(event.state,'success');assert.equal(event.completions,completedBefore+1);assert.equal(game.ledger[`world_event:${event.id}`],ledgerBefore+1);
  return {event,waves};
}

test('three immutable trials own distinct lore, regional formations, normal scaling and unmodified final bosses',()=>{
  assert.equal(TRIALS.length,3);assert.deepEqual(TRIALS.map(t=>t.waves.length),[4,4,5]);assert.deepEqual(TRIALS.map(t=>[t.level,t.minLevel]),[[10,8],[32,30],[100,98]]);
  for(const trial of TRIALS){
    assert.equal(trial.mode,'gauntlet');assert.equal(trial.contentType,'challenge');assert.equal(trial.partyRequired,1);assert.equal(trial.repeatable,true);assert.equal(trial.timeout,600);
    assert.ok(trial.description.length>90&&trial.hint.length>90);assert.ok(Object.isFrozen(trial.waves));
    for(const wave of trial.waves.slice(0,-1)){assert.ok(wave.count>=2&&wave.count<=6);assert.ok(Object.isFrozen(wave.types));assert.ok(new Set(wave.types).size>=2);for(const type of wave.types){assert.ok(REGION_ENEMY_POOLS[trial.region].includes(type));assert.ok(!ENEMY_TYPES[type].boss);}}
    const boss=trial.waves.at(-1);assert.equal(boss.count,1);assert.equal(ENEMY_TYPES[boss.boss].boss,true);assert.equal(boss.hpScale,undefined);assert.equal(boss.damageScale,undefined);
  }
});

test('appending trials preserves all thirty published positions and leaves their new starting signs on free wilderness',()=>{
  const game=fresh();assert.deepEqual(game.world.worldEvents.slice(0,30).map(event=>[event.id,event.x,event.y]),PRE_TRIAL_POSITIONS);
  for(const trial of TRIALS){const event=eventFor(game,trial.id);assert.ok(event);assert.equal(game.inSettlement(event.x,event.y),false);assert.equal(game.collides(event.x,event.y,22),false);
    const summary=summarizeWorldEvents(game.world,game.player).find(e=>e.id===event.id);assert.equal(summary.contentType,'challenge');assert.equal(summary.wave.total,trial.waves.length);assert.equal(summary.wave.bossFinal,true);assert.equal(summary.warningRemaining,0);}
});

for(const definition of TRIALS)test(`${definition.id} warns every actual wave, never overlaps packs, preserves real budgets and runs its final boss AI`,()=>{
  const game=fresh(definition.level);const {event,waves}=complete(game,definition,{push:true,checkBoss:true});
  assert.equal(new Set(waves.flat()).size,waves.flat().length);assert.ok(Math.abs(event.bonus-(1+.05*(definition.waves.length-1)))<1e-9);assert.ok(event.bonus<=1.25);
  const summary=summarizeWorldEvents(game.world,game.player).find(e=>e.id===event.id);assert.equal(summary.wave.cleared,definition.waves.length);assert.equal(summary.warningRemaining,0);
});

test('a rest choice heals only qualified nearby living participants once and clamps their actual resources',()=>{
  const definition=TRIALS[0],game=fresh(definition.level),event=start(game,definition);spawnWave(game,event);defeat(game,event);
  const nearby=fresh(definition.level,'nearby'),far=fresh(definition.level,'far'),dead=fresh(definition.level,'dead'),outsider=fresh(definition.level,'outsider');
  const party=[game,nearby,far,dead,outsider];for(const member of party){member.world=game.world;member.overworld=game.world;approach(member,event);}
  // Earn real two-second defensive contribution before moving out or falling.
  outsider.player.x+=350;step(game,2.04,party);assert.ok(['starter','nearby','far','dead'].every(id=>event.participants.includes(id)));assert.ok(!event.participants.includes('outsider'));
  far.player.x=event.x+300;dead.dead=true;dead.player.hp=0;approach(outsider,event);
  for(const member of [game,nearby,far,outsider]){const stats=member.stats();member.player.hp=stats.maxHp*.5;member.player.mana=stats.mana*.5;}
  const before=new Map(party.map(member=>[member.player.id,{hp:member.player.hp,mana:member.player.mana,stats:member.stats()}]));
  game.partyGames=party;const object=choose(game,event,'rest');
  for(const member of party){const prior=before.get(member.player.id),qualified=['starter','nearby'].includes(member.player.id);assert.ok(Math.abs(member.player.hp-(prior.hp+(qualified?prior.stats.maxHp*.2:0)))<1e-9,member.player.id);assert.ok(Math.abs(member.player.mana-(prior.mana+(qualified?prior.stats.mana*.15:0)))<1e-9,member.player.id);}
  const paid=party.map(member=>[member.player.hp,member.player.mana]);assert.equal(game.interactWorldEvent(object.id,'rest'),false);assert.deepEqual(party.map(member=>[member.player.hp,member.player.mana]),paid);
  spawnWave(game,event,party.filter(member=>!member.dead));defeat(game,event);for(const member of [game,nearby]){member.player.hp=member.stats().maxHp*.95;member.player.mana=member.stats().mana*.95;}game.partyGames=party;choose(game,event,'rest');
  for(const member of [game,nearby]){assert.equal(member.player.hp,member.stats().maxHp);assert.equal(member.player.mana,member.stats().mana);}
});

test('forged or stale choices cannot switch signs, heal twice, change wave budgets or exceed the saved trial bonus cap',()=>{
  const game=fresh(10),event=start(game,TRIALS[0]);spawnWave(game,event);defeat(game,event);
  const push=properties(game,event).find(p=>p.choice==='push');approach(game,push);const before=clone({phase:event.phase,pending:event.pending,bonus:event.bonus,hp:game.player.hp,mana:game.player.mana});
  for(const [id,choice] of [[push.id,'rest'],[push.id,'forged-free-loot'],['forged-trial-choice','push']])assert.equal(game.interactWorldEvent(id,choice),false);
  assert.deepEqual(clone({phase:event.phase,pending:event.pending,bonus:event.bonus,hp:game.player.hp,mana:game.player.mana}),before);
  event.bonus=1.25;choose(game,event,'push');assert.equal(event.bonus,1.25);assert.equal(game.interactWorldEvent(push.id,'push'),false);assert.equal(event.pending.length,1);
  const saved=clone(game.capture().world.worldEvents);saved.find(e=>e.id===event.id).bonus=1.5;assert.equal(validateWorldEventSave(saved),false,'A forged portable save cannot bypass the 25 percent trial ceiling');
  saved.find(e=>e.id===event.id).bonus=1.25;saved.find(e=>e.id==='event-blutmark').bonus=1.5;assert.equal(validateWorldEventSave(saved),true,'The existing blood-banner reward policy stays intact');
});

test('drängen adds one foe only to the next normal wave while a later rest keeps the earned bonus',()=>{
  const game=fresh(10),event=start(game,TRIALS[0]);spawnWave(game,event);defeat(game,event);choose(game,event,'push');
  assert.equal(spawnWave(game,event).length,4);assert.equal(event.bonus,1.05);defeat(game,event);choose(game,event,'rest');
  assert.equal(spawnWave(game,event).length,4,'The earlier risk does not add a fifth foe to the later normal wave');assert.equal(event.bonus,1.05);defeat(game,event);choose(game,event,'push');
  const boss=spawnWave(game,event);assert.equal(boss.length,1);assert.equal(boss[0].type,'ash_brute_boss');assert.equal(event.bonus,1.1);
});

test('trial start gates enforce level, proximity and existing pressure while the active trial pauses new wilderness packs',()=>{
  const game=fresh(7),event=eventFor(game,TRIALS[0].id);approach(game,event);assert.equal(game.interactWorldEvent(`${event.id}:start`),false);game.player.level=10;game.player.x+=100;assert.equal(game.interactWorldEvent(`${event.id}:start`),false);approach(game,event);
  const director=game.world.encounterDirector;for(const stage of ['warning','active']){Object.assign(director,{stage,anchor:{x:event.x,y:event.y}});assert.equal(game.interactWorldEvent(`${event.id}:start`),false);}
  Object.assign(director,{stage:'warning',anchor:{x:event.x+1100,y:event.y}});assert.equal(game.interactWorldEvent(`${event.id}:start`),true,'An unrelated distant pack does not block this sign');
  game.world.encounterDirector=createEncounterDirector();game.world.encounterDirector.nextIn=.04;const before=captureEncounterDirector(game.world);step(game,6.08);
  assert.deepEqual(captureEncounterDirector(game.world),before);assert.ok(!game.world.enemies.some(enemy=>enemy.directorId));assert.ok(!game.hazards.some(hazard=>hazard.directorId));
});

test('only trials receive the six-hundred-second limit and abandoning one removes its living wave',()=>{
  const game=fresh(10),event=start(game,TRIALS[0]);updateWorldEvents(game.world,301,[game.player],301);assert.equal(event.state,'active');assert.ok(actors(game,event).length);
  updateWorldEvents(game.world,300,[game.player],601);assert.equal(event.state,'failure');assert.equal(actors(game,event).length,0);assert.equal(event.pending.length,0);
  const old=fresh(10),legacy=eventFor(old,'event-glutoede');approach(old,legacy);assert.equal(old.interactWorldEvent(`${legacy.id}:start`),true);updateWorldEvents(old.world,301,[old.player],301);assert.equal(legacy.state,'failure','Earlier activities retain their existing limit');
  const left=fresh(10),abandoned=start(left,TRIALS[0]);spawnWave(left,abandoned);left.player.x+=900;step(left,20.08);assert.equal(abandoned.state,'failure');assert.equal(actors(left,abandoned).length,0);
});

test('portable trial saves cancel active combat, preserve one reward claim and permit a reduced fresh run after cooldown',()=>{
  const definition=TRIALS[0],game=fresh(definition.level),active=start(game,definition);spawnWave(game,active);
  const midrun=clone(game.capture()),interrupted=fresh(definition.level);interrupted.applySave(midrun);interrupted.start();assert.equal(eventFor(interrupted,definition.id).state,'failure');approach(interrupted,active);assert.equal(interrupted.claimWorldEvent(active.id),false);
  const winner=fresh(definition.level),{event}=complete(winner,definition);approach(winner,event);const preview=summarizeWorldEvents(winner.world,winner.player).find(e=>e.id===event.id).reward;
  assert.equal(winner.claimWorldEvent(event.id),true);const paid=clone(winner.capture()),restored=fresh(definition.level);restored.applySave(paid);restored.start();approach(restored,event);
  assert.equal(restored.claimWorldEvent(event.id),false);assert.equal(restored.player.gold,paid.player.gold);assert.deepEqual(restored.inventory,paid.inventory);assert.equal(restored.ledger[`world_event:${event.id}`],1);
  const restoredEvent=eventFor(restored,event.id);assert.equal(restored.interactWorldEvent(`${event.id}:start`),false);restored.time=restoredEvent.readyAt+.1;restored.updateWorld(.04,[restored]);assert.equal(restoredEvent.state,'idle');restored.player.invulnerable=100;
  const repeated=complete(restored,definition).event;assert.equal(repeated.run,event.run+1);assert.ok(restored.world.enemies.filter(enemy=>enemy.eventId===event.id).every(enemy=>enemy.eventRun===repeated.run),'Restart removes all earlier run bodies');
  const second=summarizeWorldEvents(restored.world,restored.player).find(e=>e.id===event.id).reward;assert.ok(second.gold<=Math.ceil(preview.gold*.5));approach(restored,repeated);assert.equal(restored.claimWorldEvent(repeated.id),true);assert.equal(restored.claimWorldEvent(repeated.id),false);
});

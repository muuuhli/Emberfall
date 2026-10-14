import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { MultiplayerHub } from '../server/multiplayer.mjs';
import { REGIONS, ENEMY_TYPES } from '../src/catalog.js';
import { bestiaryCombatStats } from '../src/bestiary.js';
import { createEncounterDirector, updateEncounterDirector, captureEncounterDirector, validateEncounterDirectorSave, restoreEncounterDirector, ENCOUNTER_RULES } from '../src/encounter-director.js';
import { updateWorldEvents, worldEventPartyHpScale, worldEventRewardPreview, captureWorldEvents, restoreWorldEvents, EXPEDITIONS } from '../src/world-events.js';
import { TRIALS } from '../src/trial-content.js';
import { HUNTS, HUNT_REWARDS, huntRewardLevel, validateEndgameState } from '../src/endgame.js';
import { equipmentSlot } from '../src/equipment-system.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const approach=(game,point)=>Object.assign(game.player,{x:point.x,y:point.y});
function field(level=52,regionId='mondbruch',id='leader') {
  const game=new Game({storage:null,random:()=>.5});game.start();Object.assign(game.player,{level,id});
  for(const key of ['enemies','trees','rocks','structures','river','bridges','interactions'])game.world[key]=[];
  const region=REGIONS.find(r=>r.id===regionId);approach(game,{x:region.x+region.w*.55,y:region.y+region.h*.45});
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  return game;
}
function roster(game,count=8) {
  const party=[game];
  for(let index=1;index<count;index++) {
    const member=field(game.player.level,game.regionAt().id,`member-${index}`);
    member.world=game.world;member.overworld=game.world;approach(member,game.player);party.push(member);
  }
  for(const member of party)member.partyGames=party;
  return party;
}
function begin(game,id,party=[game]) {
  const event=game.world.worldEvents.find(e=>e.id===id);
  for(const member of party){member.world=game.world;member.overworld=game.world;member.partyGames=party;approach(member,event);}
  assert.equal(game.interactWorldEvent(`${id}:start`),true);
  for(const rune of game.world.eventObjects.filter(o=>o.eventId===id&&o.role==='rune'&&!o.hidden)) {
    approach(game,rune);assert.equal(game.interactWorldEvent(rune.id),true);
  }
  approach(game,event);return event;
}
function updateEvent(game,dt,party=[game]) {
  game.time+=dt;game.handleWorldEventEffects(updateWorldEvents(game.world,dt,party,game.time));
}
const ownActors=(game,event)=>game.world.enemies.filter(e=>e.eventId===event.id&&e.eventRun===event.run&&e.alive);
function resolveBossFixture(game,id,party=[game]) {
  const event=begin(game,id,party);updateEvent(game,.04,party);updateEvent(game,2,party);
  const actors=ownActors(game,event);assert.ok(actors.some(e=>e.boss));
  // One-hit health fixtures verify native payment and save behavior, while
  // full-health multiplayer timing is measured separately by gameplay audits.
  for(const enemy of actors) {
    enemy.hp=1;Object.assign(game.player,{x:enemy.x-35,y:enemy.y,face:0});game.cooldowns.attack=0;
    assert.equal(game.action('attack'),true);assert.equal(enemy.alive,false);
  }
  approach(game,event);updateEvent(game,.04,party);assert.equal(event.state,'success');return event;
}
function resolveRiskExpeditionFixture(game,id) {
  const event=game.world.worldEvents.find(e=>e.id===id),definition=EXPEDITIONS.find(e=>e.id===id);
  approach(game,event);assert.equal(game.interactWorldEvent(`${id}:start`),true);
  const use=object=>{approach(game,object);assert.equal(game.interactWorldEvent(object.id),true);};
  for(let frame=0;frame<1400&&event.state==='active';frame++) {
    const stage=definition.stages[event.stageIndex],objects=game.world.eventObjects.filter(o=>o.eventId===id&&!o.hidden);
    const choice=objects.find(o=>o.role==='choice'&&o.choice==='risk');
    if(choice)use(choice);
    else if(['ambush','boss_hunt'].includes(stage.type)) {
      const next=objects.find(o=>o.role==='rune'&&!o.active);if(next)use(next);
    } else if(stage.type==='ritual'&&stage.rule==='sequence') {
      const next=objects.find(o=>o.role==='rune'&&o.symbol===stage.symbols[event.objective.progress]);if(next)use(next);
    } else approach(game,event);
    updateEvent(game,.25);
    // The same declared one-hit fixture isolates real stage completion and
    // reward bookkeeping from the independent full-health balance probes.
    for(const enemy of ownActors(game,event)) {
      enemy.hp=1;Object.assign(game.player,{x:enemy.x-35,y:enemy.y,face:0});game.cooldowns.attack=0;
      assert.equal(game.action('attack'),true);assert.equal(enemy.alive,false);
    }
  }
  assert.equal(event.state,'success');assert.equal(event.risky,true);assert.equal(event.bonus,1.25);return event;
}

test('party HP factors are bounded and preserve native one-person budgets',()=>{
  for(let size=1;size<=8;size++) {
    assert.equal(worldEventPartyHpScale(size),1+.35*(size-1));
    assert.equal(worldEventPartyHpScale(size,true),1+.55*(size-1));
  }
  assert.equal(worldEventPartyHpScale(0),1);assert.equal(worldEventPartyHpScale(999),3.4499999999999997);
  assert.equal(worldEventPartyHpScale(999,true),4.8500000000000005);
  for(const value of [undefined,NaN,Infinity])assert.equal(worldEventPartyHpScale(value,true),1);
});

test('all eight real director roster sizes keep warnings and actor caps while adding only linear HP',()=>{
  const game=field(52),party=roster(game);game.world.worldEvents=[];game.world.shrines=[];
  for(let size=1;size<=8;size++) {
    game.world.enemies=[];game.hazards=[];game.world.encounterDirector=createEncounterDirector();
    Object.assign(game.world.encounterDirector,{sequence:2,nextIn:0});
    updateEncounterDirector(game,.04,party.slice(0,size));const state=game.world.encounterDirector;
    assert.equal(state.stage,'warning');assert.equal(state.remaining,8);assert.ok(state.plan.every(point=>point.partySize===size));
    const points=clone(state.plan);updateEncounterDirector(game,7.99,party.slice(0,size));assert.equal(game.world.enemies.length,0);
    updateEncounterDirector(game,.02,party.slice(0,size));assert.equal(state.stage,'active');
    const actors=game.world.enemies.filter(e=>e.directorId);assert.equal(actors.length,points.length);
    assert.ok(actors.length<=ENCOUNTER_RULES.maxActors);assert.equal(actors.filter(e=>e.elite).length,2);
    for(const actor of actors) {
      const stats=bestiaryCombatStats(ENEMY_TYPES[actor.type],actor.level),hpFactor=actor.elite?3.2:1.45;
      assert.equal(actor.partySize,size);assert.equal(actor.partyHpScale,1+.20*(size-1));
      assert.equal(actor.maxHp,Math.round(Math.round(stats.maxHp*hpFactor)*actor.partyHpScale));
      assert.equal(actor.damage,Math.round(stats.damage*(actor.elite?1.6:1.25)),'Group presence never multiplies damage');
    }
  }
});

test('every trial first wave supports rosters one through eight without adding actors or damage',()=>{
  for(const trial of TRIALS) {
    const game=field(trial.level,trial.region),party=roster(game),canonical=clone(game.world.worldEvents.find(e=>e.id===trial.id));
    const objects=clone(game.world.eventObjects.filter(o=>o.eventId===trial.id));
    for(let size=1;size<=8;size++) {
      game.world.worldEvents=[clone(canonical)];game.world.eventObjects=clone(objects);game.world.enemies=[];game.world.encounterDirector=createEncounterDirector();game.time=0;
      const event=begin(game,trial.id,party.slice(0,size));updateEvent(game,.04,party.slice(0,size));assert.equal(event.pending[0].partySize,size);
      updateEvent(game,5.95,party.slice(0,size));assert.equal(ownActors(game,event).length,0);
      updateEvent(game,.02,party.slice(0,size));const actors=ownActors(game,event),plan=trial.waves[0];assert.equal(actors.length,plan.count);
      for(const actor of actors) {
        const stats=bestiaryCombatStats(ENEMY_TYPES[actor.type],trial.level);
        assert.equal(actor.partySize,size);assert.equal(actor.partyHpScale,worldEventPartyHpScale(size));
        assert.equal(actor.maxHp,Math.round(Math.round(Math.round(stats.maxHp*.65)*plan.hpScale)*actor.partyHpScale));
        assert.equal(actor.damage,Math.max(1,Math.round(Math.max(1,Math.round(stats.damage*.8))*plan.damageScale)));
        assert.equal(actor.rewardless,true);
      }
    }
  }
});

test('director roster sampling ignores unavailable members and a later arrival cannot rewrite its eight-second warning',()=>{
  const game=field(),party=roster(game);game.world.worldEvents=[];game.world.shrines=[];
  party[1].player.x+=701;party[2].dead=true;party[3].player.hp=0;party[4].player.level=3;
  party[5].player.downed=true;party[6].worldMode='pvp';party[7].player.alive=false;
  Object.assign(game.world.encounterDirector,{sequence:2,nextIn:0});updateEncounterDirector(game,.04,[...party,game,game]);
  const state=game.world.encounterDirector;assert.equal(state.stage,'warning');assert.ok(state.plan.every(point=>point.partySize===1));
  for(const member of party){member.dead=false;member.worldMode='overworld';Object.assign(member.player,{level:52,hp:member.stats().maxHp,downed:false,alive:true});approach(member,game.player);}
  updateEncounterDirector(game,8,party);const actors=game.world.enemies.filter(e=>e.directorId);
  assert.ok(actors.length>0);assert.ok(actors.every(actor=>actor.partySize===1&&actor.partyHpScale===1));
});

test('an authored boss freezes the warned nearby roster and never heals or shrinks on joins and departures',()=>{
  const game=field(),party=roster(game),event=begin(game,'event-vey',party.slice(0,3));
  updateEvent(game,.04,party.slice(0,3));assert.equal(event.pending[0].partySize,3);
  updateEvent(game,2,[game]);const boss=ownActors(game,event).find(e=>e.boss);assert.ok(boss);
  const stats=bestiaryCombatStats(ENEMY_TYPES[boss.type],event.level);
  assert.equal(boss.partySize,3);assert.equal(boss.maxHp,Math.round(stats.maxHp*worldEventPartyHpScale(3,true)));
  approach(game,boss);assert.ok(game.hitEnemy(boss,100,0)>0);const hp=boss.hp,maxHp=boss.maxHp;
  for(const member of party)approach(member,event);
  updateEvent(game,.25,party);assert.equal(boss.hp,hp);assert.equal(boss.maxHp,maxHp);
  updateEvent(game,.25,[game]);assert.equal(boss.hp,hp);assert.equal(boss.maxHp,maxHp);
});

test('distant, dead, downed, under-level, PvP and duplicated members do not inflate a warning',()=>{
  const game=field(),party=roster(game),event=begin(game,'event-vey',party);
  party[1].player.x=event.x+521;party[2].dead=true;party[3].player.hp=0;party[4].player.level=1;
  party[5].player.downed=true;party[6].worldMode='pvp';party[7].player.x=event.x+520;
  updateEvent(game,.04,[...party,game,game]);assert.equal(event.pending[0].partySize,1);
  updateEvent(game,2,[...party,game]);const boss=ownActors(game,event).find(e=>e.boss);
  assert.equal(boss.partySize,1);assert.equal(boss.maxHp,bestiaryCombatStats(ENEMY_TYPES[boss.type],event.level).maxHp);
});

test('each later trial warning can use its new roster without rewriting an earlier wave',()=>{
  const trial=TRIALS[0],game=field(trial.level,trial.region),party=roster(game),event=begin(game,trial.id,[game]);
  updateEvent(game,.04,[game]);updateEvent(game,6,[game]);const first=ownActors(game,event);
  assert.ok(first.every(actor=>actor.partySize===1));
  for(const actor of first)game.hitEnemy(actor,actor.maxHp*10,0);updateEvent(game,.04,[game]);assert.equal(event.phase,'intermission');
  const rest=game.world.eventObjects.find(o=>o.eventId===event.id&&o.role==='choice'&&o.choice==='rest'&&!o.hidden);
  approach(game,rest);assert.equal(game.interactWorldEvent(rest.id),true);for(const member of party)approach(member,event);
  updateEvent(game,.04,party);assert.equal(event.pending[0].partySize,8);updateEvent(game,6,party);
  assert.ok(ownActors(game,event).every(actor=>actor.partySize===8));assert.ok(first.every(actor=>actor.hp===0&&actor.partySize===1));
});

test('director warning and active saves preserve the frozen roster, while legacy points restore solo and forged sizes fail',()=>{
  const game=field(),party=roster(game,3);game.world.worldEvents=[];game.world.shrines=[];
  Object.assign(game.world.encounterDirector,{sequence:2,nextIn:0});updateEncounterDirector(game,.04,party);
  const warning=clone(captureEncounterDirector(game.world));assert.equal(validateEncounterDirectorSave(warning),true);
  const loaded=field();restoreEncounterDirector(loaded.world,warning);assert.ok(loaded.world.encounterDirector.plan.every(p=>p.partySize===3));
  updateEncounterDirector(loaded,8,[loaded]);const actor=loaded.world.enemies.find(e=>e.directorId);assert.ok(actor);assert.equal(actor.partySize,3);
  loaded.hitEnemy(actor,50,0);const active=clone(captureEncounterDirector(loaded.world)),before=actor.hp;
  restoreEncounterDirector(loaded.world,active);const restored=loaded.world.enemies.find(e=>e.id===actor.id);assert.equal(restored.hp,before);assert.equal(restored.maxHp,actor.maxHp);assert.equal(restored.partySize,3);
  for(const size of [0,9,-1,.5,'3']){const forged=clone(warning);forged.plan[0].partySize=size;assert.equal(validateEncounterDirectorSave(forged),false);}
  const legacy=clone(warning);for(const point of legacy.plan)delete point.partySize;
  assert.equal(validateEncounterDirectorSave(legacy),true);restoreEncounterDirector(loaded.world,legacy);updateEncounterDirector(loaded,8,[loaded]);assert.ok(loaded.world.enemies.filter(e=>e.directorId).every(e=>e.partySize===1));
});

test('all local authored activity types pause wilderness planning and cannot erase a real incoming warning',()=>{
  const ids=['event-sonnensteppe','event-frostgrat','event-mondbruch','event-jadeauen','event-glutoede','event-vey','expedition-namenlos','trial-last-scar'];
  for(const id of ids) {
    const game=field(100),event=begin(game,id);game.world.encounterDirector.nextIn=.04;
    const before=clone(captureEncounterDirector(game.world));updateEncounterDirector(game,2,[game]);assert.deepEqual(captureEncounterDirector(game.world),before,id);
    assert.equal(event.state,'active');
  }
  const game=field(),event=game.world.worldEvents.find(e=>e.id==='event-vey');approach(game,event);
  Object.assign(game.world.encounterDirector,{sequence:2,nextIn:0});updateEncounterDirector(game,.04,[game]);assert.equal(game.world.encounterDirector.stage,'warning');
  const before=clone(captureEncounterDirector(game.world));assert.equal(game.interactWorldEvent(`${event.id}:start`),false);
  assert.equal(event.state,'idle');assert.deepEqual(captureEncounterDirector(game.world),before);
});

test('another nearby activity blocks a new start without pausing a separate distant encounter',()=>{
  const game=field(),first=begin(game,'event-vey'),second=game.world.worldEvents.find(e=>e.id==='event-mondbruch');
  // The relative-position fixture tests the protected boundary without moving
  // shipped world geometry in production.
  Object.assign(second,{x:first.x+799,y:first.y});const sign=game.world.eventObjects.find(o=>o.id===`${second.id}:start`);Object.assign(sign,{x:second.x,y:second.y});approach(game,sign);
  assert.equal(game.interactWorldEvent(sign.id),false);assert.equal(second.state,'idle');assert.equal(first.state,'active');
  second.x=first.x+801;sign.x=second.x;approach(game,sign);assert.equal(game.interactWorldEvent(sign.id),true);assert.equal(second.state,'active');
});

test('an actual authority roster excludes disconnected members while keeping the already warned boss budget',()=>{
  const hub=new MultiplayerHub({createGame:()=>field(),clock:()=>0,autoStart:false}),room={code:'ROSTERTEST',members:new Map(),time:0,lastActive:0};hub.rooms.set(room.code,room);
  try {
    const members=[hub._createMember(room,{classId:'guardian',playerName:'One'}),hub._createMember(room,{classId:'guardian',playerName:'Two'})];
    const game=members[0].game,party=members.map(m=>m.game);const event=begin(game,'event-vey',party);hub.tick(.04);
    assert.equal(event.pending[0].partySize,2);members[1].active=false;
    for(let tick=0;tick<52;tick++)hub.tick(.04);
    const boss=ownActors(game,event).find(e=>e.boss);assert.ok(boss);assert.equal(game.partyGames.length,1);assert.equal(boss.partySize,2);
    const maxHp=boss.maxHp;approach(game,boss);game.hitEnemy(boss,50,0);const hp=boss.hp;
    members[1].active=true;approach(members[1].game,event);hub.tick(.04);
    assert.equal(game.partyGames.length,2);assert.equal(boss.maxHp,maxHp);assert.equal(boss.hp,hp);
  } finally{hub.dispose();}
});

test('the first two matched boss rewards retain boss chances and paid repeats use ordinary chances with exact currency',()=>{
  const game=field(100,'nexusriss'),base=game.world.worldEvents.find(e=>e.id==='event-asterion');
  for(const [ordinal,factor,bossLoot] of [[0,1,true],[1,.5,true],[2,.25,false],[8,.25,false]]) {
    const event={...base,state:'active',rewardedRuns:ordinal,bonus:1.25,runRewardFactor:1};
    const preview=worldEventRewardPreview(event,{level:100});assert.equal(preview.repeatFactor,factor);assert.equal(preview.boss,true);assert.equal(preview.bossLoot,bossLoot);assert.equal(preview.rarity,undefined);
    assert.equal(preview.gold,Math.round((18+100*5)*factor*1.25));assert.equal(preview.dust,Math.max(1,Math.round((2+100/12)*factor*1.25)));
  }
  const normal=game.world.worldEvents.find(e=>e.id==='event-sternensund');assert.equal(worldEventRewardPreview(normal,{level:normal.level}).bossLoot,false,'An ordinary first reward never gets boss rarity odds');
});

test('a level gap of twenty is gray independently of repeat history and preserves canonical low loot levels',()=>{
  const game=field(100),base=game.world.worldEvents.find(e=>e.id==='event-irdan');
  for(const ordinal of [0,1,2,20]) {
    const event={...base,state:'active',rewardedRuns:ordinal,bonus:1};
    const matched=worldEventRewardPreview(event,{level:12}),almost=worldEventRewardPreview(event,{level:31}),gray=worldEventRewardPreview(event,{level:32});
    assert.equal(almost.rarity,undefined);assert.ok(almost.xp>0);
    assert.equal(gray.xp,0);assert.equal(gray.dust,0);assert.equal(gray.rarity,'common');assert.equal(gray.bossLoot,false);
    assert.equal(gray.gold,Math.round((18+12*5)*matched.repeatFactor*.1));assert.equal(gray.lootLevel,12);
  }
});

test('personal real claims match previews, use the same paid ordinal for the party, and cannot pay twice after reload',()=>{
  const game=field(12,'sonnensteppe','matched'),gray=field(100,'sonnensteppe','gray');const party=[game,gray];
  gray.lootPity={legendaryMisses:147,bossMisses:13};const grayPity=clone(gray.lootPity),grayProgress={level:gray.player.level,xp:gray.player.xp};
  const event=resolveBossFixture(game,'event-irdan',party);assert.ok(event.participants.includes(gray.player.id));
  const expected=worldEventRewardPreview(event,game),grayExpected=worldEventRewardPreview(event,gray);assert.equal(expected.bossLoot,true);assert.equal(grayExpected.rarity,'common');
  const gold=game.player.gold,dust=game.resources.dust;approach(game,event);assert.equal(game.claimWorldEvent(event.id),true);
  assert.equal(game.player.gold,gold+expected.gold);assert.equal(game.resources.dust,dust+expected.dust);assert.equal(event.rewardedRuns,1);
  const stillOpen=worldEventRewardPreview(event,gray);assert.deepEqual(stillOpen,grayExpected,'Another party claim uses this completed run, not the next diminished ordinal');
  const grayGold=gray.player.gold,grayDust=gray.resources.dust;approach(gray,event);assert.equal(gray.claimWorldEvent(event.id),true);
  assert.equal(gray.player.gold,grayGold+grayExpected.gold);assert.equal(gray.resources.dust,grayDust);
  assert.deepEqual(gray.lootPity,grayPity,'Forced Common gray rewards cannot build either pity counter');
  assert.deepEqual({level:gray.player.level,xp:gray.player.xp},grayProgress,'Gray replay gives no level progression');
  const item=Object.values(gray.generatedItems).find(i=>i.source===event.id);assert.ok(item);assert.equal(item.rarity,'common');assert.equal(item.level,event.level);
  assert.equal(event.rewardedRuns,1);const paid=clone(gray.capture());assert.equal(gray.claimWorldEvent(event.id),false);
  const loaded=field(100);loaded.applySave(paid);loaded.start();approach(loaded,event);assert.equal(loaded.claimWorldEvent(event.id),false);assert.equal(loaded.player.gold,gray.player.gold);
  assert.deepEqual(loaded.lootPity,grayPity);
});

test('a genuine matching risk expedition still awards boss rarity odds and advances normal earned pity',()=>{
  const game=field(3,'daemmerhain');game.lootPity={legendaryMisses:23,bossMisses:7};
  const event=resolveRiskExpeditionFixture(game,'expedition-trauerweg');assert.deepEqual(game.lootPity,{legendaryMisses:23,bossMisses:7},'Rewardless stage foes do not create extra pity payments');
  const preview=worldEventRewardPreview(event,game),gold=game.player.gold,dust=game.resources.dust;
  assert.equal(preview.bossLoot,true);assert.equal(preview.repeatFactor,1);assert.equal(preview.rarity,undefined);assert.ok(preview.xp>0);
  approach(game,event);assert.equal(game.claimWorldEvent(event.id),true);
  const item=Object.values(game.generatedItems).find(i=>i.source===event.id);assert.ok(item);assert.equal(item.rarity,'rare');
  assert.equal(game.player.gold,gold+preview.gold);assert.equal(game.resources.dust,dust+preview.dust);assert.deepEqual(game.lootPity,{legendaryMisses:24,bossMisses:8});
  assert.equal(game.claimWorldEvent(event.id),false);assert.deepEqual(game.lootPity,{legendaryMisses:24,bossMisses:8});
});

test('repeat loot policy survives world-event restoration and idle previews ignore a stale completed factor',()=>{
  const game=field(12,'sonnensteppe'),event=resolveBossFixture(game,'event-irdan');approach(game,event);game.claimWorldEvent(event.id);
  const saved=captureWorldEvents(game.world),loaded=field(12,'sonnensteppe');restoreWorldEvents(loaded.world,saved,game.time);
  const restored=loaded.world.worldEvents.find(e=>e.id===event.id);assert.equal(worldEventRewardPreview(restored,{level:12}).repeatFactor,1);
  updateWorldEvents(loaded.world,.04,[loaded],restored.readyAt+1);const next=worldEventRewardPreview(restored,{level:12});assert.equal(next.repeatFactor,.5);assert.equal(next.bossLoot,true);
  Object.assign(restored,{state:'idle',rewardedRuns:2,runRewardFactor:1,bonus:1.25});const third=worldEventRewardPreview(restored,{level:12});assert.equal(third.repeatFactor,.25);assert.equal(third.bossLoot,false);assert.equal(third.gold,Math.round((18+12*5)*.25));
});

test('new encounter difficulty never converts a low-level hunting history into high-level targeted equipment',()=>{
  const game=field(100),hunt=HUNTS.find(h=>h.id==='hunt-sivra');game.endgame={version:1,tokens:hunt.reward.tokens*20,totalClaims:20,active:[],completed:{[hunt.id]:20}};
  assert.equal(validateEndgameState(game.endgame),true);assert.equal(huntRewardLevel(game),18);assert.equal(game.startHunt(hunt.id),false);
  approach(game,{x:520,y:1250});const tokens=game.endgame.tokens;assert.equal(game.redeemHuntReward('hunt-epic'),false);assert.equal(game.endgame.tokens,tokens);
  assert.equal(game.redeemHuntReward('hunt-helmet'),true);const item=Object.values(game.generatedItems).find(i=>i.source==='hunt_reward');assert.equal(item.level,18);assert.equal(item.rarity,'rare');assert.equal(equipmentSlot(item),'helmet');
  assert.equal(HUNTS.length,17);assert.equal(HUNT_REWARDS.length,9);
});

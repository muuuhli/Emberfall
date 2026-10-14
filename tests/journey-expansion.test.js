import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS } from '../src/world-events.js';
import { createJourneyState, advanceJourney, validateJourneyState, restoreJourneyState, computeJourneyReputation,
  ACHIEVEMENTS, COMPANIONS, getAchievementProgress, getJourneyUnlocks, canClaimAchievement, claimJourneyAchievement,
  canSelectCompanion, selectJourneyCompanion, getCompanionModifiers, getCompanionCombatProfile } from '../src/journey.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const namedHunts=['event-sivra','event-irdan','event-orsa','event-vey','event-nera','event-asterion'];
const newExpeditions=['expedition-weisshorn','expedition-schilfzug','expedition-zeitbruch','expedition-namenlos'];
const trials=['trial-cinderwatch','trial-tidecircle','trial-last-scar'];
const expandedActivities=[...namedHunts,...newExpeditions,...trials];
const allEvents=[...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS].map(definition=>definition.id);
const cohorts=[
  {id:'named_hunt_chronicle',events:namedHunts,minLevel:100,reward:{gold:100,resources:{dust:4}}},
  {id:'expedition_chronicle',events:newExpeditions,minLevel:78,reward:{gold:90,resources:{dust:4}}},
  {id:'trial_chronicle',events:trials,minLevel:98,reward:{gold:120,resources:{crystal:3}}},
  {id:'expanded_world_oath',events:expandedActivities,minLevel:100,reward:{gold:150,skillPoints:1,resources:{dust:6,crystal:2}}},
];
const companions=[
  {id:'whitehorn_fawn',events:['event-sivra','expedition-weisshorn'],minLevel:8,stats:{maxHp:12,speed:1}},
  {id:'hourglass_moth',events:['event-vey','expedition-zeitbruch'],minLevel:54,stats:{mana:10,spellDamage:2}},
];
const fresh=(level=100)=>({journey:createJourneyState(),player:{level,hp:100,gold:500,skillPoints:3},world:{interactions:[]},inCombat:()=>false});
const emit=(game,id,amount=1)=>advanceJourney(game,'world_event',id,amount);
const complete=(game,ids)=>ids.forEach(id=>emit(game,id));
let serial=0;
function arena() {
  const game=new Game({storage:null,random:()=>.5});game.selectClass('guardian');
  Object.assign(game.player,{id:`expanded-journey-${++serial}`,level:100,x:4000,y:1800,face:0,gold:500,skillPoints:3});
  for(const key of ['trees','rocks','structures','walls','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  game.npcs=[];game.updateEnemies=()=>{};game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.start();return game;
}
function advanceWorld(game,seconds) {
  for(let time=0;time<seconds-1e-8;time+=.02){game.update(.02,{simulateWorld:false});game.updateWorld(.02);}
}

for(const companion of companions)test(`${companion.id} needs its exact earned event pair and level ${companion.minLevel}`,()=>{
  const definition=COMPANIONS.find(value=>value.id===companion.id);assert.ok(definition);
  assert.equal(definition.minLevel,companion.minLevel);assert.deepEqual(definition.stats,companion.stats);assert.equal(definition.combat,null);
  const unrelated=fresh();complete(unrelated,allEvents.filter(id=>!companion.events.includes(id)));
  assert.equal(unrelated.journey.ownedCompanions.includes(companion.id),false,'Other completed adventures cannot replace either event in this pair');
  assert.equal(canSelectCompanion(unrelated,companion.id).ok,false);
  const game=fresh(companion.minLevel-1);emit(game,companion.events[0]);
  const first=clone(game.journey);for(let count=0;count<25;count++)emit(game,companion.events[0],999);
  assert.deepEqual(game.journey,first);assert.equal(game.journey.ownedCompanions.includes(companion.id),false);
  emit(game,companion.events[1]);assert.equal(game.journey.ownedCompanions.includes(companion.id),false);
  assert.equal(selectJourneyCompanion(game,companion.id),false);assert.equal(validateJourneyState(game.journey,{level:game.player.level}),true);
  game.player.level=companion.minLevel;const update=advanceJourney(game,'level',companion.minLevel);
  assert.ok(update.unlockedCompanions.includes(companion.id));assert.equal(game.journey.ownedCompanions.filter(id=>id===companion.id).length,1);
  assert.equal(selectJourneyCompanion(game,companion.id),true);assert.deepEqual(getCompanionModifiers(game),companion.stats);
  const profile=getCompanionCombatProfile(game);assert.equal(profile.visualType,companion.id);assert.equal(profile.damageMultiplier,0);assert.equal(profile.maximumDamage,0);
  const earned=clone(game.journey);complete(game,companion.events);assert.deepEqual(game.journey,earned);
  assert.equal(validateJourneyState(game.journey,{level:companion.minLevel}),true);
});

test('new passive companions change native stats individually and create one harmless visible actor',()=>{
  const game=arena();for(const id of [...new Set(companions.flatMap(companion=>companion.events))])game.event('world_event',id);
  const baseline=game.stats(),enemy={id:'passive-companion-target',type:'wolf',x:game.player.x+25,y:game.player.y+22,homeX:game.player.x+25,homeY:game.player.y+22,hp:10000,maxHp:10000,alive:true,phase:'recover',aggro:false,attackTimer:999};
  game.world.enemies.push(enemy);
  for(const companion of companions) {
    assert.equal(game.selectCompanion(companion.id),true);const expected={...baseline};
    for(const [key,amount] of Object.entries(companion.stats))expected[key]=(expected[key]||0)+amount;
    assert.deepEqual(game.stats(),expected,'The active blessing replaces the previous blessing');
    advanceWorld(game,3);const actors=game.summons.filter(actor=>actor.companion);
    assert.equal(actors.length,1);assert.equal(actors[0].visualType,companion.id);assert.equal(actors[0].damage,0);assert.equal(enemy.hp,enemy.maxHp);
    assert.equal(game.selectCompanion(companion.id),true);game.updateWorld(.02);assert.equal(game.summons.filter(actor=>actor.companion).length,1);assert.deepEqual(game.stats(),expected);
  }
  assert.equal(game.selectCompanion(null),true);game.updateWorld(.02);assert.deepEqual(game.stats(),baseline);assert.equal(game.summons.filter(actor=>actor.companion).length,0);
  assert.equal(getCompanionCombatProfile(game),null);assert.equal(game.selectCompanion('unknown-companion'),false);
});

for(const cohort of cohorts)test(`${cohort.id} requires all ${cohort.events.length} exact activities and level ${cohort.minLevel}`,()=>{
  const definition=ACHIEVEMENTS.find(value=>value.id===cohort.id);assert.ok(definition);assert.equal(definition.minLevel,cohort.minLevel);
  const game=fresh(cohort.minLevel-1),missing=cohort.events.at(-1);
  complete(game,allEvents.filter(id=>!cohort.events.includes(id)));complete(game,cohort.events.slice(0,-1));
  let progress=getAchievementProgress(game,cohort.id);assert.equal(progress.requirements.length,1);assert.equal(progress.requirements[0].current,cohort.events.length-1);
  assert.equal(progress.complete,false);assert.equal(canClaimAchievement(game,cohort.id).ok,false);
  const before=clone(game.journey);
  for(let count=0;count<20;count++)emit(game,cohort.events[0],999);
  for(const id of ['event-forged',`${missing}-forged`,'unknown'])assert.equal(emit(game,id,999).changed,false);
  assert.deepEqual(game.journey,before,'Neither repeated wins nor invented IDs can replace a missing canonical activity');
  emit(game,missing);progress=getAchievementProgress(game,cohort.id);
  assert.equal(progress.requirements[0].complete,true);assert.equal(progress.complete,false,'The level gate still applies after every activity is earned');
  assert.equal(claimJourneyAchievement(game,cohort.id),null);
  game.player.level=cohort.minLevel;advanceJourney(game,'level',cohort.minLevel);assert.ok(getJourneyUnlocks(game).readyAchievements.includes(cohort.id));
  game.dead=true;game.player.hp=0;assert.equal(claimJourneyAchievement(game,cohort.id),null);game.dead=false;game.player.hp=100;
  assert.deepEqual(claimJourneyAchievement(game,cohort.id),cohort.reward);assert.equal(claimJourneyAchievement(game,cohort.id),null);
  const paid=clone(game.journey);assert.equal(claimJourneyAchievement(game,'unknown-achievement'),null);complete(game,cohort.events);assert.deepEqual(game.journey,paid);
  assert.equal(validateJourneyState(game.journey,{level:game.player.level}),true);
});

test('native claims pay only the four trusted rewards and remain paid after a save reload',()=>{
  const game=arena();for(const id of expandedActivities)game.event('world_event',id);
  assert.equal(game.selectCompanion('hourglass_moth'),true);
  const before={gold:game.player.gold,points:game.player.skillPoints,dust:game.resources.dust,crystal:game.resources.crystal,xp:game.player.xp};
  for(const cohort of cohorts){assert.equal(game.claimAchievement(cohort.id),true);assert.equal(game.claimAchievement(cohort.id),false);}
  assert.equal(game.claimAchievement('unknown-achievement'),false);
  assert.equal(game.player.gold,before.gold+460);assert.equal(game.player.skillPoints,before.points+1);assert.equal(game.resources.dust,before.dust+14);assert.equal(game.resources.crystal,before.crystal+5);assert.equal(game.player.xp,before.xp);
  const saved=clone(game.capture()),loaded=arena();loaded.applySave(saved);
  assert.deepEqual(loaded.journey,game.journey);assert.equal(loaded.journey.activeCompanion,'hourglass_moth');assert.deepEqual(loaded.stats(),game.stats());
  for(const cohort of cohorts)assert.equal(loaded.claimAchievement(cohort.id),false);
  assert.equal(loaded.player.gold,game.player.gold);assert.equal(loaded.player.skillPoints,game.player.skillPoints);assert.deepEqual(loaded.resources,game.resources);
});

test('expanded saves reject unknown or duplicate records, rewards without exact evidence and unearned companions',()=>{
  const game=fresh();complete(game,expandedActivities);for(const cohort of cohorts)claimJourneyAchievement(game,cohort.id);selectJourneyCompanion(game,'hourglass_moth');
  const original=clone(game.journey);assert.equal(validateJourneyState(original,{level:100}),true);assert.deepEqual(restoreJourneyState(original,{level:100}),original);
  const corruptions=[
    state=>state.records.events.push('event-forged'),state=>state.records.events.push(state.records.events[0]),
    state=>state.claimed.push('unknown-achievement'),state=>state.claimed.push('expanded_world_oath'),
    state=>state.ownedCompanions.push('unknown-companion'),state=>state.ownedCompanions.push('hourglass_moth'),
    state=>{state.records.events=state.records.events.filter(id=>id!=='expedition-zeitbruch');state.reputation=computeJourneyReputation(state);},
  ];
  for(const corrupt of corruptions){const saved=clone(original);corrupt(saved);assert.equal(validateJourneyState(saved,{level:100}),false);assert.throws(()=>restoreJourneyState(saved,{level:100}));assert.deepEqual(game.journey,original);}
  assert.equal(validateJourneyState(original,{level:99}),false,'A claimed level-100 chronicle cannot be imported below its gate');
  for(const companion of companions) {
    const unearned=fresh();emit(unearned,companion.events[0]);unearned.journey.ownedCompanions.push(companion.id);unearned.journey.activeCompanion=companion.id;
    assert.equal(validateJourneyState(unearned.journey,{level:100}),false);
    const earned=fresh(companion.minLevel);complete(earned,companion.events);selectJourneyCompanion(earned,companion.id);
    assert.equal(validateJourneyState(earned.journey,{level:companion.minLevel-1}),false);
  }
  for(const cohort of cohorts){const unearned=fresh();complete(unearned,cohort.events.slice(0,-1));unearned.journey.claimed.push(cohort.id);assert.equal(validateJourneyState(unearned.journey,{level:100}),false);}
});

test('legacy migration inherits personal paid evidence once, ignores other players and never claims new rewards',()=>{
  const legacy={player:{id:'returning-player',gold:731},ledger:{},world:{worldEvents:expandedActivities.map(id=>({id,claimedBy:[id==='trial-last-scar'?'other-player':'returning-player']}))}};
  legacy.ledger['world_event:event-sivra']=900;legacy.ledger['world_event:event-forged']=900;
  const original=clone(legacy),migrated=restoreJourneyState(undefined,{level:100,legacy});
  assert.deepEqual(new Set(migrated.records.events),new Set(expandedActivities.filter(id=>id!=='trial-last-scar')));assert.equal(migrated.records.events.filter(id=>id==='event-sivra').length,1);
  assert.ok(migrated.ownedCompanions.includes('whitehorn_fawn'));assert.ok(migrated.ownedCompanions.includes('hourglass_moth'));assert.deepEqual(migrated.claimed,[]);assert.equal(migrated.activeCompanion,null);
  assert.equal(getAchievementProgress({journey:migrated,player:{level:100,hp:100}},'expanded_world_oath').complete,false);assert.equal(validateJourneyState(migrated,{level:100}),true);assert.deepEqual(legacy,original);
  legacy.ledger['world_event:trial-last-scar']=1;const fullyEarned=restoreJourneyState(undefined,{level:100,legacy});
  assert.deepEqual(fullyEarned.claimed,[]);assert.deepEqual(getJourneyUnlocks({journey:fullyEarned,player:{level:100,hp:100}}).readyAchievements.filter(id=>cohorts.some(cohort=>cohort.id===id)).sort(),cohorts.map(cohort=>cohort.id).sort());
  assert.equal(legacy.player.gold,731);assert.equal(validateJourneyState(fullyEarned,{level:100}),true);
});

test('a pre-expansion journey retains its original claim and unlocks eligible companions without retroactive payments',()=>{
  const game=arena();for(const id of ['frostgrat','aschenmoor'])game.event('explore',id);assert.equal(game.claimAchievement('first_horizons'),true);
  for(const id of expandedActivities)game.event('world_event',id);
  const saved=clone(game.capture());saved.journey.ownedCompanions=saved.journey.ownedCompanions.filter(id=>!companions.some(companion=>companion.id===id));
  assert.equal(validateJourneyState(saved.journey,{level:100}),true);assert.deepEqual(saved.journey.claimed,['first_horizons']);
  const loaded=arena();loaded.applySave(saved);
  assert.deepEqual(loaded.journey.claimed,['first_horizons']);assert.equal(loaded.player.gold,saved.player.gold);assert.equal(loaded.player.skillPoints,saved.player.skillPoints);assert.deepEqual(loaded.resources,saved.resources);
  for(const companion of companions)assert.ok(loaded.journey.ownedCompanions.includes(companion.id));
  for(const cohort of cohorts){assert.equal(getAchievementProgress(loaded,cohort.id).complete,true);assert.equal(getAchievementProgress(loaded,cohort.id).claimed,false);}
  assert.equal(loaded.journey.activeCompanion,null);assert.equal(validateJourneyState(loaded.journey,{level:100}),true);
});

test('the twenty original activities cannot unlock the new companions or chronicles during legacy restoration',()=>{
  const originalEvents=['event-daemmerhain','event-frostgrat','event-aschenmoor','event-glutoede','event-sonnensteppe','event-jadeauen','event-sturmkueste','event-dornwildnis',
    'event-obsidianpass','event-mondbruch','event-permafrost','event-sandsenke','event-traumsenke','event-blutmark','event-sternensund','event-nexusriss',
    'expedition-trauerweg','expedition-salzzug','expedition-ofenpfad','expedition-schlafgericht'];assert.equal(originalEvents.length,20);assert.ok(originalEvents.every(id=>allEvents.includes(id)));
  const legacy={player:{id:'v51-player',gold:2000},ledger:Object.fromEntries(originalEvents.map(id=>[`world_event:${id}`,999])),world:{worldEvents:[]}};
  const migrated=restoreJourneyState(undefined,{level:100,legacy}),game={journey:migrated,player:{level:100,hp:100}};
  assert.equal(migrated.records.events.length,20);assert.deepEqual(migrated.claimed,[]);
  for(const companion of companions)assert.equal(migrated.ownedCompanions.includes(companion.id),false);
  for(const cohort of cohorts){assert.equal(getAchievementProgress(game,cohort.id).requirements[0].current,0);assert.equal(canClaimAchievement(game,cohort.id).ok,false);}
  assert.equal(validateJourneyState(migrated,{level:100}),true);assert.equal(legacy.player.gold,2000);
});

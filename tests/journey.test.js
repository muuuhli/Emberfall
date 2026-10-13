import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS as STARTING_REGIONS } from '../src/content.js';
import { EXPANSION_REGIONS } from '../src/expansion.js';
import { DUNGEONS } from '../src/dungeons.js';
import { BESTIARY_SPECIES } from '../src/bestiary.js';
import { EXTRA_RECIPES, EXTRA_ITEMS } from '../src/arsenal.js';
import { EQUIPMENT_RECIPES } from '../src/equipment-system.js';
import { WORLD_EVENT_DEFINITIONS, EXPEDITIONS } from '../src/world-events.js';
import { createJourneyState, validateJourneyState, restoreJourneyState, advanceJourney, FACTIONS, ACHIEVEMENTS,
  COMPANIONS, JOURNEY_RECIPES, JOURNEY_MASTERIES, factionRank, getFactionProgress, getJourneyUnlocks,
  canClaimAchievement, claimJourneyAchievement, getAchievementProgress, canCraftJourneyRecipe,
  canSelectCompanion, selectJourneyCompanion, getCompanionModifiers, getCompanionCombatProfile,
  canChooseJourneyMastery, chooseJourneyMastery, getMasteryRank, getJourneyModifiers } from '../src/journey.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const regions=[...STARTING_REGIONS,...EXPANSION_REGIONS];
const fresh=(level=100)=>({journey:createJourneyState(),player:{level,hp:100,gold:1000,skillPoints:10},world:{interactions:[]},inCombat:()=>false});
const emit=(game,kind,target,context={})=>advanceJourney(game,kind,target,1,context);
function variedJourney(game=fresh()) {
  for(const region of regions){emit(game,'explore',region.id);emit(game,'rescue',region.id);emit(game,'contract',region.id);emit(game,'interact',`encounter-${region.id}-lore`);emit(game,'interact',`encounter-${region.id}-sealed_cache`);}
  for(const type of BESTIARY_SPECIES)emit(game,'boss',type);
  for(const dungeon of DUNGEONS){emit(game,'dungeon',dungeon.id,{partySize:2});emit(game,'puzzle',dungeon.id);}
  for(const recipe of EXTRA_RECIPES.slice(0,8))emit(game,'craft',recipe.id);
  for(const event of [...WORLD_EVENT_DEFINITIONS,...EXPEDITIONS])emit(game,'world_event',event.id);
  emit(game,'revive','ally-1');return game;
}

test('new and legacy journeys restore independent state with canonical evidence and no retroactive claims',()=>{
  const first=createJourneyState(),second=createJourneyState();first.records.explored.push('daemmerhain');assert.deepEqual(second.records.explored,[]);
  assert.equal(validateJourneyState(second),true);
  const legacy={discovered:['daemmerhain','frostgrat','missing'],ledger:{'rescue:daemmerhain':2,'interact:encounter-frostgrat-lore':1,'craft:forge_ember':4,'puzzle:wurzelgewoelbe':1,'kill:wolf_boss':5},flags:{thorn_guardian:true},contracts:{completed:{daemmerhain:3}},dungeonRecords:{wurzelgewoelbe:{runs:4}},world:{interactions:[{id:'encounter-daemmerhain-sealed_cache',used:true}],worldEvents:[{id:'expedition-trauerweg',completions:1,state:'rewarded',claimedBy:['local']},{id:'event-frostgrat',completions:1,state:'rewarded',claimedBy:['other-player']}]}};
  const migrated=restoreJourneyState(undefined,{level:25,legacy});
  assert.deepEqual(migrated.records.explored,['daemmerhain','frostgrat']);assert.deepEqual(migrated.records.rescued,['daemmerhain']);assert.deepEqual(migrated.records.lore,['frostgrat']);
  assert.ok(migrated.records.bosses.includes('wolf')&&migrated.records.bosses.includes('thorn_guardian'));assert.deepEqual(migrated.records.dungeons,['wurzelgewoelbe']);assert.deepEqual(migrated.records.puzzles,['wurzelgewoelbe']);
  assert.deepEqual(migrated.records.events,['expedition-trauerweg']);assert.ok(migrated.records.bosses.includes('mourning_bell'));
  assert.deepEqual(migrated.claimed,[]);assert.equal(validateJourneyState(migrated,{level:25}),true);
  const restored=restoreJourneyState(migrated,{level:25});assert.deepEqual(restored,migrated);restored.records.explored.push('aschenmoor');assert.equal(migrated.records.explored.length,2);
});

test('different discoveries earn bounded faction reputation while repeats and ordinary kills cannot farm it',()=>{
  const game=fresh();emit(game,'explore','daemmerhain');emit(game,'rescue','daemmerhain');emit(game,'interact','encounter-daemmerhain-lore');emit(game,'boss','wolf_boss');
  assert.deepEqual(game.journey.reputation,{wardens:23,archivists:21,wayfarers:18});
  const before=clone(game.journey);
  for(let index=0;index<1000;index++){emit(game,'explore','daemmerhain');emit(game,'rescue','daemmerhain');emit(game,'interact','encounter-daemmerhain-lore');emit(game,'boss','wolf');advanceJourney(game,'kill','wolf',100);}
  assert.deepEqual(game.journey,before);
  assert.equal(advanceJourney(game,'explore','missing',999).changed,false);assert.equal(advanceJourney(game,'explore','frostgrat',NaN).changed,false);
  const completed=variedJourney();assert.ok(Object.values(completed.journey.reputation).every(rep=>rep===500));
  assert.equal(factionRank(79),0);assert.equal(factionRank(80),1);assert.equal(factionRank(200),2);assert.equal(factionRank(400),3);
  for(const faction of FACTIONS){assert.equal(getFactionProgress(completed,faction.id).rank,3);assert.equal(getFactionProgress(completed,faction.id).nextRankAt,null);}
});

test('completed world adventures count once, resolve expedition bosses and recognize new equipment crafts',()=>{
  const game=fresh();const first=emit(game,'world_event','expedition-trauerweg');assert.equal(first.changed,true);
  assert.deepEqual(game.journey.records.events,['expedition-trauerweg']);assert.ok(game.journey.records.bosses.includes('mourning_bell'));assert.deepEqual(game.journey.reputation,{wardens:13,archivists:5,wayfarers:5});
  const before=clone(game.journey);assert.equal(emit(game,'world_event','expedition-trauerweg').changed,false);assert.deepEqual(game.journey,before);
  emit(game,'craft',EQUIPMENT_RECIPES[0].id);assert.ok(game.journey.records.crafted.includes(EQUIPMENT_RECIPES[0].id));
});

test('six faction batch recipes require actual reputation and output useful existing supplies',()=>{
  assert.equal(JOURNEY_RECIPES.length,6);const game=fresh();
  for(const recipe of JOURNEY_RECIPES) {assert.equal(canCraftJourneyRecipe(game,recipe.id).ok,false);assert.ok(EXTRA_ITEMS[recipe.output]);assert.equal(recipe.amount,2);assert.ok(Object.values(recipe.ingredients).every(value=>Number.isInteger(value)&&value>0));}
  variedJourney(game);assert.equal(getJourneyUnlocks(game).recipeIds.length,6);
  for(const recipe of JOURNEY_RECIPES)assert.equal(canCraftJourneyRecipe(game,recipe).ok,true);
  game.player.level=1;assert.equal(canCraftJourneyRecipe(game,JOURNEY_RECIPES[0]).ok,false);
  assert.equal(canCraftJourneyRecipe(game,'missing').ok,false);
  assert.equal(canCraftJourneyRecipe(fresh(),{...JOURNEY_RECIPES[0],factionRank:0,factionId:null}).ok,false,'Gate data comes from the canonical definition.');
});

test('sixteen curated achievement rewards need all objectives and are claimed exactly once',()=>{
  assert.equal(ACHIEVEMENTS.length,16);const game=fresh();
  emit(game,'explore','daemmerhain');emit(game,'explore','frostgrat');assert.equal(canClaimAchievement(game,'first_horizons').ok,false);
  const update=emit(game,'explore','aschenmoor');assert.ok(update.readyAchievements.includes('first_horizons'));
  assert.deepEqual(claimJourneyAchievement(game,'first_horizons'),{gold:80,resources:{herb:4}});assert.equal(claimJourneyAchievement(game,'first_horizons'),null);
  assert.equal(getAchievementProgress(game,'first_horizons').claimed,true);
  const completed=variedJourney();let points=0,gold=0;
  for(const achievement of ACHIEVEMENTS) {assert.equal(canClaimAchievement(completed,achievement.id).ok,true,achievement.id);const reward=claimJourneyAchievement(completed,achievement.id);points+=reward.skillPoints||0;gold+=reward.gold||0;assert.equal(claimJourneyAchievement(completed,achievement.id),null);}
  assert.ok(points<=10&&gold<=3000,'Discovery rewards do not replace the main level and economy budgets.');
  assert.equal(validateJourneyState(completed.journey,{level:100}),true);assert.deepEqual(getJourneyUnlocks(completed).readyAchievements,[]);
  const locked=fresh(1);variedJourney(locked);assert.equal(canClaimAchievement(locked,'worlds_oath').ok,false);assert.equal(claimJourneyAchievement(locked,'worlds_oath'),null);
});

test('cooperative milestones require shared clears and a real distinct revived traveler',()=>{
  const game=fresh();emit(game,'dungeon','wurzelgewoelbe',{partySize:1});assert.deepEqual(game.journey.records.coopDungeons,[]);
  emit(game,'revive','ally-1');assert.equal(canClaimAchievement(game,'shared_torch').ok,false);
  emit(game,'dungeon','wurzelgewoelbe',{partySize:2});assert.equal(canClaimAchievement(game,'shared_torch').ok,true);
  for(let index=0;index<20;index++)emit(game,'revive','ally-1');assert.deepEqual(game.journey.records.revives,['ally-1']);
  assert.equal(game.journey.records.dungeons.length,1);assert.equal(game.journey.records.coopDungeons.length,1);
});

test('companions are earned from varied milestones and level gates, and only one can supply stats',()=>{
  assert.equal(COMPANIONS.length,10);const game=fresh(3);
  for(const region of regions.slice(0,2))emit(game,'explore',region.id);emit(game,'interact','encounter-daemmerhain-lore');
  assert.deepEqual(game.journey.ownedCompanions,[]);assert.equal(selectJourneyCompanion(game,'cinder_moth'),false);
  game.player.level=4;const levelup=emit(game,'level',4);assert.deepEqual(levelup.unlockedCompanions,['cinder_moth']);assert.equal(selectJourneyCompanion(game,'cinder_moth'),true);
  assert.deepEqual(getCompanionModifiers(game),{mana:6,manaRegen:.2});assert.equal(getCompanionCombatProfile(game).damageMultiplier,0);
  const completed=variedJourney();assert.equal(completed.journey.ownedCompanions.length,10);
  for(const companion of COMPANIONS){assert.equal(selectJourneyCompanion(completed,companion.id),true);assert.equal(completed.journey.activeCompanion,companion.id);assert.deepEqual(getCompanionModifiers(completed),companion.stats);}
  completed.inCombat=()=>true;assert.equal(canSelectCompanion(completed,null).ok,false);completed.inCombat=()=>false;
  assert.equal(selectJourneyCompanion(completed,null),true);assert.deepEqual(getCompanionModifiers(completed),{});assert.equal(getCompanionCombatProfile(completed),null);
});

test('combat companions have distinct bounded roles and cannot add unowned or invalid power',()=>{
  const game=variedJourney();const roles=new Set();
  for(const companion of COMPANIONS) {selectJourneyCompanion(game,companion.id);const profile=getCompanionCombatProfile(game);roles.add(companion.role);assert.equal(profile.companion,true);assert.equal(profile.visualType,companion.id);
    assert.ok(profile.damageMultiplier>=0&&profile.damageMultiplier<=.07);assert.ok(profile.attackCooldown>=2.1);assert.ok(profile.maximumDamage<=80);assert.ok(companion.stats.armor===undefined||companion.stats.armor<=1.5);
  }
  assert.equal(roles.size,10);game.journey.ownedCompanions=[];assert.deepEqual(getCompanionModifiers(game),{});assert.equal(getCompanionCombatProfile(game),null);
});

test('mastery is a genuine paid choice that grows through level, reputation and dungeon variety',()=>{
  const game=fresh(40);assert.equal(chooseJourneyMastery(game,'wardens_oath'),false);variedJourney(game);
  assert.equal(chooseJourneyMastery(game,'wardens_oath'),true);assert.equal(game.player.skillPoints,6);assert.equal(getMasteryRank(game),1);
  assert.deepEqual(getJourneyModifiers(game),{maxHp:35,armor:1.4,speed:-2});assert.equal(chooseJourneyMastery(game,'wardens_oath'),false);
  game.player.level=70;assert.equal(getMasteryRank(game),2);game.player.level=100;assert.equal(getMasteryRank(game),3);
  assert.deepEqual(getJourneyModifiers(game),{maxHp:105,armor:4.2,speed:-6});
  game.journey.records.dungeons=game.journey.records.dungeons.slice(0,5);assert.equal(getMasteryRank(game),2);
  game.inCombat=()=>true;assert.equal(canChooseJourneyMastery(game,'archivists_voice').ok,false);game.inCombat=()=>false;
  const gold=game.player.gold;assert.equal(chooseJourneyMastery(game,'archivists_voice'),true);assert.equal(game.player.gold,gold-240);assert.equal(game.player.skillPoints,6);
  assert.ok(getJourneyModifiers(game).spellDamage>0&&getJourneyModifiers(game).armor<0);assert.equal(game.journey.mastery,'archivists_voice');
  assert.equal(JOURNEY_MASTERIES.length,3);
});

test('save validation rejects forged rewards, reputation, gates, duplicate evidence and extra fields',()=>{
  const game=variedJourney();chooseJourneyMastery(game,'wardens_oath');selectJourneyCompanion(game,'abyss_sentinel');claimJourneyAchievement(game,'first_horizons');
  const original=clone(game.journey);assert.equal(validateJourneyState(original,{level:100}),true);
  const changed=[
    state=>{state.reputation.wardens++;},state=>{state.records.explored.push('forged');},state=>{state.records.explored.push(state.records.explored[0]);},
    state=>{state.claimed.push('forged_reward');},state=>{state.claimed.push(state.claimed[0]);},state=>{state.ownedCompanions.push('forged_pet');},
    state=>{state.activeCompanion=['cinder_moth','ossuary_hound'];},state=>{state.mastery='forged';},state=>{state.records.events.push('event-forged');},state=>{state.extra=999;},
  ];
  for(const corrupt of changed) {const bad=clone(original);corrupt(bad);assert.equal(validateJourneyState(bad,{level:100}),false);assert.throws(()=>restoreJourneyState(bad,{level:100}));assert.deepEqual(game.journey,original);}
  assert.equal(validateJourneyState(original,{level:1}),false);
  const empty=createJourneyState();empty.claimed=['worlds_oath'];assert.equal(validateJourneyState(empty),false);
  empty.claimed=[];empty.ownedCompanions=['abyss_sentinel'];assert.equal(validateJourneyState(empty),false);
});

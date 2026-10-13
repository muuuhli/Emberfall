import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { REGIONS } from '../src/catalog.js';
import { BESTIARY_SPECIES } from '../src/bestiary.js';
import { DUNGEONS } from '../src/dungeons.js';
import { JOURNEY_RECIPES, JOURNEY_MASTERIES } from '../src/journey.js';

const clone=value=>JSON.parse(JSON.stringify(value));
let serial=0;
function arena(classId='guardian',level=100) {
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.player.id=`journey-test-${++serial}`;
  Object.assign(game.player,{level,x:4000,y:1800,face:0,skillPoints:12,gold:1000});
  for(const key of ['trees','rocks','structures','walls','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  game.npcs=[];game.updateEnemies=()=>{};game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.start();return game;
}
function advance(game,seconds,party=game.partyGames) {
  for(let time=0;time<seconds-1e-8;time+=.02){for(const member of party)member.update(.02,{simulateWorld:false});game.updateWorld(.02,party);}
}
function unlockMoth(game) {game.event('explore','frostgrat');game.event('interact','encounter-daemmerhain-lore');}
function unlockHound(game) {for(const region of ['daemmerhain','frostgrat'])game.event('rescue',region);for(const boss of ['wolf','slime'])game.event('boss',boss);}
const target=game=>{const enemy={id:'companion-target',type:'wolf',x:game.player.x+25,y:game.player.y+22,homeX:game.player.x+25,homeY:game.player.y+22,hp:10000,maxHp:10000,alive:true,phase:'recover',aggro:false,attackTimer:999};game.world.enemies.push(enemy);return enemy;};

test('a real new character remembers the starting region and companion level gates update on a real level-up',()=>{
  const game=arena('guardian',3);assert.ok(game.journey.records.explored.includes('daemmerhain'));unlockMoth(game);
  assert.equal(game.journey.ownedCompanions.includes('cinder_moth'),false);game.gainXp(game.xpNeeded());
  assert.equal(game.player.level,4);assert.ok(game.journey.ownedCompanions.includes('cinder_moth'));assert.equal(game.selectCompanion('cinder_moth'),true);
});

test('a visible support companion adds only its active passive stats and never damages enemies',()=>{
  const game=arena();unlockMoth(game);const baseline=game.stats();assert.equal(game.selectCompanion('cinder_moth'),true);
  assert.equal(game.stats().mana,baseline.mana+6);assert.equal(game.stats().manaRegen,baseline.manaRegen+.2);
  const enemy=target(game);advance(game,3);
  assert.equal(game.summons.filter(s=>s.companion).length,1);assert.equal(game.summons[0].visualType,'cinder_moth');assert.equal(enemy.hp,enemy.maxHp);
  enemy.aggro=false;assert.equal(game.selectCompanion(null),true);game.updateWorld(.02);assert.equal(game.summons.filter(s=>s.companion).length,0);assert.deepEqual(game.stats(),baseline);
});

test('a combat companion obeys a slow attack cadence, caps damage and remains one actor across save and respawn',()=>{
  const game=arena();unlockHound(game);assert.equal(game.selectCompanion('ossuary_hound'),true);const enemy=target(game);
  advance(game,.8);assert.equal(enemy.hp,enemy.maxHp);advance(game,.3);assert.ok(enemy.hp<enemy.maxHp);
  const firstHp=enemy.hp;assert.ok(enemy.maxHp-firstHp<=80);advance(game,1.7);assert.equal(enemy.hp,firstHp);advance(game,.5);assert.ok(enemy.hp<firstHp);
  assert.equal(game.summons.filter(s=>s.companion).length,1);
  const saved=clone(game.capture()),loaded=arena();loaded.applySave(saved);loaded.start();loaded.updateEnemies=()=>{};loaded.world.enemies=[];loaded.updateWorld(.02);
  assert.equal(loaded.journey.activeCompanion,'ossuary_hound');assert.equal(loaded.summons.filter(s=>s.companion).length,1);
  loaded.dead=true;loaded.player.hp=0;loaded.updateWorld(.02);assert.equal(loaded.summons.filter(s=>s.companion).length,0);
  loaded.respawn();loaded.updateWorld(.02);loaded.updateWorld(.02);assert.equal(loaded.summons.filter(s=>s.companion).length,1);
});

test('shared-world companion attacks and lifesteal belong to their owner rather than the room leader',()=>{
  const leader=arena(),caster=arena('shadowbinder');unlockMoth(leader);unlockHound(caster);
  assert.equal(leader.selectCompanion('cinder_moth'),true);assert.equal(caster.selectCompanion('ossuary_hound'),true);
  const party=[leader,caster];for(const member of party){member.world=leader.world;member.partyGames=party;for(const key of ['projectiles','hazards','summons','effects','drops'])member[key]=leader[key];member.player.hp=20;}
  const enemy=target(leader);advance(leader,1.3,party);assert.ok(enemy.hp<enemy.maxHp);
  assert.equal(leader.player.hp,20);assert.ok(caster.player.hp>20);
  assert.equal(leader.summons.filter(s=>s.companion&&s.actorId===leader.player.id).length,1);assert.equal(leader.summons.filter(s=>s.companion&&s.actorId===caster.player.id).length,1);
});

test('actual faction crafting rejects missing reputation then consumes ingredients for a useful two-item batch',()=>{
  const game=arena('guardian',20),recipe=JOURNEY_RECIPES[0];Object.assign(game.resources,recipe.ingredients);
  const inventory=clone(game.inventory),materials=clone(game.resources);assert.equal(game.craft(recipe.id),false);assert.deepEqual(game.inventory,inventory);assert.deepEqual(game.resources,materials);
  for(const region of REGIONS.slice(0,6))game.event('rescue',region.id);
  assert.equal(game.craft(recipe.id),true);assert.equal(game.inventory[recipe.output],2);
  for(const key of Object.keys(recipe.ingredients))assert.equal(game.resources[key],0);assert.ok(game.journey.records.crafted.includes(recipe.id));
});

test('mastery modifies real stats, pays once, changes with dungeon variety and survives a save',()=>{
  const game=arena('guardian',40);for(const species of BESTIARY_SPECIES.slice(0,25))game.event('boss',species);
  const baseline=game.stats(),points=game.player.skillPoints;assert.equal(game.chooseMastery('wardens_oath'),true);assert.equal(game.player.skillPoints,points-4);
  assert.equal(game.stats().maxHp,baseline.maxHp+35);assert.equal(game.stats().armor,baseline.armor+1.4);assert.equal(game.stats().speed,baseline.speed-2);
  assert.equal(game.chooseMastery('wardens_oath'),false);assert.equal(game.player.skillPoints,points-4);
  game.player.level=100;for(const region of REGIONS)game.event('rescue',region.id);for(const dungeon of DUNGEONS.slice(0,6))game.event('dungeon',dungeon.id);
  const saved=clone(game.capture()),loaded=arena();loaded.applySave(saved);assert.equal(loaded.journey.mastery,JOURNEY_MASTERIES[0].id);assert.deepEqual(loaded.stats(),game.stats());
});

test('achievement payments and active journey choices persist while malformed journey imports are atomic',()=>{
  const game=arena();game.event('explore','frostgrat');game.event('explore','aschenmoor');unlockMoth(game);game.selectCompanion('cinder_moth');
  const gold=game.player.gold,herb=game.resources.herb;assert.equal(game.claimAchievement('first_horizons'),true);assert.equal(game.player.gold,gold+80);assert.equal(game.resources.herb,herb+4);
  assert.equal(game.claimAchievement('first_horizons'),false);const saved=clone(game.capture()),loaded=arena();loaded.applySave(saved);
  assert.equal(loaded.journey.activeCompanion,'cinder_moth');assert.equal(loaded.claimAchievement('first_horizons'),false);
  const original=clone(loaded.capture());original.savedAt=0;
  for(const corrupt of [data=>{data.journey.reputation.wardens=500;},data=>{data.journey.activeCompanion='abyss_sentinel';},data=>{data.journey.claimed.push('worlds_oath');}]) {
    const bad=clone(saved);corrupt(bad);assert.throws(()=>loaded.applySave(bad));const after=clone(loaded.capture());after.savedAt=0;assert.deepEqual(after,original);
  }
});

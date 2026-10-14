import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES } from '../src/classes.js';
import { ABILITIES } from '../src/abilities.js';
import { createBestiaryEnemy } from '../src/bestiary.js';
import { xpToNext } from '../src/progression.js';
import { incomingDamage } from '../src/balance.js';
import { generateLoot } from '../src/loot.js';

function arena(classId='guardian', level=27) {
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.start();
  for(let i=1;i<level;i++)game.gainXp(xpToNext(i));
  assert.equal(game.player.level,level);
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies'])game.world[key]=[];
  game.npcs=[];game.player.x=3000;game.player.y=2000;game.player.face=0;
  // Isolate damage delivery from enemy AI. Full fight pacing is audited separately.
  game.updateEnemies=()=>{};
  return game;
}
function enemy(game,level=68,distance=100) {
  const target=createBestiaryEnemy('wolf',`foe-${level}`,game.player.x+distance,game.player.y,{level});
  game.world.enemies=[target];return target;
}
function advance(game,seconds) {
  for(let t=0;t<seconds-1e-8;t+=.02)game.update(.02);
}

test('all eight classes cannot damage or control an overwhelming enemy via basic, core or learned attacks',()=>{
  for(const cls of CLASSES) {
    const game=arena(cls.id),target=enemy(game),hp=target.hp;
    game.aim={x:target.x,y:target.y};
    game.action('attack');game.action('bolt');game.action('nova');advance(game,5);
    for(const ability of ABILITIES.filter(a=>a.classId===cls.id&&a.level<=27)) {
      game.learnAbility(ability.id);
      if(!game.learnedAbilities[ability.id])continue;
      game.setAbilityLoadout(0,null);game.setAbilityLoadout(1,null);game.setAbilityLoadout(0,ability.id);
      game.useLearnedAbility(0);advance(game,Math.max(3,ability.duration||0)+1);
    }
    assert.equal(target.hp,hp,cls.id);
    assert.ok(!(target.slowUntil>game.time),`${cls.id}: slow cannot bypass level resistance`);
    assert.equal(target.x,target.homeX,`${cls.id}: knockback cannot bypass resistance`);
    assert.equal(target.alive,true);assert.equal(game.kills,0);
  }
});

test('the real hit path retains equal-level damage and weakens +5 and +10 enemies progressively',()=>{
  const hits=[27,32,37].map(level=>{const game=arena(),target=enemy(game,level);return game.hitEnemy(target,200,0);});
  assert.deepEqual(hits,[200,160,49]);
});

test('slows and knockback use the attacking character level rather than the world owner',()=>{
  const game=arena(),target=enemy(game,37);
  assert.equal(game.applyEnemySlow(target,.5,4),true);
  assert.ok(target.slowFactor>.87&&target.slowFactor<.88);
  assert.ok(target.slowUntil>game.time&&target.slowUntil<game.time+1);
  const start=target.x;game.hitEnemy(target,100,20);
  assert.ok(target.x-start>4&&target.x-start<5);
  const strong=arena('guardian',68);strong.world=game.world;
  assert.equal(strong.applyEnemySlow(target,.5,4),true);assert.equal(target.slowFactor,.5);
});

test('shared world projectile delivery uses its own caster for damage and slowing',()=>{
  const low=arena('frostweaver'),high=arena('frostweaver',68),target=enemy(low,68,120);
  low.player.id='low';high.player.id='high';high.world=low.world;
  low.partyGames=high.partyGames=[low,high];
  for(const key of ['projectiles','hazards','summons','effects','drops'])high[key]=low[key];
  low.aim=high.aim={x:target.x,y:target.y};const hp=target.hp;
  low.action('bolt');high.action('bolt');
  for(let t=0;t<.5;t+=.02){low.update(.02,{simulateWorld:false});high.update(.02,{simulateWorld:false});low.updateWorld(.02,[low,high]);}
  assert.ok(target.hp<hp,'A level68 party member can hit while the level27 world owner cannot.');
  assert.equal(target.slowFactor,1-high.coreAbilityProfile('bolt').slow);
});

test('logout or leaving a group retires orphaned projectiles, damage zones and servants instead of borrowing the authority level',()=>{
  for(const classId of ['frostweaver','flamecaller','shadowbinder']) {
    const low=arena(classId),high=arena('guardian',68),target=enemy(low,68,100),hp=target.hp;
    low.player.id='departed';high.player.id='authority';high.world=low.world;
    for(const key of ['projectiles','hazards','summons','effects','drops'])high[key]=low[key];
    low.aim={x:target.x,y:target.y};low.action('bolt');low.action('nova');
    assert.ok(low.projectiles.length+low.hazards.length+low.summons.length>0,classId);
    for(let t=0;t<1;t+=.02)high.updateWorld(.02,[high]);
    assert.equal(target.hp,hp,classId);assert.ok(!(target.slowUntil>high.time));
    for(const key of ['projectiles','hazards','summons'])assert.ok(high[key].every(effect=>effect.actorId!=='departed'),`${classId}: orphaned ${key} was retired`);
  }
});

test('NPC and wound hits apply gap pressure once; environment, scripted fractions and PvP remain unchanged',()=>{
  for(const level of [27,32,37,68]) {
    const game=arena(),before=game.player.hp;
    const applied=game.damagePlayer(80,{attackerLevel:level,attackerId:'npc'});
    const multiplier=level===27?1:level===32?1.3:level===37?2.05:4;
    assert.equal(applied,Math.min(before,incomingDamage(80*multiplier,{armor:game.stats().armor,attackerLevel:level})));
  }
  for(const options of [{attackerId:'environment'},{attackerId:'script',levelScaling:false},{attackerId:'true',trueDamage:true}]) {
    const game=arena(),applied=game.damagePlayer(50,{attackerLevel:68,...options});
    assert.equal(applied,incomingDamage(50,{armor:game.stats().armor,attackerLevel:68,trueDamage:options.trueDamage}));
  }
  const duel=arena();duel.worldMode='pvp';const target=enemy(duel);
  assert.equal(duel.hitEnemy(target,200,0),200);
  assert.equal(duel.damagePlayer(50,{attackerId:'opponent',attackerLevel:68}),incomingDamage(50,{armor:duel.stats().armor,attackerLevel:68}));
});

test('restoring old equipment keeps owned items but unequips gear above the character level',()=>{
  const game=arena(),item=generateLoot({level:68,baseId:'iron_longsword',classId:'guardian',rarity:'rare',uid:'overlevel',rng:()=>.5});
  game.addItem(item);assert.equal(game.equip(item.id),false);
  const save=game.capture();save.equipment.weapon=item.id;
  const restored=new Game({storage:null});restored.applySave(save);
  assert.equal(restored.equipment.weapon,null);assert.equal(restored.inventory[item.id],1);
  assert.deepEqual(restored.item(item.id),item);assert.equal(restored.canEquipItem(item.id),false);
  const lowered={...item,minLevel:1};const tampered=structuredClone(save);tampered.generatedItems[item.id]=lowered;
  const second=new Game({storage:null});second.applySave(tampered);
  assert.equal(second.equipment.weapon,null);assert.equal(second.inventory[item.id],1);assert.equal(second.canEquipItem(item.id),false);
});

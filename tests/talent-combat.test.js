import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES, CLASS_TALENTS, canLearnTalent, validateCombatTalentState } from '../src/classes.js';
import { ABILITIES } from '../src/abilities.js';
import { PVP_STATS } from '../src/pvp.js';
import { getTalentCombatModifiers, applyTalentAttackProfile, applyTalentAbilityProfile, TALENT_COMBAT_BOUNDS, describeTalentCombatEffects } from '../src/talent-combat.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const depth=cls=>cls.talents.filter(talent=>talent.combatDepth);
function prerequisites(game,talent){
  if(talent.requires){const previous=CLASS_TALENTS.find(candidate=>candidate.id===talent.requires);prerequisites(game,previous);game.skills[previous.id]=Math.max(game.skills[previous.id]||0,talent.requiresRank||1);}
}
function invest(game,id,rank){const talent=CLASS_TALENTS.find(value=>value.id===id);assert.ok(talent);prerequisites(game,talent);game.skills[id]=rank??talent.maxRank;return talent;}
function arena(classId){
  const game=new Game({storage:null,random:()=>.5});game.selectClass(classId);game.player.level=100;game.player.skillPoints=198;
  Object.assign(game.player,{id:`talent-${classId}`,x:2000,y:1000,face:0,invulnerable:60});
  for(const key of ['trees','rocks','structures','nodes','plots','chests','shrines','enemies'])game.world[key]=[];game.npcs=[];
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.start();return game;
}
const enemy=(game,x=100,y=0)=>{const actor={id:`talent-enemy-${game.world.enemies.length}`,type:'wolf',x:game.player.x+x,y:game.player.y+y,homeX:game.player.x+x,homeY:game.player.y+y,hp:100000,maxHp:100000,alive:true,phase:'recover',attackTimer:999,aggro:false};game.world.enemies.push(actor);return actor;};
function advance(game,seconds){for(let frame=0;frame<Math.ceil(seconds/.02);frame++){game.update(.02,{simulateWorld:false});game.updateWorld(.02);}}

test('eight classes retain their original 164 talents and add four linked mechanical choices each',()=>{
  assert.equal(CLASS_TALENTS.filter(talent=>!talent.combatDepth).length,164);assert.equal(CLASS_TALENTS.filter(talent=>talent.combatDepth).length,32);
  for(const cls of CLASSES){const added=depth(cls);assert.equal(added.length,4);assert.deepEqual(added.map(talent=>[talent.minLevel,talent.maxRank,talent.cost]),[[35,2,3],[70,1,5],[35,2,3],[70,1,5]]);
    assert.equal(new Set(added.map(talent=>talent.branch)).size,2);assert.equal(new Set(added.filter(talent=>talent.keystone).map(talent=>talent.exclusiveGroup)).size,1);
    for(const talent of added){assert.equal(talent.effect,null);assert.equal(talent.requiresRank,2);assert.ok(cls.talents.some(previous=>previous.id===talent.requires&&previous.branch===talent.branch));assert.equal(describeTalentCombatEffects(talent).length,talent.combatEffects.length);}
  }
});

test('every new talent changes a native class action or learned profile without mutating canonical data',()=>{
  for(const cls of CLASSES)for(const talent of depth(cls)){
    const mods=getTalentCombatModifiers({[talent.id]:talent.maxRank},cls.id),profiles=[...Object.values(cls.abilities),...ABILITIES.filter(ability=>ability.classId===cls.id)],original=clone(profiles);
    const changed=profiles.filter(profile=>JSON.stringify(profile.kind===cls.abilities.attack.kind&&profile===cls.abilities.attack?applyTalentAttackProfile(profile,mods):applyTalentAbilityProfile(profile,mods))!==JSON.stringify(profile));
    assert.ok(changed.length>0,`${talent.id} must alter a profile consumed by real combat`);assert.deepEqual(clone(profiles),original);
  }
  for(const cls of CLASSES){assert.deepEqual(applyTalentAttackProfile(cls.abilities.attack,{}),cls.abilities.attack);for(const name of ['bolt','nova'])assert.deepEqual(applyTalentAbilityProfile(cls.abilities[name],{}),cls.abilities[name]);}
});

test('mechanical learning pays bounded ranks, excludes the rival oath and validates imports atomically',()=>{
  for(const cls of CLASSES){
    const game=arena(cls.id),[support,first,,second]=depth(cls);prerequisites(game,support);const points=game.player.skillPoints;
    assert.equal(game.learn(support.id),true);assert.equal(game.learn(support.id),true);assert.equal(game.learn(support.id),false);assert.equal(game.player.skillPoints,points-6);
    assert.equal(game.learn(first.id),true);prerequisites(game,second);assert.equal(canLearnTalent(game,second.id).ok,false);const paid=game.player.skillPoints;assert.equal(game.learn(second.id),false);assert.equal(game.player.skillPoints,paid);
    const saved=clone(game.capture());assert.equal(validateCombatTalentState(saved),true);const loaded=arena(cls.id);loaded.applySave(saved);assert.equal(loaded.skills[first.id],1);assert.deepEqual(loaded.combatTalentModifiers(),game.combatTalentModifiers());
    for(const level of [NaN,Infinity,'100'])assert.equal(validateCombatTalentState({...saved,player:{...saved.player,level}}),false);
    for(const corrupt of [data=>{data.skills[second.id]=1;},data=>{data.player.classId=CLASSES.find(other=>other.id!==cls.id).id;},data=>{data.player.level=34;},data=>{data.skills[support.requires]=1;},data=>{data.skills[support.id]=99;}]){
      const invalid=clone(saved);corrupt(invalid);assert.equal(validateCombatTalentState(invalid),false);const before=clone(loaded.capture());assert.throws(()=>loaded.applySave(invalid));assert.deepEqual(loaded.capture().skills,before.skills);assert.deepEqual(loaded.capture().player,before.player);
    }
  }
  assert.equal(validateCombatTalentState({player:{classId:'guardian',level:1},skills:{arcane_mastery:3,guardian_living_citadel:1}}),true,'Older talent saves retain their previous compatibility rules');
});

test('foreign, nonfinite and exaggerated ranks cannot create unbounded modifiers or extra actor budgets',()=>{
  assert.deepEqual(getTalentCombatModifiers({guardian_gate_oath:1},'paladin'),{});assert.deepEqual(getTalentCombatModifiers({guardian_gate_oath:1},'forged'),{});
  assert.deepEqual(getTalentCombatModifiers({guardian_gate_oath:NaN,guardian_sweeping_guard:-1},'guardian'),{});
  const all=Object.fromEntries(CLASS_TALENTS.filter(talent=>talent.combatDepth).map(talent=>[talent.id,999999]));
  for(const cls of CLASSES)for(const target of Object.values(getTalentCombatModifiers(all,cls.id)))for(const [stat,value] of Object.entries(target))assert.ok(value>=TALENT_COMBAT_BOUNDS[stat][0]&&value<=TALENT_COMBAT_BOUNDS[stat][1]);
  const attack=applyTalentAttackProfile({kind:'projectile',range:600,projectileSpeed:600,piercing:1,damageMultiplier:1,cooldown:.5},{attack:{range:1e9,speed:1e9,power:1e9,piercing:1e9,cooldown:-1e9,forged:1e9}});
  assert.equal(attack.piercing,2);assert.equal(attack.damageMultiplier,1.2);assert.equal(attack.range,840);assert.equal(attack.cooldown,.4);assert.equal(attack.forged,undefined);
  const summon=applyTalentAbilityProfile({kind:'summon',count:3,damageMultiplier:.3,duration:20,cost:30,cooldown:20,attackCooldown:1},{summon:{summonCount:999,power:999,summonCadence:-999,duration:999}});assert.equal(summon.count,4);assert.equal(summon.duration,28);assert.equal(summon.attackCooldown,.85);
  const mark=applyTalentAbilityProfile({kind:'mark',damageMultiplier:.4,comboMultiplier:.6},{offense:{power:.2}});assert.equal(mark.damageMultiplier,.48);assert.equal(mark.comboMultiplier,.72);
  const storm=applyTalentAbilityProfile({kind:'storm',slow:.5,duration:6},{control:{slowDuration:.2}});assert.equal(storm.duration,6);assert.equal(storm.slowDuration,1.92);
  const ward=applyTalentAbilityProfile({kind:'retaliationWard',duration:6,slow:.4,slowDuration:2,charges:3},{control:{slowDuration:.2}});assert.equal(ward.duration,6,'Longer on-hit control must preserve the entire reactive protection window');assert.equal(ward.slowDuration,2.4);assert.equal(ward.charges,3);
  const healingMods={healing:{regenPower:.15,directHealPower:-.15,duration:.3}},direct=applyTalentAbilityProfile({kind:'heal',healMultiplier:2,regenerationMultiplier:.2,duration:6},healingMods),zone=applyTalentAbilityProfile({kind:'regeneration',healMultiplier:1,healFraction:.02,duration:5},healingMods);
  assert.equal(direct.healMultiplier,1.7);assert.ok(Math.abs(direct.regenerationMultiplier-.23)<1e-8);assert.equal(zone.healMultiplier,1.15);assert.ok(Math.abs(zone.healFraction-.023)<1e-8);assert.equal(zone.duration,6.5);
  const broadDrain=applyTalentAbilityProfile({kind:'retaliationWard',range:250,targetRange:250,drain:.15,duration:6,cost:30},{drain:{range:.2,healPower:.2,cost:.2}});assert.equal(broadDrain.targetRange,300);assert.equal(broadDrain.drain,.18);assert.equal(broadDrain.cost,36);assert.equal(broadDrain.duration,6);
});

test('guardian, paladin and druid supporting paths change real shield and party-heal decisions',()=>{
  const guardian=arena('guardian');invest(guardian,'guardian_watchful_aegis');guardian.player.mana=guardian.stats().mana;const mana=guardian.player.mana,profile=applyTalentAbilityProfile(CLASSES[0].abilities.bolt,guardian.combatTalentModifiers());
  assert.equal(guardian.action('bolt'),true);assert.equal(guardian.player.mana,mana-profile.cost);assert.equal(guardian.player.shieldUntil,guardian.time+profile.duration);
  for(const [classId,id,distance] of [['paladin','paladin_kindled_mercy',190],['druid','druid_wandering_bloom',190]]){
    const caster=arena(classId),ally=arena('guardian');invest(caster,id);ally.player.x=caster.player.x+distance;ally.player.y=caster.player.y;ally.player.hp=20;
    ally.world=caster.world;caster.partyGames=ally.partyGames=[caster,ally];caster.player.mana=caster.stats().mana;assert.equal(caster.action('bolt'),true);assert.ok(ally.player.hp>20,'The actual heal reaches beyond its original radius');
  }
});

test('ranger threading arrows hit two real opponents and nightblade steps gain distance while paying their timing cost',()=>{
  const ranger=arena('ranger');invest(ranger,'ranger_threading_arrow');const first=enemy(ranger,100),second=enemy(ranger,220);
  const profile=applyTalentAttackProfile(CLASSES.find(cls=>cls.id==='ranger').abilities.attack,ranger.combatTalentModifiers());assert.equal(ranger.action('attack'),true);assert.equal(ranger.projectiles[0].piercing,2);assert.equal(ranger.cooldowns.attack,profile.cooldown);advance(ranger,.55);assert.ok(first.hp<first.maxHp&&second.hp<second.maxHp);
  const rogue=arena('nightblade');invest(rogue,'nightblade_long_shadow');rogue.player.mana=rogue.stats().mana;const before=rogue.player.x,step=applyTalentAbilityProfile(CLASSES.find(cls=>cls.id==='nightblade').abilities.bolt,rogue.combatTalentModifiers());
  assert.equal(rogue.action('bolt'),true);assert.ok(Math.abs(rogue.player.x-before-step.range)<1e-7);assert.equal(rogue.cooldowns.bolt,step.cooldown*(1-rogue.stats().cooldown));
});

test('the native heavy combo honors the narrower oath angle while keeping its own damage and timing',()=>{
  for(const narrowed of [false,true]){
    const game=arena('nightblade');if(narrowed)invest(game,'nightblade_single_victim');
    const front=enemy(game,60),lateral=enemy(game,20,65);game.combo=1;game.comboTime=game.time;
    const profile=applyTalentAttackProfile(CLASSES.find(cls=>cls.id==='nightblade').abilities.attack,game.combatTalentModifiers());
    assert.equal(game.action('attack'),true);assert.equal(game.combo,2);assert.ok(front.hp<front.maxHp);assert.equal(game.cooldowns.attack,profile.cooldown);
    assert.equal(lateral.hp<lateral.maxHp,!narrowed,'The focused final strike gives up its original lateral coverage');
  }
});

test('fire, frost and pact paths alter actual projectiles, on-hit control and independently bounded servants',()=>{
  const fire=arena('flamecaller');invest(fire,'flamecaller_falling_sparks');fire.player.mana=fire.stats().mana;const flame=applyTalentAbilityProfile(CLASSES.find(cls=>cls.id==='flamecaller').abilities.bolt,fire.combatTalentModifiers());
  assert.equal(fire.action('bolt'),true);assert.equal(fire.projectiles[0].speed,flame.projectileSpeed);assert.equal(fire.projectiles[0].splash,flame.splashRadius);
  const frost=arena('frostweaver');invest(frost,'frostweaver_lingering_rime');frost.player.mana=frost.stats().mana;const target=enemy(frost,100),cold=applyTalentAbilityProfile(CLASSES.find(cls=>cls.id==='frostweaver').abilities.bolt,frost.combatTalentModifiers());
  assert.equal(frost.action('bolt'),true);assert.equal(frost.projectiles[0].slowDuration,cold.slowDuration);advance(frost,.25);assert.ok(target.slowUntil>frost.time+3.4);
  const pact=arena('shadowbinder');invest(pact,'shadowbinder_third_shadow');pact.player.mana=pact.stats().mana;const summoned=applyTalentAbilityProfile(CLASSES.find(cls=>cls.id==='shadowbinder').abilities.nova,pact.combatTalentModifiers());
  assert.equal(pact.action('nova'),true);assert.equal(pact.summons.length,3);assert.ok(pact.summons.every(servant=>servant.life===summoned.duration));
  const before=clone(pact.skills);pact.worldMode='pvp';pact.pvpStats=PVP_STATS;assert.deepEqual(pact.combatTalentModifiers(),{});assert.deepEqual(pact.stats(),PVP_STATS);assert.deepEqual(pact.skills,before);
});

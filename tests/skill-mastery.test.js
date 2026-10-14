import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { CLASSES, CLASS_TALENTS, canLearnTalent, getTalentModifiers } from '../src/classes.js';
import { ABILITIES, getAbility, validateAbilityState } from '../src/abilities.js';
import { basePlayerStats, capCombatStats, classStatModifiers } from '../src/balance.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const mastered=(cls,branch)=>Object.fromEntries(cls.talents.filter(t=>t.mastery&&!t.combatDepth&&t.branch===branch).map(t=>[t.id,t.maxRank]));

test('every class has three specialization paths, rank gates and three costly keystones',()=>{
  assert.equal(CLASS_TALENTS.filter(t=>!t.combatDepth).length,164);assert.equal(CLASS_TALENTS.filter(t=>t.combatDepth).length,32);
  for(const cls of CLASSES) {
    const talents=cls.talents.filter(t=>t.mastery&&!t.combatDepth),branches=[...new Set(talents.map(t=>t.branch))];
    assert.equal(talents.length,12);assert.equal(branches.length,3);
    for(const branch of branches) {
      const path=talents.filter(t=>t.branch===branch);
      assert.deepEqual(path.map(t=>t.minLevel),[8,20,45,75]);
      assert.deepEqual(path.map(t=>t.requiresRank),[2,2,2,3]);
      assert.equal(path.at(-1).maxRank,1);assert.equal(path.at(-1).cost,5);
      assert.ok(path.at(-1).secondaryEffects.some(effect=>effect.value<0));
      for(const talent of path)assert.ok(cls.talents.find(t=>t.id===talent.requires).maxRank>=talent.requiresRank);
    }
    const allTalentCost=cls.talents.reduce((sum,t)=>sum+t.cost*t.maxRank,0);
    const allAbilityCost=ABILITIES.filter(a=>a.classId===cls.id).reduce((sum,a)=>sum+a.talentCost,0);
    assert.ok(allTalentCost+allAbilityCost>200,'Natural level points require build choices.');
  }
});

test('mastery learning cannot bypass levels, prerequisite ranks, class, point cost or max rank',()=>{
  for(const cls of CLASSES) {
    const talent=cls.talents.find(t=>t.mastery),game={player:{classId:cls.id,level:8,hp:100,skillPoints:2},skills:{}};
    assert.equal(canLearnTalent(game,talent.id).ok,false);
    game.skills[talent.requires]=1;assert.equal(canLearnTalent(game,talent.id).ok,false);
    game.skills[talent.requires]=2;assert.equal(canLearnTalent(game,talent.id).ok,true);
    game.player.level=7;assert.equal(canLearnTalent(game,talent.id).ok,false);game.player.level=8;
    game.player.skillPoints=0;assert.equal(canLearnTalent(game,talent.id).ok,false);game.player.skillPoints=2;
    game.skills[talent.id]=talent.maxRank;assert.equal(canLearnTalent(game,talent.id).ok,false);game.skills[talent.id]=0;
    game.dead=true;assert.equal(canLearnTalent(game,talent.id).ok,false);game.dead=false;
    game.player.classId=CLASSES.find(other=>other.id!==cls.id).id;assert.equal(canLearnTalent(game,talent.id).ok,false);
  }
});

test('keystone benefits and penalties both affect real combat stats and survive a save',()=>{
  const game=new Game({storage:null,random:()=>.5});game.selectClass('guardian');
  game.player.level=100;game.player.skillPoints=200;game.player.hp=game.stats().maxHp;
  game.skills={guardian_vigor:2,guardian_steel:2,guardian_gatekeeper:2,guardian_black_plate:2,guardian_siege_heart:3};
  const before=game.stats(),points=game.player.skillPoints;
  assert.equal(game.learn('guardian_living_citadel'),true);
  assert.equal(game.player.skillPoints,points-5);
  assert.equal(game.stats().maxHp,before.maxHp+130);assert.equal(game.stats().speed,before.speed-12);
  assert.equal(game.learn('guardian_living_citadel'),false);
  const saved=clone(game.capture()),restored=new Game({storage:null});restored.applySave(saved);
  assert.equal(restored.skills.guardian_living_citadel,1);assert.deepEqual(restored.stats(),game.stats());
});

test('specialization gains stay bounded at their unlock and late milestones',()=>{
  for(const cls of CLASSES)for(const level of [8,20,45,75,100]) {
    const baseline=basePlayerStats(level),mods=classStatModifiers(cls.id,level);
    for(const [key,value] of Object.entries(mods))baseline[key]+=value;
    const source=capCombatStats(baseline,{level});
    for(const branch of new Set(cls.talents.filter(t=>t.mastery).map(t=>t.branch))) {
      const ranks=mastered(cls,branch);
      for(const talent of cls.talents)if(talent.minLevel>level)delete ranks[talent.id];
      const modifier=getTalentModifiers(ranks,cls.id),raw={...baseline};
      for(const [key,value] of Object.entries(modifier))raw[key]+=value;
      const result=capCombatStats(raw,{level});
      assert.ok(Object.values(result).every(Number.isFinite));
      assert.ok(result.maxHp>=source.maxHp*.8&&result.maxHp<=source.maxHp*1.7,`${cls.id}/${branch}/${level}: health`);
      assert.ok(result.damage<=source.damage*1.6&&result.spellDamage<=source.spellDamage*1.6,`${cls.id}/${branch}/${level}: damage`);
      assert.ok(result.cooldown-source.cooldown<=.12);
    }
  }
});

test('legacy guardian talents retain their values and foreign or malformed ranks add no power',()=>{
  assert.deepEqual(getTalentModifiers({guardian_vigor:3,guardian_steel:3,guardian_might:3,guardian_siphon:3},'guardian'),{maxHp:60,armor:6,damage:12,lifeSteal:.09});
  assert.deepEqual(getTalentModifiers({guardian_living_citadel:999},'guardian'),{maxHp:130,speed:-12});
  assert.deepEqual(getTalentModifiers({guardian_living_citadel:NaN,guardian_gatekeeper:-5,paladin_faith:10},'guardian'),{});
});

test('late active branch saves retain prerequisites and reject missing links',()=>{
  for(const cls of CLASSES) {
    const final=ABILITIES.find(a=>a.classId===cls.id&&a.level===70),learned={};
    for(let ability=final;ability;ability=getAbility(ability.requires))learned[ability.id]=true;
    const save={player:{classId:cls.id,level:70},learnedAbilities:learned,abilityLoadout:[final.id,null],abilityCooldowns:{[final.id]:final.cooldown}};
    assert.deepEqual(validateAbilityState(save).learned,learned);
    delete save.learnedAbilities[final.requires];assert.throws(()=>validateAbilityState(save));
    assert.ok(final.branch&&final.cost<=50&&final.cooldown>=20);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { getClass } from '../src/classes.js';
import { classPowerMultiplier } from '../src/balance.js';
import { TECHNIQUE_SPECIALIZATIONS } from '../src/technique-specializations.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const close=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-7,`${actual} ≠ ${expected}`);
function character(classId) {
  const game=new Game({storage:null,random:()=>.5});assert.equal(game.selectClass(classId),true);
  game.player.level=70;game.player.id=`native-${classId}`;game.resources.raidSigil=24;
  game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;game.start();return game;
}
function castScene(game) {
  // Declared training fixture: open geometry and normal character stats.
  for(const field of ['enemies','trees','rocks','structures','nodes','plots','chests','shrines'])game.world[field]=[];
  game.npcs=[];Object.assign(game.player,{x:2000,y:1000,face:0,hp:20,mana:game.stats().mana});return game;
}
function target(game,distance,lateral=0) {
  const enemy={id:`native-target-${game.world.enemies.length}`,type:'wolf',level:70,
    x:game.player.x+distance,y:game.player.y+lateral,homeX:game.player.x+distance,homeY:game.player.y+lateral,
    hp:100000,maxHp:100000,alive:true,phase:'recover',attackTimer:999,aggro:false};
  game.world.enemies.push(enemy);return enemy;
}
function advance(game,seconds) {
  for(let left=seconds;left>1e-8;left-=.02){const dt=Math.min(.02,left);game.update(dt,{simulateWorld:false});game.updateWorld(dt);}
}

test('all sixteen earned techniques are consumed by actual class actions with their costs and tradeoffs',()=>{
  const canonical=clone(TECHNIQUE_SPECIALIZATIONS);
  for(const definition of TECHNIQUE_SPECIALIZATIONS) {
    const game=character(definition.classId);
    assert.equal(game.learnTechniqueSpecialization(definition.id),true);assert.equal(game.resources.raidSigil,12);
    assert.equal(game.techniqueSpecializations.active,null,'Learning and choosing remain separate decisions');
    assert.equal(game.selectTechniqueSpecialization(definition.id),true);castScene(game);
    const skill=game.coreAbilityProfile(definition.action),stats=game.stats(),mana=game.player.mana,x=game.player.x;
    assert.equal(game.action(definition.action),true,definition.id);
    close(mana-game.player.mana,skill.cost);close(game.cooldowns[definition.action],skill.cooldown*(1-stats.cooldown));
    if(skill.kind==='projectile') {
      const projectile=game.projectiles[0];
      close(projectile.damage,stats[skill.stat||'spellDamage']*skill.damageMultiplier*classPowerMultiplier(definition.classId,'spell'));
      close(projectile.life*projectile.speed,skill.range);assert.equal(projectile.piercing,skill.piercing||0);
      assert.equal(projectile.splash,skill.splashRadius||0);assert.equal(projectile.slow,skill.slow||0);assert.equal(projectile.slowDuration,skill.duration||3);
    } else if(skill.kind==='shield') {
      close(game.player.shield,stats.maxHp*skill.shieldMultiplier*classPowerMultiplier(definition.classId,'shield'));
      close(game.player.shieldUntil,game.time+skill.duration);
    } else if(skill.kind==='heal') {
      close(game.player.hp-20,stats.spellDamage*skill.healMultiplier*classPowerMultiplier(definition.classId,'heal'));
      if(skill.regenerationMultiplier){const zone=game.hazards.find(hazard=>hazard.kind==='regeneration');close(zone.life,skill.duration);close(zone.heal,stats.spellDamage*skill.regenerationMultiplier*classPowerMultiplier(definition.classId,'heal'));}
    } else if(skill.kind==='summon') {
      assert.equal(game.summons.length,skill.summonCount||2);
      assert.ok(game.summons.every(servant=>servant.life===skill.duration&&servant.attackCooldown===skill.summonAttackCooldown));
      assert.equal(game.summonSlots(),8-game.summons.length);
    } else if(skill.kind==='dashstrike')close(game.player.x-x,skill.range);
    else assert.fail(`Missing native assertion for ${definition.id}: ${skill.kind}`);
    assert.equal(game.action(definition.action),false,'An earned variant cannot bypass the running cooldown');
  }
  assert.deepEqual(TECHNIQUE_SPECIALIZATIONS,canonical);
});

test('Reihenbrecher hits five native opponents while Fokuspfeil gives up the extra hits',()=>{
  for(const [id,hits]of [['ranger_linebreaker',5],['ranger_focused_arrow',1]]) {
    const game=character('ranger');game.learnTechniqueSpecialization(id);game.selectTechniqueSpecialization(id);castScene(game);
    const enemies=Array.from({length:5},(_,index)=>target(game,70+index*80));
    assert.equal(game.action('bolt'),true);advance(game,.7);assert.equal(enemies.filter(enemy=>enemy.hp<enemy.maxHp).length,hits);
  }
});

test('wide party healing reaches separated players and concentrated healing requires a closer formation',()=>{
  for(const [id,remoteHealed]of [['paladin_far_light',true],['paladin_close_light',false]]) {
    const caster=character('paladin'),ally=character('guardian');caster.learnTechniqueSpecialization(id);caster.selectTechniqueSpecialization(id);castScene(caster);
    Object.assign(ally.player,{x:caster.player.x+220,y:caster.player.y,hp:20});ally.world=caster.world;caster.partyGames=ally.partyGames=[caster,ally];
    assert.equal(caster.action('bolt'),true);assert.equal(ally.player.hp>20,remoteHealed);
  }
});

test('cold variants apply their actual slow and duration when a projectile hits',()=>{
  for(const id of ['frostweaver_frost_bite','frostweaver_creeping_rime']) {
    const game=character('frostweaver');game.learnTechniqueSpecialization(id);game.selectTechniqueSpecialization(id);castScene(game);
    const enemy=target(game,100),skill=game.coreAbilityProfile('bolt');assert.equal(game.action('bolt'),true);advance(game,.2);
    assert.ok(enemy.hp<enemy.maxHp);close(enemy.slowFactor,1-skill.slow);
    assert.ok(enemy.slowUntil>game.time+skill.duration-.2&&enemy.slowUntil<=game.time+skill.duration);
  }
});

test('save and reload retain ownership and a switched-off long cooldown; corrupt imports remain atomic',()=>{
  const game=character('shadowbinder');assert.equal(game.learnTechniqueSpecialization('shadowbinder_patient_pact'),true);
  assert.equal(game.selectTechniqueSpecialization('shadowbinder_patient_pact'),true);assert.equal(game.action('nova'),true);
  const cooldown=game.cooldowns.nova;assert.ok(cooldown>getClass('shadowbinder').abilities.nova.cooldown);
  assert.equal(game.selectTechniqueSpecialization(null),true);assert.equal(game.cooldowns.nova,cooldown);
  const saved=clone(game.capture()),loaded=new Game({storage:null});loaded.applySave(saved);
  assert.deepEqual(loaded.techniqueSpecializations,game.techniqueSpecializations);assert.equal(loaded.cooldowns.nova,cooldown);
  loaded.start();assert.equal(loaded.action('nova'),false);
  for(const mutate of [data=>{data.techniqueSpecializations.learned.push('guardian_impact_wall');},data=>{data.techniqueSpecializations.active='shadowbinder_ravenous_pact';},data=>{data.combatCooldowns.nova=999;},data=>{data.techniqueSpecializations.version=2;}]) {
    const invalid=clone(saved);mutate(invalid);const before=clone(loaded.capture());assert.throws(()=>loaded.applySave(invalid));
    const after=clone(loaded.capture());delete before.savedAt;delete after.savedAt;assert.deepEqual(after,before);
  }
  delete saved.techniqueSpecializations;saved.combatCooldowns.nova=0;loaded.applySave(saved);
  assert.deepEqual(loaded.techniqueSpecializations,{version:1,learned:[],active:null},'V9 characters keep the original class skills');
});

test('earned choices stay personal, reject a dungeon or defeat and rest during equalized PvP',()=>{
  const game=character('guardian'),friend=character('guardian');game.partyGames=friend.partyGames=[game,friend];const id='guardian_impact_wall';
  game.dungeonInstance={};assert.equal(game.learnTechniqueSpecialization(id),false);game.dungeonInstance=null;game.dead=true;
  assert.equal(game.learnTechniqueSpecialization(id),false);game.dead=false;assert.equal(game.learnTechniqueSpecialization(id),true);
  assert.equal(game.selectTechniqueSpecialization(id),true);assert.equal(friend.resources.raidSigil,24);assert.deepEqual(friend.techniqueSpecializations.learned,[]);
  const owned=clone(game.techniqueSpecializations);game.worldMode='pvp';assert.deepEqual(game.coreAbilityProfile('nova'),getClass('guardian').abilities.nova);
  assert.equal(game.selectTechniqueSpecialization(null),false);assert.deepEqual(game.techniqueSpecializations,owned);
});

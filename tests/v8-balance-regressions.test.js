import test from 'node:test';
import assert from 'node:assert/strict';
import { loadAuditSource, buildAuditCharacter, createNativeFixture, probeNativeEncounter, compareMatrices, nativeWarningShapes, auditController } from './scripts/v8-balance-gameplay-audit.mjs';

const source=await loadAuditSource();
const bossOf=fixture=>fixture.world.enemies.find(enemy=>enemy.eventId===fixture.hunt.id&&enemy.type===fixture.hunt.boss);
function spawned(fixture){for(let count=0;count<180&&!bossOf(fixture);count++)fixture.step();const boss=bossOf(fixture);assert.ok(boss,'Boss must come from native start/runes/warning');return boss;}

test('all eight level100 audit characters spend only their earned200 points and equip seven actual legal Rare items',()=>{
  for(const cls of source.CLASSES){
    const game=new source.Game({storage:null,random:()=>.5});game.selectClass(cls.id);game.start();const gear=buildAuditCharacter(source,game,100,cls.id);
    assert.equal(gear.pointBudget,200);assert.equal(gear.pointCost+gear.unspent,200);assert.ok(gear.unspent>=0);assert.equal(gear.gear.length,7);
    assert.ok(gear.gear.every(item=>item.minLevel<=100&&item.level===100&&item.rarity==='rare'));assert.ok(Object.values(gear.stats).every(Number.isFinite));
    assert.equal(game.player.hp,game.stats().maxHp);assert.equal(game.player.mana,game.stats().mana);assert.equal(gear.suppliedPotions,5);
    for(const id of gear.loadout)assert.equal(game.learnedAbilities[id],true);
    assert.equal(game.summons.filter(actor=>actor.companion).length,0);assert.ok(!Object.values(game.generatedItems).some(item=>item.relic||item.upgradeLevel>0||item.sockets?.some(Boolean)));
  }
});

test('early level4/12/52 fixtures declare unavailable slots rather than supplying illegal late equipment or extra points',()=>{
  for(const level of [4,12,52])for(const classId of ['guardian','ranger']){
    const game=new source.Game({storage:null,random:()=>.5});game.selectClass(classId);game.start();const gear=buildAuditCharacter(source,game,level,classId);
    assert.equal(gear.pointBudget,level*2);assert.equal(gear.pointCost+gear.unspent,level*2);assert.ok(gear.gear.every(item=>item.minLevel<=level&&item.level===level));
    assert.equal(gear.gear.length+gear.missingSlots.length,7);
    for(const id of Object.keys(game.learnedAbilities).filter(id=>game.learnedAbilities[id]))assert.ok(source.ABILITIES.find(a=>a.id===id).level<=level);
  }
});

test('a full-health native Irdan warning freezes real geometry before its first real damage and never requires a forged weak boss',()=>{
  const fixture=createNativeFixture(source,{huntId:'event-irdan',classIds:['ranger'],level:12}),boss=spawned(fixture),hp=boss.maxHp;
  for(let count=0;count<180&&boss.phase!=='windup';count++)fixture.step();assert.equal(boss.phase,'windup');assert.ok(boss.telegraphDuration>=1.15);
  const warning=boss.telegraphShapes,copy=structuredClone(warning),beforeHp=fixture.leader.player.hp,cycle=boss.cycle||0;
  assert.ok(Object.isFrozen(warning)&&warning.every(Object.isFrozen));assert.ok(warning.some(shape=>source.hitShape(shape,fixture.leader.player)));
  while(boss.attackTimer>.08&&boss.phase==='windup'){fixture.step();assert.equal(boss.cycle||0,cycle);assert.equal(fixture.leader.player.hp,beforeHp);assert.deepEqual(boss.telegraphShapes,copy);}
  for(let count=0;count<8&&(boss.cycle||0)===cycle;count++)fixture.step();
  assert.ok((boss.cycle||0)>cycle);assert.ok(fixture.leader.player.hp<beforeHp,'Only actual resolved geometry hurts the full-health player');assert.equal(boss.hp,hp);assert.equal(boss.maxHp,hp);
});

test('eight native participants scale the spawned boss once and a later departure never erases its remaining budget',()=>{
  const solo=createNativeFixture(source,{huntId:'event-irdan',classIds:['ranger'],level:12}),group=createNativeFixture(source,{huntId:'event-irdan',classIds:Array(8).fill('ranger'),level:12});
  const one=spawned(solo),eight=spawned(group);assert.equal(one.partySize,1);assert.equal(eight.partySize,8);assert.equal(eight.partyHpScale,1+.55*7);
  assert.equal(eight.maxHp,Math.round(one.maxHp*eight.partyHpScale));assert.equal(eight.damage,one.damage,'Party pressure does not silently multiply incoming damage');
  const hp=eight.hp,max=eight.maxHp;group.leader.partyGames=[group.leader];group.leader.updateWorld(.04,[group.leader]);assert.equal(eight.hp,hp);assert.equal(eight.maxHp,max);assert.equal(eight.partySize,8);
});

test('eight legal rangers with learned actives cannot erase native Irdan or Vey before a warned attack resolves',()=>{
  for(const [huntId,level] of [['event-irdan',12],['event-vey',52]]){
    const result=probeNativeEncounter(source,{huntId,classIds:Array(8).fill('ranger'),level,style:'reactive'});
    assert.equal(result.won,true,'The scaled group fight must still be winnable through native input');assert.equal(result.spawnPartySize,8);
    assert.ok(result.bossCycles>=1,'Focused legal group burst cannot skip every authored attack');assert.ok(result.warnings.length>=1&&result.warnings.every(warning=>warning.duration>=1.15));
    assert.ok(result.resolutions[0].time>=result.warnings[0].time+result.warnings[0].duration-.08,'A resolved first attack preserves its entire visible windup');
  }
});

test('generic locked hex warnings retain the authoritative player mark and charge warnings retain their real corridor',()=>{
  const hex={type:'wolf',phase:'windup',x:10,y:20,telegraphPattern:'hex',telegraphX:340,telegraphY:410,telegraphRadius:87},charge={...hex,telegraphPattern:'charge',telegraphAngle:-Math.PI/2,telegraphChargeDistance:240};
  const shapes=nativeWarningShapes(source,[hex,charge]);assert.deepEqual(shapes[0],{kind:'circle',x:340,y:410,radius:87});assert.ok(source.hitShape(shapes[0],{x:340,y:410}));assert.ok(!source.hitShape(shapes[0],hex));
  assert.equal(shapes[1].width,35);assert.ok(Math.abs(shapes[1].x2-10)<1e-8);assert.equal(shapes[1].y2,-220);
});

test('native reactive and reckless early probes share identical legal setup and report real outcomes independently',()=>{
  const reactive=probeNativeEncounter(source,{huntId:'event-sivra',classIds:['ranger'],level:4,style:'reactive'}),reckless=probeNativeEncounter(source,{huntId:'event-sivra',classIds:['ranger'],level:4,style:'reckless'});
  assert.deepEqual(reactive.gear,reckless.gear);assert.equal(reactive.bossHp,reckless.bossHp);assert.ok(reactive.warnings.length>0&&reckless.warnings.length>0);assert.ok(reactive.bossCycles>0&&reckless.bossCycles>0);
  assert.equal(reactive.won,true,'A warned early encounter remains beatable through real actions');assert.equal(reactive.fixture.noEnemyStatWrites,true);assert.ok(!reactive.actions[0].potion||reactive.actions[0].potion<=5);
  assert.equal(reckless.actions[0].dash,undefined);assert.equal(reckless.actions[0].potion,undefined);assert.ok(reckless.damageTaken[0]>0,'Ignoring the marked position causes actual HP loss');
  const comparison=compareMatrices({results:[reactive]},{results:[reactive]});assert.equal(comparison[0].hpRatio,1);assert.equal(comparison[0].before.seconds,comparison[0].after.seconds);
});

test('an actual full-health native boss defeat charges once, survives reload and repays fractional future gold in aggregate',()=>{
  const f=createNativeFixture(source,{huntId:'event-irdan',classIds:['ranger'],level:12,style:'reckless'}),game=f.leader,boss=spawned(f),initialHp=game.player.hp;
  // Use the canonical calm clock in this persistence check. The long isolated
  // matrix clock is intentionally a simulation fixture, not a valid save.
  f.world.encounterDirector.nextIn=75;
  game.player.gold=3;const memory={},actions={};let lastBefore=initialHp;
  const hurt=game.damagePlayer.bind(game);game.damagePlayer=(...args)=>{lastBefore=game.player.hp;return hurt(...args);};
  for(let tick=0;tick<3000&&!game.dead;tick++){auditController(source,game,f.event,'reckless',memory,actions,{offense:false});f.step();}
  assert.ok(initialHp>100&&game.dead,'A stationary careless full-health character must fall to real warned attacks');assert.ok(lastBefore>0);assert.equal(boss.hp,boss.maxHp,'Enemy HP was never lowered to invent a defeat');
  const summary=game.deathSummary();assert.equal(summary.deaths,1);assert.equal(summary.lastReceipt.goldBefore,3);assert.equal(summary.lastReceipt.fee,11);assert.equal(summary.debt,8);assert.equal(game.player.gold,0);
  const save=game.capture();game.damagePlayer(999999,{trueDamage:true,ignoreInvulnerability:true});assert.deepEqual(game.deathSummary(),summary);
  const restored=new source.Game({storage:null,random:()=>.5});restored.applySave(save);assert.equal(restored.deathSummary().deaths,1);assert.equal(restored.deathSummary().debt,8);assert.equal(restored.player.gold,0);assert.equal(restored.player.hp,restored.stats().maxHp);
  assert.equal(restored.respawn(),false,'Reload already performs the same paid rescue, so a second button cannot charge again');
  for(let i=0;i<4;i++)restored.gainGold(1);assert.equal(restored.deathSummary().debt,7);assert.equal(restored.player.gold,3);
  const carry=new source.Game({storage:null,random:()=>.5});carry.applySave(restored.capture());carry.gainGold(16);assert.equal(carry.deathSummary().debt,3);assert.equal(carry.player.gold,15);
});

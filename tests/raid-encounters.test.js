import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DUNGEONS } from '../src/dungeons.js';
import { createBossEncounter } from '../src/boss-encounters.js';
import { hitShape } from '../src/encounter-geometry.js';
import { captureRaidEncounter, validateRaidEncounterSave, RAID_PROFILES, raidReviveSummary, raidReturnBlocked } from '../src/raid-encounters.js';

const DT=.04,clone=value=>structuredClone(value);
function fixture(id='sturmzitadelle') {
  const definition=DUNGEONS.find(d=>d.id===id),classes=['guardian','druid','ranger','flamecaller','paladin','frostweaver','nightblade','shadowbinder'];
  const games=Array.from({length:definition.partyRequired},(_,index)=>{
    const game=new Game({storage:null,random:()=>.5});game.selectClass(classes[index]);game.start();
    Object.assign(game.player,{id:`hero-${index}`,level:100,...definition.entrance});
    game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;return game;
  });
  const leader=games[0];for(const game of games)game.partyGames=games;
  assert.equal(leader.enterDungeon(id),true);const instance=leader.dungeonInstance,boss=instance.world.enemies.find(enemy=>enemy.boss);
  instance.world.enemies=instance.world.enemies.filter(enemy=>enemy===boss||enemy.routeGuard);instance.gateOpened=true;instance.bossEngaged=true;
  instance.puzzles.forEach(puzzle=>{puzzle.solved=true;});const gate=instance.world.structures.find(structure=>structure.type==='dungeon_gate');gate.open=true;gate.blocking=false;
  games.forEach((game,index)=>{Object.assign(game.player,{x:boss.x-160+index%3*90,y:boss.y+165+Math.floor(index/3)*100,invulnerable:0});});
  return {leader,games,instance,boss,definition};
}
function tick(f,seconds=DT) {
  for(let remaining=seconds;remaining>1e-8;remaining-=DT) {
    for(const game of f.games)game.update(Math.min(DT,remaining),{simulateWorld:false});
    f.leader.updateWorld(Math.min(DT,remaining),f.games);
  }
}
function cast(f,index=0,hpFraction=1) {
  f.instance.raidEncounter=createBossEncounter(f.boss.type,{tier:f.instance.tier,seed:f.instance.seed});
  Object.assign(f.instance.raidEncounter,{startedAt:0,nextCastAt:0,castIndex:index});
  f.instance.bossTime=0;f.instance.bossEngaged=true;
  Object.assign(f.boss,{hp:f.boss.maxHp*hpFraction,phase:'idle',attackTimer:0,telegraphMechanic:null});
  tick(f);assert.ok(f.instance.raidEncounter.pending);return f.instance.raidEncounter.pending;
}
function checkpoint(f) {return JSON.parse(JSON.stringify(f.leader.capture()));}
function stableCapture(game){const state=game.capture();state.savedAt=0;return JSON.stringify(state);}

for(const dungeonId of ['sturmzitadelle','nachtschlund','weltenkern']) {
  test(`${dungeonId}: real Game updates freeze unique warnings, defer generic swings and use the exact damaging shapes`,()=>{
    const f=fixture(dungeonId),pending=cast(f),origin={x:f.boss.x,y:f.boss.y},shapes=clone(f.boss.telegraphShapes);
    const health=f.games.map(game=>game.player.hp),remaining=pending.resolveAt-f.instance.bossTime;
    tick(f,remaining-DT*2);
    assert.deepEqual({x:f.boss.x,y:f.boss.y},origin);assert.deepEqual(f.boss.telegraphShapes,shapes);
    assert.deepEqual(f.games.map(game=>game.player.hp),health,'A visible windup does not damage before its deadline');
    assert.ok(f.leader.hazards.filter(h=>h.raidEncounter).every(h=>shapes.some(shape=>JSON.stringify(shape)===JSON.stringify({...h.shape,color:h.color}))));
    const victim=f.games.find(game=>shapes.some(shape=>hitShape(shape,game.player)));
    if(victim){victim.player.invulnerable=0;const before=victim.player.hp;tick(f,DT*3);assert.ok(victim.player.hp<before);}
    else {Object.assign(f.games[0].player,{x:f.boss.x,y:f.boss.y+160});tick(f,DT*3);}
    assert.equal(f.boss.phase,'recover');assert.equal(f.boss.telegraphShapes.length,0);assert.equal(f.leader.hazards.filter(h=>h.raidEncounter).length,0);
  });
  test(`${dungeonId}: 65/30 percent thresholds select stronger next attacks without rewriting the live warning`,()=>{
    const f=fixture(dungeonId),base=clone(cast(f,0,1));
    f.boss.hp=f.boss.maxHp*.2;tick(f,.2);assert.deepEqual(f.instance.raidEncounter.pending.zones,base.zones);
    const second=clone(cast(f,0,.6));assert.equal(f.instance.raidEncounter.phase,1);
    const third=clone(cast(f,0,.25));assert.equal(f.instance.raidEncounter.phase,2);
    assert.ok(second.zones[0].damageFraction>base.zones[0].damageFraction);assert.ok(third.zones[0].damageFraction>second.zones[0].damageFraction);
    assert.ok(third.resolveAt-third.time>=1.2);
  });
  test(`${dungeonId}: active warning survives a real save import and malformed magic fields are rejected atomically`,()=>{
    const f=fixture(dungeonId);cast(f);tick(f,.3);const data=checkpoint(f),restored=new Game({storage:null});
    assert.equal(validateRaidEncounterSave(data.dungeon.raidEncounter,{...data.dungeon,enemies:data.dungeon.enemies}),true);
    restored.applySave(data);assert.deepEqual(restored.dungeonInstance.raidEncounter,data.dungeon.raidEncounter);
    const savedBoss=restored.world.enemies.find(enemy=>enemy.boss);assert.equal(savedBoss.phase,'windup');assert.equal(savedBoss.telegraphMechanic,'raid');
    assert.ok(Math.abs(savedBoss.attackTimer-(data.dungeon.raidEncounter.pending.resolveAt-data.dungeon.bossTime))<1e-7);
    const before=stableCapture(restored);
    for(const mutate of [
      save=>{save.dungeon.raidEncounter.pending.zones[0].damageFraction=999;},
      save=>{save.dungeon.raidEncounter.pending.zones[0].armorPierce=-1;},
      save=>{save.dungeon.raidEncounter.pending.zones[0].radius+=300;},
      save=>{save.dungeon.raidEncounter.pending.resolveAt+=500;},
      save=>{save.dungeon.raidEncounter.lastFrame.boss.maxHp+=1;},
      save=>{save.dungeon.raidEncounter.extraDamage=9000;},
    ]) {const bad=clone(data);mutate(bad);assert.throws(()=>restored.applySave(bad),/Raidchoreografie/);assert.equal(stableCapture(restored),before);}
  });
}

test('tank fronts select the guardian and hungry soul marks select the druid, independently of array order',()=>{
  const storm=fixture(),guardian=storm.games[0];Object.assign(guardian.player,{x:storm.boss.x,y:storm.boss.y+170});storm.games.reverse();
  const front=cast(storm);assert.ok(Math.abs(front.zones[0].angle-Math.PI/2)<1e-7);
  const night=fixture('nachtschlund'),druid=night.games.find(game=>game.player.classId==='druid');
  Object.assign(druid.player,{x:1250,y:1050});const souls=cast(night,1);assert.equal(souls.zones[0].x,druid.player.x);assert.equal(souls.zones[0].y,druid.player.y);
});

test('night wounds slow real input movement, reduce real party healing and retain their remaining durations through save import',()=>{
  const f=fixture('nachtschlund'),victim=f.games[0];Object.assign(victim.player,{x:f.boss.x,y:f.boss.y+160});
  const pending=cast(f);tick(f,pending.resolveAt-f.instance.bossTime+DT);
  assert.equal(victim.player.slowFactor,.75);assert.equal(victim.player.healingReduction,.6);
  const before=victim.player.hp,heal=f.games[1]._healAbilityAlly(victim,100);assert.ok(Math.abs(heal-40)<1e-7);assert.ok(Math.abs(victim.player.hp-before-40)<1e-7);
  const x=victim.player.x;victim.keys.add('d');victim.update(DT,{simulateWorld:false});victim.keys.clear();
  assert.ok(Math.abs(victim.player.x-x-victim.stats().speed*.75*DT)<1e-6);
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);
  assert.equal(restored.player.healingReduction,.6);assert.ok(Math.abs(restored.player.raidHealingUntil-restored.time-data.player.raidDebuffs.healingReduction.remaining)<1e-7);
  const bad=clone(data);bad.player.raidDebuffs.healingReduction.factor=.99;assert.throws(()=>restored.applySave(bad),/Raidwunde/);
});

test('shielded night hits still inflict their wound, while a rolled storm impact cannot attach a delayed wound',()=>{
  const night=fixture('nachtschlund'),tank=night.games[0];Object.assign(tank.player,{x:night.boss.x,y:night.boss.y+160,shield:10000,shieldUntil:100});
  const health=tank.player.hp,pending=cast(night);tick(night,pending.resolveAt-night.instance.bossTime+DT);
  assert.equal(tank.player.hp,health);assert.ok(tank.player.shield<10000);assert.equal(tank.player.healingReduction,.6);assert.equal(tank.player.slowFactor,.75);
  const storm=fixture(),roller=storm.games[2];Object.assign(roller.player,{x:1700,y:1050,invulnerable:30});
  const eye=cast(storm,1),before=roller.player.hp;tick(storm,eye.resolveAt-storm.instance.bossTime+DT);
  assert.equal(roller.player.hp,before);assert.ok(storm.instance.raidEncounter.dots.every(dot=>!dot.targetIds.includes(roller.player.id)));
});

for(const dungeonId of ['nachtschlund','weltenkern'])test(`${dungeonId}: real stationary objectives take damage, never move or pay rewards, and restored HP/deadlines remain canonical`,()=>{
  const f=fixture(dungeonId),pending=cast(f,1);f.games.forEach(game=>{game.player.invulnerable=30;});tick(f,pending.resolveAt-f.instance.bossTime+DT);
  const actors=f.instance.world.enemies.filter(enemy=>enemy.bossObjectiveId);assert.equal(actors.length,dungeonId==='nachtschlund'?2:4);
  const actor=actors[0],position={x:actor.x,y:actor.y},hp=actor.hp;Object.assign(f.leader.player,{x:actor.x-45,y:actor.y});
  assert.ok(f.leader.hitEnemy(actor,100,180)>0);assert.ok(actor.hp<hp);assert.deepEqual({x:actor.x,y:actor.y},position);
  tick(f,.4);assert.deepEqual({x:actor.x,y:actor.y},position,'Generic echo AI never moves the DPS objective');
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);const rebuilt=restored.world.enemies.find(enemy=>enemy.id===actor.id);
  assert.equal(rebuilt.hp,actor.hp);assert.equal(rebuilt.maxHp,actor.maxHp);assert.equal(rebuilt.expiresAt,actor.expiresAt);assert.equal(rebuilt.damage,0);assert.equal(rebuilt.xp,0);
  const before={gold:f.leader.player.gold,xp:f.leader.player.xp,kills:f.leader.kills,drops:f.leader.drops.length};
  f.leader.hitEnemy(actor,actor.hp*2,999);assert.equal(actor.alive,false);assert.equal(actor.respawnAt,Infinity);
  assert.deepEqual({gold:f.leader.player.gold,xp:f.leader.player.xp,kills:f.leader.kills,drops:f.leader.drops.length},before);
  const bad=clone(data);bad.dungeon.raidEncounter.objectives[actor.id].maxHp+=1;assert.throws(()=>restored.applySave(bad),/Raidchoreografie/);
});

test('neglected anchors warn first, resolved anchors disappear, and objective deaths suppress their explosion',()=>{
  const f=fixture('weltenkern'),pending=cast(f,1);f.games.forEach(game=>{game.player.invulnerable=60;});tick(f,pending.resolveAt-f.instance.bossTime+DT);
  const actors=f.instance.world.enemies.filter(enemy=>enemy.bossObjectiveId),killed=actors[0];f.leader.hitEnemy(killed,killed.hp*2,0);
  f.games.forEach(game=>{Object.assign(game.player,{x:f.boss.x,y:f.boss.y+120});});
  const expiry=Math.min(...actors.slice(1).map(actor=>actor.expiresAt));tick(f,expiry-f.instance.bossTime+DT);
  for(let waited=0;waited<4&&!f.instance.raidEncounter.pending;waited+=DT)tick(f);
  assert.equal(f.instance.raidEncounter.pending.mechanicId,'neglected-objectives');assert.equal(f.instance.raidEncounter.pending.zones.length,3);
  assert.ok(!f.instance.raidEncounter.pending.failureIds.includes(killed.id));
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);assert.equal(restored.dungeonInstance.raidEncounter.pending.name,'Überladener Anker');
  tick(f,1.6);assert.equal(f.instance.world.enemies.filter(enemy=>enemy.bossObjectiveId).length,0);
});

test('storm victims receive six real damage-over-time ticks and the stored tick schedule resumes without replaying consumed ticks',()=>{
  const f=fixture(),victim=f.games[2];Object.assign(victim.player,{x:1700,y:1050});
  const pending=cast(f,1);tick(f,pending.resolveAt-f.instance.bossTime+DT);
  const ticks=captureRaidEncounter(f.instance).dots;assert.equal(ticks.length,1);assert.ok(ticks[0].targetIds.includes(victim.player.id));
  const health=victim.player.hp;tick(f,1);assert.ok(victim.player.hp<health);
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);assert.deepEqual(restored.dungeonInstance.raidEncounter.dots,data.dungeon.raidEncounter.dots);
  const victimSave=JSON.parse(JSON.stringify(victim.capture())),resumedVictim=new Game({storage:null});resumedVictim.applySave(victimSave);resumedVictim.start();
  assert.equal(resumedVictim.player.id,victim.player.id);const resumeHealth=resumedVictim.player.hp;
  for(let time=0;time<1.05;time+=DT)resumedVictim.update(DT);
  assert.ok(resumedVictim.player.hp<resumeHealth,'The same imported actor actually receives its next stored DoT tick');
  const latest=clone(f.instance.raidEncounter.dots);f.instance.raidEncounter.nextCastAt=f.instance.bossTime+20;
  f.games.forEach(game=>{Object.assign(game.player,{x:victim.player.x,y:victim.player.y,invulnerable:20});});tick(f,6);assert.equal(f.instance.raidEncounter.dots.length,0);assert.ok(latest[0].nextAt>ticks[0].nextAt);assert.equal(f.instance.raidWipes||0,0);
});

test('full party wipe cancels all magic and resets boss HP/clock exactly once, while partial death does not bank a free reset',()=>{
  const f=fixture('nachtschlund');cast(f,1);f.boss.hp=f.boss.maxHp*.5;
  const saved=new Map();for(const game of f.games)game.storage={getItem:key=>saved.get(`${game.player.id}:${key}`)||null,setItem:(key,value)=>saved.set(`${game.player.id}:${key}`,value)};
  f.games[0].damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});tick(f);assert.equal(f.boss.hp,f.boss.maxHp*.5);assert.equal(f.instance.raidWipes||0,0);
  for(const game of f.games.slice(1))game.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});tick(f);
  assert.equal(f.boss.hp,f.boss.maxHp);assert.equal(f.boss.x,f.boss.homeX);assert.equal(f.instance.bossTime,0);assert.equal(f.instance.bossEngaged,false);assert.equal(f.instance.raidWipes,1);
  assert.equal(f.instance.raidEncounter.pending,null);assert.deepEqual(f.instance.raidEncounter.objectives,{});assert.equal(f.leader.hazards.length,0);tick(f);assert.equal(f.instance.raidWipes,1);
  assert.ok(f.games.every(game=>game.dead));
  const stored=JSON.parse(saved.get(`${f.leader.player.id}:emberfall.save.v1`));assert.equal(stored.dungeon.enemies.find(enemy=>enemy.id===f.boss.id).hp,f.boss.maxHp);assert.equal(stored.dungeon.raidWipes,1);assert.equal(stored.dungeon.bossTime,0);
});

test('both generic stack and spread live deadlines/marks survive the additive checkpoint contract',()=>{
  for(const kind of ['stack','spread']) {
    const f=fixture();f.instance.bossTime=kind==='spread'?13:1;f.instance.raidEncounter=null;
    Object.assign(f.games[0].player,{x:f.boss.x-50,y:f.boss.y});tick(f);
    assert.equal(f.boss.telegraphMechanic,kind);tick(f,.4);const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);
    const boss=restored.world.enemies.find(enemy=>enemy.boss);assert.equal(boss.telegraphMechanic,kind);assert.equal(boss.attackTimer,data.dungeon.pendingGeneric.remaining);
    if(kind==='spread')assert.equal(restored.hazards.filter(h=>h.kind==='warning').length,f.games.length);
    const bad=clone(data);bad.dungeon.pendingGeneric.duration=99;assert.throws(()=>restored.applySave(bad),/Raideinschlag/);
  }
});

test('legacy journeys without the additive raid state still import without resetting progression',()=>{
  const f=fixture('weltenkern');const data=checkpoint(f);delete data.dungeon.raidEncounter;delete data.dungeon.pendingGeneric;delete data.player.raidDebuffs;
  const restored=new Game({storage:null});restored.applySave(data);assert.equal(restored.player.level,100);assert.equal(restored.dungeonInstance.id,'weltenkern');assert.equal(restored.dungeonInstance.gateOpened,true);
  assert.equal(Object.keys(RAID_PROFILES).length,3);assert.ok(Object.values(RAID_PROFILES).every(profile=>profile.abilities.length===2&&profile.phases.length===3));
});

test('a close melee group cannot starve unique choreography by continually arming generic swings',()=>{
  const f=fixture();f.games.forEach(game=>{Object.assign(game.player,{x:f.boss.x-45,y:f.boss.y,invulnerable:30});});
  for(let time=0;time<8&&!f.instance.raidEncounter?.pending;time+=DT)tick(f);
  assert.equal(f.instance.raidEncounter.pending.mechanicId,'storm_cleaver');assert.ok(f.boss.attackTimer>1.9);assert.equal(f.instance.raidWipes||0,0);
});

for(const [hpFraction,phase,fraction,period] of [[.6,1,.35,10],[.25,2,.4,8]])test(`support pressure phase ${phase}: actual shields absorb the announced group hit, rolls cannot bypass it, and party healing matters`,()=>{
  const f=fixture('nachtschlund');f.instance.raidEncounter=createBossEncounter(f.boss.type,{tier:f.instance.tier,seed:f.instance.seed});
  Object.assign(f.instance.raidEncounter,{startedAt:0,nextCastAt:20,pressureAt:0});Object.assign(f.boss,{hp:f.boss.maxHp*hpFraction,phase:'idle',attackTimer:0});
  f.games.forEach(game=>{Object.assign(game.player,{invulnerable:20,shield:0});});
  const protectedHero=f.games[0];protectedHero.player.shield=protectedHero.stats().maxHp*.2;protectedHero.player.shieldUntil=100;
  const before=f.games.map(game=>game.player.hp);tick(f);const pending=f.instance.raidEncounter.pending;
  assert.equal(pending.mechanicId,'raid_pressure');assert.equal(pending.phase,phase);assert.equal(pending.zones[0].damageFraction,fraction);assert.ok(Math.abs(pending.resolveAt-pending.time-1.8)<1e-7);
  assert.ok(Math.abs(f.instance.raidEncounter.pressureAt-pending.time-period)<1e-7);assert.deepEqual(f.games.map(game=>game.player.hp),before);
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);assert.deepEqual(restored.dungeonInstance.raidEncounter.pending,pending);
  assert.equal(restored.dungeonInstance.raidEncounter.pressureAt,f.instance.raidEncounter.pressureAt);
  tick(f,pending.resolveAt-f.instance.bossTime+DT);
  for(let index=0;index<f.games.length;index++) {
    const game=f.games[index],expected=Math.round(game.stats().maxHp*fraction)-(index===0?before[0]*.2:0);
    assert.ok(Math.abs(before[index]-game.player.hp-expected)<1e-6,'Normal shields absorb pressure, real HP takes the remainder despite roll immunity');
  }
  const healer=f.games.find(game=>game.player.classId==='druid'),hurt=f.games[2],health=hurt.player.hp;
  Object.assign(healer.player,{x:hurt.player.x,y:hurt.player.y});assert.equal(healer.action('bolt'),true);assert.ok(hurt.player.hp>health,'A real class action restores missing party health');
  const bad=clone(data);bad.dungeon.raidEncounter.pending.zones[0].ignoreInvulnerability=false;assert.throws(()=>restored.applySave(bad),/Raidchoreografie/);
});

test('support pressure waits for an existing unique warning and its recovery instead of stacking two warnings',()=>{
  const f=fixture();const initial=cast(f);f.boss.hp=f.boss.maxHp*.6;f.instance.raidEncounter.pressureAt=0;
  f.games.forEach(game=>{Object.assign(game.player,{x:f.boss.x-170,y:f.boss.y,invulnerable:30});});
  tick(f,.5);assert.equal(f.instance.raidEncounter.pending.id,initial.id);assert.ok(f.leader.hazards.every(h=>!h.raidEncounter||h.mechanicId!=='raid_pressure'));
  tick(f,initial.resolveAt-f.instance.bossTime+DT);assert.equal(f.boss.phase,'recover');assert.equal(f.instance.raidEncounter.pending,null);
  for(let waited=0;waited<2&&!f.instance.raidEncounter.pending;waited+=DT)tick(f);
  assert.equal(f.instance.raidEncounter.pending.mechanicId,'raid_pressure');assert.equal(f.boss.telegraphShapes.length,1);
});

test('V8 raid HP is migrated by its fraction at every legal depth; V9 stamps prevent repeated multiplication',()=>{
  for(const [dungeonId,oldMaximum] of [['sturmzitadelle',125000],['nachtschlund',245000],['weltenkern',850000]]) {
    const f=fixture(dungeonId),data=checkpoint(f);delete data.dungeon.raidBalanceVersion;delete data.dungeon.raidEncounter;delete data.dungeon.pendingGeneric;
    // This genuinely represents V8: its small map had no V10 route actors.
    delete data.dungeon.layoutVersion;delete data.dungeon.routes;data.dungeon.enemies=data.dungeon.enemies.filter(enemy=>!enemy.id.includes(':route:'));
    const boss=data.dungeon.enemies.find(enemy=>enemy.id===`${dungeonId}:boss`);delete boss.maxHp;boss.hp=oldMaximum*.6;
    const restored=new Game({storage:null});restored.applySave(data);const current=restored.world.enemies.find(enemy=>enemy.boss);assert.equal(current.hp,current.maxHp*.6);
    const again=new Game({storage:null});again.applySave(JSON.parse(JSON.stringify(restored.capture())));assert.equal(again.world.enemies.find(enemy=>enemy.boss).hp,current.hp);
    const deep=clone(data);deep.dungeon.tier=12;deep.dungeon.affixState={nextRiftAt:18,nextEchoAt:26,rifts:[],wave:0,riftSerial:0};boss.hp=oldMaximum*.6;
    deep.dungeon.enemies.find(enemy=>enemy.id===boss.id).hp=Math.round(oldMaximum*(1+11*.38))*.6;restored.applySave(deep);
    const deepBoss=restored.world.enemies.find(enemy=>enemy.boss);assert.ok(Math.abs(deepBoss.hp-deepBoss.maxHp*.6)<1e-7);
    const forged=checkpoint(f);forged.dungeon.enemies.find(enemy=>enemy.boss===true||enemy.id===`${dungeonId}:boss`).maxHp=900000000;assert.throws(()=>again.applySave(forged),/Raid-Lebensbudget/);
  }
});

for(const [dungeonId,limit] of [['sturmzitadelle',1],['nachtschlund',2],['weltenkern',3]])test(`${dungeonId}: real E revives spend exactly the shared attempt budget and an exhausted attempt cannot restore a downed hero`,()=>{
  const f=fixture(dungeonId),rescuer=f.games[0],fallen=f.games.at(-1);Object.assign(rescuer.player,{x:1300,y:800});Object.assign(fallen.player,{x:1304,y:800});
  assert.equal(raidReviveSummary(f.instance).limit,limit);
  for(let used=0;used<limit;used++) {
    fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});assert.equal(fallen.dead,true);
    assert.equal(rescuer.action('interact'),true);assert.equal(fallen.dead,false);assert.equal(fallen.player.hp,fallen.stats().maxHp*.4);
    assert.equal(f.instance.raidRevivesUsed,used+1);
  }
  fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});const receipt=clone(fallen.deathPenalty),mana=rescuer.player.mana;
  const notices=[];rescuer.onNotice=text=>notices.push(text);
  assert.equal(rescuer.action('interact'),false);assert.equal(fallen.dead,true);assert.equal(fallen.player.hp,0);assert.equal(rescuer.player.mana,mana);
  assert.deepEqual(fallen.deathPenalty,receipt);assert.ok(notices.some(text=>text.includes('Keine Kampfbelebungen')));
  const data=checkpoint(f),restored=new Game({storage:null});restored.applySave(data);assert.equal(restored.dungeonInstance.raidRevivesUsed,limit);
  for(const invalid of [-1,.5,limit+1]){const bad=clone(data);bad.dungeon.raidRevivesUsed=invalid;const before=stableCapture(restored);assert.throws(()=>restored.applySave(bad),/Kampfbelebungen/);assert.equal(stableCapture(restored),before);}
  for(const game of f.games.filter(game=>!game.dead))game.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});tick(f);
  assert.equal(f.instance.raidRevivesUsed,0);assert.equal(f.instance.bossEngaged,false);assert.equal(fallen.respawn(),true);assert.equal(fallen.dead,false);
});

test('learned resurrection and E consume the same pool, while exhaustion spends neither mana nor cooldown',()=>{
  const f=fixture('nachtschlund'),druid=f.games.find(game=>game.classId==='druid'),fallen=f.games.at(-1),rescuer=f.games[0];
  Object.assign(fallen.player,{x:1304,y:800});Object.assign(rescuer.player,{x:1300,y:800});Object.assign(druid.player,{x:1350,y:800});
  druid.player.skillPoints=12;for(const id of ['druid_vines','druid_grove','druid_rebirth'])assert.equal(druid.learnAbility(id),true);
  assert.equal(druid.setAbilityLoadout(0,'druid_rebirth'),true);
  fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});const mana=druid.player.mana;
  assert.equal(druid.useLearnedAbility(0),true);assert.equal(fallen.dead,false);assert.equal(fallen.player.hp,fallen.stats().maxHp*.25);assert.equal(druid.player.mana,mana-40);assert.equal(f.instance.raidRevivesUsed,1);
  fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});assert.equal(rescuer.action('interact'),true);assert.equal(f.instance.raidRevivesUsed,2);
  fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});
  // Declare a ready spell to isolate the shared revive-budget preflight from
  // the independent cooldown gate; the real action must charge neither value.
  druid.cooldowns['ability:druid_rebirth']=0;const exhaustedMana=druid.player.mana;
  assert.equal(druid.useLearnedAbility(0),false);assert.equal(druid.player.mana,exhaustedMana);assert.equal(druid.cooldowns['ability:druid_rebirth'],0);assert.equal(fallen.dead,true);
});

test('self-return is denied in a live raid attempt and its exact guard remains true for a culled network boss',()=>{
  const f=fixture(),fallen=f.games[1];fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});const before=clone(fallen.capture());
  assert.equal(raidReturnBlocked(fallen),true);assert.equal(fallen.respawn(),false);assert.equal(fallen.player.hp,0);assert.equal(fallen.player.mana,before.player.mana);
  const checkpoint=f.leader.captureDungeonCheckpoint(),view={dungeonInstance:{...f.instance,world:{enemies:[]}},networkDungeonCheckpoint:checkpoint};assert.equal(raidReturnBlocked(view),true);
  f.instance.bossEngaged=false;assert.equal(raidReturnBlocked(fallen),false);assert.equal(fallen.respawn(),true);
});

test('trusted authority restore preserves a downed hero and receipt, while ordinary offline import still performs the safe rescue',()=>{
  const f=fixture('nachtschlund'),fallen=f.games[2];Object.assign(fallen.player,{x:1380,y:1010});fallen.damagePlayer(1e7,{trueDamage:true,ignoreInvulnerability:true});
  const data=JSON.parse(JSON.stringify(fallen.capture())),authority=new Game({storage:null});authority.applySave(data,{preserveDowned:true});
  assert.equal(authority.dead,true);assert.equal(authority.paused,true);assert.equal(authority.player.hp,0);assert.equal(authority.player.x,data.player.x);assert.equal(authority.player.y,data.player.y);
  assert.equal(authority.player.gold,data.player.gold);assert.deepEqual(authority.deathPenalty,data.deathPenalty);assert.equal(authority.deathPenalty.lastReceipt.pendingRescue,true);
  assert.equal(authority.respawn(),false);
  const offline=new Game({storage:null});offline.applySave(data);assert.equal(offline.dead,false);assert.equal(offline.player.hp,offline.stats().maxHp);assert.equal(offline.player.x,offline.dungeonInstance.spawn.x);
  assert.equal(offline.deathPenalty.deaths,data.deathPenalty.deaths);assert.equal(offline.player.gold,data.player.gold);assert.equal(offline.deathPenalty.lastReceipt.pendingRescue,false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DUNGEONS, DUNGEON_ENEMIES, createDungeon } from '../src/dungeons.js';
import { updateBestiaryEnemy } from '../src/enemy-ai.js';
import { createBestiaryEnemy } from '../src/bestiary.js';

const DT=.04;
function dungeonArena(id='uhrwerk') {
  const game=new Game({storage:null,random:()=>.5});game.selectClass('ranger');game.start();
  const definition=DUNGEONS.find(d=>d.id===id),instance=createDungeon(id),enemy=instance.world.enemies.find(e=>e.boss);
  game.player.level=definition.level;game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
  game.world=instance.world;game.dungeonInstance=instance;game.npcs=[];game.world.enemies=[enemy];
  instance.gateOpened=true;const gate=game.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
  game.player.x=enemy.x+210;game.player.y=enemy.y;game.player.invulnerable=0;
  return {game,enemy,definition,def:DUNGEON_ENEMIES[enemy.type]};
}
function advance(game,seconds){for(let left=seconds;left>1e-8;left-=DT)game.update(Math.min(DT,left));}
function executeWarning(game,enemy){const duration=enemy.attackTimer;game.time+=duration+.001;game.updateEnemies(duration+.001);}
function nextWarning(game,enemy){const recovery=enemy.attackTimer;game.time+=recovery+.001;game.updateEnemies(recovery+.001);}

test('all five solo dungeon bosses announce real ranged attacks before damaging a hero at 210 pixels',()=>{
  for(const definition of DUNGEONS.filter(d=>!d.raid)) {
    const {game,enemy,def}=dungeonArena(definition.id),hp=game.player.hp;
    assert.equal(updateBestiaryEnemy(game,enemy,def,DT,[game]),true);
    assert.equal(enemy.phase,'windup');assert.equal(enemy.telegraphPattern,'ring');
    assert.ok(enemy.telegraphDuration>=1.3);assert.ok(enemy.telegraphAttackRange>=210&&enemy.telegraphAttackRange<=650);
    assert.equal(enemy.telegraphProjectileRange,600);assert.equal(enemy.telegraphProjectileCount,8);
    assert.equal(game.player.hp,hp,'A warning itself never damages');
    advance(game,2.7);
    assert.ok(enemy.cycle>=1,`${definition.id} cannot remain in a chase-only ranged fight`);
    assert.ok(game.player.hp<hp,`${definition.id}'s visible aimed ring must produce a real stationary-target hit`);
  }
});

test('a native side step during a dungeon ring warning avoids its actual volley',()=>{
  const standing=dungeonArena(),moving=dungeonArena(),standingHp=standing.game.player.hp,movingHp=moving.game.player.hp;
  standing.game.update(DT);moving.game.update(DT);
  const lockedAngle=moving.enemy.telegraphAngle;
  moving.game.keys.add('s');advance(moving.game,.6);moving.game.keys.clear();
  assert.equal(moving.enemy.telegraphAngle,lockedAngle);assert.ok(moving.game.player.y-moving.enemy.y>=100);
  advance(moving.game,2.06);advance(standing.game,2.66);
  assert.ok(standing.game.player.hp<standingHp);assert.equal(moving.game.player.hp,movingHp);
  assert.equal(standing.enemy.cycle,moving.enemy.cycle,'Walking changes the hit outcome, not the completed attack budget');
});

test('dungeon health thresholds change only the next warning and never inject a champion volley',()=>{
  const {game,enemy}=dungeonArena();game.updateEnemies(DT);
  const warning={pattern:enemy.telegraphPattern,count:enemy.telegraphProjectileCount,angle:enemy.telegraphAngle,range:enemy.telegraphRange,speed:enemy.telegraphProjectileSpeed,duration:enemy.telegraphDuration};
  enemy.hp=enemy.maxHp*.6;game.updateEnemies(DT);
  assert.deepEqual({pattern:enemy.telegraphPattern,count:enemy.telegraphProjectileCount,angle:enemy.telegraphAngle,range:enemy.telegraphRange,speed:enemy.telegraphProjectileSpeed,duration:enemy.telegraphDuration},warning);
  executeWarning(game,enemy);assert.equal(game.projectiles.length,8,'The frozen opening executes exactly its eight warned rays');
  assert.equal(enemy.telegraphExtraFan,null);assert.equal(enemy.pressurePhase,undefined);
  nextWarning(game,enemy);assert.equal(enemy.dungeonPhase,2);assert.equal(enemy.telegraphPattern,'fan');
  assert.equal(enemy.telegraphProjectileCount,5);assert.equal(enemy.telegraphProjectileSpread,1.1);assert.equal(enemy.telegraphProjectileSpeed,260);
  const fanAngle=enemy.telegraphAngle;enemy.hp=enemy.maxHp*.2;game.updateEnemies(DT);
  assert.equal(enemy.telegraphPattern,'fan');assert.equal(enemy.telegraphAngle,fanAngle);
  const before=game.projectiles.length;executeWarning(game,enemy);assert.equal(game.projectiles.length-before,5);
  nextWarning(game,enemy);assert.equal(enemy.dungeonPhase,3);assert.equal(enemy.telegraphPattern,'hex');assert.equal(enemy.telegraphRadius,85);
});

test('the final dungeon mark freezes a saved player point and walking out avoids the real explosion',()=>{
  for(const dodge of [false,true]) {
    const {game,enemy}=dungeonArena();enemy.hp=enemy.maxHp*.2;const hp=game.player.hp;
    game.update(DT);const center={x:enemy.telegraphX,y:enemy.telegraphY};
    assert.equal(enemy.telegraphPattern,'hex');assert.ok(enemy.telegraphDuration>=1.4);
    if(dodge){game.keys.add('s');advance(game,.7);game.keys.clear();}
    assert.deepEqual({x:enemy.telegraphX,y:enemy.telegraphY},center);
    advance(game,dodge?.75:1.45);assert.equal(enemy.cycle,1);
    if(dodge)assert.equal(game.player.hp,hp);else assert.ok(game.player.hp<hp);
  }
});

test('slowing a dungeon boss affects pursuit while preserving its complete warning clock and shot speed',()=>{
  const normal=dungeonArena(),slowed=dungeonArena();slowed.enemy.slowUntil=10;slowed.enemy.slowFactor=.15;
  normal.game.update(DT);slowed.game.update(DT);
  for(let frame=0;frame<30;frame++){
    normal.game.update(DT);slowed.game.update(DT);
    assert.equal(normal.enemy.attackTimer,slowed.enemy.attackTimer);assert.equal(normal.enemy.phase,slowed.enemy.phase);
  }
  advance(normal.game,.2);advance(slowed.game,.2);assert.equal(normal.enemy.cycle,slowed.enemy.cycle);
  assert.deepEqual(normal.game.projectiles.map(p=>p.speed),slowed.game.projectiles.map(p=>p.speed));
  const farNormal=dungeonArena(),farSlow=dungeonArena();farNormal.game.player.x=farNormal.enemy.x;farSlow.game.player.x=farSlow.enemy.x;
  farNormal.game.player.y+=520;farSlow.game.player.y+=520;farSlow.enemy.slowUntil=10;farSlow.enemy.slowFactor=.15;
  farNormal.enemy.aggro=farSlow.enemy.aggro=true;
  const origin=farNormal.enemy.y;advance(farNormal.game,.4);advance(farSlow.game,.4);
  assert.ok(farSlow.enemy.y-origin>0);assert.ok(farNormal.enemy.y-origin>(farSlow.enemy.y-origin)*5,'Control retains a meaningful chase slowdown');
});

test('ordinary melee, marked hex and stepped charge protect a village ally while still hitting their outside target',()=>{
  for(const [type,x] of [['wolf',980],['gallows_cultist',1050],['bone_hound',1050]]) {
    const game=new Game({storage:null,random:()=>.5}),safe=new Game({storage:null,random:()=>.5});game.start();safe.start();
    game.world.trees=[];game.world.rocks=[];game.world.structures=[];game.world.shrines=[];safe.world=game.world;
    Object.assign(game.player,{id:'outside',level:20,x:965,y:1250});Object.assign(safe.player,{id:'inside',level:20,x:930,y:1250});
    game.player.hp=game.stats().maxHp;safe.player.hp=safe.stats().maxHp;const outsideHp=game.player.hp,safeHp=safe.player.hp;
    const enemy=createBestiaryEnemy(type,`safe-area-${type}`,x,1250,{level:20});enemy.hp--;game.world.enemies=[enemy];
    assert.equal(game.inSettlement(),false);assert.equal(safe.inSettlement(),true);
    for(let frame=0;frame<40;frame++){game.update(DT,{simulateWorld:false});safe.update(DT,{simulateWorld:false});game.updateWorld(DT,[game,safe]);}
    assert.ok(game.player.hp<outsideHp,`${type} still delivers its real outside hit`);
    assert.equal(safe.player.hp,safeHp,`${type} cannot damage the protected ally inside its actual hit area`);
    assert.ok(!safe.player.afflictions?.length);assert.ok(!(safe.player.slowUntil>safe.time));
  }
});

test('all thirty dungeon depths retain their scaling and every V9 raid keeps its group mechanics path',()=>{
  for(const [id,hp,damage,required] of [['sturmzitadelle',500000,205,3],['nachtschlund',980000,255,4],['weltenkern',1700000,310,8]]) {
    const definition=DUNGEONS.find(d=>d.id===id),def=DUNGEON_ENEMIES[definition.boss];assert.equal(def.combat,undefined);assert.equal(def.combatPhases,undefined);
    assert.equal(def.minPlayers,required);assert.equal(def.mechanics.shield.vulnerableSeconds,9);assert.equal(def.mechanics.stack.minPlayers,required===8?4:2);
    for(let tier=1;tier<=30;tier++){
      const instance=createDungeon(id,{tier,partySize:required}),boss=instance.world.enemies.find(e=>e.boss);
      assert.equal(boss.hp,Math.round(hp*(1+(tier-1)*.38)));assert.equal(boss.damage,Math.round(damage*(1+(tier-1)*.075)));
      assert.equal(boss.shielded,true);assert.equal(boss.level,definition.level);
    }
  }
  for(const definition of DUNGEONS.filter(d=>!d.raid))for(let tier=1;tier<=30;tier++){
    const boss=createDungeon(definition.id,{tier}).world.enemies.find(e=>e.boss),def=DUNGEON_ENEMIES[definition.boss];
    assert.equal(boss.hp,Math.round(def.hp*(1+(tier-1)*.38)));assert.equal(boss.damage,Math.round(def.damage*(1+(tier-1)*.075)));
    assert.equal(boss.level,definition.level);assert.ok(def.combatPhases.every(phase=>phase.windup>=1.3));
  }
});

test('guards use their actual dungeon level and retain their existing health, loot and depth curve',()=>{
  assert.equal(DUNGEON_ENEMIES.echo_guard.damage,56);assert.equal(DUNGEON_ENEMIES.echo_guard.level,40);
  for(const definition of DUNGEONS)for(let tier=1;tier<=30;tier++){
    const guard=createDungeon(definition.id,{tier}).world.enemies.find(e=>!e.boss),baseDamage=Math.round(56*(.4+definition.level*.015));
    assert.equal(guard.damage,Math.round(baseDamage*(1+(tier-1)*.075)));
    assert.equal(guard.hp,Math.round(650*(1+(tier-1)*.38)*(.5+definition.level/40)));
    assert.equal(guard.level,definition.level);assert.equal(guard.lootTier,tier);
  }
  const early=createDungeon('wurzelgewoelbe').world.enemies,late=createDungeon('weltenkern').world.enemies;
  assert.equal(early.find(e=>!e.boss).damage,35);assert.ok(early.find(e=>!e.boss).damage<early.find(e=>e.boss).damage);
  assert.equal(late.find(e=>!e.boss).damage,106);assert.ok(late.find(e=>!e.boss).damage<late.find(e=>e.boss).damage);
});

test('real ordinary and curated area hits carry their attacker ID into the shared incoming-damage hook',async()=>{
  const {updateEncounterBoss}=await import('../src/encounter-boss-ai.js'),{NAMED_BOSS_ENEMIES}=await import('../src/encounter-content.js');
  const {game,enemy}=dungeonArena();enemy.hp=enemy.maxHp*.2;
  const hits=[],native=game.damagePlayer.bind(game);game.damagePlayer=(amount,options)=>{hits.push(options);return native(amount,options);};
  game.update(DT);advance(game,1.45);assert.ok(hits.length>0);assert.ok(hits.every(hit=>hit.attackerId===enemy.id));
  hits.length=0;const def=NAMED_BOSS_ENEMIES.sivra_whitehorn,curated={id:'native-sivra-provenance',type:def.id,x:1470,y:780,homeX:1470,homeY:780,hp:def.hp,maxHp:def.hp,level:def.level,damage:def.damage,alive:true,phase:'idle',attackTimer:0};
  game.world.enemies=[curated];game.player.x=1590;game.player.y=780;game.player.invulnerable=0;
  updateEncounterBoss(game,curated,def,DT,[game]);game.time+=curated.attackTimer+.001;updateEncounterBoss(game,curated,def,curated.attackTimer+.001,[game]);
  assert.ok(hits.length>0);assert.ok(hits.every(hit=>hit.attackerId===curated.id));
});

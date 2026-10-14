import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DUNGEONS, DUNGEON_ENEMIES, createDungeon, updateDungeon } from '../src/dungeons.js';
import { normalEnemyStats } from '../src/balance.js';
import { captureDungeonRoutes, validateDungeonRouteSave, restoreDungeonRoutes, interactDungeonRoute, updateDungeonRoutes, routeHazardShapes, dungeonRouteSummary, dungeonRouteRewardCandidates, isInBossArena } from '../src/dungeon-routes.js';
import { flood, solve, solveRouteForGeometry } from './scripts/dungeon-route-audit.mjs';

const clone=x=>JSON.parse(JSON.stringify(x));
const humans=(p={})=>[{...p,id:'walker',hp:p.hp??100,human:p.human??true}];
const enemySave=instance=>instance.world.enemies.map(e=>({id:e.id,type:e.type,level:e.level,hp:e.hp,maxHp:e.maxHp,alive:e.alive,x:e.x,y:e.y}));
const context=instance=>({id:instance.id,tier:instance.tier,seed:instance.seed,layoutVersion:instance.layoutVersion,enemies:enemySave(instance),openedChests:instance.world.chests.filter(c=>c.opened).map(c=>c.id)});
const chamber=(instance,kind,stage='A')=>instance.routes.chambers.find(c=>c.kind===kind&&c.stage===stage);
function tick(instance,players,seconds){const events=[];for(let i=0;i<Math.ceil(seconds/.04);i++)events.push(...updateDungeonRoutes(instance,.04,players));return events;}

test('new journeys keep all eight original arenas, boss budgets and original puzzle coordinates',()=>{
  for(const definition of DUNGEONS){
    const legacy=createDungeon(definition.id,{layoutVersion:1}),journey=createDungeon(definition.id);
    assert.equal(legacy.world.height,1500);assert.equal(journey.world.height,3840);assert.equal(journey.layoutVersion,2);
    assert.deepEqual(journey.world.enemies.find(e=>e.boss),legacy.world.enemies.find(e=>e.boss));
    assert.deepEqual(journey.puzzles,legacy.puzzles);
    assert.deepEqual(journey.world.puzzleObjects.filter(o=>!o.routeChamberId&&!o.routeGuide),legacy.world.puzzleObjects);
    assert.deepEqual(journey.routes.chambers.filter(c=>c.stage==='A').map(c=>c.kind).sort(),['martial','relay','tactical']);
    assert.deepEqual(journey.routes.chambers.filter(c=>c.stage==='B').map(c=>c.kind).sort(),['martial','relay','tactical']);
    const game=new Game({storage:null});game.world=journey.world;
    assert.equal(game.collides(journey.spawn.x,journey.spawn.y,12),false);
    for(const guard of journey.world.enemies.filter(e=>e.routeGuard))assert.equal(game.collides(guard.x,guard.y,10),false);
  }
});

test('the recurring guard species pays its actual dungeon level and proportional depth premium, without changing authored boss XP',()=>{
  for(const definition of DUNGEONS)for(const tier of [1,4,8,30]){
    const instance=createDungeon(definition.id,{tier}),guard=instance.world.enemies.find(e=>e.type==='echo_guard'&&!e.boss),boss=instance.world.enemies.find(e=>e.boss),premium=1+(tier-1)*.18;
    assert.equal(guard.xp,Math.round(normalEnemyStats(definition.level).xp*premium));
    assert.equal(guard.gold,Math.round(Math.round(5+definition.level*2.5)*premium));
    assert.equal(boss.xp,Math.round(DUNGEON_ENEMIES[definition.boss].xp*premium));
    assert.equal(boss.gold,Math.round(DUNGEON_ENEMIES[definition.boss].gold*premium));
  }
  assert.equal(createDungeon('wurzelgewoelbe').world.enemies.find(e=>e.type==='echo_guard').xp,553);
  assert.equal(createDungeon('sturmzitadelle').world.enemies.find(e=>e.type==='echo_guard').xp,normalEnemyStats(75).xp);
});

test('route RNG reproduces geometry and different seeds really change chamber positions and paths',()=>{
  const layouts=new Set();
  for(let seed=0;seed<24;seed++){
    const a=createDungeon('salzarchiv',{seed}),b=createDungeon('salzarchiv',{seed});assert.deepEqual(a,b);
    layouts.add(JSON.stringify(a.routes.chambers.map(c=>({lane:c.lane,kind:c.kind,variant:c.variant,beacons:c.beacons}))));
  }
  assert.ok(layouts.size>=20);
  assert.throws(()=>createDungeon('uhrwerk',{layoutVersion:3}),RangeError);
});

test('each first-stage route and each second-stage route independently admits the native player to old puzzles and boss',()=>{
  for(const kind of ['martial','relay','tactical'])for(const secondKind of ['martial','relay','tactical']) {
    const instance=createDungeon('wurzelgewoelbe',{seed:17}),initial=flood(instance),b=chamber(instance,secondKind,'B');
    assert.equal(initial.contact({x:b.centerX,y:b.y+400},20),undefined);
    assert.equal(initial.contact(instance.world.enemies.find(e=>e.boss),20),undefined);
    solveRouteForGeometry(instance,chamber(instance,kind));
    assert.notEqual(flood(instance).contact({x:b.centerX,y:b.y+400},20),undefined);
    solveRouteForGeometry(instance,b);const beforeBoss=flood(instance);
    for(const puzzle of instance.world.puzzleObjects.filter(o=>o.puzzle&&!o.kind.startsWith('boss')))beforeBoss.walkTo(puzzle,85);
    assert.equal(dungeonRouteSummary(instance).sigils,2);
    assert.equal(beforeBoss.contact(instance.world.enemies.find(e=>e.boss),20),undefined);
    solve(instance);flood(instance).walkTo(instance.world.enemies.find(e=>e.boss),20);
    flood(instance).walkTo(instance.exit,20);
  }
});

test('martial success requires every canonical guard, opens its own cache once and never respawns defeated route actors',()=>{
  const instance=createDungeon('sturmzitadelle'),c=chamber(instance,'martial'),guards=c.enemyIds.map(id=>instance.world.enemies.find(e=>e.id===id));
  assert.equal(interactDungeonRoute(instance,c.coreId,humans({x:c.centerX,y:c.y+64})).success,false);
  assert.equal(instance.world.chests.find(ch=>ch.routeChamberId===c.id).locked,true);
  guards.slice(0,2).forEach(g=>{g.hp=0;g.alive=false;});assert.equal(tick(instance,[],1).some(e=>e.event==='dungeon-route'),false);
  guards[2].hp=0;guards[2].alive=false;const event=tick(instance,[],.1).find(e=>e.event==='dungeon-route');
  assert.ok(event);assert.deepEqual(event.routeReward,{dust:3});assert.equal(event.target,c.id);
  assert.equal(instance.world.chests.find(ch=>ch.routeChamberId===c.id).locked,false);
  assert.equal(tick(instance,[],1).some(e=>e.event==='dungeon-route'),false);
  assert.ok(guards.every(g=>g.challengeId===c.id));
});

test('wrong relay glyph resets progress and different humans cannot complete the same carrier journey',()=>{
  const instance=createDungeon('uhrwerk'),c=chamber(instance,'relay'),first=c.beacons[0],wrong=c.beacons[2];
  assert.equal(interactDungeonRoute(instance,wrong.id,humans(wrong)).success,false);assert.equal(instance.routes.relay,null);
  assert.equal(interactDungeonRoute(instance,first.id,humans(first)).success,true);tick(instance,humans(first),2.04);
  assert.equal(instance.routes.relay.step,1);
  const next=c.beacons[1];assert.equal(interactDungeonRoute(instance,next.id,[{...next,id:'different-person',hp:100}]).success,false);
  assert.equal(instance.routes.relay.step,1);
  assert.equal(interactDungeonRoute(instance,wrong.id,humans(wrong)).success,false);assert.equal(instance.routes.relay,null);
  assert.equal(instance.routes.completed.includes(c.id),false);
});

test('relay requires real proximity and continuous holds, times out and permits immediate retry',()=>{
  const instance=createDungeon('uhrwerk'),c=chamber(instance,'relay'),first=c.beacons[0];
  assert.equal(interactDungeonRoute(instance,first.id,humans({x:first.x+90,y:first.y})).success,false);
  assert.equal(interactDungeonRoute(instance,first.id,humans(first)).success,true);
  tick(instance,humans(first),1);assert.equal(instance.routes.relay.hold,1);
  tick(instance,humans({x:first.x+35,y:first.y}),.1);assert.equal(instance.routes.relay.hold,0);
  tick(instance,humans(first),17);assert.equal(instance.routes.relay,null);
  assert.equal(interactDungeonRoute(instance,first.id,humans(first)).success,true);
  tick(instance,[{...first,id:'walker',hp:0,downed:true}],.04);assert.equal(instance.routes.relay,null);
  solveRouteForGeometry(instance,c);assert.ok(instance.routes.completed.includes(c.id));
});

test('all authored relay orders fit their deadline with native minimum-speed walking and no roll',()=>{
  for(const definition of DUNGEONS)for(const seed of [0,17,826535]) {
    const instance=createDungeon(definition.id,{seed}),game=new Game({storage:null});
    game.start();game.world=instance.world;game.dungeonInstance=instance;Object.assign(game.player,{...instance.spawn,id:'slow-native-walker'});
    const nativeStats=game.stats.bind(game);game.stats=()=>({...nativeStats(),speed:120});
    const step=(point,dt=.04)=>{
      game.keys.clear();
      if(point){const dx=point.x-game.player.x,dy=point.y-game.player.y;
        if(Math.abs(dx)>=Math.abs(dy)&&Math.abs(dx)>1)game.keys.add(dx>0?'d':'a');else if(Math.abs(dy)>1)game.keys.add(dy>0?'s':'w');
        dt=Math.min(dt,Math.max(.001,Math.max(Math.abs(dx),Math.abs(dy))/120));
      }
      game.update(dt,{simulateWorld:false});updateDungeonRoutes(instance,dt,[{...game.player,human:true,alive:true}]);
    };
    const go=object=>{
      const points=flood(instance,game.player).routeTo(object,20);
      for(const p of points){let ticks=0;while(Math.hypot(game.player.x-p.x,game.player.y-p.y)>3&&ticks++<100)step(p);assert.ok(ticks<100,'Each physical waypoint is reached with ordinary digital keys');}
      assert.ok(Math.hypot(game.player.x-object.x,game.player.y-object.y)<=25);
    };
    for(const stage of ['A','B']) {
      const c=chamber(instance,'relay',stage);
      for(const beacon of c.beacons){go(beacon);assert.equal(interactDungeonRoute(instance,beacon.id,[{...game.player,human:true,alive:true}]).success,true);for(let i=0;i<51;i++)step(null);}
      assert.ok(instance.routes.completed.includes(c.id),`${definition.id}:${seed}:${stage} fits at speed120`);
    }
  }
});

test('a completed relay preserves progress, cannot pay again and leaves every other first-stage branch accessible',()=>{
  const instance=createDungeon('nachtschlund'),c=chamber(instance,'relay');solveRouteForGeometry(instance,c);
  assert.equal(dungeonRouteSummary(instance).sigils,1);
  assert.equal(tick(instance,[],1).some(e=>e.event==='dungeon-route'),false);
  const mesh=flood(instance);for(const sibling of instance.routes.chambers.filter(c=>c.stage==='A'))mesh.walkTo({x:sibling.centerX,y:sibling.y+320},20);
});

test('tactical strips warn before actual native shapes, hit once per activation and freeze without a living occupant',()=>{
  const instance=createDungeon('frostkathedrale'),c=chamber(instance,'tactical');c.variant=0;
  const p=humans({x:c.centerX,y:c.y+128}),warnings=tick(instance,p,1.2);
  assert.ok(warnings.some(e=>e.hazards?.some(h=>h.windup&&h.shape.kind==='segment')));
  assert.equal(warnings.some(e=>e.damageEvents?.some(d=>d.actorId==='walker')),false);
  const hits=tick(instance,p,2.1).flatMap(e=>e.damageEvents||[]);assert.equal(hits.filter(d=>d.shape.y1===c.y+128).length,1);
  assert.equal(hits[0].damageFraction,.13);assert.equal(hits[0].attackerLevel,65);
  const time=instance.routes.hazardClocks[c.id];tick(instance,[],10);assert.equal(instance.routes.hazardClocks[c.id],time);
  const retry=tick(instance,p,5).flatMap(e=>e.damageEvents||[]);assert.ok(retry.some(d=>d.shape.y1===c.y+128));
  assert.equal(instance.routes.completed.includes(c.id),false);
});

test('tactical endpoint needs two seconds of a living human, summons and duplicate IDs do not progress it',()=>{
  const instance=createDungeon('frostkathedrale'),c=chamber(instance,'tactical'),core=instance.world.puzzleObjects.find(o=>o.id===c.coreId);
  tick(instance,[{...core,id:'summon',hp:100,human:false}],3);assert.equal(instance.routes.completed.includes(c.id),false);
  tick(instance,humans(core),1);tick(instance,humans({...core,x:core.x+40}),.04);assert.equal(instance.routes.tacticalHolds[c.id],0);
  const events=tick(instance,[...humans(core),...humans(core)],2.1);assert.equal(events.filter(e=>e.event==='dungeon-route').length,1);
});

test('southern right-lane humans never engage a boss, satisfy a raid shield or receive arena membership',()=>{
  const instance=createDungeon('weltenkern');solve(instance);
  const distant=Array.from({length:8},(_,i)=>({id:`real-human-${i}`,hp:100,x:1472,y:3000+i}));
  assert.ok(distant.every(p=>!isInBossArena(instance,p)));
  for(let i=0;i<80;i++)updateDungeon(instance,.04,distant);
  assert.equal(instance.bossEngaged,false);assert.equal(instance.bossTime,0);
  assert.equal(instance.world.enemies.find(e=>e.boss).insufficientParty,true);
  assert.equal(isInBossArena(instance,{x:1470,y:780}),true);
});

test('raid sigils wait for a real boss completion, cap at four and late solo candidates require depth four',()=>{
  const raid=createDungeon('sturmzitadelle');raid.routes.completed=raid.routes.chambers.map(c=>c.id);
  assert.deepEqual(dungeonRouteRewardCandidates(raid),[]);raid.bossDefeated=true;
  const rewards=dungeonRouteRewardCandidates(raid);assert.equal(rewards.length,4);assert.equal(new Set(rewards.map(r=>r.id)).size,4);assert.ok(rewards.every(r=>r.raidSigils===1));
  const early=createDungeon('wurzelgewoelbe',{tier:4});early.bossDefeated=true;early.routes.completed=early.routes.chambers.map(c=>c.id);assert.deepEqual(dungeonRouteRewardCandidates(early),[]);
  const shallow=createDungeon('frostkathedrale');shallow.bossDefeated=true;shallow.routes.completed=shallow.routes.chambers.map(c=>c.id);assert.deepEqual(dungeonRouteRewardCandidates(shallow),[]);
  const deep=createDungeon('frostkathedrale',{tier:4});deep.bossDefeated=true;deep.routes.completed=deep.routes.chambers.map(c=>c.id);assert.equal(dungeonRouteRewardCandidates(deep).length,4);
});

test('route checkpoint restores valid relay deadlines, chamber gates and unopened earned caches',()=>{
  const original=createDungeon('salzarchiv',{seed:51,tier:4}),a=chamber(original,'relay');solveRouteForGeometry(original,a);
  const b=chamber(original,'relay','B'),first=b.beacons[0];assert.equal(interactDungeonRoute(original,first.id,humans(first)).success,true);tick(original,humans(first),.8);
  const saved=captureDungeonRoutes(original),c=context(original);assert.equal(validateDungeonRouteSave(saved,c),true);
  const restored=createDungeon(original.id,{seed:original.seed,tier:original.tier});restoreDungeonRoutes(restored,saved);
  assert.deepEqual(captureDungeonRoutes(restored),saved);assert.equal(restored.world.structures.filter(s=>s.routeStage==='A').every(s=>!s.blocking),true);
  assert.equal(restored.world.structures.filter(s=>s.routeStage==='B').every(s=>s.blocking),true);
  assert.equal(restored.world.chests.find(ch=>ch.routeChamberId===a.id).locked,false);
});

test('native knockback preserves live and defeated guard checkpoint positions at walls',()=>{
  const instance=createDungeon('wurzelgewoelbe'),c=chamber(instance,'martial'),guard=instance.world.enemies.find(e=>e.id===c.enemyIds[0]),game=new Game({storage:null,random:()=>.5});
  game.world=instance.world;game.dungeonInstance=instance;
  game.move(guard,-600,0,10);assert.equal(game.collides(guard.x,guard.y,10),false);
  Object.assign(game.player,{x:guard.x+120,y:guard.y});
  game.hitEnemy(guard,1,180);assert.equal(game.collides(guard.x,guard.y,10),false);
  assert.equal(validateDungeonRouteSave(captureDungeonRoutes(instance),context(instance)),true);
  game.hitEnemy(guard,guard.maxHp*10,180);assert.equal(guard.alive,false);assert.equal(guard.hp,0);assert.equal(game.collides(guard.x,guard.y,10),false);
  assert.equal(validateDungeonRouteSave(captureDungeonRoutes(instance),context(instance)),true);
  const restored=createDungeon(instance.id);const imported=restored.world.enemies.find(e=>e.id===guard.id);Object.assign(imported,{hp:guard.hp,alive:guard.alive,x:guard.x,y:guard.y});
  restoreDungeonRoutes(restored,captureDungeonRoutes(instance));assert.equal(imported.alive,false);assert.equal(imported.x,guard.x);
});

test('forged route claims, geometry, guard budgets, ghost groups and impossible timers fail atomically',()=>{
  const instance=createDungeon('sturmzitadelle',{seed:5,tier:4}),baseline=captureDungeonRoutes(instance),baseContext=context(instance);
  const mutations=[
    s=>{s.completed=['invented'];},s=>{s.completed=[instance.routes.chambers[0].id,instance.routes.chambers[0].id];},
    s=>{s.geometry={freeGate:true};},s=>{s.hazardClocks[Object.keys(s.hazardClocks)[0]]=Infinity;},
    s=>{s.hazardHits.fake=['human'];},s=>{s.relay={chamberId:chamber(instance,'relay').id,actorId:'x',step:3,remaining:100,hold:0,holding:true};},
    s=>{s.completed=[chamber(instance,'martial').id];},
  ];
  for(const mutate of mutations){const forged=clone(baseline);mutate(forged);assert.throws(()=>validateDungeonRouteSave(forged,baseContext));assert.deepEqual(captureDungeonRoutes(instance),baseline);}
  for(const field of ['hp','maxHp','level','x']){const forged=clone(baseContext);const guard=forged.enemies.find(e=>e.id.includes(':route:'));guard[field]=1e8;assert.throws(()=>validateDungeonRouteSave(baseline,forged));}
  const insideWall=clone(baseContext),guardInWall=insideWall.enemies.find(e=>e.id.includes(':route:'));guardInWall.x=620;guardInWall.y=2900;assert.throws(()=>validateDungeonRouteSave(baseline,insideWall));
  const cacheContext=clone(baseContext);cacheContext.openedChests=[`${chamber(instance,'relay').id}:cache`];assert.throws(()=>validateDungeonRouteSave(baseline,cacheContext));
  assert.throws(()=>validateDungeonRouteSave(baseline,{...baseContext,layoutVersion:1}));
  assert.equal(validateDungeonRouteSave(null,{...baseContext,layoutVersion:1}),true);
});

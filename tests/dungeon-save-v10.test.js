import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { DUNGEONS, createDungeon } from '../src/dungeons.js';
import { routeHazardShapes } from '../src/dungeon-routes.js';

const clone=value=>JSON.parse(JSON.stringify(value));
function travelers(id='wurzelgewoelbe',tier=1) {
  const definition=DUNGEONS.find(d=>d.id===id),party=Array.from({length:definition.partyRequired||1},(_,index)=>{
    const game=new Game({storage:null,random:()=>.5});game.start();
    Object.assign(game.player,{id:`route-human-${index}`,level:definition.level,...definition.entrance});
    game.player.hp=game.stats().maxHp;game.player.mana=game.stats().mana;
    if(tier>1)game.dungeonRecords[id]={runs:tier-1,bestTier:tier-1,bestTime:100};
    return game;
  });
  for(const game of party)game.partyGames=party;
  assert.equal(party[0].enterDungeon(id,tier),true);return party;
}
function advance(party,seconds) {
  for(let left=seconds;left>1e-8;left-=.04){const dt=Math.min(.04,left);for(const game of party)game.update(dt,{simulateWorld:false});party[0].updateWorld(dt,party);}
}
function stable(game){const saved=clone(game.capture());delete saved.savedAt;return saved;}

test('a V9 dungeon without layout metadata resumes on its original geometry and boss budget',()=>{
  const [game]=travelers(),legacy=createDungeon('wurzelgewoelbe',{tier:1,seed:826535,layoutVersion:1});
  game.world=legacy.world;game.dungeonInstance=legacy;Object.assign(game.player,legacy.spawn);
  legacy.world.enemies.find(enemy=>enemy.boss).hp-=31;
  const saved=clone(game.capture());delete saved.dungeon.layoutVersion;delete saved.dungeon.routes;
  const loaded=new Game({storage:null});loaded.applySave(saved);
  assert.equal(loaded.world.height,1500);assert.equal(loaded.dungeonInstance.layoutVersion,1);
  assert.equal(loaded.dungeonInstance.routes,undefined);
  assert.equal(loaded.world.enemies.find(enemy=>enemy.boss).hp,legacy.world.enemies.find(enemy=>enemy.boss).hp);
  assert.deepEqual({x:loaded.player.x,y:loaded.player.y},legacy.spawn);
});

test('actual E interaction and partial holding survive a portable save without restarting the relay',()=>{
  const party=travelers(),game=party[0],chamber=game.dungeonInstance.routes.chambers.find(c=>c.kind==='relay'&&c.stage==='A');
  // Declared relay checkpoint fixture; the separate native journey audit proves
  // the complete walk from the entrance through all route geometry.
  Object.assign(game.player,chamber.beacons[0]);assert.equal(game.action('interact'),true);
  advance(party,1.04);assert.ok(game.dungeonInstance.routes.relay.hold>1);
  const saved=clone(game.capture()),loaded=new Game({storage:null});loaded.applySave(saved);loaded.start();
  assert.deepEqual(loaded.dungeonInstance.routes.relay,saved.dungeon.routes.relay);
  assert.equal(loaded.world.height,3840);advance([loaded],1.04);
  const relay=loaded.dungeonInstance.routes.relay;assert.equal(relay.step,1);assert.equal(relay.holding,false);
  assert.ok(relay.remaining<saved.dungeon.routes.relay.remaining);
  assert.equal(loaded.world.puzzleObjects.find(o=>o.id===chamber.beacons[0].id).active,true);
  const roundTrip=new Game({storage:null});roundTrip.applySave(clone(loaded.capture()));
  assert.deepEqual(roundTrip.dungeonInstance.routes.relay,relay);
  assert.equal(roundTrip.world.puzzleObjects.find(o=>o.id===chamber.beacons[0].id).active,true);
});

test('warned strip damage arrives after its deadline and its saved hit cannot be paid again',()=>{
  const party=travelers(),game=party[0],chamber=game.dungeonInstance.routes.chambers.find(c=>c.kind==='tactical'&&c.stage==='A');
  const first=routeHazardShapes(chamber,0).find(phase=>phase.warning);
  Object.assign(game.player,{x:chamber.centerX,y:first.shape.y1,invulnerable:0});
  const hp=game.player.hp;advance(party,1.76);assert.equal(game.player.hp,hp);
  assert.ok(game.hazards.some(h=>h.routeHazard&&h.windup&&h.shape.kind==='segment'));
  advance(party,.08);assert.ok(game.player.hp<hp);const hitHp=game.player.hp;
  const saved=clone(game.capture()),loaded=new Game({storage:null});loaded.applySave(saved);loaded.start();
  assert.deepEqual(loaded.dungeonInstance.routes.hazardHits,saved.dungeon.routes.hazardHits);
  advance([loaded],.2);assert.equal(loaded.player.hp,hitHp);
});

test('malformed routes, unearned caches and missing guards reject before touching the adventure',()=>{
  const [game]=travelers(),saved=clone(game.capture()),loaded=new Game({storage:null});loaded.applySave(saved);
  for(const mutate of [
    d=>{d.routes.completed.push('forged-route');},
    d=>{d.enemies=d.enemies.filter(enemy=>!enemy.id.includes(':route:'));},
    d=>{d.openedChests.push(`${d.routes.completed[0]||game.dungeonInstance.routes.chambers[0].id}:cache`);},
    d=>{d.routes.hazardClocks[Object.keys(d.routes.hazardClocks)[0]]=Infinity;},
    d=>{d.layoutVersion=3;},
    d=>{d.routes.relay={chamberId:'forged',actorId:'x',step:99,hold:0,remaining:1,holding:true};},
  ]) {
    const invalid=clone(saved);mutate(invalid.dungeon);const before=stable(loaded);
    assert.throws(()=>loaded.applySave(invalid));assert.deepEqual(stable(loaded),before);
  }
});

function completeGuardFixture(party,{boss=false}={}) {
  // Isolate canonical post-combat reward delivery; this is not a fight audit.
  const game=party[0];for(const enemy of game.world.enemies)if(enemy.routeGuard||boss&&enemy.boss){enemy.hp=0;enemy.alive=false;}
  advance(party,.04);
}
test('personal route seals require the boss, survive reload and cannot be farmed by abandoning or repeating a depth',()=>{
  const party=travelers('sturmzitadelle'),game=party[0];completeGuardFixture(party);
  assert.equal(game.dungeonInstance.routes.completed.length,2);
  assert.ok(party.every(ally=>ally.resources.raidSigil===0),'Route chambers pay no seals before the boss');
  game.exitDungeon();assert.ok(party.every(ally=>ally.resources.raidSigil===0));
  assert.equal(game.enterDungeon('sturmzitadelle'),true);completeGuardFixture(party);completeGuardFixture(party,{boss:true});
  assert.ok(party.every(ally=>ally.resources.raidSigil===3),'Each traveler earns a completion seal and two first route claims');
  advance(party,.08);assert.ok(party.every(ally=>ally.resources.raidSigil===3));
  const saved=clone(game.capture()),loaded=new Game({storage:null});loaded.applySave(saved);
  assert.deepEqual(loaded.ledger,game.ledger);assert.equal(loaded.resources.raidSigil,3);
  game.exitDungeon();assert.equal(game.enterDungeon('sturmzitadelle'),true);completeGuardFixture(party);completeGuardFixture(party,{boss:true});
  assert.ok(party.every(ally=>ally.resources.raidSigil===4),'Same depth keeps the ordinary completion seal without duplicate route claims');
  game.exitDungeon();assert.equal(game.enterDungeon('sturmzitadelle',2),true);completeGuardFixture(party);completeGuardFixture(party,{boss:true});
  assert.ok(party.every(ally=>ally.resources.raidSigil===7),'A newly mastered depth has its own personal route claims');
});

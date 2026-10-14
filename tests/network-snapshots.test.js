import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotEncoder, SnapshotAccumulator, SnapshotResyncError, cloneSnapshot, createSnapshotSignatureCache } from '../src/network-snapshots.js';

const base=()=>({protocol:1,sequence:0,roomCode:'ABCDEF01',playerId:'player-a',worldMode:'overworld',time:0,player:{id:'player-a',x:10,y:20,hp:100},world:{enemies:[{id:'wolf',x:30,y:20,hp:50,alive:true,cast:{remaining:2}}],nodes:[{id:'ore',remaining:2}],structures:[]},inventory:{heal_potion:2},questState:{},party:[{id:'player-a',x:10,y:20,hp:100}],events:[],layout:{seed:42,width:800,height:600}});
const wire=value=>JSON.parse(JSON.stringify(value));

test('delta signatures survive source mutations and reproduce the full authoritative state',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base();
  decoder.accept(wire(encoder.encode(snapshot)));
  snapshot.sequence=2;snapshot.time=.08;snapshot.player.x=24;snapshot.world.enemies[0].hp=25;snapshot.world.enemies[0].cast.remaining=1.92;
  delete snapshot.layout;
  const patch=wire(encoder.encode(snapshot));assert.equal(patch.snapshotDelta,1);assert.equal(patch.baseSequence,0);
  assert.equal(patch.changed.inventory,undefined);assert.equal(patch.world.arrays.enemies.updated[0].changed.hp,25);
  const actual=decoder.accept(patch),expected=wire({...snapshot,layout:base().layout,snapshotContext:patch.snapshotContext});
  assert.deepEqual(actual,expected);
  assert.equal(actual.world.enemies[0].hp,25);assert.equal(actual.layout.seed,42);
});

test('actor additions, removals, reordering and deleted optional fields are lossless',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base();
  decoder.accept(wire(encoder.encode(snapshot)));delete snapshot.layout;snapshot.sequence=2;
  snapshot.world.enemies.push({id:'boss',hp:500,x:300,y:150});snapshot.world.enemies.reverse();delete snapshot.world.enemies[1].cast;
  delete snapshot.inventory;snapshot.inventoryBag={ore:3};
  const patch=wire(encoder.encode(snapshot));const actual=decoder.accept(patch);
  assert.deepEqual(actual.world.enemies.map(row=>row.id),['boss','wolf']);assert.equal(actual.world.enemies[1].cast,undefined);
  assert.equal(actual.inventory,undefined);assert.deepEqual(actual.inventoryBag,{ore:3});
  snapshot.sequence=4;snapshot.world.enemies.splice(1,1);decoder.accept(wire(encoder.encode(snapshot)));
  assert.equal(decoder.snapshot.world.enemies.length,1);assert.equal(decoder.snapshot.world.enemies[0].id,'boss');
});

test('non-keyed arrays and duplicate actor IDs use complete replacement',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base();snapshot.effects=[{x:10,life:1}];
  decoder.accept(wire(encoder.encode(snapshot)));delete snapshot.layout;snapshot.sequence=2;snapshot.effects[0].life=.92;snapshot.world.enemies.push({...snapshot.world.enemies[0],hp:1});
  const patch=wire(encoder.encode(snapshot));assert.deepEqual(patch.changed.effects,snapshot.effects);assert.deepEqual(patch.world.changed.enemies,snapshot.world.enemies);
  assert.deepEqual(decoder.accept(patch).world.enemies,snapshot.world.enemies);
});

test('missing, reordered, duplicate and context-mismatched deltas never corrupt the baseline',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base();decoder.accept(wire(encoder.encode(snapshot)));delete snapshot.layout;
  snapshot.sequence=2;snapshot.player.hp=80;const first=wire(encoder.encode(snapshot));snapshot.sequence=4;snapshot.player.hp=60;const second=wire(encoder.encode(snapshot));
  const before=cloneSnapshot(decoder.snapshot);
  assert.throws(()=>decoder.accept(second),SnapshotResyncError);assert.deepEqual(decoder.snapshot,before);
  decoder.accept(first);const valid=cloneSnapshot(decoder.snapshot);
  assert.throws(()=>decoder.accept(first),SnapshotResyncError);assert.deepEqual(decoder.snapshot,valid);
  assert.throws(()=>decoder.accept({...second,snapshotContext:'other-world'}),SnapshotResyncError);assert.deepEqual(decoder.snapshot,valid);
  decoder.accept(second);assert.equal(decoder.snapshot.player.hp,60);
});

test('malformed row edits, duplicate order, forbidden keys and failed validation roll back atomically',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base();decoder.accept(wire(encoder.encode(snapshot)));delete snapshot.layout;snapshot.sequence=2;snapshot.world.enemies[0].hp=5;
  const patch=wire(encoder.encode(snapshot)),before=cloneSnapshot(decoder.snapshot);
  const corrupt=wire(patch);corrupt.world.arrays.enemies.updated[0].changed.id='forged';
  assert.throws(()=>decoder.accept(corrupt),SnapshotResyncError);assert.deepEqual(decoder.snapshot,before);
  const invalidOrder=wire(patch);invalidOrder.world.arrays.enemies.order=['wolf','wolf'];
  assert.throws(()=>decoder.accept(invalidOrder),SnapshotResyncError);assert.deepEqual(decoder.snapshot,before);
  const unsafe=wire(patch);unsafe.changed=JSON.parse('{"__proto__":{"polluted":true}}');
  assert.throws(()=>decoder.accept(unsafe),SnapshotResyncError);assert.equal({}.polluted,undefined);assert.deepEqual(decoder.snapshot,before);
  assert.throws(()=>decoder.accept(patch,()=>{throw new Error('invalid budget');}),/invalid budget/);assert.deepEqual(decoder.snapshot,before);
  decoder.accept(patch);assert.equal(decoder.snapshot.world.enemies[0].hp,5);
});

test('new world/layout and rewind force complete snapshots and separate stream baselines',()=>{
  const a=new SnapshotEncoder(),b=new SnapshotEncoder(),snapshot=base();const initial=a.encode(snapshot);assert.equal(initial.snapshotDelta,undefined);
  delete snapshot.layout;snapshot.sequence=2;assert.equal(a.encode(snapshot).snapshotDelta,1);assert.equal(b.encode(snapshot).snapshotDelta,undefined);
  snapshot.sequence=4;snapshot.layout={seed:5,width:1600,height:900};assert.equal(a.encode(snapshot).snapshotDelta,undefined);
  snapshot.sequence=6;delete snapshot.layout;snapshot.worldMode='dungeon';snapshot.dungeonInstance={id:'crypt',seed:99,tier:1};assert.equal(a.encode(snapshot).snapshotDelta,undefined);
  snapshot.sequence=0;assert.equal(a.encode(snapshot).snapshotDelta,undefined);
});

test('interpolation copies and incoming packet mutations cannot modify the canonical cache',()=>{
  const encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator(),snapshot=base(),packet=wire(encoder.encode(snapshot));decoder.accept(packet);
  packet.player.x=999;packet.world.enemies[0].x=999;
  const rendered=cloneSnapshot(decoder.snapshot);rendered.player.x=666;rendered.world.enemies[0].x=666;rendered.inventory.heal_potion=99;
  assert.equal(decoder.snapshot.player.x,10);assert.equal(decoder.snapshot.world.enemies[0].x,30);assert.equal(decoder.snapshot.inventory.heal_potion,2);
  const cache=createSnapshotSignatureCache();assert.equal(cache(snapshot.world.enemies[0]),cache(snapshot.world.enemies[0]));
  snapshot.sequence=2;delete snapshot.layout;snapshot.time=.08;decoder.accept(wire(encoder.encode(snapshot)));
  assert.equal(decoder.snapshot.world.enemies[0].x,30);assert.equal(decoder.snapshot.inventory.heal_potion,2);
});

test('moving raid clocks, guard HP and route holds do not resend immutable encounter definitions',()=>{
  const snapshot=base(),encoder=new SnapshotEncoder(),decoder=new SnapshotAccumulator();
  snapshot.worldMode='dungeon';snapshot.dungeonInstance={id:'raid',seed:42,tier:1,definition:{description:'Lore '.repeat(3000)},elapsed:1,bossTime:1,routes:{chambers:[{id:'route-A',hint:'Guide '.repeat(1000)}],completed:[],hazardClocks:{'route-A':1}}};
  snapshot.authoritativeDungeonCheckpoint={id:'raid',tier:1,seed:42,elapsed:1,bossTime:1,enemies:[{id:'boss',hp:50000,maxHp:50000}],routes:{completed:[],hazardClocks:{'route-A':1}}};
  const initial=wire(encoder.encode(snapshot));decoder.accept(initial);delete snapshot.layout;snapshot.sequence=2;snapshot.dungeonInstance.elapsed=1.08;snapshot.dungeonInstance.bossTime=1.08;snapshot.dungeonInstance.routes.hazardClocks['route-A']=1.08;
  snapshot.authoritativeDungeonCheckpoint.elapsed=1.08;snapshot.authoritativeDungeonCheckpoint.bossTime=1.08;snapshot.authoritativeDungeonCheckpoint.enemies[0].hp=48000;snapshot.authoritativeDungeonCheckpoint.routes.hazardClocks['route-A']=1.08;
  const patch=wire(encoder.encode(snapshot));assert.equal(patch.records.dungeonInstance.changed.elapsed,1.08);assert.equal(patch.records.authoritativeDungeonCheckpoint.arrays.enemies.updated[0].changed.hp,48000);
  assert.equal(JSON.stringify(patch).includes('Lore'),false);assert.equal(JSON.stringify(patch).includes('Guide'),false);assert.ok(JSON.stringify(patch).length<JSON.stringify(initial).length*.05);
  const result=decoder.accept(patch);assert.equal(result.dungeonInstance.definition.description,snapshot.dungeonInstance.definition.description);assert.deepEqual(result.authoritativeDungeonCheckpoint,snapshot.authoritativeDungeonCheckpoint);
});

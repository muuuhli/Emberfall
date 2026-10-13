import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/game.js';
import { createDungeon } from '../src/dungeons.js';

const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const fresh=()=>{const game=new Game({storage:storage(),random:()=>.5});game.start();return game;};
const standAtGiver=(g,region)=>{const {x,y}=g.contractGiver(region);Object.assign(g.player,{x,y});};
const captured=g=>{const value=JSON.parse(JSON.stringify(g.capture()));delete value.savedAt;return value;};

test('regional contracts require a real giver, ignore prior progress, and pay exactly once',()=>{
  const game=fresh();game.player.level=8;
  const offer=game.contractOffers('daemmerhain')[0];
  game.ledger[`kill:${offer.objectives[0].target}`]=100;
  game.player.x=1500;game.player.y=1800;
  assert.equal(game.acceptContract(offer.id),false);
  standAtGiver(game,'daemmerhain');assert.equal(game.acceptContract(offer.id),true);
  assert.deepEqual(game.contracts.active[0].counts,[0]);
  game.player.x=600;game.player.y=300;game.event('kill',offer.objectives[0].target,100);
  assert.deepEqual(game.contracts.active[0].counts,[0]);
  standAtGiver(game,'daemmerhain');game.event('kill',offer.objectives[0].target,offer.objectives[0].count);
  const gold=game.player.gold,dust=game.resources.dust,xp=game.player.xp;
  assert.equal(game.turnInContract(offer.id),true);
  assert.equal(game.player.gold,gold+offer.reward.gold);
  assert.equal(game.resources.dust,dust+offer.reward.dust);
  assert.equal(game.player.xp,xp+offer.reward.xp);
  assert.equal(game.turnInContract(offer.id),false);
  assert.equal(game.contracts.completed.daemmerhain,1);
});

test('partial contract progress survives reload and forged rewards leave the journey untouched',()=>{
  const game=fresh();game.player.level=8;standAtGiver(game,'daemmerhain');
  const offer=game.contractOffers('daemmerhain')[0];game.acceptContract(offer.id);
  game.event('kill',offer.objectives[0].target,3);
  const data=JSON.parse(JSON.stringify(game.capture()));
  const restored=fresh();restored.applySave(data);
  assert.deepEqual(restored.contracts,game.contracts);
  const before=captured(restored);data.contracts.active[0].reward.xp++;
  assert.throws(()=>restored.applySave(data),/Auftragsdaten/);
  assert.deepEqual(captured(restored),before);
});

test('a deep dungeon checkpoint preserves living echoes and pending rift warnings',()=>{
  const game=fresh();game.player.level=100;
  const instance=createDungeon('wurzelgewoelbe',{tier:8});
  game.world=instance.world;game.dungeonInstance=instance;game.npcs=[];
  instance.gateOpened=true;instance.puzzles.forEach(p=>p.solved=true);
  const gate=instance.world.structures.find(s=>s.type==='dungeon_gate');gate.open=true;gate.blocking=false;
  Object.assign(game.player,{x:1450,y:900,invulnerable:100});
  for(let i=0;i<906;i++)game.updateWorld(.04);
  assert.equal(game.world.enemies.filter(e=>e.affixEcho).length,2);
  assert.ok(instance.affixState.rifts.length);
  const checkpoint=JSON.parse(JSON.stringify(game.capture()));
  const restored=fresh();restored.applySave(checkpoint);
  assert.equal(restored.world.enemies.filter(e=>e.affixEcho).length,2);
  assert.equal(restored.dungeonInstance.affixState.wave,instance.affixState.wave);
  assert.equal(restored.dungeonInstance.bossTime,instance.bossTime);
  assert.ok(restored.hazards.some(h=>h.windup));
  const before=restored.player.hp;
  for(const e of restored.world.enemies){e.aggro=false;e.phase='recover';e.attackTimer=20;}
  for(let i=0;i<40;i++)restored.updateWorld(.04);
  assert.ok(restored.player.hp<before,'the saved warning still resolves into real damage');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { dungeonCompletionXp } from '../src/balance.js';
import { Game } from '../src/game.js';
import { createDungeon } from '../src/dungeons.js';

test('discovery keeps its authored reward while repeat experience follows relevant depth and character level',()=>{
  assert.equal(dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:95,firstClear:true}),180000);
  assert.equal(dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:95}),0);
  assert.equal(dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:80}),180000);
  assert.equal(dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:90}),18000);
  assert.ok(dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:90,tier:21})>dungeonCompletionXp(180000,{dungeonLevel:75,playerLevel:90,tier:1}),'A harder earned depth retains relevant experience');
  assert.equal(dungeonCompletionXp(NaN,{dungeonLevel:75,playerLevel:80}),0);
});

test('the actual shared completion pays each traveler once and leaves seals and loot progression available after experience becomes gray',()=>{
  const party=Array.from({length:3},(_,index)=>{
    const game=new Game({storage:null,random:()=>.5});game.player.id=`reward-human-${index}`;game.player.level=95;game.player.xp=0;
    game.player.hp=game.stats().maxHp;return game;
  });
  const authority=party[0],instance=createDungeon('sturmzitadelle',{tier:1,partySize:3,layoutVersion:1});
  const boss=instance.world.enemies.find(e=>e.id==='sturmzitadelle:boss');
  // Isolate reward delivery after a victory. This fixture is not a boss fight.
  instance.world.enemies=[boss];boss.alive=false;boss.hp=0;
  for(const game of party){game.partyGames=party;game.dungeonInstance=instance;game.world=instance.world;Object.assign(game.player,instance.spawn);}
  authority.updateWorld(.04,party);
  for(const game of party){assert.equal(game.player.xp,180000);assert.equal(game.resources.raidSigil,1);assert.equal(game.dungeonRecords.sturmzitadelle.runs,1);}
  authority.updateWorld(.04,party);assert.ok(party.every(game=>game.player.xp===180000&&game.resources.raidSigil===1));
  const repeated=createDungeon('sturmzitadelle',{tier:1,partySize:3,layoutVersion:1}),repeatBoss=repeated.world.enemies.find(e=>e.id==='sturmzitadelle:boss');
  repeated.world.enemies=[repeatBoss];repeatBoss.alive=false;repeatBoss.hp=0;
  for(const game of party){game.dungeonInstance=repeated;game.world=repeated.world;}
  authority.updateWorld(.04,party);
  for(const game of party){assert.equal(game.player.xp,180000);assert.equal(game.resources.raidSigil,2);assert.equal(game.dungeonRecords.sturmzitadelle.runs,2);}
});

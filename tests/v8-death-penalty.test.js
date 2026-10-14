import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,SAVE_KEY} from '../src/game.js';
import {deathFee,createDeathPenaltyState,chargeDeathPenalty,completeDeathRescue,creditGold,validateDeathPenaltyState} from '../src/death-penalty.js';

const clone=value=>JSON.parse(JSON.stringify(value));
const stableSave=game=>{const saved=clone(game.capture());delete saved.savedAt;return saved;};
function fixture({level=20,gold=0,storage=null}={}){
  const game=new Game({storage,random:()=>.5});game.start();
  Object.assign(game.player,{level,gold,x:2000,y:1000,hp:game.stats().maxHp,invulnerable:0});return game;
}
const fall=game=>game.damagePlayer(1e8,{trueDamage:true,ignoreInvulnerability:true,attackerId:'fatal-native-hit'});

test('every PvE death costs currency immediately, with a level minimum and a ten-percent wealthy purse fee',()=>{
  for(const [level,gold,fee] of [[1,0,6],[20,3,15],[100,0,55],[20,101,15],[100,1001,101]]){
    const game=fixture({level,gold}),inventory=clone(game.inventory),equipment=clone(game.equipment),xp=game.player.xp;
    fall(game);assert.ok(game.dead);assert.equal(deathFee(level,gold),fee);
    assert.deepEqual(game.deathPenalty.lastReceipt,{id:'death-1',level,goldBefore:gold,fee,goldLost:Math.min(gold,fee),debtAdded:Math.max(0,fee-gold),pendingRescue:true});
    assert.equal(game.player.gold,Math.max(0,gold-fee));assert.equal(game.deathPenalty.debt,Math.max(0,fee-gold));
    assert.equal(game.player.level,level);assert.equal(game.player.xp,xp);assert.deepEqual(game.inventory,inventory);assert.deepEqual(game.equipment,equipment);
  }
});

test('duplicate death delivery and rescue do not charge twice, while the next actual death does',()=>{
  const game=fixture({gold:3});fall(game);const receipt=clone(game.deathPenalty);
  fall(game);chargeDeathPenalty(game);assert.deepEqual(game.deathPenalty,receipt);
  assert.equal(game.respawn(),true);assert.equal(game.deathPenalty.lastReceipt.pendingRescue,false);assert.equal(game.deathPenalty.debt,12);
  assert.equal(game.respawn(),false);assert.equal(chargeDeathPenalty(game),null);
  fall(game);assert.equal(game.deathPenalty.deaths,2);assert.equal(game.deathPenalty.debt,27);assert.equal(game.deathPenalty.lastReceipt.fee,15);
});

test('the fatal hit writes its paid receipt before the death callback and reload performs only the existing rescue',()=>{
  const values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const game=fixture({gold:3,storage});let callbackSave;
  game.onDeath=()=>{callbackSave=JSON.parse(storage.getItem(SAVE_KEY));};fall(game);
  assert.equal(callbackSave.player.hp,0);assert.equal(callbackSave.player.gold,0);assert.equal(callbackSave.deathPenalty.debt,12);
  const restored=fixture({storage});assert.equal(restored.load(),true);assert.equal(restored.dead,false);assert.equal(restored.player.hp,restored.stats().maxHp);
  assert.equal(restored.deathPenalty.deaths,1);assert.equal(restored.deathPenalty.debt,12);assert.equal(restored.deathPenalty.lastReceipt.pendingRescue,false);
  const again=fixture({storage});assert.equal(again.load(),true);assert.deepEqual(again.deathPenalty,restored.deathPenalty);assert.equal(again.player.gold,0);
});

test('legacy zero-health saves charge once and living legacy saves start without debt',()=>{
  const legacy=clone(fixture({gold:100}).capture());delete legacy.deathPenalty;legacy.player.hp=0;
  const loaded=fixture();loaded.applySave(legacy);assert.equal(loaded.player.gold,85);assert.equal(loaded.deathPenalty.deaths,1);assert.equal(loaded.deathPenalty.lastReceipt.pendingRescue,false);
  const reload=fixture();reload.applySave(clone(loaded.capture()));assert.equal(reload.player.gold,85);assert.equal(reload.deathPenalty.deaths,1);
  legacy.player.hp=100;const living=fixture();living.applySave(legacy);assert.deepEqual(living.deathPenalty,createDeathPenaltyState());assert.equal(living.player.gold,100);
});

test('quarter withholding is partition-invariant, persists single-gold carry, and stops when debt is paid',()=>{
  for(const parts of [[20],Array(20).fill(1),[3,1,2,7,7]]){
    const game=fixture();fall(game);game.respawn();for(const amount of parts)game.gainGold(amount);
    assert.equal(game.player.gold,15);assert.equal(game.deathPenalty.debt,10);assert.equal(game.deathPenalty.repayQuarters,0);
  }
  const game=fixture();fall(game);game.respawn();game.gainGold(3);const loaded=fixture();loaded.applySave(clone(game.capture()));
  assert.deepEqual(loaded.gainGold(1),{gross:1,received:0,repaid:1});assert.equal(loaded.player.gold,3);assert.equal(loaded.deathPenalty.debt,14);
  assert.deepEqual(loaded.gainGold(100),{gross:100,received:86,repaid:14});assert.equal(loaded.deathPenalty.debt,0);assert.equal(loaded.deathPenalty.repayQuarters,0);
  assert.deepEqual(loaded.gainGold(4),{gross:4,received:4,repaid:0});
});

test('invalid currency credits cannot mutate wallet, debt or fractional carry',()=>{
  const game=fixture();fall(game);completeDeathRescue(game);const before=clone(game.deathPenalty),gold=game.player.gold;
  for(const amount of [Infinity,-Infinity,NaN,-10,null,undefined,'100',true])assert.deepEqual(creditGold(game,amount),{gross:0,received:0,repaid:0});
  assert.deepEqual(game.deathPenalty,before);assert.equal(game.player.gold,gold);
});

test('malformed death states reject the entire import without replacing the active character',()=>{
  const paid=fixture({gold:3});fall(paid);const save=clone(paid.capture()),live=fixture({gold:777}),before=stableSave(live);
  for(const corrupt of [s=>s.debt=-1,s=>s.repayQuarters=4,s=>s.debt=56,s=>s.lastReceipt.fee++,s=>s.lastReceipt.goldLost++,s=>s.lastReceipt.id='death-2',s=>s.lastReceipt.pendingRescue='yes',s=>s.version=2,s=>s.deaths=0,s=>s.token='forged']){
    const forged=clone(save);corrupt(forged.deathPenalty);assert.equal(validateDeathPenaltyState(forged.deathPenalty),false);assert.throws(()=>live.applySave(forged));assert.deepEqual(stableSave(live),before);
  }
});

test('PvP excludes defeat fees and the PvE rescue button from its separate arena state',()=>{
  const game=fixture({gold:101});game.worldMode='pvp';game.world.isPvp=true;const before=clone(game.deathPenalty);fall(game);
  assert.deepEqual(game.deathPenalty,before);assert.equal(game.player.gold,101);assert.equal(game.respawn(),false);assert.equal(chargeDeathPenalty(game),null);
});

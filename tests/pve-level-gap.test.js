import test from 'node:test';
import assert from 'node:assert/strict';
import { pveLevelGap } from '../src/balance.js';

test('equal-level PvE and the first three higher levels retain the original damage, pressure and control',()=>{
  for(const playerLevel of [1,12,27,52,68,100])for(let delta=-15;delta<=3;delta++){
    const enemyLevel=Math.max(1,Math.min(100,playerLevel+delta)),profile=pveLevelGap(playerLevel,enemyLevel);
    assert.equal(profile.gap,enemyLevel-playerLevel);assert.equal(profile.damageMultiplier,1);assert.equal(profile.incomingMultiplier,1);assert.equal(profile.controlMultiplier,1);assert.equal(profile.overwhelming,false);
  }
});

test('higher-level challenge increases progressively before the explicit overwhelming boundary',()=>{
  let previousDamage=1,previousIncoming=1;
  for(let gap=4;gap<=19;gap++){
    const profile=pveLevelGap(27,27+gap);assert.equal(profile.gap,gap);assert.ok(profile.damageMultiplier>0&&profile.damageMultiplier<previousDamage);assert.ok(profile.incomingMultiplier>previousIncoming);assert.equal(profile.controlMultiplier,profile.damageMultiplier);assert.equal(profile.overwhelming,false);
    previousDamage=profile.damageMultiplier;previousIncoming=profile.incomingMultiplier;
  }
  const plusFive=pveLevelGap(27,32),plusTen=pveLevelGap(27,37),plusFifteen=pveLevelGap(27,42);
  assert.equal(plusFive.damageMultiplier,.8);assert.equal(plusFive.incomingMultiplier,1.3);
  assert.ok(Math.abs(plusTen.damageMultiplier-.24615384615384617)<1e-12);assert.equal(plusTen.incomingMultiplier,2.05);
  assert.equal(plusFifteen.damageMultiplier,.1);assert.equal(plusFifteen.incomingMultiplier,2.8);
});

test('a twenty-level gap and the reported level27-versus68 case have zero damage and control rather than a one-hit floor',()=>{
  for(const [playerLevel,enemyLevel] of [[1,21],[27,47],[27,68],[80,100]]){
    const profile=pveLevelGap(playerLevel,enemyLevel);assert.equal(profile.damageMultiplier,0);assert.equal(profile.controlMultiplier,0);assert.equal(profile.overwhelming,true);assert.ok(profile.incomingMultiplier>=3.55&&profile.incomingMultiplier<=4);
  }
  assert.equal(pveLevelGap(27,68).incomingMultiplier,4);
  assert.deepEqual(pveLevelGap(68,27),{gap:-41,damageMultiplier:1,incomingMultiplier:1,controlMultiplier:1,overwhelming:false});
});

test('invalid, fractional and out-of-range levels follow the shared bounded PvE level normalization',()=>{
  assert.deepEqual(pveLevelGap(),pveLevelGap(1,1));
  for(const invalid of [NaN,Infinity,-Infinity,null,'27',{},[]]){
    assert.deepEqual(pveLevelGap(invalid,68),pveLevelGap(1,68));assert.deepEqual(pveLevelGap(27,invalid),pveLevelGap(27,1));
  }
  assert.deepEqual(pveLevelGap(-200,500),pveLevelGap(1,100));assert.deepEqual(pveLevelGap(27.9,37.9),pveLevelGap(27,37));
  for(let player=1;player<=100;player++)for(let enemy=1;enemy<=100;enemy++){
    const profile=pveLevelGap(player,enemy);assert.ok(Number.isFinite(profile.damageMultiplier)&&profile.damageMultiplier>=0&&profile.damageMultiplier<=1);assert.ok(Number.isFinite(profile.incomingMultiplier)&&profile.incomingMultiplier>=1&&profile.incomingMultiplier<=4);assert.equal(profile.controlMultiplier,profile.damageMultiplier);
  }
});

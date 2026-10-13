import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_LEVEL, xpToNext, enemyScale, rewardScale, cumulativeXp, applyExperience, campaignPacing } from '../src/progression.js';

test('level curve preserves early rewards and increases smoothly to level 100', () => {
  assert.equal(MAX_LEVEL, 100);
  for (let level = 1; level <= 10; level++) assert.equal(xpToNext(level), 70 + 22 * level * level);
  let previous = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    assert.ok(Number.isInteger(xpToNext(level)) && xpToNext(level) > previous);
    previous = xpToNext(level);
  }
  assert.equal(xpToNext(MAX_LEVEL), 0);
  assert.equal(xpToNext(200), 0);
  assert.equal(xpToNext(NaN), xpToNext(1));
  assert.ok(xpToNext(99) < 1e6, 'XP remains bounded rather than exponential.');
});

test('experience handles multiple level gains, invalid input and the cap', () => {
  assert.deepEqual(applyExperience({ level: 1, xp: 5 }, xpToNext(1) + xpToNext(2)), { level: 3, xp: 5, levels: [2, 3], skillPoints: 4 });
  assert.deepEqual(applyExperience({ level: 99, xp: 12 }, 1e10), { level: 100, xp: 0, levels: [100], skillPoints: 2 });
  assert.deepEqual(applyExperience({ level: 100, xp: 300 }, 600), { level: 100, xp: 0, levels: [], skillPoints: 0 });
  assert.deepEqual(applyExperience({ level: 1, xp: NaN }, -20), { level: 1, xp: 0, levels: [], skillPoints: 0 });
  assert.equal(applyExperience({ level: 1 }, cumulativeXp(100)).level, 100);
  assert.equal(cumulativeXp(1), 0);
});

test('enemy and reward growth stay finite and preserve level-one behavior', () => {
  assert.equal(enemyScale(1), 1);
  assert.equal(rewardScale(1), 1);
  for (let level = 2; level <= 100; level++) {
    assert.ok(enemyScale(level) > enemyScale(level - 1));
    assert.ok(rewardScale(level) > rewardScale(level - 1));
  }
  assert.ok(enemyScale(100) < 30);
  assert.ok(rewardScale(100) < 80);
  assert.equal(enemyScale(150), enemyScale(100));
});

test('200-hour content plan is explicitly a target and covers levels 1 to 100', () => {
  assert.equal(campaignPacing.targetHours, 200);
  assert.equal(campaignPacing.phases.reduce((sum, phase) => sum + phase.targetHours, 0), 200);
  assert.equal(campaignPacing.status, 'design-target');
  assert.equal(campaignPacing.verifiedHours, 0);
  for (let level = 1; level <= 100; level++) assert.ok(campaignPacing.phases.some(phase => level >= phase.minLevel && level <= phase.maxLevel));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { REGIONS, ENEMY_TYPES, RESOURCES, RECIPES } from '../src/catalog.js';
import { DUNGEONS } from '../src/dungeons.js';
import { xpToNext } from '../src/progression.js';
import { MAX_ACTIVE_CONTRACTS, getContractOffers, resolveContractOffer, createContract, advanceContract, validateContractState, restoreContractState } from '../src/contracts.js';
import { Game } from '../src/game.js';

const clone = value => JSON.parse(JSON.stringify(value));
const offers = (regionId = 'daemmerhain', level = 10, completed = 0) => getContractOffers({ regionId, level, completed });
const finish = contract => {
  for (const objective of contract.objectives) assert.equal(advanceContract(contract, objective.kind, objective.target, objective.count, { regionId: contract.region }), true);
};

test('all sixteen regions offer three deterministic tasks within their level bands', () => {
  assert.equal(MAX_ACTIVE_CONTRACTS, 3);
  for (const region of REGIONS) {
    const level = region.maxLevel ? region.level : Math.max(8, region.level);
    const result = offers(region.id, level);
    assert.equal(result.length, 3, region.id);
    assert.equal(new Set(result.map(offer => offer.id)).size, 3);
    assert.deepEqual(result, offers(region.id, level));
    assert.ok(result.every(offer => offer.minLevel <= level && offer.region === region.id && offer.level === level));
    assert.equal(result[0].objectives[0].kind, 'kill');
    assert.equal(result[1].objectives[0].kind, 'gather');
    assert.ok(result[2].objectives.some(objective => ['craft', 'farm', 'dungeon'].includes(objective.kind)));
    assert.notDeepEqual(result, offers(region.id, level, 1));
  }
});

test('original regions bridge levels eight to twelve without becoming endgame XP farms', () => {
  for (const id of ['daemmerhain', 'frostgrat', 'aschenmoor']) {
    for (const level of [8, 9, 10, 11, 12]) assert.equal(offers(id, level).length, 3);
    assert.equal(offers(id, 7).length, 0);
    assert.equal(offers(id, 13).length, 0);
    assert.equal(offers(id, 99).length, 0);
  }
  assert.equal(offers('glutoede', 8).length, 0);
  assert.equal(offers('glutoede', 9).length, 3);
  assert.equal(offers('sternensund', 20).length, 0);
  assert.equal(offers('sternensund', 99).length, 3);
});

test('kill, gather and craft objectives reference actual local content with bounded counts', () => {
  for (const region of REGIONS) {
    const level = region.maxLevel ? region.level : Math.max(8, region.level);
    for (let cycle = 0; cycle < 12; cycle++) {
      for (const offer of offers(region.id, level, cycle)) {
        for (const objective of offer.objectives) {
          if (objective.kind === 'kill') {
            assert.ok(ENEMY_TYPES[objective.target]);
            assert.ok(objective.count >= 8 && objective.count <= 22);
            if (region.enemy) assert.equal(objective.target, region.enemy);
          } else if (objective.kind === 'gather') {
            assert.ok(RESOURCES[objective.target]);
            assert.ok(objective.count >= 12 && objective.count <= 36);
            if (region.id === 'frostgrat') assert.equal(objective.target, 'ore', 'Frostgrat has ore nodes, but no local wood/herb nodes.');
            if (region.id === 'glutoede') assert.ok(['ore', 'crystal'].includes(objective.target));
          } else if (objective.kind === 'craft') assert.ok(RECIPES.some(recipe => recipe.id === objective.target));
          else if (objective.kind === 'farm') {
            assert.equal(objective.target, 'wheat');
            assert.ok(region.id === 'daemmerhain' || !!region.enemy, 'Only zones with farming plots offer fresh harvest tasks.');
          } else if (objective.kind === 'dungeon') assert.ok(DUNGEONS.some(dungeon => dungeon.id === objective.target));
          else assert.fail(`Unknown objective kind ${objective.kind}`);
        }
      }
    }
  }
});

test('rewards remain fifteen to twenty-five percent of the offered level XP requirement', () => {
  for (const region of REGIONS) {
    const level = region.maxLevel ? Math.min(99, region.maxLevel) : 12;
    for (let cycle = 0; cycle < 4; cycle++) {
      for (const offer of offers(region.id, level, cycle)) {
        const ratio = offer.reward.xp / xpToNext(level);
        assert.ok(ratio >= 0.15 && ratio <= 0.251);
        assert.ok(offer.reward.gold > 0 && offer.reward.dust > 0);
      }
    }
  }
  assert.ok(offers('nexusriss', 100).every(offer => offer.reward.xp === 0 && offer.reward.gold > 0 && offer.reward.dust > 0));
});

test('creating a contract reconstructs its trusted offer and starts all progress at zero', () => {
  const original = offers()[0];
  const forged = { ...clone(original), title: 'Forged', reward: { xp: 1e12, gold: 1e12, dust: 1e12 }, counts: [999], status: 'ready' };
  const contract = createContract(forged);
  assert.equal(contract.title, original.title);
  assert.deepEqual(contract.reward, original.reward);
  assert.deepEqual(contract.counts, [0]);
  assert.equal(contract.status, 'active');
  assert.deepEqual(resolveContractOffer(original.id), original);
  contract.reward.gold = 999999;
  assert.notEqual(resolveContractOffer(original.id).reward.gold, 999999, 'Definitions must not drift through mutable save state.');
});

test('only newly emitted matching events from the correct region advance a contract', () => {
  const contract = createContract(offers()[0]);
  const objective = contract.objectives[0];
  const initial = clone(contract);
  assert.equal(advanceContract(contract, 'gather', objective.target, 999, { regionId: contract.region }), false);
  assert.equal(advanceContract(contract, objective.kind, 'wrong-target', 999, { regionId: contract.region }), false);
  assert.equal(advanceContract(contract, objective.kind, objective.target, 999, { regionId: 'frostgrat' }), false);
  assert.equal(advanceContract(contract, objective.kind, objective.target, 999), false);
  assert.deepEqual(contract, initial);
  assert.equal(advanceContract(contract, objective.kind, objective.target, 3, { regionId: contract.region }), true);
  assert.deepEqual(contract.counts, [3]);
  assert.equal(contract.status, 'active');
  assert.equal(advanceContract(contract, objective.kind, objective.target, 999, { regionId: contract.region }), true);
  assert.deepEqual(contract.counts, [objective.count]);
  assert.equal(contract.status, 'ready');
  const ready = clone(contract);
  assert.equal(advanceContract(contract, objective.kind, objective.target, 999, { regionId: contract.region }), false);
  assert.deepEqual(contract, ready);
});

test('compound farming contracts require both fresh harvest and newly crafted bread', () => {
  const offer = offers('daemmerhain', 10, 1)[2];
  assert.deepEqual(offer.objectives.map(objective => objective.kind), ['farm', 'craft']);
  const contract = createContract(offer);
  const [farm, craft] = contract.objectives;
  assert.equal(advanceContract(contract, craft.kind, craft.target, craft.count, { regionId: contract.region }), true);
  assert.equal(contract.status, 'active');
  assert.equal(advanceContract(contract, 'gather', 'wheat', 100, { regionId: contract.region }), false, 'A material ledger is not the fresh farming event.');
  assert.equal(advanceContract(contract, farm.kind, farm.target, farm.count, { regionId: contract.region }), true);
  assert.equal(contract.status, 'ready');
});

test('eligible dungeon offers accept the known dungeon completion context and enforce the assigned gate', () => {
  const offer = offers('sonnensteppe', 12, 0)[2];
  assert.equal(offer.objectives[0].target, 'wurzelgewoelbe');
  const contract = createContract(offer);
  assert.equal(advanceContract(contract, 'dungeon', 'salzarchiv', 1, { regionId: 'salzarchiv' }), false);
  assert.equal(advanceContract(contract, 'dungeon', 'wurzelgewoelbe', 1, { regionId: 'frostgrat' }), false);
  assert.equal(advanceContract(contract, 'dungeon', 'wurzelgewoelbe', 1, { regionId: 'wurzelgewoelbe' }), true);
  assert.equal(contract.status, 'ready');
  assert.ok(offers('sandsenke', 68, 0)[2].objectives.every(objective => objective.kind !== 'dungeon'));
  const raid = offers('sandsenke', 70, 0)[2];
  assert.equal(raid.objectives[0].target, 'sturmzitadelle');
  assert.equal(raid.partyRequired, 3);
});

test('saved states enforce three global active contracts and reject duplicate or future-cycle IDs', () => {
  const active = offers().map(createContract);
  const state = { active, completed: { daemmerhain: 0 } };
  assert.equal(validateContractState(state, { level: 10 }), true);
  assert.equal(validateContractState({ ...state, active: [...active, createContract(offers('frostgrat', 10)[0])] }), false);
  assert.equal(validateContractState({ active: [active[0], clone(active[0])], completed: {} }), false);
  assert.equal(validateContractState({ active: [createContract(offers('daemmerhain', 10, 1)[0])], completed: {} }), false);
  assert.equal(validateContractState(state, { level: 9 }), false, 'A low-level save cannot carry a future-level offer.');
});

test('older active cycles remain valid after another regional task is rewarded', () => {
  const [first, second, third] = offers().map(createContract);
  finish(first);
  const state = { active: [second, third], completed: { daemmerhain: 1 } };
  assert.equal(validateContractState(state, { level: 11 }), true);
  finish(second);
  assert.equal(validateContractState(state, { level: 11 }), true);
  state.active = [third, createContract(offers('daemmerhain', 11, 1)[0])];
  assert.equal(validateContractState(state, { level: 11 }), true);
  assert.notEqual(state.active[0].cycle, state.active[1].cycle);
});

test('validation rejects tampered rewards, objective definitions, counts and false completion', () => {
  const original = { active: [createContract(offers()[0])], completed: { daemmerhain: 0 } };
  for (const mutate of [
    state => { state.active[0].reward.xp = 999999999; },
    state => { state.active[0].reward.item = 'ember_charm'; },
    state => { state.active[0].objectives[0].count = 1; },
    state => { state.active[0].objectives[0].target = 'slime'; },
    state => { state.active[0].counts[0] = -1; },
    state => { state.active[0].counts[0] = 99999; },
    state => { state.active[0].status = 'ready'; },
    state => { state.active[0].title = 'Forged definition'; },
    state => { state.completed.daemmerhain = -1; },
    state => { state.completed.missingRegion = 1; },
    state => { state.completed.daemmerhain = Infinity; },
  ]) {
    const state = clone(original);
    mutate(state);
    assert.equal(validateContractState(state), false);
    assert.equal(restoreContractState(state), null);
  }
});

test('save restoration rebuilds definitions and preserves active and ready progress independently', () => {
  const active = offers().map(createContract);
  advanceContract(active[0], active[0].objectives[0].kind, active[0].objectives[0].target, 3, { regionId: 'daemmerhain' });
  finish(active[1]);
  const state = { active, completed: { daemmerhain: 0 } };
  const restored = restoreContractState(clone(state), { level: 10 });
  assert.deepEqual(restored, state);
  restored.active[0].counts[0] = 4;
  assert.equal(state.active[0].counts[0], 3);
  assert.deepEqual(restoreContractState(), { active: [], completed: {} });
});

test('invalid parameters, corrupted IDs and impossible event amounts are harmless', () => {
  for (const options of [{ regionId: 'missing', level: 10 }, { regionId: 'daemmerhain', level: NaN }, { regionId: 'daemmerhain', level: 1000 }, { regionId: 'daemmerhain', level: 10, completed: -1 }, { regionId: 'daemmerhain', level: 10, completed: 1e12 }]) assert.deepEqual(getContractOffers(options), []);
  for (const id of ['missing', 'contract:daemmerhain:00:0:10', 'contract:daemmerhain:0:9:10', 'contract:sternensund:0:0:1', null]) assert.equal(resolveContractOffer(id), null);
  const contract = createContract(offers()[0]), initial = clone(contract);
  for (const amount of [-1, 0, 0.5, NaN, Infinity]) assert.equal(advanceContract(contract, 'kill', contract.objectives[0].target, amount, { regionId: 'daemmerhain' }), false);
  assert.deepEqual(contract, initial);
  assert.equal(createContract({ id: 'invalid' }), null);
  assert.equal(validateContractState(null), false);
});

function contractGame() {
  const game = new Game({ storage: null, random: () => 0.5 });
  game.player.level = 10;
  const giver = game.contractGiver('daemmerhain');
  game.player.x = giver.x;
  game.player.y = giver.y;
  game.player.hp = game.stats().maxHp;
  game.player.mana = game.stats().mana;
  game.start();
  return game;
}

test('Game acceptance ignores old ledgers and turn-in grants a trusted reward exactly once', () => {
  const game = contractGame();
  const offer = game.contractOffers('daemmerhain')[0];
  const objective = offer.objectives[0];
  game.event(objective.kind, objective.target, 1000);
  assert.equal(game.acceptContract(offer.id), true);
  assert.deepEqual(game.contracts.active[0].counts, [0]);
  game.event(objective.kind, objective.target, objective.count);
  assert.equal(game.contracts.active[0].status, 'ready');
  const before = { xp: game.player.xp, gold: game.player.gold, dust: game.resources.dust };
  assert.equal(game.turnInContract(offer.id), true);
  assert.equal(game.player.xp, before.xp + offer.reward.xp);
  assert.equal(game.player.gold, before.gold + offer.reward.gold);
  assert.equal(game.resources.dust, before.dust + offer.reward.dust);
  assert.equal(game.contracts.completed.daemmerhain, 1);
  const rewarded = { xp: game.player.xp, gold: game.player.gold, dust: game.resources.dust };
  assert.equal(game.turnInContract(offer.id), false);
  assert.deepEqual({ xp: game.player.xp, gold: game.player.gold, dust: game.resources.dust }, rewarded);
});

test('Game preserves older active cycles across saving and rejects forged rewards before applying a save', () => {
  const game = contractGame();
  const originalOffers = game.contractOffers('daemmerhain');
  for (const offer of originalOffers) assert.equal(game.acceptContract(offer.id), true);
  const first = originalOffers[0].objectives[0];
  game.event(first.kind, first.target, first.count);
  assert.equal(game.turnInContract(originalOffers[0].id), true);
  const next = game.contractOffers('daemmerhain')[0];
  assert.equal(game.acceptContract(next.id), true);
  assert.equal(game.contracts.active.length, 3);
  assert.equal(game.acceptContract(game.contractOffers('daemmerhain')[1].id), false);
  const captured = clone(game.capture());
  const restored = contractGame();
  restored.applySave(captured);
  assert.deepEqual(restored.contracts, game.contracts);
  const corrupted = clone(captured);
  corrupted.contracts.active[0].reward.xp = 1e12;
  assert.throws(() => restored.applySave(corrupted), /Auftragsdaten/);
  assert.deepEqual(restored.contracts, game.contracts);
});

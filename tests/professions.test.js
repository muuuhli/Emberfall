import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEMS, RECIPES as BASE_RECIPES } from '../src/content.js';
import { CLASSES } from '../src/classes.js';
import { EXPANSION_REGIONS } from '../src/expansion.js';
import { validateLootItem, computeItemStats } from '../src/loot.js';
import { PROFESSIONS, PROFESSION_RESOURCES, CRAFT_ITEMS, PROFESSION_RECIPES, BASE_RECIPE_PROFESSIONS, REGION_RESOURCE_TIERS, newProfessionState, professionLevelCap, professionXpToNext, validateProfessionState, awardProfessionXp, getCraftXp, canCraftRecipe, chooseMastery, masteryRank, getProfessionBonuses, getGatherBonus, socketDescriptor, gemResourceId, getSocketMasteryBonus, makeCraftedEquipment, getConsumableProfile } from '../src/professions.js';

const clone = value => JSON.parse(JSON.stringify(value));

test('three professions have twenty concrete recipes and preserve the six legacy assignments', () => {
  assert.equal(PROFESSIONS.length, 3);
  assert.equal(PROFESSION_RECIPES.length, 20);
  assert.equal(new Set(PROFESSION_RECIPES.map(recipe => recipe.id)).size, 20);
  assert.equal(PROFESSION_RECIPES.filter(recipe => recipe.profession === 'alchemy').length, 7);
  assert.equal(PROFESSION_RECIPES.filter(recipe => recipe.profession === 'smith').length, 6);
  assert.equal(PROFESSION_RECIPES.filter(recipe => recipe.profession === 'runecraft').length, 7);
  assert.deepEqual(Object.keys(BASE_RECIPE_PROFESSIONS).sort(), BASE_RECIPES.map(recipe => recipe.id).sort());
  for (const profession of PROFESSIONS) assert.equal(profession.masteries.length, 3);
});

test('twelve tier materials come from the twelve existing frontier regions without replacing raw drops', () => {
  assert.equal(Object.values(PROFESSION_RESOURCES).filter(resource => resource.kind === 'material').length, 12);
  for (const [index, region] of EXPANSION_REGIONS.entries()) {
    const tier = 2 + Math.floor(index / 4);
    assert.equal(REGION_RESOURCE_TIERS[region.id], tier);
    for (const type of ['wood', 'ore', 'herb', 'crystal']) {
      const id = `${type}_t${tier}`;
      assert.deepEqual(getGatherBonus(region.id, type), { [id]: 1 });
      assert.ok(PROFESSION_RESOURCES[id].regions.includes(region.id));
      assert.equal(PROFESSION_RESOURCES[id].baseResource, type);
    }
    assert.deepEqual(getGatherBonus(region.id, 'wheat'), {});
  }
  for (const oldRegion of ['daemmerhain', 'frostgrat', 'aschenmoor', 'glutoede']) assert.deepEqual(getGatherBonus(oldRegion, 'ore'), {});
  assert.deepEqual(getGatherBonus('missing', 'ore'), {});
});

test('every recipe ingredient and output exists, and new endgame recipes require regional materials', () => {
  const baseResources = new Set(['wood', 'ore', 'herb', 'crystal', 'seed', 'wheat', 'dust']);
  for (const recipe of PROFESSION_RECIPES) {
    assert.ok(PROFESSIONS.some(profession => profession.id === recipe.profession));
    assert.ok(recipe.minLevel >= 1 && recipe.minLevel <= 100);
    assert.ok(recipe.minProfessionLevel >= 1 && recipe.minProfessionLevel <= 100);
    assert.ok(recipe.professionXp > 0);
    for (const [id, amount] of Object.entries(recipe.ingredients)) {
      assert.ok(baseResources.has(id) || PROFESSION_RESOURCES[id]);
      assert.ok(Number.isInteger(amount) && amount > 0);
    }
    assert.ok(recipe.outputProfile || CRAFT_ITEMS[recipe.output] || PROFESSION_RESOURCES[recipe.output] || recipe.output === 'dust');
    if (recipe.id !== 'distill_dust') assert.ok(Object.keys(recipe.ingredients).some(id => PROFESSION_RESOURCES[id]), recipe.id);
  }
});

test('strong consumables have real level requirements and share a thirty-second potion profile', () => {
  for (const [id, hp, level] of [['greater_heal', 500, 24], ['superior_heal', 700, 55], ['supreme_heal', 900, 90]]) {
    assert.equal(CRAFT_ITEMS[id].stats.hpRestore, hp);
    assert.equal(getConsumableProfile(id).minLevel, level);
    assert.equal(getConsumableProfile(id).cooldown, 30);
    assert.equal(getConsumableProfile(id).cooldownGroup, 'potion');
    assert.equal(CRAFT_ITEMS[id].craftOnly, true);
  }
  for (const [id, mana, level] of [['greater_mana', 180, 24], ['superior_mana', 280, 55], ['supreme_mana', 380, 95]]) {
    assert.equal(CRAFT_ITEMS[id].stats.manaRestore, mana);
    assert.equal(getConsumableProfile(id).minLevel, level);
    assert.equal(getConsumableProfile(id).cooldown, 30);
  }
  assert.equal(getConsumableProfile('heal_potion').cooldown, 3);
  assert.equal(getConsumableProfile('mana_potion').cooldown, 3);
  assert.equal(getConsumableProfile('hearty_meal').outOfCombat, true);
  assert.equal(getConsumableProfile('frontier_feast').outOfCombat, true);
  assert.equal(getConsumableProfile('frontier_feast').cooldownGroup, 'food');
  assert.equal(getConsumableProfile('missing'), null);
});

test('profession caps follow character milestones and discard overflow XP', () => {
  for (const [playerLevel, cap] of [[1, 10], [9, 10], [10, 25], [24, 25], [25, 50], [49, 50], [50, 75], [74, 75], [75, 100], [100, 100]]) assert.equal(professionLevelCap(playerLevel), cap);
  const state = newProfessionState();
  const result = awardProfessionXp(state, 'alchemy', 1e8, { playerLevel: 24 });
  assert.equal(result.state.alchemy.level, 25);
  assert.equal(result.state.alchemy.xp, 0);
  assert.ok(result.gained < 1e8);
  assert.deepEqual(state, newProfessionState(), 'Award must not mutate its input.');
  assert.ok(result.unlocked.includes('brew_greater_heal'));
  assert.equal(awardProfessionXp(result.state, 'alchemy', 10000, { playerLevel: 24 }).gained, 0);
  assert.equal(awardProfessionXp(result.state, 'alchemy', 0, { playerLevel: 25 }).state.alchemy.level, 25, 'No banked overflow after the cap increases.');
});

test('all three profession recipe ladders can reach level one hundred without a progression gap', () => {
  for (const profession of PROFESSIONS) {
    let state = newProfessionState(), actions = 0;
    const recipes = [...BASE_RECIPES.filter(recipe => BASE_RECIPE_PROFESSIONS[recipe.id] === profession.id), ...PROFESSION_RECIPES.filter(recipe => recipe.profession === profession.id)];
    while (state[profession.id].level < 100 && actions < 1000) {
      const available = recipes.filter(recipe => canCraftRecipe(recipe.id, state, 100) && getCraftXp(recipe, state[profession.id].level) > 0).sort((a, b) => (b.minProfessionLevel || 1) - (a.minProfessionLevel || 1));
      assert.ok(available.length > 0, `${profession.id} must not dead-end at ${state[profession.id].level}.`);
      const chosen = available[0];
      state = awardProfessionXp(state, profession.id, getCraftXp(chosen, state[profession.id].level), { playerLevel: 100 }).state;
      actions++;
    }
    assert.equal(state[profession.id].level, 100);
    assert.ok(actions < 500, `${profession.id} should not require artificial thousands of crafting actions.`);
    assert.equal(state[profession.id].xp, 0);
  }
});

test('trivial legacy crafting cannot level an endgame profession indefinitely', () => {
  assert.ok(getCraftXp('brew_heal', 1) > getCraftXp('brew_heal', 30));
  assert.equal(getCraftXp('brew_heal', 51), 0);
  assert.equal(getCraftXp('forge_ember', 100), 0);
  assert.ok(getCraftXp('bind_ruby_t2', 74) > 0);
  assert.ok(getCraftXp('bind_ruby_t3', 99) > 0);
  assert.equal(getCraftXp({ id: 'invented', professionXp: 1e9 }, 1), 0, 'XP comes from trusted definitions.');
});

test('new recipe requirements match profession caps at their character unlock levels', () => {
  for (const recipe of PROFESSION_RECIPES) {
    assert.ok(recipe.minProfessionLevel <= professionLevelCap(recipe.minLevel), recipe.id);
    const state = newProfessionState();
    state[recipe.profession].level = recipe.minProfessionLevel;
    assert.equal(canCraftRecipe(recipe.id, state, recipe.minLevel), true);
    if (recipe.minLevel > 1) assert.equal(canCraftRecipe(recipe.id, state, recipe.minLevel - 1), false);
  }
});

test('only one of three validated mastery choices per profession is active and ranks derive from level', () => {
  const state = newProfessionState();
  assert.equal(chooseMastery(state, 'alchemy', 'healer'), null);
  state.alchemy.level = 75;
  const healer = chooseMastery(state, 'alchemy', 'healer');
  assert.ok(healer);
  assert.equal(getProfessionBonuses(healer).hpPotionMultiplier, 1.04);
  assert.equal(getProfessionBonuses(healer).manaPotionMultiplier, 1);
  const channeler = chooseMastery(healer, 'alchemy', 'channeler');
  assert.equal(getProfessionBonuses(channeler).hpPotionMultiplier, 1);
  assert.equal(getProfessionBonuses(channeler).manaPotionMultiplier, 1.04);
  assert.equal(healer.alchemy.mastery, 'healer', 'Changing choice returns a new state.');
  assert.equal(chooseMastery(state, 'alchemy', 'invented'), null);
  assert.deepEqual([masteryRank(74), masteryRank(75), masteryRank(90), masteryRank(100)], [0, 1, 2, 3]);
});

test('tank, weapon, caster and socket mastery bonuses are bounded and separate from item truth', () => {
  const state = newProfessionState();
  for (const profession of PROFESSIONS) state[profession.id].level = 100;
  let chosen = chooseMastery(state, 'smith', 'armorer');
  chosen = chooseMastery(chosen, 'runecraft', 'resonance');
  assert.deepEqual(getProfessionBonuses(chosen).stats, { armor: 6, maxHp: 60, spellDamage: 30 });
  const woven = chooseMastery(chosen, 'runecraft', 'weaving');
  const item = { sockets: [{ id: 'emerald', tier: 3 }, 'ruby'] };
  const before = clone(item);
  assert.deepEqual(getSocketMasteryBonus(item, woven), { maxHp: 10.8, crit: 0.0029, damage: 0.6, spellDamage: 0.36 });
  assert.deepEqual(item, before);
});

test('tiered gems round-trip between crafted resource IDs and the existing validated socket schema', () => {
  for (const gem of ['ruby', 'sapphire', 'emerald']) {
    for (const tier of [1, 2, 3]) {
      const id = tier === 1 ? gem : `${gem}_t${tier}`;
      assert.deepEqual(socketDescriptor(id), { id: gem, tier });
      assert.equal(gemResourceId(socketDescriptor(id)), id, 'Salvaging must return the same tier.');
    }
  }
  assert.equal(socketDescriptor('ruby_t4'), null);
  assert.equal(gemResourceId({ id: 'ruby', tier: 9 }), null);
});

test('all four gear recipes create valid instanced equipment for all eight classes', () => {
  const recipes = PROFESSION_RECIPES.filter(recipe => recipe.outputProfile);
  assert.equal(recipes.length, 4);
  let serial = 0;
  for (const recipe of recipes) {
    for (const characterClass of CLASSES) {
      const item = makeCraftedEquipment(recipe.id, { classId: characterClass.id, playerLevel: recipe.minLevel, rng: () => 0.5, uid: `crafted-${++serial}` });
      assert.ok(item);
      assert.equal(validateLootItem(item), true, `${recipe.id}: ${characterClass.id}`);
      assert.equal(item.type, recipe.outputProfile.slot);
      assert.equal(item.level, recipe.outputProfile.level);
      assert.equal(item.rarity, recipe.outputProfile.rarity);
      if (item.type === 'armor' && ['guardian', 'paladin'].includes(characterClass.id)) assert.ok(item.stats.armor > 0 && item.stats.maxHp > 0, 'Tank armor must provide real armor and health.');
      item.sockets[0] = { id: 'ruby', tier: 3 };
      assert.equal(validateLootItem(item), true);
      assert.ok(computeItemStats(item).damage >= 15);
      assert.equal(makeCraftedEquipment(recipe.id, { playerLevel: recipe.minLevel - 1 }), null);
    }
  }
  assert.equal(makeCraftedEquipment('missing'), null);
  assert.equal(makeCraftedEquipment(recipes[0].id, { playerLevel: NaN }), null);
});

test('profession saves reject forged ranks, unknown masteries, malformed XP and levels above the character cap', () => {
  assert.equal(validateProfessionState(newProfessionState(), { playerLevel: 1 }), true);
  for (const mutate of [
    state => { state.version = 99; },
    state => { state.alchemy.level = 101; },
    state => { state.smith.xp = -1; },
    state => { state.runecraft.xp = Infinity; },
    state => { state.alchemy.xp = professionXpToNext(1); },
    state => { state.alchemy.mastery = 'healer'; },
    state => { state.alchemy.level = 75; state.alchemy.mastery = 'invented'; },
    state => { state.smith.masteryRank = 99; },
    state => { state.forgedProfession = { level: 100, xp: 0 }; },
  ]) {
    const state = newProfessionState(); mutate(state); assert.equal(validateProfessionState(state), false);
  }
  const high = newProfessionState(); high.alchemy.level = 75;
  assert.equal(validateProfessionState(high, { playerLevel: 24 }), false);
  assert.throws(() => awardProfessionXp(newProfessionState(), 'invented', 10), TypeError);
  assert.throws(() => awardProfessionXp(newProfessionState(), 'alchemy', Infinity), RangeError);
  assert.ok(ITEMS.heal_potion.stats.hpRestore === 65, 'Legacy item definitions stay unchanged.');
});

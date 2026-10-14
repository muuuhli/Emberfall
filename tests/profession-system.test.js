import test from 'node:test';
import assert from 'node:assert/strict';
import { RECIPES, ITEMS, RESOURCES, NPCS } from '../src/catalog.js';
import { RECIPES as BASE_RECIPES } from '../src/content.js';
import { EXTRA_RECIPES } from '../src/arsenal.js';
import { EQUIPMENT_RECIPES, equipmentBudget } from '../src/equipment-system.js';
import { JOURNEY_RECIPES } from '../src/journey.js';
import { CLASSES } from '../src/classes.js';
import { ITEM_BASES, validateLootItem, equipmentRequiredLevel } from '../src/loot.js';
import { EXPANSION_REGIONS } from '../src/expansion.js';
import { PROFESSIONS, PROFESSION_RECIPES, PROFESSION_RESOURCES, CRAFT_ITEMS, newProfessionState, validateProfessionState, professionLevelCap, professionXpToNext, awardProfessionXp, getProfessionBonuses, getSocketMasteryBonus, getGatherBonus, makeCraftedEquipment } from '../src/professions.js';
import { PROFESSION_TRAINERS, validateProfessionTraining, getRecipeProfession, isProfessionTrained, canTrainProfession, canChooseProfessionMastery, craftProfessionGate, craftedEquipmentPreview, professionSummary } from '../src/profession-system.js';

const legacy = [...BASE_RECIPES, ...EXTRA_RECIPES, ...EQUIPMENT_RECIPES, ...JOURNEY_RECIPES];
function fixture(id = 'alchemy', level = 1) {
  const teacher = PROFESSION_TRAINERS[id];
  return { started: true, dead: false, worldMode: 'overworld', world: {}, inCombat: false, player: { level, hp: 50, mana: 10, gold: 60, x: teacher.x, y: teacher.y }, professions: newProfessionState(), professionTraining: [] };
}
const clone = value => structuredClone(value);

test('catalog appends twenty professional recipes and seven supplies without changing the legacy 104 definitions', () => {
  assert.equal(legacy.length, 104); assert.deepEqual(RECIPES.slice(0, legacy.length), legacy);
  assert.deepEqual(RECIPES.slice(104), PROFESSION_RECIPES); assert.equal(new Set(RECIPES.map(r => r.id)).size, 124);
  for (const [id, item] of Object.entries(CRAFT_ITEMS)) assert.equal(ITEMS[id], item);
  for (const [id, resource] of Object.entries(PROFESSION_RESOURCES)) assert.equal(RESOURCES[id], resource);
  assert.equal(Object.keys(CRAFT_ITEMS).length, 7); assert.equal(Object.keys(PROFESSION_RESOURCES).length, 20);
});

test('canonical teachers reuse real NPC coordinates and 20 gold/85 px training contract', () => {
  for (const [id, teacher] of Object.entries(PROFESSION_TRAINERS)) {
    const npc = NPCS.find(n => n.id === teacher.npcId); assert.deepEqual([teacher.x, teacher.y, teacher.name], [npc.x, npc.y, npc.name]);
    assert.equal(teacher.cost, 20); assert.equal(teacher.range, 85);
    const game = fixture(id), before = clone(game); assert.equal(canTrainProfession(game, id).ok, true); assert.deepEqual(game, before);
    game.player.gold = 19; assert.equal(canTrainProfession(game, id).code, 'gold'); game.player.gold = 20;
    game.player.x += 84; assert.equal(canTrainProfession(game, id).ok, true); game.player.x += 1; assert.equal(canTrainProfession(game, id).code, 'teacher_distance');
  }
});

test('teacher actions reject dead, before-start, combat, interior and malformed contexts', () => {
  for (const [mutate, code] of [[g => g.started = false, 'not_started'], [g => g.dead = true, 'dead'], [g => g.player.hp = 0, 'dead'], [g => g.inCombat = true, 'combat'], [g => g.world.isDungeon = true, 'overworld'], [g => g.worldMode = 'pvp', 'overworld'], [g => g.player.x = NaN, 'teacher_distance'], [g => g.professionTraining = null, 'invalid_state'], [g => g.professions = null, 'invalid_state'], [g => delete g.player.level, 'invalid_state']]) {
    const g = fixture(); mutate(g); assert.equal(canTrainProfession(g, 'alchemy').code, code);
  }
  for (const id of ['invented', '__proto__', 'constructor', '', null]) assert.equal(canTrainProfession(fixture(), id).code, 'unknown_profession');
  const plain = fixture(); delete plain.started; assert.equal(canTrainProfession(plain, 'alchemy').ok, true, 'plain UI adapters may omit started');
});

test('separate training IDs allow all three careers and reject any unlearned advanced progress', () => {
  for (const value of [null, {}, ['alchemy', 'alchemy'], ['unknown'], ['smith', 'alchemy', 'runecraft', 'smith']]) assert.equal(validateProfessionTraining(value), false);
  assert.equal(validateProfessionTraining([]), true); assert.equal(validateProfessionTraining(['smith', 'alchemy', 'runecraft']), true);
  const g = fixture(); g.professionTraining = ['alchemy']; assert.equal(isProfessionTrained(g, 'alchemy'), true); assert.equal(canTrainProfession(g, 'alchemy').code, 'already_trained');
  const advanced = awardProfessionXp(newProfessionState(), 'alchemy', 40, { playerLevel: 1 }).state;
  assert.equal(validateProfessionTraining([], { state: advanced, playerLevel: 1 }), false);
  assert.equal(validateProfessionTraining(['alchemy'], { state: advanced, playerLevel: 1 }), true);
});

test('all existing canonical recipes remain craftable without professional training or teacher restrictions', () => {
  const g = fixture(); g.started = false; g.dead = true; g.inCombat = true; g.world.isDungeon = true; g.player.x = 19000;
  for (const recipe of legacy) { const gate = craftProfessionGate(g, recipe); assert.equal(gate.ok, true, recipe.id); assert.equal(gate.code, 'legacy'); assert.equal(gate.xpGain, 0); }
  assert.equal(craftProfessionGate(g, 'forged-new-recipe').ok, false);
  assert.equal(getRecipeProfession({ id: 'forge_forest', profession: 'runecraft' }), 'smith');
  assert.equal(getRecipeProfession({ id: 'invented', profession: 'alchemy' }), null);
});

test('new recipe gates resolve trusted requirements and allow profession25 at character24', () => {
  const g = fixture('alchemy', 24), recipe = PROFESSION_RECIPES.find(r => r.id === 'brew_greater_heal');
  assert.equal(craftProfessionGate(g, recipe).code, 'untrained'); g.professionTraining = ['alchemy'];
  assert.equal(craftProfessionGate(g, recipe).code, 'profession_level'); g.professions = awardProfessionXp(g.professions, 'alchemy', 99999, { playerLevel: 24 }).state;
  assert.equal(g.professions.alchemy.level, 25); assert.equal(craftProfessionGate(g, recipe).ok, true); assert.equal(craftProfessionGate(g, recipe).xpGain, 0);
  g.player.level = 25; assert.equal(craftProfessionGate(g, { id: recipe.id, minLevel: 1, minProfessionLevel: 1, profession: 'smith' }).xpGain, 100);
  g.player.x = PROFESSION_TRAINERS.smith.x; g.player.y = PROFESSION_TRAINERS.smith.y; assert.equal(craftProfessionGate(g, recipe.id).code, 'teacher_distance');
  const rune = fixture('runecraft', 5); rune.professionTraining = ['runecraft']; assert.equal(craftProfessionGate(rune, 'distill_dust').code, 'character_level'); rune.player.level = 6; assert.equal(craftProfessionGate(rune, 'distill_dust').ok, true);
});

test('only six trusted original recipes grant XP and training/caps determine actual award', () => {
  const g = fixture('smith', 10); assert.equal(craftProfessionGate(g, 'forge_forest').xpGain, 0);
  g.professionTraining = ['smith']; const gate = craftProfessionGate(g, { id: 'forge_forest', professionXp: 1e9 }); assert.equal(gate.xpGain, 40);
  assert.equal(craftProfessionGate(g, EXTRA_RECIPES[0].id).xpGain, 0);
  g.professions = awardProfessionXp(g.professions, 'smith', 1e9, { playerLevel: 10 }).state; assert.equal(craftProfessionGate(g, 'forge_forest').xpGain, 0);
});

test('XP stockpiles at every character cap are invalid and cannot be released by levelling', () => {
  for (const characterLevel of [1, 10, 24, 25, 50, 75, 100]) {
    const state = awardProfessionXp(newProfessionState(), 'smith', 1e9, { playerLevel: characterLevel }).state;
    assert.equal(state.smith.level, professionLevelCap(characterLevel)); assert.equal(state.smith.xp, 0);
    assert.equal(awardProfessionXp(state, 'smith', 1e9, { playerLevel: characterLevel }).gained, 0);
    state.smith.xp = 1; assert.equal(validateProfessionState(state, { playerLevel: characterLevel }), false);
  }
  const capped = awardProfessionXp(newProfessionState(), 'alchemy', 1e9, { playerLevel: 24 }).state;
  assert.equal(awardProfessionXp(capped, 'alchemy', 0, { playerLevel: 25 }).state.alchemy.level, 25);
});

test('regional side yields require actual region level while preserving the old two-argument pure helper', () => {
  for (const region of EXPANSION_REGIONS) {
    for (const type of ['wood', 'ore', 'herb', 'crystal']) {
      assert.deepEqual(getGatherBonus(region.id, type, { playerLevel: region.level - 1 }), {});
      assert.deepEqual(getGatherBonus(region.id, type, { playerLevel: region.level }), getGatherBonus(region.id, type));
    }
    assert.deepEqual(getGatherBonus(region.id, 'herb', { playerLevel: NaN }), {});
  }
  assert.deepEqual(getGatherBonus('sonnensteppe', 'herb', { playerLevel: 12 }), { herb_t2: 1 });
  assert.deepEqual(getGatherBonus('obsidianpass', 'ore', { playerLevel: 44 }), { ore_t3: 1 });
  assert.deepEqual(getGatherBonus('traumsenke', 'crystal', { playerLevel: 76 }), { crystal_t4: 1 });
});

test('mastery chooses one learned career bonus at teacher75 and never changes HP or mana', () => {
  const g = fixture('smith', 50); g.professionTraining = ['smith'];
  g.professions = awardProfessionXp(g.professions, 'smith', 1e9, { playerLevel: 50 }).state;
  const before = clone(g); assert.equal(canChooseProfessionMastery(g, 'smith', 'armorer').ok, true); assert.deepEqual(g, before);
  assert.equal(canChooseProfessionMastery(g, 'smith', 'constructor').code, 'unknown_mastery');
  g.professions.smith.mastery = 'armorer'; assert.equal(canChooseProfessionMastery(g, 'smith', 'armorer').code, 'already_chosen');
  assert.deepEqual(getProfessionBonuses(g.professions, { training: [] }).stats, {}); assert.deepEqual(getProfessionBonuses(g.professions, { training: ['smith'] }).stats, { armor: 2, maxHp: 20 });
  assert.deepEqual([g.player.hp, g.player.mana], [50, 10]);
});

test('socket mastery multiplies the canonical slot budget and respects learned runecraft', () => {
  const state = awardProfessionXp(newProfessionState(), 'runecraft', 1e9).state; state.runecraft.mastery = 'weaving';
  const item = { baseId: 'relic_ring_1_2', type: 'charm', slot: 'ring', sockets: [{ id: 'ruby', tier: 3 }] };
  assert.equal(equipmentBudget(ITEM_BASES.find(b => b.id === item.baseId)), .28);
  assert.deepEqual(getSocketMasteryBonus(item, state, { training: ['runecraft'] }), { damage: .504, spellDamage: .3024 });
  assert.deepEqual(getSocketMasteryBonus(item, state, { training: ['smith'] }), {});
});

test('all four class-aware equipment previews and outputs keep native requirements and rolled balance rules', () => {
  const recipes = PROFESSION_RECIPES.filter(r => r.outputProfile); let serial = 0;
  for (const cls of CLASSES) for (const recipe of recipes) {
    const preview = craftedEquipmentPreview(recipe, { classId: cls.id }), item = makeCraftedEquipment(recipe.id, { classId: cls.id, playerLevel: recipe.minLevel, rng: () => .5, uid: `profession-native-${serial++}` });
    assert.ok(preview && preview.craftPreview && !preview.generatedStats); assert.equal(preview.stats, undefined); assert.equal(preview.level, recipe.outputProfile.level);
    assert.ok(item && validateLootItem(item)); assert.equal(item.balanceVersion, 2); assert.equal(equipmentRequiredLevel(item), recipe.outputProfile.level);
    assert.ok(!ITEM_BASES.find(b => b.id === item.baseId).classIds || ITEM_BASES.find(b => b.id === item.baseId).classIds.includes(cls.id));
  }
});

test('summary is read-only and exposes the same gates, caps, canonical XP and teachers as the core', () => {
  const g = fixture('alchemy', 24); g.professionTraining = ['alchemy']; const before = clone(g), summary = professionSummary(g);
  assert.deepEqual(g, before); assert.equal(summary.length, 3);
  for (const row of summary) {
    assert.equal(row.cap, 25); assert.deepEqual(row.canTrain, canTrainProfession(g, row.id)); assert.equal(row.trainer, PROFESSION_TRAINERS[row.id]);
    for (const r of row.recipes) assert.deepEqual(r, { id: r.id, ...craftProfessionGate(g, r.id) });
  }
  assert.ok(summary.find(p => p.id === 'alchemy').trained); assert.equal(professionXpToNext(1), 14);
});

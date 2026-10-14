import { RECIPES, NPCS } from './catalog.js';
import { getClass } from './classes.js';
import { ITEM_BASES } from './loot.js';
import { equipmentSlot } from './equipment-system.js';
import { PROFESSIONS, PROFESSION_RECIPES, BASE_RECIPE_PROFESSIONS, newProfessionState, validateProfessionState, professionLevelCap, professionXpToNext, getCraftXp, awardProfessionXp, masteryRank } from './professions.js';

const knownIds = new Set(PROFESSIONS.map(p => p.id));
const newRecipes = new Map(PROFESSION_RECIPES.map(recipe => [recipe.id, recipe]));
const allRecipes = new Map(RECIPES.map(recipe => [recipe.id, recipe]));
const recipeId = value => typeof value === 'string' ? value : value?.id;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const trainingOf = game => game?.professionTraining === undefined ? [] : game.professionTraining;
const stateOf = game => game?.professions === undefined ? newProfessionState() : game.professions;

export const PROFESSION_TRAINERS = Object.freeze(Object.fromEntries([['smith', 'elin'], ['alchemy', 'sera'], ['runecraft', 'mira']].map(([professionId, npcId]) => {
  const npc = NPCS.find(npc => npc.id === npcId);
  return [professionId, Object.freeze({ professionId, npcId, name: npc.name, x: npc.x, y: npc.y, cost: 20, range: 85 })];
})));

/** Separate learned IDs preserve v1 progress and safely migrate absent legacy fields. */
export function validateProfessionTraining(training, { state, playerLevel } = {}) {
  if (!Array.isArray(training) || training.length > 3 || new Set(training).size !== training.length || training.some(id => !knownIds.has(id))) return false;
  if (state !== undefined) {
    if (!validateProfessionState(state, { playerLevel })) return false;
    for (const id of knownIds) if (!training.includes(id) && (state[id].level !== 1 || state[id].xp !== 0 || state[id].mastery !== null)) return false;
  }
  return true;
}
export function getRecipeProfession(recipeOrId) {
  const id = recipeId(recipeOrId);
  return newRecipes.get(id)?.profession ?? (Object.hasOwn(BASE_RECIPE_PROFESSIONS, id) ? BASE_RECIPE_PROFESSIONS[id] : null);
}
export function isProfessionTrained(game, professionId) {
  const training = trainingOf(game);
  return knownIds.has(professionId) && validateProfessionTraining(training) && training.includes(professionId);
}
function result(professionId, ok, code, reason = null, extra = {}) {
  return { ok, reason, code, professionId, trainer: knownIds.has(professionId) ? PROFESSION_TRAINERS[professionId] : null, ...extra };
}
function actorGate(game, professionId) {
  const player = game?.player, trainer = knownIds.has(professionId) ? PROFESSION_TRAINERS[professionId] : null;
  if (!trainer) return result(professionId, false, 'unknown_profession', 'Dieser Beruf ist nicht bekannt.');
  if (game?.started === false) return result(professionId, false, 'not_started', 'Beginne deine Reise zuerst.');
  if (!player || game.dead || player.downed || !Number.isFinite(player.hp) || player.hp <= 0) return result(professionId, false, 'dead', 'Du musst lebend beim Lehrer stehen.');
  if (!game.world || game.world.isDungeon || game.world.isPvp || game.worldMode === 'pvp' || game.dungeonInstance) return result(professionId, false, 'overworld', 'Berufe werden in der Oberwelt bei ihrem Lehrer gelernt und ausgeübt.');
  const combat = typeof game.inCombat === 'function' ? game.inCombat() : game.inCombat;
  if (combat) return result(professionId, false, 'combat', 'Dafür brauchst du einen ruhigen Moment außerhalb des Kampfes.');
  if (!Number.isFinite(player.x) || !Number.isFinite(player.y) || Math.hypot(player.x - trainer.x, player.y - trainer.y) >= trainer.range) return result(professionId, false, 'teacher_distance', `Sprich dafür mit ${trainer.name}.`);
  return result(professionId, true, 'ready');
}
function progressValid(game) {
  return professionLevelCap(game?.player?.level) > 0 && validateProfessionTraining(trainingOf(game), { state: stateOf(game), playerLevel: game?.player?.level });
}
export function canTrainProfession(game, professionId) {
  const actor = actorGate(game, professionId); if (!actor.ok) return actor;
  if (!progressValid(game)) return result(professionId, false, 'invalid_state', 'Dein Berufsfortschritt ist ungültig.');
  if (isProfessionTrained(game, professionId)) return result(professionId, false, 'already_trained', 'Diesen Beruf hast du bereits gelernt.');
  if (trainingOf(game).length >= 3) return result(professionId, false, 'training_full', 'Du hast bereits alle drei Berufe gelernt.');
  if (!Number.isFinite(game.player.gold) || game.player.gold < actor.trainer.cost) return result(professionId, false, 'gold', `Die Ausbildung kostet ${actor.trainer.cost} Gold.`);
  return actor;
}
export function canChooseProfessionMastery(game, professionId, choice) {
  const actor = actorGate(game, professionId); if (!actor.ok) return actor;
  if (!progressValid(game)) return result(professionId, false, 'invalid_state', 'Dein Berufsfortschritt ist ungültig.');
  if (!isProfessionTrained(game, professionId)) return result(professionId, false, 'untrained', 'Lerne zuerst diesen Beruf.');
  const profession = PROFESSIONS.find(p => p.id === professionId), progress = stateOf(game)[professionId];
  if (!profession.masteries.some(mastery => mastery.id === choice)) return result(professionId, false, 'unknown_mastery', 'Diese Meisterschaft gehört nicht zu diesem Beruf.');
  if (progress.level < 75) return result(professionId, false, 'profession_level', 'Meisterschaften werden ab Berufsstufe 75 verfügbar.');
  if (progress.mastery === choice) return result(professionId, false, 'already_chosen', 'Diese Meisterschaft ist bereits aktiv.');
  return actor;
}
function xpInfo(game, id, professionId) {
  const state = stateOf(game), trained = isProfessionTrained(game, professionId);
  if (!professionId || !trained || !progressValid(game)) return { professionLevel: state?.[professionId]?.level || 1, professionXp: 0, xpGain: 0 };
  const professionLevel = state[professionId].level, professionXp = getCraftXp(id, professionLevel);
  const xpGain = awardProfessionXp(state, professionId, professionXp, { playerLevel: game.player.level }).gained;
  return { professionLevel, professionXp, xpGain };
}

/** Materials, class and journey gates remain the authoritative craft caller's job.
 * Old canonical recipes never gain a new profession/teacher restriction.
 */
export function craftProfessionGate(game, recipeOrId) {
  const id = recipeId(recipeOrId), recipe = allRecipes.get(id), professionId = getRecipeProfession(id);
  if (!recipe) return result(null, false, 'unknown_recipe', 'Dieses Rezept ist nicht bekannt.', { professionXp: 0, xpGain: 0 });
  const xp = xpInfo(game, id, professionId);
  if (!newRecipes.has(id)) return result(professionId, true, 'legacy', null, xp);
  if (!progressValid(game)) return result(professionId, false, 'invalid_state', 'Dein Berufsfortschritt ist ungültig.', xp);
  if (!isProfessionTrained(game, professionId)) return result(professionId, false, 'untrained', `Lerne ${PROFESSIONS.find(p => p.id === professionId).name} zuerst bei ${PROFESSION_TRAINERS[professionId].name}.`, xp);
  if (game.player.level < recipe.minLevel) return result(professionId, false, 'character_level', `Benötigt Charakterstufe ${recipe.minLevel}.`, xp);
  if (stateOf(game)[professionId].level < recipe.minProfessionLevel) return result(professionId, false, 'profession_level', `Benötigt Berufsstufe ${recipe.minProfessionLevel}.`, xp);
  const actor = actorGate(game, professionId); return { ...actor, ...xp };
}

/** Canonical future output illustration. No RNG, loot UID, rolled stats or item grant. */
export function craftedEquipmentPreview(recipeOrId, { classId = 'guardian' } = {}) {
  const recipe = newRecipes.get(recipeId(recipeOrId)), profile = recipe?.outputProfile;
  if (!profile) return null;
  const cls = getClass(classId), armored = ['guardian', 'paladin'].includes(cls.id), agile = ['ranger', 'nightblade'].includes(cls.id);
  let candidates = ITEM_BASES.filter(base => equipmentSlot(base) === profile.slot && base.minLevel <= profile.level && (!base.classIds || base.classIds.includes(cls.id)));
  if (profile.slot === 'armor') {
    const preferred = candidates.filter(base => armored ? base.stats.armor > 0 && base.stats.maxHp > 0 : agile ? base.stats.speed > 0 || base.stats.dodgeCooldown > 0 : base.stats.mana > 0 || base.stats.manaRegen > 0);
    if (preferred.length) candidates = preferred;
  }
  candidates.sort((a, b) => b.minLevel - a.minLevel || a.id.localeCompare(b.id)); const base = candidates[0]; if (!base) return null;
  return { id: base.id, baseId: base.id, name: base.name, type: base.type, slot: profile.slot, rarity: profile.rarity, level: profile.level, minLevel: profile.level, craftPreview: true, generatedStats: false };
}
export function professionSummary(game) {
  const state = stateOf(game), cap = professionLevelCap(game?.player?.level), valid = progressValid(game);
  return PROFESSIONS.map(profession => {
    const progress = valid ? state[profession.id] : newProfessionState()[profession.id], trained = valid && isProfessionTrained(game, profession.id);
    return { id: profession.id, name: profession.name, description: profession.description, trained, level: progress.level, xp: progress.xp, xpToNext: progress.level >= cap ? 0 : professionXpToNext(progress.level), cap, capped: progress.level >= cap, mastery: progress.mastery, masteryRank: masteryRank(progress.level), trainer: PROFESSION_TRAINERS[profession.id], canTrain: canTrainProfession(game, profession.id),
      masteries: profession.masteries.map(choice => ({ ...choice, active: progress.mastery === choice.id, canChoose: canChooseProfessionMastery(game, profession.id, choice.id) })),
      recipes: PROFESSION_RECIPES.filter(recipe => recipe.profession === profession.id).map(recipe => ({ id: recipe.id, ...craftProfessionGate(game, recipe.id) })),
    };
  });
}

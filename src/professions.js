import { ITEMS as BASE_ITEMS } from './content.js';
import { EXPANSION_REGIONS } from './expansion.js';
import { getClass } from './classes.js';
import { MAX_LEVEL } from './progression.js';
import { ITEM_BASES, GEM_TYPES, generateLoot } from './loot.js';
import { equipmentSlot } from './equipment-system.js';

export const BASE_RECIPE_PROFESSIONS = {
  brew_heal: 'alchemy', brew_mana: 'alchemy', bake_bread: 'alchemy',
  forge_forest: 'smith', forge_mail: 'smith', forge_ember: 'smith',
};

export const PROFESSIONS = [
  { id: 'alchemy', name: 'Alchemie', description: 'Braue starke Heil- und Äthertränke sowie Proviant für schwere Expeditionen.', masteries: [
    { id: 'healer', name: 'Lebenskunst', description: 'Heiltränke stellen pro Meisterschaftsrang 4 % mehr Leben wieder her.' },
    { id: 'channeler', name: 'Ätherkunde', description: 'Äthertränke stellen pro Meisterschaftsrang 4 % mehr Mana wieder her.' },
    { id: 'provisioner', name: 'Hüter der Vorräte', description: 'Mahlzeiten stärken Leben und Mana pro Meisterschaftsrang 8 % mehr.' },
  ] },
  { id: 'smith', name: 'Schmiedekunst', description: 'Verarbeite regionales Erz und fertige Waffen und Rüstungen für deine Klasse.', masteries: [
    { id: 'armorer', name: 'Bastionsschmied', description: '+2 Rüstung und +20 maximales Leben pro Meisterschaftsrang.' },
    { id: 'weaponsmith', name: 'Klingenschmied', description: '+6 Waffenschaden pro Meisterschaftsrang.' },
    { id: 'tempering', name: 'Glutvergüter', description: '+0,5 % kritische Treffer und +0,8 % Abklingzeitverkürzung pro Meisterschaftsrang.' },
  ] },
  { id: 'runecraft', name: 'Runenkunst', description: 'Binde Kristalle zu hochwertigen Sockelsteinen und meistere ihre Resonanz.', masteries: [
    { id: 'resonance', name: 'Sternenresonanz', description: '+10 Zauberkraft pro Meisterschaftsrang.' },
    { id: 'clarity', name: 'Klare Quelle', description: '+20 Mana und +0,6 Mana-Regeneration pro Meisterschaftsrang.' },
    { id: 'weaving', name: 'Runenweber', description: 'Sockelsteinboni wirken pro Meisterschaftsrang 4 % stärker.' },
  ] },
];

const tierNames = {
  2: { wood: 'Lebendes Hainholz', ore: 'Sturmeisen', herb: 'Jadekraut', crystal: 'Gezeitenkristall' },
  3: { wood: 'Mondholz', ore: 'Obsidianerz', herb: 'Frostblüte', crystal: 'Mondsplitter' },
  4: { wood: 'Sternenholz', ore: 'Quellenerz', herb: 'Traumlotus', crystal: 'Nexuskristall' },
};
export const REGION_RESOURCE_TIERS = Object.fromEntries(EXPANSION_REGIONS.map((region, index) => [region.id, 2 + Math.floor(index / 4)]));
export const PROFESSION_RESOURCES = {};
for (const tier of [2, 3, 4]) {
  for (const type of ['wood', 'ore', 'herb', 'crystal']) {
    const id = `${type}_t${tier}`;
    PROFESSION_RESOURCES[id] = { id, name: tierNames[tier][type], label: tierNames[tier][type], icon: type === 'wood' || type === 'herb' ? '❧' : '◆', color: tier === 2 ? '#8fc49a' : tier === 3 ? '#a9bad7' : '#d4a9e2', kind: 'material', tier, baseResource: type, regions: EXPANSION_REGIONS.filter(region => REGION_RESOURCE_TIERS[region.id] === tier).map(region => region.id), description: `Material der Stufe ${tier} aus den entsprechenden Grenzlanden. Wird zusätzlich zu gewöhnlichen Ressourcen gesammelt.` };
  }
}
for (const tier of [3, 4]) {
  const id = `alloy_t${tier}`;
  PROFESSION_RESOURCES[id] = { id, name: tier === 3 ? 'Mondstahl' : 'Quellenstahl', label: tier === 3 ? 'Mondstahl' : 'Quellenstahl', icon: '◆', color: tier === 3 ? '#b4c4d8' : '#d9b5db', kind: 'alloy', tier, description: 'Veredelte Legierung für geschmiedete Ausrüstung.' };
}
for (const tier of [2, 3]) {
  for (const id of Object.keys(GEM_TYPES)) {
    const resourceId = `${id}_t${tier}`;
    PROFESSION_RESOURCES[resourceId] = { id: resourceId, name: `${tier === 2 ? 'Reiner' : 'Makelloser'} ${GEM_TYPES[id].name}`, label: `${tier === 2 ? 'Reiner' : 'Makelloser'} ${GEM_TYPES[id].name}`, icon: '♦', color: GEM_TYPES[id].color, kind: 'gem', tier, gemId: id, description: `Sockelstein der Stufe ${tier}. Gewährt das ${tier}-Fache der Grundboni dieses Edelsteins.` };
  }
}

const consumable = (id, name, level, hpRestore, manaRestore, tier, food = false) => ({
  id, name, type: 'consumable', rarity: tier === 2 ? 'uncommon' : tier === 3 ? 'rare' : 'epic', icon: food ? '♨' : hpRestore ? '✚' : '◈',
  level, minLevel: level, craftOnly: true, cooldown: food ? 10 : 30, cooldownGroup: food ? 'food' : 'potion', outOfCombat: food,
  description: food ? `Nur außerhalb des Kampfes. Stellt ${hpRestore} Leben und ${manaRestore} Mana wieder her.` : `Stellt ${hpRestore ? `${hpRestore} Leben` : `${manaRestore} Mana`} wieder her. Teilt 30 Sekunden Abklingzeit mit anderen starken Tränken.`,
  stats: { ...(hpRestore ? { hpRestore } : {}), ...(manaRestore ? { manaRestore } : {}) }, price: 45 + level * 3,
});
export const CRAFT_ITEMS = {
  greater_heal: consumable('greater_heal', 'Sturmkraut-Heiltrank', 24, 500, 0, 2),
  superior_heal: consumable('superior_heal', 'Mondblüten-Heiltrank', 55, 700, 0, 3),
  supreme_heal: consumable('supreme_heal', 'Quellen-Heiltrank', 90, 900, 0, 4),
  greater_mana: consumable('greater_mana', 'Gezeiten-Äthertrank', 24, 0, 180, 2),
  superior_mana: consumable('superior_mana', 'Mond-Äthertrank', 55, 0, 280, 3),
  supreme_mana: consumable('supreme_mana', 'Nexus-Äthertrank', 95, 0, 380, 4),
  frontier_feast: consumable('frontier_feast', 'Mahl der freien Lande', 65, 650, 180, 3, true),
};
const recipe = (id, name, profession, minProfessionLevel, minLevel, ingredients, output, professionXp, changes = {}) => ({ id, name, profession, minProfessionLevel, minLevel, ingredients, output, amount: 1, professionXp, description: `${PROFESSIONS.find(entry => entry.id === profession).name} ${minProfessionLevel} · Charakterstufe ${minLevel}.`, ...changes });
const gearRecipe = (id, name, rank, level, ingredients, slot, rarity) => recipe(id, name, 'smith', rank, level, ingredients, null, rank * 3 + 50, { outputProfile: { kind: 'gear', slot, rarity, level }, description: 'Fertigt eine instanzierte, für deine Klasse passende Ausrüstung mit gerollten Affixen und Sockeln.' });

export const PROFESSION_RECIPES = [
  recipe('brew_greater_heal', 'Sturmkraut-Heiltrank brauen', 'alchemy', 25, 24, { herb_t2: 5, crystal_t2: 2 }, 'greater_heal', 100),
  recipe('brew_greater_mana', 'Gezeiten-Äthertrank brauen', 'alchemy', 25, 24, { herb_t2: 3, crystal_t2: 4 }, 'greater_mana', 100),
  recipe('brew_superior_heal', 'Mondblüten-Heiltrank brauen', 'alchemy', 50, 55, { herb_t3: 6, crystal_t3: 3 }, 'superior_heal', 160),
  recipe('brew_superior_mana', 'Mond-Äthertrank brauen', 'alchemy', 50, 55, { herb_t3: 4, crystal_t3: 6 }, 'superior_mana', 160),
  recipe('brew_supreme_heal', 'Quellen-Heiltrank brauen', 'alchemy', 85, 90, { herb_t4: 8, crystal_t4: 4 }, 'supreme_heal', 260),
  recipe('brew_supreme_mana', 'Nexus-Äthertrank brauen', 'alchemy', 90, 95, { herb_t4: 5, crystal_t4: 8 }, 'supreme_mana', 280),
  recipe('cook_frontier_feast', 'Mahl der freien Lande kochen', 'alchemy', 60, 65, { wheat: 8, herb_t3: 4, crystal_t3: 1 }, 'frontier_feast', 200),
  recipe('smelt_moonsteel', 'Mondstahl veredeln', 'smith', 50, 44, { ore_t3: 6, crystal_t3: 2, dust: 2 }, 'alloy_t3', 160, { amount: 2 }),
  recipe('smelt_sourcesteel', 'Quellenstahl veredeln', 'smith', 75, 76, { ore_t4: 8, crystal_t4: 3, dust: 4 }, 'alloy_t4', 240, { amount: 2 }),
  gearRecipe('forge_frontier_weapon', 'Grenzlandwaffe schmieden', 25, 30, { ore_t2: 12, wood_t2: 5, crystal_t2: 4, dust: 8 }, 'weapon', 'rare'),
  gearRecipe('forge_moon_armor', 'Mondrüstung schmieden', 50, 50, { alloy_t3: 4, wood_t3: 4, dust: 10 }, 'armor', 'rare'),
  gearRecipe('forge_source_weapon', 'Quellenwaffe schmieden', 80, 80, { alloy_t4: 6, wood_t4: 5, crystal_t4: 6, dust: 18 }, 'weapon', 'epic'),
  gearRecipe('forge_source_armor', 'Quellenrüstung schmieden', 90, 90, { alloy_t4: 8, wood_t4: 6, crystal_t4: 4, dust: 20 }, 'armor', 'epic'),
  recipe('distill_dust', 'Arkanstaub destillieren', 'runecraft', 1, 6, { crystal: 4, herb: 1 }, 'dust', 40, { amount: 4 }),
  ...Object.keys(GEM_TYPES).map((gem, index) => recipe(`bind_${gem}_t2`, `${PROFESSION_RESOURCES[`${gem}_t2`].name} binden`, 'runecraft', 25, 24, { crystal_t2: 10, dust: 8, [['ore_t2', 'wood_t2', 'herb_t2'][index]]: 3 }, `${gem}_t2`, 200)),
  ...Object.keys(GEM_TYPES).map(gem => recipe(`bind_${gem}_t3`, `${PROFESSION_RESOURCES[`${gem}_t3`].name} binden`, 'runecraft', 75, 80, { [`${gem}_t2`]: 2, crystal_t4: 8, dust: 15 }, `${gem}_t3`, 320)),
];

export function newProfessionState() {
  return { version: 1, ...Object.fromEntries(PROFESSIONS.map(entry => [entry.id, { level: 1, xp: 0, mastery: null }])) };
}
export function professionLevelCap(playerLevel) {
  if (!Number.isInteger(playerLevel) || playerLevel < 1 || playerLevel > MAX_LEVEL) return 0;
  return playerLevel >= 75 ? 100 : playerLevel >= 50 ? 75 : playerLevel >= 25 ? 50 : playerLevel >= 10 ? 25 : 10;
}
export function professionXpToNext(level) { return Number.isInteger(level) && level >= 1 && level < 100 ? 12 + level * 2 : 0; }
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));

export function validateProfessionState(state, { playerLevel } = {}) {
  if (!record(state) || state.version !== 1 || Object.keys(state).length !== 4) return false;
  const cap = playerLevel == null ? 100 : professionLevelCap(playerLevel);
  if (!cap) return false;
  return PROFESSIONS.every(profession => {
    const progress = state[profession.id];
    if (!record(progress) || Object.keys(progress).length !== 3 || !Object.hasOwn(progress, 'mastery')) return false;
    if (!Number.isInteger(progress.level) || progress.level < 1 || progress.level > cap || !Number.isInteger(progress.xp) || progress.xp < 0) return false;
    if (progress.level === 100 ? progress.xp !== 0 : progress.xp >= professionXpToNext(progress.level)) return false;
    return progress.mastery === null || (progress.level >= 75 && profession.masteries.some(mastery => mastery.id === progress.mastery));
  });
}

/** Pure award; cap overflow is discarded so early stockpiling cannot bank endgame profession levels. */
export function awardProfessionXp(state, professionId, amount, { playerLevel = 100 } = {}) {
  if (!validateProfessionState(state, { playerLevel }) || !PROFESSIONS.some(entry => entry.id === professionId)) throw new TypeError('Ungültiger Berufsfortschritt.');
  if (!Number.isFinite(amount) || amount < 0) throw new RangeError('Berufserfahrung muss eine endliche positive Zahl sein.');
  const result = clone(state), progress = result[professionId], cap = professionLevelCap(playerLevel), oldLevel = progress.level;
  let remainingToCap = -progress.xp;
  for (let level = progress.level; level < cap; level++) remainingToCap += professionXpToNext(level);
  const gained = Math.max(0, Math.min(Math.floor(amount), remainingToCap));
  progress.xp += gained;
  const levels = [];
  while (progress.level < cap && progress.xp >= professionXpToNext(progress.level)) { progress.xp -= professionXpToNext(progress.level); progress.level++; levels.push(progress.level); }
  if (progress.level >= cap) progress.xp = 0;
  const unlocked = PROFESSION_RECIPES.filter(entry => entry.profession === professionId && entry.minProfessionLevel > oldLevel && entry.minProfessionLevel <= progress.level && entry.minLevel <= playerLevel).map(entry => entry.id);
  return { state: result, gained, levels, unlocked };
}

export function getCraftXp(recipeOrId, professionLevel) {
  const recipeId = typeof recipeOrId === 'string' ? recipeOrId : recipeOrId?.id;
  const definition = PROFESSION_RECIPES.find(entry => entry.id === recipeId);
  if (!definition && !Object.hasOwn(BASE_RECIPE_PROFESSIONS, recipeId)) return 0;
  if (!Number.isInteger(professionLevel) || professionLevel < 1 || professionLevel > 100) return 0;
  const difference = professionLevel - (definition?.minProfessionLevel || 1);
  const factor = difference <= 10 ? 1 : difference <= 25 ? 0.5 : difference < 50 ? 0.25 : 0;
  return Math.floor((definition?.professionXp || 40) * factor);
}

export function canCraftRecipe(recipeOrId, state, playerLevel) {
  const id = typeof recipeOrId === 'string' ? recipeOrId : recipeOrId?.id;
  const recipeData = PROFESSION_RECIPES.find(entry => entry.id === id);
  if (!recipeData) return Object.hasOwn(BASE_RECIPE_PROFESSIONS, id) && validateProfessionState(state, { playerLevel });
  return validateProfessionState(state, { playerLevel }) && playerLevel >= recipeData.minLevel && state[recipeData.profession].level >= recipeData.minProfessionLevel;
}

export function chooseMastery(state, professionId, choice) {
  const profession = PROFESSIONS.find(entry => entry.id === professionId);
  if (!validateProfessionState(state) || !profession || state[professionId].level < 75 || !profession.masteries.some(entry => entry.id === choice)) return null;
  const result = clone(state); result[professionId].mastery = choice; return result;
}
export function masteryRank(level) { return level >= 100 ? 3 : level >= 90 ? 2 : level >= 75 ? 1 : 0; }
export function getProfessionBonuses(state) {
  const result = { stats: {}, hpPotionMultiplier: 1, manaPotionMultiplier: 1, foodMultiplier: 1, socketBonusMultiplier: 1 };
  if (!validateProfessionState(state)) return result;
  for (const profession of PROFESSIONS) {
    const progress = state[profession.id], rank = masteryRank(progress.level);
    if (!progress.mastery || !rank) continue;
    if (profession.id === 'alchemy') {
      if (progress.mastery === 'healer') result.hpPotionMultiplier = 1 + rank * 0.04;
      else if (progress.mastery === 'channeler') result.manaPotionMultiplier = 1 + rank * 0.04;
      else result.foodMultiplier = 1 + rank * 0.08;
    } else if (profession.id === 'smith') {
      if (progress.mastery === 'armorer') Object.assign(result.stats, { armor: rank * 2, maxHp: rank * 20 });
      else if (progress.mastery === 'weaponsmith') result.stats.damage = rank * 6;
      else Object.assign(result.stats, { crit: rank * 0.005, cooldown: rank * 0.008 });
    } else if (progress.mastery === 'resonance') result.stats.spellDamage = rank * 10;
    else if (progress.mastery === 'clarity') Object.assign(result.stats, { mana: rank * 20, manaRegen: rank * 0.6 });
    else result.socketBonusMultiplier = 1 + rank * 0.04;
  }
  return result;
}

/** Add this side yield to existing raw-resource gathering; old quests keep their original event. */
export function getGatherBonus(regionId, resourceType) {
  const tier = REGION_RESOURCE_TIERS[regionId], id = `${resourceType}_t${tier}`;
  return tier && PROFESSION_RESOURCES[id]?.kind === 'material' ? { [id]: 1 } : {};
}
export function socketDescriptor(resourceId) {
  if (Object.hasOwn(GEM_TYPES, resourceId)) return { id: resourceId, tier: 1 };
  const resource = PROFESSION_RESOURCES[resourceId];
  return resource?.kind === 'gem' ? { id: resource.gemId, tier: resource.tier } : null;
}
export function gemResourceId(socket) {
  const id = typeof socket === 'string' ? socket : socket?.id, tier = typeof socket === 'string' ? 1 : socket?.tier ?? 1;
  if (!Object.hasOwn(GEM_TYPES, id) || !Number.isInteger(tier) || tier < 1 || tier > 3) return null;
  return tier === 1 ? id : `${id}_t${tier}`;
}
export function getSocketMasteryBonus(item, state) {
  const multiplier = getProfessionBonuses(state).socketBonusMultiplier - 1, stats = {};
  if (!multiplier) return stats;
  for (const socket of item?.sockets || []) {
    const resource = gemResourceId(socket), descriptor = resource && socketDescriptor(resource);
    if (!descriptor) continue;
    for (const [key, value] of Object.entries(GEM_TYPES[descriptor.id].stats)) stats[key] = Math.round(((stats[key] || 0) + value * descriptor.tier * multiplier) * 10000) / 10000;
  }
  return stats;
}

export function makeCraftedEquipment(recipeId, { classId = 'guardian', playerLevel = 100, rng = Math.random, uid } = {}) {
  const definition = PROFESSION_RECIPES.find(entry => entry.id === recipeId), profile = definition?.outputProfile;
  if (!profile || !Number.isInteger(playerLevel) || playerLevel < definition.minLevel || playerLevel > 100) return null;
  const characterClass = getClass(classId);
  let candidates = ITEM_BASES.filter(base => equipmentSlot(base) === profile.slot && base.minLevel <= profile.level && (!base.classIds || base.classIds.includes(characterClass.id)));
  if (profile.slot === 'armor') {
    const preferred = candidates.filter(base => ['guardian', 'paladin'].includes(characterClass.id) ? base.stats.armor > 0 && base.stats.maxHp > 0 : ['ranger', 'nightblade'].includes(characterClass.id) ? base.stats.speed > 0 || base.stats.dodgeCooldown > 0 : base.stats.mana > 0 || base.stats.manaRegen > 0);
    if (preferred.length) candidates = preferred;
  }
  const highest = Math.max(...candidates.map(base => base.minLevel));
  candidates = candidates.filter(base => base.minLevel === highest);
  const choice = rng(); if (!Number.isFinite(choice) || choice < 0 || choice > 1) throw new TypeError('Ungültiger Schmiedewurf.');
  const selected = candidates[Math.min(candidates.length - 1, Math.floor(choice * candidates.length))];
  const item = generateLoot({ level: profile.level, classId: characterClass.id, rng, uid, rarity: profile.rarity, baseId: selected.id, source: recipeId });
  item.name = `Geschmiedet: ${item.name}`; item.craftedRecipe = recipeId;
  return item;
}

export function getConsumableProfile(itemOrId) {
  const item = typeof itemOrId === 'string' ? CRAFT_ITEMS[itemOrId] || BASE_ITEMS[itemOrId] : itemOrId;
  if (!item || item.type !== 'consumable' || !record(item.stats)) return null;
  const food = item.id === 'hearty_meal' || item.cooldownGroup === 'food';
  return { minLevel: item.minLevel || item.level || 1, cooldown: item.cooldown ?? (food ? 10 : 3), cooldownGroup: food ? 'food' : 'potion', outOfCombat: food || !!item.outOfCombat, hpRestore: item.stats.hpRestore || 0, manaRestore: item.stats.manaRestore || 0 };
}

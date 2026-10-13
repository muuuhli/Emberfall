import { REGIONS, RESOURCES, ENEMY_TYPES, RECIPES } from './catalog.js';
import { DUNGEONS } from './dungeons.js';
import { MAX_LEVEL, xpToNext } from './progression.js';

export const MAX_ACTIVE_CONTRACTS = 3;
const MAX_COMPLETED_CYCLES = 1_000_000;
const oldRegionIds = new Set(['daemmerhain', 'frostgrat', 'aschenmoor', 'glutoede']);
const originalFoes = { daemmerhain: ['wolf', 'slime'], frostgrat: ['frostwolf'], aschenmoor: ['skeleton', 'wraith'], glutoede: ['imp'] };
const originalMaterials = { daemmerhain: ['wood', 'ore', 'herb'], frostgrat: ['ore'], aschenmoor: ['wood', 'ore', 'herb', 'crystal'], glutoede: ['ore', 'crystal'] };
const titles = {
  hunt: ['Die Straßen frei halten', 'Spuren im Morgenlicht', 'Die äußere Wacht', 'Ruhige Wege für Reisende'],
  gather: ['Vorräte für die Wacht', 'Eine Gabe der freien Lande', 'Material für den nächsten Aufbruch', 'Die Werkstätten warten'],
  craft: ['Hände für die Gemeinschaft', 'Vorräte für die Grenzlande', 'Die Arbeit am Glutherd'],
  farm: ['Brot für die Reisenden', 'Die nächste Ernte', 'Ein gedeckter Tisch'],
};
const clone = value => JSON.parse(JSON.stringify(value));
const integer = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;
const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
const regionIndex = id => REGIONS.findIndex(region => region.id === id);

function rangeFor(region) {
  return oldRegionIds.has(region.id)
    ? { min: Math.max(8, region.level), max: 12 }
    : { min: region.level, max: region.maxLevel || Math.min(MAX_LEVEL, region.level + 8) };
}

function regionForDungeon(dungeon) {
  const { x, y } = dungeon.entrance;
  return REGIONS.find(region => x >= region.x && x < region.x + region.w && y >= region.y && y < region.y + region.h);
}

function rewardFor(level, fraction, cycle, slot, kind) {
  return {
    xp: level >= MAX_LEVEL ? 0 : Math.round(xpToNext(level) * fraction),
    gold: Math.round(24 + level * 4 + slot * 8 + (kind === 'dungeon' ? 70 : 0)),
    dust: 1 + Math.floor(level / 12) + (kind === 'dungeon' ? 2 : 0),
    ...(cycle % 4 === slot ? { item: slot === 1 ? 'mana_potion' : slot === 2 ? 'hearty_meal' : 'heal_potion' } : {}),
  };
}

function offer(region, level, cycle, slot, kind, title, description, objectives, changes = {}) {
  const fractions = { hunt: 0.22, gather: 0.18, craft: 0.2, farm: 0.18, dungeon: 0.25 };
  return {
    id: `contract:${region.id}:${cycle}:${slot}:${level}`,
    templateId: `${region.id}:${kind}:${cycle % 12}`,
    cycle, slot, level, title: `${title} · ${region.name}`, description, region: region.id,
    minLevel: rangeFor(region).min,
    objectives,
    reward: rewardFor(level, fractions[kind], cycle, slot, kind),
    ...changes,
  };
}

/** Returns only offers for the player's current level band; low-level zones cannot grant endgame XP. */
export function getContractOffers({ regionId, level = 1, completed = 0 } = {}) {
  const region = REGIONS.find(entry => entry.id === regionId);
  if (!region || !integer(level, 1, MAX_LEVEL) || !integer(completed, 0, MAX_COMPLETED_CYCLES)) return [];
  const range = rangeFor(region);
  if (level < range.min || level > range.max) return [];
  const index = regionIndex(region.id), cycle = completed;
  const enemies = originalFoes[region.id] || [region.enemy];
  const enemyId = enemies[(cycle + index) % enemies.length];
  if (!ENEMY_TYPES[enemyId]) return [];
  const killCount = 8 + ((cycle * 3 + index) % 15);
  const hunt = offer(region, level, cycle, 0, 'hunt', titles.hunt[cycle % titles.hunt.length],
    `Sichere die Wege in ${region.name}. Besiege ${killCount} Gegner vom Typ „${ENEMY_TYPES[enemyId].name}“. Es zählen nur neue Kämpfe in dieser Region.`,
    [{ kind: 'kill', target: enemyId, count: killCount, label: `${ENEMY_TYPES[enemyId].name} in ${region.name} besiegen` }]);

  const materials = originalMaterials[region.id] || ['wood', 'ore', 'herb', 'crystal'];
  const material = materials[(cycle + index) % materials.length];
  const gatherCount = 12 + ((cycle * 5 + index * 2) % 25);
  const gather = offer(region, level, cycle, 1, 'gather', titles.gather[cycle % titles.gather.length],
    `Die Wacht in ${region.name} braucht ${gatherCount} ${RESOURCES[material].name}. Sammle sie nach Annahme des Auftrags vor Ort. Bereits gelagerte Vorräte zählen nicht.`,
    [{ kind: 'gather', target: material, count: gatherCount, label: `${RESOURCES[material].name} in ${region.name} sammeln` }]);

  const dungeon = DUNGEONS.find(entry => regionForDungeon(entry)?.id === region.id && entry.minLevel <= level);
  let third;
  if (dungeon && cycle % 3 === 0) {
    third = offer(region, level, cycle, 2, 'dungeon', `Der Ruf des Tors: ${dungeon.name}`,
      `Meistere ${dungeon.name} nach Annahme dieses Auftrags. Löse die Rätsel und besiege den Boss.${dungeon.partyRequired > 1 ? ` Ihr benötigt ${dungeon.partyRequired} lebende Gefährten.` : ' Du kannst allein oder mit Gefährten aufbrechen.'}`,
      [{ kind: 'dungeon', target: dungeon.id, count: 1, label: `${dungeon.name} meistern` }],
      { minLevel: Math.max(range.min, dungeon.minLevel), partyRequired: dungeon.partyRequired });
  } else if ((region.id === 'daemmerhain' || !oldRegionIds.has(region.id)) && cycle % 3 === 1) {
    const wheat = 18 + cycle % 4 * 3, bread = 3 + cycle % 3;
    third = offer(region, level, cycle, 2, 'farm', titles.farm[cycle % titles.farm.length],
      `Ernte ${wheat} frischen Sonnenweizen in ${region.name} und backe dort ${bread} Hainbrote. Die Menschen an den Wegen brauchen eine warme Mahlzeit.`,
      [{ kind: 'farm', target: 'wheat', count: wheat, label: `Sonnenweizen in ${region.name} ernten` }, { kind: 'craft', target: 'bake_bread', count: bread, label: `Hainbrot in ${region.name} backen` }]);
  } else {
    const forge = region.id === 'frostgrat' || region.id === 'glutoede';
    const recipeId = forge ? region.id === 'frostgrat' ? 'forge_mail' : 'forge_ember' : cycle % 2 === 0 ? 'brew_heal' : 'brew_mana';
    const recipe = RECIPES.find(entry => entry.id === recipeId);
    const materialId = forge ? region.id === 'frostgrat' ? 'ore' : 'crystal' : 'herb';
    const materialCount = 12 + cycle % 5 * 3;
    const craftCount = forge ? 1 : 4 + cycle % 4;
    third = offer(region, level, cycle, 2, 'craft', titles.craft[cycle % titles.craft.length],
      `Sammle ${materialCount} ${RESOURCES[materialId].name} und stelle in ${region.name} ${craftCount} × ${recipe.name} her. Weitere Zutaten darfst du aus deinem Gepäck verwenden.`,
      [{ kind: 'gather', target: materialId, count: materialCount, label: `${RESOURCES[materialId].name} in ${region.name} sammeln` }, { kind: 'craft', target: recipeId, count: craftCount, label: `${recipe.name} in ${region.name} herstellen` }]);
  }
  return [hunt, gather, third];
}

/** Resolve trusted definitions rather than paying an arbitrary reward from client/save JSON. */
export function resolveContractOffer(id) {
  if (typeof id !== 'string') return null;
  const match = /^contract:([a-z0-9_]+):(\d{1,7}):([0-2]):(\d{1,3})$/.exec(id);
  if (!match) return null;
  const [, regionId, cycle, slot, level] = match;
  return getContractOffers({ regionId, level: Number(level), completed: Number(cycle) }).find(entry => entry.id === id && entry.slot === Number(slot)) || null;
}

export function createContract(offerData) {
  const trusted = resolveContractOffer(typeof offerData === 'string' ? offerData : offerData?.id);
  return trusted ? { ...clone(trusted), status: 'active', counts: trusted.objectives.map(() => 0) } : null;
}

function equalData(left, right) {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((entry, index) => equalData(entry, right[index]));
  if (!record(left) || !record(right)) return false;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every(key => Object.hasOwn(right, key) && equalData(left[key], right[key]));
}

function validContract(contract, playerLevel) {
  if (!record(contract)) return false;
  const trusted = resolveContractOffer(contract.id);
  if (!trusted || (playerLevel != null && trusted.level > playerLevel)) return false;
  const keys = [...Object.keys(trusted), 'status', 'counts'];
  if (Object.keys(contract).length !== keys.length || !keys.every(key => Object.hasOwn(contract, key))) return false;
  if (!Object.keys(trusted).every(key => equalData(contract[key], trusted[key]))) return false;
  if (!Array.isArray(contract.counts) || contract.counts.length !== trusted.objectives.length || !contract.counts.every((count, index) => integer(count, 0, trusted.objectives[index].count))) return false;
  const ready = trusted.objectives.every((objective, index) => contract.counts[index] >= objective.count);
  return contract.status === (ready ? 'ready' : 'active');
}

/** Mutates only matching, newly emitted event progress; no existing kill/material ledger is consulted. */
export function advanceContract(contract, kind, target, amount = 1, { regionId } = {}) {
  if (!validContract(contract) || contract.status !== 'active' || !Number.isFinite(amount) || amount <= 0) return false;
  const insideDungeon = kind === 'dungeon' && regionId === target && DUNGEONS.some(dungeon => dungeon.id === target && regionForDungeon(dungeon)?.id === contract.region);
  if (regionId !== contract.region && !insideDungeon) return false;
  const count = Math.floor(amount);
  if (count < 1) return false;
  let changed = false;
  contract.objectives.forEach((objective, index) => {
    if (objective.kind !== kind || objective.target !== target || contract.counts[index] >= objective.count) return;
    contract.counts[index] = Math.min(objective.count, contract.counts[index] + count);
    changed = true;
  });
  if (changed && contract.objectives.every((objective, index) => contract.counts[index] >= objective.count)) contract.status = 'ready';
  return changed;
}

export function validateContractState(state, { level } = {}) {
  if (!record(state) || Object.keys(state).length !== 2 || !Object.hasOwn(state, 'active') || !Object.hasOwn(state, 'completed')) return false;
  if (level != null && !integer(level, 1, MAX_LEVEL)) return false;
  if (!Array.isArray(state.active) || state.active.length > MAX_ACTIVE_CONTRACTS || !record(state.completed)) return false;
  if (!Object.entries(state.completed).every(([regionId, count]) => regionIndex(regionId) >= 0 && integer(count, 0, MAX_COMPLETED_CYCLES))) return false;
  const ids = new Set();
  return state.active.every(contract => {
    if (!validContract(contract, level) || ids.has(contract.id) || contract.cycle > (state.completed[contract.region] || 0)) return false;
    ids.add(contract.id);
    return true;
  });
}

/** Defensive migration/loading rebuilds authoritative rewards and preserves only validated progress. */
export function restoreContractState(state = { active: [], completed: {} }, context = {}) {
  if (!validateContractState(state, context)) return null;
  return {
    active: state.active.map(saved => ({ ...createContract(saved.id), counts: [...saved.counts], status: saved.status })),
    completed: { ...state.completed },
  };
}

import { gearBaseStats } from './arsenal.js';

/** The original three slots keep their budgets and serialized item types. */
export const EQUIPMENT_SLOTS = Object.freeze([
  { id: 'weapon', name: 'Waffe', type: 'weapon', icon: 'sword', budget: 1 },
  { id: 'armor', name: 'Körperrüstung', type: 'armor', icon: 'shield', budget: 1 },
  { id: 'charm', name: 'Amulett', type: 'charm', icon: 'gem', budget: 1 },
  { id: 'helmet', name: 'Helm', type: 'armor', icon: 'shield', budget: .24 },
  { id: 'gloves', name: 'Handschuhe', type: 'armor', icon: 'shield', budget: .18 },
  { id: 'boots', name: 'Stiefel', type: 'armor', icon: 'wind', budget: .18 },
  { id: 'ring', name: 'Ring', type: 'charm', icon: 'gem', budget: .28 },
].map(slot => Object.freeze(slot)));
export const EQUIPMENT_SLOT_IDS = Object.freeze(EQUIPMENT_SLOTS.map(slot => slot.id));
const slotsById = new Map(EQUIPMENT_SLOTS.map(slot => [slot.id, slot]));
const round = value => Math.round(value * 10000) / 10000;
const levelOf = value => Number.isFinite(value) ? Math.max(1, Math.min(100, Math.floor(value))) : 1;

/** A malformed explicit slot never falls back to the item's legacy type. */
export function equipmentSlot(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const slot = item.slot === undefined ? item.type : item.slot;
  const definition = slotsById.get(slot);
  return definition && definition.type === item.type ? definition.id : null;
}

export function isEquipmentCompatible(item, slot) { return slotsById.has(slot) && equipmentSlot(item) === slot; }
export function createEmptyEquipment() { return Object.fromEntries(EQUIPMENT_SLOT_IDS.map(slot => [slot, null])); }
export function equipmentBudget(itemOrSlot) {
  const slot = typeof itemOrSlot === 'string' ? itemOrSlot : equipmentSlot(itemOrSlot);
  return slotsById.get(slot)?.budget || 0;
}

/** Apply equally to base stats, affixes, legendary powers and sockets. */
export function scaleEquipmentStats(stats, itemOrSlot) {
  const budget = equipmentBudget(itemOrSlot);
  return Object.fromEntries(Object.entries(stats || {}).map(([stat, value]) => [stat, round(value * budget)]));
}

export function equipmentStatCaps(caps, itemOrSlot) { return scaleEquipmentStats(caps, itemOrSlot); }

const slotNames = {
  helmet: [
    ['Schwarzstahl-Schaller', 'Rabenpfadkapuze', 'Haube der Totenkerzen'],
    ['Helm der Bußwache', 'Maske des Grabjägers', 'Schleier des versiegelten Eides'],
    ['Kryptenwacht-Visier', 'Maske der schwarzen Witwe', 'Kapuze des Nachtorakels'],
    ['Krone der letzten Bastion', 'Helm der mondlosen Jagd', 'Diadem des schweigenden Abgrunds'],
  ],
  gloves: [
    ['Grabstahlfäustlinge', 'Schächerhandschuhe', 'Kerzenweberhandschuhe'],
    ['Stulpen der Galgenwache', 'Handschuhe der Hexenjagd', 'Handschuhe der Aschenliturgie'],
    ['Kryptenschlosser-Stulpen', 'Rabenkrallenhandschuhe', 'Seelenfadenhandschuhe'],
    ['Fäuste des letzten Richters', 'Handschuhe des lautlosen Urteils', 'Hände des leeren Himmels'],
  ],
  boots: [
    ['Sargnagelstiefel', 'Nachtpfadschuhe', 'Schuhe des schwarzen Chors'],
    ['Stiefel der Totenprozession', 'Fährtenstiefel der Grabotter', 'Schuhe der Bußlitanei'],
    ['Kryptentor-Sabatons', 'Rabenfluchtstiefel', 'Schuhe der schweigenden Kapelle'],
    ['Schritte der letzten Wache', 'Stiefel der verfluchten Wildjagd', 'Schuhe des versiegelten Orakels'],
  ],
  ring: [
    ['Ring des Grabstahl-Eides', 'Ring der schwarzen Kerze', 'Ring der bleichen Wache'],
    ['Schächerkönigs-Siegelring', 'Ring des verschwiegenen Paktes', 'Ring der Bußrosen'],
    ['Henkerhand-Siegel', 'Ring des Seelenfadens', 'Ring der versiegelten Krypta'],
    ['Ring des letzten Klingeneides', 'Ring des namenlosen Orakels', 'Ring der ewigen Totenwache'],
  ],
};
const slotLevels = { helmet: [1, 18, 45, 82], gloves: [3, 20, 48, 84], boots: [3, 20, 48, 84], ring: [5, 22, 50, 86] };
const categories = { helmet: ['heavy', 'light', 'ritual'], gloves: ['heavy', 'light', 'ritual'], boots: ['heavy', 'light', 'ritual'], ring: ['martial', 'arcane', 'ward'] };
const descriptions = {
  helmet: ['Grabstahl schützt Kopf und Schultern. Mehr Rüstung und Leben statt Mana.', 'Eine leichte Kapuze für wachsame Jäger. Präzision und etwas Tempo statt schwerem Schutz.', 'Ein verhüllter Ritualfokus. Mana und Regeneration statt schwerer Rüstung.'],
  gloves: ['Geschlossene Eisenfäuste für lange Frontkämpfe. Schutz statt Präzision.', 'Leichte Griffe für sichere Klingenschnitte. Waffenschaden und Präzision statt starker Rüstung.', 'In Seelenfäden gewobene Handschuhe. Zauberkraft und Manaversorgung statt Waffenschaden.'],
  boots: ['Schwere Eisensohlen halten die Front. Leben und Rüstung statt Laufgeschwindigkeit.', 'Leise Sohlen für Flucht und Verfolgung. Tempo und kürzere Rollenpausen statt schwerer Rüstung.', 'Runensohlen tragen den Chor durch die Nacht. Manaversorgung und etwas Tempo statt starker Rüstung.'],
  ring: ['Ein Siegel für präzise Waffenhiebe. Schaden statt Mana und Schutz.', 'Ein Siegel für Zauberkraft und anhaltende Manaversorgung. Keine zusätzliche Rüstung.', 'Ein Siegel für Leben und Rüstung. Verzichtet auf offensiven Schaden.'],
};
const roles = { helmet: ['Kopfschutz', 'Späher', 'Ritualfokus'], gloves: ['Frontschutz', 'Klingenpräzision', 'Zauberkraft'], boots: ['Standfestigkeit', 'Beweglichkeit', 'Manaversorgung'], ring: ['Klingenpräzision', 'Arkaner Vorrat', 'Überleben'] };

function slotSeed(slot, role, tier) {
  const growth = tier * .3;
  if (slot === 'helmet') return role === 0 ? { maxHp: 14 + tier * 2, armor: 2.1 + growth }
    : role === 1 ? { maxHp: 10, armor: 1.1, crit: .012 + tier * .001, speed: 3 }
      : { maxHp: 8, armor: .8, mana: 12 + tier * 2, manaRegen: .35 };
  if (slot === 'gloves') return role === 0 ? { maxHp: 12 + tier * 2, armor: 1.8 + growth }
    : role === 1 ? { maxHp: 8, armor: .9, damage: 3 + growth, crit: .012 }
      : { maxHp: 8, armor: .8, spellDamage: 4 + growth, manaRegen: .3 };
  if (slot === 'boots') return role === 0 ? { maxHp: 12 + tier * 2, armor: 1.9 + growth }
    : role === 1 ? { maxHp: 8, armor: .9, speed: 8 + tier, dodgeCooldown: .04 }
      : { maxHp: 8, armor: .8, speed: 4, manaRegen: .35 + tier * .03 };
  return role === 0 ? { damage: 3 + growth, crit: .014 }
    : role === 1 ? { spellDamage: 4 + growth, mana: 10 + tier * 2, manaRegen: .35 }
      : { maxHp: 16 + tier * 2, armor: 1.2 + growth, lifeSteal: .005 };
}

/** Twelve authored families per new slot, at four useful progression milestones. */
export const EQUIPMENT_BASES = Object.entries(slotNames).flatMap(([slot, tiers]) => tiers.flatMap((names, tier) => names.map((name, role) => ({
  id: `relic_${slot}_${tier + 1}_${role + 1}`, name, slot, type: slot === 'ring' ? 'charm' : 'armor', minLevel: slotLevels[slot][tier],
  stats: Object.fromEntries(Object.entries(slotSeed(slot, role, tier)).map(([stat, value]) => [stat, round(value)])),
  icon: slot === 'ring' ? '◈' : '⬡', category: categories[slot][role], family: `relic_${slot}`, role: roles[slot][role],
  price: 16 + tier * 9, description: `${descriptions[slot][role]} Das kleinere Ausrüstungsteil nutzt ein begrenztes eigenes Wertebudget.`,
  lootTraits: slot === 'ring' ? [['vicious', 'bleeding'], ['arcane', 'draining'], ['armored', 'regenerating']][role]
    : role === 0 ? ['armored', 'vicious'] : role === 1 ? ['swift', 'bleeding'] : ['arcane', 'regenerating'],
}))));

export const EQUIPMENT_ITEMS = Object.fromEntries(EQUIPMENT_BASES.map(base => {
  const rarity = base.minLevel >= 82 ? 'rare' : 'uncommon', multiplier = rarity === 'rare' ? 1.35 : 1.15;
  const item = { ...base, minLevel: base.minLevel, level: base.minLevel, rarity,
    stats: scaleEquipmentStats(gearBaseStats(base, base.minLevel, multiplier), base),
    price: Math.round(base.price * (1 + base.minLevel * .06) * multiplier * 1.3) };
  return [item.id, item];
}));

export const EQUIPMENT_RECIPES = EQUIPMENT_BASES.filter(base => [18, 20, 22, 82, 84, 86].includes(base.minLevel)).map(base => ({
  id: `forge_${base.id}`, name: `${base.name} fertigen`, minLevel: base.minLevel, category: base.category,
  ingredients: { ore: Math.ceil(3 + base.minLevel * .12), wood: Math.ceil(2 + base.minLevel * .06),
    ...(base.minLevel >= 18 ? { crystal: Math.ceil(base.minLevel * .06) } : {}), ...(base.minLevel >= 82 ? { dust: Math.ceil(base.minLevel * .1) } : {}) },
  output: base.id, amount: 1, description: `${slotsById.get(base.slot).name} · Charakterstufe ${base.minLevel}. ${descriptions[base.slot][categories[base.slot].indexOf(base.category)]}`,
}));

export function getEquipmentShopStock({ level = 1, classId = 'guardian', merchant = 'elin' } = {}) {
  if (merchant === 'sera') return [];
  const magic = ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'].includes(classId);
  const armorPreference = ['guardian', 'paladin'].includes(classId) ? 'heavy' : magic ? 'ritual' : 'light';
  const ringPreference = magic ? 'arcane' : 'martial';
  const eligible = Object.values(EQUIPMENT_ITEMS).filter(item => item.minLevel <= levelOf(level));
  return ['helmet', 'gloves', 'boots', 'ring'].flatMap(slot => {
    const preference = slot === 'ring' ? ringPreference : armorPreference;
    const choice = eligible.filter(item => item.slot === slot).sort((a, b) => b.minLevel - a.minLevel
      || Number(b.category === preference) - Number(a.category === preference) || a.id.localeCompare(b.id))[0];
    return choice ? [choice] : [];
  });
}

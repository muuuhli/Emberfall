import { getClass } from './classes.js';
import { MAX_LEVEL } from './progression.js';
import { BALANCE_VERSION } from './balance.js';

export const RARITIES = {
  common: { name: 'Gewöhnlich', color: '#bdc3b0', weight: 0.62, bossWeight: 0, statMultiplier: 1, affixCount: 0, socketCount: 0 },
  uncommon: { name: 'Ungewöhnlich', color: '#8fc68e', weight: 0.26, bossWeight: 0.35, statMultiplier: 1.15, affixCount: 1, socketCount: 0 },
  rare: { name: 'Selten', color: '#7db7e8', weight: 0.10, bossWeight: 0.45, statMultiplier: 1.35, affixCount: 2, socketCount: 1 },
  epic: { name: 'Episch', color: '#be94e5', weight: 0.018, bossWeight: 0.17, statMultiplier: 1.65, affixCount: 3, socketCount: 2 },
  legendary: { name: 'Legendär', color: '#e8b568', weight: 0.002, bossWeight: 0.03, statMultiplier: 2.1, affixCount: 3, socketCount: 3 },
};

const base = (id, name, type, stats, changes = {}) => ({ id, name, type, stats, minLevel: 1, icon: type === 'weapon' ? '⚔' : type === 'armor' ? '⬡' : '◈', price: type === 'weapon' ? 24 : 30, description: 'Ein Fundstück aus den Grenzlanden von Emberfall.', ...changes });
export const ITEM_BASES = [
  base('iron_longsword', 'Eisenlangschwert', 'weapon', { damage: 5 }, { classIds: ['guardian', 'paladin', 'nightblade'] }),
  base('oath_hammer', 'Eidhammer', 'weapon', { damage: 4, spellDamage: 3 }, { classIds: ['paladin', 'guardian'] }),
  base('greenwood_bow', 'Hainholzbogen', 'weapon', { damage: 5, crit: 0.01 }, { classIds: ['ranger'], icon: '➤' }),
  base('twilight_daggers', 'Zwielichtdolche', 'weapon', { damage: 4, crit: 0.015 }, { classIds: ['nightblade'], icon: '⚔' }),
  base('ember_wand', 'Glutzauberstab', 'weapon', { spellDamage: 6, mana: 5 }, { classIds: ['flamecaller'], icon: '✦' }),
  base('rime_scepter', 'Reifzepter', 'weapon', { spellDamage: 5, armor: 1 }, { classIds: ['frostweaver'], icon: '❄' }),
  base('living_branch', 'Lebender Ast', 'weapon', { spellDamage: 5, manaRegen: 0.4 }, { classIds: ['druid'], icon: '❧' }),
  base('soul_focus', 'Seelenfokus', 'weapon', { spellDamage: 5, lifeSteal: 0.008 }, { classIds: ['shadowbinder'], icon: '☾' }),
  base('vanguard_axe', 'Vorhutaxt', 'weapon', { damage: 8, maxHp: 8 }, { minLevel: 20, classIds: ['guardian', 'paladin'] }),
  base('starfall_staff', 'Sternenfallstab', 'weapon', { spellDamage: 9, mana: 10 }, { minLevel: 25, classIds: ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'], icon: '✦' }),
  base('moon_string', 'Mondsehne', 'weapon', { damage: 8, speed: 4 }, { minLevel: 35, classIds: ['ranger'], icon: '➤' }),
  base('void_fangs', 'Leerenfänge', 'weapon', { damage: 7, lifeSteal: 0.012 }, { minLevel: 40, classIds: ['nightblade', 'shadowbinder'] }),
  base('sunforged_maul', 'Sonnenschmiedhammer', 'weapon', { damage: 9, spellDamage: 5 }, { minLevel: 60, classIds: ['guardian', 'paladin'] }),
  base('horizon_focus', 'Horizontfokus', 'weapon', { spellDamage: 11, crit: 0.02 }, { minLevel: 80, classIds: ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'], icon: '✦' }),
  base('traveler_coat', 'Reisemantel', 'armor', { maxHp: 12, armor: 1 }),
  base('iron_scale', 'Eisenschuppen', 'armor', { maxHp: 16, armor: 2 }),
  base('linen_robes', 'Leinenrobe', 'armor', { mana: 12, armor: 1 }),
  base('hunter_vest', 'Jägerwams', 'armor', { maxHp: 10, speed: 4 }),
  base('ritual_shroud', 'Ritualgewand', 'armor', { mana: 10, manaRegen: 0.3 }),
  base('bark_guard', 'Borkenharnisch', 'armor', { maxHp: 20, armor: 1.5 }, { minLevel: 15 }),
  base('frostweave', 'Frostgewebe', 'armor', { armor: 2.5, mana: 15 }, { minLevel: 25 }),
  base('ashen_plate', 'Aschenplatte', 'armor', { armor: 3, maxHp: 25 }, { minLevel: 30 }),
  base('shadow_cloak', 'Schattenumhang', 'armor', { armor: 1.5, dodgeCooldown: 0.025 }, { minLevel: 40 }),
  base('dawn_mantle', 'Morgenmantel', 'armor', { maxHp: 25, manaRegen: 0.5 }, { minLevel: 55 }),
  base('storm_mail', 'Sturmschuppen', 'armor', { armor: 3.5, speed: 6 }, { minLevel: 70 }),
  base('eternal_carapace', 'Ewiger Panzer', 'armor', { armor: 4, maxHp: 35 }, { minLevel: 85 }),
  base('ember_locket', 'Glutmedaillon', 'charm', { maxHp: 10, spellDamage: 2 }),
  base('river_stone', 'Flussstein', 'charm', { mana: 8, manaRegen: 0.25 }),
  base('wolf_tooth', 'Wolfszahn', 'charm', { damage: 2, crit: 0.008 }),
  base('warding_rune', 'Schutzrune', 'charm', { armor: 1, maxHp: 8 }),
  base('harvest_talisman', 'Erntetalisman', 'charm', { gatherYield: 0.35, speed: 3 }),
  base('soul_bead', 'Seelenperle', 'charm', { spellDamage: 3, lifeSteal: 0.008 }, { minLevel: 15 }),
  base('wind_chime', 'Windglöckchen', 'charm', { speed: 7, dodgeCooldown: 0.02 }, { minLevel: 25 }),
  base('sundial', 'Sonnenuhr', 'charm', { cooldown: 0.025, mana: 10 }, { minLevel: 35 }),
  base('frost_heart', 'Frostherz', 'charm', { spellDamage: 4, armor: 1.5 }, { minLevel: 45 }),
  base('blood_sigil', 'Blutsiegel', 'charm', { lifeSteal: 0.015, damage: 4 }, { minLevel: 60 }),
  base('astral_lens', 'Astrallinse', 'charm', { spellDamage: 6, crit: 0.012 }, { minLevel: 75 }),
  base('world_seed', 'Weltensaat', 'charm', { maxHp: 25, manaRegen: 0.7, gatherYield: 0.5 }, { minLevel: 90 }),
];
export const itemBases = ITEM_BASES;

export const AFFIXES = [
  { id: 'power', name: 'der Stärke', stats: { damage: 2 }, perLevel: { damage: 0.23 }, types: ['weapon', 'charm'] },
  { id: 'sorcery', name: 'der Magie', stats: { spellDamage: 3 }, perLevel: { spellDamage: 0.30 }, types: ['weapon', 'armor', 'charm'] },
  { id: 'vitality', name: 'der Lebenskraft', stats: { maxHp: 12 }, perLevel: { maxHp: 1.15 }, types: ['armor', 'charm'] },
  { id: 'ward', name: 'des Schutzes', stats: { armor: 1 }, perLevel: { armor: 0.035 }, types: ['armor', 'charm'] },
  { id: 'mind', name: 'des Geistes', stats: { mana: 8 }, perLevel: { mana: 0.38 }, types: ['weapon', 'armor', 'charm'] },
  { id: 'precision', name: 'der Präzision', stats: { crit: 0.015 }, perLevel: { crit: 0.00012 }, types: ['weapon', 'charm'] },
  { id: 'stride', name: 'der Eile', stats: { speed: 5 }, perLevel: { speed: 0.07 }, types: ['armor', 'charm'] },
  { id: 'renewal', name: 'der Erneuerung', stats: { manaRegen: 0.35 }, perLevel: { manaRegen: 0.012 }, types: ['weapon', 'armor', 'charm'] },
  { id: 'haste', name: 'des Rhythmus', stats: { cooldown: 0.018 }, perLevel: { cooldown: 0.00012 }, types: ['weapon', 'charm'] },
  { id: 'evasion', name: 'des Windes', stats: { dodgeCooldown: 0.025 }, perLevel: { dodgeCooldown: 0.0002 }, types: ['armor', 'charm'] },
  { id: 'harvester', name: 'der Fülle', stats: { gatherYield: 0.2 }, perLevel: { gatherYield: 0.002 }, types: ['armor', 'charm'] },
  { id: 'siphon', name: 'des Durstes', stats: { lifeSteal: 0.008 }, perLevel: { lifeSteal: 0.00005 }, types: ['weapon', 'charm'] },
];

export const LEGENDARY_AFFIXES = {
  guardian: { id: 'legendary_last_stand', name: 'Eid der letzten Wacht', description: 'Die Bastion hält auch gegen die Nacht.', stats: { maxHp: 120, armor: 8 } },
  paladin: { id: 'legendary_first_dawn', name: 'Erste Morgenröte', description: 'Das Licht stärkt jeden Heilzauber.', stats: { spellDamage: 35, manaRegen: 2 } },
  ranger: { id: 'legendary_wild_hunt', name: 'Ewige Wildjagd', description: 'Kritische Pfeile und unermüdliche Schritte.', stats: { crit: 0.065, speed: 14 } },
  nightblade: { id: 'legendary_midnight', name: 'Herz der Mitternacht', description: 'Die Klinge trinkt das Leben ihrer Feinde.', stats: { lifeSteal: 0.055, crit: 0.025 } },
  flamecaller: { id: 'legendary_phoenix', name: 'Atem des Phönix', description: 'Feuer erwacht schneller und brennt heißer.', stats: { spellDamage: 42, cooldown: 0.08 } },
  frostweaver: { id: 'legendary_long_winter', name: 'Der lange Winter', description: 'Frostmagie durchzieht den Träger.', stats: { spellDamage: 28, armor: 7, cooldown: 0.045 } },
  druid: { id: 'legendary_worldheart', name: 'Herz des Weltenbaums', description: 'Lebenskraft und Äther strömen ohne Ende.', stats: { maxHp: 100, manaRegen: 2.5, spellDamage: 18 } },
  shadowbinder: { id: 'legendary_soul_reaper', name: 'Ernte der verlorenen Seelen', description: 'Der Pakt zehrt an Gegnern und nährt den Binder.', stats: { lifeSteal: 0.05, spellDamage: 30 } },
};

export const GEM_TYPES = {
  ruby: { id: 'ruby', name: 'Glutrubin', icon: '♦', color: '#ec827c', stats: { damage: 5, spellDamage: 3 } },
  sapphire: { id: 'sapphire', name: 'Äthersaphir', icon: '♦', color: '#83bce8', stats: { mana: 15, manaRegen: 0.5 } },
  emerald: { id: 'emerald', name: 'Lebenssmaragd', icon: '♦', color: '#8aca9d', stats: { maxHp: 30, crit: 0.008 } },
};

export const SETS = {
  ashen_oath: { id: 'ashen_oath', name: 'Eid der Asche', classIds: ['guardian', 'paladin'], bonuses: { 2: { maxHp: 100, armor: 8 }, 3: { lifeSteal: 0.025, cooldown: 0.07 } } },
  winter_memory: { id: 'winter_memory', name: 'Erinnerung des Winters', classIds: ['flamecaller', 'frostweaver'], bonuses: { 2: { spellDamage: 35, mana: 40 }, 3: { cooldown: 0.08, armor: 5 } } },
  living_grove: { id: 'living_grove', name: 'Seele des Hains', classIds: ['ranger', 'druid'], bonuses: { 2: { speed: 15, gatherYield: 1 }, 3: { crit: 0.05, spellDamage: 20 } } },
  abyssal_pact: { id: 'abyssal_pact', name: 'Pakt der Tiefe', classIds: ['nightblade', 'shadowbinder'], bonuses: { 2: { spellDamage: 40, lifeSteal: 0.02 }, 3: { cooldown: 0.07, mana: 35 } } },
};

const round = value => Math.round(value * 10000) / 10000;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const levelValue = value => Number.isFinite(value) ? clamp(Math.floor(value), 1, MAX_LEVEL) : 1;
const pick = (items, roll) => items[Math.min(items.length - 1, Math.floor(roll() * items.length))];
const addStats = (target, source = {}, multiplier = 1) => {
  for (const [stat, value] of Object.entries(source)) {
    if (Object.hasOwn(STAT_CAPS, stat) && Number.isFinite(value)) target[stat] = round((target[stat] || 0) + value * multiplier);
  }
  return target;
};
const STAT_CAPS = { maxHp: 4000, mana: 2000, damage: 1200, armor: 150, crit: 0.3, speed: 100, spellDamage: 1600, manaRegen: 30, cooldown: 0.3, dodgeCooldown: 0.35, gatherYield: 8, lifeSteal: 0.2 };
export const GEAR_STAT_CAPS = Object.freeze({...STAT_CAPS,crit:.12,lifeSteal:.08,cooldown:.14,dodgeCooldown:.2});
const percentageStats = new Set(['crit', 'lifeSteal', 'cooldown', 'dodgeCooldown']);
const labels = { maxHp: 'Leben', mana: 'Mana', damage: 'Waffenschaden', armor: 'Rüstung', crit: 'Kritische Treffer', speed: 'Tempo', spellDamage: 'Zauberkraft', manaRegen: 'Mana / Sek.', cooldown: 'Abklingzeitverkürzung', dodgeCooldown: 'Ausweichverkürzung', gatherYield: 'Sammelertrag', lifeSteal: 'Lebensraub' };

function legacyBaseStats(itemBase, level, rarity) {
  const delta = level - 1;
  const stats = {};
  for (const [key, value] of Object.entries(itemBase.stats)) {
    let scaled = value;
    if (key === 'damage') scaled = value * (1 + delta * 0.04) + delta * 0.35;
    else if (key === 'spellDamage') scaled = value * (1 + delta * 0.035) + delta * 0.55;
    else if (key === 'maxHp') scaled = value * (1 + delta * 0.025) + delta * 2;
    else if (key === 'mana') scaled = value * (1 + delta * 0.02) + delta * 0.7;
    else if (key === 'armor') scaled = value * (1 + delta * 0.01) + delta * 0.035;
    else if (key === 'manaRegen') scaled = value * (1 + delta * 0.006);
    else if (key === 'speed') scaled = value * (1 + delta * 0.003);
    stats[key] = round(scaled * RARITIES[rarity].statMultiplier);
  }
  return stats;
}

/** Preserve serialized version-one values while deriving stronger version-two gear. */
function baseStats(itemBase, level, rarity, version = BALANCE_VERSION) {
  if(version===1)return legacyBaseStats(itemBase,level,rarity);
  const delta=level-1,stats={};
  const seed={...itemBase.stats};
  if(itemBase.type==='armor'){
    // Every armor body offers actual protection. Cloth trades some rating and
    // health for mana, leather for mobility, plate for a larger defensive budget.
    seed.maxHp??=10;seed.armor??=1;
  }
  const offenseSlot=itemBase.type==='weapon'?1:itemBase.type==='armor'?.18:.25;
  const healthSlot=itemBase.type==='armor'?1:itemBase.type==='weapon'?.22:.30;
  const armorSlot=itemBase.type==='armor'?1:itemBase.type==='weapon'?.14:.28;
  const manaSlot=itemBase.type==='armor'?.7:itemBase.type==='weapon'?.5:.35;
  for(const [key,value] of Object.entries(seed)){
    let scaled=value;
    if(key==='damage')scaled=value*(1+delta*.045)+delta*1.25*offenseSlot;
    else if(key==='spellDamage')scaled=value*(1+delta*.045)+delta*1.9*offenseSlot+(itemBase.type==='weapon'?20:0);
    else if(key==='maxHp')scaled=value*(1+delta*.045)+delta*3.1*healthSlot;
    else if(key==='armor')scaled=value*(1+delta*.035)+delta*.45*armorSlot;
    else if(key==='mana')scaled=value*(1+delta*.022)+delta*.85*manaSlot;
    else if(key==='manaRegen')scaled=value*(1+delta*.012)+delta*.006*(itemBase.type==='charm'?.5:1);
    else if(key==='speed')scaled=value*(1+delta*.002);
    stats[key]=round(scaled*RARITIES[rarity].statMultiplier);
  }
  return stats;
}

const newAffixGrowth={power:{damage:.42},sorcery:{spellDamage:.55},vitality:{maxHp:2.3},ward:{armor:.1},mind:{mana:.8},renewal:{manaRegen:.021}};
function affixStats(affix, level, rarity, quality = 1, version = BALANCE_VERSION) {
  const result = {};
  const rarityFactor = rarity === 'legendary' ? 1.4 : rarity === 'epic' ? 1.2 : 1;
  const growth=version===1?affix.perLevel:newAffixGrowth[affix.id]||affix.perLevel;
  for (const [stat, value] of Object.entries(affix.stats)) result[stat] = round((value + (level - 1) * (growth[stat] || 0)) * quality * rarityFactor);
  return result;
}

function smartAffix(affixes,roll,characterClass,type,index){
  const magic=characterClass.abilities.attack.stat==='spellDamage',hybrid=characterClass.id==='paladin';
  const primary=magic?'sorcery':'power';
  const weights=affixes.map(affix=>{
    if(type==='weapon'&&index===0&&affix.id===primary)return 14;
    if(affix.id===primary)return 5;
    if(affix.id==='power'&&magic)return 0;
    if(affix.id==='sorcery'&&!magic)return hybrid?4:.3;
    if(affix.id==='harvester')return .4;
    if(affix.id==='ward'||affix.id==='vitality')return type==='armor'?3:1;
    return 1;
  });
  let target=roll()*weights.reduce((total,value)=>total+value,0);
  for(let index=0;index<affixes.length;index++){target-=weights[index];if(target<0)return affixes[index];}
  return affixes.at(-1);
}

function derivedAffix(affix,item){
  const definition=AFFIXES.find(entry=>entry.id===affix?.id);
  if(item.balanceVersion===BALANCE_VERSION||!definition)return affix?.stats;
  const stat=Object.keys(definition.stats)[0],atQualityOne=affixStats(definition,item.level,item.rarity,1,1)[stat];
  const quality=clamp((affix.stats?.[stat]||0)/atQualityOne,.85,1.15);
  return affixStats(definition,item.level,item.rarity,quality,BALANCE_VERSION);
}

let fallbackSerial = 0;
function itemId(uid) {
  if (uid != null) {
    const value = String(uid);
    if (!/^[a-zA-Z0-9:_-]{1,90}$/.test(value)) throw new TypeError('Loot uid must contain only letters, numbers, colon, underscore or hyphen.');
    return value.startsWith('loot:') ? value : `loot:${value}`;
  }
  const identifier = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${(++fallbackSerial).toString(36)}`;
  return `loot:${identifier}`;
}

function rollRarity(roll, boss, pity) {
  if (pity && ((Number.isFinite(pity.legendaryMisses) && pity.legendaryMisses >= 499) || (boss && Number.isFinite(pity.bossMisses) && pity.bossMisses >= 33))) return 'legendary';
  let chance = roll();
  for (const [id, rarity] of Object.entries(RARITIES)) {
    chance -= boss ? rarity.bossWeight : rarity.weight;
    if (chance < 0) return id;
  }
  return 'legendary';
}

/** Pity is mutable save state owned by the caller. All item values remain serializable data. */
export function generateLoot({ level = 1, tier = 1, boss = false, classId = 'guardian', rng = Math.random, source = 'world', uid, pity, rarity: requestedRarity, baseId } = {}) {
  if(!Number.isInteger(tier)||tier<1||tier>30) throw new RangeError('Loot dungeon tier must be between 1 and 30.');
  const currentLevel = levelValue(level);
  const characterClass = getClass(classId);
  const roll = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError('Loot RNG must return a finite number between 0 and 1.');
    return Math.min(value, 1 - Number.EPSILON);
  };
  if (requestedRarity && !Object.hasOwn(RARITIES, requestedRarity)) throw new RangeError('Unknown loot rarity.');
  const rarity = requestedRarity || rollRarity(roll, boss, pity);
  const primaryStat=characterClass.abilities.attack.stat||'damage';
  const eligible = ITEM_BASES.filter(item => item.minLevel <= currentLevel && (!item.classIds || item.classIds.includes(characterClass.id))&&
    (baseId||item.type!=='weapon'||item.stats[primaryStat]>0));
  const itemBase = baseId ? eligible.find(item => item.id === baseId) : pick(eligible, roll);
  if (!itemBase) throw new RangeError('The requested loot base is unavailable for this class and level.');
  const candidates = AFFIXES.filter(affix => affix.types.includes(itemBase.type));
  const affixes = [];
  for (let index = 0; index < RARITIES[rarity].affixCount; index++) {
    const affix = smartAffix(candidates,roll,characterClass,itemBase.type,index);
    candidates.splice(candidates.indexOf(affix), 1);
    affixes.push({ id: affix.id, name: affix.name, stats: affixStats(affix, currentLevel, rarity, 0.85 + roll() * 0.3) });
  }
  const legendary = rarity === 'legendary' ? LEGENDARY_AFFIXES[characterClass.id] : null;
  if (legendary) affixes.push({ id: legendary.id, name: legendary.name, stats: { ...legendary.stats }, legendary: true });
  const set = currentLevel >= 30 && ['rare', 'epic', 'legendary'].includes(rarity) && roll() < (rarity === 'legendary' ? 0.7 : rarity === 'epic' ? 0.4 : 0.15)
    ? Object.values(SETS).find(entry => entry.classIds.includes(characterClass.id)) : null;
  const prefix = legendary?.name || (set ? set.name : null);
  const item = {
    id: itemId(uid), baseId: itemBase.id, name: prefix ? `${prefix}: ${itemBase.name}` : `${itemBase.name}${affixes[0] ? ` ${affixes[0].name}` : ''}`,
    type: itemBase.type, rarity, level: currentLevel, icon: itemBase.icon,
    description: legendary?.description || (set ? `Teil des Sets „${set.name}“. Zwei und drei verschiedene Ausrüstungsteile gewähren Setboni.` : itemBase.description),
    stats: baseStats(itemBase, currentLevel, rarity),
    price: Math.round(itemBase.price * (1 + currentLevel * 0.06) * RARITIES[rarity].statMultiplier * (1 + RARITIES[rarity].affixCount * 0.3)),
    affixes, sockets: Array(RARITIES[rarity].socketCount).fill(null), setId: set?.id || null,
    source: String(source || 'world').slice(0, 80), power: 0, upgrade: 0, dungeonTier:tier,
    balanceVersion:BALANCE_VERSION,classId:characterClass.id,
  };
  item.power = itemPower(item);
  if (pity && typeof pity === 'object') {
    pity.legendaryMisses = rarity === 'legendary' ? 0 : clamp((Number.isFinite(pity.legendaryMisses) ? pity.legendaryMisses : 0) + 1, 0, 499);
    if (boss) pity.bossMisses = rarity === 'legendary' ? 0 : clamp((Number.isFinite(pity.bossMisses) ? pity.bossMisses : 0) + 1, 0, 33);
    else if (rarity === 'legendary') pity.bossMisses = 0;
  }
  return item;
}

function gemData(gem) {
  const id = typeof gem === 'string' ? gem : gem?.id;
  const tier = typeof gem === 'string' ? 1 : gem?.tier ?? 1;
  return Object.hasOwn(GEM_TYPES, id) && Number.isInteger(tier) && tier >= 1 && tier <= 3 ? { gem: GEM_TYPES[id], tier } : null;
}

/** item.stats is ONLY the base roll. Do not cache this combined result back into item.stats. */
export function computeItemStats(item) {
  const itemBase=ITEM_BASES.find(entry=>entry.id===item?.baseId);
  // Legacy serialized rolls are still checked against their original formula.
  // Only their runtime modifier layer uses the new canonical budget.
  const rebalanceLegacy=itemBase&&item?.balanceVersion!==BALANCE_VERSION&&
    Object.hasOwn(RARITIES,item.rarity)&&Number.isInteger(item.level)&&
    statsMatch(item.stats,baseStats(itemBase,item.level,item.rarity,1));
  const stats = addStats({},rebalanceLegacy?baseStats(itemBase,item.level,item.rarity):item?.stats);
  for (const affix of Array.isArray(item?.affixes) ? item.affixes : []) addStats(stats,rebalanceLegacy?derivedAffix(affix,item):affix?.stats);
  const upgrade = Number.isInteger(item?.upgrade) ? clamp(item.upgrade, 0, 10) : 0;
  const dungeonTier=Number.isInteger(item?.dungeonTier)?clamp(item.dungeonTier,1,30):1;
  const upgradeFactor = 1.06 ** upgrade * (1+(dungeonTier-1)*.035);
  for (const key of Object.keys(stats)) if (!percentageStats.has(key)) stats[key] = round(stats[key] * upgradeFactor);
  for (const socket of Array.isArray(item?.sockets) ? item.sockets : []) {
    const data = gemData(socket);
    if (data) addStats(stats, data.gem.stats, data.tier);
  }
  for(const stat of Object.keys(stats))stats[stat]=round(clamp(stats[stat],0,GEAR_STAT_CAPS[stat]));
  return stats;
}

export function computeSetBonuses(items = []) {
  const slotsBySet = new Map();
  for (const item of items) {
    if (!Object.hasOwn(SETS, item?.setId) || !['weapon', 'armor', 'charm'].includes(item.type)) continue;
    if (!slotsBySet.has(item.setId)) slotsBySet.set(item.setId, new Set());
    slotsBySet.get(item.setId).add(item.type);
  }
  const stats = {};
  for (const [id, slots] of slotsBySet) {
    for (const [count, bonuses] of Object.entries(SETS[id].bonuses)) if (slots.size >= Number(count)) addStats(stats, bonuses);
  }
  return stats;
}

export function itemPower(item) {
  const weights = { maxHp: 0.06, mana: 0.15, damage: 2, armor: 2, crit: 100, speed: 0.25, spellDamage: 1.2, manaRegen: 5, cooldown: 100, dodgeCooldown: 80, gatherYield: 8, lifeSteal: 200 };
  return Math.max(1, Math.round(Object.entries(computeItemStats(item)).reduce((total, [key, value]) => total + value * (weights[key] || 0), 0)));
}

function validStats(stats) {
  return !!stats && typeof stats === 'object' && !Array.isArray(stats) && Object.entries(stats).every(([key, value]) => Object.hasOwn(STAT_CAPS, key) && Number.isFinite(value) && value >= 0 && value <= STAT_CAPS[key]);
}
function statsMatch(actual, expected) {
  return validStats(actual) && Object.keys(actual).length === Object.keys(expected).length && Object.entries(expected).every(([key, value]) => Math.abs(actual[key] - value) < 0.00011);
}

export function validateLootItem(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (typeof item.id !== 'string' || !/^loot:[a-zA-Z0-9:_-]{1,95}$/.test(item.id)) return false;
  const itemBase = ITEM_BASES.find(entry => entry.id === item.baseId);
  if (!itemBase || item.type !== itemBase.type || !Object.hasOwn(RARITIES, item.rarity)) return false;
  if (!Number.isInteger(item.level) || item.level < itemBase.minLevel || item.level > MAX_LEVEL) return false;
  if(item.balanceVersion!=null&&item.balanceVersion!==1&&item.balanceVersion!==BALANCE_VERSION)return false;
  if(item.balanceVersion===BALANCE_VERSION&&
    (typeof item.classId!=='string'||getClass(item.classId).id!==item.classId||itemBase.classIds&&!itemBase.classIds.includes(item.classId)))return false;
  const version=item.balanceVersion===BALANCE_VERSION?BALANCE_VERSION:1;
  if (item.upgrade != null && (!Number.isInteger(item.upgrade) || item.upgrade < 0 || item.upgrade > 10)) return false;
  if (item.dungeonTier != null && (!Number.isInteger(item.dungeonTier) || item.dungeonTier < 1 || item.dungeonTier > 30)) return false;
  if (typeof item.name !== 'string' || !item.name.length || item.name.length > 150 || typeof item.description !== 'string' || item.description.length > 500) return false;
  if (typeof item.icon !== 'string' || item.icon.length > 12 || !Number.isFinite(item.price) || item.price < 0 || item.price > 1e7) return false;
  if (!Number.isFinite(item.power) || item.power < 0 || item.power > 1e6) return false;
  if (!statsMatch(item.stats, baseStats(itemBase, item.level, item.rarity,version))) return false;
  const rarity = RARITIES[item.rarity];
  if (!Array.isArray(item.affixes) || item.affixes.length !== rarity.affixCount + (item.rarity === 'legendary' ? 1 : 0)) return false;
  const seen = new Set();
  let legendaryCount = 0;
  for (const affix of item.affixes) {
    if (!affix || typeof affix.id !== 'string' || seen.has(affix.id) || !validStats(affix.stats)) return false;
    seen.add(affix.id);
    const normal = AFFIXES.find(entry => entry.id === affix.id);
    if (normal) {
      if (!normal.types.includes(item.type)) return false;
      const minimum = affixStats(normal, item.level, item.rarity, 0.85,version);
      const maximum = affixStats(normal, item.level, item.rarity, 1.15,version);
      if (Object.keys(affix.stats).length !== Object.keys(normal.stats).length || !Object.keys(normal.stats).every(key => Number.isFinite(affix.stats[key]) && affix.stats[key] >= minimum[key] - 0.00011 && affix.stats[key] <= maximum[key] + 0.00011)) return false;
    } else {
      const legendary = Object.values(LEGENDARY_AFFIXES).find(entry => entry.id === affix.id);
      if (item.rarity !== 'legendary' || !legendary || !statsMatch(affix.stats, legendary.stats)||
        version===BALANCE_VERSION&&legendary.id!==LEGENDARY_AFFIXES[item.classId].id) return false;
      legendaryCount++;
    }
  }
  if (legendaryCount !== (item.rarity === 'legendary' ? 1 : 0)) return false;
  if (!Array.isArray(item.sockets) || item.sockets.length !== rarity.socketCount || !item.sockets.every(socket => socket === null || !!gemData(socket))) return false;
  if (item.setId != null && (!Object.hasOwn(SETS, item.setId) || item.level < 30 || !['rare', 'epic', 'legendary'].includes(item.rarity))) return false;
  return validStats(computeItemStats(item));
}

export function salvageYield(item) {
  if (!validateLootItem(item)) return {};
  const rank = Object.keys(RARITIES).indexOf(item.rarity) + 1;
  const materials = { ore: Math.max(1, Math.floor(rank + item.level / 20)), dust: rank * 2 + Math.floor(item.level / 10) };
  if (rank >= 3) materials.crystal = Math.max(1, Math.floor(rank - 2 + item.level / 35));
  for (const socket of item.sockets) {
    const data = gemData(socket);
    if (data) materials[data.gem.id] = (materials[data.gem.id] || 0) + 1;
  }
  return materials;
}

export function describeStat(key, value) {
  if (!Number.isFinite(value)) return '';
  const formatted = percentageStats.has(key) ? `${Number((value * 100).toFixed(2))} %` : `${Number(value.toFixed(2))}`;
  return `${value >= 0 ? '+' : ''}${formatted} ${labels[key] || key}`;
}

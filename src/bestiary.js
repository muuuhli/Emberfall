import { normalEnemyStats } from './balance.js';

// Five authored species per biome. A species owns a combat budget, silhouette,
// attack rhythm and damage theme; champions retain that identity when promoted.
// Row: id, name, family, archetype, silhouette, level, health budget, damage
// budget, speed, range, color, attack pattern, traits, warning time, projectiles.
const chapters = {
  daemmerhain: [
    ['wolf', 'Hainwolf', 'beast', 'skirmisher', 'wolf', 1, 1, .75, 72, 30, '#8b8373', 'melee', ['swift'], .55, 1],
    ['slime', 'Dornenling', 'plant', 'spitter', 'slime', 2, .86, .8, 43, 28, '#687849', 'melee', ['venom'], .7, 1],
    ['grave_rat', 'Grabräuber-Ratte', 'beast', 'swarm', 'rat', 1, .66, .65, 104, 26, '#70574b', 'burst', ['bleeding', 'swift'], .45, 2],
    ['carrion_crow', 'Aaskrähe', 'beast', 'archer', 'crow', 2, .58, .82, 95, 145, '#666177', 'ranged', ['vicious'], .8, 1],
    ['gallows_cultist', 'Galgenbüßer', 'cultist', 'sorcerer', 'hooded', 3, .8, .78, 48, 175, '#90766b', 'hex', ['draining'], .95, 1],
  ],
  frostgrat: [
    ['frostwolf', 'Frostwolf', 'beast', 'skirmisher', 'wolf', 4, .9, .9, 92, 31, '#acbec8', 'melee', ['frost', 'swift'], .55, 1],
    ['ice_spider', 'Eiskluftspinne', 'insect', 'spitter', 'spider', 4, .64, .68, 76, 150, '#7396a8', 'fan', ['venom', 'frost'], .85, 3],
    ['rime_archer', 'Reifschütze', 'undead', 'archer', 'archer', 5, .76, 1.08, 51, 225, '#b2aaa2', 'ranged', ['frost'], 1.05, 1],
    ['glacier_ram', 'Gletscherwidder', 'beast', 'charger', 'ram', 5, 1.42, 1.2, 58, 120, '#929ead', 'charge', ['armored'], 1.15, 1],
    ['frost_witch', 'Die Winterwitwe', 'cultist', 'sorcerer', 'witch', 5, .82, .7, 46, 190, '#7e7ba1', 'ring', ['frost', 'arcane'], 1.2, 6],
  ],
  aschenmoor: [
    ['skeleton', 'Aschenwächter', 'undead', 'guardian', 'knight', 6, .74, .82, 56, 35, '#b6a798', 'melee', ['armored'], .7, 1],
    ['wraith', 'Moorgespenst', 'spectral', 'sorcerer', 'ghost', 7, .52, .82, 67, 180, '#897899', 'ranged', ['draining'], .8, 1],
    ['bone_hound', 'Knochenhund', 'undead', 'charger', 'hound', 6, .7, .9, 99, 140, '#ac9580', 'charge', ['bleeding', 'swift'], .95, 1],
    ['plague_spitter', 'Pestbläher', 'abomination', 'spitter', 'bloated', 8, 1.18, .72, 33, 165, '#7d8660', 'fan', ['venom'], 1.1, 3],
    ['grave_cantor', 'Grabkantor', 'cultist', 'summoner', 'priest', 8, .86, .58, 40, 185, '#9b7388', 'summoner', ['summoner', 'draining'], 1.35, 1],
  ],
  glutoede: [
    ['imp', 'Glutbrut', 'demon', 'spitter', 'imp', 9, .79, .78, 84, 145, '#ba7150', 'ranged', ['burning'], .65, 1],
    ['cinder_beetle', 'Schlackenkäfer', 'insect', 'guardian', 'beetle', 9, 1.36, .82, 42, 38, '#8c6f50', 'melee', ['armored', 'burning'], .9, 1],
    ['ash_brute', 'Aschenbrecher', 'abomination', 'brute', 'ogre', 10, 1.6, 1.28, 40, 48, '#9d786d', 'melee', ['vicious'], 1.05, 1],
    ['infernal_lancer', 'Höllenlanzer', 'demon', 'charger', 'lancer', 10, .95, 1.06, 77, 180, '#b68a67', 'charge', ['bleeding'], 1.2, 1],
    ['soot_priest', 'Rußprediger', 'cultist', 'sorcerer', 'priest', 11, .74, .65, 50, 195, '#8c6774', 'burst', ['burning', 'arcane'], 1.05, 3],
  ],
  sonnensteppe: [
    ['steppe_raider', 'Steppenräuber', 'cultist', 'skirmisher', 'raider', 15, .94, .96, 86, 35, '#aa8963', 'melee', ['bleeding'], .65, 1],
    ['scarecrow', 'Saatgrab-Vogelscheuche', 'construct', 'reaper', 'scarecrow', 13, 1.13, .9, 45, 90, '#99866a', 'fan', ['draining'], 1.1, 3],
    ['blood_tick', 'Blutzecke', 'insect', 'swarm', 'tick', 14, .6, .74, 108, 28, '#97625b', 'burst', ['draining', 'swift'], .6, 2],
    ['famine_hyena', 'Hungerhyäne', 'beast', 'charger', 'hyena', 15, .83, 1.12, 102, 165, '#9a8666', 'charge', ['vicious'], .95, 1],
    ['reap_monk', 'Sichelmönch', 'cultist', 'reaper', 'monk', 16, .86, 1.18, 63, 47, '#8d756b', 'melee', ['bleeding', 'arcane'], .8, 1],
  ],
  jadeauen: [
    ['jade_stalker', 'Jadepirscher', 'beast', 'skirmisher', 'panther', 25, .82, 1.05, 104, 36, '#578f72', 'melee', ['swift', 'venom'], .55, 1],
    ['marsh_serpent', 'Sumpfschlinge', 'beast', 'spitter', 'serpent', 21, .77, .7, 72, 190, '#7f9a60', 'fan', ['venom'], .95, 3],
    ['rot_mosquito', 'Fäulnisstecher', 'insect', 'swarm', 'mosquito', 22, .51, .82, 116, 140, '#83876a', 'burst', ['draining', 'swift'], .75, 2],
    ['drowned_druid', 'Ertrunkener Druide', 'undead', 'summoner', 'druid', 23, .88, .6, 47, 180, '#68887a', 'summoner', ['summoner', 'venom'], 1.3, 1],
    ['root_hulk', 'Wurzelungetüm', 'plant', 'brute', 'treant', 24, 1.7, 1.2, 34, 55, '#79634c', 'melee', ['regenerating'], 1.15, 1],
  ],
  sturmkueste: [
    ['tide_reaver', 'Gezeitenbrecher', 'undead', 'archer', 'pirate', 35, 1.02, .92, 75, 180, '#739eaa', 'ranged', ['frost'], .95, 1],
    ['drowned_pike', 'Ertrunkener Pikenträger', 'undead', 'guardian', 'lancer', 29, 1.25, 1.02, 46, 54, '#819393', 'melee', ['armored'], .9, 1],
    ['brine_witch', 'Salzhexe', 'cultist', 'sorcerer', 'witch', 30, .7, .61, 54, 215, '#8494ac', 'ring', ['frost', 'arcane'], 1.15, 6],
    ['crab_horror', 'Klippenkrabbe', 'abomination', 'charger', 'crab', 31, 1.48, 1.17, 52, 140, '#ac806e', 'charge', ['armored', 'bleeding'], 1.2, 1],
    ['storm_gull', 'Sturmmöwe', 'beast', 'archer', 'gull', 32, .55, .66, 112, 185, '#c2bba7', 'fan', ['swift'], .85, 3],
  ],
  dornwildnis: [
    ['thorn_hunter', 'Dornenjäger', 'cultist', 'archer', 'hunter', 43, .86, .86, 97, 190, '#78875e', 'burst', ['venom'], .9, 2],
    ['briar_widow', 'Dornenwitwe', 'insect', 'spitter', 'spider', 37, .72, .8, 85, 175, '#7d5676', 'fan', ['venom', 'swift'], 1, 3],
    ['thorn_knight', 'Rankenritter', 'plant', 'guardian', 'knight', 38, 1.38, 1.03, 48, 42, '#78826b', 'melee', ['armored', 'regenerating'], .85, 1],
    ['spore_oracle', 'Sporenorakel', 'plant', 'sorcerer', 'fungus', 39, .96, .52, 32, 195, '#a69281', 'ring', ['venom'], 1.3, 8],
    ['antler_horror', 'Geweihschrecken', 'beast', 'charger', 'stag', 40, 1.14, 1.2, 94, 185, '#9f8974', 'charge', ['bleeding'], 1.05, 1],
  ],
  obsidianpass: [
    ['obsidian_knight', 'Obsidianritter', 'construct', 'guardian', 'knight', 51, 1.35, 1.06, 57, 43, '#897c80', 'melee', ['armored'], .9, 1],
    ['glass_archer', 'Glasschütze', 'construct', 'archer', 'archer', 45, .65, 1.13, 52, 240, '#b8a8b1', 'ranged', ['bleeding'], 1.1, 1],
    ['slag_golem', 'Schlackengolem', 'construct', 'brute', 'golem', 46, 1.75, 1.18, 30, 58, '#7c655e', 'melee', ['armored', 'burning'], 1.2, 1],
    ['cinder_assassin', 'Rußmeuchler', 'cultist', 'skirmisher', 'assassin', 47, .68, .83, 119, 165, '#87768c', 'burst', ['swift', 'bleeding'], .7, 2],
    ['furnace_acolyte', 'Ofenakolyth', 'cultist', 'sorcerer', 'acolyte', 48, .84, .66, 49, 205, '#b77f63', 'fan', ['burning', 'arcane'], 1.1, 3],
  ],
  mondbruch: [
    ['moon_construct', 'Mondkonstrukt', 'construct', 'archer', 'automaton', 59, 1.08, .9, 66, 175, '#a795bc', 'ranged', ['arcane'], .95, 1],
    ['lunar_leech', 'Mondblutegel', 'insect', 'swarm', 'leech', 53, .57, .7, 98, 35, '#8b6f98', 'burst', ['draining'], .65, 2],
    ['mirror_shade', 'Spiegelschatten', 'spectral', 'skirmisher', 'shade', 54, .73, 1.08, 103, 42, '#9895bb', 'melee', ['swift', 'arcane'], .55, 1],
    ['bell_ringer', 'Glockenschläger', 'construct', 'brute', 'bell', 55, 1.48, .52, 38, 135, '#9d8e79', 'ring', ['armored'], 1.4, 8],
    ['lunatic_seer', 'Mondwahnsinniger', 'cultist', 'sorcerer', 'seer', 56, .79, .82, 52, 215, '#aa83a3', 'hex', ['arcane', 'draining'], 1.1, 1],
  ],
  permafrost: [
    ['frost_colossus', 'Gletscherkoloss', 'construct', 'brute', 'colossus', 67, 1.6, 1.2, 48, 65, '#9fbfca', 'melee', ['armored', 'frost'], 1.2, 1],
    ['frozen_dead', 'Eisleiche', 'undead', 'guardian', 'corpse', 61, 1.21, .89, 40, 39, '#a4b8b9', 'melee', ['frost'], .85, 1],
    ['ice_mantis', 'Eissichel', 'insect', 'reaper', 'mantis', 62, .7, 1.14, 100, 46, '#7b9baa', 'melee', ['bleeding', 'swift'], .7, 1],
    ['white_wraith', 'Weiße Trauer', 'spectral', 'sorcerer', 'ghost', 63, .62, .58, 70, 210, '#bccbd2', 'fan', ['frost', 'draining'], 1, 4],
    ['bone_mammoth', 'Knochenmammut', 'undead', 'charger', 'mammoth', 64, 1.72, 1.24, 44, 200, '#b7ac9b', 'charge', ['armored'], 1.35, 1],
  ],
  sandsenke: [
    ['sand_revenant', 'Dünenwiedergänger', 'undead', 'reaper', 'revenant', 75, 1.04, .85, 82, 155, '#b29c72', 'ranged', ['draining'], .85, 1],
    ['dune_scorpion', 'Grabskorpion', 'insect', 'spitter', 'scorpion', 69, 1.18, .72, 66, 175, '#a48c5e', 'fan', ['venom', 'armored'], 1.1, 3],
    ['scarab_swarm', 'Skarabäenschwarm', 'insect', 'swarm', 'swarm', 70, .6, .55, 106, 140, '#917b54', 'burst', ['draining', 'swift'], .75, 3],
    ['embalmed_priest', 'Balsampriester', 'undead', 'summoner', 'priest', 71, .82, .6, 43, 205, '#ab997a', 'summoner', ['summoner', 'venom'], 1.4, 1],
    ['glass_serpent', 'Glasschlange', 'construct', 'charger', 'serpent', 72, .78, 1.3, 94, 210, '#c0afa0', 'charge', ['bleeding'], 1.1, 1],
  ],
  traumsenke: [
    ['void_watcher', 'Risswächter', 'spectral', 'sorcerer', 'watcher', 79, .96, .92, 93, 180, '#a479ac', 'ranged', ['arcane'], .9, 1],
    ['nightmare_hound', 'Albtraumhund', 'beast', 'charger', 'hound', 77, .87, 1.13, 113, 185, '#7c648b', 'charge', ['swift', 'draining'], 1, 1],
    ['dream_eater', 'Traumfresser', 'abomination', 'brute', 'maw', 78, 1.4, 1.06, 47, 52, '#857394', 'melee', ['draining', 'regenerating'], 1.1, 1],
    ['veiled_witch', 'Schleierhexe', 'cultist', 'sorcerer', 'witch', 80, .72, .8, 59, 230, '#8f829e', 'hex', ['arcane'], 1.15, 1],
    ['sleep_crawler', 'Schlafkriecher', 'insect', 'spitter', 'crawler', 81, .9, .6, 65, 185, '#76918c', 'ring', ['venom'], 1.2, 6],
  ],
  blutmark: [
    ['flayed_legionnaire', 'Gehäuteter Legionär', 'undead', 'guardian', 'soldier', 85, 1.25, 1.04, 59, 45, '#ab7972', 'melee', ['armored', 'bleeding'], .85, 1],
    ['blood_carrion', 'Blutgeier', 'beast', 'archer', 'vulture', 86, .61, .71, 111, 205, '#95736e', 'fan', ['bleeding', 'swift'], .95, 3],
    ['crimson_cultist', 'Scharlachfanatiker', 'cultist', 'sorcerer', 'fanatic', 87, .75, .8, 68, 220, '#af655e', 'hex', ['draining'], 1, 1],
    ['corpse_stitcher', 'Leichennäher', 'cultist', 'summoner', 'stitcher', 88, .98, .55, 46, 200, '#92778b', 'summoner', ['summoner', 'draining'], 1.35, 1],
    ['war_abomination', 'Kriegsungetüm', 'abomination', 'charger', 'stitched', 89, 1.65, 1.27, 49, 190, '#a77768', 'charge', ['vicious', 'bleeding'], 1.3, 1],
  ],
  sternensund: [
    ['starfallen_guard', 'Sternfallwächter', 'construct', 'guardian', 'sentinel', 93, 1.3, 1.04, 54, 49, '#929eb6', 'melee', ['armored', 'arcane'], .95, 1],
    ['comet_worm', 'Kometenwurm', 'abomination', 'spitter', 'worm', 94, 1.17, .59, 39, 200, '#af97a6', 'ring', ['burning'], 1.2, 8],
    ['astral_archer', 'Astralschütze', 'spectral', 'archer', 'archer', 95, .67, 1.16, 72, 255, '#a4acc5', 'ranged', ['arcane'], 1.1, 1],
    ['void_siren', 'Leeren-Sirene', 'spectral', 'sorcerer', 'siren', 96, .78, .63, 61, 235, '#aa8fbb', 'fan', ['draining', 'arcane'], 1.1, 4],
    ['star_mantis', 'Sternensichel', 'insect', 'reaper', 'mantis', 97, .74, .84, 106, 170, '#849bb1', 'burst', ['bleeding', 'swift'], .8, 2],
  ],
  nexusriss: [
    ['rift_hound', 'Risshetzer', 'demon', 'charger', 'hound', 100, .89, 1.19, 115, 205, '#a67d9e', 'charge', ['swift', 'arcane'], 1.05, 1],
    ['abyss_beholder', 'Abgrundauge', 'demon', 'sorcerer', 'beholder', 100, 1.07, .58, 48, 245, '#b687b4', 'ring', ['arcane', 'draining'], 1.35, 8],
    ['flesh_portal', 'Fleischpforte', 'abomination', 'summoner', 'portal', 100, 1.46, .5, 28, 225, '#b58086', 'summoner', ['summoner', 'regenerating'], 1.5, 1],
    ['void_executioner', 'Leerenhenker', 'demon', 'reaper', 'executioner', 100, 1.24, 1.27, 67, 52, '#9b819f', 'melee', ['bleeding', 'armored'], 1.05, 1],
    ['nexus_seraph', 'Entweihter Seraph', 'spectral', 'archer', 'seraph', 100, .81, .64, 82, 260, '#c0a2bd', 'fan', ['arcane', 'burning'], 1.2, 5],
  ],
};

export const REGION_ENEMY_POOLS = Object.freeze(Object.fromEntries(Object.entries(chapters).map(([region, rows]) => [region, Object.freeze(rows.map(row => row[0]))])));
export const BESTIARY_SPECIES = Object.freeze(Object.values(REGION_ENEMY_POOLS).flat());
export const BESTIARY_FAMILIES = Object.freeze(['beast', 'undead', 'cultist', 'demon', 'insect', 'abomination', 'construct', 'spectral', 'plant']);

const descriptions = {
  melee: 'Bindet dich im Nahkampf; weiche dem angekündigten Schlag aus.',
  ranged: 'Zielt mit einem einzelnen Geschoss. Seitliches Ausweichen öffnet den Gegenangriff.',
  fan: 'Streut Geschosse in einem Fächer. Halte Abstand und nutze die Lücken.',
  burst: 'Greift mit einer schnellen Salve an, braucht danach eine längere Erholung.',
  ring: 'Entfesselt einen Ring langsamer Geschosse. Die Lücken bleiben durchquerbar.',
  charge: 'Hält kurz inne und stürmt dann auf deine letzte Position. Weiche seitlich aus.',
  hex: 'Verflucht deine markierte Position. Verlasse das Zeichen vor dem Einschlag.',
  summoner: 'Ruft schwächere Diener. Unterbrich den Ruf oder besiege die Diener zuerst.',
};

function definition(region, row) {
  const [id, name, family, archetype, silhouette, level, hpScale, damageScale, speed, range, color, pattern, traits, windup, projectileCount] = row;
  const combat = {
    pattern, windup, recovery: pattern === 'burst' ? 1.6 : pattern === 'summoner' ? 3.2 : pattern === 'charge' ? 1.45 : .9,
    projectileCount, projectileSpeed: pattern === 'ring' ? 110 : pattern === 'burst' ? 175 : pattern === 'fan' ? 155 : 195,
    spread: pattern === 'ring' ? Math.PI * 2 : pattern === 'fan' ? .7 : .13,
    preferredRange: range > 80 ? range * .7 : 0,
    aggroRange: 245, leashRange: 400, telegraphRadius: pattern === 'hex' ? 65 : pattern === 'charge' ? 38 : 62,
    chargeSpeed: Math.min(350, speed * 3.1), chargeDuration: .5,
    summonType: REGION_ENEMY_POOLS[region][0], summonLimit: 2,
  };
  return { id, name, family, archetype, silhouette, variant: id, level, hpScale, damageScale, speed, range, color, traits,
    combat, species: true, speciesId: id, regions: [region], boss: false, bossType: `${id}_boss`, size: archetype === 'brute' ? 1.18 : archetype === 'swarm' ? .8 : 1,
    description: descriptions[pattern], dropTable: level >= 75 ? 'endgame' : level >= 40 ? 'frontier' : 'adventure' };
}

/** Profile budgets apply exactly once, at the encounter's actual regional level. */
export function bestiaryCombatStats(typeOrDefinition, level, { boss } = {}) {
  const def = typeof typeOrDefinition === 'string' ? BESTIARY_ENEMIES[typeOrDefinition] : typeOrDefinition;
  if (!def) return normalEnemyStats(level);
  const budget = normalEnemyStats(level ?? def.level);
  const champion = boss ?? def.boss;
  const baseHp = Math.max(1, Math.round(budget.hp * def.hpScale));
  const hp = Math.round(baseHp * (champion ? 5.2 : 1));
  const baseDamage = Math.max(1, Math.round(budget.damage * def.damageScale));
  const damage = Math.round(baseDamage * (champion ? 1.18 : 1));
  // Multiple projectiles share the same damage budget; being close to a caster
  // never multiplies its entire single-target attack by the projectile count.
  const xpScale = budget.level < 12 ? .54 : 1;
  const challenge = Math.max(.75, Math.min(1.25, Math.sqrt(def.hpScale * def.damageScale)));
  return { level: budget.level, hp, maxHp: hp, damage,
    xp: Math.round(budget.xp * xpScale * challenge * (champion ? 3.2 : 1)),
    gold: Math.round((5 + budget.level * 2.5) * (champion ? 3.5 : 1)),
    attackPeriod: def.combat.windup + def.combat.recovery,
    lootLevel: budget.level, lootTier: champion ? 2 : 1 };
}

const ordinary = Object.fromEntries(Object.entries(chapters).flatMap(([region, rows]) => rows.map(row => {
  const def = definition(region, row);
  return [def.id, { ...def, ...bestiaryCombatStats(def, def.level) }];
})));
const champions = Object.fromEntries(Object.values(ordinary).map(def => {
  const id = def.bossType;
  const champion = { ...def, id, name: `${def.name} · Schreckensfürst`, baseType: def.id, questTarget: def.id,
    species: false, boss: true, size: Math.max(1.35, def.size * 1.28), traits: [...def.traits, 'champion'],
    combat: { ...def.combat, windup: Math.max(1.15, def.combat.windup + .3), recovery: def.combat.recovery + .45,
      aggroRange: 145, leashRange: 300, telegraphRadius: def.combat.pattern === 'hex' ? 95 : 105,
      chargeSpeed: Math.min(320, def.combat.chargeSpeed), summonLimit: 3 },
    description: `Ein optionaler Weltboss. ${def.description}` };
  return [id, { ...champion, ...bestiaryCombatStats(champion, def.level) }];
}));
export const BESTIARY_ENEMIES = Object.freeze({ ...ordinary, ...champions });

export function createBestiaryEnemy(type, id, x, y, { level, region, boss = false } = {}) {
  const base = BESTIARY_ENEMIES[type];
  if (!base) throw new Error(`Unknown bestiary species: ${type}`);
  const def = boss && !base.boss ? BESTIARY_ENEMIES[base.bossType] : base;
  return { id, type: def.id, region: region || def.regions[0], x, y, homeX: x, homeY: y,
    ...bestiaryCombatStats(def, level ?? def.level), attackTimer: 0, phase: 'idle', alive: true, respawnAt: 0,
    boss: def.boss, bossVariant: def.boss, bestiary: true, speciesId: def.speciesId };
}

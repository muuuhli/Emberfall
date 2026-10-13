/** Class definitions contain no mutable character state and can be shared by client and server. */
const statMods = (changes = {}) => ({ maxHp: 0, mana: 0, damage: 0, armor: 0, crit: 0, speed: 0, spellDamage: 0, manaRegen: 0, cooldown: 0, dodgeCooldown: 0, gatherYield: 0, lifeSteal: 0, ...changes });
const talent = (classId, branch, suffix, name, description, stat, value, options = {}) => ({
  id: `${classId}_${suffix}`, classId, branch, name, description, icon: options.icon || '✦',
  maxRank: 10, cost: 2, requires: null, minLevel: 1, effect: { stat, value }, ...options,
});
const attack = (name, changes = {}) => ({ kind: 'melee', name, range: 90, arc: 1.8, stat: 'damage', damageMultiplier: 1, projectileSpeed: 0, cooldown: 0.38, ...changes });
const ability = (kind, name, color, changes = {}) => ({ kind, name, color, cost: 18, cooldown: 4, radius: 100, range: 540, projectileSpeed: 430, damageMultiplier: 1, ...changes });

export const CLASSES = [
  {
    id: 'guardian', name: 'Wächter', role: 'Tank', color: '#d6ad66', weaponId: 'rusty_blade',
    description: 'Bindet Gegner an sich und fängt tödliche Angriffe mit Schilden ab. Der sichere Anker einer Raidgruppe.',
    statMods: statMods({ maxHp: 35, armor: 3, damage: 2, spellDamage: -3, speed: -5 }),
    abilities: {
      attack: attack('Schildklinge', { color: '#d6ad66', cooldown: 0.34 }),
      bolt: ability('shield', 'Bastion', '#e2bf77', { cost: 14, cooldown: 5.5, radius: 90, damageMultiplier: 0, shieldMultiplier: 0.4, duration: 5, tauntRadius: 220 }),
      nova: ability('shield', 'Eiserner Wall', '#f4d99b', { cost: 30, cooldown: 10, radius: 170, damageMultiplier: 0.45, shieldMultiplier: 0.6, duration: 6, tauntRadius: 300, allies: true }),
    },
    talents: [
      talent('guardian', 'Wächter', 'vigor', 'Eiserner Wille', '+20 maximales Leben pro Rang.', 'maxHp', 20, { maxRank: 3, cost: 1, icon: '♥' }),
      talent('guardian', 'Wächter', 'steel', 'Stählerne Haut', '+2 Rüstung pro Rang.', 'armor', 2, { maxRank: 3, cost: 1, requires: 'guardian_vigor', icon: '⬡' }),
      talent('guardian', 'Wächter', 'might', 'Brecher', '+4 Nahkampfschaden pro Rang.', 'damage', 4, { maxRank: 3, cost: 1, requires: 'guardian_steel', icon: '⚔' }),
      talent('guardian', 'Wächter', 'siphon', 'Ungebrochen', '+3 % Lebensraub pro Rang.', 'lifeSteal', 0.03, { maxRank: 3, cost: 1, requires: 'guardian_might', icon: '✚' }),
      talent('guardian', 'Bastion', 'bulwark', 'Unerschütterlich', '+18 maximales Leben pro Rang.', 'maxHp', 18, { minLevel: 12, requires: 'guardian_steel', icon: '♥' }),
      talent('guardian', 'Bastion', 'plate', 'Lebende Festung', '+1,5 Rüstung pro Rang.', 'armor', 1.5, { minLevel: 25, requires: 'guardian_bulwark', icon: '⬡' }),
      talent('guardian', 'Vergeltung', 'revenge', 'Vergeltung', '+3 Nahkampfschaden pro Rang.', 'damage', 3, { minLevel: 12, requires: 'guardian_might', icon: '⚔' }),
      talent('guardian', 'Vergeltung', 'resolve', 'Schlachtrhythmus', '+2 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.02, { minLevel: 25, requires: 'guardian_revenge', icon: '◷' }),
      talent('guardian', 'Bastion', 'stamina', 'Kraft der Ahnen', '+25 maximales Leben pro Rang.', 'maxHp', 25, { minLevel: 40, requires: 'guardian_plate', icon: '♥' }),
      talent('guardian', 'Vergeltung', 'blood', 'Standhaftes Herz', '+0,5 % Lebensraub pro Rang.', 'lifeSteal', 0.005, { minLevel: 40, requires: 'guardian_resolve', icon: '✚' }),
      talent('guardian', 'Bastion', 'eternal', 'Ewige Wacht', '+1 Mana-Regeneration pro Rang.', 'manaRegen', 1, { minLevel: 60, requires: 'guardian_stamina', icon: '≈' }),
      talent('guardian', 'Vergeltung', 'champion', 'Champion der Glut', '+5 Nahkampfschaden pro Rang.', 'damage', 5, { minLevel: 80, requires: 'guardian_blood', icon: '★' }),
    ],
  },
  {
    id: 'paladin', name: 'Paladin', role: 'Heilung / Tank', color: '#f2d78c', weaponId: 'novice_hammer',
    description: 'Kämpft mit Hammer und Licht. Heilt Verbündete im Gefecht und reinigt Gegner mit einer heiligen Flut.',
    statMods: statMods({ maxHp: 20, mana: 15, damage: -2, armor: 2, spellDamage: 5, manaRegen: 0.5, speed: -5 }),
    abilities: {
      attack: attack('Lichthammer', { range: 100, cooldown: 0.46, damageMultiplier: 1.1, color: '#f2d78c' }),
      bolt: ability('heal', 'Licht der Treue', '#ffe7a4', { cost: 20, cooldown: 4, radius: 170, damageMultiplier: 0, healMultiplier: 1.6, allies: true }),
      nova: ability('aoe', 'Weihe', '#fff0bb', { cost: 30, cooldown: 9, radius: 160, damageMultiplier: 1.1, healMultiplier: 1.2, allies: true }),
    },
    talents: [
      talent('paladin', 'Schutz', 'faith', 'Unerschütterlicher Glaube', '+15 maximales Leben pro Rang.', 'maxHp', 15, { icon: '♥' }),
      talent('paladin', 'Licht', 'radiance', 'Strahlendes Licht', '+3 Zauberkraft pro Rang.', 'spellDamage', 3, { icon: '☀' }),
      talent('paladin', 'Schutz', 'aegis', 'Lichtaegis', '+1,5 Rüstung pro Rang.', 'armor', 1.5, { minLevel: 12, requires: 'paladin_faith', icon: '⬡' }),
      talent('paladin', 'Licht', 'well', 'Gnadenquelle', '+8 Mana pro Rang.', 'mana', 8, { minLevel: 12, requires: 'paladin_radiance', icon: '◈' }),
      talent('paladin', 'Vergeltung', 'judgment', 'Richterspruch', '+4 Nahkampfschaden pro Rang.', 'damage', 4, { minLevel: 25, requires: 'paladin_aegis', icon: '⚔' }),
      talent('paladin', 'Licht', 'prayer', 'Stilles Gebet', '+0,7 Mana-Regeneration pro Rang.', 'manaRegen', 0.7, { minLevel: 40, requires: 'paladin_well', icon: '≈' }),
      talent('paladin', 'Vergeltung', 'zeal', 'Heiliger Eifer', '+1 % kritische Trefferchance pro Rang.', 'crit', 0.01, { minLevel: 60, requires: 'paladin_judgment', icon: '◎' }),
      talent('paladin', 'Licht', 'dawn', 'Unsterbliche Morgenröte', '+2,5 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.025, { minLevel: 80, requires: 'paladin_prayer', icon: '★' }),
    ],
  },
  {
    id: 'ranger', name: 'Waldläufer', role: 'Fernkampf', color: '#9dcc79', weaponId: 'novice_bow',
    description: 'Bleibt beweglich, setzt durchdringende Pfeile und hält Verfolger in Dornenfallen fest.',
    statMods: statMods({ maxHp: -5, damage: 3, armor: -1, crit: 0.04, speed: 15, mana: 5, gatherYield: 1 }),
    abilities: {
      attack: attack('Waldpfeil', { kind: 'projectile', range: 580, arc: 0, projectileSpeed: 610, cooldown: 0.46, damageMultiplier: 1.05, color: '#a6d389' }),
      bolt: ability('projectile', 'Durchschlag', '#d4e8a3', { cost: 14, cooldown: 3, range: 720, projectileSpeed: 660, radius: 9, damageMultiplier: 1.65, piercing: 3, stat: 'damage' }),
      nova: ability('trap', 'Dornennetz', '#78b066', { cost: 24, cooldown: 7, radius: 140, damageMultiplier: 0.9, duration: 6, slow: 0.75 }),
    },
    talents: [
      talent('ranger', 'Jagd', 'aim', 'Ruhige Hand', '+3 Fernkampfschaden pro Rang.', 'damage', 3, { icon: '➤' }),
      talent('ranger', 'Wildnis', 'trail', 'Pfadfinder', '+4 Bewegungstempo pro Rang.', 'speed', 4, { icon: '↝' }),
      talent('ranger', 'Jagd', 'hawk', 'Falkenblick', '+1 % kritische Trefferchance pro Rang.', 'crit', 0.01, { minLevel: 12, requires: 'ranger_aim', icon: '◎' }),
      talent('ranger', 'Wildnis', 'harvester', 'Waldgaben', '+0,3 Sammelertrag pro Rang.', 'gatherYield', 0.3, { minLevel: 12, requires: 'ranger_trail', icon: '❧' }),
      talent('ranger', 'Wildnis', 'wind', 'Windflucht', '+2,5 % kürzere Ausweichzeit pro Rang.', 'dodgeCooldown', 0.025, { minLevel: 25, requires: 'ranger_harvester', icon: '↝' }),
      talent('ranger', 'Jagd', 'quiver', 'Endloser Köcher', '+7 Mana pro Rang.', 'mana', 7, { minLevel: 40, requires: 'ranger_hawk', icon: '◈' }),
      talent('ranger', 'Wildnis', 'bark', 'Borkenhaut', '+12 maximales Leben pro Rang.', 'maxHp', 12, { minLevel: 60, requires: 'ranger_wind', icon: '♥' }),
      talent('ranger', 'Jagd', 'huntmaster', 'Meister der Jagd', '+5 Fernkampfschaden pro Rang.', 'damage', 5, { minLevel: 80, requires: 'ranger_quiver', icon: '★' }),
    ],
  },
  {
    id: 'nightblade', name: 'Nachtklinge', role: 'Nahkampf / Burst', color: '#bd95cf', weaponId: 'novice_daggers',
    description: 'Ein schneller Duellant mit kritischen Dolchen. Springt durch Gegner und schützt den Rückzug mit Schattenfallen.',
    statMods: statMods({ maxHp: -15, damage: 2, armor: -1, crit: 0.07, speed: 20, dodgeCooldown: 0.1, lifeSteal: 0.01 }),
    abilities: {
      attack: attack('Doppeldolch', { range: 77, arc: 1.1, cooldown: 0.28, damageMultiplier: 0.88, color: '#cf9dec' }),
      bolt: ability('dashstrike', 'Schattenstich', '#c597e6', { cost: 18, cooldown: 4.3, radius: 80, range: 240, damageMultiplier: 2.1, duration: 0.16, stat: 'damage' }),
      nova: ability('trap', 'Nachtfessel', '#9870ba', { cost: 24, cooldown: 7.2, radius: 115, damageMultiplier: 1.3, duration: 5, slow: 0.5 }),
    },
    talents: [
      talent('nightblade', 'Assassine', 'edge', 'Rasierklingen', '+3 Nahkampfschaden pro Rang.', 'damage', 3, { icon: '⚔' }),
      talent('nightblade', 'Schatten', 'step', 'Leiser Schritt', '+4 Bewegungstempo pro Rang.', 'speed', 4, { icon: '↝' }),
      talent('nightblade', 'Assassine', 'lethality', 'Tödliche Präzision', '+1,5 % kritische Trefferchance pro Rang.', 'crit', 0.015, { minLevel: 12, requires: 'nightblade_edge', icon: '◎' }),
      talent('nightblade', 'Schatten', 'vanish', 'Flüchtiger Schatten', '+3 % kürzere Ausweichzeit pro Rang.', 'dodgeCooldown', 0.03, { minLevel: 12, requires: 'nightblade_step', icon: '↝' }),
      talent('nightblade', 'Assassine', 'siphon', 'Blutdurst', '+0,6 % Lebensraub pro Rang.', 'lifeSteal', 0.006, { minLevel: 25, requires: 'nightblade_lethality', icon: '✚' }),
      talent('nightblade', 'Schatten', 'focus', 'Dunkler Fokus', '+6 Mana pro Rang.', 'mana', 6, { minLevel: 40, requires: 'nightblade_vanish', icon: '◈' }),
      talent('nightblade', 'Assassine', 'duelist', 'Unfassbarer Duellant', '+12 maximales Leben pro Rang.', 'maxHp', 12, { minLevel: 60, requires: 'nightblade_siphon', icon: '♥' }),
      talent('nightblade', 'Schatten', 'eclipse', 'Eklipse', '+2,5 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.025, { minLevel: 80, requires: 'nightblade_focus', icon: '★' }),
    ],
  },
  {
    id: 'flamecaller', name: 'Flammenrufer', role: 'Flächenschaden', color: '#ed995c', weaponId: 'novice_ember_staff',
    description: 'Wirft Feuerbälle mit explosiver Wirkung und entfesselt große Flächenbrände. Stark gegen dichte Gegnergruppen.',
    statMods: statMods({ maxHp: -15, mana: 30, damage: -4, armor: -2, spellDamage: 8, manaRegen: 1 }),
    abilities: {
      attack: attack('Glutfunke', { kind: 'projectile', stat: 'spellDamage', range: 480, arc: 0, projectileSpeed: 380, cooldown: 0.58, damageMultiplier: 0.65, color: '#f0a06d' }),
      bolt: ability('projectile', 'Feuerball', '#f6aa62', { cost: 16, cooldown: 3.2, radius: 11, damageMultiplier: 1.3, splashRadius: 75, range: 620, projectileSpeed: 390 }),
      nova: ability('aoe', 'Inferno', '#f3a35e', { cost: 32, cooldown: 8, radius: 175, damageMultiplier: 1.7, duration: 4, burnDamageMultiplier: 0.18 }),
    },
    talents: [
      talent('flamecaller', 'Feuer', 'spark', 'Erwachende Glut', '+4 Zauberkraft pro Rang.', 'spellDamage', 4, { icon: '✦' }),
      talent('flamecaller', 'Äther', 'reservoir', 'Ätherreservoir', '+10 Mana pro Rang.', 'mana', 10, { icon: '◈' }),
      talent('flamecaller', 'Feuer', 'combustion', 'Verbrennung', '+1 % kritische Trefferchance pro Rang.', 'crit', 0.01, { minLevel: 12, requires: 'flamecaller_spark', icon: '◎' }),
      talent('flamecaller', 'Äther', 'flow', 'Feuerfluss', '+0,8 Mana-Regeneration pro Rang.', 'manaRegen', 0.8, { minLevel: 12, requires: 'flamecaller_reservoir', icon: '≈' }),
      talent('flamecaller', 'Feuer', 'pyre', 'Scheiterhaufen', '+5 Zauberkraft pro Rang.', 'spellDamage', 5, { minLevel: 25, requires: 'flamecaller_combustion', icon: '☀' }),
      talent('flamecaller', 'Äther', 'ashes', 'Aus der Asche', '+13 maximales Leben pro Rang.', 'maxHp', 13, { minLevel: 40, requires: 'flamecaller_flow', icon: '♥' }),
      talent('flamecaller', 'Feuer', 'cinder', 'Schnelle Zündung', '+2 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.02, { minLevel: 60, requires: 'flamecaller_pyre', icon: '◷' }),
      talent('flamecaller', 'Äther', 'phoenix', 'Phönixherz', '+0,5 % Lebensraub pro Rang.', 'lifeSteal', 0.005, { minLevel: 80, requires: 'flamecaller_ashes', icon: '★' }),
    ],
  },
  {
    id: 'frostweaver', name: 'Frostweber', role: 'Kontrolle / Fernkampf', color: '#91cde5', weaponId: 'novice_rime_scepter',
    description: 'Verlangsamt Angreifer mit Frostlanzen und einer Eisfalle. Schafft sichere Räume für die Gruppe.',
    statMods: statMods({ mana: 25, spellDamage: 5, armor: 1, damage: -3, manaRegen: 0.5, cooldown: 0.03 }),
    abilities: {
      attack: attack('Eissplitter', { kind: 'projectile', stat: 'spellDamage', range: 540, arc: 0, projectileSpeed: 470, cooldown: 0.55, damageMultiplier: 0.65, color: '#b2e3f7', slow: 0.2, duration: 1.5 }),
      bolt: ability('projectile', 'Frostlanze', '#b0e4fa', { cost: 15, cooldown: 3, radius: 9, damageMultiplier: 1.1, slow: 0.5, duration: 3, range: 640, projectileSpeed: 500 }),
      nova: ability('trap', 'Wintergefängnis', '#9eddef', { cost: 28, cooldown: 8, radius: 160, damageMultiplier: 0.9, duration: 8, slow: 0.65 }),
    },
    talents: [
      talent('frostweaver', 'Winter', 'shard', 'Scharfer Reif', '+3 Zauberkraft pro Rang.', 'spellDamage', 3, { icon: '❄' }),
      talent('frostweaver', 'Eiswall', 'shell', 'Eispanzer', '+1 Rüstung pro Rang.', 'armor', 1, { icon: '⬡' }),
      talent('frostweaver', 'Winter', 'clarity', 'Klare Kälte', '+8 Mana pro Rang.', 'mana', 8, { minLevel: 12, requires: 'frostweaver_shard', icon: '◈' }),
      talent('frostweaver', 'Eiswall', 'permafrost', 'Dauerfrost', '+14 maximales Leben pro Rang.', 'maxHp', 14, { minLevel: 12, requires: 'frostweaver_shell', icon: '♥' }),
      talent('frostweaver', 'Winter', 'blizzard', 'Blizzard', '+4 Zauberkraft pro Rang.', 'spellDamage', 4, { minLevel: 25, requires: 'frostweaver_clarity', icon: '❄' }),
      talent('frostweaver', 'Eiswall', 'flow', 'Schmelzwasser', '+0,7 Mana-Regeneration pro Rang.', 'manaRegen', 0.7, { minLevel: 40, requires: 'frostweaver_permafrost', icon: '≈' }),
      talent('frostweaver', 'Winter', 'rime', 'Kälteschock', '+1 % kritische Trefferchance pro Rang.', 'crit', 0.01, { minLevel: 60, requires: 'frostweaver_blizzard', icon: '◎' }),
      talent('frostweaver', 'Eiswall', 'absolute', 'Absoluter Nullpunkt', '+2,5 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.025, { minLevel: 80, requires: 'frostweaver_flow', icon: '★' }),
    ],
  },
  {
    id: 'druid', name: 'Druide', role: 'Heilung / Natur', color: '#85c8a0', weaponId: 'novice_living_branch',
    description: 'Versorgt die Gruppe mit Heilung und Regeneration. Nutzt die Kraft des Hains und sammelt besonders effizient.',
    statMods: statMods({ maxHp: 5, mana: 30, spellDamage: 3, damage: -3, manaRegen: 1.5, gatherYield: 1 }),
    abilities: {
      attack: attack('Dornenranke', { kind: 'projectile', stat: 'spellDamage', range: 460, arc: 0, projectileSpeed: 430, cooldown: 0.5, damageMultiplier: 0.62, color: '#a2d8ac' }),
      bolt: ability('heal', 'Blütensegen', '#ace2b6', { cost: 16, cooldown: 3.2, radius: 160, damageMultiplier: 0, healMultiplier: 1.9, allies: true }),
      nova: ability('heal', 'Kreis des Lebens', '#99e1b1', { cost: 32, cooldown: 8.5, radius: 200, damageMultiplier: 0, healMultiplier: 2.1, duration: 6, regenerationMultiplier: 0.25, allies: true }),
    },
    talents: [
      talent('druid', 'Blüte', 'bloom', 'Mondblüte', '+3 Zauberkraft pro Rang.', 'spellDamage', 3, { icon: '✿' }),
      talent('druid', 'Wildnis', 'harvest', 'Hüter des Hains', '+0,4 Sammelertrag pro Rang.', 'gatherYield', 0.4, { icon: '❧' }),
      talent('druid', 'Blüte', 'well', 'Lebensquelle', '+9 Mana pro Rang.', 'mana', 9, { minLevel: 12, requires: 'druid_bloom', icon: '◈' }),
      talent('druid', 'Wildnis', 'bark', 'Alte Borke', '+1,3 Rüstung pro Rang.', 'armor', 1.3, { minLevel: 12, requires: 'druid_harvest', icon: '⬡' }),
      talent('druid', 'Blüte', 'spring', 'Ewiger Frühling', '+0,8 Mana-Regeneration pro Rang.', 'manaRegen', 0.8, { minLevel: 25, requires: 'druid_well', icon: '≈' }),
      talent('druid', 'Wildnis', 'roots', 'Tiefe Wurzeln', '+17 maximales Leben pro Rang.', 'maxHp', 17, { minLevel: 40, requires: 'druid_bark', icon: '♥' }),
      talent('druid', 'Blüte', 'cycle', 'Lebenszyklus', '+2 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.02, { minLevel: 60, requires: 'druid_spring', icon: '◷' }),
      talent('druid', 'Wildnis', 'wildheart', 'Herz der Wildnis', '+5 Zauberkraft pro Rang.', 'spellDamage', 5, { minLevel: 80, requires: 'druid_roots', icon: '★' }),
    ],
  },
  {
    id: 'shadowbinder', name: 'Schattenbinder', role: 'Beschwörung / Lebensraub', color: '#a88ddb', weaponId: 'novice_soul_focus',
    description: 'Beschwört Schattengeister und entzieht Gegnern Leben. Seine Diener üben Druck aus, während er sich selbst heilt.',
    statMods: statMods({ maxHp: -10, mana: 20, damage: -4, spellDamage: 5, manaRegen: 1, lifeSteal: 0.035 }),
    abilities: {
      attack: attack('Seelenfunke', { kind: 'projectile', stat: 'spellDamage', range: 500, arc: 0, projectileSpeed: 400, cooldown: 0.52, damageMultiplier: 0.62, color: '#b298e5' }),
      bolt: ability('drain', 'Seelenentzug', '#d1afe9', { cost: 14, cooldown: 2.8, radius: 10, damageMultiplier: 1.2, healMultiplier: 0.45, range: 560, projectileSpeed: 380 }),
      nova: ability('summon', 'Schattenpakt', '#a98bd9', { cost: 30, cooldown: 12, radius: 120, damageMultiplier: 0.35, summonCount: 2, duration: 18, summonRange: 280, summonAttackCooldown: 0.9 }),
    },
    talents: [
      talent('shadowbinder', 'Seele', 'hunger', 'Seelenhunger', '+0,6 % Lebensraub pro Rang.', 'lifeSteal', 0.006, { icon: '✚' }),
      talent('shadowbinder', 'Pakt', 'whisper', 'Dunkles Flüstern', '+3 Zauberkraft pro Rang.', 'spellDamage', 3, { icon: '✦' }),
      talent('shadowbinder', 'Seele', 'vessel', 'Seelengefäß', '+16 maximales Leben pro Rang.', 'maxHp', 16, { minLevel: 12, requires: 'shadowbinder_hunger', icon: '♥' }),
      talent('shadowbinder', 'Pakt', 'depth', 'Tiefe des Paktes', '+9 Mana pro Rang.', 'mana', 9, { minLevel: 12, requires: 'shadowbinder_whisper', icon: '◈' }),
      talent('shadowbinder', 'Seele', 'thirst', 'Unstillbarer Durst', '+0,7 Mana-Regeneration pro Rang.', 'manaRegen', 0.7, { minLevel: 25, requires: 'shadowbinder_vessel', icon: '≈' }),
      talent('shadowbinder', 'Pakt', 'dominion', 'Schattenherrschaft', '+4 Zauberkraft pro Rang.', 'spellDamage', 4, { minLevel: 40, requires: 'shadowbinder_depth', icon: '☾' }),
      talent('shadowbinder', 'Seele', 'reaper', 'Ernte der Seelen', '+1 % kritische Trefferchance pro Rang.', 'crit', 0.01, { minLevel: 60, requires: 'shadowbinder_thirst', icon: '◎' }),
      talent('shadowbinder', 'Pakt', 'abyss', 'Herr der Leere', '+2,5 % Abklingzeitverkürzung pro Rang.', 'cooldown', 0.025, { minLevel: 80, requires: 'shadowbinder_dominion', icon: '★' }),
    ],
  },
];

// Three linked specializations per class. The fourth node is an explicit
// bargain: a focused benefit costs a different defense, resource or damage stat.
// Existing talent IDs, rank limits and costs remain intact for older characters.
const specialization=(classId,branch,root,nodes)=>nodes.map(([suffix,name,description,stat,value,penalties],index)=>talent(
  classId,branch,suffix,name,description,stat,value,{
    minLevel:[8,20,45,75][index],maxRank:index===3?1:index===2?4:3,cost:index===3?5:index===0?1:2,
    requires:index===0?root:`${classId}_${nodes[index-1][0]}`,requiresRank:index===3?3:2,
    icon:({maxHp:'♥',mana:'◈',damage:'⚔',armor:'⬡',crit:'◎',speed:'↝',spellDamage:'✦',manaRegen:'≈',cooldown:'◷',dodgeCooldown:'↝',gatherYield:'❧',lifeSteal:'✚'})[stat],
    mastery:true,tier:index+1,keystone:index===3,secondaryEffects:penalties||[],
  },
));

const SPECIALIZATIONS={
  guardian:[
    ...specialization('guardian','Bastion','guardian_steel',[
      ['gatekeeper','Torhüter','+12 maximales Leben pro Rang.','maxHp',12],
      ['black_plate','Schwarzes Eisen','+1,2 Rüstung pro Rang.','armor',1.2],
      ['siege_heart','Belagerungsherz','+16 maximales Leben pro Rang.','maxHp',16],
      ['living_citadel','Lebende Zitadelle','+130 maximales Leben, aber −12 Bewegungstempo.','maxHp',130,[{stat:'speed',value:-12}]],
    ]),
    ...specialization('guardian','Vergeltung','guardian_might',[
      ['iron_edge','Schneide aus Eisen','+2 Nahkampfschaden pro Rang.','damage',2],
      ['avenger','Rächer der Gefallenen','+0,6 % kritische Trefferchance pro Rang.','crit',.006],
      ['executioner','Urteil des Wächters','+3 Nahkampfschaden pro Rang.','damage',3],
      ['broken_oath','Gebrochener Eid','+28 Nahkampfschaden, aber −5 Rüstung.','damage',28,[{stat:'armor',value:-5}]],
    ]),
    ...specialization('guardian','Wächter','guardian_vigor',[
      ['vigil','Totenwache','+5 Mana pro Rang.','mana',5],
      ['battle_breath','Atem der Schlacht','+0,25 Mana-Regeneration pro Rang.','manaRegen',.25],
      ['unyielding_rhythm','Unbeugsamer Takt','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['solemn_duty','Ewiger Dienst','+7 % Abklingzeitverkürzung, aber −12 Nahkampfschaden.','cooldown',.07,[{stat:'damage',value:-12}]],
    ]),
  ],
  paladin:[
    ...specialization('paladin','Schutz','paladin_faith',[
      ['oathkeeper','Eidwahrer','+12 maximales Leben pro Rang.','maxHp',12],
      ['pilgrim_plate','Pilgerpanzer','+1 Rüstung pro Rang.','armor',1],
      ['martyr_heart','Märtyrerherz','+15 maximales Leben pro Rang.','maxHp',15],
      ['stone_vow','Steinerner Schwur','+9 Rüstung, aber −10 Bewegungstempo.','armor',9,[{stat:'speed',value:-10}]],
    ]),
    ...specialization('paladin','Licht','paladin_radiance',[
      ['ember_prayer','Glutgebet','+5 Mana pro Rang.','mana',5],
      ['mercy','Gnade der Asche','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['litany','Letzte Litanei','+0,3 Mana-Regeneration pro Rang.','manaRegen',.3],
      ['healers_vow','Eid der Heilenden','+28 Zauberkraft, aber −14 Nahkampfschaden.','spellDamage',28,[{stat:'damage',value:-14}]],
    ]),
    ...specialization('paladin','Vergeltung','paladin_radiance',[
      ['inquisition','Inquisition','+2 Nahkampfschaden pro Rang.','damage',2],
      ['zealot','Ascheneifer','+0,6 % kritische Trefferchance pro Rang.','crit',.006],
      ['judges_hammer','Richterhammer','+3 Nahkampfschaden pro Rang.','damage',3],
      ['fanatic','Fanatiker','+6 % kritische Trefferchance, aber −30 maximales Mana.','crit',.06,[{stat:'mana',value:-30}]],
    ]),
  ],
  ranger:[
    ...specialization('ranger','Jagd','ranger_aim',[
      ['bloodtrail','Blutspur','+2 Fernkampfschaden pro Rang.','damage',2],
      ['keen_sight','Blick der Nacht','+0,6 % kritische Trefferchance pro Rang.','crit',.006],
      ['hunters_patience','Geduld des Jägers','+3 Fernkampfschaden pro Rang.','damage',3],
      ['glass_arrow','Gläserner Pfeil','+30 Fernkampfschaden, aber −65 maximales Leben.','damage',30,[{stat:'maxHp',value:-65}]],
    ]),
    ...specialization('ranger','Wildnis','ranger_trail',[
      ['silent_trail','Stiller Pfad','+2 Bewegungstempo pro Rang.','speed',2],
      ['sure_foot','Sicherer Tritt','+1 % kürzere Ausweichzeit pro Rang.','dodgeCooldown',.01],
      ['weathered','Wettergegerbt','+12 maximales Leben pro Rang.','maxHp',12],
      ['restless','Rastloser Wanderer','+8 % kürzere Ausweichzeit, aber −16 Fernkampfschaden.','dodgeCooldown',.08,[{stat:'damage',value:-16}]],
    ]),
    ...specialization('ranger','Bestien','ranger_aim',[
      ['beast_bond','Bund der Bestien','+5 Mana pro Rang.','mana',5],
      ['pack_call','Ruf des Rudels','+0,25 Mana-Regeneration pro Rang.','manaRegen',.25],
      ['falconer','Nachtfalkner','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['wild_pact','Wilder Pakt','+1,8 Mana-Regeneration, aber −3,5 % kritische Trefferchance.','manaRegen',1.8,[{stat:'crit',value:-.035}]],
    ]),
  ],
  nightblade:[
    ...specialization('nightblade','Assassine','nightblade_edge',[
      ['death_edge','Todesschneide','+2 Nahkampfschaden pro Rang.','damage',2],
      ['ambusher','Hinterhalt','+0,7 % kritische Trefferchance pro Rang.','crit',.007],
      ['sever','Abtrennen','+3 Nahkampfschaden pro Rang.','damage',3],
      ['fragile_killer','Zerbrechlicher Henker','+30 Nahkampfschaden, aber −90 maximales Leben.','damage',30,[{stat:'maxHp',value:-90}]],
    ]),
    ...specialization('nightblade','Schatten','nightblade_step',[
      ['unseen','Ungesehen','+2 Bewegungstempo pro Rang.','speed',2],
      ['afterimage','Nachbild','+1 % kürzere Ausweichzeit pro Rang.','dodgeCooldown',.01],
      ['cold_focus','Kalter Fokus','+5 Mana pro Rang.','mana',5],
      ['shadow_vow','Schwur des Schattens','+7 % Abklingzeitverkürzung, aber −16 Nahkampfschaden.','cooldown',.07,[{stat:'damage',value:-16}]],
    ]),
    ...specialization('nightblade','Gift','nightblade_edge',[
      ['venom_rite','Giftritus','+0,25 Mana-Regeneration pro Rang.','manaRegen',.25],
      ['widow_heart','Witwenherz','+0,3 % Lebensraub pro Rang.','lifeSteal',.003],
      ['cruel_patience','Grausame Geduld','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['blood_alchemy','Blutalchemie','+1,8 % Lebensraub, aber −4 Rüstung.','lifeSteal',.018,[{stat:'armor',value:-4}]],
    ]),
  ],
  flamecaller:[
    ...specialization('flamecaller','Feuer','flamecaller_spark',[
      ['char','Verkohlung','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['fire_gaze','Feuerblick','+0,6 % kritische Trefferchance pro Rang.','crit',.006],
      ['hellbrand','Höllenbrand','+3 Zauberkraft pro Rang.','spellDamage',3],
      ['glass_pyromancer','Gläserne Flamme','+36 Zauberkraft, aber −95 maximales Leben.','spellDamage',36,[{stat:'maxHp',value:-95}]],
    ]),
    ...specialization('flamecaller','Äther','flamecaller_reservoir',[
      ['coal_well','Kohlenbrunnen','+6 Mana pro Rang.','mana',6],
      ['ember_current','Glutstrom','+0,3 Mana-Regeneration pro Rang.','manaRegen',.3],
      ['ritual_fire','Ritualfeuer','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['eternal_fuel','Ewiger Brennstoff','+2 Mana-Regeneration, aber −14 Zauberkraft.','manaRegen',2,[{stat:'spellDamage',value:-14}]],
    ]),
    ...specialization('flamecaller','Asche','flamecaller_reservoir',[
      ['ash_blood','Aschenblut','+11 maximales Leben pro Rang.','maxHp',11],
      ['cinder_shell','Kohlenpanzer','+0,8 Rüstung pro Rang.','armor',.8],
      ['smoke_steps','Rauchpfade','+1 % kürzere Ausweichzeit pro Rang.','dodgeCooldown',.01],
      ['ashen_rebirth','Wiederkehr aus Asche','+8 Rüstung, aber −14 Zauberkraft.','armor',8,[{stat:'spellDamage',value:-14}]],
    ]),
  ],
  frostweaver:[
    ...specialization('frostweaver','Winter','frostweaver_shard',[
      ['bitter_shard','Bitterer Splitter','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['white_hunger','Weißer Hunger','+0,6 % kritische Trefferchance pro Rang.','crit',.006],
      ['deep_winter','Tiefer Winter','+3 Zauberkraft pro Rang.','spellDamage',3],
      ['brittle_power','Brüchige Macht','+32 Zauberkraft, aber −4 Rüstung.','spellDamage',32,[{stat:'armor',value:-4}]],
    ]),
    ...specialization('frostweaver','Eiswall','frostweaver_shell',[
      ['ice_blood','Eisblut','+12 maximales Leben pro Rang.','maxHp',12],
      ['rime_plate','Reifpanzer','+0,9 Rüstung pro Rang.','armor',.9],
      ['glacial_heart','Gletscherherz','+14 maximales Leben pro Rang.','maxHp',14],
      ['frozen_statue','Gefrorene Statue','+9 Rüstung, aber −10 Bewegungstempo.','armor',9,[{stat:'speed',value:-10}]],
    ]),
    ...specialization('frostweaver','Reif','frostweaver_shard',[
      ['quiet_snow','Stiller Schnee','+5 Mana pro Rang.','mana',5],
      ['cold_current','Kältestrom','+0,25 Mana-Regeneration pro Rang.','manaRegen',.25],
      ['winter_rhythm','Wintertakt','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['endless_frost','Endloser Frost','+7 % Abklingzeitverkürzung, aber −16 Zauberkraft.','cooldown',.07,[{stat:'spellDamage',value:-16}]],
    ]),
  ],
  druid:[
    ...specialization('druid','Blüte','druid_bloom',[
      ['night_bloom','Nachtblüte','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['dew','Letzter Tau','+0,3 Mana-Regeneration pro Rang.','manaRegen',.3],
      ['lunar_sap','Mondsaft','+5 Mana pro Rang.','mana',5],
      ['healers_roots','Wurzeln der Gnade','+28 Zauberkraft, aber −10 Bewegungstempo.','spellDamage',28,[{stat:'speed',value:-10}]],
    ]),
    ...specialization('druid','Wildnis','druid_harvest',[
      ['old_growth','Altes Wachstum','+12 maximales Leben pro Rang.','maxHp',12],
      ['thick_bark','Dichte Borke','+0,9 Rüstung pro Rang.','armor',.9],
      ['deep_soil','Tiefer Boden','+0,15 Sammelertrag pro Rang.','gatherYield',.15],
      ['rooted_guardian','Verwurzelter Hüter','+140 maximales Leben, aber −10 Bewegungstempo.','maxHp',140,[{stat:'speed',value:-10}]],
    ]),
    ...specialization('druid','Mond','druid_bloom',[
      ['dark_thorns','Dunkle Dornen','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['moon_step','Mondschritt','+1 % kürzere Ausweichzeit pro Rang.','dodgeCooldown',.01],
      ['lunar_cycle','Mondzyklus','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['wild_moon','Wilder Mond','+6 % kritische Trefferchance, aber −4 Rüstung.','crit',.06,[{stat:'armor',value:-4}]],
    ]),
  ],
  shadowbinder:[
    ...specialization('shadowbinder','Seele','shadowbinder_hunger',[
      ['soul_scar','Seelennarbe','+10 maximales Leben pro Rang.','maxHp',10],
      ['blood_rite','Blutritus','+0,3 % Lebensraub pro Rang.','lifeSteal',.003],
      ['soul_current','Seelenstrom','+0,3 Mana-Regeneration pro Rang.','manaRegen',.3],
      ['starved_vessel','Ausgehungertes Gefäß','+2,2 % Lebensraub, aber −70 maximales Leben.','lifeSteal',.022,[{stat:'maxHp',value:-70}]],
    ]),
    ...specialization('shadowbinder','Pakt','shadowbinder_whisper',[
      ['grave_whisper','Gruftflüstern','+2 Zauberkraft pro Rang.','spellDamage',2],
      ['soul_reserve','Seelenvorrat','+5 Mana pro Rang.','mana',5],
      ['unholy_rhythm','Unheiliger Takt','+1 % Abklingzeitverkürzung pro Rang.','cooldown',.01],
      ['abyssal_vow','Schwur des Abgrunds','+34 Zauberkraft, aber −5 Rüstung.','spellDamage',34,[{stat:'armor',value:-5}]],
    ]),
    ...specialization('shadowbinder','Grab','shadowbinder_whisper',[
      ['bone_dust','Knochenstaub','+10 maximales Leben pro Rang.','maxHp',10],
      ['ossuary_plate','Beinhauspanzer','+0,8 Rüstung pro Rang.','armor',.8],
      ['ghost_walk','Geisterpfad','+1 % kürzere Ausweichzeit pro Rang.','dodgeCooldown',.01],
      ['sealed_crypt','Versiegelte Gruft','+8 Rüstung, aber −16 Zauberkraft.','armor',8,[{stat:'spellDamage',value:-16}]],
    ]),
  ],
};

for(const characterClass of CLASSES)characterClass.talents.push(...SPECIALIZATIONS[characterClass.id]);

export function getClass(id) { return CLASSES.find(entry => entry.id === id) || CLASSES[0]; }
export const CLASS_TALENTS = CLASSES.flatMap(entry => entry.talents);

/** Shared authoritative learning rules and UI explanation for passive talents. */
export function canLearnTalent(game,id) {
  const skill=CLASS_TALENTS.find(entry=>entry.id===id),p=game?.player||{},ranks=game?.skills||{};
  if(!skill)return {ok:false,reason:'Unbekanntes Talent.'};
  if(skill.classId!==(p.classId||'guardian'))return {ok:false,reason:'Dieses Talent gehört zu einer anderen Klasse.'};
  if(game?.dead||p.hp<=0)return {ok:false,reason:'Erwache zuerst am Glutherd.'};
  if(!Number.isFinite(p.level)||p.level<(skill.minLevel||1))return {ok:false,reason:`Benötigt Stufe ${skill.minLevel||1}.`};
  const rank=Number.isFinite(ranks[id])?Math.max(0,Math.floor(ranks[id])):0;
  if(rank>=skill.maxRank)return {ok:false,reason:'Bereits gemeistert.'};
  const requirements=!skill.requires?[]:Array.isArray(skill.requires)?skill.requires:[skill.requires];
  for(const requirement of requirements) {
    const requiredId=typeof requirement==='string'?requirement:requirement.id,requiredRank=typeof requirement==='string'?skill.requiresRank||1:requirement.rank||1;
    if(!Number.isFinite(ranks[requiredId])||ranks[requiredId]<requiredRank) {
      const name=CLASS_TALENTS.find(entry=>entry.id===requiredId)?.name||requiredId;
      return {ok:false,reason:`Benötigt ${name} auf Rang ${requiredRank}.`};
    }
  }
  if(!Number.isFinite(p.skillPoints)||p.skillPoints<skill.cost)return {ok:false,reason:`Benötigt ${skill.cost} Talentpunkte.`};
  return {ok:true,reason:''};
}

/** Additive modifiers, including the costs of keystones; does not mutate saves. */
export function getTalentModifiers(skills={},classId='guardian') {
  const modifiers={};
  for(const skill of getClass(classId).talents) {
    const stored=skills?.[skill.id],rank=Number.isFinite(stored)?Math.min(skill.maxRank,Math.max(0,Math.floor(stored))):0;
    if(!rank)continue;
    const primary=Array.isArray(skill.effect)?skill.effect:[skill.effect];
    for(const effect of [...primary,...(skill.secondaryEffects||[])])if(effect?.stat&&Number.isFinite(effect.value))modifiers[effect.stat]=(modifiers[effect.stat]||0)+effect.value*rank;
  }
  return modifiers;
}

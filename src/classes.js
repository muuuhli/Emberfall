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
    id: 'paladin', name: 'Paladin', role: 'Heilung / Tank', color: '#f2d78c', weaponId: 'rusty_blade',
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
    id: 'ranger', name: 'Waldläufer', role: 'Fernkampf', color: '#9dcc79', weaponId: 'forest_blade',
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
    id: 'nightblade', name: 'Nachtklinge', role: 'Nahkampf / Burst', color: '#bd95cf', weaponId: 'rusty_blade',
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
    id: 'flamecaller', name: 'Flammenrufer', role: 'Flächenschaden', color: '#ed995c', weaponId: 'arcanist_staff',
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
    id: 'frostweaver', name: 'Frostweber', role: 'Kontrolle / Fernkampf', color: '#91cde5', weaponId: 'arcanist_staff',
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
    id: 'druid', name: 'Druide', role: 'Heilung / Natur', color: '#85c8a0', weaponId: 'arcanist_staff',
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
    id: 'shadowbinder', name: 'Schattenbinder', role: 'Beschwörung / Lebensraub', color: '#a88ddb', weaponId: 'arcanist_staff',
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

export function getClass(id) { return CLASSES.find(entry => entry.id === id) || CLASSES[0]; }
export const CLASS_TALENTS = CLASSES.flatMap(entry => entry.talents);

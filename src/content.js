/**
 * EMBERFALL — Die letzte Glut.
 * Progression data is deliberately separate from mutable save-game state.
 * Quest objective counts are requirements, never running progress.
 */

export const REGIONS = [
  { id: 'daemmerhain', name: 'Dämmerhain', subtitle: 'Wo jede Reise beginnt', color: '#67936d', level: 1, x: 0, y: 900, w: 1500, h: 1500 },
  { id: 'frostgrat', name: 'Frostgrat', subtitle: 'Die Erinnerung unter dem Eis', color: '#9ec6dc', level: 4, x: 0, y: 0, w: 1500, h: 900 },
  { id: 'aschenmoor', name: 'Aschenmoor', subtitle: 'Ein Flüstern aus der Tiefe', color: '#a384b8', level: 6, x: 1500, y: 0, w: 1700, h: 1100 },
  { id: 'glutoede', name: 'Glutöde', subtitle: 'Das Herz einer sterbenden Welt', color: '#d58a52', level: 9, x: 1500, y: 1100, w: 1700, h: 1300 },
];

export const RESOURCES = {
  wood: { name: 'Hainholz', label: 'Hainholz', icon: '🪵', color: '#b88754', description: 'Aus alten Bäumen. Für Waffen, Werkzeuge und warme Nächte.' },
  ore: { name: 'Eisenerz', label: 'Eisenerz', icon: '◆', color: '#a9bcc5', description: 'Rohes Erz, das nur auf einen Schmiedehammer wartet.' },
  herb: { name: 'Mondkraut', label: 'Mondkraut', icon: '✿', color: '#8fc88a', description: 'Ein duftendes Heilkraut aus stillen Lichtungen.' },
  crystal: { name: 'Glutkristall', label: 'Glutkristall', icon: '♦', color: '#cc9de6', description: 'Gespeicherte Magie. In den gefährlichen Regionen besonders häufig.' },
  seed: { name: 'Saatgut', label: 'Saatgut', icon: '•', color: '#d8c58a', description: 'Auf dem Dorfacker pflanzen und später ernten.' },
  wheat: { name: 'Sonnenweizen', label: 'Sonnenweizen', icon: '🌾', color: '#e5c57a', description: 'Frische Ernte für stärkende Mahlzeiten.' },
};

export const SKILLS = [
  { id: 'guardian_vigor', branch: 'Wächter', name: 'Eiserner Wille', description: '+20 maximale Lebenspunkte pro Rang.', maxRank: 3, cost: 1, requires: null, icon: '♥', effect: { stat: 'maxHp', value: 20 } },
  { id: 'guardian_steel', branch: 'Wächter', name: 'Stählerne Haut', description: '+2 Rüstung pro Rang. Jeder Treffer schmerzt weniger.', maxRank: 3, cost: 1, requires: 'guardian_vigor', icon: '⬡', effect: { stat: 'armor', value: 2 } },
  { id: 'guardian_might', branch: 'Wächter', name: 'Brecher', description: '+4 Nahkampfschaden pro Rang.', maxRank: 3, cost: 1, requires: 'guardian_steel', icon: '⚔', effect: { stat: 'damage', value: 4 } },
  { id: 'guardian_siphon', branch: 'Wächter', name: 'Ungebrochen', description: 'Heile 3 % deines Nahkampfschadens pro Rang.', maxRank: 3, cost: 1, requires: 'guardian_might', icon: '✚', effect: { stat: 'lifeSteal', value: 0.03 } },
  { id: 'arcane_well', branch: 'Arkanist', name: 'Sternenquelle', description: '+18 maximales Mana pro Rang.', maxRank: 3, cost: 1, requires: null, icon: '◈', effect: { stat: 'mana', value: 18 } },
  { id: 'arcane_fire', branch: 'Arkanist', name: 'Glutfokus', description: '+6 Schaden für den Glutstoß pro Rang.', maxRank: 3, cost: 1, requires: 'arcane_well', icon: '✦', effect: { stat: 'spellDamage', value: 6 } },
  { id: 'arcane_flow', branch: 'Arkanist', name: 'Ätherfluss', description: '+1,5 Mana-Regeneration pro Sekunde und Rang.', maxRank: 3, cost: 1, requires: 'arcane_fire', icon: '≈', effect: { stat: 'manaRegen', value: 1.5 } },
  { id: 'arcane_mastery', branch: 'Arkanist', name: 'Flammenmeister', description: 'Zauber klingen pro Rang 10 % schneller ab.', maxRank: 3, cost: 1, requires: 'arcane_flow', icon: '☀', effect: { stat: 'cooldown', value: 0.1 } },
  { id: 'ranger_stride', branch: 'Wildläufer', name: 'Leichte Schritte', description: '+12 Bewegungstempo pro Rang.', maxRank: 3, cost: 1, requires: null, icon: '➤', effect: { stat: 'speed', value: 12 } },
  { id: 'ranger_precision', branch: 'Wildläufer', name: 'Adlerauge', description: '+5 % Chance auf kritische Treffer pro Rang.', maxRank: 3, cost: 1, requires: 'ranger_stride', icon: '◎', effect: { stat: 'crit', value: 0.05 } },
  { id: 'ranger_harvest', branch: 'Wildläufer', name: 'Gaben des Hains', description: '+1 zusätzliche Ressource beim Sammeln pro Rang.', maxRank: 3, cost: 1, requires: 'ranger_precision', icon: '❧', effect: { stat: 'gatherYield', value: 1 } },
  { id: 'ranger_escape', branch: 'Wildläufer', name: 'Windtänzer', description: 'Ausweichrollen klingen pro Rang 15 % schneller ab.', maxRank: 3, cost: 1, requires: 'ranger_harvest', icon: '↝', effect: { stat: 'dodgeCooldown', value: 0.15 } },
];

export const ITEMS = {
  rusty_blade: { id: 'rusty_blade', name: 'Verwittertes Schwert', type: 'weapon', rarity: 'common', icon: '⚔', description: 'Eine alte Klinge. Sie hat noch eine Reise vor sich.', stats: { damage: 2 }, price: 12 },
  forest_blade: { id: 'forest_blade', name: 'Hainklinge', type: 'weapon', rarity: 'uncommon', icon: '⚔', description: 'Frisch geschmiedet, mit einem Griff aus dunklem Hainholz.', stats: { damage: 8, crit: 0.02 }, price: 90 },
  frost_blade: { id: 'frost_blade', name: 'Reifschneide', type: 'weapon', rarity: 'rare', icon: '⚔', description: 'Die Kälte des Frostgrats wohnt in dieser scharfen Schneide.', stats: { damage: 15, crit: 0.05 }, price: 210 },
  ember_edge: { id: 'ember_edge', name: 'Morgenbrand', type: 'weapon', rarity: 'epic', icon: '⚔', description: 'Die Glut vergisst niemals, wer sie durch die Dunkelheit trug.', stats: { damage: 25, lifeSteal: 0.04 }, price: 420 },
  arcanist_staff: { id: 'arcanist_staff', name: 'Sternenstab', type: 'weapon', rarity: 'rare', icon: '✦', description: 'Ein Resonanzstab für Reisende, die lieber Feuer sprechen lassen.', stats: { damage: 6, spellDamage: 18, mana: 20 }, price: 220 },
  novice_hammer: { id: 'novice_hammer', name: 'Hammer der ersten Wacht', type: 'weapon', rarity: 'common', icon: '⚔', classIds: ['paladin'], description: 'Ein einfacher Eidhammer für den Beginn deiner Paladinreise.', stats: { damage: 2 }, price: 12 },
  novice_bow: { id: 'novice_bow', name: 'Hainholzbogen', type: 'weapon', rarity: 'uncommon', icon: '➤', classIds: ['ranger'], description: 'Ein verlässlicher Bogen aus Hainholz. Stärke und Präzision verbessern deine Pfeile.', stats: { damage: 8, crit: 0.02 }, price: 90 },
  novice_daggers: { id: 'novice_daggers', name: 'Wandererdolche', type: 'weapon', rarity: 'common', icon: '⚔', classIds: ['nightblade'], description: 'Zwei leichte Klingen für schnelle Schritte durch die Nacht.', stats: { damage: 2 }, price: 12 },
  novice_ember_staff: { id: 'novice_ember_staff', name: 'Glutlehrlingsstab', type: 'weapon', rarity: 'rare', icon: '✦', classIds: ['flamecaller'], description: 'Ein Glutfokus für Feuerzauber. Zauberkraft stärkt Funken und Flammen.', stats: { damage: 6, spellDamage: 18, mana: 20 }, price: 220 },
  novice_rime_scepter: { id: 'novice_rime_scepter', name: 'Reiflehrlingszepter', type: 'weapon', rarity: 'rare', icon: '❄', classIds: ['frostweaver'], description: 'Ein kalter Kristall bündelt die Magie des Frostwebers.', stats: { damage: 6, spellDamage: 18, mana: 20 }, price: 220 },
  novice_living_branch: { id: 'novice_living_branch', name: 'Lebender Hainstab', type: 'weapon', rarity: 'rare', icon: '❧', classIds: ['druid'], description: 'Ein lebender Ast für Dornenmagie und die Heilung deiner Gefährten.', stats: { damage: 6, spellDamage: 18, mana: 20 }, price: 220 },
  novice_soul_focus: { id: 'novice_soul_focus', name: 'Seelenfokus des Wanderers', type: 'weapon', rarity: 'rare', icon: '☾', classIds: ['shadowbinder'], description: 'Ein Fokus für Seelenfunken, dunkle Pakte und Beschwörungen.', stats: { damage: 6, spellDamage: 18, mana: 20 }, price: 220 },
  leather_armor: { id: 'leather_armor', name: 'Wanderwams', type: 'armor', rarity: 'common', icon: '⬡', description: 'Leichtes Leder, das Wind und kleine Bisse abhält.', stats: { armor: 1, maxHp: 8 }, price: 35 },
  sentinel_mail: { id: 'sentinel_mail', name: 'Wächterschuppen', type: 'armor', rarity: 'uncommon', icon: '⬡', description: 'Elins Schmiedekunst schützt das Herz und lässt die Arme frei.', stats: { armor: 4, maxHp: 25 }, price: 130 },
  frost_armor: { id: 'frost_armor', name: 'Mantel des Nordlichts', type: 'armor', rarity: 'rare', icon: '⬡', description: 'Unter den Eisblumen glimmen vergessene Schutzrunen.', stats: { armor: 7, maxHp: 40 }, price: 275 },
  ember_charm: { id: 'ember_charm', name: 'Herz der letzten Glut', type: 'charm', rarity: 'legendary', icon: '◈', description: 'Die Welt atmet weiter. Solange dieses kleine Licht lebt.', stats: { maxHp: 35, spellDamage: 12, manaRegen: 2 }, price: 600 },
  heal_potion: { id: 'heal_potion', name: 'Heiltrank', type: 'consumable', rarity: 'common', icon: '✚', description: 'Stellt sofort 65 Lebenspunkte wieder her. Taste R.', stats: { hpRestore: 65 }, price: 20 },
  mana_potion: { id: 'mana_potion', name: 'Äthertrank', type: 'consumable', rarity: 'uncommon', icon: '◈', description: 'Stellt sofort 50 Mana wieder her.', stats: { manaRestore: 50 }, price: 25 },
  hearty_meal: { id: 'hearty_meal', name: 'Hainbrot', type: 'consumable', rarity: 'uncommon', icon: '♨', description: 'Warmes Brot mit Mondkraut. Stellt 100 Leben und 20 Mana wieder her.', stats: { hpRestore: 100, manaRestore: 20 }, price: 32 },
};

export const RECIPES = [
  { id: 'brew_heal', name: 'Heiltrank brauen', description: 'Mondkraut hilft auch fern vom sicheren Dorf.', ingredients: { herb: 3 }, output: 'heal_potion', amount: 1 },
  { id: 'brew_mana', name: 'Äthertrank brauen', description: 'Ein Splitter Kristall bindet die Magie des Krauts.', ingredients: { herb: 2, crystal: 1 }, output: 'mana_potion', amount: 1 },
  { id: 'bake_bread', name: 'Hainbrot backen', description: 'Aus der eigenen Ernte wird Proviant für die nächste Reise.', ingredients: { wheat: 3, herb: 1 }, output: 'hearty_meal', amount: 1 },
  { id: 'forge_forest', name: 'Hainklinge schmieden', description: 'Die erste echte Waffe aus eigener Hand.', ingredients: { wood: 5, ore: 4 }, output: 'forest_blade', amount: 1 },
  { id: 'forge_mail', name: 'Wächterschuppen schmieden', description: 'Verstärkte Rüstung für die rauen Wege jenseits des Hains.', ingredients: { ore: 8, wood: 3 }, output: 'sentinel_mail', amount: 1 },
  { id: 'forge_ember', name: 'Morgenbrand schmieden', description: 'Eine Klinge, die der Glutöde würdig ist.', ingredients: { ore: 14, crystal: 8, wood: 5 }, output: 'ember_edge', amount: 1 },
];

export const ENEMY_TYPES = {
  wolf: { name: 'Hainwolf', hp: 38, damage: 7, speed: 72, xp: 18, gold: 5, color: '#929384', level: 1, boss: false, range: 30 },
  slime: { name: 'Dornenling', hp: 48, damage: 8, speed: 43, xp: 22, gold: 6, color: '#92b96c', level: 2, boss: false, range: 28 },
  frostwolf: { name: 'Frostwolf', hp: 86, damage: 13, speed: 92, xp: 44, gold: 11, color: '#c6dfec', level: 4, boss: false, range: 31 },
  skeleton: { name: 'Aschenwächter', hp: 108, damage: 16, speed: 56, xp: 58, gold: 14, color: '#d3c7ba', level: 6, boss: false, range: 35 },
  wraith: { name: 'Moorgespenst', hp: 88, damage: 19, speed: 67, xp: 65, gold: 16, color: '#b393d4', level: 7, boss: false, range: 180 },
  imp: { name: 'Glutbrut', hp: 150, damage: 23, speed: 84, xp: 86, gold: 20, color: '#dc865b', level: 9, boss: false, range: 145 },
  thorn_guardian: { name: 'Grimmwurzel', hp: 900, damage: 15, speed: 39, xp: 190, gold: 70, color: '#8aac64', level: 3, boss: true, range: 90 },
  frost_sentinel: { name: 'Der Reifwächter', hp: 2000, damage: 22, speed: 55, xp: 340, gold: 110, color: '#a8def0', level: 6, boss: true, range: 165 },
  emberlord: { name: 'Veyr, der Glutfresser', hp: 4200, damage: 30, speed: 61, xp: 900, gold: 300, color: '#ef9762', level: 11, boss: true, range: 215 },
};

export const NPCS = [
  { id: 'mira', name: 'Mira', role: 'Hüterin des Hains', x: 580, y: 1130, color: '#d1ab76', dialogue: 'Du bist also dem Licht gefolgt. Willkommen in Glutwacht. Früher verband die Glut unsere Länder; jetzt verzehrt jemand ihre Wurzeln. Fang klein an. Ein geretteter Hain ist der Anfang einer geretteten Welt.' },
  { id: 'elin', name: 'Elin', role: 'Schmiedin · Ausrüstung', x: 390, y: 1280, color: '#ce896c', dialogue: 'Eine gute Klinge erzählt nichts von ihrem Preis, sondern von der Hand, die sie führt. Bring Hainholz und Eisenerz. An meiner Werkbank kannst du daraus etwas machen, auf das du dich verlassen kannst.' },
  { id: 'toma', name: 'Toma', role: 'Gärtner · Acker & Saatgut', x: 665, y: 1350, color: '#a9b977', dialogue: 'Helden müssen essen, weißt du? Pflanze Saatgut in unsere Beete, gib der Erde etwas Zeit und ernte den Sonnenweizen. Aus drei Ähren und Mondkraut backen wir Hainbrot. Es reist besser als mein Eintopf.' },
  { id: 'sera', name: 'Sera', role: 'Alchemistin · Tränke', x: 455, y: 1100, color: '#bca1d2', dialogue: 'Mondkraut schließt Wunden. Glutkristall füllt den Äther. Und ein klarer Kopf verrät dir, wann du weglaufen solltest. Sammle zuerst, braue dann — so wird aus einem gefährlichen Weg eine gute Geschichte.' },
  { id: 'rowan', name: 'Rowan', role: 'Späher · Fernlande', x: 740, y: 1220, color: '#87b4c3', dialogue: 'Frostgrat liegt im Nordwesten. Im Nordosten wartet das Aschenmoor, und hinter ihm die Glutöde. Die Wege stehen offen, doch ich würde erst deine Klinge schärfen. Rolle aus roten Angriffszonen, bevor du zurückschlägst.' },
  { id: 'oren', name: 'Oren', role: 'Händler · Vorräte', x: 555, y: 1380, color: '#d8b990', dialogue: 'Gold nützt dir wenig im Staub deiner Taschen. Tränke, Saatgut, ein guter Mantel — such dir etwas für die nächste Etappe. Ich nehme auch doppelte Ausrüstung, falls du Platz schaffen möchtest.' },
];

export const QUESTS = [
  {
    id: 'q_hainwacht', title: 'Ein Hain braucht Hüter', giver: 'mira', prerequisite: null,
    description: 'Die Wölfe kommen bis an Glutwacht. Hilf Mira, die Wege um das Dorf wieder sicher zu machen.',
    objectives: [{ kind: 'kill', target: 'wolf', count: 4, label: 'Hainwölfe besiegen' }],
    reward: { xp: 90, gold: 35, item: 'heal_potion' },
  },
  {
    id: 'q_erste_klinge', title: 'Eine Klinge für morgen', giver: 'elin', prerequisite: 'q_hainwacht',
    description: 'Elin schmiedet dir eine bessere Zukunft. Sammle Holz und Erz für deinen ersten verlässlichen Stahl.',
    objectives: [{ kind: 'gather', target: 'wood', count: 5, label: 'Hainholz sammeln' }, { kind: 'gather', target: 'ore', count: 4, label: 'Eisenerz sammeln' }],
    reward: { xp: 100, gold: 30, item: 'forest_blade' },
  },
  {
    id: 'q_grimmwurzel', title: 'Das kranke Herz des Hains', giver: 'mira', prerequisite: 'q_erste_klinge',
    description: 'Grimmwurzel war einst Beschützer dieser Wälder. Befreie ihn von der Asche, die seine Wurzeln vergiftet.',
    objectives: [{ kind: 'kill', target: 'slime', count: 5, label: 'Dornenlinge besiegen' }, { kind: 'kill', target: 'thorn_guardian', count: 1, label: 'Grimmwurzel erlösen' }],
    reward: { xp: 210, gold: 70, item: 'sentinel_mail' },
  },
  {
    id: 'q_mondkraut', title: 'Die kleine Kunst des Heilens', giver: 'sera', prerequisite: null,
    description: 'Sera zeigt dir, was auf einer langen Reise zählt: ein Vorrat Mondkraut und ein Trank zur rechten Zeit.',
    objectives: [{ kind: 'gather', target: 'herb', count: 6, label: 'Mondkraut sammeln' }, { kind: 'craft', target: 'brew_heal', count: 1, label: 'Einen Heiltrank brauen' }],
    reward: { xp: 90, gold: 30, item: 'mana_potion' },
  },
  {
    id: 'q_acker', title: 'Was wir morgen ernten', giver: 'toma', prerequisite: null,
    description: 'Zwischen Abenteuern darf etwas wachsen. Pflanze Saatgut im Dorfacker und ernte deinen ersten Sonnenweizen.',
    objectives: [{ kind: 'farm', target: 'wheat', count: 3, label: 'Sonnenweizen ernten' }],
    reward: { xp: 90, gold: 45, item: 'hearty_meal' },
  },
  {
    id: 'q_reisebrot', title: 'Ein Stück Zuhause', giver: 'toma', prerequisite: 'q_acker',
    description: 'Bevor du in ferne Länder aufbrichst, backe Hainbrot aus deiner Ernte. Zuhause kann man auch im Rucksack tragen.',
    objectives: [{ kind: 'craft', target: 'bake_bread', count: 1, label: 'Hainbrot backen' }],
    reward: { xp: 120, gold: 50, item: 'hearty_meal' },
  },
  {
    id: 'q_frostweg', title: 'Wo der Wind stillsteht', giver: 'rowan', prerequisite: 'q_grimmwurzel',
    description: 'Folge dem nördlichen Weg ins Frostgrat. Seine Wölfe bewachen die Ruinen einer längst vergessenen Wacht.',
    objectives: [{ kind: 'explore', target: 'frostgrat', count: 1, label: 'Frostgrat entdecken' }, { kind: 'kill', target: 'frostwolf', count: 6, label: 'Frostwölfe besiegen' }],
    reward: { xp: 260, gold: 85, item: 'frost_armor' },
  },
  {
    id: 'q_reifwacht', title: 'Die Erinnerung unter dem Eis', giver: 'rowan', prerequisite: 'q_frostweg',
    description: 'Der Reifwächter hütet das erste Siegel der alten Glut. Brich seine ewige Wacht, damit der Norden wieder atmen kann.',
    objectives: [{ kind: 'kill', target: 'frost_sentinel', count: 1, label: 'Den Reifwächter besiegen' }],
    reward: { xp: 400, gold: 130, item: 'frost_blade' },
  },
  {
    id: 'q_moor', title: 'Stimmen aus der Asche', giver: 'sera', prerequisite: 'q_reifwacht',
    description: 'Im Aschenmoor wandeln die verlorenen Wächter. Die Kristalle dort erzählen Sera, wohin die gestohlene Glut fließt.',
    objectives: [{ kind: 'explore', target: 'aschenmoor', count: 1, label: 'Aschenmoor entdecken' }, { kind: 'gather', target: 'crystal', count: 8, label: 'Glutkristalle sammeln' }],
    reward: { xp: 350, gold: 105, item: 'arcanist_staff' },
  },
  {
    id: 'q_verlorene', title: 'Die Namen der Verlorenen', giver: 'mira', prerequisite: 'q_moor',
    description: 'Mira kennt die alten Wächter beim Namen. Löse ihre Seelen aus der Asche und bringe dem Moor einen Moment Ruhe.',
    objectives: [{ kind: 'kill', target: 'skeleton', count: 8, label: 'Aschenwächter besiegen' }, { kind: 'kill', target: 'wraith', count: 5, label: 'Moorgespenster erlösen' }],
    reward: { xp: 450, gold: 150, item: 'heal_potion' },
  },
  {
    id: 'q_morgenbrand', title: 'Ein Licht gegen die Glutöde', giver: 'elin', prerequisite: 'q_verlorene',
    description: 'Elin hat aus den Kristallen Veyrs Schwäche gelesen. Schmiede Morgenbrand und schlage dir einen Weg durch seine Glutbrut.',
    objectives: [{ kind: 'craft', target: 'forge_ember', count: 1, label: 'Morgenbrand schmieden' }, { kind: 'kill', target: 'imp', count: 8, label: 'Glutbrut besiegen' }],
    reward: { xp: 550, gold: 180, item: 'hearty_meal' },
  },
  {
    id: 'q_letzte_glut', title: 'Die letzte Glut', giver: 'mira', prerequisite: 'q_morgenbrand',
    description: 'Veyr verschlingt die Glut im Herzen der Öde. Trage das Licht, das du gesammelt hast, zu ihm. Unsere Welt muss nicht in Asche enden.',
    objectives: [{ kind: 'kill', target: 'emberlord', count: 1, label: 'Veyr, den Glutfresser, besiegen' }],
    reward: { xp: 1200, gold: 400, item: 'ember_charm' },
  },
];

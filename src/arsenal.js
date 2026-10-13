/** Authored equipment families. Their bonuses use the game's existing combat stats. */
const round = value => Math.round(value * 10000) / 10000;
const levelOf = value => Number.isFinite(value) ? Math.max(1, Math.min(100, Math.floor(value))) : 1;
const weapon = (id, name, classId, minLevel, stats, role, description, lootTraits = []) => ({
  id, name, type: 'weapon', classIds: [classId], minLevel, stats, role, description, lootTraits,
  family: classId, category: ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'].includes(classId) ? 'arcane' : 'martial',
  icon: { ranger: '➤', flamecaller: '✦', frostweaver: '❄', druid: '❧', shadowbinder: '☾' }[classId] || '⚔',
  price: 28 + Math.floor(minLevel * .42),
});

export const ARSENAL_WEAPONS = [
  weapon('grave_halberd', 'Grabhaken-Hellebarde', 'guardian', 5, { damage: 6, speed: 2 }, 'Vorstoß', 'Ein langer Haken aus Grabstahl. Mehr Tempo und Wucht, dafür ohne den Schutz einer Schildwaffe.', ['swift']),
  weapon('cinder_bulwark', 'Bollwerk der Asche', 'guardian', 12, { damage: 5, armor: 1.4, maxHp: 10 }, 'Bastion', 'Die kurze Klinge hält Platz für den schweren Faustschild frei. Tauscht Wucht gegen Rüstung und Leben.', ['armored']),
  weapon('mourning_axe', 'Traueraxt', 'guardian', 22, { damage: 8, crit: .009 }, 'Brecher', 'Ein schmaler Beilkopf spaltet verwundbare Stellen. Schaden und Präzision statt zusätzlicher Rüstung.', ['vicious']),
  weapon('executioner_steel', 'Richtstahl von Grimhaven', 'guardian', 34, { damage: 9, lifeSteal: .005 }, 'Henker', 'Die schwere Schneide nährt den Träger in langen Kämpfen. Verzichtet auf Tempo und Mana.', ['bleeding']),
  weapon('reliquary_flail', 'Reliquienflegel', 'guardian', 47, { damage: 7, spellDamage: 2, cooldown: .01 }, 'Runenwacht', 'In jedem Kettenglied ruht eine gebrochene Schutzrune. Weniger Klingenwucht, dafür Magie und schneller bereite Fähigkeiten.', ['arcane']),
  weapon('raven_pike', 'Rabenlanze', 'guardian', 61, { damage: 9, speed: 4, crit: .007 }, 'Verfolger', 'Schwarze Federn weisen zur nächsten Schwachstelle. Für bewegliche Wächter ohne zusätzliche Heilung.', ['swift']),
  weapon('crypt_maul', 'Kryptenbrecher', 'guardian', 76, { damage: 10, armor: 1.3 }, 'Frontbrecher', 'Ein Hammer aus den Toren einer versiegelten Krypta. Viel Wucht und etwas Schutz, ohne Tempo- oder Manabonus.', ['armored']),
  weapon('last_watch_glaive', 'Gleve der letzten Wacht', 'guardian', 90, { damage: 9, maxHp: 22, dodgeCooldown: .016 }, 'Überlebender', 'Für die letzte Wache vor dem Abgrund. Kürzere Ausweichpausen und mehr Leben kosten etwas rohe Wucht.', ['regenerating']),

  weapon('penitent_mace', 'Keule des Büßers', 'paladin', 5, { damage: 5, spellDamage: 2 }, 'Kreuzzug', 'Eisen und eingelassene Gebetssplitter stärken Schlag und Zauber. Keine zusätzliche Rüstung.', ['arcane']),
  weapon('vigil_hammer', 'Hammer der Totenwache', 'paladin', 12, { damage: 5, armor: 1, mana: 7 }, 'Wache', 'Für lange Wachen an offenen Gräbern. Hält Mana und Schutz bereit statt hoher Schlagkraft.', ['armored']),
  weapon('martyr_brand', 'Brandmal des Märtyrers', 'paladin', 22, { damage: 7, spellDamage: 3, maxHp: 8 }, 'Märtyrer', 'Die Klinge trägt das Siegel eines gefallenen Ordens. Ausgewogene Wucht, Magie und Leben ohne Eile.', ['burning']),
  weapon('confessor_scepter', 'Zepter des Beichtvaters', 'paladin', 34, { damage: 6, spellDamage: 5, manaRegen: .3 }, 'Heiler', 'Ein Eidfokus für heilende Gebete. Gibt rohe Wucht für Zauberkraft und anhaltende Manaversorgung auf.', ['regenerating']),
  weapon('black_chapel_flail', 'Flegel der schwarzen Kapelle', 'paladin', 47, { damage: 8, cooldown: .015, crit: .009 }, 'Urteil', 'Zerbrochene Glocken schlagen im Takt des Urteils. Präzise Schläge und kurze Abklingzeiten ohne Manareserven.', ['vicious']),
  weapon('cenotaph_maul', 'Kenotaphhammer', 'paladin', 61, { damage: 9, armor: 1.3, maxHp: 10 }, 'Grabwächter', 'Der Stein eines namenlosen Grabes wurde zum Hammerkopf. Hält die Front, stärkt aber keine Zauber.', ['armored']),
  weapon('ashen_benediction', 'Segen der ausgebrannten Kathedrale', 'paladin', 76, { damage: 8, spellDamage: 5, manaRegen: .4 }, 'Eidsänger', 'Die Glut eines erloschenen Altars trägt den Eid weiter. Zauberdauer und Wucht statt kritischer Treffer.', ['arcane']),
  weapon('judgement_cleaver', 'Sichel des letzten Gerichts', 'paladin', 90, { damage: 10, spellDamage: 3, lifeSteal: .006 }, 'Vollstrecker', 'Für das letzte Urteil über die gefallenen Heiligen. Viel Schaden und ein wenig Lebensraub ohne zusätzlichen Schutz.', ['bleeding']),

  weapon('yew_funeral_bow', 'Totenbogen aus Eibenholz', 'ranger', 5, { damage: 5, crit: .012 }, 'Präzision', 'Aus dem Eibenbaum eines Friedhofs. Trifft genau, ohne Lauf- oder Manabonus.', ['vicious']),
  weapon('witchhunter_crossbow', 'Armbrust des Hexenjägers', 'ranger', 12, { damage: 7, mana: 5 }, 'Jäger', 'Runenbolzen und eine schwere Sehne. Mehr Wucht und eine kleine Manareserve statt Tempo.', ['arcane']),
  weapon('gallows_longbow', 'Galgenholzbogen', 'ranger', 22, { damage: 6, speed: 4, dodgeCooldown: .018 }, 'Kundschafter', 'Das Galgenholz ist leicht und elastisch. Beweglichkeit und schnelle Rollen kosten rohe Pfeilwucht.', ['swift']),
  weapon('bonewind_arbalest', 'Knochenwind-Arbalest', 'ranger', 34, { damage: 8, crit: .018 }, 'Scharfschütze', 'Eine Winde aus bleichen Rippen spannt die Sehne. Präziser Schaden statt Schutz und Versorgung.', ['vicious']),
  weapon('widow_string', 'Witwensehne', 'ranger', 47, { damage: 7, cooldown: .016, manaRegen: .2 }, 'Fallensteller', 'Seidige Fäden tragen schmale Bolzen. Häufigere Fähigkeiten und Mana statt maximaler Wucht.', ['venom']),
  weapon('iron_thicket_bow', 'Eisendickichtbogen', 'ranger', 61, { damage: 8, armor: 1, maxHp: 8 }, 'Waldwache', 'Dorniges Eisen schützt Hände und Brust. Ein defensiver Bogen ohne Tempo oder kritischen Bonus.', ['armored']),
  weapon('eclipse_recurve', 'Sonnenfinsternisbogen', 'ranger', 76, { damage: 9, crit: .016 }, 'Nachtschütze', 'Die Sehne bleibt selbst im schwarzen Regen straff. Verlässliche Wucht und Präzision ohne Heilung.', ['vicious']),
  weapon('wild_hunt_repeater', 'Repetierer der verfluchten Jagd', 'ranger', 90, { damage: 9, speed: 5, lifeSteal: .006 }, 'Wildjagd', 'Die Jagd endet erst, wenn ihr Träger fällt. Tempo und Lebensraub statt kritischer Treffer.', ['bleeding', 'swift']),

  weapon('gravedigger_shivs', 'Schächerklingen', 'nightblade', 5, { damage: 5, crit: .015 }, 'Attentäter', 'Schmale Klingen aus gestohlenen Grabnägeln. Präzision ohne Schutz oder Mana.', ['vicious']),
  weapon('leech_kukris', 'Blutegel-Kukris', 'nightblade', 12, { damage: 6, lifeSteal: .009 }, 'Blutdurst', 'Dunkle Rinnen leiten gestohlenes Leben zum Griff. Für Ausdauer statt kritischer Treffer.', ['draining']),
  weapon('raven_feather_knives', 'Rabenfederklingen', 'nightblade', 22, { damage: 5, speed: 5, dodgeCooldown: .02 }, 'Schattenläufer', 'Leichte Klingen, deren Griffe kaum Gewicht haben. Schnelle Flucht statt hoher Schlagkraft.', ['swift']),
  weapon('hush_rapiers', 'Rapiere des Schweigens', 'nightblade', 34, { damage: 7, cooldown: .018, mana: 6 }, 'Duellant', 'Zwei leise Nadeln gegen schwere Gegner. Häufigere Fähigkeiten statt Rüstung oder Lebensraub.', ['arcane']),
  weapon('serpent_teeth', 'Zähne der Grabotter', 'nightblade', 47, { damage: 8, crit: .018 }, 'Vollstrecker', 'Gezackte Spitzen treffen die Lücken im Panzer. Schaden und Präzision ohne defensive Reserve.', ['venom']),
  weapon('hex_ritual_blades', 'Hexendolche des siebten Siegels', 'nightblade', 61, { damage: 7, spellDamage: 2, manaRegen: .25 }, 'Hexenklinge', 'Ein verbotener Schwur verbindet beide Griffe. Weniger Klingenwucht, dafür Magie und Manaversorgung.', ['arcane']),
  weapon('iron_widow_sabres', 'Säbel der eisernen Witwe', 'nightblade', 76, { damage: 9, armor: .8, maxHp: 12 }, 'Straßenkämpfer', 'Breite Parierstangen halten Gegenhiebe ab. Ein wenig Schutz statt Eile und kritischem Bonus.', ['armored']),
  weapon('midnight_requiem', 'Requiem der Mitternacht', 'nightblade', 90, { damage: 8, crit: .02, lifeSteal: .008 }, 'Seelenräuber', 'Klingen für den letzten lautlosen Schnitt. Präzision und Lebensraub kosten etwas reine Wucht.', ['bleeding', 'draining']),

  weapon('cinder_crozier', 'Aschenkrummstab', 'flamecaller', 5, { spellDamage: 6, mana: 6 }, 'Glutrufer', 'Ein verkohlter Hirtenstab mit einer gefangenen Glut. Größere Manareserven ohne Schutz.', ['burning']),
  weapon('coal_heart_wand', 'Kohlenherzstab', 'flamecaller', 12, { spellDamage: 5, armor: .8, maxHp: 8 }, 'Glutwache', 'Kohle unter einem Eisenmantel hält die Glut am Leben. Weniger Zauberwucht für Schutz und Leben.', ['armored']),
  weapon('pyre_censer', 'Räucherpfanne des Scheiterhaufens', 'flamecaller', 22, { spellDamage: 7, manaRegen: .3 }, 'Feueratem', 'Die Asche namenloser Opfer nährt den Funken. Manaversorgung statt kritischer Treffer.', ['regenerating']),
  weapon('hellglass_rod', 'Höllenglasstab', 'flamecaller', 34, { spellDamage: 8, crit: .015 }, 'Glasflamme', 'Ein dünner Stab aus schwarzem Glas. Verstärkt präzise Zauber ohne Schutz oder Mana.', ['vicious']),
  weapon('bell_of_embers', 'Glocke der schweigenden Glut', 'flamecaller', 47, { spellDamage: 6, cooldown: .02, mana: 8 }, 'Funkenkette', 'Ihr lautloser Schlag bündelt die nächste Flamme. Kürzere Pausen statt maximaler Zauberkraft.', ['arcane']),
  weapon('furnace_spine', 'Ofenrücken', 'flamecaller', 61, { spellDamage: 9, maxHp: 10 }, 'Brennender Wille', 'Ein Stab aus dem Rückgrat eines geschmolzenen Golems. Wucht und Leben ohne Manaversorgung.', ['burning']),
  weapon('ash_tongue_grimoire', 'Grimoire der Aschenzunge', 'flamecaller', 76, { spellDamage: 8, manaRegen: .45, cooldown: .012 }, 'Beschwörungsfeuer', 'Jede verbrannte Seite flüstert eine neue Flamme. Ausdauer und Rhythmus statt kritischer Treffer.', ['arcane']),
  weapon('sunless_pyrestaff', 'Sonnenloser Scheiterstab', 'flamecaller', 90, { spellDamage: 10, crit: .012, lifeSteal: .005 }, 'Feuerernte', 'Die Glut eines Sterns, der niemals aufging. Präzise Wucht und Lebensraub ohne zusätzlichen Schutz.', ['burning', 'draining']),

  weapon('grave_rime_rod', 'Grabreifstab', 'frostweaver', 5, { spellDamage: 5, armor: .7 }, 'Frostwacht', 'Eis bewahrt die Inschrift eines vergessenen Grabes. Kleiner Schutzbonus statt Manareserven.', ['frost']),
  weapon('mourning_ice_scepter', 'Zepter des Trauereises', 'frostweaver', 12, { spellDamage: 6, mana: 8 }, 'Frostquelle', 'Das Eis hält kalten Äther fest. Ein Vorratsfokus ohne Tempo- oder kritischen Bonus.', ['frost']),
  weapon('winter_bell', 'Winterglocke', 'frostweaver', 22, { spellDamage: 5, cooldown: .018, manaRegen: .25 }, 'Schneesturm', 'Ihr tiefer Ton fällt wie Schnee. Häufigere Frostzauber kosten direkte Zauberkraft.', ['arcane']),
  weapon('black_ice_tome', 'Foliant des schwarzen Eises', 'frostweaver', 34, { spellDamage: 8, crit: .013 }, 'Eissplitter', 'Die Seiten zerbrechen beinahe unter den Fingern. Präzision und Wucht ohne Schutz.', ['vicious']),
  weapon('glacier_bone_staff', 'Gletscherknochenstab', 'frostweaver', 47, { spellDamage: 7, armor: 1.2, maxHp: 10 }, 'Eiswall', 'Ein im Gletscher konservierter Knochen hält die Kälte fest. Defensive Reserven statt Eile.', ['armored']),
  weapon('pale_tide_scepter', 'Zepter der bleichen Flut', 'frostweaver', 61, { spellDamage: 8, manaRegen: .4, mana: 10 }, 'Tiefenfrost', 'Äther fließt wie dunkles Wasser unter dem Eis. Ein Ausdauerfokus ohne kritischen Bonus.', ['regenerating']),
  weapon('hoarfrost_needle', 'Nadel des ewigen Raureifs', 'frostweaver', 76, { spellDamage: 9, speed: 4, dodgeCooldown: .012 }, 'Frostwanderer', 'Leicht genug, um im Sturm getragen zu werden. Mobilität statt zusätzlicher Rüstung.', ['swift']),
  weapon('last_winter_crown', 'Krone des letzten Winters', 'frostweaver', 90, { spellDamage: 9, armor: 1.2, cooldown: .014 }, 'Winterherrschaft', 'Der zerbrochene Kronreif lenkt den Winter. Schutz und Rhythmus kosten etwas Zauberwucht.', ['frost', 'armored']),

  weapon('gallows_root', 'Galgenwurzel', 'druid', 5, { spellDamage: 5, manaRegen: .3 }, 'Wurzelhüter', 'Unter dem Galgen lebte der Wald weiter. Manaversorgung statt kritischer Treffer.', ['regenerating']),
  weapon('bone_oak_crook', 'Knocheneichenstab', 'druid', 12, { spellDamage: 5, maxHp: 12, armor: .6 }, 'Borkenwacht', 'Blasse Rinde schützt den lebenden Kern. Weniger Zauberwucht für Leben und Rüstung.', ['armored']),
  weapon('plague_bloom_wand', 'Pestblütenzweig', 'druid', 22, { spellDamage: 7, crit: .009 }, 'Dornenernte', 'Dunkle Blüten wachsen aus den Wunden des Holzes. Präzision statt Manaversorgung.', ['venom']),
  weapon('night_moss_focus', 'Nachtmoosfokus', 'druid', 34, { spellDamage: 6, mana: 12, cooldown: .015 }, 'Hainritual', 'Moos verbirgt die Runen eines alten Heilkreises. Mana und Rhythmus statt maximaler Zauberkraft.', ['arcane']),
  weapon('wolfmoon_branch', 'Wolfsmondast', 'druid', 47, { spellDamage: 8, speed: 4 }, 'Wilder Pfad', 'Ein Ast, der im Licht eines blutigen Mondes wuchs. Bewegliche Wucht ohne Schutz.', ['swift']),
  weapon('hollow_heart_staff', 'Stab des hohlen Herzens', 'druid', 61, { spellDamage: 7, maxHp: 18, manaRegen: .4 }, 'Lebenshüter', 'Im leeren Stamm schlägt noch ein Herz. Leben und Zauberausdauer kosten offensive Kraft.', ['regenerating']),
  weapon('thorn_covenant', 'Dornenpakt', 'druid', 76, { spellDamage: 9, lifeSteal: .006 }, 'Blutwurzel', 'Das Holz erinnert sich an jeden Tropfen Blut. Schaden und kleine Selbstheilung statt Schutz.', ['bleeding']),
  weapon('withered_worldroot', 'Verdorrte Weltenwurzel', 'druid', 90, { spellDamage: 9, manaRegen: .5, gatherYield: .3 }, 'Letzter Hain', 'Auch die tote Weltenwurzel trägt einen Rest Leben. Ausdauer und Sammelertrag statt Präzision.', ['regenerating']),

  weapon('funeral_lantern', 'Totenlaterne', 'shadowbinder', 5, { spellDamage: 5, mana: 6 }, 'Seelenlicht', 'Ein gefangenes Irrlicht weist in die Dunkelheit. Manareserve statt Schutz oder Lebensraub.', ['arcane']),
  weapon('leech_bone_focus', 'Blutegelknochen', 'shadowbinder', 12, { spellDamage: 5, lifeSteal: .009 }, 'Seelendurst', 'In der porösen Oberfläche warten fremde Stimmen. Weniger Zauberwucht für Lebensraub.', ['draining']),
  weapon('crypt_candle', 'Kryptenkerze', 'shadowbinder', 22, { spellDamage: 6, manaRegen: .35 }, 'Grabruf', 'Sie verbrennt die Namen der Toten. Ausdauer statt kritischer Treffer.', ['summoner']),
  weapon('obsidian_soulmirror', 'Obsidianspiegel der Seelen', 'shadowbinder', 34, { spellDamage: 8, crit: .012 }, 'Spiegelpakt', 'Im Glas erscheinen die Lücken zwischen den Welten. Präzise Zauber ohne Schutz.', ['vicious']),
  weapon('chains_of_confession', 'Ketten der Verdammten', 'shadowbinder', 47, { spellDamage: 7, armor: 1, maxHp: 10 }, 'Paktwache', 'Die Ketten binden Schutzgeister an den Träger. Leben und Rüstung statt Manaversorgung.', ['armored']),
  weapon('hollow_covenant_tome', 'Foliant des leeren Paktes', 'shadowbinder', 61, { spellDamage: 7, cooldown: .018, mana: 12 }, 'Beschwörer', 'Leere Seiten antworten auf fremde Namen. Häufigere Beschwörungen statt maximaler Zauberkraft.', ['summoner', 'arcane']),
  weapon('reaper_hourglass', 'Sanduhr des Seelenschnitters', 'shadowbinder', 76, { spellDamage: 9, lifeSteal: .009 }, 'Seelenernte', 'Ihr schwarzer Sand zählt die letzten Herzschläge. Wucht und Lebensraub ohne Tempo.', ['draining']),
  weapon('abyssal_oracle', 'Orakel des versiegelten Abgrunds', 'shadowbinder', 90, { spellDamage: 9, manaRegen: .45, crit: .01 }, 'Abgrundrufer', 'Ein verhülltes Auge lauscht jenseits der Welt. Ausdauer und Präzision statt defensiver Werte.', ['arcane']),
];

const armorNames = [
  ['Grabstahlharnisch', 'Rabenlederwams', 'Totenleinenrobe'],
  ['Bußkettenpanzer', 'Hexenjägermantel', 'Gewand der schwarzen Kerzen'],
  ['Sargplattenharnisch', 'Witwenleder', 'Reifbestattungsrobe'],
  ['Harnisch der schwarzen Kapelle', 'Mantel der Galgenwache', 'Robe des verschwiegenen Eides'],
  ['Kryptentorpanzer', 'Nachtotterwams', 'Kleid der Aschenliturgie'],
  ['Eisenreliquienharnisch', 'Rabenpfadmantel', 'Totentuch des Sternenfalls'],
  ['Kathedralenpanzer', 'Wams der blinden Jagd', 'Robe des verbotenen Namens'],
  ['Panzer der letzten Prozession', 'Mantel der Weltendämmerung', 'Gewand des ewigen Schweigens'],
];
const charmNames = [
  ['Grabnagelring', 'Kerzenrest-Amulett', 'Siegel der Totenwache'],
  ['Henkerknoten', 'Hexenauge', 'Bußrosenkranz'],
  ['Rabenkrallenring', 'Reiftränenanhänger', 'Knochenwacht-Talisman'],
  ['Sichelmondring', 'Aschenliturgie-Amulett', 'Witwenmedaillon'],
  ['Schächerkönigsring', 'Schwarzkapellenfokus', 'Reliquie des namenlosen Märtyrers'],
  ['Ring der verfluchten Jagd', 'Scherbe des Seelenspiegels', 'Eisenherz-Medaillon'],
  ['Henkerstern', 'Siegel des leeren Himmels', 'Rosenkranz der letzten Wache'],
  ['Ring des letzten Urteils', 'Orakelträne', 'Herz der versiegelten Krypta'],
];
const gearLevels = [6, 15, 25, 38, 50, 64, 78, 92];
const armorCategories = ['heavy', 'light', 'ritual'];
const charmCategories = ['martial', 'arcane', 'ward'];

export const ARSENAL_ARMOR = armorNames.flatMap((names, tier) => names.map((name, index) => {
  const category = armorCategories[index];
  const stats = index === 0 ? { maxHp: 18 + tier * 1.3, armor: round(2.4 + tier * .12) }
    : index === 1 ? { maxHp: 11 + tier, armor: round(1.1 + tier * .07), speed: 5, dodgeCooldown: .018 }
      : { maxHp: 10 + tier, armor: round(.9 + tier * .07), mana: 15 + tier, manaRegen: .28 };
  return { id: `grave_${category}_${tier + 1}`, name, type: 'armor', category, family: category, role: ['Frontschutz', 'Beweglichkeit', 'Zauberausdauer'][index],
    minLevel: gearLevels[tier], stats, price: 30 + tier * 5, icon: '⬡', lootTraits: [['armored', 'vicious'], ['swift', 'venom'], ['arcane', 'summoner']][index],
    description: ['Schwere Grabstahlrüstung: viel Leben und Rüstung, ohne Tempo- oder Manabonus.', 'Leichtes dunkles Leder: Tempo und kürzere Ausweichpausen, dafür weniger Leben und Rüstung.', 'Ein Ritualgewand: Mana und Regeneration, dafür weniger Rüstung als ein schwerer Harnisch.'][index] };
}));

export const ARSENAL_CHARMS = charmNames.flatMap((names, tier) => names.map((name, index) => {
  const category = charmCategories[index];
  const stats = index === 0 ? { damage: round(2.5 + tier * .28), crit: round(.008 + tier * .0008) }
    : index === 1 ? { spellDamage: round(3.5 + tier * .3), mana: 8 + tier, manaRegen: .25 }
      : { maxHp: 14 + tier * 2, armor: round(1 + tier * .07), lifeSteal: .003 };
  return { id: `grave_${category}_charm_${tier + 1}`, name, type: 'charm', category, family: category, role: ['Klingenpräzision', 'Arkaner Vorrat', 'Überlebensschutz'][index],
    minLevel: gearLevels[tier], stats, price: 26 + tier * 5, icon: '◈', lootTraits: [['bleeding', 'vicious'], ['arcane', 'draining'], ['armored', 'regenerating']][index],
    description: ['Ein Relikt für Waffenschaden und präzise Treffer. Gibt weder Schutz noch Mana.', 'Ein Relikt für Zauberkraft und anhaltende Manaversorgung. Verzichtet auf Waffenschaden und Rüstung.', 'Ein Relikt für Leben, Rüstung und geringen Lebensraub. Tauscht offensiven Schaden gegen Ausdauer.'][index] };
}));

export const ARSENAL_BASES = [...ARSENAL_WEAPONS, ...ARSENAL_ARMOR, ...ARSENAL_CHARMS];

/** Shared version-two base budget: fixed shop pieces and rolled loot agree. */
export function gearBaseStats(itemBase, level, multiplier = 1) {
  const delta = levelOf(level) - 1, stats = {}, seed = { ...itemBase.stats };
  if (itemBase.type === 'armor') { seed.maxHp ??= 10; seed.armor ??= 1; }
  const offenseSlot = itemBase.type === 'weapon' ? 1 : itemBase.type === 'armor' ? .18 : .25;
  const healthSlot = itemBase.type === 'armor' ? 1 : itemBase.type === 'weapon' ? .22 : .30;
  const armorSlot = itemBase.type === 'armor' ? 1 : itemBase.type === 'weapon' ? .14 : .28;
  const manaSlot = itemBase.type === 'armor' ? .7 : itemBase.type === 'weapon' ? .5 : .35;
  for (const [key, value] of Object.entries(seed)) {
    let scaled = value;
    if (key === 'damage') scaled = value * (1 + delta * .045) + delta * 1.25 * offenseSlot;
    else if (key === 'spellDamage') scaled = value * (1 + delta * .045) + delta * 1.9 * offenseSlot + (itemBase.type === 'weapon' ? 20 : 0);
    else if (key === 'maxHp') scaled = value * (1 + delta * .045) + delta * 3.1 * healthSlot;
    else if (key === 'armor') scaled = value * (1 + delta * .035) + delta * .45 * armorSlot;
    else if (key === 'mana') scaled = value * (1 + delta * .022) + delta * .85 * manaSlot;
    else if (key === 'manaRegen') scaled = value * (1 + delta * .012) + delta * .006 * (itemBase.type === 'charm' ? .5 : 1);
    else if (key === 'speed') scaled = value * (1 + delta * .002);
    stats[key] = round(scaled * multiplier);
  }
  return stats;
}

const supplies = [
  ['grave_red_vial', 'Grabrot-Essenz', 10, { hpRestore: 155 }, 34, 'health'],
  ['bloodroot_draught', 'Blutwurzeltrank', 30, { hpRestore: 350 }, 58, 'health'],
  ['martyr_lifeblood', 'Lebensblut des Märtyrers', 65, { hpRestore: 800 }, 92, 'health'],
  ['pale_ether_vial', 'Bleicher Äther', 10, { manaRestore: 90 }, 32, 'mana'],
  ['blackwell_tonic', 'Schwarzquellentonikum', 30, { manaRestore: 190 }, 54, 'mana'],
  ['night_oracle_tears', 'Tränen des Nachtorakels', 65, { manaRestore: 330 }, 84, 'mana'],
  ['penitent_elixir', 'Elixier des Büßers', 15, { hpRestore: 130, manaRestore: 60 }, 44, 'hybrid'],
  ['reliquary_elixir', 'Reliquienelixier', 40, { hpRestore: 300, manaRestore: 140 }, 74, 'hybrid'],
  ['abyssal_recovery', 'Trost des Abgrunds', 80, { hpRestore: 600, manaRestore: 260 }, 118, 'hybrid'],
  ['mourning_stew', 'Eintopf der Totenwache', 10, { hpRestore: 200, manaRestore: 30 }, 38, 'food'],
  ['blackgrain_ration', 'Schwarzkornproviant', 35, { hpRestore: 450, manaRestore: 85 }, 68, 'food'],
  ['last_supper_ration', 'Proviant der letzten Nacht', 70, { hpRestore: 900, manaRestore: 160 }, 105, 'food'],
];

export const ARSENAL_CONSUMABLES = supplies.map(([id, name, minLevel, stats, price, family]) => ({
  id, name, type: 'consumable', rarity: minLevel >= 65 ? 'rare' : 'uncommon', icon: family === 'food' ? '♨' : family === 'health' ? '✚' : '◈',
  level: minLevel, minLevel, stats, price, family, category: family === 'food' ? 'food' : 'potion',
  cooldown: family === 'food' ? 10 : 3, cooldownGroup: family === 'food' ? 'food' : 'potion', outOfCombat: family === 'food',
  description: `${stats.hpRestore ? `${stats.hpRestore} Leben` : ''}${stats.hpRestore && stats.manaRestore ? ' und ' : ''}${stats.manaRestore ? `${stats.manaRestore} Mana` : ''} wiederherstellen. ${family === 'food' ? 'Außerhalb des Kampfes essen; 10 Sekunden Pause zwischen Mahlzeiten.' : 'Teilt die 3 Sekunden Trankpause mit allen Tränken.'}`,
}));

const fixedGear = ARSENAL_BASES.map(itemBase => {
  const rarity = itemBase.minLevel >= 61 ? 'rare' : 'uncommon', multiplier = rarity === 'rare' ? 1.35 : 1.15;
  return { ...itemBase, level: itemBase.minLevel, rarity, stats: gearBaseStats(itemBase, itemBase.minLevel, multiplier),
    price: Math.round(itemBase.price * (1 + itemBase.minLevel * .06) * multiplier * 1.3),
    description: `${itemBase.description} Handwerkliche Ausführung mit festen Werten; Beutefunde können zusätzliche Affixe und Sockel besitzen.` };
});
export const EXTRA_ITEMS = Object.fromEntries([...fixedGear, ...ARSENAL_CONSUMABLES].map(item => [item.id, item]));

const forgeRecipe = item => {
  const level = item.minLevel, magic = item.category === 'arcane' || item.category === 'ritual';
  const ingredients = { ore: Math.ceil(4 + level * .2), wood: Math.ceil(3 + level * .11) };
  if (magic || level >= 22) ingredients.crystal = Math.ceil(1 + level * .1);
  if (level >= 34) ingredients.dust = Math.ceil(3 + level * .12);
  return { id: `forge_${item.id}`, name: `${item.name} fertigen`, minLevel: level, classIds: item.classIds, category: item.category,
    ingredients, output: item.id, amount: 1, description: `${item.role} · Charakterstufe ${level}. ${item.description}` };
};
const brewRecipe = item => ({
  id: `prepare_${item.id}`, name: `${item.name} ${item.family === 'food' ? 'zubereiten' : 'brauen'}`, minLevel: item.minLevel, category: item.category,
  ingredients: item.family === 'food' ? { wheat: Math.ceil(2 + item.minLevel / 18), herb: Math.ceil(1 + item.minLevel / 30) }
    : item.family === 'health' ? { herb: Math.ceil(3 + item.minLevel / 15), ...(item.minLevel >= 30 ? { crystal: Math.ceil(item.minLevel / 25) } : {}) }
      : { herb: Math.ceil(2 + item.minLevel / 20), crystal: Math.ceil(1 + item.minLevel / 25) },
  output: item.id, amount: 1, description: `Charakterstufe ${item.minLevel}. ${item.description}`,
});
export const EXTRA_RECIPES = [
  ...ARSENAL_WEAPONS.filter((_, index) => index % 8 % 2 === 1).map(forgeRecipe),
  ...ARSENAL_ARMOR.filter(item => [15, 38, 64, 92].includes(item.minLevel)).map(forgeRecipe),
  ...ARSENAL_CHARMS.filter(item => [15, 38, 64, 92].includes(item.minLevel)).map(forgeRecipe),
  ...ARSENAL_CONSUMABLES.map(brewRecipe),
];

const newest = (items, count, preference = []) => {
  const priority = item => preference.includes(item.category) ? preference.indexOf(item.category) : preference.length;
  return items.sort((a, b) => b.minLevel - a.minLevel || priority(a) - priority(b) || a.id.localeCompare(b.id)).slice(0, count);
};

/** Small merchant assortments follow character progression and class restrictions. */
export function getArsenalShopStock({ level = 1, classId = 'guardian', merchant = 'oren' } = {}) {
  const current = levelOf(level);
  const accessible = Object.values(EXTRA_ITEMS).filter(item => item.minLevel <= current && (!item.classIds || item.classIds.includes(classId)));
  const gearCount = merchant === 'elin' ? 2 : 1;
  const magic = ['flamecaller', 'frostweaver', 'druid', 'shadowbinder'].includes(classId);
  const armorPreference = ['guardian', 'paladin'].includes(classId) ? ['heavy', 'light', 'ritual'] : magic ? ['ritual', 'light', 'heavy'] : ['light', 'heavy', 'ritual'];
  const charmPreference = magic ? ['arcane', 'ward', 'martial'] : ['martial', 'ward', 'arcane'];
  const gear = merchant === 'sera' ? [] : ['weapon', 'armor', 'charm'].flatMap(type => newest(accessible.filter(item => item.type === type), gearCount,
    type === 'armor' ? armorPreference : type === 'charm' ? charmPreference : []));
  const consumables = merchant === 'elin' ? [] : ['health', 'mana', 'hybrid', ...(merchant === 'sera' ? ['food'] : [])]
    .flatMap(family => newest(accessible.filter(item => item.type === 'consumable' && item.family === family), 1));
  return [...gear, ...consumables];
}

/** Supplies use encounter level rather than a finite list of enemy IDs. */
export function getSupplyDrop({ level = 1, boss = false, traits = [], rng = Math.random } = {}) {
  const roll = () => {
    const value = rng();
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new TypeError('Supply RNG must return a finite number between 0 and 1.');
    return Math.min(value, 1 - Number.EPSILON);
  };
  if (roll() >= (boss ? .7 : .12)) return null;
  const current = levelOf(level), tags = new Set(Array.isArray(traits) ? traits : []);
  const choice = roll();
  const family = choice < (tags.has('arcane') || tags.has('draining') ? .38 : .22) ? 'mana' : choice > .8 ? 'hybrid' : 'health';
  const item = newest(ARSENAL_CONSUMABLES.filter(item => item.family === family && item.minLevel <= current), 1)[0];
  return item?.id || (family === 'mana' ? 'mana_potion' : 'heal_potion');
}

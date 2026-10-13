// The frontier is authored as connected regions; seeded dressing never changes the routes.
// A region owns its generation stream, so loading it later yields the same encounters.
import { DUNGEONS } from './dungeons.js';
import { REGION_ENEMY_POOLS, createBestiaryEnemy } from './bestiary.js';

export const FRONTIER_BOUNDS = Object.freeze({ width: 19200, height: 14400 });

export const EXPANSION_REGIONS = [
  { id: 'sonnensteppe', name: 'Sonnensteppe', subtitle: 'Die Felder hinter der letzten Wacht', color: '#c6ac63', ground: '#626344', level: 12, maxLevel: 20, x: 3200, y: 0, w: 3200, h: 2400, tree: 'oak', enemy: 'steppe_raider' },
  { id: 'jadeauen', name: 'Jadeauen', subtitle: 'Wurzeln unter dem grünen Strom', color: '#72be8b', ground: '#345f4c', level: 20, maxLevel: 28, x: 6400, y: 0, w: 3200, h: 2400, tree: 'oak', enemy: 'jade_stalker' },
  { id: 'sturmkueste', name: 'Sturmküste', subtitle: 'Wo Leuchttürme gegen die See stehen', color: '#8bb8c7', ground: '#4a6667', level: 28, maxLevel: 36, x: 9600, y: 0, w: 3200, h: 2400, tree: 'pine', enemy: 'tide_reaver' },
  { id: 'dornwildnis', name: 'Dornwildnis', subtitle: 'Kein Pfad bleibt ohne Narbe', color: '#8cad70', ground: '#414b34', level: 36, maxLevel: 44, x: 12800, y: 0, w: 3200, h: 2400, tree: 'oak', enemy: 'thorn_hunter' },
  { id: 'obsidianpass', name: 'Obsidianpass', subtitle: 'Schwarzes Glas und gebrochene Banner', color: '#b59085', ground: '#4e3e40', level: 44, maxLevel: 52, x: 16000, y: 0, w: 3200, h: 2400, tree: 'burnt', enemy: 'obsidian_knight' },
  { id: 'mondbruch', name: 'Mondbruch', subtitle: 'Die Uhr, die den Himmel zerriss', color: '#bba4d2', ground: '#514c68', level: 52, maxLevel: 60, x: 12800, y: 2400, w: 6400, h: 4000, tree: 'dead', enemy: 'moon_construct' },
  { id: 'permafrost', name: 'Permafrost', subtitle: 'Das Lied der schlafenden Gletscher', color: '#b0d4e7', ground: '#667d8b', level: 60, maxLevel: 68, x: 6400, y: 2400, w: 6400, h: 4000, tree: 'pine', enemy: 'frost_colossus' },
  { id: 'sandsenke', name: 'Sandsenke', subtitle: 'Karawanen am Ende des Windes', color: '#d3b477', ground: '#887452', level: 68, maxLevel: 76, x: 0, y: 2400, w: 6400, h: 4000, tree: 'dead', enemy: 'sand_revenant' },
  { id: 'traumsenke', name: 'Traumsenke', subtitle: 'Wessen Traum trägt deine Schritte?', color: '#87b7b1', ground: '#3b5d60', level: 76, maxLevel: 84, x: 0, y: 6400, w: 6400, h: 4000, tree: 'oak', enemy: 'void_watcher' },
  { id: 'blutmark', name: 'Blutmark', subtitle: 'Die Banner des letzten Krieges', color: '#d08882', ground: '#634247', level: 84, maxLevel: 92, x: 6400, y: 6400, w: 6400, h: 4000, tree: 'burnt', enemy: 'void_watcher' },
  { id: 'sternensund', name: 'Sternensund', subtitle: 'Ein Hafen für gefallene Sterne', color: '#a6bfe7', ground: '#404d70', level: 92, maxLevel: 100, x: 12800, y: 6400, w: 6400, h: 4000, tree: 'pine', enemy: 'void_watcher' },
  { id: 'nexusriss', name: 'Nexusriss', subtitle: 'Jenseits der Grenze wartet die Quelle', color: '#de9be2', ground: '#573c63', level: 100, maxLevel: 100, x: 0, y: 10400, w: 19200, h: 4000, tree: 'dead', enemy: 'void_watcher' },
];

const foes = [
  ['steppe_raider', 'Steppenräuber', 15, '#baa374', 86, 35],
  ['jade_stalker', 'Jadepirscher', 25, '#6bb687', 104, 36],
  ['tide_reaver', 'Gezeitenbrecher', 35, '#88bfc8', 75, 180],
  ['thorn_hunter', 'Dornenjäger', 45, '#9abb73', 97, 38],
  ['obsidian_knight', 'Obsidianritter', 55, '#b198a0', 57, 43],
  ['moon_construct', 'Mondkonstrukt', 65, '#c0a9de', 66, 175],
  ['frost_colossus', 'Gletscherkoloss', 75, '#b9e2ed', 48, 65],
  ['sand_revenant', 'Dünenwiedergänger', 85, '#d4b87c', 82, 155],
  ['void_watcher', 'Risswächter', 95, '#c891d6', 93, 180],
];
export const EXPANSION_ENEMIES = Object.fromEntries(foes.map(([id, name, level, color, speed, range]) => [id, {
  name, level, color, speed, range, boss: false,
  hp: Math.round(90 + level * 13 + level * level * .13), damage: 14 + Math.round(level * 1.8),
  xp: Math.round(35 + level * level * 2.3), gold: 15 + level * 3,
  dropTable: level >= 75 ? 'endgame' : level >= 40 ? 'frontier' : 'adventure',
}]));

const guides = [
  ['lys', 'Lys', 'Wachmeisterin der Kornwacht', 'Die Asche hat unsere Ernte verschont, aber nicht unsere Straßen. Sichere zuerst den Kornweg. Im Wurzelgewölbe liegt der Eid, der diese Steppe einst nährte.'],
  ['nami', 'Nami', 'Wasserhüterin von Jadesteg', 'Eine Wurzel trinkt Gift, alle Bäume werden krank. Die Kristalle verraten, woher es fließt. Hilf uns heilen, bevor du urteilst.'],
  ['ivar', 'Ivar', 'Leuchtturmmeister', 'Der Nebel kennt keinen Freund. Wir müssen die alten Lichtzeichen entziffern und die Glocke im Salzarchiv zum Schweigen bringen.'],
  ['branna', 'Branna', 'Gärtnerin der Dornwacht', 'Hier kämpft der Wald zurück. Das Kloster der Gärtner kennt die Ordnung von Sonne, Wasser und Erde. Drehe sein Licht, statt jede Wurzel abzuschlagen.'],
  ['borin', 'Borin', 'Kommandant am Glaswall', 'Wir halten diesen Pass seit neun Wintern. Heute brauchen wir Vorräte, morgen Mut. Die Ritter hinter dem Wall tragen unsere alten Banner.'],
  ['aelia', 'Aelia', 'Archivarin der Mondwarte', 'Die Uhr zählt keine Stunden mehr, sie zählt Risse. Drei Hebel verbinden ihre Gegengewichte. Die Inschrift verrät, welche ruhen müssen.'],
  ['siv', 'Siv', 'Sängerin des Eises', 'Unter jedem Gletscher liegt ein Lied. In der Frostkathedrale antwortet die zweite Strophe auf die erste. Höre hin, bevor du die Runen berührst.'],
  ['samir', 'Samir', 'Karawanenführer', 'Das Wasser ist knapp und die Zitadelle beherrscht die Brunnen. Drei Reisende müssen ihre Siegel gleichzeitig halten. Niemand trägt diese Last allein.'],
  ['rhea', 'Rhea', 'Traumweberin', 'Manche Narben stammen aus Träumen, andere aus Feigheit. Wir holen die Verlorenen zurück. Sammle für sie Brot und ein klares Licht.'],
  ['kael', 'Kael', 'Marschall der letzten Legion', 'Vier halten den Nachtschlund offen, drei brechen seinen Schild, einer führt das Ungeheuer fort. Überlebt gemeinsam, oder verliert gemeinsam.'],
  ['astra', 'Astra', 'Kartografin der Sternenflotte', 'Die Sterne sind keine Beute. Ihre Splitter weisen zum Nexus. Lerne diesen Hafen kennen, stärke deine Verbündeten und warte auf acht Antworten.'],
  ['eos', 'Eos', 'Hüterin des Weltenkerns', 'Acht Siegel, acht Stimmen. Die Quelle duldet keine einsame Krone. Tragt den Schildbruch gemeinsam und helft denen auf, die fallen.'],
];

export const EXPANSION_NPCS = guides.map(([id, name, role, dialogue], i) => {
  const region = EXPANSION_REGIONS[i];
  return { id, name, role, dialogue, region: region.id, x: region.x + 350, y: region.y + 420, color: region.color };
});

// Each chapter has a local conflict, preparation, field work and a distinct resolution.
// Data stays compatible with the original quest ledger, including dungeon/puzzle/raid events.
const chapterStories = [
  [
    ['Der Kornweg', 'Folge der verlassenen Handelsstraße zur Kornwacht. Lys braucht eine Kundschafterin, bevor sie die Bauern aus dem Dorf schickt.', [['explore', 'sonnensteppe', 1, 'Die Sonnensteppe erreichen']]],
    ['Kein leeres Feld', 'Die Räuber stehlen nicht nur Vorräte: Sie verbrennen die Samen. Sichere die Saatkolonnen und bereite einen Trank für die Verletzten.', [['kill', 'steppe_raider', 8, 'Steppenräuber vertreiben'], ['craft', 'brew_heal', 2, 'Zwei Heiltränke brauen']]],
    ['Die erste neue Ernte', 'Lys will keine Heldenstatue. Sie will, dass wieder Brot auf den Tischen steht. Ernte deinen Acker und backe Reisebrot für die Wacht.', [['farm', 'wheat', 12, 'Sonnenweizen ernten'], ['craft', 'bake_bread', 3, 'Hainbrot für die Wacht backen']]],
    ['Ein Eid unter Wurzeln', 'Drei Runen öffnen das Wurzelgewölbe. Mond, Blatt, Glut: Eine Erinnerung an den Zyklus des Hains.', [['puzzle', 'wurzelgewoelbe', 1, 'Die Wurzelrunen ordnen']]],
    ['Was die Erde bewahrt', 'Die Wurzelmutter trägt die vergessene Seuche. Besiege sie im Gewölbe und bring dem Kornweg seinen ersten freien Frühling.', [['dungeon', 'wurzelgewoelbe', 1, 'Das Wurzelgewölbe abschließen']]],
  ],
  [
    ['Das grüne Ufer', 'Finde Jadesteg zwischen den langen Wasserläufen. Nami hält die letzte Brücke frei.', [['explore', 'jadeauen', 1, 'Die Jadeauen entdecken']]],
    ['Spuren im Schilf', 'Die Jadepirscher jagen an den Trinkwasserstellen. Lösche ihre Spuren, bevor die Flüchtlinge ankommen.', [['kill', 'jade_stalker', 12, 'Jadepirscher besiegen']]],
    ['Die Wurzelapotheke', 'Mondkraut bindet das Gift, Kristall bindet die Erinnerung. Berge beides für Namis Heilkreis.', [['gather', 'herb', 24, 'Mondkraut für den Heilkreis sammeln'], ['gather', 'crystal', 12, 'Kristallsplitter bergen']]],
    ['Ein Stab für den Strom', 'Braue Äthertränke für die erschöpften Wasserhüter. Ohne ihre Magie werden die Gräben zu Fallen.', [['craft', 'brew_mana', 5, 'Äthertränke für die Wasserhüter brauen']]],
    ['Der letzte grüne Tag', 'Nami lässt den Heilkreis wachsen. Halte die Pirscher fern und trage das Heilmittel bis zur Küste.', [['kill', 'jade_stalker', 18, 'Den Heilkreis schützen'], ['explore', 'sturmkueste', 1, 'Die Botschaft an die Küste tragen']]],
  ],
  [
    ['Licht im Nebel', 'Erreiche Ivars Leuchtturm. Der Weg ist offen, doch der Nebel verschluckt die Warnzeichen.', [['explore', 'sturmkueste', 1, 'Die Sturmküste erreichen']]],
    ['Das Holz der Gestrandeten', 'Repariere die Signalfeuer mit treibendem Hainholz. Tränke halten die verletzten Seeleute auf den Beinen.', [['gather', 'wood', 24, 'Holz für Signalfeuer sammeln'], ['craft', 'brew_heal', 4, 'Seeleute mit Heiltränken versorgen']]],
    ['Die falsche Gezeit', 'Die Gezeitenbrecher folgen einer Glocke unter der Klippe. Schlag ihnen den Weg zum Hafen ab.', [['kill', 'tide_reaver', 16, 'Gezeitenbrecher aufhalten']]],
    ['Gewicht der Erinnerung', 'Im Salzarchiv muss die Frachtkiste auf die Waage. Schiebe sie vom Gang aus; das Rückstellrad hilft bei Fehlern.', [['puzzle', 'salzarchiv', 1, 'Die Frachtwaage ausgleichen']]],
    ['Die Glocke im Salz', 'Senke die Stimme des Ertrunkenen Archonten. Seine Flut kommt vor dem Schlag: Verlasse die markierte Fläche.', [['dungeon', 'salzarchiv', 1, 'Das Salzarchiv abschließen']]],
  ],
  [
    ['Dornen am Gartenzaun', 'Branna wartet vor dem aufgegebenen Kloster. Hier wachsen die Wege schneller zu, als Menschen sie öffnen können.', [['explore', 'dornwildnis', 1, 'Die Dornwildnis erreichen']]],
    ['Samen gegen Stahl', 'Schütze die alten Beete vor den Jägern. Branna braucht keine verbrannten Wälder, sondern Zeit.', [['kill', 'thorn_hunter', 18, 'Dornenjäger zurückdrängen'], ['farm', 'wheat', 15, 'Vorräte für die Gärtner ernten']]],
    ['Ein Brot für die Verbannten', 'In den Ruinen leben die letzten Gärtner. Sammle Kräuter und backe genug Brot für ihren Rückweg.', [['gather', 'herb', 30, 'Heilkräuter sammeln'], ['craft', 'bake_bread', 5, 'Brot für die Verbannten backen']]],
    ['Der Garten des Lichts', 'Drei Linsen lenken das Licht nach Osten, Süden und Westen. Drehe sie im Dornenkloster in diese Richtungen.', [['puzzle', 'dornenkloster', 1, 'Den Lichtgarten erwecken']]],
    ['Keine Krone aus Dornen', 'Die Äbtissin bewahrt den Garten mit Gewalt. Beende ihre Herrschaft, ohne ihre Nachfolger in den Hunger zu schicken.', [['dungeon', 'dornenkloster', 1, 'Das Dornenkloster abschließen']]],
  ],
  [
    ['Am schwarzen Wall', 'Borin hält den Obsidianpass. Die Banner auf der anderen Seite tragen das Zeichen seiner eigenen Legion.', [['explore', 'obsidianpass', 1, 'Den Obsidianpass entdecken']]],
    ['Stahl, der standhält', 'Die Wacht braucht ein neues Glied in ihrer Kette. Sammle Erz und schmiede Wächterschuppen für Borins Vorhut.', [['gather', 'ore', 36, 'Erz am Glaswall abbauen'], ['craft', 'forge_mail', 2, 'Wächterschuppen schmieden']]],
    ['Die gebrochenen Banner', 'Befreie die Ritter von den Kristallen in ihren Rüstungen. Kein Name soll in diesem Krieg vergessen werden.', [['kill', 'obsidian_knight', 24, 'Obsidianritter erlösen']]],
    ['Morgenbrand am Pass', 'Elins alter Entwurf kann den Glasschild durchtrennen. Schmiede Morgenbrand und sammle Kristall für seine Glut.', [['craft', 'forge_ember', 1, 'Morgenbrand schmieden'], ['gather', 'crystal', 24, 'Glut für die Klinge bergen']]],
    ['Ein Weg für die Heimkehr', 'Borin öffnet das Tor zur Mondwarte. Vertreibe die letzten Ritter und finde die Ursache ihrer Verwandlung.', [['kill', 'obsidian_knight', 16, 'Die Nachhut zurückdrängen'], ['explore', 'mondbruch', 1, 'Die Mondwarte erreichen']]],
  ],
  [
    ['Die Stunde ohne Zeiger', 'Aelia bewahrt ein Archiv zwischen den Rissen. Triff sie unter der zerbrochenen Mondscheibe.', [['explore', 'mondbruch', 1, 'Mondbruch entdecken']]],
    ['Scherben eines Tages', 'Die Konstrukte wiederholen den letzten Tag vor dem Riss. Berge Kristall aus ihren Bahnen und erlöse ihre Wächter.', [['gather', 'crystal', 32, 'Mondsplitter sammeln'], ['kill', 'moon_construct', 20, 'Mondkonstrukte stilllegen']]],
    ['Öl für den Äther', 'Äthertränke stabilisieren Aelias Messgeräte. Sie muss die Uhr verstehen, bevor jemand sie zerstört.', [['craft', 'brew_mana', 8, 'Äther für die Messgeräte brauen']]],
    ['Drei Gegengewichte', 'Im Uhrwerk muss die erste und die dritte Kette gespannt bleiben. Die zweite ruht. Die Hebel tragen ihre Zahlen.', [['puzzle', 'uhrwerk', 1, 'Die Gegengewichte des Uhrwerks ordnen']]],
    ['Der Hüter der falschen Stunde', 'Chronar hält alle Reisenden im selben Augenblick fest. Löse die Uhr aus seiner Hand und bewahre ihre Erinnerung.', [['dungeon', 'uhrwerk', 1, 'Das zerbrochene Uhrwerk abschließen']]],
  ],
  [
    ['Das Lied unter dem Eis', 'Siv singt am Rand der Frostkathedrale. Ihre Stimme ist die letzte, die im Sturm nicht zerbricht.', [['explore', 'permafrost', 1, 'Permafrost erreichen']]],
    ['Der Preis der Wärme', 'Berge Holz und Kräuter für die frierenden Pilger. Ein Lagerfeuer ist hier eine kleine Festung.', [['gather', 'wood', 40, 'Holz für die Pilger bergen'], ['gather', 'herb', 32, 'Kräuter für Frostwunden sammeln']]],
    ['Gletscherwache', 'Die Kolosse treiben die Pilger in den Sturm. Nimm ihnen den Weg zur Wacht, damit Siv die Verletzten erreichen kann.', [['kill', 'frost_colossus', 26, 'Gletscherkolosse aufhalten']]],
    ['Die zweite Strophe', 'Mond, Frost, Stern: In der Kathedrale folgen die Runen Sivs Lied. Danach weisen die Linsen Ost, Süd und West.', [['puzzle', 'frostkathedrale', 1, 'Das Eislied und die Linsen lösen']]],
    ['Wenn der Gletscher atmet', 'Skadi hält die Kälte in ihrem Herzen fest. Erlöse sie und lass das Lied durch die Kathedrale wandern.', [['dungeon', 'frostkathedrale', 1, 'Die Frostkathedrale abschließen']]],
  ],
  [
    ['Am Brunnen der Winde', 'Samirs Karawane hat die Sandsenke erreicht. Ihre Wasserschläuche sind leer, ihre Hoffnung noch nicht.', [['explore', 'sandsenke', 1, 'Die Sandsenke entdecken']]],
    ['Die Straße der Durstigen', 'Halte die Wiedergänger von den Karawanenwegen fern. Die Zitadelle ruft sie aus den begrabenen Gräbern.', [['kill', 'sand_revenant', 30, 'Dünenwiedergänger besiegen']]],
    ['Vorräte für drei', 'Der Sturm verlangt eine Gruppe. Bereite Heiltränke und Brot vor, bevor du deine Gefährten zur Zitadelle rufst.', [['craft', 'brew_heal', 10, 'Heiltränke für die Gruppe brauen'], ['craft', 'bake_bread', 8, 'Gruppenproviant backen']]],
    ['Drei Hände gegen den Wind', 'Drei lebende Gefährten müssen drei Siegel gleichzeitig halten. Der Sturm öffnet das Tor erst nach zwei ruhigen Sekunden.', [['puzzle', 'sturmzitadelle', 1, 'Das gemeinsame Sturmsiegel brechen']]],
    ['König eines leeren Himmels', 'Besiegt den Sturmkönig zu dritt. Einer führt seinen Blick, die anderen suchen die Siegel. Sein Schild bricht nur gemeinsam.', [['raid', 'sturmzitadelle', 1, 'Die Sturmzitadelle als Gruppe abschließen']]],
  ],
  [
    ['Das Haus ohne Schatten', 'Rhea hat die Verlorenen am Traumsee gesammelt. Erreiche sie, bevor die Risswächter ihre Namen finden.', [['explore', 'traumsenke', 1, 'Die Traumsenke entdecken']]],
    ['Der Name im Wasser', 'Vertreibe die Wächter aus den Traumgärten. Jeder Sieg lässt einen Flüchtling wieder seinen Namen hören.', [['kill', 'void_watcher', 32, 'Risswächter aus den Gärten vertreiben']]],
    ['Ein Anker aus Brot', 'Ein warmer Geschmack erinnert die Verlorenen an Zuhause. Ernte, backe und bring ihnen einen Anker zur Wirklichkeit.', [['farm', 'wheat', 36, 'Sonnenweizen ernten'], ['craft', 'bake_bread', 12, 'Brot für die Verlorenen backen']]],
    ['Kristall ohne Echo', 'Rhea braucht Kristalle, die niemanden einschließen. Berge sie und stärke ihr Ritual mit Äther.', [['gather', 'crystal', 48, 'Traumkristalle bergen'], ['craft', 'brew_mana', 10, 'Äther für Rheas Ritual brauen']]],
    ['Die Namen nach Hause', 'Der Fluchtweg führt durch Blutmark. Geleite Rheas Erinnerung, indem du die Wächter der Grenze brichst.', [['kill', 'void_watcher', 24, 'Die Grenzwache besiegen'], ['explore', 'blutmark', 1, 'Blutmark erreichen']]],
  ],
  [
    ['Die letzte Legion', 'Kael hält kein Reich zusammen. Er hält einen Rückzug offen. Erreiche sein Lager in Blutmark.', [['explore', 'blutmark', 1, 'Die letzte Legion finden']]],
    ['Kein Krieg ohne Namen', 'Berge Erz für die Schutzschilde und beende die Jagd der Risswächter auf die Verwundeten.', [['gather', 'ore', 56, 'Erz für Schutzschilde bergen'], ['kill', 'void_watcher', 36, 'Die Verwundeten schützen']]],
    ['Vier, die zurückkehren', 'Bereite die Gruppe auf den Nachtschlund vor. Ein Trank entscheidet manchmal, ob jemand wieder aufstehen kann.', [['craft', 'brew_heal', 16, 'Heiltränke für vier Gefährten brauen'], ['craft', 'brew_mana', 12, 'Äthertränke brauen']]],
    ['Licht unter dem Schlund', 'Lenkt die drei Linsen und haltet danach vier Siegel gemeinsam. Die Tore reagieren auf Menschen, nicht auf zurückgelassene Kisten.', [['puzzle', 'nachtschlund', 1, 'Das Licht und die vier Nachtsiegel lösen']]],
    ['Der Hunger hinter dem Krieg', 'Vier Gefährten stellen sich dem Nachtverschlinger. Drei brechen seinen Schild, einer hält den Blick. Helft Gefallenen auf.', [['raid', 'nachtschlund', 1, 'Den Nachtschlund als Vierergruppe abschließen']]],
  ],
  [
    ['Hafen der gefallenen Sterne', 'Astra kartiert die Splitter, die vom Himmel kamen. Ihr Hafen ist der letzte Ort vor dem Nexus.', [['explore', 'sternensund', 1, 'Sternensund entdecken']]],
    ['Die Karte im Kristall', 'Jeder geborgene Splitter schließt eine Lücke in Astras Karte. Schütze die Kartografen vor den Wächtern.', [['gather', 'crystal', 64, 'Sternsplitter kartieren'], ['kill', 'void_watcher', 40, 'Die Kartografen schützen']]],
    ['Acht Plätze am Tisch', 'Stärke die künftige Expedition mit Brot und Tränken. Niemand soll den Weltenkern mit leeren Händen betreten.', [['craft', 'bake_bread', 20, 'Brot für acht Gefährten backen'], ['craft', 'brew_heal', 20, 'Expeditionstränke brauen']]],
    ['Eine Klinge für jede Antwort', 'Schmiede die letzte Glut neu und sammle das Metall für die Reise. Gute Vorbereitung ersetzt keinen Gefährten, aber bewahrt ihn.', [['craft', 'forge_ember', 3, 'Morgenbrand für die Vorhut schmieden'], ['gather', 'ore', 64, 'Sternenmetall bergen']]],
    ['An der Naht der Welt', 'Astras Karte endet, wo die Quelle beginnt. Erreiche Eos im Nexusriss und lausche ihrem Ruf.', [['explore', 'nexusriss', 1, 'Den Nexusriss erreichen']]],
  ],
  [
    ['Acht Stimmen', 'Eos erkennt jeden Reisenden am Licht, das er trägt. Finde die Hüterin des Weltenkerns im Nexusriss.', [['explore', 'nexusriss', 1, 'Eos am Nexusriss finden']]],
    ['Die Wache der Quelle', 'Die Risswächter folgen längst keinem Herrn mehr. Öffne einen Weg für die Expedition und bewahre seine Kristalle.', [['kill', 'void_watcher', 48, 'Den Weg zur Quelle sichern'], ['gather', 'crystal', 80, 'Quellkristalle bergen']]],
    ['Für jene, die fallen', 'Heilung ist keine Nebenaufgabe. Fülle eure Vorräte für einen Kampf, in dem das Aufhelfen eines Gefährten Teil des Sieges ist.', [['craft', 'brew_heal', 24, 'Heiltränke für den Weltenkern brauen'], ['craft', 'brew_mana', 20, 'Äthertränke für den Weltenkern brauen']]],
    ['Das Siegel der Acht', 'Acht lebende Gefährten, acht verschiedene Bodenzeichen: Haltet sie gleichzeitig. Erst danach antwortet die Quelle.', [['puzzle', 'weltenkern', 1, 'Die acht Quellsiegel gemeinsam halten']]],
    ['Eine Welt, die weiteratmet', 'Bezwingt den Weltenkern als Achtergruppe. Brecht seine vier Schilde gemeinsam, sammelt euch im Sternfall und verteilt euch vor der Nova.', [['raid', 'weltenkern', 1, 'Den Weltenkern als Achtergruppe bezwingen']]],
  ],
];

export const EXPANSION_QUESTS = chapterStories.flatMap((quests, i) => quests.map(([title, description, objectives], chapter) => {
  const region = EXPANSION_REGIONS[i];
  return {
    id: `q_${region.id}_${chapter + 1}`, title, description, giver: guides[i][0],
    prerequisite: chapter ? `q_${region.id}_${chapter}` : null,
    region: region.id, recommendedLevel: region.level + chapter, chapter: chapter + 1,
    minLevel: region.id === 'nexusriss' ? [95, 96, 97, 98, 100][chapter] : Math.max(10, region.level + [-2, -1, 0, 0, 1][chapter], ...objectives.filter(([kind]) => ['dungeon', 'raid'].includes(kind)).map(([, id]) => DUNGEONS.find(d => d.id === id)?.minLevel || 1)),
    objectives: objectives.map(([kind, target, count, label]) => ({ kind, target, count, label })),
    reward: { xp: Math.round((400 + region.level ** 2 * 18) * (chapter === 4 ? 2.1 : 1)), gold: 70 + region.level * 15 + chapter * 40, ...(chapter === 4 ? { skillPoints: 1 } : { item: chapter === 2 ? 'hearty_meal' : 'heal_potion' }) },
  };
}));

function seeded(seed) {
  return () => {
    seed = (seed | 0) + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function regionSeed(seed, id) { for (const char of id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619); return seed >>> 0; }
function lineDistance(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
}

export function populateSector(world, regionId) {
  const region = EXPANSION_REGIONS.find(r => r.id === regionId);
  if (!region || world.populatedRegions?.includes(regionId)) return false;
  world.populatedRegions ||= [];
  const rng = seeded(regionSeed(world.seed || 826404, regionId));
  const guide = EXPANSION_NPCS.find(n => n.region === regionId);
  const battlePoints = [.22, .38, .55, .72, .86].map((t, i) => ({ x: region.x + region.w * t, y: region.y + region.h * (i % 2 ? .69 : .36) }));
  const regionPaths = [
    { width: 70, region: region.id, points: [[region.x + 20, guide.y], [guide.x, guide.y], ...battlePoints.map(p => [p.x, p.y]), [region.x + region.w - 20, guide.y]] },
    { width: 60, region: region.id, points: [[guide.x, region.y + 20], [guide.x, guide.y], [region.x + region.w * .5, region.y + region.h * .5], [region.x + region.w * .5, region.y + region.h - 20]] },
  ];
  world.paths.push(...regionPaths);
  world.shrines.push({ id: region.id, name: `${region.name} · ${guide.role.split(' ').at(-1)}`, region: region.id, x: guide.x + 95, y: guide.y + 10 });
  world.structures.push({ id: `${region.id}-outpost`, type: 'camp', name: guide.role, x: guide.x - 70, y: guide.y - 170, w: 110, h: 90, region: region.id, blocking: false });
  world.landmarks.push(...battlePoints.map((p, i) => ({ ...p, type: i === 1 && region.tree !== 'burnt' ? 'pond' : 'circle', r: 145 + i * 12, region: region.id, name: `${region.name} · ${['Grenzwacht', 'Stilles Ufer', 'Vergessener Ring', 'Alter Wall', 'Quellwacht'][i]}` })));
  const protectedSpot = (x, y, margin = 0) => Math.hypot(x - guide.x, y - guide.y) < 260 + margin || world.shrines.some(s => Math.hypot(x - s.x, y - s.y) < 100 + margin) || world.dungeonEntrances?.some(s => Math.hypot(x - s.x, y - s.y) < 150 + margin);
  const onPath = (x, y) => regionPaths.some(p => p.points.slice(1).some((b, i) => lineDistance(x, y, p.points[i], b) < p.width / 2 + 50));
  // Encounters cluster around five landmarks. Every landmark has a broad safe approach.
  battlePoints.forEach((point, spot) => {
    const species = REGION_ENEMY_POOLS[region.id];
    for (let n = 0; n < 6; n++) {
      const angle = n * Math.PI / 3 + rng() * .25, radius = 150 + rng() * 135;
      const x = point.x + Math.cos(angle) * radius, y = point.y + Math.sin(angle) * radius;
      if (protectedSpot(x, y)) continue;
      const level = Math.min(region.maxLevel || 100, region.level + spot % 4);
      // Half the packs retain the chapter's quest target. The remaining packs
      // rotate through every local species rather than copying a distant foe.
      const localPool=species.includes(region.enemy)?species.slice(1):species;
      const type=n<3?region.enemy:localPool[(spot*3+n-3)%localPool.length];
      world.enemies.push(createBestiaryEnemy(type,`${region.id}-enemy-${spot}-${n}`,x,y,{level,region:region.id}));
    }
    // Each species can appear as a champion. Five isolated nests keep these
    // optional fights away from the broad route and from each other's packs.
    const championType=species[spot],championX=point.x+260,championY=point.y+(spot%2?420:-420);
    if(!protectedSpot(championX,championY,60))world.enemies.push(createBestiaryEnemy(championType,`${region.id}-champion-${spot}`,championX,championY,{level:Math.min(region.maxLevel||100,region.level+spot%4),region:region.id,boss:true}));
    world.chests.push({ id: `${region.id}-chest-${spot}`, region: region.id, x: point.x + 65, y: point.y + 60, opened: false, level: region.level, lootTable: region.level >= 75 ? 'endgame' : 'frontier' });
    for (let n = 0; n < 12; n++) {
      const a = n * Math.PI / 6, r = 310 + rng() * 140;
      const x = point.x + Math.cos(a) * r, y = point.y + Math.sin(a) * r;
      const type = ['wood', 'ore', 'herb', 'crystal'][n % 4];
      if (!protectedSpot(x, y, 15)) world.nodes.push({ id: `${region.id}-node-${spot}-${n}`, type, region: region.id, x, y, readyAt: 0, level: region.level });
    }
  });
  for (let row = 0; row < 2; row++) for (let column = 0; column < 3; column++) world.plots.push({ id: `${region.id}-plot-${row}-${column}`, region: region.id, x: guide.x + 170 + column * 48, y: guide.y + 130 + row * 48, state: 'empty', readyAt: 0 });
  const usable = (x, y, radius) => !protectedSpot(x, y, radius) && !onPath(x, y) && ![...world.enemies, ...world.nodes, ...world.chests, ...world.plots].some(o => Math.hypot(o.x - x, o.y - y) < radius + 42);
  for (let n = 0; n < 190; n++) {
    const x = region.x + 90 + rng() * (region.w - 180), y = region.y + 90 + rng() * (region.h - 180);
    if (!usable(x, y, 40)) continue;
    if (n < 130) world.trees.push({ x, y, region: region.id, scale: .7 + rng() * .6, variant: region.tree });
    else world.rocks.push({ x, y, region: region.id, scale: .55 + rng() * .85, variant: region.tree === 'pine' ? 'ice' : region.tree === 'burnt' ? 'ash' : 'stone' });
  }
  world.populatedRegions.push(region.id);
  return true;
}

export function expandWorld(world, { lazy = false, dungeonEntrances = DUNGEONS.map(d => ({ id: d.id, name: d.name, ...d.entrance, minLevel: d.minLevel, partyRequired: d.partyRequired, raid: Boolean(d.raid) })) } = {}) {
  if (world.expansionVersion) return world;
  world.expansionVersion = 1;
  world.width = FRONTIER_BOUNDS.width; world.height = FRONTIER_BOUNDS.height;
  world.worldBounds = { x: 0, y: 0, ...FRONTIER_BOUNDS };
  world.regions = [...world.regions, ...EXPANSION_REGIONS];
  world.npcs = [...(world.npcs || []), ...EXPANSION_NPCS];
  world.dungeonEntrances = dungeonEntrances.map(d => ({ ...d }));
  // Continuous border-to-border routes prevent the old map becoming an isolated island.
  world.paths.push({ width: 80, points: [[2760, 1960], [3050, 1260], [3500, 420], [3750, 420]] });
  for (let i = 0; i < EXPANSION_REGIONS.length - 1; i++) {
    const a = EXPANSION_NPCS[i], b = EXPANSION_NPCS[i + 1];
    world.paths.push({ width: 76, points: [[a.x, a.y], [a.x, b.y], [b.x, b.y]] });
  }
  if (!lazy) EXPANSION_REGIONS.forEach(r => populateSector(world, r.id));
  return world;
}

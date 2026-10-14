import { xpToNext } from './progression.js';

// Native quest objectives consume existing Game.event hooks. The explicitly
// remembered discoveries are one-shot world objects; combat, crafting and event
// resolutions stay fresh so returning explorers still play the conclusion.
const REGION_NAMES = Object.freeze({ daemmerhain: 'Dämmerhain', sonnensteppe: 'Sonnensteppe', jadeauen: 'Jadeauen', sturmkueste: 'Sturmküste', traumsenke: 'Traumsenke', nexusriss: 'Nexusriss' });
const discover = region => ({ kind: 'explore', target: region, count: 1, remembered: true, label: `${REGION_NAMES[region]} erkunden` });
const object = (region, kind, label) => ({ kind: 'interact', target: `encounter-${region}-${kind}`, count: 1, remembered: true, label });
const craft = (target, label) => ({ kind: 'craft', target, count: 1, fresh: true, label });
const event = (target, label) => ({ kind: 'world_event', target, count: 1, fresh: true, label });
const boss = (target, label) => ({ kind: 'boss', target, count: 1, fresh: true, label });
const gather = (target, count, label) => ({ kind: 'gather', target, count, fresh: true, label });

const stories = [
  {
    id: 'nameless-bell', name: 'Die Glocke ohne Namen', region: 'daemmerhain', giver: 'mira',
    summary: 'Mira sucht den letzten Namen eines Begräbnisses, dessen Glocke noch immer läutet.',
    chapters: [
      { title: 'Der fehlende Strich', level: 3,
        description: 'Mira zählt jeden Toten auf ihrer Grabtafel. Eine Zeile besteht nur aus einem Strich. In der Chronik des Dämmerhains steht, wer nach dem letzten Begräbnis noch an den Glockenseilen zog. Lies sie und bring Mira die Erinnerung.',
        objectives: [discover('daemmerhain'), object('daemmerhain', 'lore', 'Die Chronik des Dämmerhains lesen')], item: 'heal_potion' },
      { title: 'Jemand, der antwortet', level: 4,
        description: 'Der Strich gehörte keiner Leiche: Ein Reisender wurde lebend mit dem Leichenwagen fortgebracht. Befreie den Gefangenen des Dämmerhains und braue einen Heiltrank für seinen Weg zurück. Mira will eine Stimme hören, keinen weiteren Grabstein setzen.',
        objectives: [object('daemmerhain', 'captive', 'Den Gefangenen des Dämmerhains befreien'), craft('brew_heal', 'Einen Heiltrank für den Heimkehrer brauen')], item: 'mana_potion' },
      { title: 'Die letzte Antwort', level: 5,
        description: 'Der Gerettete erinnert sich an die Trauerglocke, aber nicht an seinen eigenen Namen. Durchquere den Weg der Trauerglocke und beende ihren Ruf. Welche Asche du trägst, entscheidest du selbst. Mira hält auf der Tafel einen Platz für einen Lebenden frei.',
        objectives: [event('expedition-trauerweg', 'Den Weg der Trauerglocke abschließen')], item: 'hearty_meal' },
    ],
  },
  {
    id: 'moor-inheritance', name: 'Die Erbin des Moors', region: 'aschenmoor', giver: 'sera',
    summary: 'Eine verschwundene Familie hinterließ Sera einen Schlüssel und ein Fläschchen voller fremder Stimmen.',
    chapters: [
      { title: 'Stimmen im Glas', level: 6,
        description: 'Sera erhielt ein leeres Fläschchen, aus dem bei Nacht ein Kind spricht. Die Chronik des Aschenmoors nennt die verschwundene Familie. Braue frischen Äther, damit Sera die Stimme von der Erinnerung unterscheiden kann, bevor sie das falsche Heilmittel ansetzt.',
        objectives: [object('aschenmoor', 'lore', 'Die Familiennamen in der Moorchronik suchen'), craft('brew_mana', 'Frischen Äther für Seras Untersuchung brauen')], item: 'mana_potion' },
      { title: 'Ein Erbe hinter Eisen', level: 7,
        description: 'Im Nachlass lag kein Gold, sondern der Schlüssel zu einem Gruftvorrat. Ziehe die Kette im Aschenmoor und berge den versiegelten Vorrat daneben. Die Beschläge tragen denselben Familiennamen wie das Fläschchen; Sera braucht Gewissheit, bevor sie der Stimme vertraut.',
        objectives: [object('aschenmoor', 'lever', 'Die Gruftkette im Aschenmoor ziehen'), object('aschenmoor', 'sealed_cache', 'Den geöffneten Moorvorrat bergen')], item: 'heal_potion' },
      { title: 'Kein Lied für die Erbin', level: 9,
        description: 'Der Grabkantor singt die Namen der Familie wie einen Besitzanspruch. Bezwinge seinen Schreckensfürsten und löse das Ritual „Namen unter dem Moor“. Sera verschließt danach das Fläschchen: Eine Erbin soll selbst sprechen dürfen, statt im Chor ihrer Toten zu verschwinden.',
        objectives: [boss('grave_cantor', 'Den Grabkantor-Schreckensfürsten bezwingen'), event('event-aschenmoor', 'Namen unter dem Moor abschließen')], item: 'hearty_meal' },
    ],
  },
  {
    id: 'black-seed-account', name: 'Das letzte Saatkonto', region: 'sonnensteppe', giver: 'lys',
    summary: 'Lys entdeckt, dass in den alten Erntelisten Menschen wie Vorräte verrechnet wurden.',
    chapters: [
      { title: 'Ein Fass mit zwei Zahlen', level: 12,
        description: 'Lys zählt die Saat für den nächsten Morgen. Ein verlassenes Fass in der Sonnensteppe trägt zwei Zahlen: Säcke und Reisende. Durchsuche die Vorräte und sieh dir den Kornweg selbst an. Jemand hat in diesem Handel Menschen als Ladung geführt.',
        objectives: [discover('sonnensteppe'), object('sonnensteppe', 'barrel', 'Das verlassene Saatfass durchsuchen')], item: 'grave_red_vial' },
      { title: 'Brot statt eines Preises', level: 14,
        description: 'Der letzte Eintrag ist kein Toter, sondern ein Gefangener. Hole ihn aus der Sonnensteppe zurück und backe ihm ein Hainbrot. Lys verweigert den alten Preis: Ein Mensch, der wieder essen kann, gehört niemandem mehr.',
        objectives: [object('sonnensteppe', 'captive', 'Den Gefangenen am Kornweg retten'), craft('bake_bread', 'Ein Hainbrot für die Heimkehr backen')], item: 'grave_red_vial' },
      { title: 'Die Schuld der schwarzen Ernte', level: 16,
        description: 'Die Hungerhyäne fordert nun die nächste Saatkolonne als Tribut. Schütze die letzte Saatkolonne im Ereignis „Saat für einen schwarzen Morgen“ und bezwinge den Hungerhyänen-Schreckensfürsten. Lys streicht danach das ganze Konto, nicht nur die Schulden eines Einzelnen.',
        objectives: [event('event-sonnensteppe', 'Saat für einen schwarzen Morgen abschließen'), boss('famine_hyena', 'Den Hungerhyänen-Schreckensfürsten bezwingen')], item: 'penitent_elixir' },
    ],
  },
  {
    id: 'bridge-names', name: 'Der falsche Brückenname', region: 'jadeauen', giver: 'nami',
    summary: 'Nami verfolgt die Namen auf den Brücken und die Stimmen, die nachts darüber zurückkehren.',
    chapters: [
      { title: 'Die Rückkehrer im Schilf', level: 20,
        description: 'Nami erkennt im nächtlichen Schilf die Stimmen von Reisenden, die längst den Fluss überquert haben. Besuche die Jadeauen und lies ihre Chronik. Die Wasserhüterin sucht keine neue Opferliste, sondern die Stelle, an der ein Name gegen einen anderen getauscht wurde.',
        objectives: [discover('jadeauen'), object('jadeauen', 'lore', 'Die Brückenchronik der Jadeauen lesen')], item: 'grave_red_vial' },
      { title: 'Ein Siegel unter Wurzeln', level: 22,
        description: 'Die falschen Namen wurden mit einem alten Gruftsiegel beglaubigt. Ziehe die Gruftkette in den Jadeauen und öffne ihren Vorrat. Nami vergleicht dessen Siegel mit den Brückenbüchern; was hier aufbewahrt wurde, darf keine Heimkehr mehr verbieten.',
        objectives: [object('jadeauen', 'lever', 'Die Gruftkette in den Jadeauen lösen'), object('jadeauen', 'sealed_cache', 'Den Siegelvorrat der Jadeauen bergen')], item: 'pale_ether_vial' },
      { title: 'Ein Ufer für die Richtigen', level: 25,
        description: 'Die Schilffallen halten jeden fest, der seinen Namen zurückfordert. Entschärfe den Hinterhalt „Netze im vergifteten Schilf“ und braue danach frischen Äther für die Wasserhüter. Nami lässt die Brücken offen: Die Lebenden sollen selbst entscheiden, wohin sie gehen.',
        objectives: [event('event-jadeauen', 'Netze im vergifteten Schilf abschließen'), craft('brew_mana', 'Äther für die erneuerte Brückenwacht brauen')], item: 'penitent_elixir' },
    ],
  },
  {
    id: 'lighthouse-register', name: 'Das Leuchtbuch der Verschollenen', region: 'sturmkueste', giver: 'ivar',
    summary: 'Ivar will aus einem falschen Zollregister wieder ein Buch der Heimkehr machen.',
    chapters: [
      { title: 'Das Licht zeigt landeinwärts', level: 28,
        description: 'Ivars Leuchtfeuer warnen die See, doch die alte Chronik behauptet das Gegenteil: Ihr Licht führt die Ertrunkenen an Land. Besuche die Sturmküste und lies den Bericht. Ivar muss wissen, welche Schiffe nie ankamen, bevor er eine weitere Laterne entzündet.',
        objectives: [discover('sturmkueste'), object('sturmkueste', 'lore', 'Die Chronik der falschen Leuchtzeichen lesen')], item: 'pale_ether_vial' },
      { title: 'Salz im Totensiegel', level: 30,
        description: 'Eine Aschenurne an der Küste bewahrt die letzten Zeugen des Salzzugs. Berge sie und braue Schwarzquellentonikum für Ivars erschöpfte Wacht. Er will die Namen aus dem Zollregister lesen können, ohne sie dem Wasser erneut zu versprechen.',
        objectives: [object('sturmkueste', 'urn', 'Die Aschenurne der Küstenzeugen bergen'), craft('prepare_blackwell_tonic', 'Schwarzquellentonikum für die Hafenwacht brauen')], item: 'bloodroot_draught' },
      { title: 'Ein Hafen ohne Zoll', level: 32,
        description: 'Begleite den letzten Salzzug durch seine Entscheidung, seine Eskorte und das Tor des Hafenrichters. Ivar nimmt jeden Namen zurück, den du aus dieser Expedition bringst. Die Wacht schuldet den Verschollenen kein Gold, sondern einen freien Weg nach Hause.',
        objectives: [event('expedition-salzzug', 'Die Expedition Der letzte Salzzug abschließen')], item: 'blackwell_tonic' },
    ],
  },
  {
    id: 'unknown-soldier', name: 'Der Eid des unbekannten Soldaten', region: 'obsidianpass', giver: 'borin',
    summary: 'Borin findet im Glaswall die Spur eines Soldaten, den sein eigener Orden aus den Listen tilgte.',
    chapters: [
      { title: 'Ein Wappen ohne Träger', level: 44,
        description: 'Borin kennt jedes Wappen am Glaswall, nur eines trägt keinen Namen. Lies die Chronik des Obsidianpasses und rette den Gefangenen dort. Er hat den Eid dieses Soldaten gehört, bevor der Orden seine Erinnerung aus den Listen schnitt.',
        objectives: [object('obsidianpass', 'lore', 'Die Chronik der zerbrochenen Wappen lesen'), object('obsidianpass', 'captive', 'Den Zeugen am Glaswall befreien')], item: 'reliquary_elixir' },
      { title: 'Ein Zeichen, das bleibt', level: 46,
        description: 'Ein bloßer Name schützt niemanden, sagt Borin. Sammle Erz für die Beschläge und fertige ein Witwenmedaillon nach dem Schutzentwurf der Schmiede. Die neue Wacht soll ein sichtbares Zeichen tragen, das kein Kommandant wieder aus einem Buch radieren kann.',
        objectives: [gather('ore', 4, 'Vier Erzstücke für die Beschläge sammeln'), craft('forge_grave_ward_charm_4', 'Ein schützendes Witwenmedaillon fertigen')], item: 'reliquary_elixir' },
      { title: 'Die Namen im Ofen', level: 48,
        description: 'Die Ofenwitwe hat die gestrichenen Eide in ihrem Feuer gebunden. Durchquere den Pfad der Ofenwitwe und beende ihre Herrschaft über die Erinnerungen. Borin wird den unbekannten Soldaten nicht zum neuen Helden erklären; er soll endlich einfach ein Mensch gewesen sein dürfen.',
        objectives: [event('expedition-ofenpfad', 'Die Expedition Der Pfad der Ofenwitwe abschließen')], item: 'bloodroot_draught' },
    ],
  },
  {
    id: 'borrowed-dream', name: 'Der Traum, der nicht dir gehört', region: 'traumsenke', giver: 'rhea',
    summary: 'Rhea sucht einen gestohlenen Traum und den Menschen, der ohne ihn nicht mehr erwachen kann.',
    chapters: [
      { title: 'Die Erinnerung eines Fremden', level: 76,
        description: 'Rhea hörte in einem fremden Traum den Ruf eines Gefangenen. Lies die Chronik der Traumsenke und hole ihren lebenden Zeugen aus der Nacht. Die Erinnerung gehört keinem Schatzsucher; jemand wartet darauf, sie wieder selbst träumen zu dürfen.',
        objectives: [object('traumsenke', 'lore', 'Die Chronik der fremden Narben lesen'), object('traumsenke', 'captive', 'Den schlaflosen Gefangenen befreien')], item: 'night_oracle_tears' },
      { title: 'Proviant für das Erwachen', level: 78,
        description: 'Ein Erwachen mit leerem Magen ist nur eine andere Art zu verschwinden. Bereite Proviant der letzten Nacht zu und erkunde die Wege der Traumsenke. Rhea sucht einen sicheren Rückweg, während du etwas Greifbares für den Schlaflosen herstellst.',
        objectives: [craft('prepare_last_supper_ration', 'Proviant der letzten Nacht zubereiten'), discover('traumsenke')], item: 'martyr_lifeblood' },
      { title: 'Das Urteil und der Jagdhund', level: 80,
        description: 'Das Gericht der Schlaflosen hält den Traum fest; ein Albtraum-Schreckensfürst folgt seinem Besitzer bereits in die Wachwelt. Schließe die Expedition ab und bezwinge den Albtraumhund. Rhea verspricht keine friedlichen Nächte, nur die Freiheit, wieder die eigenen zu haben.',
        objectives: [event('expedition-schlafgericht', 'Das Gericht der Schlaflosen abschließen'), boss('nightmare_hound', 'Den Albtraumhund-Schreckensfürsten bezwingen')], item: 'abyssal_recovery' },
    ],
  },
  {
    id: 'missing-return', name: 'Die Karte der fehlenden Rückkehr', region: 'sternensund', giver: 'astra',
    summary: 'Astra zeichnet einen Rückweg für eine Sternenflotte, deren Karten nur noch in den Abgrund führen.',
    chapters: [
      { title: 'Der Stern unter Asche', level: 92,
        description: 'Astra fand eine Karte, auf der alle Heimathäfen fehlen. Lies die Chronik des Sternensunds und berge seine Aschenurne. Zwischen den Namen der Sternenflotte liegt der erste richtige Ausgangspunkt: Eine Karte muss erinnern, wer zurückkehren soll.',
        objectives: [object('sternensund', 'lore', 'Die Hafenchronik des Sternensunds lesen'), object('sternensund', 'urn', 'Die Asche der Sternenflotte bergen')], item: 'night_oracle_tears' },
      { title: 'Eine Leuchte für die Rückfahrt', level: 94,
        description: 'Im versiegelten Hafenlager liegt die letzte Leuchte der Flotte. Löse seine Gruftkette, berge den Vorrat und braue Trost des Abgrunds für die Rückfahrt. Astra braucht keine weitere Opfergabe an die Quelle; sie bereitet Vorräte für Menschen vor, die noch leben.',
        objectives: [object('sternensund', 'lever', 'Die Gruftkette am Sternenhafen lösen'), object('sternensund', 'sealed_cache', 'Den letzten Hafenvorrat bergen'), craft('prepare_abyssal_recovery', 'Trost des Abgrunds für die Rückfahrt brauen')], item: 'martyr_lifeblood' },
      { title: 'Eine Karte mit zwei Wegen', level: 96,
        description: 'Richte die Sternlinsen im Ereignis „Die Karte aus kaltem Licht“ aus und finde den Zugang zum Nexusriss. Astra zeichnet beide Wege ein: den zur Quelle und den wieder hinaus. Sie nennt die Karte nicht nach ihrem eigenen Namen, sondern nach denen, die sie heimtragen werden.',
        objectives: [event('event-sternensund', 'Die Karte aus kaltem Licht abschließen'), discover('nexusriss')], item: 'abyssal_recovery' },
    ],
  },
];

export const SIDE_STORY_CHAINS = Object.freeze(stories.map(story => Object.freeze({
  id: story.id, name: story.name, region: story.region, giver: story.giver, minLevel: story.chapters[0].level,
  summary: story.summary, quests: Object.freeze(story.chapters.map((_, index) => `side-${story.id}-${index + 1}`)),
})));

export const SIDE_QUESTS = Object.freeze(stories.flatMap(story => story.chapters.map((chapter, index) => Object.freeze({
  id: `side-${story.id}-${index + 1}`, title: chapter.title, description: chapter.description,
  giver: story.giver, region: story.region, minLevel: chapter.level, prerequisite: index ? `side-${story.id}-${index}` : null,
  contentType: 'side', category: 'side-story', chainId: story.id, chainName: story.name, chapter: index + 1, chapters: story.chapters.length,
  objectives: Object.freeze(chapter.objectives.map(objective => Object.freeze(objective))),
  reward: Object.freeze({ xp: Math.max(20, Math.round(xpToNext(chapter.level) * [.12, .18, .26][index])),
    gold: Math.round(18 + chapter.level * 2 + (index + 1) * 8), ...(chapter.item ? { item: chapter.item } : {}) }),
}))));

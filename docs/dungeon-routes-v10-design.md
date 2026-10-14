# Dungeonreisen V10: implementierter Stand und Nachweise

Stand: 14. Oktober 2026. Emberfall bleibt ein Canvas2D-Browserspiel. Für den Reiseflügel wurden die Skills `procedural-gen` und `level-design` angewendet. Dieses Dokument beschreibt die vorhandene Umsetzung und die tatsächlich durchgeführten Prüfungen; es bescheinigt keine 200 Stunden Inhalt.

## Reise und Geometrie

Die acht vorhandenen Dungeon-IDs erhalten bei einem neuen Eintritt `layoutVersion: 2`. Jede neue Instanz ist 1.800 × 3.840 Einheiten groß und besitzt 13 Raumflächen. Die oberen vier Räume, die vorhandenen Rätsel, der Boss bei `(1470,780)`, seine Quellsiegel und seine HP-/Angriffsbudgets behalten ihre Koordinaten und Definitionen. Darunter liegen ein Eingang, eine Zwischenrast, die Konvergenz und sechs Wahlkammern.

| Abschnitt | Vorhandene Geometrie / Funktion |
| --- | --- |
| Eingang | Start `(896,3584)`, Ausgang `(800,3584)`, Tafel bei `(896,3440)` erklärt die drei Wege. |
| Erste Ebene A | Drei Kammern bei `y=2688`, sichtbare Räume je `448 × 512`; Spalten bei `x=96,672,1248`. |
| Zwischenrast | Raum `x=40,y=2368,w=1720,h=288`, echter Schrein bei `(896,2496)`. |
| Zweite Ebene B | Drei Kammern bei `y=1792`, dieselben Spaltenmaße, eigene Saat-Reihenfolge und Varianten. |
| Konvergenz | Raum `x=40,y=1500,w=1720,h=228`, Verbindung durch die alte Südwand bei `x=768..960`. |
| Bestehende Arena | Begrenzung `x=1104,y=32,w=664,h=1436`; südliche Bossmauer bleibt geschlossen. |

Jede Ebene bietet genau einen Wachtkampf, eine Glutstaffel und einen Wandelgang. Ein erfolgreicher Weg auf A öffnet alle drei A-Tore; ein erfolgreicher Weg auf B öffnet alle drei B-Tore. Danach erreicht die Gruppe die bestehenden Erinnerungen und das ursprüngliche Bossgate. Die beiden nicht zuerst gewählten Kammern jeder Ebene bleiben freiwillig erreichbar und besitzen eigene Vorratskisten. Ein fehlgeschlagener Staffelversuch sperrt keinen anderen Weg. Der Ausgang am südlichen Eingang bleibt über einen Fußweg erreichbar; **ein zusätzliches Rückportal neben dem Boss ist nicht implementiert**.

Der native Spielerradius beträgt 12, der Bossradius 22. Die neuen Stufentüren sind 192 breit. Die tatsächlich begehbaren Spalten werden durch 32 breite Trennwände getrennt; ihr Innenraum ist breiter als die sichtbare 448er Raumfläche. Die bestehende Bewegungsroutine zerlegt Bewegungen in maximal zwölf Einheiten große Schritte und prüft jede Achse. Rollen durchqueren deshalb keine geschlossene Wand.

## Drei unterschiedliche Aufgaben

| Aufgabe | Wirkliche Erfolgsbedingung | Wiederholung und Beute |
| --- | --- | --- |
| Wachtkampf | Alle drei Gegner mit den kanonischen IDs der Kammer sind tatsächlich tot und haben null HP. | Eine eigene Kiste wird freigegeben. Tote Weggegner besitzen eine native `challengeId` und respawnen nicht in derselben Instanz. |
| Glutstaffel | Eine lebende Figur berührt die drei auf der Tafel genannten Runen in Reihenfolge, erreicht sie auf Fußwegen und hält jedes Zeichen zwei Sekunden innerhalb von Radius 30. | Derselbe Träger muss alle Zeichen absolvieren. A erlaubt 16, B 14 Sekunden ab Aufnahme. Eine falsche Rune, Tod, Verlassen der Kammer oder Zeitablauf setzt den Versuch zurück; ein sofortiger Neustart ist möglich. |
| Wandelgang | Eine lebende Figur durchquert drei getaktete Querstreifen und hält das nördliche Wegzeichen zwei Sekunden innerhalb von Radius 30. | Die Warnung dauert 1,8 Sekunden, die aktive Fläche 1,4 Sekunden, die Ruhe 2,8 Sekunden. Ein Treffer je Streifenzyklus und Figur verursacht 13 Prozent MHP vor normaler Minderung. |

Die Rune lässt sich in 85 Einheiten Entfernung aktivieren; für das Halten muss die Figur näher herangehen. Eine andere Figur kann eine aufgenommene Staffel nicht übernehmen. Beschwörungen, gefallene Figuren und doppelte menschliche IDs leisten keinen zusätzlichen Fortschritt.

Ein Wandelgang benutzt echte Segmentkapseln mit Radius `width=28`, sowohl zum Warnen als auch zum Treffen. Die drei Varianten ändern die reale Reihenfolge der Streifentakte. Jeder Streifen erhält auch beim ersten Raumkontakt seine vollständige Warnzeit. Seine Uhr läuft nur, solange eine lebende Figur im Abschnitt steht. Pro Aktivierung verhindert ein gespeicherter Trefferzustand wiederholten Schaden auf dieselbe Figur. Das Spiel ersetzt die Routenwarnungen bei jedem Tick, statt sie anzusammeln. `maxLife` stammt aus demselben Controller wie die tatsächliche Warn-/Aktivzeit.

Die Wachtvarianten verwenden einen mittleren oder seitlich versetzten Deckungspfeiler. Staffelvarianten besitzen unterschiedliche Runenpositionen und teilweise eine kurze Trennwand. Die Saat verteilt die drei Mechaniken auf die Spalten und wählt diese geprüften Varianten. Die Dungeon-Themen bestimmen zusätzlich Symbolfamilien und drei bestehende Gegnerspezies mit unterschiedlichen Angriffsarten. Das sind deterministische Kombinationen aus den vorhandenen Raumvarianten, **keine acht vollständig separat handgezeichneten Reisegrundrisse**. Eine vierte Staffelrune, ein Begleit-NPC und zusätzliche Rettungsräume sind nicht implementiert.

## Fortschritt und Belohnung

Jede gelöste Kammer erzeugt einmal ein `dungeon-route`-Ereignis mit `routeReward: {dust: 2 + tier}`. Die eigene Kiste wird geöffnet, enthält normale generierte Ausrüstung und zusätzlich `1 + tier` Staub. Die bestehenden Gold- und EP-Regeln einer Truhe werden weiterhin durch `Game.interact` ausgeführt. Eine weitere pauschale Abschluss-EP-Prämie pro Kammer wird nicht vergeben.

Quellensiegel aus Wegen werden **erst nach einem wirklichen Boss-/Dungeonabschluss** ausgezahlt. Ein Abbruch am Eingang bringt diese Siegeprämie nicht. `dungeonRouteRewardCandidates(instance)` liefert erst bei `bossDefeated` Kandidaten: je eine erfolgreiche Kammer aus A und B, danach höchstens zwei weitere abgeschlossene Kammern, insgesamt maximal vier Siegel. Raids sind berechtigt; Solo-Dungeons benötigen mindestens Dungeon-Mindeststufe 60 und Tiefe 4. Frühe Solo-Dungeons bezahlen keine Quellensiegel.

Das persönliche Spiel-Ledger speichert `${routeId}:tier-${tier}` als `route-sigil`-Anspruch. Dieselbe Person erhält denselben Kandidaten derselben Tiefe einmal. Der geteilte Instanzzustand bezahlt nicht selbst die persönliche Währung. Die Verwendung für neue Klassen-Technikvarianten gehört zur separaten Technik-Integration.

Die sieben ursprünglichen Siegelwächter und die höheren Tiefen-Echos verwenden nun das tatsächliche Dungeonlevel für EP und Gold: `normalEnemyStats(level).xp`, `round(5 + level × 2,5)`, jeweils multipliziert mit dem unveränderten Tiefenfaktor `1 + (tier - 1) × 0,18`. Der vorherige feste Katalogwert von 3.400 EP machte eine Stufe-15-Wache so reich wie eine Stufe-40-Wache und entwertete spätere Gegner. Die neue Stufe-15-Wache gibt 553 EP und 43 Gold, die Stufe-65-Wache 9.753 EP und 168 Gold. Boss-EP, Bossgold und die authored Bossbudgets werden dadurch nicht verändert. Eine künstlich gestreckte EP-Kurve wurde nicht eingeführt.

## Tatsächliche API und Speicherformat

`src/dungeon-routes.js` exportiert:

```js
installDungeonRoutes(instance)
interactDungeonRoute(instance, objectId, players)
updateDungeonRoutes(instance, dt, players)
dungeonRouteChambers(instance)
dungeonRouteSummary(instance)
dungeonRouteRewardCandidates(instance)
routeHazardShapes(chamber, clock)
captureDungeonRoutes(instance)
validateDungeonRouteSave(saved, context)
restoreDungeonRoutes(instance, saved)
isInBossArena(instance, point)
```

`createDungeon(id, {tier,seed,partySize,layoutVersion=2})` installiert neue Reisen. `layoutVersion: 1` erzeugt den ursprünglichen 1.800 × 1.500-Grundriss. Eine separate `createDungeonRoutes`-API ist nicht vorhanden.

Die Instanz besitzt `routes.chambers` als aus ID, Saat und Tiefe rekonstruierte Beschreibung. Gespeichert wird ausschließlich dieser mutable Teil:

```js
{
  version: 1,
  completed: [],
  relay: null, // oder {chamberId,actorId,step,hold,remaining,holding}
  hazardClocks: {},
  hazardHits: {},
  tacticalHolds: {},
}
```

Es gibt keine unabhängig importierbaren Tor-/Siegelflags und keine importierten Schäden, Raumformen oder Belohnungsbudgets. Stufentore und Kistensperren werden aus gültigen Kammerabschlüssen abgeleitet. Unbekannte IDs und Felder, doppelte Abschlüsse, ungültige Staffel-/Gefahrenzeiten, unverdiente geöffnete Wegkisten und unpassende Wächtertypen/-level/-HP werden abgelehnt. Wächterpositionen müssen außerhalb des kanonischen Mauerwerks liegen. Lebende und durch native Rückstöße besiegte Figuren an einer Wand werden dabei mit demselben Zehnerradius wie `Game.move` geprüft.

Ein alter Reise-Spielstand ohne `dungeon.layoutVersion` lädt ausdrücklich Layout 1. Neue Checkpoints enthalten `layoutVersion` und `routes`. Der globale Save bleibt Version 2. Gewöhnliche Routenakteure werden im größeren Reiseflügel wiederhergestellt; Raid-Adds, Raidwarnungen und Affixechos behalten ihre ursprünglichen Arena-Grenzen. `restoreDungeonRoutes` läuft nach der Rekonstruktion der Gegner- und Truhenzustände. Die Validierung erfolgt bereits vor `Game.initialize`, damit ein fehlerhafter Import die bestehende Reise nicht erst verändert.

`isInBossArena` prüft beide Achsen. Menschen in der rechten südlichen Reisespalte zählen dadurch nicht als Raidgruppe, lösen keinen Bossengagement-Timer aus und werden nicht als Unterstützungslast-Ziele ausgewählt. Der MultiplayerHub besitzt weiterhin die geteilte Simulationsautorität; Instanz-Snapshot und ungefilterter Exportcheckpoint transportieren die Routenversion und den Fortschritt. Echte HTTP-/SSE-/Neustartprüfungen gehören zur separaten Server-Integration und werden hier nicht aus einem lokalen Controller abgeleitet.

## Geprüfte Geometrie und Abläufe

`node tests/scripts/dungeon-route-audit.mjs --layout-version 2 --seeds 64 --tiers 1,4,8` hat **1.536 Karten** geprüft: acht Dungeon-IDs, 64 Seeds und drei Tiefen. Die Prüfung benutzt echte `Game.collides`- und `Game.move`-Aufrufe mit Radius 12. Sie zeigt Erreichbarkeit der Wahlkammern, der Kontakte, des Ausgangs und des ursprünglichen Bossbereichs nach den wirklichen Torbedingungen. Sie prüft zudem, dass die nächste Ebene vorher unerreichbar bleibt. Die Bewegung erfolgt auf einem 24er Navigationsraster; ein gültiger Zwischenpunkt nahe einer Wand wird nur an einen durch native Bewegung erreichbaren freien Rasterpunkt angeschlossen.

Das Öffnen der Geometrie wird im Sweep bewusst als isolierte Fixture vorbereitet: Wachtgegner werden für diese Kollisionsprüfung besiegt gesetzt, Staffel-/Wandelgangbedingungen durch ihre nativen Controller erreicht. Dieser Sweep beweist keine Kampfstärke, Versorgung oder Spielzeit. Die zusätzlichen Unitprüfungen testen alle neun A/B-Mechanikkombinationen und 48 physisch gelaufene Staffelvarianten mit dem Mindesttempo 120, ohne Rolle. Für diese isolierten Mindesttempo-Proben ist das Tempo ausdrücklich ein Testprofil; daraus wird keine reale Ausrüstungsbeschaffung abgeleitet.

Am 14. Oktober bestehen die **30 gezielten Dungeon-/Routentests**. Sie prüfen außerdem falsche Runen, menschliche Trägeridentität, unterbrochene Standzeit, Zeitablauf, Wiederholung, native Warnungs-/Trefferrhythmen, den Raidarena-Ausschluss, verschobene Waffenbudgets, Quellensiegelgrenzen und atomare Fehlerfälle. Die alte Echo-Akkumulationsprüfung zählt nun dauerhaft vorhandene Raumgegner und zusätzlich maximal sechs lebende Affixechos. Der Legacy-Erreichbarkeitstest wählt ausdrücklich Layout 1; neue Stufentore werden separat mit ihren eigenen Erfolgsbedingungen geprüft.

## Vollständige native Solo-Journeys und Balancevergleich

`tests/scripts/dungeon-v10-journey-audit.mjs` läuft den gesamten Dungeon über echte Bewegungstasten, `Game.update`, normale Angriffe, erlernte Fähigkeiten und reale körpernahe Interaktionen. Nach dem Einlass gibt es keine Positions-, HP- oder Cooldown-Korrekturen. Die Tickgröße beträgt höchstens 0,04 Sekunden; an engen Ecken wird für präzise digitale Bewegung ein kleinerer nativer Tick verwendet. Der Pfadfinder liest die Kollisionskarte, und der Kampfcontroller umgeht vorhandene Deckung über erreichbare Schusswinkel.

Vorbereitet werden legal erreichte Stufe 15 beziehungsweise 65, sieben generierte Rare-Teile und durch echte Methoden gekaufte Talente/Fähigkeiten für den Waldläufer. Es gibt keine legendären Relikte, Aufwertungen, gefüllten Sockel, Begleiter oder zusätzlichen großen Trankvorräte. Die fünf ursprünglichen Start-Heiltränke bleiben im Gepäck. Die Beschaffung der Rare-Ausrüstung wird nicht mitgespielt. Der Controller benutzt im Lauf vier echte Schreininteraktionen, die HP und Mana nach den bestehenden Spielregeln wiederherstellen.

Beide endgültigen Solo-Läufe meistern **alle sechs Wahlkammern und sechs Vorratskisten**, besiegen die sieben ursprünglichen Wächter, lösen das ursprüngliche Rätsel beziehungsweise beide Frost-Erinnerungen, besiegen den unveränderten Boss und öffnen die Siegestruhe. Der Vergleich vor/nach der Wächterkorrektur benutzt dieselbe Fixture, dieselbe Saat und denselben Controller. Eine isolierte Quellkopie enthält das alte Wächter-EP-/Goldmodell. In den acht aufgezeichneten Simulationsdateien unterscheidet sich ausschließlich `dungeons.js`; die Fixtures sind identisch. Rohdaten mit Quellenhashes bleiben unter `/private/tmp` und enthalten keine echten Benutzer-Spielstände.

| Journey / Rare-Startstufe | Vorher: gesamte aktive Reise | Nachher: gesamte aktive Reise | Endstufe vorher → nachher | Wirklicher HP-Schaden nachher | Heiltränke |
| --- | ---: | ---: | --- | ---: | ---: |
| Wurzelgewölbe / 15 | 124,98 s | 123,93 s | 20 → 18 | 20 | 0 |
| Frostkathedrale / 65 | 133,29 s | 133,29 s | 66 → 66 | 206 | 0 |

Die gemessene Zeit zwischen tatsächlichem Bossengagement und Tod beträgt nachher 6,10 Sekunden im Wurzelgewölbe und 12,90 Sekunden in der Frostkathedrale. Beide nachher gespielten Bosse zeigen die Phasen 1, 2 und 3; daraus folgt nicht, dass jede angekündigte Aktion noch vor ihrem Tod aufgelöst wurde. Der gemessene HP-Schaden stammt in beiden Läufen vom Boss. Der gewählte Botweg erzeugt vier unterschiedliche Wandelgang-Warnungen, überquert sie in diesen konkreten Proben aber ohne HP-Treffer. Der getrennte native Schadentest belegt, dass Stehenbleiben im aktiven Streifen wirklich Schaden auslöst; diese beiden schnellen Reisen allein sind keine Gefahren-Balanceprüfung aller Seeds.

Die niedrigere frühe Wächterprämie entfernt ein falsches Stufe-40-EP-Budget aus dem ersten Dungeon. Sie erzwingt keine längere Kampfzeit und ersetzt keine zusätzlichen interessanten Inhalte. Die höhere späte Prämie folgt dem realen Gegnerlevel, statt alle Wächter künstlich auf das frühe Niveau herunterzusetzen.

## Grenzen und noch erforderliche Nachweise

Ein Native-Botlauf ist kein menschlicher Spielspaßtest. Die präzise Reaktion, bereitgestellte Rare-Ausrüstung und häufigen normalen Schreinbesuche erklären einen Teil der schnellen, sicheren Siege. Netzwerk-Latenz, reale Smartphones und gleichzeitige Finger werden hier nicht nachgebildet. Die beiden Solo-Journeys ersetzen keine vollständig durchgespielten Drei-, Vier- und Achtpersonen-Reisen; der bisherige V9-Raidaudit isoliert weiterhin den Bossbereich.

Browserbilder und mobile Layoutprüfungen werden von der separaten Interface-Abnahme dokumentiert. Die 1.536 geometrisch gültigen Kombinationen sind keine 1.536 unterschiedlichen handgeschriebenen Geschichten und keine Spielstunden. `campaignPacing` bleibt ein Entwicklungsziel mit `targetHours: 200` und `verifiedHours: 0`. Die vorliegenden Reisen zeigen echten Fortschritt bei Entscheidungen und Erreichbarkeit, belegen aber weiterhin keine 200 Stunden sinnvolle, abwechslungsreiche Spielbarkeit. Erforderlich bleiben vollständig gespielte Gruppenreisen, unterschiedliche langfristige Ausrüstungsziele, dokumentierte Fehlversuche und menschliche wiederholte Kampagnen-/Endgame-Sitzungen.

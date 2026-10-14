# Raidqualität: echte Kämpfe und klare Messgrenzen

Der Audit verwendet die tatsächliche `Game`-Simulation mit ihren unveränderten Gegnerwerten, Schadensregeln, Projektilen, Manaausgaben, Heilungen, Rollenfähigkeiten und Abklingzeiten. Er soll Probleme aufdecken, die kurze Mechaniktests mit künstlichem Leben oder isoliert erzwungenen Bosszuständen nicht erkennen. Er ist weder ein menschlicher Gruppentest noch ein Nachweis für 200 Stunden sinnvolle Spielentwicklung.

## Reproduktion

```sh
node tests/scripts/raid-v9-gameplay-audit.mjs --mode reactive --out /private/tmp/emberfall-raids-reactive.json
node tests/scripts/raid-v9-gameplay-audit.mjs --mode stationary --out /private/tmp/emberfall-raids-stationary.json
node tests/scripts/raid-v9-gameplay-audit.mjs --team rangers --out /private/tmp/emberfall-raids-rangers.json
node tests/scripts/raid-v9-gameplay-audit.mjs --supplies 0 --verify-respawn --out /private/tmp/emberfall-raids-mix-no-vials.json
node tests/scripts/raid-v9-gameplay-audit.mjs --team rangers --supplies 0 --verify-respawn --out /private/tmp/emberfall-raids-rangers-no-vials.json
```

`--raid sturmzitadelle` begrenzt den Lauf auf einen Raid. `--source /absoluter/checkout` erlaubt denselben Controller gegen eine andere unveränderte Quellfassung. `--seconds 850` ist das maximale Simulationslimit. `--supplies 0` entfernt die bereitgestellten großen Tränke für eine separate Versorgungsprobe; der normale Vorrat beträgt jeweils 20. `--pacing` ergänzt nach einem Sieg eine ausdrücklich illustrative Wiederholungsrechnung bis Stufe 100. Die JSON-Rohdaten enthalten Kampfzeiten, Warnungsfolgen, tatsächlich entstandene und zerstörte Ziele, Schaden, absorbierten Schildschaden, echte Heilung, Trankverbrauch, Tod, Ränge, Aktionsbelegung und die sieben angelegten Gegenstände. Sie bleiben außerhalb des Repositorys.

Die neue Pool-Fassung kann zusätzlich mit `--verify-respawn` geprüft werden: Bei einem echten Todesfall versucht der Audit einmal die native Selbst-Rückkehr. Sie muss während eines lebenden engagierten Raidbosses verweigert werden und darf weder HP noch den Todeszustand verändern. Ein erlaubter Rückweg würde den Audit abbrechen, statt heimlich eine volle Lebensauffüllung in den Kampf einzubauen. Dieser Schalter gehört nicht zum unveränderten V8-Vergleich.

## Was tatsächlich gespielt wird

- Drei Figuren auf Stufe 75, vier auf Stufe 90 und acht auf Stufe 100. Die Stufen werden durch `Game.gainXp` erreicht; der Etat beträgt exakt `2 × Stufe`, ohne zusätzliche Questpunkte. Lernen, Voraussetzungen, Ranggrenzen und ausschließende Talente werden ausschließlich durch die bestehenden Methoden geprüft und bezahlt.
- Sieben gültige Rare-Teile auf der Charakterstufe, erzeugt durch `generateLoot` und angelegt durch `Game.equip`. Die Klassenwaffe und passenden Ausrüstungsfamilien stammen aus dem aktuellen Katalog. Der feste Zufallsstartwert lautet `481 + Figurenindex × 71`. Zufällig zulässige Setstücke bleiben erhalten; es gibt keine erzwungenen Setboni, legendären Relikte, Aufwertungen, gefüllten Sockel, Gefährten oder temporären Segen.
- Sturm: Wächter, Paladin und Waldläufer. Nacht: Wächter, Druide, Waldläufer und Flammenrufer. Weltenkern: jeweils eine Figur aller acht Klassen. Der Rollenvergleich verwendet die gleiche Gruppengröße ausschließlich mit Waldläufern.
- Die Warnungen werden aus den öffentlich dargestellten Bosszuständen und geometrischen Flächen gelesen. Der Controller darf schneller und genauer reagieren als ein Mensch. Er geht über normale Bewegungstasten mit `update(0.04)` und verwendet `action`, `useLearnedAbility` sowie `consume`; keine Positionssprünge, direkten Bossverletzungen, Mana-/Lebensauffüllungen oder Cooldown-Resets nach dem Pull.
- Die Zieleingabe entspricht dem Multiplayer-Protokoll: ein Blickwinkel mit einem Zielpunkt 100 Einheiten vor der Figur. Platzierte Flächen bekommen dadurch keinen künstlichen Vorteil durch einen exakten Offline-Mauszielpunkt auf dem Gegner. HTTP-Latenz und Bandbreite werden durch den direkt aufgerufenen Simulationscontroller jedoch nicht nachgebildet.
- Alle Figuren erhalten dieselbe absolute Simulationszeit, auch wenn sie gefallen sind. Das entspricht dem Multiplayer-Server: Die persönliche `update`-Methode entscheidet weiterhin über Bewegung und Abklingzeiten, aber ein geretteter Charakter kehrt nicht mit einer stehengebliebenen Weltuhr zurück. Schild-, Status- und Schadensfristen verwenden dadurch die richtige gemeinsame Zeit.
- Beim Schildbruch halten unterschiedliche Figuren die echten Quellsiegel. Für Sammelwarnungen gehen nur die nötigen Gefährten in die markierte Fläche. Die anderen behalten ihre Siegelaufgabe. Novamarken werden durch echte Laufwege verlassen. Neue Seelen und Anker werden durch echte Angriffe zerstört.
- Die ausdrücklich angekündigte Unterstützungswarnung `raid_pressure` wird als Schutz-/Heilfenster behandelt. Dafür rennt der Controller nicht reflexartig von seinem Siegel; Rollen können schützen, danach fehlendes Leben heilen und weiterhin angreifen. Sofortige Heilungen werden nicht vor dem Einschlag auf vollständig gesunde Ziele verschwendet. Die übrigen gefährlichen Formen werden weiterhin durch Bewegung beantwortet.
- Wächter benutzen ihre Schutzfähigkeiten. Heilklassen heilen nur real fehlendes Leben in ihrer wirklichen Reichweite. Pro Figur sind 20 geeignete Heil- und 20 Manatränke als endlicher Vorrat bereitgestellt; die fünf ursprünglichen kleinen Starttränke bleiben im Gepäck. Das ist eine offengelegte Vorratsannahme, kein Nachweis der Beschaffungsdauer. Ein Trank wird nur bei ausreichendem Bedarf und gültiger gemeinsamer Abklingzeit verbraucht.

## Was ausdrücklich isoliert bleibt

Diese Messung betrifft die Bossarena. Die sieben Wächter, Reisewege und Beuteaufnahme werden vor dem Pull entfernt beziehungsweise nicht gespielt. Der Eingang wird durch die wirklichen Linsen-/Belegungsmechanismen geöffnet, aber die Figuren werden zur Vorbereitung an die betreffenden Objekte gestellt. Das ist kein vollständig durchlaufener Dungeon. Erst ab dem Pull gibt es keinerlei direkte Positionskorrekturen.

Der Bot ist ein reproduzierbarer Prüfer, keine optimale Strategie aller Builds. Ein fehlgeschlagener Lauf kann aus falscher Zielwahl, einem schlechten Laufweg, einer verpassten Wiederbelebung oder unzureichender Koordination des Controllers entstehen. Er beweist dann keine generelle Unmöglichkeit des Raids. Ebenso beweist ein Sieg weder menschlichen Spielspaß noch fairen Schwierigkeitsgrad.

## Unveränderte V8-Basis

Als Vergleich dient die unveränderte V8-Quellfassung von Git-Commit `35c17a0b0204b4d1d7f104e5de7579359bb87146`. Der lokale Vergleichscheckout `a00db5f04df40606bf43ae0b28a8c8929fe4d615` besitzt exakt denselben Quellbaum. Die erste vollständige Kontrolle hat eine reale Balance-Lücke gezeigt: Gute legale sieben-Slot-Builds spielen die Bosse wesentlich schneller und sicherer als ältere Drei-Slot-Modelle erwarten. Eine koordinierte reine Schadensgruppe konnte ebenfalls gewinnen. Ignorierte Sammelwarnungen waren dagegen tödlich. Schwierigkeit bestand damit überwiegend in einer binären Sammelregel; nachhaltiger Heilungsdruck und genügend Zeit für unterschiedliche Aufgaben fehlten.

| Raid / legale Stufe | V8-Bossleben | Rollenmix | Nur Waldläufer | Schildfenster beim Rollenmix | HP-Schaden im Rollenmix insgesamt |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sturmzitadelle / 75 | 125.000 | 48,60 s, Sieg | 47,72 s, Sieg | 3 | 492 |
| Nachtschlund / 90 | 245.000 | 30,16 s, Sieg | 24,68 s, Sieg | 3 | 687 |
| Weltenkern / 100 | 850.000 | 78,72 s, Sieg | 36,68 s, Sieg | 4 | 1.590 |

Alle sechs reaktiven V8-Gruppen bleiben vollständig am Leben. Die drei Rollenmix-Gruppen verbrauchen keine Tränke. Stationäres Ignorieren der ersten Sammelwarnung führt bei allen drei Gruppen zum vollständigen Wipe nach 4,2 bis 4,4 Sekunden. Diese Zeiten enthalten keine Dungeonwege, Wächter oder Gruppensuche.

Der reale erste Sturmabschluss bezahlt 360.000 EP je Figur: 180.000 für den Boss und 180.000 für den Abschluss. Unter der jetzigen grauen Kill-EP-Regel, unveränderter Abschlussprämie und angenommen gleichbleibender Bossdauer benötigt eine illustrative Stufe-75→100-Wiederholung 61 Abschlüsse. Die gemessenen 48,60 Bosssekunden ergeben zusammen mit angenommenen fünf beziehungsweise zehn Minuten zusätzlichem Laufaufwand 5,91 beziehungsweise 10,99 Stunden. Das ist keine vollständig gespielte Route. Es zeigt jedoch, warum längere Bosskämpfe allein den 200-Stunden-Inhaltsanspruch nicht beweisen können; Wiederholungsprämien und sinnvolle Entwicklung jenseits des Levelbalkens müssen zusammen betrachtet werden.

## V9: gemessene Rollenbeiträge und echte Aufgaben

Die Schlussmatrix verwendet die stabilisierte Fassung einschließlich des gemeinsamen Kampfbelebungspools und der gesperrten Selbst-Rückkehr während eines laufenden Raidversuchs. Gefallene Figuren behalten in dieser Probe dieselbe absolute Uhr wie der echte Multiplayer-Server. Die reale Interaktion wird ausgewertet: Bei mehreren nahen Gefallenen zählt der Zähler jeden tatsächlich erfolgten Todeszustandswechsel; große und kleine Heiltränke werden getrennt gezählt.

Die Raidbudgets wurden auf 500.000 / 980.000 / 1.700.000 Leben angepasst. Die gezielten, vor dem Einschlag eingefrorenen Mechaniken ergänzen die vorhandenen Sammel-/Verteilungsregeln. Ab 65 Prozent Bossleben kündigt eine eigene Warnung die Unterstützungsbelastung an: 35 Prozent des maximalen Lebens im Abstand von zehn Sekunden; unter 30 Prozent 40 Prozent im Abstand von acht Sekunden. Die Warnung dauert 1,8 Sekunden, normale Schilde wirken, eine Rolle allein umgeht diese Belastung nicht. Dadurch entstehen längere Phasen mit echten Schutz-, Heil- und Versorgungsentscheidungen.

| Raid | V9-Rollenmix / Ergebnis | Erlebte Phasen | Schildfenster | Einzigartige Mechaniken wirklich aufgelöst | Lastimpulse wirklich aufgelöst | Zusatzziele zerstört |
| --- | ---: | --- | ---: | --- | ---: | ---: |
| Sturmzitadelle | 186,12 s / Sieg | 1, 2, 3 | 11 | 6 Sturmschneiden, 6 Sturmaugen | 10 | — |
| Nachtschlund | 122,72 s / Sieg | 1, 2, 3 | 10 | 4 Blicke, 4 Seelenrufe | 7 | 8 von 8 Seelen |
| Weltenkern | 132,40 s / Sieg | 1, 2, 3 | 9 | 4 Spektren, 4 Ankerrufe | 9 | 16 von 16 Ankern |

Alle Rollenmix-Gruppen gewinnen mit allen erforderlichen Figuren am Leben und ohne Tod oder Wiederbelebung. Beim Sturm ist noch eine siebte Sturmschneide angekündigt, als der Boss fällt; sie wird deshalb nicht als aufgelöster Angriff gezählt. Erledigte Ziele verursachen keine Ablaufexplosion, lassen keine farmbare Beute fallen und ersetzen keine menschlichen Siegelhalter.

| Raid / Rollenmix | Verlust an HP kumuliert | Durch Schilde absorbiert | Wirkliche Heilung durch Fähigkeiten / Lebensraub | Große Heiltränke | Große Manatränke |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sturmzitadelle | 13.611 | 20.319 | 13.076 | 0 | 1 |
| Nachtschlund | 17.936 | 16.689 | 11.745 | 6 | 1 |
| Weltenkern | 37.029 | 50.467 | 35.414 | 1 | 2 |

Kumulierte Werte können das maximale Leben einer Figur mehrfach übersteigen: Es wird wirklich geheilt beziehungsweise ein neues Schild gewirkt. Die Tabelle zählt tatsächlich wiederhergestelltes Leben, keinen theoretischen Heilwert und keine überschüssige Heilung. Trankheilung steht separat im Verbrauch und wird nicht in der Fähigkeitsspalte versteckt. In V8 war dieser anhaltende Schutz- und Heilungsbeitrag in der gleichen Probe kaum nötig.

## Rollenwahl, Vorräte und Wiederbelebung

Es gibt keine künstliche Pflichtklasse. Die reine Waldläufergruppe gewinnt bei präziser Koordination mit bereitgestellten Vorräten schneller, bezahlt dafür aber deutlich mehr Heiltränke:

| Raid | Nur Waldläufer / Siegzeit | Große Heiltränke insgesamt | Große Heiltränke im Rollenmix |
| --- | ---: | ---: | ---: |
| Sturmzitadelle | 94,44 s | 10 | 0 |
| Nachtschlund | 99,56 s | 16 | 6 |
| Weltenkern | 91,96 s | 32 | 1 |

Die zweite Versorgungsprobe entfernt alle bereitgestellten großen Heil- und Manatränke. Nur die fünf kleinen originalen Starttränke je Figur bleiben erhalten. Der gleiche Rollenmix gewinnt alle Raids ohne Tod: Sturm 193,24 Sekunden, Nacht 126,04 Sekunden, Weltenkern 132,68 Sekunden. Der gemeinsame Kampfbelebungspool erlaubt während eines Versuchs genau eine, zwei beziehungsweise drei Rettungen, geteilt durch E-Interaktionen und erlernte Wiederbelebungsfähigkeiten. Ohne diese Grenze hatten vorläufige reine Schadensgruppen sehr viele sofortige Rettungen anstelle von Schutz und Heilung benutzt; diese Vorproben sind kein endgültiger Serververgleich.

| Reine Waldläufer ohne große Vorräte | Ergebnis / aktive Kampfzeit | Höchster zuvor entfernter Bossanteil | Wirkliche Kampfbelebungen / Vorrat | Verweigerte Selbst-Rückkehr bei einzelnen Toden |
| --- | --- | ---: | ---: | ---: |
| Sturmzitadelle | Vollständiger Wipe / 77,80 s | 80,18 % | 0 / 1 | 0 |
| Nachtschlund | Vollständiger Wipe / 99,96 s | 87,70 % | 2 / 2 | 4 |
| Weltenkern | Vollständiger Wipe / 99,80 s | 84,49 % | 3 / 3 | 10 |

Die Rettungen laufen über normale Wege und `action('interact')`. Nacht und Weltenkern schöpfen den Vorrat vollständig aus; weitere Belebungen werden verweigert. Beim Sturm fällt die ganze Gruppe, bevor eine Einzelrettung möglich ist. Ein einzelner gefallener Charakter kann den Pool auch nicht durch kostenlose Selbst-Rückkehr am Eingang umgehen. Nach jedem dieser vollständigen Wipes steht der Boss wieder bei vollem Leben und der Poolzähler bei null. Außerhalb des laufenden Bossversuchs ist normale Rückkehr weiterhin verfügbar. Der Audit zählt teilweise überlebende Gruppen nach 30 Sekunden ohne Bossverletzung ausdrücklich als Controller-Abbruch, nicht als vollständigen Wipe; keiner der drei obigen Läufe gehört zu dieser Kategorie.

Damit sind Versorgung und Rettungsentscheidungen relevant, **verbindlicher Heilerbedarf ist trotzdem nicht belegt**. Gut versorgte reine Schadensgruppen können gewinnen; das Scheitern eines Controllers beweist keine Unmöglichkeit anderer Strategien. Ein verletzbarer Wiederbelebungskanal ist weiterhin nicht implementiert. Die gegenwärtige E-Rettung stellt sofort 40 Prozent maximales Leben wieder her, verbraucht im laufenden Raid aber eine der gemeinsamen Kampfbelebungen.

Die stationären V9-Gruppen ignorieren weiterhin die erste Sammelwarnung und sterben nach 4,2 bis 4,4 Sekunden. Nach dem vollständigen Wipe ist der Boss wieder bei vollem Leben, seine Warnungen und Ziele sind aufgeräumt, die Kampfuhr beginnt für einen neuen Versuch neu. Das Gate bleibt gelöst. Dieser Rücksatz verhindert stückweises Heruntersterben eines Raidbosses.

Die illustrative EP-Wiederholung bleibt trotz des längeren Sturmfights weit unter dem 200-Stunden-Ziel: bei konstant angenommenen 186,12 Bosssekunden sind 61 Abschlüsse von Stufe 75 bis 100 weiterhin 8,24 beziehungsweise 13,32 Modellstunden mit angenommenen fünf beziehungsweise zehn Minuten Zusatzaufwand je Lauf. Die Kampagne, Gruppensuche, Beuteentwicklung und ein abwechslungsreiches Endgame wurden damit nicht durchgespielt.

## Sichtbare Browserprüfung

Die ergänzende Prüfung benutzt normale Browseroberflächen mit HTTP/SSE gegen einen isolierten lokalen Spielserver auf Port 4175, ohne persistente Spielerdateien und ohne automatische Ticks. Die vorbereiteten Figuren besitzen legale Stufe-100-Builds und sieben Rare-Teile. Einlass und Wächter sind vorab isoliert; die aufgenommenen Warnungen entstehen anschließend durch native Hub-Schritte von 0,04 Sekunden und werden für die Aufnahme angehalten. Es sind Aufnahmen einer echten Spieloberfläche, keine eingesetzten Entwurfsbilder und kein vollständig von Menschen gespielter Raid.

Sturmwarnungen, Unterstützungsanzeige und Touchaktionen wurden bei 390 × 844 sowie 844 × 390 CSS-Pixeln ohne horizontalen Seitenüberlauf geprüft: [Sturm im Hochformat](qa/raid-v9-storm-mobile.png), [Unterstützungswarnung im Hochformat](qa/raid-v9-support-mobile.png), [Unterstützungswarnung im Querformat](qa/raid-v9-support-landscape.png). Dies ist ein Browser-Viewport-Test; reale Smartphone-Geräte, gleichzeitige Finger und Bildraten werden daraus nicht abgeleitet.

Die [Desktopaufnahme des Weltenkerns](qa/raid-v9-eon-desktop.png) bei 1280 × 800 zeigt acht unterschiedliche Klassenfiguren und die beiden sicheren Spektrumlücken. Die [mobile Aufnahme nach Gruppenwiederaufnahme](qa/raid-v9-resume-mobile.png) zeigt sichtbar „Warte auf Raidgruppe · 1/8“ und die pausierte Kampfzeit. Die sichtbare Wiederaufnahmeansicht ergänzt die separat geprüften Serverregeln; eine einzelne angehaltene Aufnahme belegt für sich weder Echtzeitkoordination noch korrekte Zeitfortschreibung.

## Automatischer Abschlusscheck

Die endgültige Fassung besteht am 14. Oktober 2026 alle **834 Tests** und `npm run build`. Neue Prüfungen decken native Bosswirkungen, die begrenzte Kampfbelebung, atomaren Import, alte Lebensbudget-Migration, identische Treffer-/Warnungsformen und tatsächliche HTTP/SSE-Sitzungen ab. Laufende einzigartige und gemeinsame Warnungen, räumlich ausgeblendete portable Bossdaten, gespeicherte gefallene Figuren, ihre Positionen und unmittelbare Wipe-Persistenz wurden nach echten Hub-Neustarts geprüft. Die 25 vorhandenen Assetnachweise stimmen mit ihren Dateien überein. Diese Prüfungen bestätigen die benannten Abläufe; sie bestätigen keine menschliche Raidkoordination oder abgeschlossene Langzeitbalance.

## Offene Qualitätsanforderungen

Ein belastbarer nächster Gruppentest muss Meilensteinzeiten, Fehlversuche, Heilungsbedarf, Rollenbeiträge, Gründe für Niederlagen und freiwillige Wiederholungen erfassen. Insbesondere Builds mit legendärer Ausrüstung, maximalen Upgrades, Sockeln, Gefährten und höheren Dungeontiefen sind durch diese Rare-/Tier-1-Probe nicht abgedeckt.

Der aktuelle Kampagnenplan besitzt weiterhin `targetHours: 200` und `verifiedHours: 0`. Drei gemessene Bosskämpfe und wiederholbare Belohnungen können diese Lücke nicht schließen. Die EP-Kurve künstlich zu verlängern wäre kein Beleg für 200 Stunden abwechslungsreichen Inhalt. Notwendig bleiben vollständige Spielrouten mit interessanten Entscheidungen, nachvollziehbarer Ausrüstungsentwicklung, wechselnden Gruppenaufgaben und dokumentierter menschlicher Spielzeit.

# V10: Raidprobe mit erlernten Technikprägungen

Am 14. Oktober 2026 wurden alle drei Raids jeweils ohne Prägung und mit den beiden Klassenvarianten vollständig gegen die native `Game`-Simulation geprüft. Alle neun Rollenmix-Gruppen siegen mit allen erforderlichen Figuren am Leben. Die Varianten erhalten Schaden, Schutz, Heilung und echte Aufgaben; keine der beiden gleichzeitig gewählten Gruppenvarianten gewinnt den Zeitvergleich in allen drei Raids. Dies beweist weder optimale Einzelklassenbalance noch menschliche Raidqualität oder 200 Stunden Spielumfang.

## Gleiche Bedingungen und Reproduktion

```sh
node tests/scripts/raid-v9-gameplay-audit.mjs --mode reactive --team balanced --supplies 20 --out /private/tmp/emberfall-v10-raids-base.json
node tests/scripts/raid-v9-gameplay-audit.mjs --mode reactive --team balanced --supplies 20 --technique-variant 0 --out /private/tmp/emberfall-v10-raids-technique-0.json
node tests/scripts/raid-v9-gameplay-audit.mjs --mode reactive --team balanced --supplies 20 --technique-variant 1 --out /private/tmp/emberfall-v10-raids-technique-1.json
```

Sturm verwendet Wächter, Paladin und Waldläufer auf Stufe 75; Nacht Wächter, Druide, Waldläufer und Flammenrufer auf Stufe 90; Weltenkern alle acht unterschiedlichen Klassen auf Stufe 100. Jede Figur besitzt sieben legal erzeugte und angelegte Rare-Teile, exakt `2 × Stufe` natürlich verfügbare Lernpunkte und dieselben Talententscheidungen/Aktionsbelegungen in ihren drei Vergleichsläufen. Der Zufallsstart bleibt `481 + Figurenindex × 71`. Die fünf kleinen Starttränke und je 20 große Heil-/Manatränke sind ausdrücklich bereitgestellte Vorräte; in diesen neun Läufen werden keine kleinen Heiltränke verbraucht. Legendäre Relikte, Upgrades, Sockel und Gefährten sind nicht enthalten.

Für einen Variantenlauf erhält jede Figur vor dem Pull **12 Fixture-Quellensiegel**. Sie lernt und wählt ihre Variante über die tatsächlichen `Game.learnTechniqueSpecialization`-/`selectTechniqueSpecialization`-Methoden in der Siedlung. Die Siegel werden dabei regulär bezahlt. Dies ist eine deklarierte Endgame-Freischaltung, kein Beleg für erspielte Siegel oder ihre Beschaffungsdauer. Variante 0/1 bezeichnet jeweils die erste/zweite eigene Variante in `TECHNIQUE_SPECIALIZATIONS`; alle Gruppenfiguren wechseln gleichzeitig.

Der unveränderte reaktive Controller verwendet 0,04-Sekunden-Schritte, normale Bewegungstasten, echte Aktionen, Trankverbrauch und den serverüblichen Blickwinkel mit einem Zielpunkt 100 Einheiten vor der Figur. Nach dem Pull gibt es keine Positionskorrektur, manuelle HP-/Manaänderung, Cooldown-Rücksetzung oder direkte Bossverletzung. Der Boss behält seine kanonischen maximalen HP während des ganzen Laufs. Nur der Weg zur Arena wird isoliert: sechs ursprüngliche Wächter fehlen vor dem Pull, sämtliche sechs kanonischen V10-Wegwächter bleiben außerhalb der Arena erhalten. Die alten Linsen-/Belegungsrätsel werden mit echten Interaktionen gelöst, ihre Vorbereitungspositionen werden gesetzt. Die V10-Wegkammern werden in dieser Bossprobe nicht absolviert.

## Tatsächliche Ergebnisse

„Groß H/M“ zählt tatsächlich verbrauchte große Heil-/Manatränke der ganzen Gruppe. Kumulierte HP-Verluste und Heilung sind auf ganze Punkte gerundet; Heilung zählt wiederhergestelltes Leben über Fähigkeiten/Lebensraub ohne überschüssige Heilung und ohne Trankheilung. Absorption ist wirklich abgefangener Schaden, keine theoretische Schildsumme.

| Raid / Prägung | Siegzeit | Lebend | Schildfenster | HP-Verlust | Schildabsorption | Heilung | Groß H/M |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Sturm / keine | 186,12 s | 3/3 | 11 | 13.611 | 20.319 | 13.076 | 0 / 1 |
| Sturm / Variante 0 | 217,32 s | 3/3 | 12 | 18.237 | 19.017 | 16.431 | 2 / 2 |
| Sturm / Variante 1 | 205,68 s | 3/3 | 12 | 20.175 | 19.595 | 17.775 | 3 / 1 |
| Nacht / keine | 122,72 s | 4/4 | 10 | 17.936 | 16.689 | 11.745 | 6 / 1 |
| Nacht / Variante 0 | 122,72 s | 4/4 | 10 | 18.368 | 15.176 | 13.198 | 6 / 1 |
| Nacht / Variante 1 | 129,16 s | 4/4 | 11 | 18.105 | 16.678 | 11.192 | 8 / 1 |
| Weltenkern / keine | 132,40 s | 8/8 | 9 | 37.029 | 50.467 | 35.414 | 1 / 2 |
| Weltenkern / Variante 0 | 152,04 s | 8/8 | 9 | 52.734 | 44.494 | 49.534 | 4 / 4 |
| Weltenkern / Variante 1 | 107,24 s | 8/8 | 8 | 32.405 | 29.598 | 31.771 | 0 / 2 |

Keiner der neun Läufe enthält einen Tod oder eine Kampfbelebung; alle erreichen Phase 1, 2 und 3. Die Bossbudgets bleiben 500.000 / 980.000 / 1.700.000 HP. Die drei ungeprägten Ergebnisse reproduzieren die V9-Zeiten exakt.

| Raid / Prägung | Einzigartige Angriffe wirklich aufgelöst | Lastimpulse | Erschienene Zusatzziele wirklich zerstört |
| --- | --- | ---: | ---: |
| Sturm / keine | 6 Sturmschneiden, 6 Sturmaugen | 10 | — |
| Sturm / Variante 0 | 8 Sturmschneiden, 7 Sturmaugen | 11 | — |
| Sturm / Variante 1 | 7 Sturmschneiden, 7 Sturmaugen | 12 | — |
| Nacht / keine | 4 Blicke, 4 Seelenrufe | 7 | 8/8 |
| Nacht / Variante 0 | 4 Blicke, 4 Seelenrufe | 7 | 8/8 |
| Nacht / Variante 1 | 5 Blicke, 4 Seelenrufe | 7 | 8/8 |
| Weltenkern / keine | 4 Spektren, 4 Ankerrufe | 9 | 16/16 |
| Weltenkern / Variante 0 | 5 Spektren, 4 Ankerrufe | 10 | 16/16 |
| Weltenkern / Variante 1 | 3 Spektren, 3 Ankerrufe | 6 | 12/12 |

Bereits angekündigte, aber durch den Bosskill nicht mehr aufgelöste Angriffe zählen hier nicht. Der kürzere Weltenkernlauf mit Variante 1 ist **19,00 Prozent schneller** und erlebt eine Ankerwelle weniger; er überspringt weder alle Aufgaben noch den Schutz-/Heilungsdruck. Gleichzeitig dauert Sturm mit derselben Gruppenwahl 10,51 Prozent länger und benötigt drei zusätzliche große Heiltränke. Deshalb ergibt sich aus diesen Läufen kein universeller Gewinner. Die kürzere Weltenkernzeit verdient eine gezielte Prüfung einzelner Klassenvarianten und menschlicher Gruppen; bloß alle Varianten gemeinsam zurückzusetzen wäre durch diese Probe nicht begründet.

Die Unterstützungsbeiträge bleiben messbar: Im Weltenkern heilt der Paladin ohne Prägung 21.376, mit Weitem Licht 30.395 und mit Nahem Eid 16.444 tatsächliche HP. Der Druide heilt 12.182 / 17.391 / 12.115. Diese Werte entstehen bei unterschiedlichen Kampfdauern, Positionen und Gefahrenfolgen und sind deshalb keine isolierten Effizienzquotienten. Die Schutz-/Heilradien und Zeitfenster erklären Entscheidungen, erlauben aus dieser Gruppenprobe aber keine Aussage, dass eine einzelne Prägung in jeder Formation stärker wäre.

## Speicher- und Belohnungskontrolle

Die ergänzende native Prüfung besteht alle **31 Tests** aus `technique-specializations`, `technique-runtime-v10`, `dungeon-save-v10` und `dungeon-progression-v10`. Die Laufzeitfälle verwenden tatsächliche Q/F-Aktionen für alle 16 Prägungen einschließlich Kosten, Durchdringung, Heilreichweite, Frostwirkung, Dienertakt und gültigen Cooldowns. Sie prüfen auch das Entfernen einer Prägung mit noch laufender längerer Pause, alten V9-Import, atomare Ablehnung fremder/ungelernter Prägungen und ruhende Wirkung im PvP. Es sind erklärte Trainings-/Checkpointfixtures, keine zusätzlich durchgespielten Raids.

Read-only geprüft wurde die Verkabelung in `Game.capture`/`applySave`/`updateWorld` sowie `dungeon-routes`: Layoutmetadaten fehlen bei alten Reisen ausdrücklich zugunsten der alten 1.500-Einheiten-Karte; V10 rekonstruiert kanonische 3.840-Einheiten-Karten und vollständige Wachtgruppen. Unverdiente Routekisten, fehlende Wächter und unzulässige Reisezeiten werden vor `initialize` abgewiesen. Laufende Staffeln und Wandelgangtreffer bleiben erhalten. Die Cooldown-Speicherschranke berücksichtigt jede erlernte Variante, auch bei inzwischen leerem aktivem Slot.

Quellensiegel aus Routekammern werden erst beim tatsächlichen Bossabschluss bezahlt, persönlich über `route-sigil:<Kammer>:tier-<Tiefe>` belegt und gespeichert. Ein Abbruch bezahlt keine Route-Siegel; der gleiche persönliche Kammer-/Tiefenbeleg bezahlt beim nächsten Abschluss nicht erneut, eine neue Tiefe besitzt einen eigenen Beleg. Die native Bonusprobe bestätigt drei Siegel je Gruppenfigur für den ersten Raidabschluss mit zwei Wachtkammern, danach nur die reguläre Abschlussprämie bei derselben Tiefe. Sie bereitet besiegte kanonische Gegner ausdrücklich vor und misst damit Belohnungszustellung, keine Kampfdauer.

Die breitere Rückwärtskompatibilitätsprüfung fand zwei zusätzliche Probleme: Eine alte V1-Reise ohne `classId` benötigte bei der Prägungsvalidierung den bestehenden kanonischen Klassenstandard; neue Inschriften-/Wachtzeichenobjekte benötigten einen ausdrücklich initialisierten `active: false`-Status für identische Speicher-Rundläufe. Beide Korrekturen gehören zur hier erneut geprüften Fassung. Alle neun Raids und die 31 benannten Prägungs-/Save-/Bonusprüfungen wurden danach neu ausgeführt; die Kampfzahlen blieben identisch. Zwei ergänzende native Direktproben bestätigen außerdem den V1-Import ohne Klassenkennung als Wächter mit leerer Prägung sowie identische anfängliche Speicherzustände aller 21 Rätselobjekte im neuen Wurzelgewölbe nach Laden. Diese gezielte Prüfung ersetzt die separate vollständige Testsuite nicht.

## Prüfstand und Quellenhashes

Die abschließenden Läufe vom 14. Oktober 2026, 10:43 UTC, verwenden den lokalen, noch uncommitteten V10-Arbeitsstand über Git-HEAD `271bd8e18986278691f5449b8c5a9477cf1d755a`, einschließlich der beiden genannten Speicherkompatibilitätskorrekturen. Die folgenden SHA-256-Werte wurden unmittelbar vor den drei gestarteten Vergleichsprozessen und nach deren erfolgreichem Abschluss geprüft; alle 13 Dateien blieben identisch. Eine spätere Änderung dieser Quellen benötigt eine neue Bewertung, bevor diese Zahlen als Nachweis für die geänderte Fassung dienen.

| Quelle | SHA-256 |
| --- | --- |
| `tests/scripts/raid-v9-gameplay-audit.mjs` | `798d428078cfc38a99b4b1559cb6a848c38667976203a9f64c33300cf72ca2dd` |
| `src/game.js` | `03f713b8b2e6defdedf13b2005848f33b820f532af982914ae4c816a39979fff` |
| `src/technique-specializations.js` | `939d9a16de7b1895ae1b256f6a0fab63831938efe107383b7ee3e4bbd82ef964` |
| `src/raid-encounters.js` | `ca25f786089bf2297519f8fd4a94d1e2c5507045f5e3832efbff65820e4d0da4` |
| `src/dungeons.js` | `bafbdfbc7f7928c863590bc2fec007ba21ab8e0eec29a81fba92d301c4077bf9` |
| `src/dungeon-routes.js` | `6d132d1622b7922dbda410739934f274859c66957e0da27b7e784db63167197f` |
| `src/balance.js` | `d7965f6fce6c4561c9deee8128a9d25203acabaf35b963a1932bea5fe52fe0a5` |
| `src/classes.js` | `5f09a516671dddad1de887ab41f502d2f5d7399311923f826029223965c54a23` |
| `src/abilities.js` | `2f122a56c3bf88ef2ba850566234bc6f63a71bfbf2b0acaa1f96dca34c65cd75` |
| `src/loot.js` | `b511ebe70db988b4d6024a40f6f182185f86df99d313ea8ff52ae26379efdca1` |
| `src/equipment-system.js` | `a4bb13c32aec84f2953bf62023ba7914a3cbe2deaca8f73514f8c59258e07132` |
| `src/encounter-geometry.js` | `3055289dda061f467f25ab7d1ca73e1ecb345599e99869a9709798f36f6ad77d` |
| `src/progression.js` | `b1a7a8e536314e503902af4d2848e50f0781ab75e3f94573b0d7c29825d4c0ab` |

Die drei vollständigen JSON-Rohberichte und beide Hashlisten bleiben unter den oben genannten `/private/tmp`-Pfaden, der native Testbericht unter `/private/tmp/emberfall-v10-raid-review-tests.log`. Sie enthalten pro Figur konkrete Ausrüstung, Lernetat, Schaden, Absorption, Heilung, Vorräte und aktive Prägung sowie sämtliche Warnungsfolgen.

## Größte offene Anforderung

Ein sicher reagierender nativer Controller mit bereitgestellten Vorräten ist kein menschlicher Gruppentest. Internetlatenz, mobile Bedienung, Fehler, Gruppensuche, reale Beschaffung, legendäre Ausrüstung, Sockel, Upgrades und höhere Tiefen sind hier ungemessen. Insbesondere bestätigt diese Rare-/Tiefe-1-Matrix weder eine verbindliche Heilerpflicht noch Balance sämtlicher Kombinationen. Der Controller behält seine ursprünglichen Heil-/Aktionsheuristiken, statt jede neue Reichweite und Dauer optimal auszunutzen; veränderte Aktionszahlen können außerdem den gemeinsamen Zufallsverbrauch und spätere Mechanikfolgen verschieben. Ursache-Wirkungszuordnung zu einer einzelnen Prägung braucht separate Paarvergleiche.

Der größte offene Produktmangel bleibt der unbewiesene Umfang interessanter Langzeitentwicklung. `verifiedHours: 0` wird durch diese Kämpfe nicht geändert. Für mindestens 200 sinnvolle Stunden braucht Emberfall zusammenhängende abwechslungsreiche Spielrouten und dokumentierte echte Spielzeit. Auch mehr Wege, erlernbare Varianten und neun vollständige Bossproben schließen diese Anforderung nicht.

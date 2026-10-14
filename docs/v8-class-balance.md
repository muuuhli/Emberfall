# V8: Klassen- und Statvergleich

Die Änderung in `src/balance.js` begrenzt passiven Lebensraub auf 8 %. Die gemeinsame Heilungsgrenze eines Spielers beträgt 2 % seines maximalen Lebens pro aktiver Spielsekunde; höchstens eine Sekunde Guthaben bleibt verfügbar. Eigene Treffer, Flächentreffer, periodischer Schaden und Diener teilen dieses Guthaben. Dungeon-Eintritt, Rückkehr und Neuladen füllen es nicht neu auf. Der optionale Speicherwert `leechCredit` enthält nur den endlichen Restanteil 0..1; alte Spielstände ohne diesen Wert erhalten ihr einmaliges Anfangsguthaben. Direkte Klassenheilung, Entzug und Gruppenheilung bleiben eigene Mechaniken. Trefferpausen von 0,24 s vor Stufe 12 und 0,16 s danach gelten pro Angreifer; ausdrücklich ausgelöste Ausweichimmunität bleibt separat.

Kritische Treffer, Abklingzeiten, Ausweichzeiten, Rüstung, Klassenfaktoren und Beuteversion 2 bleiben unverändert. PvP verwendet weiterhin die gesonderten, identischen Arenawerte ohne Lebensraub.

## Messverfahren

Die unveränderte Basis ist Commit `d6fc0b0`. Der Vergleich umfasst 432 legale Aufbauten: acht Klassen, Stufen 1/10/25/50/75/100, gewöhnliche/seltene/legendäre Ausrüstung und drei Klassenwege. Der natürliche Punktetat beträgt `2 × Stufe`, also 200 Punkte auf Stufe 100. Jeder Rang und jede aktive Fähigkeit wurde über die echten Lern-, Voraussetzungs- und Ausschlussregeln erworben. Auf Stufe 100 bleiben bei manchen Aufbauten ein Punkt ungenutzt; es gibt keine zusätzlichen Questpunkte.

Die Ausrüstung besteht aus tatsächlich erzeugten und angelegten, stufengerechten Gegenständen in den verfügbaren sieben Slots. Waffen und Talismane bedienen den primären Angriffswert. Wächter/Paladin erhalten schwere Rüstung, Waldläufer/Nachtklinge mobile Rüstung und die vier Zauberklassen Ritualrüstung. Zufällige kanonische Setzuordnungen bleiben bestehen und sind im Rohbericht verzeichnet. Aufwertungen, Sockelsteine, Nahrung, Berufe und Gefährten werden nicht ergänzt.

Jeder Aufbau kämpft über die echte `Game`-Simulation gegen einen Gegner sowie Gruppen von drei und acht Gegnern: 1.296 Kämpfe. Weitere 96 Kämpfe testen seltene Ausrüstung auf Stufen 50 und 100 mit einer Steuerung, die echte Warnflächen und nahe Geschosse erkennt und ausweicht. Bewegung, Ziele, Angriffe, erlernte Fähigkeiten, Mana und Abklingzeiten laufen regulär. Gegner werden kanonisch aus dem Bestiarium erzeugt; ihre Lebens- und Schadenswerte werden nicht reduziert. Belohnungsfreie Fixtures halten die Charakterstufe während der Messung konstant. Auch tatsächlich herbeigerufene feindliche Diener müssen besiegt werden.

Die stationäre Steuerung ignoriert Warnungen; die zweite Steuerung weicht ihnen aus. Beide sind deterministische Simulationssteuerungen, keine menschlichen Spieltests. Das Zeitlimit beträgt 60 aktive Sekunden. Die kollisionsarme Messarena entfernt Umgebungsaktionen; natürliche Gegnergruppen, Bossmechaniken, Dungeonwege und Raidfenster werden in der separaten Gameplay-Matrix geprüft. `estimateCombat` ist ausschließlich eine analytische Basisaktionsschätzung mit 70 % Angriffszeit; sie ersetzt diese tatsächlichen Kampfwerte nicht.

Die Baseline und der integrierte Nachvergleich verwenden identische Gegenstände, Talentränge, aktive Slots und Zufallsfolgen. Kurzlebige Kampfzustände werden zwischen isolierten Kämpfen zurückgesetzt. Die Rohberichte enthalten SHA-256-Prüfsummen der geladenen Quellen.

## Ergebnis

| Messung | V7-Basis | Nur 8-%-Koeffizient | Integrierte V8-Regeln |
|---|---:|---:|---:|
| Siege gegen einen Gegner | 432/432 | 432/432 | 432/432 |
| Siege gegen drei Gegner | 432/432 | 432/432 | 432/432 |
| Siege gegen acht Gegner, ohne Ausweichen | 421/432 | 421/432 | 386/432 |
| Tode, ohne Ausweichen | 7 | 7 | 43 |
| Lebende Zeitüberschreitungen, ohne Ausweichen | 4 | 4 | 3 |
| Siege mit Warnungsvermeidung | 91/96 | 91/96 | 91/96 |
| Tode mit Warnungsvermeidung | 0 | 0 | 0 |

Der isolierte Koeffizientenvergleich lädt ausschließlich die neue `balance.js` in die eingefrorene V7-Quelle. Im integrierten Vergleich sind zusätzlich die gemeinsamen Lebensraubbudgets, Angreiferpausen, der korrigierte gemeinsame Dienerhöchstwert und die Berücksichtigung des Reichweitennachteils bei erlernten Spottprofilen aktiv. Die Gesamtdifferenz lässt sich daher nicht allein einem einzelnen Faktor zuschreiben. Die Quellenproben bestätigen, dass Angriffe unterschiedlicher Gegner jetzt tatsächlich ankommen; die Ausweichsteuerung bleibt erfolgreich.

Die folgenden Schadenswerte stammen aus seltenen Aufbauten auf Stufe 100 gegen dieselbe Achtgegnergruppe. Die Spanne umfasst die drei Klassenwege und schließt feindliche Diener sowie reguläre Kontroll- und Heilzeiten ein. Sie ist kein stationärer Schadenspuppenwert.

| Klasse | V7 Schaden/s | V8 Schaden/s | V8 Siege mit Warnungsvermeidung |
|---|---:|---:|---:|
| Wächter | 2.037–3.159 | 2.037–3.159 | 0/3, alle drei leben nach 60 s |
| Paladin | 2.936–4.505 | 2.672–4.505 | 3/3 |
| Waldläufer | 1.985–2.967 | 1.834–2.969 | 3/3 |
| Nachtklinge | 3.361–4.379 | 3.361–4.379 | 3/3 |
| Flammenrufer | 2.990–5.852 | 2.990–5.852 | 3/3 |
| Frostweber | 2.846–3.284 | 2.484–3.284 | 3/3 |
| Druide | 1.153–1.683 | 1.154–1.684 | 1/3, zwei leben nach 60 s |
| Schattenbinder | 2.564–3.601 | 2.393–3.138 | 3/3 |

Die Wächter-Zeitüberschreitungen existieren bereits in der Basis: Die Warnungsvermeidung verbringt zu viel Zeit außerhalb der Nahkampfreichweite. Ohne Ausweichen besiegen alle drei Wächteraufbauten dieselbe Gruppe. Daraus wird kein allgemeiner Klassenbuff abgeleitet.

Der Druiden-Wildnisaufbau besiegt die Gruppe ohne Ausweichen in 44,96 s und mit Warnungsvermeidung in 45,12 s. Blüte verwendet unter anderem Wiederbelebung, deren Gruppennutzen im Solotest naturgemäß nicht zum Schaden beiträgt; Mond wählt Heilung und Reichweite mit einem ausdrücklichen Schadensnachteil. Alle Druidenaufbauten besiegen die Ein- und Dreigegnerproben. Diese unterschiedlichen Rollen rechtfertigen keine pauschale Erhöhung aller Druiden-Schadenswerte.

Optimierte Heil-/Schutzaufbauten werden zusätzlich in tatsächlichen Drucktests geprüft. Im isolierten 90-Sekunden-Vergleich halten Wächter und Druide drei Angreifer mit je 100 Rohschaden aus. Die Anforderung erlaubt den nächsten Treffer frühestens nach 0,25 Sekunden; das native 0,04-Sekunden-Raster ergibt hier tatsächlich 0,28 Sekunden zwischen Treffern. Vier Angreifer besiegen die beiden Klassen nach 21,84 bzw. 16,80 Sekunden. Der Schattenbinder fällt bereits gegen drei Quellen nach 8,96 Sekunden. Diese Werte sind kontrollierte Quellenproben mit echter Rüstung und realen Kosten, keine Boss-Siegbehauptung. Sie belegen eine Schutzgrenze nach der Aufteilung der Trefferpausen und begründen vorerst keine weitere globale Heilungs- oder Schildschwächung.

## Prüfnachweise

`node --test tests/v8-combat-balance.test.js tests/balance.test.js` prüft die unveränderten Nebenregeln, alte Rang- und Beutedaten, gemeinsame Lebensraubguthaben und aktive Zeit einschließlich echter Dungeon-Ein-/Austritte und wiederholten Speicher-/Ladevorgängen, atomare Ablehnung ungültiger Speicherwerte, unabhängige direkte Heilung/Entzug, acht gleichzeitige Angreifer, begrenzte Quellenzustände, Ausweichimmunität und unverändertes PvP.

Der unabhängige Messlauf ist als `tests/scripts/v8-class-balance-audit.mjs` im Repository prüfbar. Er benötigt nur Node und die Quellen des gewählten Arbeitsbaums. Aus dem Repository-Stamm lassen sich Basis und aktuelle Fassung mit identischen Regeln vergleichen:

```sh
git worktree add --detach /tmp/emberfall-v7-audit d6fc0b0
node tests/scripts/v8-class-balance-audit.mjs /tmp/emberfall-v7-audit /tmp/emberfall-v7-audit.json all
node tests/scripts/v8-class-balance-audit.mjs . /tmp/emberfall-v8-audit.json all
```

Jeder vollständige Lauf erzeugt 432 Aufbauten und 1.392 native Kämpfe sowie einen separaten `.summary.json`-Bericht. Der optionale Modus `analytic` erzeugt ausschließlich die klar gekennzeichneten analytischen Schätzungen. Für die isolierte Koeffizientenmessung wird eine eigene Kopie der V7-Quellen verwendet und ausschließlich `src/balance.js` durch die aktuelle Fassung ersetzt.

Die eingefrorenen ausführlichen Arbeitsberichte liegen unter `/tmp/emberfall-v8-class-viable-baseline.json`, `/tmp/emberfall-v8-class-cap-only.json` und `/tmp/emberfall-v8-class-final-after.json`. Der endgültige Nachlauf bestätigt die Tabellen nach den Reise-/Speicherbudgetkorrekturen unverändert und enthält deren Quellprüfsummen sowie `COMBAT_SUSTAIN`. Diese Laufzeitberichte werden nicht als Spielstände oder Build-Dateien ins Repository aufgenommen.

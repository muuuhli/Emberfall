# V8: unabhängige native Kampfbalance

Der Ausgangsstand ist Commit `d6fc0b005d523d0f9c8f24c906a96e7ee765c3d4`, unverändert unter `/tmp/emberfall-v8-baseline`. Der Audit lädt jede Fassung aus ihrem eigenen Quellbaum; SHA-256-Fingerprints der tatsächlich verwendeten Kampfmodule und ein Vergleich am Ende erkennen Änderungen während des Laufs. Nach dem gemeinsamen Quellenabschluss wurden 40 Ausgangskämpfe mit denselben 40 V8-Kämpfen verglichen. Beide Quellstände blieben während des Laufs unverändert; auch der SHA-256 des Controllers ist für beide Läufe identisch.

## Verfahren und Grenzen

`tests/scripts/v8-balance-gameplay-audit.mjs` führt 40 native Bossjagden je Fassung aus: alle acht Klassen auf Stufe 100 gegen Asterion, Wächter/Waldläufer auf Stufe 4/12/52 gegen Sivra/Irdan/Vey sowie acht gemischte Klassen und acht Waldläufer gegen Irdan, Vey und Asterion. Jede Kombination hat einen reaktiven und einen unvorsichtigen Controller. Das Skript startet die echten Abenteuer, bindet ihre Runen und wartet auf die tatsächliche Gegnererzeugung. Die gemeinsamen Welt-Updates laufen einmal je Schritt; jede Figur erhält ihren eigenen normalen Spieler-Update.

Der reaktive Controller liest ausschließlich bereits sichtbare, gespeicherte Warnflächen und vorhandene feindliche Geschosse. Er bewegt sich durch normale Tasten, nutzt Ausweichaktionen und bis zu fünf Tränke. Der unvorsichtige Controller verwendet dieselbe offensive Rotation und bevorzugte Angriffsreichweite, ignoriert Warnflächen und verzichtet auf Ausweichen/Tränke. Beide können ihre wirklichen Klassenheilungen, Schilde und gelernten Fähigkeiten einsetzen. Ein Wächter ohne Lebensverlust kann daher viel Schaden mit seinem Schild abgefangen haben; beides wird getrennt erfasst. Prozentwerte sind aufsummierter tatsächlicher Lebensverlust relativ zum anfänglichen maximalen Leben, einschließlich später geheilter Schäden.

Die Figuren tragen tatsächlich erzeugte und über `Game.equip()` angelegte Rare-Ausrüstung. Erlaubt sind 200 verdiente Punkte auf Stufe 100 und `2 × Stufe` darunter; Lernen, Voraussetzungen, Ranggrenzen und exklusive Entscheidungen bleiben nativ. Fehlende frühe Ausrüstungsplätze werden offengelegt. Es gibt keine Relikte, Aufwertungen, Edelsteine oder Reisegefährten. Nur Start-/Runenposition, endliche Vorräte und das Entfernen fremder Umgebungsgegner sind Fixtures. Bäume, Felsen, Fluss, Brücken und die gesamte originale Bossdeckung bleiben vorhanden. Gegnerleben, Schaden, Phasen, Projektile, Treffer, Bewegung und Ergebnisse werden nicht überschrieben; Gegner mit künstlich einem Lebenspunkt werden nie verwendet.

Dies sind reproduzierbare Regressionproben, keine menschlichen Schwierigkeitsurteile. Ein Bot kann eine legal gewinnbare Begegnung verlieren oder günstige Voraussetzungen besser ausnutzen als ein Mensch. Die Prüfung ersetzt deshalb weder menschliche Spieltests noch die getrennten Klassen-, Fähigkeiten-, Dungeon- und Gruppenmatrizen.

## Gemessener Vorher-/Nachher-Vergleich

Alle 20 reaktiven Proben gewinnen in beiden Fassungen. Auch alle 20 unvorsichtigen Proben gewinnen in diesem begrenzten Rare-Benchmark noch; es gibt darin keinen Kampftod. Deshalb belegt die Matrix stärkeren Gruppendruck und erhaltene Ausweichbarkeit, jedoch keine pauschale Unbesiegbarkeit unvorsichtiger Figuren. Die separate Todesregression verwendet tatsächliche Bossangriffe ohne eigene Offensive und prüft die vollständige Rettungskette.

Die acht Einzelklassen gegen Asterion auf Stufe 100 behalten überwiegend ihre bestehenden Zeiten. Die letzte Spalte zeigt den aufsummierten Lebensverlust bei ignorierten Warnungen. Alle dortigen Kämpfe werden mit den tatsächlich verfügbaren Klassenheilungen und Schilden gespielt.

| Klasse | Reaktive Dauer vorher → V8 | V8-Zyklen | Unvorsichtiger HP-Verlust vorher → V8 |
| --- | ---: | ---: | ---: |
| Wächter | 38,28 → 38,72 s | 12 | 0,00 → 0,00 % |
| Paladin | 31,28 → 31,28 s | 10 | 73,10 → 73,10 % |
| Waldläufer | 31,60 → 31,60 s | 10 | 77,20 → 77,20 % |
| Nachtklinge | 23,04 → 23,04 s | 7 | 40,23 → 40,23 % |
| Flammenrufer | 26,16 → 26,16 s | 8 | 65,48 → 65,48 % |
| Frostweber | 30,04 → 30,04 s | 10 | 68,83 → 68,83 % |
| Druide | 38,88 → 38,80 s | 12 | 90,95 → 75,14 % |
| Schattenbinder | 26,76 → 26,76 s | 8 | 72,14 → 72,14 % |

Der V8-Wächter absorbiert unvorsichtig weiterhin echten Schaden über seinen Schild. Fehlender Lebensverlust bedeutet keinen fehlenden gegnerischen Angriff. Die Matrix behauptet deshalb nicht, dass jede Klasse allein gleichermaßen bestraft wird.

| Frühe Solojagd, reaktiv | Wächter vorher → V8 | Waldläufer vorher → V8 | Waldläufer unvorsichtig, V8-HP-Verlust |
| --- | ---: | ---: | ---: |
| Sivra, Stufe 4 | 15,40 → 15,40 s | 9,28 → 9,28 s | 4,07 % |
| Irdan, Stufe 12 | 14,52 → 14,52 s | 9,32 → 9,32 s | 15,91 % |
| Vey, Stufe 52 | 22,16 → 22,16 s | 12,88 → 12,88 s | 11,05 % |

Die frühen Solojagden werden mit diesem Controller nicht allgemein langsamer. Die deutliche Veränderung betrifft die achtköpfigen Gruppen: Frühe Bosse erreichen jetzt ihre tatsächlich angekündigten Angriffe, bevor konzentrierter Gruppenschaden sie besiegt.

| Acht Spieler, reaktiv | Gemischt: Dauer vorher → V8 | Waldläufer: Dauer vorher → V8 | Zyklen vorher → V8, gemischt / Waldläufer |
| --- | ---: | ---: | ---: |
| Irdan, Stufe 12 | 1,04 → 6,72 s | 0,32 → 5,16 s | 0 → 2 / 0 → 2 |
| Vey, Stufe 52 | 1,56 → 8,92 s | 0,88 → 7,48 s | 0 → 3 / 0 → 2 |
| Asterion, Stufe 100 | 3,40 → 17,12 s | 3,44 → 18,44 s | 1 → 5 / 1 → 6 |

Acht unvorsichtige Waldläufer verlieren bei Asterion jetzt zusammen 43,34 % ihres anfänglichen Gruppenlebens statt 4,96 %. Die gemischte unvorsichtige Gruppe verliert dort 4,53 %; ihre wirklichen Schilde und Heilungen bleiben eine erkennbare Stärke. Bei acht Spielern wird das Bossleben mit 4,85 multipliziert, während sein einzelner Schadenswert nicht mit der Gruppengröße multipliziert wird. Der eingefrorene Spawnwert bleibt nach Abreise unverändert.

Dieser Controller lernt zwei legale Aktive und ist dadurch offensiver als die getrennte Gruppenprobe ohne zusätzliche Aktive (deren Irdan/Vey-Ausgangswerte bei acht Waldläufern 0,76/1,32 Sekunden liegen). Die Reihen dürfen nicht vermischt werden. Dieser Vergleich verwendet exakt denselben Controller und dieselbe Ausstattung für seine beiden Quellstände.

## Regressionen und Quellenbudgets

`tests/v8-balance-regressions.test.js` besteht nach Quellenabschluss mit 8/8 Prüfungen. Sie prüfen echte Ausrüstung und Punkte, unveränderte Warngeometrie vor dem ersten Treffer einer voll gesunden Figur, eingefrorene Gruppen-HP nach Abreise, tatsächliche Hex-/Ansturmmarkierungen und den Unterschied zwischen den beiden frühen Kampfstilen. Eine konkrete Kampfregression verhindert, dass acht legal ausgerüstete Waldläufer mit gelernten Aktiven Irdan oder Vey vor jeder aufgelösten Warnung auslöschen. Eine weitere Probe lässt einen vollständig gesunden Stufe-12-Waldläufer durch reale Irdan-Angriffe fallen, ohne den Boss zu beschädigen. Der Geldbeutel von drei Gold ist eine ausdrücklich isolierte Währungsfixture: elf Gold Rettungsgebühr führen zu acht Gold Schuld. Reload bucht keinen zweiten Tod; vier einzelne Goldeinnahmen tilgen zusammen ein Gold Schuld und lassen drei Gold verfügbar. Ein weiterer Save/Reload erhält diesen Tilgungsstand.

Das JSON speichert die tatsächlichen `COMBAT_CAPS`, `COMBAT_SUSTAIN`, `GEAR_STAT_CAPS`, `CLASS_POWER` und `TALENT_COMBAT_BOUNDS` jeder Fassung. Die globale Lebensraubgrenze sinkt von 12 auf 8 %; passive Rückgewinnung ist zusätzlich auf 2 % maximales Leben pro Sekunde mit einem Sekundenbudget begrenzt. Direkte Klassenheilung ist davon getrennt. Neue Schadensquellen haben die tatsächlichen Schonzeiten 0,24 s früh / 0,16 s spät. Kritische Treffer 45 %, Abklingverkürzung 45 %, Ausweichverkürzung 60 % und Tempo 300 bleiben bestehen; Klassenfaktoren und Einzelitemgrenzen bleiben im Report separat ausgewiesen.

Die letzte Netzwerkgrenze überträgt `leechCredit` als numerischen Budgetanteil von 0 bis 1. Der Client stellt ihn über `restoreLeechCredit()` für die normale Welt wieder her, damit Charakterexport und Verbindungswechsel kein verbrauchtes Lebensraubbudget auffüllen. Die native kontinuierliche Kampfmatrix ersetzt diesen separaten Netzwerk-/Exportregressionstest nicht; seine Prüfung liegt bei Root. Der Gesamtbericht hält die zusätzlich gelesenen Netzwerk- und Serverquellhashes getrennt fest.

Die 40 V8-Zeilen bestehen alle Legalitäts-, Warngeometrie-, Ergebnis- und Budgetprüfungen. Gemessene Spitzen sind sechs Beschwörungen, 50 Geschosse und drei gleichzeitige Bossflächen. Diese beobachteten Spitzen sind keine neu erfundenen globalen Spielgrenzen.

## Reproduktion und Artefakte

```sh
node tests/scripts/v8-balance-gameplay-audit.mjs /tmp/emberfall-v8-before-after.json --baseline-root /tmp/emberfall-v8-baseline
node --test tests/v8-balance-regressions.test.js
```

Der gespeicherte abschließende Bericht ist `/workspace/scratch/emberfall-v8-preview/independent-before-after.json`, ergänzt durch die beiden Teilberichte `independent-baseline.json` und `independent-current.json`. Er enthält alle 80 wirklichen Ergebnisse, Warnflächen, akzeptierten Aktionen, Schaden/Schildabsorption, Vorräte, Ausgaben und Quellenbudgets. 17 Ausgangsmodule wurden zusätzlich direkt gegen den angegebenen Git-Commit verglichen, ohne Abweichung. Fingerprints des Abschlusspaars:

- Ausgangsquelle: `a5f0dc1e87ca61e550d42ecca821038a719d9db882d44060ed953a189f656f01`
- V8-Quelle: `2e4e9f6f4ecb7ea957490c64cdf0ede5e59d7405024cb5db8de65e70582f9005`
- Identischer Controller: `cf6b0e01c0e66b991daeadb9be24596406ad05cd3a6ff30d2aeb5763d533c4e5`

# V5: Jagden und tatsächliche Spielproben

Der V5-Jagdzugang verwendet reale Arten und vorhandene regionale Champions. Alle elf Angebote haben tatsächlich gespawnte Gegner in der angegebenen Region. In zwölf isolierten nativen Kampfstichproben auf Stufe 52, 84 und 100 konnten die getesteten Waldläufer ihre Ziele ohne künstliches Töten besiegen. Dies bestätigt keine vollständige Jagd, keinen Kampagnendurchlauf und keine Schwierigkeit für alle acht Klassen.

## Reproduzieren und Grenzen

```sh
node tests/scripts/v5-gameplay-audit.mjs /tmp/emberfall-v5-gameplay-audit.json
node tests/scripts/adventure-playthrough-audit.mjs /tmp/emberfall-v5-baseline-audit.json
```

Die Kampfstichproben benutzen `Game.action`, tatsächliche Bewegungstasten, Projektile, Warnungen, Gegner-KI, Schaden und die reguläre Killwertung. Das Ziel ist jeweils ein bereits erzeugter Weltgegner; seine Region, Stufe, Lebenspunkte und Schäden werden nicht ersetzt. Der Controller entspricht den grundlegenden Abstands-, Angriffs- und Warnreaktionen des V4-Audits. Bei Beschwörungen wählt er den nächsten lebenden Gegner. Er interpretiert nicht jede Projektilbahn oder jeden Ansturmkorridor und benutzt keine zusätzlich erlernten aktiven Techniken.

Explizite Fixtures sind Charakterstufe, sieben deterministische passende Rare-Gegenstände und legale passive Talentkäufe mit höchstens drei Rängen pro Talent. Verfügbare Talentpunkte entsprechen zwei Punkten pro Stufe; viele bleiben ungenutzt. Es gibt keine Relikte, Sockel, Aufwertungen, Meisterschaften oder Begleiter. Fünf passende Heiltränke liegen im Gepäck. Vor jedem einzelnen Kampf werden Leben, Mana und Abklingzeiten wiederhergestellt, die Figur zum Ziel versetzt und Umgebungsgegner sowie Deckung entfernt. Deshalb messen diese Proben einzelne Gegner und keine Reise, Gegnergruppe, Vorratswirtschaft oder kumulative Jagdattrition.

Die Belohnungsprüfung arbeitet separat mit ausdrücklich synthetischen, vertrauenswürdigen Fortschrittszählern. Sie prüft die Zugangsschranken und Währungsumwandlung; daraus wird kein tatsächlicher Dungeon- oder Jagdabschluss abgeleitet. Raidgruppen, PvP-Duelle und die seltenen Reliktdrops wurden in diesem Audit nicht praktisch gespielt.

## Echte Zielstufen und Dungeonzugang

| Jagd | Angebot ab Stufe | Tatsächliche normale Ziele | Tatsächliche Championstufen | Dungeon / erforderliche Tiefe | Gruppe |
|---|---:|---|---|---|---:|
| Wurzelgewölbe | 12 | Steppenräuber 12–15 | Vogelscheuche 13 | Stufe 15 / Tiefe 1 | 1 |
| Salzarchiv | 25 | Gezeitenbrecher 28–31 | Pikenträger 29 | Stufe 30 / Tiefe 1 | 1 |
| Dornenkloster | 36 | Dornenjäger 36–39 | Dornenwitwe 37 | Stufe 42 / Tiefe 1 | 1 |
| Uhrwerk | 50 | Mondkonstrukte 52–55 | Mondblutegel 53 | Stufe 55 / Tiefe 2 | 1 |
| Frostkathedrale | 60 | Gletscherkolosse 60–63 | Eisleiche 61 | Stufe 65 / Tiefe 2 | 1 |
| Sturmzitadelle | 70 | Wiedergänger 68–71 | Grabskorpion 69 | Stufe 75 / Tiefe 2 | 3 |
| Nachtschlund | 85 | Legionäre 84–87 | Blutgeier 85 | Stufe 90 / Tiefe 2 | 4 |
| Weltenkern | 95 | Risshetzer 100 | Abgrundauge 100 | Stufe 100 / Tiefe 2 | 8 |
| Schwarze Jagd: Mondbruch | 52 | Konstrukte 52–55; Blutegel 52–54 | Glockenschläger 55; Seher 52 | Kein Dungeon | 1 |
| Schwarze Jagd: Blutmark | 84 | Legionäre und Blutgeier 84–87 | Leichennäher 87; Kriegsungetüm 84 | Kein Dungeon | 1 |
| Schwarze Jagd: Nexusriss | 100 | Risshetzer und Abgrundaugen 100 | Leerenhenker und Seraph 100 | Kein Dungeon | 1 |

Das Salzarchiv-Angebot ist bereits ab 25 erhältlich, während seine normalen Weltziele erst bei 28 beginnen. Der Weltenkern wird ab 95 angeboten, seine Weltziele sind 100. Das sind höhere Herausforderungen als die reine Angebotsschranke, keine verdeckten Niedrigstufenziele. Die Sturmzitadellen-Weltziele liegen teilweise knapp unter 70; der verpflichtende Stufe-75-Raid verhindert einen rein einfachen Weltfarmabschluss.

Ab Uhrwerk muss vor dem geforderten Tiefe-2-Abschluss zunächst Tiefe 1 gemeistert sein. `enterDungeon` verweigert einen direkten Erstbesuch auf Tiefe 2. Für die drei Raids kommt die echte Gruppengröße hinzu. Ein angenommenes Angebot allein garantiert daher keinen sofort zugänglichen Abschluss. Die V5-Oberfläche nennt die erforderliche Tiefe inzwischen ausdrücklich.

## Gemessene Solo-Kampfstichproben

Die Ausrüstung liefert bei 52 / 84 / 100 rund 416 / 675 / 779 Waffenschaden und 1.571 / 2.236 / 2.588 maximale Lebenspunkte. Die Aktionszahlen im JSON zeigen tatsächliche Basisangriffe und Zauber, keine administrativen Killaufrufe.

| Charakter | Gegner | Gegnerstufe | Leben | Sekunden bis Kill | Ausgeführte Zyklen | Tatsächlich erlittener Schaden |
|---:|---|---:|---:|---:|---:|---:|
| 52 | Mondkonstrukt | 52 | 1.931 | 0,76 | 0 | 0 |
| 52 | Mondblutegel | 52 | 1.019 | 0,28 | 0 | 0 |
| 52 | Glockenschläger-Boss | 55 | 14.955 | 9,40 | 3 | 56 |
| 52 | Seher-Boss | 52 | 7.348 | 4,08 | 1 | 0 |
| 84 | Legionär | 84 | 4.670 | 1,20 | 0 | 0 |
| 84 | Blutgeier | 84 | 2.279 | 0,76 | 0 | 0 |
| 84 | Leichennäher-Boss | 87 | 20.145 | 11,76 | 2 | 0 |
| 84 | Kriegsungetüm-Boss | 84 | 32.053 | 13,72 | 4 | 657 |
| 100 | Risshetzer | 100 | 4.411 | 1,52 | 1 | 174 |
| 100 | Abgrundauge | 100 | 5.303 | 1,72 | 1 | 0 |
| 100 | Leerenhenker-Boss | 100 | 31.954 | 12,24 | 4 | 813 |
| 100 | Seraph-Boss | 100 | 20.873 | 6,24 | 2 | 0 |

Alle drei Jagdzähler stehen danach bei `[1, 1, 1, 1]`: Je eine echte Niederlage beider normaler Arten und beider Champions wurde korrekt erfasst. Die final verlangten drei normalen Kills je Art wurden bewusst nicht durch künstliche Events ergänzt. Kein beobachteter Windup wurde durch ein Leash-Reset abgebrochen; das JSON erfasst diese mögliche Rückstoß-/Kitingwechselwirkung zusätzlich.

Einzelne normale Gegner werden mit diesem ausgerüsteten Profil sehr schnell besiegt. Auch einige Champions sind leichte Beute für den Distanzcontroller, während Ansturm- und Nahkampfziele merkbaren Schaden verursachen. Daraus folgt weder eine Garantie für Solo-Balance noch ein Grund, alle Weltgegner pauschal mit mehr Leben auszustatten. Gruppen, schlechtere Ausrüstung, andere Klassen und zusätzliche aktive Fertigkeiten fehlen in dieser Probe.

## Belohnungsschranke und behobene Spawnreibung

Der zunächst vorhandene Wirtschaftsrandfall war eine tierlose Jagdsiegel-Währung bei Käufen auf der aktuellen Charakterstufe. V5 deckelt inzwischen den Fund auf die höchste freigeschaltete Stufe tatsächlich abgeschlossener Jagden, höchstens die aktuelle Charakterstufe. Die synthetische Gate-Probe reproduziert:

- Eine auf 12 angenommene Wurzelgewölbe-Jagd darf später auf 100 noch beendet werden; erneutes Annehmen derselben frühen Jagd wird verweigert.
- Ausschließlich Wurzelgewölbe-Historie schaltet maximal Stufe 34 frei. Ein seltener Kauf am Stufe-100-Charakter erzeugt tatsächlich einen Stufe-34-Gegenstand; der epische Kauf bleibt gesperrt.
- Nach einem relevanten Nexus-Abschluss wird Stufe 100 freigeschaltet. Aufgesparte, vorher verdiente Siegel dürfen dann eine Stufe-100-Epic kaufen. Das ist ausdrücklich erlaubte Progression, keine vollständig ausgeschlossene Vorratsstrategie.

Der Audit fand zunächst eine konkrete Spawnreibung: Die Blutmark und der Nexusriss enthalten je geforderter normaler Jagdart nur drei dauerhafte Spawns, die Angebote verlangten acht. Mondbruch hat vier Mondblutegel. Das hätte ohne weitere Quellen mehrere Pflicht-Respawnrunden pro Art erzeugt. V5 verlangt deshalb in der finalen Fassung drei normale Kills pro Zielart; Dungeon- und Championziele bleiben bestehen. Die vorhandenen Packs reichen damit für einen ersten normalen Jagddurchgang. Die Zielmengen wurden in der Audit-Metadatei nachgezogen; unveränderte Kämpfe wurden dafür nicht erneut simuliert.

Wiederholungen bleiben begrenzt: normale Feinde kehren erst nach 55 Sekunden und außerhalb von 500 Pixeln Spielerdistanz zurück. Champions benötigen 360 Sekunden und dieselbe Entfernung. Wer beim leeren Championnest stehen bleibt, verhindert dessen Rückkehr. Der Rhythmus ermutigt daher weiterhin zum Wechsel zwischen mehreren Jagden und Weltaktivitäten. Eine sichtbare Rückkehranzeige würde das leichter erklären; die längere Pause blockiert nun keinen erstmaligen Abschluss mehr.

Der bisherige V4-Audit wurde genau einmal gegen V5 ausgeführt: sieben von sieben Prüfungen bestehen. Die sichere/riskante Trauerglocken-Expedition dauert weiterhin 19,28 / 21,00 Sekunden und zeigt jeweils zwei echte Bosszyklen. Die Guardian-Variante dauert 41,00 Sekunden, zeigt sieben Zyklen und neun Ausweichaktionen. Die Anfängerroute und ihre Quest-/Beuteübergabe bleiben funktionsfähig.

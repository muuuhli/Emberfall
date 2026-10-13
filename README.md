# Emberfall – Die letzte Glut

Ein eigenständiges, deutschsprachiges 2D-Action-RPG mit direkter Bewegung, gerichteten Angriffen, Ausweichrollen, Quests, Farming und instanzierter Beute. Die Erweiterung verbindet eine große offene Welt mit acht Klassen, Fortschritt bis Stufe 100 und kooperativen Dungeons auf einem lokalen Spielserver.

**Aktueller Stand – Version 2.2:** spielbare Entwicklungsversion mit 16 Regionen, 72 Quests, acht Dungeons, mobiler Mehrfingersteuerung und 24 zusätzlich erlernbaren aktiven Fähigkeiten. Die Ausrüstung wurde verstärkt und mit einem vollständigen Wertevergleich versehen. Mindestens 200 Stunden abwechslungsreiche Spielzeit und eine Qualität von 5/5 Sternen sind weiterhin Entwicklungsziele. Eine vollständige 200-Stunden-Kampagne wurde nicht durchgespielt und vermessen; eine externe Sternebewertung liegt nicht vor.

## Lokal spielen

Voraussetzung: Node.js 20 oder neuer. Es werden keine zusätzlichen npm-Pakete benötigt.

```sh
cd /Users/muhlack/Desktop/Gaming
npm start
```

Öffne [Emberfall im lokalen Browser](http://localhost:4173). Wähle auf dem Startbildschirm eine Klasse oder setze deine gespeicherte Reise fort. `npm start` und `npm run dev` lauschen standardmäßig auf `127.0.0.1`; mehrere Browser oder Tabs auf diesem Rechner können bereits demselben Gruppenraum beitreten.

Die Einzelspieler-Reise bleibt im Browser auf der verwendeten Adresse gespeichert. Unter Einstellungen kannst du diesen Spielstand als JSON exportieren und importieren. Eine andere Adresse, ein anderer Browser oder ein anderes Browserprofil hat einen eigenen lokalen Speicher.

## Gemeinsam im LAN spielen

1. Beende einen bereits laufenden Emberfall-Server auf Port 4173 mit `Ctrl+C`.
2. Starte im Projektordner den LAN-Server:

   ```sh
   npm run multiplayer
   ```

3. Alle Mitspieler öffnen die Adresse des Hosts im selben lokalen Netz: `http://HOST-IP:4173`. Beispiel: `http://192.168.178.25:4173`, wobei die IP durch die tatsächliche lokale Adresse des Hosts ersetzt wird. Auf dem Host selbst funktioniert auch [localhost:4173](http://localhost:4173).
4. Öffne **Gruppe** im Menü oder mit **P**. Wähle Namen und Klasse für deinen Gruppencharakter, erstelle eine Gruppe und teile den achtstelligen Gruppencode.
5. Die anderen Spieler wählen ihren Charakter und treten über den Code oder die Liste offener Gruppen bei. Bis zu acht aktive Spieler sind möglich.

`npm run multiplayer` setzt `HOST=0.0.0.0`. Falls ein anderer Port benötigt wird:

```sh
PORT=4174 npm run multiplayer
```

Die Mitspieler verwenden dann denselben Port in ihrer Adresse. Falls sie die Seite nicht erreichen, prüfe die Host-IP, das gemeinsame lokale Netz und die Freigabe eingehender Verbindungen für den Node-Spielserver in der Firewall.

Der Server berechnet Bewegung, Gegner, Schaden, Erfahrung, Ressourcen und Beute. Die Gruppe teilt sich Welt und Kämpfe; Inventar, Ausrüstung, Talente, erlernte Fähigkeiten und Questfortschritt gehören zum jeweiligen Gruppencharakter. Lernen, Belegen, Anlegen und Ablegen werden ebenfalls auf dem Server geprüft. Ein geöffnetes Menü pausiert die gemeinsame Welt nicht.

Gruppencharaktere werden in `.emberfall-server/rooms.json` gespeichert. Der Browser merkt sich den Sitzungsschlüssel für **Gespeicherte Gruppe fortsetzen**. Beim Verlassen kehrst du zu deiner vorherigen Einzelspieler-Reise zurück. Nach einem Serverneustart kehrt eine Dungeon-Gruppe in ihre gespeicherte offene Welt zurück; eine laufende Dungeoninstanz wird dabei nicht als gemeinsame Instanz fortgesetzt.

**Internet-Multiplayer:** Ein öffentlich erreichbarer Multiplayer-Backendserver wurde nicht bereitgestellt. Eine statische Veröffentlichung, einschließlich eines ChatGPT-Sites-Links, hostet die Browserdateien und stellt die Node-Gruppensimulation nicht bereit. Für gemeinsames Spielen über das Internet sind ein erreichbarer HTTPS-Spielserver und dessen passende Frontendanbindung noch einzurichten. Technische Einzelheiten stehen in [server/MULTIPLAYER.md](server/MULTIPLAYER.md).

## Steuerung

| Aktion | Steuerung |
| --- | --- |
| Bewegen | WASD oder Pfeiltasten |
| Zielen | Maus oder Bewegungsrichtung |
| Klassenangriff / Kombo | Linke Maustaste oder J |
| Ausweichen | Leertaste oder rechte Maustaste |
| Erste Klassenfähigkeit | Q oder 1 |
| Zweite Klassenfähigkeit | F oder 2 |
| Erste / zweite erlernte Zusatzfähigkeit | 3 / 4 |
| Heiltrank | R |
| Sprechen, sammeln, pflanzen, ernten, Truhe öffnen, rasten, Dungeon betreten, Rätsel bedienen | E |
| Inventar / Talente / Charakter | I / T / C |
| Weltkarte / Questbuch / Handwerk | M / L / B |
| Gruppe / Multiplayer | P |
| Dungeonübersicht | Dungeons-Schaltfläche im Menü |
| Fenster schließen / Einstellungen | Escape |

Die Namen und Symbole der Fähigkeiten passen sich deiner Klasse an. Ein leerer Zusatzplatz auf 3 oder 4 öffnet die Lernansicht. Menüs, Klassenauswahl und Gruppenformulare sind mit Maus und Tastatur bedienbar.

Auf dem Handy ziehst du den **Joystick in acht Richtungen**. Acht Aktionsflächen bieten Klassenfähigkeit Q, Klassenfähigkeit F, Ausweichen, Zusatzfähigkeit 3, Angriff, Zusatzfähigkeit 4, Heiltrank und Interagieren. **Halte Angriff**, um wiederholt anzugreifen; die Touchsteuerung richtet Angriffe und offensive Fähigkeiten auf den nächsten lebenden Gegner im sichtbaren Bildausschnitt. Ohne sichtbares Ziel bleibt die Bewegungs- beziehungsweise Blickrichtung maßgeblich. Bewegung, gehaltener Angriff und eine weitere Aktion können mit verschiedenen Fingern gleichzeitig gesteuert werden.

Abgebrochene Berührungen, verlorene Pointer-Captures, Appwechsel und geöffnete Menüs setzen die Touch-Eingaben zurück. Die Oberfläche hat mindestens 44 Pixel hohe Aktionstasten, scrollbare Menüs und eigene Layouts für Hoch- und Querformat. Dynamische Viewporthöhe und Safe Areas berücksichtigen Browserleisten und Bildschirmränder. Geräteübergreifende Bildraten und langfristige Ergonomie müssen weiter auf echten Smartphones geprüft werden.

## Acht Klassen

| Klasse | Rolle und Fähigkeiten |
| --- | --- |
| Wächter | Tank mit persönlichen und gemeinsamen Schilden; bindet Gegner durch Taunts. |
| Paladin | Heilung und Schutz; verbindet Gruppengebet mit schadender und heilender Weihe. |
| Waldläufer | Fernkampf mit Pfeilen, Durchschlag durch mehrere Ziele und Dornenfallen. |
| Nachtklinge | Schnelle Dolche, kritische Treffer, Schattenstich und Schattenfallen. |
| Flammenrufer | Explosive Feuerbälle, Flächenschaden und anhaltender Brand. |
| Frostweber | Fernkampf mit Frostprojektilen und Kontrolle durch verlangsamende Eisfallen. |
| Druide | Gruppenheilung, anhaltende Regeneration und Naturtalente zum Sammeln. |
| Schattenbinder | Lebensentzug nach erfolgreichen Treffern und angreifende Schattenbegleiter. |

Die Klasse wird für die jeweilige Reise gewählt. Eigene Talentpfade öffnen sich über Stufe 12, 25, 40, 60 und 80. Prerequisiten, benötigte Stufen, Talentpunktkosten und Ranggrenzen stehen in der Talentansicht. Der Fortschritt endet auf **Stufe 100**.

## Neue aktive Fähigkeiten lernen

Öffne **Talente → Aktive Fähigkeiten** mit T oder über das Menü. Jede Klasse erhält drei zusätzliche Techniken ab **Stufe 4, 12 und 25**, für **1, 2 und 3 Talentpunkte**. Die zweite Technik setzt die erste voraus, die dritte die zweite. Die Anzeige erklärt Stufe, Lernvoraussetzung, Mana, Abklingzeit und verfügbare Punkte. Die bisherigen Grundfähigkeiten auf Q/F und die passiven Talentpfade bleiben verfügbar.

| Klasse | Stufe 4 · 1 Punkt | Stufe 12 · 2 Punkte | Stufe 25 · 3 Punkte |
| --- | --- | --- | --- |
| Wächter | Schildstoß | Herausforderung | Schildbrecher |
| Paladin | Lichtbeistand | Weihegrund | Gemeinsamer Eid |
| Waldläufer | Fächerschuss | Jägerfalle | Hainfalke |
| Nachtklinge | Klingenfächer | Rauchschritt | Letzte Klinge |
| Flammenrufer | Brandlanze | Meteorruf | Glutphönix |
| Frostweber | Splitterfächer | Kristallhaut | Wandernder Winter |
| Druide | Wurzelgriff | Lebensrinde | Neuer Frühling |
| Schattenbinder | Hungriges Mal | Flüsternde Schar | Blut und Äther |

Erlernte Techniken können auf **zwei Zusatzplätze, 3 und 4**, gelegt, verschoben oder abgewählt werden. Beim Lernen wird ein freier Platz automatisch belegt. Das Belegen kostet keine weiteren Talentpunkte; dieselbe Technik belegt höchstens einen Platz. Ihre Abklingzeit bleibt beim Umbelegen bestehen. Lernfortschritt und Belegung werden mit der jeweiligen Reise gespeichert.

## Welt, Beute und Abenteuer

- **16 Regionen** in einer Welt von 19.200 × 14.400 Spielkoordinaten: Dämmerhain, Frostgrat, Aschenmoor, Glutöde, Sonnensteppe, Jadeauen, Sturmküste, Dornwildnis, Obsidianpass, Mondbruch, Permafrost, Sandsenke, Traumsenke, Blutmark, Sternensund und Nexusriss.
- **72 Quests**, 18 Bewohner und Reiseführer sowie 27 Gegnertypen einschließlich der Bossdefinitionen.
- Regionale, wiederholbare Aufträge mit drei wechselnden Angeboten je passendem Gebiet und bis zu drei gleichzeitig aktiven Aufgaben.
- **38 generierbare Ausrüstungsbasen** neben den bisherigen Gegenständen; fünf Seltenheiten, zwölf normale Affixe, acht klassenspezifische legendäre Effekte und vier Sets mit Boni für zwei und drei verschiedene Ausrüstungsslots.
- **Stärkere, passende Ausrüstung:** Waffenrollen verwenden den offensiven Primärwert der Klasse; magische Waffen bevorzugen Zauberkraft, physische Klassen Waffenschaden. Neue Rüstungen gewähren Leben und Rüstung sowie materialabhängige Zusatzwerte. Seltene und epische Funde verbessern den Charakter deutlich gegenüber seiner Starterausrüstung.
- **Sockel und Aufwertungen:** Rubin, Saphir und Smaragd ergänzen Gegenstandswerte. Zerlegen liefert Materialien und Arkanstaub; damit lässt sich generierte Ausrüstung bis **+10** aufwerten. Werte werden aus Basis, Affixen, Aufwertung, Sockeln und Sets neu berechnet.
- **Seltene Beute:** Die Basiswahrscheinlichkeit für einen legendären Gegenstand beträgt 0,2 % je normalem Ausrüstungsroll und 3 % je Bossroll. Gespeicherte Pity-Zähler garantieren bei fortgesetzten Gegner-Beuterolls spätestens den 500. normalen beziehungsweise den 34. Bossroll. Das sind Wahrscheinlichkeiten pro Beuteroll, nicht pro normalem Gegner.
- **Farming und Handwerk:** Holz, Erz, Kräuter und Kristalle sammeln; Saatgut pflanzen und Weizen ernten; sechs Rezepte für Nahrung, Tränke und Ausrüstung.
- Weltkarte, Minikarte, entdeckbare Glutschreine, Schnellreise, Questbuch, Klassenwerte und gespeicherter Fortschritt.

Sprich für den Einstieg mit Mira am Brunnen, Sera und Toma. Die Dorfquests führen in Kämpfe, Alchemie und Landwirtschaft ein. Entzünde Glutschreine mit E, um dort zu rasten und die Schnellreise freizuschalten. Bossangriffe werden durch Flächen angekündigt: Verlasse die markierte Zone und nutze das anschließende Zeitfenster. Der Acker wächst während aktiver Simulation; Einzelspielermenüs pausieren diese, Gruppenmenüs dagegen nicht.

## Ausrüstung vergleichen und wechseln

Inventar und Charakteransicht zeigen die drei Plätze **Waffe, Rüstung und Amulett**, ihre aktuellen Gegenstände und eine **Ablegen**-Aktion. Wähle im Inventar **Anlegen**, um einen passenden Fund auszurüsten. Leere Plätze führen zur Ausrüstungsauswahl. Benötigte Stufe und zulässige Klassen stehen direkt am Gegenstand; gesperrte Ausrüstung lässt sich nicht anlegen. Ein voller Rucksack wird mit zwölf Gegenständen pro Seite angezeigt.

Der Vergleich nennt den ersetzten Gegenstand und zeigt die **gesamten Charakterwerte vorher → nachher**, mit positiven und negativen Änderungen. Basiswerte, Affixe, Sockel, Aufwertungen, verlorene oder hinzukommende Setboni und globale Wertgrenzen sind enthalten. So ist etwa der Verlust eines Zweiteiler-Sets beim Waffenwechsel bereits vor dem Anlegen sichtbar.

Neue Beute verwendet Balanceformat 2. Vorhandene gültige Gegenstände und alte Einzelspielstände bleiben kompatibel: Beim Berechnen ihrer aktuellen Werte wird das neue Budget aus dem ursprünglichen Roll abgeleitet. Die gespeicherten ursprünglichen Basiswerte, IDs, Sockel und Pechschutz-Zähler bleiben erhalten; manipulierte Werte werden weiterhin abgewiesen.

## Rollen und Balance

Der Wächter verbindet Taunts und Schutz mit geringerer direkter Schadensleistung. Paladin und Druide bieten Gruppenheilung, die Mana, Reichweite und Positionierung benötigt. Der Paladin ergänzt Nahkampf und Weiheflächen; der Druide verfügt zusätzlich über Gruppenrinde und Wiederbelebung. Waldläufer, Nachtklinge und Flammenrufer setzen unterschiedliche Schwerpunkte bei Reichweite, schnellen Nahkampftreffern und Flächenschaden; Frostweber kontrollieren Gegner, Schattenbinder kombinieren Diener und Lebensentzug.

Rüstung ist jetzt ein Rating gegen die Stufe des Angreifers und reduziert Schaden höchstens um 75 %. Der automatische Rüstungsanstieg allein macht hohe Stufen nicht nahezu unverwundbar. Globale Grenzen für kritische Treffer, Lebensraub und Abklingzeitverkürzung begrenzen extreme Kombinationen. Normale Gegner der offenen Welt ab Stufe 12 verwenden neue Kampfbudgets; deutlich niedrigstufige Gegner geben weniger Kampf-EP. Dungeon- und Bosswerte werden separat festgelegt, und ihre Pflichtmechaniken bleiben wirksam.

Die reproduzierbaren Ausrüstungsvergleiche verlangen unter ihren Modellannahmen mindestens **35 % mehr effektiven Schaden und 20 % mehr Überleben** gegenüber dem Starter-Loadout. Der [Balancebericht](docs/balance-report.md) legt diese Annahmen offen. Seine stationären Gegner, feste Angriffszeit und gemittelten Mana-Rotationen enthalten keine zusätzlichen erlernten Fähigkeiten, Talente, Sockel, Sets oder maximalen Aufwertungen. Diese analytischen Werte belegen weder faire Schwierigkeit aller Builds noch menschliche Gruppenkoordination oder 200 Stunden Spielzeit. Dafür sind weitere echte Spielrouten und längere Gruppenläufe erforderlich.

## Regionale Aufträge

Öffne im Questbuch mit L die Auftragsübersicht oder sprich mit Rowan beziehungsweise den regionalen Reiseführern. Für dein aktuelles Stufenband stehen drei Angebote bereit: lokale Gegner bekämpfen, frische Ressourcen sammeln und wechselnde Aufgaben für Handwerk, Landwirtschaft oder einen passenden Dungeon. Bis zu drei Aufträge dürfen gleichzeitig aktiv sein.

Die Startgebiete bieten Aufgaben von Stufe 8 bis 12; in der Glutöde beginnen sie ab Stufe 9. Danach folgen Aufträge in den passenden Stufenbändern der neuen Regionen. Sie helfen, die Lücken zwischen den festen Questketten zu überbrücken. Ziele zählen erst nach Annahme und im zugehörigen Gebiet. Alte Inventarvorräte oder Kill-Statistiken schließen einen frisch angenommenen Auftrag nicht rückwirkend ab.

Nach einer abgeholten Belohnung wechseln die Angebote des Gebiets. Bereits angenommene ältere Aufträge bleiben aktiv. Belohnungen enthalten Erfahrung, Gold und Arkanstaub, gelegentlich auch Proviant. Auf Stufe 100 entfällt zusätzliche Erfahrung. Auftragsdefinitionen und Belohnungen werden beim Laden aus festen Vorlagen rekonstruiert.

## Dungeons und Raids

Die Tore liegen in der offenen Welt. Die Dungeonübersicht zeigt Stufenanforderungen, Gruppengröße und die bislang beste Tiefe. Zum Betreten musst du am Tor stehen; die erforderliche Zahl lebender Gruppenmitglieder muss die Mindeststufe erfüllen. Löse Inschriften, Runenfolgen, Kistenrätsel, Lichtausrichtungen, Hebel oder gemeinsame Druckplatten mit E und Bewegung. Hinweise findest du in der Dungeonübersicht und auf der Dungeonkarte.

| Dungeon | Mindeststufe | Benötigte Spieler |
| --- | ---: | ---: |
| Wurzelgewölbe | 12 | 1 |
| Salzarchiv | 25 | 1 |
| Dornenkloster | 36 | 1 |
| Zerbrochenes Uhrwerk | 50 | 1 |
| Frostkathedrale | 60 | 1 |
| Sturmzitadelle | 70 | 3 |
| Nachtschlund | 85 | 4 |
| Weltenkern | 95 | 8 |

Die ersten fünf Dungeons können allein oder in einer Gruppe gespielt werden. Die letzten drei sind Raids mit echten Gruppenanforderungen: mehrere lebende Spieler müssen gleichzeitig verschiedene Zeichen halten und Bossmechaniken koordinieren. Schilde, verteilte beziehungsweise gemeinsam abgefangene Angriffe, Kampfphasen und ein Zeitlimit stellen Anforderungen an die Gruppe.

Nach einem Sieg wird die nächste Tiefe freigeschaltet, bis **Tiefe 30**. Bereits gemeisterte Herausforderungen sind wiederholbar. Höhere Tiefen erhöhen die Kampfwerte der Dungeon-Gegner. Die gespeicherten Bestwerte zeigen Runs, beste Tiefe und beste Zeit.

## Grafik und Herkunft

Spieler und NPCs verwenden originale **Pixelart** mit einer gemeinsamen begrenzten Farbpalette, transparentem Hintergrund und klaren Konturen. Die acht Klassen besitzen je vier Blickrichtungen mit acht Posen: Leerlauf, vier Laufphasen, zwei Angriffsphasen und eine Bodenpose. Eine Zelle enthält 32 × 48 echte Bildpixel mit Fußanker `[16, 40]`. Die Figuren werden zweifach ohne Glättung gezeichnet, auch für andere Gruppenmitglieder.

Die Welt nutzt eine feste Pixelauflösung mit scharfer zweifacher Vergrößerung. Eigene Pixel-Sprites stellen Bäume, Felsen und Gegner dar. Namen und Questtexte bleiben in voller Bildschirmauflösung lesbar. Die Oberfläche behält ihre ruhigen Moos-, Messing- und Elfenbeinfarben.

- `assets/pixel-characters.png` und `.json`: acht Klassen, insgesamt 256 Animationszellen.
- `assets/pixel-npcs.png` und `.json`: NPCs im gleichen Stil mit eigenen Identitäten und Ausstattungen.
- `tools/build_pixel_characters.py`: reproduzierbarer Pixel-Sprite-Generator; benötigt Python 3 und Pillow.
- `src/pixel-world.js`: eigene Pixelcluster für Natur und Gegner.
- `assets/pixel-art-direction.md`: Größen, Palette, Darstellung und Prüfkriterien.

Die älteren `assets/characters.*` und die Blender-Szene bleiben als früherer Entwicklungsstand im Repository erhalten. Sie gehören nicht zum aktuellen Browser-Build.

Das Titelbild wurde mit dem integrierten OpenAI-Imagegen-Werkzeug erzeugt. Musik und Klangeffekte entstehen durch eigene Web-Audio-Synthese. Herkunft, ursprünglicher Titelbild-Prompt, Dateieigenschaften und Prüfsummen stehen in [assets/manifest.json](assets/manifest.json). Es wurden keine Grafiken, Charaktere oder Audiodateien aus den genannten Inspirationsspielen übernommen.

## Entwicklung und Prüfung

```sh
npm test
npm run test:network
npm run build
```

`npm test` prüft unter anderem Bewegung und Kampf, Klassenfähigkeiten, Lernen und Belegen aktiver Techniken, Talente, die Stufe-100-Kurve, instanzierte Beute, Ausrüstungsvergleiche, Quests, Speicherdaten und Dungeonmechaniken. Eingabeprüfungen decken acht Joystickrichtungen, mehrere gleichzeitige Finger, Autoziel, Pointer-Capture und Eingabeabbrüche ab. Die Netzwerkprüfungen verwenden tatsächliche HTTP/SSE-Clients gegen einen Testserver und prüfen gemeinsame Aktionen sowie serverseitige Fortschrittsberechnung. Automatische Tests belegen diese geprüften Abläufe; sie belegen keine 200 Stunden Kampagnenspielzeit und keine abgeschlossene Langzeitbalance.

`npm run build` kopiert die Browserdateien und die Laufzeitassets nach `dist/`. Kontaktansichten, Grafikgeneratoren und ältere Blenderquelldaten werden dabei nicht veröffentlicht. Diese statischen Dateien enthalten keinen laufenden Multiplayer-Backendserver.

| Datei | Aufgabe |
| --- | --- |
| `src/game.js` | Simulation, Kampf, Quests, Inventar und Speicherung |
| `src/catalog.js` | Zusammengeführte Inhaltsdaten |
| `src/expansion.js` | Zusätzliche Regionen, Gegner, Reiseführer und Questketten |
| `src/classes.js` / `src/progression.js` | Klassen, Talentpfade und Fortschritt bis Stufe 100 |
| `src/abilities.js` | 24 erlernbare aktive Fähigkeiten, Voraussetzungen und gespeicherte Belegung |
| `src/balance.js` | Rollenfaktoren, Rüstungsrating, Kampfwertgrenzen und analytische Vergleiche |
| `src/loot.js` | Seltenheiten, Basisgegenstände, Affixe, Sets, Sockel und Aufwertungen |
| `src/mobile-input.js` / `src/main.js` | Mehrfinger-Joystick, Eingabezustand, Touch-Autoziel und Spielschleife |
| `src/dungeons.js` | Dungeoninstanzen, Rätsel und Bossmechaniken |
| `src/contracts.js` | Wiederholbare regionale Aufträge, Ereignisfortschritt und validierte Belohnungen |
| `src/world.js` / `src/renderer.js` | Weltgrundlage und Canvas-Darstellung |
| `src/ui.js` / `src/network.js` | Oberfläche und Browserverbindung zum Gruppenserver |
| `server.mjs` / `server/multiplayer.mjs` | HTTP-Startfunktion, Gruppensimulation und Serverspeicherung |

Das Spiel verwendet Canvas 2D, ES-Module und die Node-Standardbibliothek ohne externe Laufzeitabhängigkeiten. `window.emberfall` erlaubt lokale Inspektion im Browser. Das 200-Stunden-Pacing-Modell in `src/progression.js` ist ausdrücklich als `design-target` mit bislang `verifiedHours: 0` gekennzeichnet.

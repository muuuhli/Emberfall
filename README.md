# Emberfall – Die letzte Glut

Ein eigenständiges, deutschsprachiges 2D-Action-RPG mit direkter Bewegung, gerichteten Angriffen, Ausweichrollen, Quests, Farming und instanzierter Beute. Die Erweiterung verbindet eine große offene Welt mit acht Klassen, Fortschritt bis Stufe 100 und kooperativen Dungeons auf einem lokalen Spielserver.

**Aktueller Stand:** spielbare Entwicklungsversion mit 16 Regionen, 72 Quests und acht Dungeons. Mindestens 200 Stunden abwechslungsreiche Spielzeit und eine Qualität von 5/5 Sternen sind weiterhin Entwicklungsziele. Eine vollständige 200-Stunden-Kampagne wurde nicht durchgespielt und vermessen; eine externe Sternebewertung liegt nicht vor.

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

Der Server berechnet Bewegung, Gegner, Schaden, Erfahrung, Ressourcen und Beute. Die Gruppe teilt sich Welt und Kämpfe; Inventar, Ausrüstung, Talente und Questfortschritt gehören zum jeweiligen Gruppencharakter. Ein geöffnetes Menü pausiert die gemeinsame Welt nicht.

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
| Heiltrank | R oder 3 |
| Sprechen, sammeln, pflanzen, ernten, Truhe öffnen, rasten, Dungeon betreten, Rätsel bedienen | E |
| Inventar / Talente / Charakter | I / T / C |
| Weltkarte / Questbuch / Handwerk | M / L / B |
| Gruppe / Multiplayer | P |
| Dungeonübersicht | Dungeons-Schaltfläche im Menü |
| Fenster schließen / Einstellungen | Escape |

Die Namen und Symbole der Fähigkeiten passen sich deiner Klasse an. Auf Touch-Geräten gibt es Richtungs- und Aktionsflächen. Menüs, Klassenauswahl und Gruppenformulare sind mit Maus und Tastatur bedienbar.

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

## Welt, Beute und Abenteuer

- **16 Regionen** in einer Welt von 19.200 × 14.400 Spielkoordinaten: Dämmerhain, Frostgrat, Aschenmoor, Glutöde, Sonnensteppe, Jadeauen, Sturmküste, Dornwildnis, Obsidianpass, Mondbruch, Permafrost, Sandsenke, Traumsenke, Blutmark, Sternensund und Nexusriss.
- **72 Quests**, 18 Bewohner und Reiseführer sowie 27 Gegnertypen einschließlich der Bossdefinitionen.
- Regionale, wiederholbare Aufträge mit drei wechselnden Angeboten je passendem Gebiet und bis zu drei gleichzeitig aktiven Aufgaben.
- **38 generierbare Ausrüstungsbasen** neben den bisherigen Gegenständen; fünf Seltenheiten, zwölf normale Affixe, acht klassenspezifische legendäre Effekte und vier Sets mit Boni für zwei und drei verschiedene Ausrüstungsslots.
- **Sockel und Aufwertungen:** Rubin, Saphir und Smaragd ergänzen Gegenstandswerte. Zerlegen liefert Materialien und Arkanstaub; damit lässt sich generierte Ausrüstung bis **+10** aufwerten. Werte werden aus Basis, Affixen, Aufwertung, Sockeln und Sets neu berechnet.
- **Seltene Beute:** Die Basiswahrscheinlichkeit für einen legendären Gegenstand beträgt 0,2 % je normalem Ausrüstungsroll und 3 % je Bossroll. Gespeicherte Pity-Zähler garantieren bei fortgesetzten Gegner-Beuterolls spätestens den 500. normalen beziehungsweise den 34. Bossroll. Das sind Wahrscheinlichkeiten pro Beuteroll, nicht pro normalem Gegner.
- **Farming und Handwerk:** Holz, Erz, Kräuter und Kristalle sammeln; Saatgut pflanzen und Weizen ernten; sechs Rezepte für Nahrung, Tränke und Ausrüstung.
- Weltkarte, Minikarte, entdeckbare Glutschreine, Schnellreise, Questbuch, Klassenwerte und gespeicherter Fortschritt.

Sprich für den Einstieg mit Mira am Brunnen, Sera und Toma. Die Dorfquests führen in Kämpfe, Alchemie und Landwirtschaft ein. Entzünde Glutschreine mit E, um dort zu rasten und die Schnellreise freizuschalten. Bossangriffe werden durch Flächen angekündigt: Verlasse die markierte Zone und nutze das anschließende Zeitfenster. Der Acker wächst während aktiver Simulation; Einzelspielermenüs pausieren diese, Gruppenmenüs dagegen nicht.

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

`npm test` prüft unter anderem Bewegung und Kampf, Klassenfähigkeiten, Talente, die Stufe-100-Kurve, instanzierte Beute, Ausrüstungsmodifikatoren, Quests, Speicherdaten und Dungeonmechaniken. Die Netzwerkprüfungen verwenden tatsächliche HTTP/SSE-Clients gegen einen Testserver und prüfen gemeinsame Aktionen sowie serverseitige Fortschrittsberechnung. Automatische Tests belegen diese geprüften Abläufe; sie belegen keine 200 Stunden Kampagnenspielzeit und keine abgeschlossene Langzeitbalance.

`npm run build` kopiert die Browserdateien und die Laufzeitassets nach `dist/`. Kontaktansichten, Grafikgeneratoren und ältere Blenderquelldaten werden dabei nicht veröffentlicht. Diese statischen Dateien enthalten keinen laufenden Multiplayer-Backendserver.

| Datei | Aufgabe |
| --- | --- |
| `src/game.js` | Simulation, Kampf, Quests, Inventar und Speicherung |
| `src/catalog.js` | Zusammengeführte Inhaltsdaten |
| `src/expansion.js` | Zusätzliche Regionen, Gegner, Reiseführer und Questketten |
| `src/classes.js` / `src/progression.js` | Klassen, Talentpfade und Fortschritt bis Stufe 100 |
| `src/loot.js` | Seltenheiten, Basisgegenstände, Affixe, Sets, Sockel und Aufwertungen |
| `src/dungeons.js` | Dungeoninstanzen, Rätsel und Bossmechaniken |
| `src/contracts.js` | Wiederholbare regionale Aufträge, Ereignisfortschritt und validierte Belohnungen |
| `src/world.js` / `src/renderer.js` | Weltgrundlage und Canvas-Darstellung |
| `src/ui.js` / `src/network.js` | Oberfläche und Browserverbindung zum Gruppenserver |
| `server.mjs` / `server/multiplayer.mjs` | HTTP-Startfunktion, Gruppensimulation und Serverspeicherung |

Das Spiel verwendet Canvas 2D, ES-Module und die Node-Standardbibliothek ohne externe Laufzeitabhängigkeiten. `window.emberfall` erlaubt lokale Inspektion im Browser. Das 200-Stunden-Pacing-Modell in `src/progression.js` ist ausdrücklich als `design-target` mit bislang `verifiedHours: 0` gekennzeichnet.

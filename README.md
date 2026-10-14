# Emberfall – Die letzte Glut

Ein eigenständiges, deutschsprachiges 2D-Action-RPG mit direkter Bewegung, gerichteten Angriffen, Ausweichrollen, Quests, Farming und instanzierter Beute. Die Erweiterung verbindet eine große offene Welt mit acht Klassen, Fortschritt bis Stufe 100 und kooperativen Dungeons auf einem lokalen Spielserver.

**Aktueller Stand – Version 6.0:** fünf geprüfte Inhaltsrunden ergänzen 24 Nebenquests in acht Geschichten, sechs eigenständige Bossjagden, vier neue fünfstufige Expeditionen, drei Wellenprüfungen, sechs Jagdrouten, vier gezielte Beutebelohnungen, zwei originale Reisegefährten und vier Errungenschaften. Die Welt bietet damit 16 Regionen, 96 Quests, acht Dungeons, 80 regionale Gegnerarten samt Bossformen, 64 aktive Fähigkeiten und 164 Klassentalente. 16 regionale Ereignisse, sechs neue Bossjagden, acht Expeditionen und drei Prüfungen ergeben 33 Weltaktivitäten; 17 Jagdrouten, 20 Errungenschaften und zwölf Reisegefährten verbinden sie mit bleibenden Zielen. Mobile Hinweise bleiben auf einen sichtbaren Hinweis begrenzt; kompakte Köpfe halten auch auf kurzen Displays die Spielfigur frei. Alte Reisen, Weltorte und einmalige Belohnungen werden weitergeführt. Die [fünf Inhaltsrunden](docs/content-loops.md) dokumentieren Umsetzung, native Prüfungen und ihre Grenzen.

## Aschenjagd: mobiles HUD und wechselnde Gefahr

- **Ein Hinweis zur Zeit:** Beute und gleichzeitige Questziele werden gebündelt. Fehler, wichtige Fortschritte und Gefahren erhalten Vorrang. Ein kurzer Meldungsverlauf steht in den Einstellungen; Wegziel, Chronik und Interaktion passen sich der tatsächlich sichtbaren Touchsteuerung an.
- **Lokale Jagdgruppen:** Nach aktiver Zeit außerhalb sicherer Orte erscheinen gemischte Gegnergruppen nahe der Reise. Die erste Vorwarnung kommt ab Stufe 4 nach 75 Sekunden, ab Stufe 20 nach 40 und ab Stufe 52 nach 25 Sekunden. Acht Sekunden lang zeigen feste Bodenmarkierungen und Richtungszeichen die geplanten Ankünfte. Gegner erscheinen mindestens 160 Einheiten von lebenden Reisenden entfernt.
- **Harte Eskalationen:** Aschenjagd, finsteres Rudel und ab Stufe 20 jede dritte Welle eine Blutnacht wechseln sich ab. Gruppen enthalten normalerweise drei, fünf oder sieben Gegner; nahe Mitspieler erhöhen die Anzahl begrenzt auf zehn. Verstärkte Gegner, koordinierte Flanken und seitliche Fernkampfbewegungen sorgen für Druck. Frühere Gebiete behalten ihre eigenen Gegnerstufen, Anfänger erhalten kleinere Rudel. Bei zu vielen vorhandenen Gegnern wird keine zusätzliche Masse erzeugt.
- **Erholung und Rückzug:** Die nächste Welle wartet 40–65 aktive Wildnissekunden. Siedlungen, Dungeons und PvP stoppen die Jagdplanung. Rückzug aus dem Gebiet löst die Verfolgung; eine Gruppe bleibt höchstens 90 Sekunden. Normale Gegner ab Stufe 12 kehren nach 32 statt 55 Sekunden zurück, weiterhin erst bei großem Abstand aller Reisenden. Optionalen Champions bleiben ihre sechs Minuten Erholung.
- **Belohnungen und Speicherstand:** Jagdgruppen geben halbe gewöhnliche Kampf-EP und Gold sowie eine Beuterolle mit 15 Prozent Chance. Echte Kills zählen für passende Aufgaben. Keine Gruppe liefert automatische Championbeute oder respawnt sofort nach dem Laden. Vorwarnungen, verbleibende Zeiten und lebende beziehungsweise besiegte Gruppenmitglieder bleiben gespeichert und werden im Koop vom Server bestimmt.

Die [Prüfung der mobilen Hinweise und Schwierigkeit](docs/pressure-quality.md) beschreibt reale Browser- und Kampfproben.

## Schwarzer Horizont: Sound, Welt, Jagd und Duelle

- **Klangwelt:** Musikschichten reagieren auf Region, Dungeon, aktiven Bosskampf und Arena. Acht Klassen erhalten unterschiedliche Attack- und Zauberklänge. Seltene Funde und Siege haben eigene Signale. Gesamt-, Musik- und Effektlautstärke sind getrennt einstellbar. Ein weicher Kompressor, Raumklang und feste Stimmen-/Pufferbudgets begrenzen Spitzen und Ressourcenverbrauch. Verborgene Tabs, ausgeschalteter Ton und das Schließen der Seite stoppen die Klänge.
- **Düstere Bewegung und Erkundung:** acht Klassenakzente, gerichtete Ausweichposen und Nachbilder, Trefferfunken, sichtbare Siegelwaffen-Auren und native Pixelgeschosse ergänzen die ursprünglichen Figuren. Dreizehn originale Requisitenarten und begrenzte Wasserreflexe vertiefen die Biome; Karte und Minikarte zeichnen Details aus tatsächlichen Weltobjekten. Reduzierte Bewegung bleibt unterstützt.
- **Seltene Waffen:** Grabmond und Sternenasche sind originale Siegelvarianten passender Waffen. Mond verlangsamt nach einem bestätigten Treffer kurz einen Gegner; Stern gewährt einen kleinen zeitlich begrenzten Selbstschild. Ihre gemeinsame Erholung bleibt bei Waffenwechsel und Laden erhalten. Sie liefern keine zusätzlichen Rohwerte und wirken nicht im PvP. Die gewöhnliche Seltenheitsverteilung und der legendäre Pechschutz bleiben erhalten.
- **Ehrliche Fundchancen:** pro geeigneter generierter Klassenwaffe betragen Mond/Stern bei normalen Gegnern 0,08 % / 0,015 %, bei Weltbossen 0,8 % / 0,2 % und bei Dungeonbossen 1,2 % / 0,3 %. Mond setzt Waffenstufe 20, Stern Stufe 45 voraus. Beuteroll und Waffenwahl gehen diesen Chancen voraus; die Chance pro besiegtem Gegner ist deshalb kleiner. Handel, Herstellung, Truhen und garantierte Jagdbeute führen keine Siegelziehung aus. Herkunft und Wirkung stehen im Inspektor.
- **Verlässlicher Jagdfortschritt:** acht Dungeonpfade und drei Solorouten verknüpfen echte Gegner, regionale Schreckensfürsten und Abschlüsse. Zwei Jagden können gleichzeitig laufen. Fortschritt und verdiente Jagdsiegel verfallen nicht. Siegel kaufen passende Rare-Ausrüstung, eine ersparte epische Klassenwaffe oder Aufwertungsmaterial. Das Beuteniveau wird durch die tatsächlich abgeschlossene Jagdspanne begrenzt; bloße niedrigstufige Vorratsjagden erzeugen keine Stufe-100-Waffen. Einige Dungeonpfade verlangen ausdrücklich Tiefe 2. Die 80 optionalen regionalen Schreckensfürsten kehren nach sechs aktiven Spielminuten zurück, sobald alle Reisenden genügend Abstand halten; Storybosse und einmalige Truhenwächter bleiben getrennt.
- **Freiwilliges PvP:** verbundene Gruppenmitglieder laden einander zum Duell ein. Beide müssen zustimmen. Ein isolierter Spiegelkampf verwendet für alle Klassen 300 Leben, 100 Mana und dieselben vier Kampfaktionen: Nahhieb, Schattenprojektil, angekündigter Zielkreis und Ausweichen. Ausrüstung, Stufe und passive Vorteile beeinflussen das Duell nicht. Countdown, Zeitlimit, Säulen, Sieg, Remis, Aufgabe und sichere Rückkehr werden auf dem Spielserver berechnet. Duelle kosten keine PvE-Ausrüstung, Erfahrung oder Gold und geben keine farmbaren Belohnungen.

Die [V5-Prüfung](docs/ashen-horizon-quality.md) dokumentiert die tatsächlichen Funktions-, Browser- und Gameplayproben. PvP benötigt wie Koop den Node-Spielserver; die statische Sites-Veröffentlichung stellt diesen Dienst nicht bereit. Ein Verkaufserfolg oder eine bestimmte menschliche Langzeitspielzeit wird aus den technischen Prüfungen nicht abgeleitet.

## Vom Vorbild zum eigenständigen Spiel

Die Erweiterung entstand aus gelesenen Herstelleranleitungen und einer visuellen Untersuchung von Inventaren, Charaktermenüs und Spielsystemen. Der [Vergleich zu Diablo, World of Warcraft und Guild Wars](docs/reference-rpg-systems.md) sowie die [Analyse von Zelda, Pokémon und historischen Silkroad-Systemen](docs/reference-adventure-systems.md) trennen belegte Referenzen, eigene Entwürfe und Quellengrenzen. Die Spielfiguren, Gegenstände und Grafikdateien bleiben originale Emberfall-Inhalte.

- **Charakter und Vorbereitung:** Helm, Handschuhe, Stiefel und Ring ergänzen Waffe, Körperrüstung und Amulett. Die Charakteransicht zeigt den tatsächlichen Klassensprite und trennt Offensive, Überleben und Versorgung. Der Beutel zeigt ein Raster, ausgewählte Details und den exakten gesamten Vorher-/Nachhervergleich. Favoriten und gesperrte Gegenstände lassen sich nicht versehentlich verkaufen oder zerlegen. Das Lager hält 120 verschiedene Gegenstände und öffnet in Siedlungen außerhalb des Kampfes. Drei benannte Vorlagen speichern Ausrüstung und zwei aktive Zusatzplätze; fehlende Stücke werden erklärt. Sie wechseln außerhalb des Kampfes, erhalten Abklingzeiten und erzeugen keine Heilung. Passive Talente können in Siedlungen für `20 + 5 × Stufe` Gold zurückgesetzt werden; investierte Punkte kehren zurück.
- **Lebendige Regionen:** jedes der 16 Ereignisse verwendet eine konkrete Regel: Verteidigung, Eskorte, Ritual, Hinterhalt, Spurensuche oder Entscheidung. Acht Expeditionen verbinden vier oder fünf Abschnitte mit unterschiedlichen Rätseln, einer sicheren oder riskanten Wahl und einem benannten Boss. Sechs eigenständige Bossjagden bieten unterschiedliche eingefrorene Warnformen und Phasen; drei Wellenprüfungen verbinden wachsende Rudel mit Rast oder Drängen. Warnungen gehen jedem neuen Gegner voraus. Beteiligung durch Aktionen oder zeitliches Verteidigen ist Voraussetzung für persönliche Abschlussbeute. Wiederholungsbelohnungen sinken, überlevelte Figuren erhalten weniger oder keine Kampf-EP. Aktive Ereignisse werden beim Laden kontrolliert abgebrochen und nach 60 Sekunden erneut verfügbar; abgeschlossene und abgeholte Belohnungen bleiben erhalten.
- **Dauerhafte Ziele:** drei Bünde geben Ruf für unterschiedliche Entdeckungen, Rettungen, Bosse, Verträge und Abenteuer. Sechs Rufrezepte und drei wählbare Meistereide ändern tatsächliche Herstellungs- und Charakterwerte. 20 Errungenschaften belohnen Meilensteine einmal. Zwölf Gefährten werden durch unterschiedliche Ziele gewonnen; einer begleitet dich sichtbar, mit kleinen Boni oder begrenzten Angriffen. Die anderen ruhen in deiner Sammlung.
- **Orientierung:** ein angepinnter Questschritt bestimmt das aktuelle Ziel; Reiseziel und Richtung ändern sich mit Fortschritt. Journal, Karte, Dungeons und Ereignisse können Wegmarken setzen. Vier Hauptbereiche – Held, Arsenal, Chronik und Welt – halten verwandte Funktionen zusammen. Auf Touch bleibt die Zielchronik standardmäßig klein.

Die 48 neuen kleinen Ausrüstungsteile und 24 Rezepte nutzen reduzierte Wertebudgets, damit die zusätzlichen Plätze einen bestehenden Charakter verstärken, ohne die drei großen Plätze zu ersetzen. Insgesamt stehen 191 feste Gegenstände, 198 Beutebasen und 104 Rezepte zur Verfügung. Der [Qualitätsbericht](docs/research-expansion-quality.md) dokumentiert die Überprüfungen und Grenzen; der [automatische Spielbericht](docs/playthrough-review.md) beschreibt echte Bewegungs-/Kampfreplays samt klar benannten Fixtures.

## Version 3.0: Die Erweiterung der schwarzen Wacht – historischer Stand

Die folgenden Zahlen und Beutegewichte dokumentieren die Erweiterung vor den zusätzlichen Ausrüstungsplätzen und Reisesystemen. Der aktuelle Stand 4.0 mit 191 festen Gegenständen, 198 Beutebasen und 104 Rezepten steht oben; seine Prüfungen und Budgetvergleiche stehen im [Qualitätsbericht zu Version 4.0](docs/research-expansion-quality.md).

- **Begegnungen:** fünf eigene Arten je Region, acht Angriffsmuster und neun Monsterfamilien. Bossformen stehen in optionalen Nestern abseits der Hauptwege. Anstürme, Salven, Fächer, Positionsflüche und Novas kündigen sich an; Beschwörer rufen begrenzte, kurzlebige Diener, die keine Beute oder Erfahrung zum Farmen liefern. Rüstung, Frost, Wunden, Gift, Feuer, Regeneration und Lebensentzug wirken im Kampf.
- **Ausrüstung:** 64 neue Klassenwaffen, 24 Rüstungen, 24 Talismane, zwölf Vorräte und 68 zusätzliche Rezepte. Insgesamt existieren 150 Beutebasen, 143 feste Gegenstände und 74 Rezepte. Händlersortimente, Handwerk und Ausrüstung berücksichtigen Stufe und Klasse. Neue Beute bevorzugt passende Waffen und stufennahe Basen; die Slotverteilung beträgt 40 % Waffen, 35 % Rüstung und 25 % Schmuck.
- **Entscheidungen:** jede Klasse erhält drei weitere passive Spezialisierungen mit Rangvoraussetzungen. Meistertalente auf Stufe 75 haben wirksame Nachteile. Acht erlernbare Fähigkeiten je Klasse konkurrieren um zwei Zusatzplätze; Lernen, Rangpunkte und Abklingzeiten bleiben serverseitig geprüft.
- **Weltinteraktionen:** 192 Objekte in zwölf Kategorien: Fässer, Urnen, Gräber, Blutaltäre, Seelenquellen, Gefangene, verfluchte Truhen, Glutherde, Gruftketten, Chroniken, Obelisken und versiegelte Vorräte. Gräber und verfluchte Truhen belohnen erst den gewonnenen Kampf. Eine volle Tasche lässt ihre Belohnung verfügbar; ein neuer Spielstand lädt den Zustand ohne doppelte Beute. Gefangene müssen erst von Feinden befreit werden, Gruftketten öffnen nahe Vorräte und Rituale kosten Ressourcen. Mahlzeiten brauchen Ruhe und haben eine zusätzliche Rastpause.

Der [Balancebericht zu Version 3.0](docs/darkness-balance-report.md) dokumentiert die damalige Artenmatrix und ihren analytischen Ausrüstungsvergleich. Den aktuellen Vergleich von drei zu sieben Ausrüstungsplätzen und die Modellgrenzen beschreibt der [Qualitätsbericht zu Version 4.0](docs/research-expansion-quality.md). Browserprüfungen decken Desktop und Handy ab; lange menschliche Spieltests bleiben für Feinabstimmung nötig.

## Lokal spielen

Voraussetzung: Node.js 20 oder neuer. Es werden keine zusätzlichen npm-Pakete benötigt.

```sh
cd /workspace/Emberfall
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
| Reisechronik / Ereignisse und Expeditionen | N / O |
| Bestiarium / Weltinteraktionen | V / H |
| Dungeonübersicht | Dungeons-Schaltfläche im Menü |
| Fenster schließen / Einstellungen | Escape |

Die Namen und Symbole der Fähigkeiten passen sich deiner Klasse an. Ein leerer Zusatzplatz auf 3 oder 4 öffnet die Lernansicht. Menüs, Klassenauswahl und Gruppenformulare sind mit Maus und Tastatur bedienbar.

Auf dem Handy ziehst du den **Joystick in acht Richtungen**. Acht Aktionsflächen bieten Klassenfähigkeit Q, Klassenfähigkeit F, Ausweichen, Zusatzfähigkeit 3, Angriff, Zusatzfähigkeit 4, Heiltrank und Interagieren. **Halte Angriff**, um wiederholt anzugreifen; die Touchsteuerung richtet Angriffe und offensive Fähigkeiten auf den nächsten lebenden Gegner im sichtbaren Bildausschnitt. Ohne sichtbares Ziel bleibt die Bewegungs- beziehungsweise Blickrichtung maßgeblich. Bewegung, gehaltener Angriff und eine weitere Aktion können mit verschiedenen Fingern gleichzeitig gesteuert werden.

Abgebrochene Berührungen, verlorene Pointer-Captures, Appwechsel und geöffnete Menüs setzen die Touch-Eingaben zurück. Die Oberfläche hat mindestens 44 Pixel hohe Aktionstasten, scrollbare Menüs und eigene Layouts für Hoch- und Querformat. Dynamische Viewporthöhe und Safe Areas berücksichtigen Browserleisten und Bildschirmränder. Geräteübergreifende Bildraten und langfristige Ergonomie müssen weiter auf echten Smartphones geprüft werden.

Über die Einstellungen erreichst du auf dem Handy alle acht Menüs direkt, einschließlich der Gruppe. Die [mobile Browserprüfung](docs/mobile-qa.md) dokumentiert die getesteten Ansichten und Aktionen.

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

Öffne **Talente → Aktive Fähigkeiten** mit T oder über das Menü. Jede Klasse erhält acht zusätzliche Techniken, darunter die ursprüngliche Lernkette ab **Stufe 4, 12 und 25**. Weitere Spezialisierungen öffnen sich zwischen Stufe 8 und 70. Die Anzeige erklärt Zweig, Stufe, Lernvoraussetzung, Mana, Abklingzeit und verfügbare Punkte. Die bisherigen Grundfähigkeiten auf Q/F und die passiven Talentpfade bleiben verfügbar. Die folgende Tabelle zeigt die ursprünglichen drei Techniken; alle acht stehen im Spielmenü.

Die Prozentangaben berücksichtigen die Klassenbalance. Die angezeigten Abklingzeiten beziehen Ausrüstung und Talente ein; passende Ausrüstung verkürzt auch die Abklingzeitanzeige der Aktionsbuttons.

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
- **96 Quests**, 18 Bewohner und Reiseführer sowie 80 regionale Gegnerarten mit Bossvarianten und zusätzlichen Story-, Dungeon- und Expeditionsbossen.
- Regionale, wiederholbare Aufträge mit drei wechselnden Angeboten je passendem Gebiet und bis zu drei gleichzeitig aktiven Aufgaben.
- **198 generierbare Ausrüstungsbasen** und 191 feste Gegenstandsdefinitionen; fünf Seltenheiten, zwölf normale Affixe, acht klassenspezifische legendäre Effekte und vier Sets mit Boni für zwei und drei verschiedene Ausrüstungsslots.
- **Stärkere, passende Ausrüstung:** Waffenrollen verwenden den offensiven Primärwert der Klasse; magische Waffen bevorzugen Zauberkraft, physische Klassen Waffenschaden. Neue Rüstungen gewähren Leben und Rüstung sowie materialabhängige Zusatzwerte. Seltene und epische Funde verbessern den Charakter deutlich gegenüber seiner Starterausrüstung.
- **Sockel und Aufwertungen:** Rubin, Saphir und Smaragd ergänzen Gegenstandswerte. Zerlegen liefert Materialien und Arkanstaub; damit lässt sich generierte Ausrüstung bis **+10** aufwerten. Werte werden aus Basis, Affixen, Aufwertung, Sockeln und Sets neu berechnet.
- **Seltene Beute:** Die Basiswahrscheinlichkeit für einen legendären Gegenstand beträgt 0,2 % je normalem Ausrüstungsroll und 3 % je Bossroll. Gespeicherte Pity-Zähler garantieren bei fortgesetzten Gegner-Beuterolls spätestens den 500. normalen beziehungsweise den 34. Bossroll. Das sind Wahrscheinlichkeiten pro Beuteroll, nicht pro normalem Gegner.
- **Farming und Handwerk:** Holz, Erz, Kräuter und Kristalle sammeln; Saatgut pflanzen und Weizen ernten; 104 Rezepte für Nahrung, Tränke und Ausrüstung, darunter sechs durch Fraktionsruf freigeschaltete Rezepte.
- Weltkarte, Minikarte, entdeckbare Glutschreine, Schnellreise, Questbuch, Klassenwerte und gespeicherter Fortschritt.

Sprich für den Einstieg mit Mira am Brunnen, Sera und Toma. Die Dorfquests führen in Kämpfe, Alchemie und Landwirtschaft ein. Entzünde Glutschreine mit E, um dort zu rasten und die Schnellreise freizuschalten. Bossangriffe werden durch Flächen angekündigt: Verlasse die markierte Zone und nutze das anschließende Zeitfenster. Der Acker wächst während aktiver Simulation; Einzelspielermenüs pausieren diese, Gruppenmenüs dagegen nicht.

## Ausrüstung vergleichen und wechseln

Inventar und Charakteransicht zeigen die sieben Plätze **Waffe, Körperrüstung, Amulett, Helm, Handschuhe, Stiefel und Ring**, ihre aktuellen Gegenstände und eine **Ablegen**-Aktion. Wähle im Inventar **Anlegen**, um einen passenden Fund auszurüsten. Leere Plätze führen zur Ausrüstungsauswahl. Benötigte Stufe und zulässige Klassen stehen direkt am Gegenstand; gesperrte Ausrüstung lässt sich nicht anlegen. Der Rucksack verwendet ein Raster mit ausgewählter Detailansicht, Suche und Filtern; Favoriten und Sperren schützen geplante Ausstattung.

Der Vergleich nennt den ersetzten Gegenstand und zeigt die **gesamten Charakterwerte vorher → nachher**, mit positiven und negativen Änderungen. Basiswerte, Affixe, Sockel, Aufwertungen, verlorene oder hinzukommende Setboni und globale Wertgrenzen sind enthalten. So ist etwa der Verlust eines Zweiteiler-Sets beim Waffenwechsel bereits vor dem Anlegen sichtbar.

Neue Beute verwendet Balanceformat 2. Vorhandene gültige Gegenstände und alte Einzelspielstände bleiben kompatibel: Beim Berechnen ihrer aktuellen Werte wird das neue Budget aus dem ursprünglichen Roll abgeleitet. Die gespeicherten ursprünglichen Basiswerte, IDs, Sockel und Pechschutz-Zähler bleiben erhalten; manipulierte Werte werden weiterhin abgewiesen.

## Rollen und Balance

Der Wächter verbindet Taunts und Schutz mit geringerer direkter Schadensleistung. Paladin und Druide bieten Gruppenheilung, die Mana, Reichweite und Positionierung benötigt. Der Paladin ergänzt Nahkampf und Weiheflächen; der Druide verfügt zusätzlich über Gruppenrinde und Wiederbelebung. Waldläufer, Nachtklinge und Flammenrufer setzen unterschiedliche Schwerpunkte bei Reichweite, schnellen Nahkampftreffern und Flächenschaden; Frostweber kontrollieren Gegner, Schattenbinder kombinieren Diener und Lebensentzug.

Rüstung ist jetzt ein Rating gegen die Stufe des Angreifers und reduziert Schaden höchstens um 75 %. Der automatische Rüstungsanstieg allein macht hohe Stufen nicht nahezu unverwundbar. Globale Grenzen für kritische Treffer, Lebensraub und Abklingzeitverkürzung begrenzen extreme Kombinationen. Normale Gegner der offenen Welt ab Stufe 12 verwenden neue Kampfbudgets; deutlich niedrigstufige Gegner geben weniger Kampf-EP. Dungeon- und Bosswerte werden separat festgelegt, und ihre Pflichtmechaniken bleiben wirksam.

Der ursprüngliche Vergleich der drei großen Ausrüstungsplätze verlangt unter seinen Modellannahmen mindestens **35 % mehr effektiven Schaden und 20 % mehr Überleben** gegenüber der Starterausrüstung. Der [frühere Balancebericht](docs/balance-report.md) legt diese Annahmen offen. Der [aktuelle Systemvergleich](docs/research-expansion-quality.md) misst zusätzlich die vier kleineren Plätze in 40 Klassen-/Stufenprofilen. Diese Modelle verwenden stationäre Gegner, feste Angriffszeit und gemittelte Mana-Rotationen und enthalten keine zusätzlichen erlernten Fähigkeiten, Talente, Sockel, Sets oder maximalen Aufwertungen. Sie belegen weder faire Schwierigkeit aller Builds noch menschliche Gruppenkoordination oder 200 Stunden Spielzeit. Dafür sind weitere echte Spielrouten und längere Gruppenläufe erforderlich.

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

Die Welt nutzt eine feste Pixelauflösung mit scharfer zweifacher Vergrößerung. Eigene Pixel-Sprites stellen Bäume, Felsen und Gegner dar. Namen und Questtexte bleiben in voller Bildschirmauflösung lesbar. Die Oberfläche verwendet dunkle Kohle- und Eisenbrauntöne mit Messingakzenten und hellen Texten.

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
| `src/abilities.js` | 64 erlernbare aktive Fähigkeiten, Voraussetzungen und gespeicherte Belegung |
| `src/bestiary.js`, `src/enemy-ai.js` | 80 regionale Arten, Bossvarianten, Kampfbudgets und tatsächliche Angriffsmuster |
| `src/arsenal.js` | Neue Waffen, Rüstung, Talismane, Vorräte, Rezepte und Händlersortimente |
| `src/interactions.js` | Zwölf Weltinteraktionsarten, Chroniken und gespeicherter Zustand |
| `src/equipment-system.js`, `src/inventory-system.js` | Sieben Plätze, begrenzte Ausrüstungswerte, Lager, Schutzmarkierungen und Vorlagen |
| `src/journey.js` | Fraktionen, Errungenschaften, Meistereide und Reisegefährten |
| `src/world-events.js` | Regionale Ereignisse, verzweigte Expeditionen und Beteiligungsbelohnungen |
| `src/navigation.js` | Questverfolgung, konkrete Reiseziele und Einstiegshilfe |
| `src/balance.js` | Rollenfaktoren, Rüstungsrating, Kampfwertgrenzen und analytische Vergleiche |
| `src/loot.js` | Seltenheiten, Basisgegenstände, Affixe, Sets, Sockel und Aufwertungen |
| `src/mobile-input.js` / `src/main.js` | Mehrfinger-Joystick, Eingabezustand, Touch-Autoziel und Spielschleife |
| `src/dungeons.js` | Dungeoninstanzen, Rätsel und Bossmechaniken |
| `src/contracts.js` | Wiederholbare regionale Aufträge, Ereignisfortschritt und validierte Belohnungen |
| `src/world.js` / `src/renderer.js` | Weltgrundlage und Canvas-Darstellung |
| `src/ui.js` / `src/network.js` | Oberfläche und Browserverbindung zum Gruppenserver |
| `server.mjs` / `server/multiplayer.mjs` | HTTP-Startfunktion, Gruppensimulation und Serverspeicherung |

Das Spiel verwendet Canvas 2D, ES-Module und die Node-Standardbibliothek ohne externe Laufzeitabhängigkeiten. `window.emberfall` erlaubt lokale Inspektion im Browser. Das 200-Stunden-Pacing-Modell in `src/progression.js` ist ausdrücklich als `design-target` mit bislang `verifiedHours: 0` gekennzeichnet.

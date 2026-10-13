# Automatische Spiel- und UX-Prüfung

Stand: 13. Oktober 2026. Diese Prüfung ist ein deterministischer Bot-Replay und eine Browserprüfung, kein menschlicher Spieltest, keine vollständige Kampagne und keine 5/5-Bewertung.

## Methode und klare Grenzen

`node tests/scripts/adventure-playthrough-audit.mjs /tmp/emberfall-adventure-audit.json` benutzt die unveränderte `Game`-Simulation mit gesetztem Zufallsstartwert. Bewegung erfolgt mit den normalen Bewegungstasten und `update(0.04)`, Zielen mit `aim`, Kampf mit `action('attack'|'bolt'|'nova'|'dash')`. Der Bot benutzt Wegsuche und kennt Gegnerpositionen, Warnzustände und die korrekte Runenfolge. Seine schnellen Reaktions- und Reisezeiten sind deshalb keine Prognose für menschliche Spielzeit.

Auf der Beginnerroute bleiben Welt, Gegner, Startwerte und Inventar erhalten: kein Teleport, kein injiziertes Item, keine veränderten Gegnerlebenspunkte. Mira wird tatsächlich erreicht und angesprochen. Vier Hainwölfe werden über gewöhnliche Angriffe besiegt, Bodenbeute wird durch Hinlaufen aufgenommen, ein Item wird mit `previewEquipment` verglichen und mit `equip` angelegt. Der Bot kehrt zu Mira zurück und gibt die Quest ab. Bei einem Startwert ohne geeigneten Wolfsfund öffnet er zusätzlich eine vorhandene Startgebietstruhe über Bewegung und Interaktion.

Für die isolierten Abenteuer sind drei Fixtures ausdrücklich gesetzt: Charakter auf Mindeststufe, Teleport zum Startzeichen und Entfernung der normalen Weltgegner. Hindernisse bleiben erhalten. Die Ereignisgegner werden regulär erzeugt und über normalen Schaden besiegt; keine Soforttötungen, keine Änderung von Gegner-HP, kein Überspringen von Kampfphasen. Die Uhr läuft durch normale Updates, nicht durch direkte Änderung von Ereignisfortschritt. Die Prüfung belegt die isolierten Abläufe, nicht ihre Erreichbarkeit oder Schwierigkeit innerhalb einer vollständigen offenen Welt.

## Prüfrunden und erneute Prüfung

Runde 1 fand zwei Fehler im Prüfcontroller: Abstand zu Mira ließ E zuerst eine nahe Quelle benutzen; der Controller versäumte außerdem, Bodenbeute aufzusammeln. Runde 2 korrigierte die Positionierung und das Aufsammeln. Dabei zeigte ein Zufallsstartwert nach vier Wölfen keinen geeigneten Fund. Runde 3 ergänzt in diesem Fall eine reale Truhe. Das sind Prüfcontroller-Korrekturen; sie dürfen nicht als behobene Spielfehler bezeichnet werden.

Nach einer Spielkorrektur priorisiert ein frisch gestarteter Charakter Mira als ausdrückliches Reiseziel. Runde 4 prüft den ursprünglichen Abstand von ungefähr 65 erneut: E öffnet jetzt tatsächlich Miras Gespräch, und die Seelenquelle bleibt unbenutzt. Runde 5 prüft zusätzlich die Quelle selbst bei voller Gesundheit und vollem Mana: Die Interaktion lehnt den Verbrauch ab. Die sechs vollständigen Routen bestehen auch nach den Korrekturen der Zielpriorität und Bossreichweite.

Runde 6 prüft das erhöhte Lebensbudget der benannten Expeditionsbosse. Beide Waldläuferläufe erleben jetzt zwei vollständige Bosszyklen. Der Replay verlangt deshalb zusätzlich mindestens zwei Zyklen vor Abschluss; der ursprüngliche Fernkampfausfall würde diesen Check nicht bestehen.

Nach dem Balancefeedback sinkt der Standardbonus der riskanten Expedition von 50 % auf 25 %. Runde 7 misst die Auszahlungen erneut aus einem vollständigen Replay. Alle sieben Checks bestehen, Kampfzeiten und erlebte Bosszyklen bleiben gleich.

Ergebnisse der siebten Runde, jeweils in simulierten Sekunden:

| Route | Klasse / Startwert | Ergebnis | Simulationszeit | Beleg |
| --- | --- | --- | ---: | --- |
| Mira → vier Wölfe → Truhenbeute → Vergleich/Anlegen → Mira | Wächter / 8264 | Abgeschlossen | 24,36 | 29 Angriffe, 3 Bastion, 2 Eiserner Wall; Quest `done`, alle vier Ziele besiegt |
| Mira → vier Wölfe → Wolfsbeute → Vergleich/Anlegen → Mira | Wächter / 9951 | Abgeschlossen | 21,96 | 23 Angriffe, 2 Bastion, 2 Eiserner Wall; Quest `done`, eigener Lootfund angelegt |
| Das letzte Begräbnis | Waldläufer / 8264 | Belohnung geborgen | 42,08 | Drei Wellen, fünf echte Gegner; 5 Angriffe, 3 Durchschlag, 2 Dornennetz |
| Trauerweg, sichere Entscheidung | Waldläufer / 8264 | Alle vier Abschnitte abgeschlossen | 19,28 | Hinterhalt, Runenfolge, Spur und Boss mit 666 HP; 15 Angriffe, 4 Durchschlag; zwei Bosszyklen, 2 HP-Schaden |
| Trauerweg, riskante Entscheidung | Waldläufer / 9951 | Alle vier Abschnitte abgeschlossen | 21,00 | Boss mit 799 HP; 18 Angriffe, 4 Durchschlag; zwei Bosszyklen, 4 HP-Schaden |
| Trauerweg, sichere Entscheidung | Wächter / 8264 | Alle vier Abschnitte abgeschlossen | 41,00 | 41 Angriffe, 4 Bastion, 3 Eiserner Wall, 9 Ausweichaktionen; Boss führt sieben Angriffszyklen aus |

Alle sechs Abläufe enden ohne Tod. Abschlussbelohnungen lassen sich jeweils nur einmal abholen. Die erste Begräbnisbelohnung beträgt 23 Gold, 73 EP und 2 Staub; die sichere Expedition 33 Gold, 97 EP und 2 Staub; die riskante Expedition 41 Gold, 121 EP und 3 Staub. Die Zahlen sind beobachtete Auszahlungen dieser Szenarien, kein Beleg für eine ausgewogene Gesamtwirtschaft.

## Kritische Befunde

**Der Ausfall der Fernkampfmechanik wurde gefunden und korrigiert.** In den Runden 1–4 beendet der Waldläufer beide Expeditionen mit null HP-Schaden und null Bosszyklen. Bei ungefähr 210 Abstand schießt er weiter, während die Trauerglocke mit bevorzugter Reichweite 170 nachläuft. Die Implementierung trennt daraufhin Angriffsreichweite und bevorzugten Abstand und richtet den ersten Ringstrahl auf eine beim Warnbeginn festgelegte Zielrichtung. Runde 5 bestätigt einen echten Bosszyklus. Nach erhöhtem Lebensbudget der benannten Expeditionsbosse bestätigt Runde 6 jeweils zwei Zyklen sowie 2 beziehungsweise 4 HP-Schaden. Der Wächter erlebt sieben Zyklen und weicht neunmal aus. Damit ist der vollständige Mechanikausfall in diesem Replay behoben; der schnelle Fernkampfsieg bleibt eine Balancefrage.

**Der Risikobonus wurde nach dem Feedback reduziert.** In der vorherigen Iteration ergaben rund 1,7 zusätzliche Sekunden und drei zusätzliche Angriffe ungefähr 50 % mehr Abschlusswährung. Der Standardbonus beträgt jetzt 25 %; der erneute Replay zahlt 41 Gold und 121 EP statt zuvor 50 Gold und 146 EP. Der beobachtete HP-Verlust bleibt 2 beziehungsweise 4; beide Waldläuferwege benötigen im Botlauf keine Ausweichaktion. Staub rundet bei diesen kleinen Mengen von 2 auf 3. Die reduzierte Belohnung entschärft die ursprüngliche Relation, belegt aber keine abgeschlossene Balance. Mehrere Klassen, menschliche Navigation und die langfristige Wirtschaft bleiben zu prüfen.

**Der Einstieg ist sehr sicher, erklärt aber nicht jeden nächsten Schritt.** Wächter erledigen die vier Wölfe ohne HP-Verlust. Das ist für den Anfang vertretbar; es prüft Ausweichen kaum. Die ursprünglich falsche Zielwahl bei mittlerem Abstand zu Mira wurde durch Priorität für das ausdrückliche Reiseziel korrigiert und in Runde 4 erneut geprüft. Ausrüstungsbeute nach vier Wölfen ist nicht garantiert; die Anfängerführung sollte auf eine erreichbare Truhe oder einen verlässlichen frühen Ausrüstungsweg hinweisen, wenn Vergleich und Anlegen gelehrt werden sollen.

**Die geprüften Abenteuer sind lösbar, aber der Bot kennt ihre Lösungen.** Zieltexte nennen Haltezeit, Runenfolge, zu bindende Spuren und das goldene Belohnungszeichen. Es wurde kein unmöglich abzuschließender Zustand gefunden. Das beweist nicht, dass neue Spieler die Zeichen ohne Anleitung entdecken; ein menschlicher Test des ersten Versuchs bleibt offen.

## Browser und Darstellung

`node tests/scripts/darkness-browser-smoke.mjs /tmp/emberfall-audit-ui-final --flows` wurde vor und nach den Korrekturen zusätzlich ausgeführt: Desktop 1440 × 1000 und Mobil 390 × 844; keine JavaScript-/Konsolenfehler und kein horizontales Seitenüberlaufen. Die Browseraktionen prüfen tatsächliche Schaltflächen für Inspect, Favorit, Lager, Ausrüsten, Preset, Talentreset, Gefährte, Errungenschaft, Reiseziel und Wiederladen. Die dort verwendeten Level-, Item- und Fortschrittsfixtures sind Funktionsprüfungen und keine Gameplaybelege.

Inspect, Gesamtwertvergleich und Paperdoll wurden in den erzeugten Bildern betrachtet. Der Weltbildschirm hält die Mitte überwiegend frei. Die erste mobile Prüfung fand doppelte „Ausrüstung & Werte“-Beschriftung, viel Navigation oberhalb der Figur und einen teilweise abgeschnittenen Inspect-Namen nach Favoritenklick. Nach den UI-Korrekturen zeigt die erneut betrachtete mobile Aufnahme klar getrennte „Charakter/Talente“-Navigation, mehr Platz für die Slotfigur und den vollständig sichtbaren Inspect-Namen mit Rückweg zur Beute. Alle Browserflows bestehen weiterhin. Lange Gegenstandsnamen werden in den schmalen Paperdoll-Slots verkürzt; vollständige Detailinformationen benötigen deshalb weiterhin die Auswahl des Gegenstands. Screenshots und vollständige Messdaten liegen in den angegebenen `/tmp`-Ausgabeverzeichnissen; der reproduzierbare Prüfcode gehört zum Repository.

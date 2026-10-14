# Version 8: messbare Herausforderung und Folgen eines Todes

V8 vergleicht die unveränderte V7-Basis `d6fc0b005d523d0f9c8f24c906a96e7ee765c3d4` mit tatsächlichen Kämpfen und legalen Charakteren. Sechs parallele Arbeitsbereiche untersuchten Klassenwerte, Fähigkeiten/Talente, Gegner/Dungeons, Welt-/Gruppendruck, mobile Todesabläufe und unabhängige Kampfregressionen. Die Ergebnisse bestimmen gezielte Änderungen; sie beweisen keine mathematisch optimale Balance aller zufälligen Gegenstände oder menschlichen Spielweisen.

## Kampfänderungen

- Passiver Lebensraub sinkt von höchstens 12 auf 8 %. Zusätzlich teilen alle eigenen Treffer, Flächen, Wunden und Diener ein Budget von 2 % maximalem Leben pro aktiver Sekunde, mit höchstens einer Sekunde Guthaben. Reisen, Laden und der Export eines Gruppencharakters erhalten den Rest; der Netzwerkclient übernimmt den autoritativen Wert des Servers. Direkte Klassenheilungen bleiben eigenständig.
- Normale Treffer erzeugen keine globale Immunität mehr. Derselbe Angreifer erhält eine kurze Trefferpause von 0,24 Sekunden vor Stufe 12, danach 0,16 Sekunden; andere Angreifer können weiterhin treffen. Ausweichrollen und ausdrücklich ausgelöster Schutz behalten ihre Wirkung. So können große Rudel defensive Aufbauten tatsächlich überfordern.
- Ein Spieler hat höchstens acht lebende beschworene Diener. Grund- und erlernte Fähigkeiten teilen diesen Wert; ein voller Bestand verbraucht weder Mana noch Abklingzeit. Gefährten und Beschwörungen anderer Spieler zählen getrennt.
- Grundfähigkeiten und Ausweichabklingzeit bleiben beim Laden erhalten. Der erlernte Wächterspott berücksichtigt seine richtige Reichweite und kann Gegner im vorgesehenen Radius zuverlässig binden.
- Alle fünf Solo-Dungeonbosse führen angekündigte Ring-, Fächer- und Positionsangriffe aus. Ihre nächsten Phasen wechseln bei 65 und 30 % Leben. Boss-/Championrückstoß ist stark gedämpft und während einer Warnphase gesperrt, damit normale Angriffe weder Warnorte verschieben noch den Kampf ständig am Heimatradius abbrechen.
- Siegelwächter verwenden die tatsächliche Dungeonstufe: ihr Rohschaden auf Stufe 15/40/100 beträgt vor Tiefe-Modifikatoren 35/56/106. Dies entschärft frühe und verstärkt späte Begegnungen.
- Nahe lebende Gruppenmitglieder erhöhen das Leben neu entstehender Weltbosse um 55 %, gewöhnlicher Aktivitätsgegner um 35 % und Aschenjagdgegner um 20 % je zusätzlicher Person. Acht Spieler ergeben maximal 4,85/3,45/2,40-faches Leben. Der Spawnwert bleibt nach Beitritt oder Abreise unverändert; Einzelschaden und Warnzeiten werden dafür nicht erhöht.
- Warnende oder aktive nahe Begegnungen verhindern das Stapeln neuer Aktivitäten. Graue Weltaktivitäten mit mindestens 20 Stufen Abstand geben gewöhnliche Beute, ein Zehntel Gold und keinen Glutstaub; sie treiben den legendären Pechschutz nicht hoch. Wiederholungsbeute nach zwei bezahlten Abschlüssen verwendet reguläre Fundchancen.

## Ein Tod kostet genau einmal

Die Gebühr lautet `max(ceil(Gold × 0,10), 5 + ceil(Stufe / 2))`. Sie wird unmittelbar beim tatsächlichen PvE-Tod gespeichert, auf dem Spielserver vor dessen nächstem periodischen Speichern. Vorhandenes Gold bezahlt die Gebühr; fehlendes Gold wird zur dauerhaften Rettungsschuld. Ausrüstung, Questgegenstände, Erfahrung und erreichte Stufen werden nicht gelöscht.

Beispiele: Stufe 1 ohne Gold erzeugt sechs Gold Schuld. Auf Stufe 20 mit drei Gold werden drei Gold bezahlt und zwölf Gold Schuld gespeichert. Auf Stufe 100 mit 1.001 Gold gehen 101 Gold verloren. Ein Tod ohne verfügbares Gold hat damit weiterhin eine wirtschaftliche Folge.

Ein Viertel künftiger Goldeinnahmen tilgt offene Schuld. Alle gewöhnlichen Goldquellen – Gegner, Quests, Aufträge, Errungenschaften, Verkauf, Truhen, Weltobjekte, Aktivitäten und Dungeonabschlüsse – laufen über dieselbe Buchung. Bruchteile bleiben gespeichert: vier einzelne Einnahmen zu einem Gold ergeben insgesamt drei verfügbares Gold und ein getilgtes Gold. Sobald die Schuld bezahlt ist, gehört die gesamte weitere Einnahme wieder der Figur.

Der Beleg nennt die Gebühr, bezahltes Gold und neue Schuld; die Charakteransicht zeigt offene Schuld und den letzten Beleg. Die Rückkehr kostet nicht nochmals. Gruppenrettung und erlernte Wiederbelebung schließen denselben Todesfall. Reload eines bereits bezahlten Todesfalls rettet einmal, ohne eine weitere Gebühr; alte Null-Leben-Spielstände erhalten dieselbe Regel. Ein weiterer tatsächlicher Tod erzeugt einen neuen Beleg. Freiwillige PvP-Duelle bleiben vollständig ohne wirtschaftlichen Verlust.

Ungültige Belege, Schuldwerte und Lebensraub-Speicherwerte werden vor dem Ersetzen einer Reise abgewiesen. Das ist Datenvalidierung, kein Schutz gegen absichtliches Zurückspielen alter Offline-Exporte.

## Prüfumfang und Ergebnis

- [Klassenmatrix](v8-class-balance.md): 432 legale Aufbauten aus acht Klassen, sechs Stufen, drei Ausrüstungsqualitäten und drei Wegen; 1.296 stationäre plus 96 reaktive Kämpfe je Fassung. Ohne Warnungsvermeidung steigen Tode von sieben auf 43; mit Warnungsvermeidung bleiben 91 Siege, fünf lebende Zeitüberschreitungen und kein Tod.
- [Fähigkeitsprüfung](v8-ability-balance.md): alle 440 Paare der beiden zusätzlichen Fähigkeitsplätze, echte Mana-/Abklingkosten sowie alle 88 Aktiven und 196 Talentdefinitionen. Vollständig bezahlte Builds und gezielte Heil-/Schildextreme ergänzen die Kombinationen. Mehrere konkrete Buildstrategien werden gemessen, keine mathematische Suche über jeden möglichen Punktetat.
- Gegnerprüfung: 1.328 Arten-/Klassenbudgetzeilen und 1.920 Dungeon-/Tiefen-/Klassenzeilen ergänzen 40 tatsächliche Solo-Dungeonduelle und 64 tatsächliche Championproben. Alle 40 Dungeonduelle gewinnen mit einfachen Klassenaktionen; Bosse führen dabei echte Angriffe aus. Die 64 Championproben gewinnen ohne die vorherigen Rückstoß-/Heimatradiusabbrüche.
- [Unabhängige Bossmatrix](v8-balance-matrix.md): 40 identische Vorher-/Nachher-Kämpfe. Acht Waldläufer besiegen Irdan jetzt in 5,16 statt 0,32 Sekunden; der Boss führt zwei statt null Angriffszyklen aus. Gegen Asterion steigt der aufsummierte Gruppenlebensverlust unvorsichtiger Waldläufer von 4,96 auf 43,34 %. Alle 20 reaktiven und alle 20 offensiven unvorsichtigen Proben gewinnen weiterhin; defensive Rollen bleiben stark.
- [Weltdruckprüfung](v8-world-balance.md): 54 identische Kampfszenarien je Fassung und zwölf echte Weltbossgruppen mit einer, zwei, vier und acht Personen. Passive Figuren sterben im Mittel nach 17,5 statt 29,1 Sekunden. Reaktive Figuren behalten 15 Siege, drei lebende Zeitüberschreitungen und keinen Tod. Die ursprünglichen Warnzeiten und Spawntakte bleiben erhalten.
- Mobile Prüfung: 40 lokale Todes-/Reload-/Tilgungsabläufe in vier Ansichten, sieben reale HTTP/SSE-Gruppen-/PvP-/Rückkehrabläufe sowie 40 HUD-Ansichten in fünf Größen. Todesbeleg und Schuld erzeugen keine zusätzliche HUD-Meldungsfläche; die Hinweiszeitleiste zeigt weiterhin höchstens eine Meldung.

Die reproduzierbaren Tests und nativen Audit-Skripte liegen im Repository. Ausführliche temporäre JSON-Berichte und Screenshots liegen im Arbeitsbereich unter `/workspace/scratch/emberfall-v8-preview` beziehungsweise den in den Einzelberichten genannten `/tmp`-Pfaden; Laufzeitdaten und Build-Ausgaben werden nicht in Git aufgenommen. Menschliche Langzeitproben und sämtliche zufälligen Loot-/Sockel-/Setkombinationen sind durch diese begrenzten Matrizen nicht vollständig abgedeckt.

Abschlussprüfung der V8-Quellen: `npm test` besteht mit **783/783 Tests**. Der statische Build gelingt mit `npm run build`; die Veröffentlichung vergleicht jedes ausgelieferte Artefakt bytegenau mit dem Quell-Commit. Koop und PvP verwenden weiterhin den Node-Spielserver, während Sites den statischen Einzelspielerbuild ausliefert.

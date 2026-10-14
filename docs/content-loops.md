# Neue Inhalte in fünf Entwicklungsrunden

Diese Erweiterung entsteht auf Wunsch des Nutzers in mindestens fünf aufeinander aufbauenden Runden. Jede Runde fügt spielbare Inhalte hinzu und prüft ihre Integration. Bestehende Spielstände, die mobile Hinweisleiste aus Version 5.1 und die vorhandene GitHub-/Sites-Zuordnung werden weitergeführt.

## Loop 1: acht Nebengeschichten

24 neue Aufgaben erweitern den Katalog von 72 auf 96 Quests. Acht dreiteilige Geschichten führen durch Dämmerhain, Aschenmoor, Sonnensteppe, Jadeauen, Sturmküste, Obsidianpass, Traumsenke und Sternensund. Ihre Mindeststufen reichen von 3 bis 96. Sie verwenden tatsächliche Chroniken, Gefangene, Mechanismen, Handwerk, Schreckensfürsten und Ereignis-/Expeditionsabschlüsse.

Bereits entdeckte Orte und verbrauchte einmalige Weltobjekte können als vorhandene Hinweise anerkannt werden. Herstellung, neue Bosskämpfe und Abenteuerabschlüsse bleiben frisch. Jedes letzte Kapitel erfordert einen neuen Ereignis- oder Expeditionsabschluss; Belohnungen sind einmalig und bestehen aus begrenzten EP, Gold und passenden Vorräten. Die 72 bestehenden Quests wurden nicht umgeschrieben.

Die Chronik bietet Inhalts-, Gebiets- und Suchfilter, acht Karten pro Seite, Ketten-/Kapitelanzeigen, reale Stufensperren und den tatsächlichen Auftraggeberort. Die physische Annahme beim NPC und die bisherige Questverfolgung bleiben erhalten.

Die Gesamtprüfung nach einer Korrektur des bestehenden Auftragsgeber-Fallbacks bestand mit 512 Tests. Weitere gezielte Prüfungen decken alle 24 Kapitel über native Spielmethoden, gemeinsame verbrauchte Hinweise, frische Ziele, Navigation, gespeicherte Zwischenstände und einmalige Auszahlungen ab. Fünf HTTP-Prüfungen testen zusätzlich eine vollständige dreiteilige Geschichte über echte Serverbefehle. Einzelne Kampffiguren in diesen Funktionstests erhalten ausdrücklich ein Lebenspunkt-Fixture; daraus wird kein menschlicher vollständiger Kampfspieltest abgeleitet.

Die native Chromium-Prüfung testet zusätzlich 46 echte Journal-/NPC-/Questaktionen auf 390 und 1440 Pixeln. Zwölf Geometrieaufnahmen haben keine Hinweisüberlagerung, keinen horizontalen Überlauf und keine Laufzeitfehler gezeigt.

## Loop 2: sechs eigenständige Bossjagden

Sivra (Stufe 4), Irdan (12), Orsa (28), Vey (52), Nera (76) und Asterion (100) erweitern die offene Welt um sechs freiwillige Bossjagden. Ringinnenräume und Lücken, eingefrorene Sichelbahnen, durch Deckung gestoppte Anstürme, wandernde Brandung, gespeicherte Wegpunkte, begrenzte Spiegelprojektile und blaue sichere Narbenfelder bieten unterschiedliche Gegenmaßnahmen. Unter Lebensschwellen wechseln die angekündigten Folgen; eine bereits sichtbare Warnung bleibt unverändert. Siedlungen schützen auch andere Gruppenmitglieder vor diesen Angriffen.

Das Abenteuerjournal begrenzt die Liste auf sechs Karten und bietet Inhalts-, Zustands-, Gebiets- und Suchfilter. Karten zeigen Mindeststufe, Soloregel, Gegenstrategie und die tatsächlich zustehende Beute einschließlich grauer EP und Wiederholungsabschlägen. Eine bereits vom ersten Teilnehmer geborgene Gruppenbelohnung bleibt für weitere berechtigte Teilnehmer verfügbar. Entfernte Ereignisse können über die globale Serverübersicht markiert werden.

Die ursprünglichen 20 Aktivitäten behalten ihre Koordinaten. Alte Netzwerk-Spielstände werden mit allen 26 kanonischen Aktivitäten wiederhergestellt, statt neue Definitionen durch die gespeicherte alte Welt zu verlieren. Unterbrochene Kämpfe scheitern sicher; bereits bezahlte Läufe bleiben bezahlt.

Die Gesamtprüfung nach dem Kampffeinschliff besteht mit 552 Tests und erfolgreichem Build. Neun HTTP-Inhaltsprüfungen decken unter anderem sämtliche sechs nativen Bossereignisse, Beteiligung, einmalige Beute und alte Spielstände ab. 28 native Browseraktionen auf 390/1440 Pixeln prüfen die Abenteuerliste und tatsächliche HTTP/SSE-Fernmarkierung; acht Geometriescreens zeigen keine Hinweisüberlagerung, keinen Überlauf und keine Laufzeitfehler. Vierzehn zusätzliche Touch-Aufnahmen auf 360×640 prüfen die echten Warnformen und bewegte Brandung. Funktionstests mit ausdrücklichen Lebenspunkt-Fixtures sind von vollständigen Kämpfen zu unterscheiden.

24 native Kampfmessungen verwenden die echten Jagdspawns und unveränderte Lebens-/Schadensbudgets, mit stufenlegaler Rare-Ausrüstung, begrenzten Talentpunkten, Ranger/Guardian und reaktivem bzw. unvorsichtigem Steuerungsbot. Umgebungsgegner und der zusätzliche Wildnisdirektor sind ausdrücklich isoliert. Alle Kämpfe enden mit drei bis elf Bossaktionen und einer korrekten einmaligen Belohnung. Die frühen Bosse Sivra/Irdan erhielten nach zunächst nur ein bis zwei Aktionen mehr Ausdauer. Ein tatsächlich reproduzierter Rückstoßfehler erlaubte Nahkämpfern, den Boss ins sichere Dorf oder aus dem Abenteuer zu drücken; kuratierte Bosse widerstehen nun Rückstoß und bewegen ihren eingefrorenen Angriffsursprung während der Warnung nicht. Phasen setzen bei der nächsten passenden Aktion fort. Diese Botmessungen prüfen die Mechanik; sie sind keine menschliche Schwierigkeitsbewertung oder vollständige Kampagne.

Die folgenden Runden ergänzen neue Expeditionen, Wellenprüfungen und weitere Fortschrittsziele. Ihre tatsächlich umgesetzten Regeln und Ergebnisse werden jeweils nach der Prüfung hier ergänzt.

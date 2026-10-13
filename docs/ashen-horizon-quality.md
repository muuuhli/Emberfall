# Emberfall 5.0: Prüfung des Aschenhorizonts

Version 5 ergänzt die bestehende Reise um ein Jagdtagebuch mit elf Jagden und fünf gezielten Belohnungen, zwei sehr seltene Waffensiegel, freiwillige Duelle, eigene Klanglandschaften und zusätzliche originale Pixelzeichnungen. Die [Systemanalyse](reference-rpg-systems.md), die [Abenteueranalyse](reference-adventure-systems.md) und die [Abnahme von Version 4](research-expansion-quality.md) bilden den dokumentierten Ausgangspunkt. Referenzquellen, Gestaltungsvorschläge und tatsächlich ausgeführte Emberfall-Prüfungen bleiben getrennt.

## Fünf Qualitätsdimensionen

| Dimension | Änderung in Version 5 | Beleg und Grenze |
| --- | --- | --- |
| Bedienung | Das Jagdtagebuch zeigt Aufgaben, Fortschritt, Jagdsiegel und erreichbare Belohnungen. Der Siegelinspektor erklärt Wirkung, Herkunft, Fundchance und Aufwertungen. Drei eigene Regler steuern Gesamtlautstärke, Musik und Effekte. Duelle zeigen Einladung, Zustimmung, Countdown, Gegnerleben und Rückkehr. | [Browserprüfung](../tests/scripts/v5-browser-smoke.mjs) verwendet echte Chromium-Eingaben auf Desktop und Mobilgerät, getrennte Browser-Speicher und zwei HTTP/SSE-Sitzungen. Stufe, fertige Jagdziele und ein seltener Fund werden ausdrücklich als Fixtures vorbereitet. Die Prüfung ersetzt keine größere Gruppe menschlicher Spieler. |
| Buildtiefe | Siegel ergänzen eine bereits regulär gerollte Klassenwaffe um eine begrenzte Nebenwirkung. Jagdsiegel ermöglichen gezielte seltene Ausrüstung und eine später freigeschaltete epische Klassenwaffe. Reisebuilds bleiben in Duellen vollständig außerhalb der Kampfberechnung. | [Relic-Regeln](../tests/relics.test.js), [Endgame-Regeln](../tests/endgame.test.js) und die [unabhängige Integration](../tests/ashen-horizon-network.test.js) prüfen Grenzen, echte Game-Werte, Klassen-/Slotverträglichkeit und Speicherzustände. Optimale Kombinationen aus legendären Funden, maximalen Talenten und sämtlichen Gefährten wurden nicht durch menschliches Langzeitspiel beurteilt. |
| Abenteuer | Acht Dungeonpfade und drei offene Weltjagden verbinden mehrere unterschiedliche Ziele. Höchstens zwei Jagden laufen zugleich; Teilfortschritt hat kein Ablaufdatum. Optionale Artenchampions kehren nach sechs aktiven Spielminuten zurück, sobald alle relevanten Spieler ausreichend weit entfernt sind. | Ein echter HTTP-Angriff tötet die Jagdgegner, der Fortschritt übersteht einen Serverneustart, ein vollständiger Lauf zahlt seine kanonische Belohnung einmal. Ein tatsächlicher Game-Kill prüft Champion-Wiederkehr, Speicherrestzeit und die Blockade durch einen nahen Mitspieler. Die Kampf-Fixtures verkürzen Gegnerleben gezielt; sie messen keine menschliche Kampfzeit. |
| Persistenz und Balance | Seltene Metadaten enthalten keine frei festlegbaren Kräfte. Siegel teilen eine gespeicherte Erholung über Waffenwechsel hinweg. Jagdbelohnungen beachten die höchste Stufe bereits abgeschlossener Jagden. Duellansichten erhalten eine separate, kanonische Reisebasis für Export und Wiederaufnahme. | Die Integrationsprüfung lädt Gepäck, Lager, Preset, Siegel, Jagdgeschichte und Lautstärke wieder. Manipulierte Siegelherkunft, Kräfte, Erholung und Jagdbilanzen werden atomar abgelehnt. Volles Gepäck verbraucht keine Jagdsiegel und keine Gegenstands-ID. Die Fundraten unten sind festgelegte Wahrscheinlichkeiten, keine gemessene menschliche Farmdauer. |
| Technik und Präsentation | Duelle simulieren separate Arenaakteure serverseitig. Wiederholte Arenasnapshots erhalten dieselbe Weltreferenz im Browser und damit die statischen Terraincaches. Neue Klassenschläge, Zauber- und Dashakzente verwenden originale Pixelcluster. Kartenmerkmale stammen aus der vorhandenen Welt. Klang wird im Browser prozedural erzeugt. | [PvP-HTTP-Tests](../tests/pvp.test.js), [Serverintegration](../tests/v5-server.test.js), [Kartenprüfungen](../tests/map-art.test.js) und [Audioprüfungen](../tests/audio.test.js) prüfen Autorität, Geometrie und begrenzte Ressourcen. Sprach-/Bildschirmleserabnahme, dauerhaftes Internethosting, Paketverlust, mobile Gerätevielfalt und eine lange FPS-/Serverlastmessreihe bleiben offen. |

## Kritische Integrationsrunden

### 1. Isolierte Duellansicht mit sicherer Rückkehr

Die ursprüngliche Snapshotübernahme setzte jede Welt ohne Dungeoninstanz als Oberwelt. Eine Arena hätte dadurch die Reiseweltreferenz überschrieben. Der Client erhält jetzt die vorherige Oberwelt, setzt Positionsinterpolation beim Weltwechsel zurück und übernimmt normalisierte PvP-Werte ausschließlich als ephemere Ansicht. Bei der Rückkehr entfernt er Arena-Felder und erhält wieder die autoritativen Reise- und Erholungswerte.

Der Sichtabgleich zeigte zusätzlich, dass absolute Zielkoordinaten noch zur vorherigen Welt gehören konnten. Ein Weltwechsel löscht deshalb das alte Ziel und ausstehende Eingaben. Ein eigener Callback leert außerdem die privaten Tastatur- und Touchzustände im Hauptprogramm. Die enge Clientprüfung zählt genau einen Reset beim Eintritt und einen bei der Rückkehr; wiederholte Arena-Snapshots setzen laufende Eingaben nicht zurück.

Ein direkter Browser-Resume in ein laufendes Duell benötigt zusätzlich die originale Serverreise: Vor der Verbindung existiert im Browser möglicherweise nur ein anderer Offlinecharakter. Der Server liefert dafür bei der initialen Antwort `pvpTravelSave`. `Game.capture()` exportiert während des Duells diese kanonische Basis. Gruppentrennung entfernt sämtliche PvP-Felder vor dem Laden des zuvor gesicherten Offlinecharakters. Die unabhängige Prüfung verwendet absichtlich verschiedene Offline- und Serverstufen, Goldbeträge und Lautstärken.

Der UI-Abgleich fand außerdem einen tatsächlichen Aufruffehler: Die Schaltflächen für Zurückziehen, Aufgeben und Rückkehr übergaben ein zusätzliches `undefined`, das im HTTP-Array zu `null` wurde. Der Server erwartet exakt null Argumente. Die UI ruft diese drei Methoden nun ohne Parameter auf; Einladung, Annahme und Ablehnung erhalten jeweils ihre ID. UI-Regressionsprüfungen und die echte Zweiclient-Browserfolge prüfen beide Verträge.

### 2. Wiederholbare Jagden ohne Abkürzung zur Endgame-Ausrüstung

Die drei offenen Jagden wurden an die tatsächlichen Stufen ihrer Regionen angepasst. Ein weiterer Wirtschaftsabgleich begrenzt die Stufe gezielter Ausrüstung durch die höchsten bereits abgeschlossenen Jagden: Ein Charakter auf Stufe 100 mit ausschließlich frühen Wurzelpfaden erhält höchstens Stufe-34-Ausrüstung und kann keine epische Stufe-45-Waffe freischalten. Erst ein relevanter später Abschluss öffnet höhere Belohnungen. Gesparte Jagdsiegel bleiben erhalten.

Die enge HTTP-Regressionsprüfung führt beide Einkäufe tatsächlich aus und lädt das Ergebnis nach einem Serverneustart wieder. Eine weitere Prüfung füllt 240 Gepäckinstanzen: Der abgelehnte Einkauf verändert weder Jagdsiegel noch die Beuteseriennummer. Nach dem Einlagern eines vorhandenen Gegenstands gelingt genau ein regulärer Rare-Waffenfund mit dem richtigen Klassen- und Ausrüstungsplatz. Diese Belohnung nimmt nicht an der Siegel-Lotterie teil.

### 3. Seltene Siegel mit begrenzter, gespeicherter Wirkung

Die beiden Siegel stammen ausschließlich aus geeigneten tatsächlichen Gegner-, Boss- oder Dungeonboss-Waffenfunden. Händler, Herstellung und Vorratskisten erzeugen sie nicht. Herkunft, Klasse, Stufe, Tiefe und exakte Metadaten werden beim Laden validiert; zusätzliche frei erfundene Kräfte werden abgelehnt.

Das Mondsiegel verlangsamt einen normalen Gegner zwei Sekunden um 20 Prozent, einen Boss eine Sekunde um 10 Prozent. Es besitzt zwölf Sekunden gemeinsame Erholung. Das Sternensiegel gewährt drei Sekunden Schutz aus 3,5 Prozent des maximalen Lebens, höchstens 85 Schutz, mit sechzehn Sekunden Erholung. Beide erweitern die Nebenwirkung; ihre regulären Waffenwerte bleiben unverändert. Sockel, Tiefe und Aufwertung vervielfachen die Siegelwirkung nicht. Im Duell ruhen beide Siegel.

Ein tatsächlicher positiver Game-Treffer aktiviert den Schutz. Das unmittelbare Wechseln auf eine zweite Siegelwaffe umgeht die Erholung nicht. Lager, Preset und Save/Restore erhalten Metadaten und die verbleibende gemeinsame Erholung. Der Abgleich korrigierte außerdem einen verbleibenden alten Verlangsamungsfaktor nach Ablauf eines Mondsiegels, damit ein späterer kurzer Bosseffekt nicht die stärkere vorherige Wirkung übernimmt.

### 4. Lesbare Arena und begrenzte Darstellung

Eine Arena ist kleiner als ein großer Desktopviewport. Die bisherige Kamerabegrenzung konnte dabei umgekehrte Mindest-/Höchstgrenzen erhalten und die Arena an den Rand verschieben. Kleine Welten werden jetzt auf ihr eigenes Zentrum ausgerichtet. Gegner im Duell erhalten sichtbare feindliche Gesundheitsbalken; gemeinsame PvE-Objekte und Wegmarken erscheinen dort nicht.

Die echte mobile Sichtprüfung fand anschließend drei Startmeldungen über dem Spieler sowie einen einzelnen umgebrochenen Buchstaben auf der Rollenschaltfläche. Beim Arenaeintritt werden alte Hinweise bereinigt; Countdown und eigener HUD übernehmen die Startinformation. Die mobile Schaltfläche zeigt „Rollen“, ihr vollständiger zugänglicher Name bleibt „Schattenrolle“. Diese Befunde stammen aus tatsächlichen 390 × 844-Screenshots.

Neue Klassenschläge, Zauber- und Dashakzente bleiben auf dem vorhandenen 2×-Pixelraster. Statische Weltrequisiten und Kartenmarkierungen werden aus der aktuellen Welt gezeichnet. Die Speichergrenzen der Terrain-/Spritecaches und die Audiobegrenzungen sind durch automatisierte Prüfungen nachvollziehbar. Das Audiomodul erlaubt höchstens 24 gleichzeitig verwaltete Stimmen, vier wiederverwendete Rauschpuffer und einen Scheduler. Diese Grenzen belegen eine begrenzte Implementierung; sie sind keine gemessene FPS-Garantie auf beliebiger Hardware oder subjektive Klangbewertung.

## Fundraten und Duellregeln

Die [Siegeldefinitionen](../src/relics.js) legen folgende Chancen **je geeignetem generiertem Waffenfund** fest. Beide Ergebnisse schließen sich gegenseitig aus. Mondsiegel benötigen mindestens Stufe 20, Sternensiegel mindestens Stufe 45. Seltenheitsstufe, Tiefe und gewöhnliche Legendary-Pity erhöhen diese Chancen nicht.

| Herkunft | Mondsiegel | Sternensiegel |
| --- | ---: | ---: |
| Normaler Gegner | 0,08 % | 0,015 % |
| Weltboss | 0,8 % | 0,2 % |
| Dungeonboss | 1,2 % | 0,3 % |

Diese Angaben gelten nach dem gewöhnlichen Ausrüstungs- und Waffenwurf. Unter der expliziten Annahme von 30 Prozent Ausrüstungschance und 40 Prozent Waffenanteil liegt ein normaler Stufe-45+-Gegner bei 0,0096 Prozent Mondsiegelchance und 0,0018 Prozent Sternensiegelchance pro Niederlage. Das ist eine analytische Ableitung aus den Regeln; einzelne Spieler können sehr viel früher oder später fündig werden. Der Browser-Test erzeugt seinen Präsentationsfund deterministisch und liefert keine empirische Seltenheitsmessung.

Das [Duellmodell](../src/pvp.js) verwendet für beide Teilnehmer 300 Leben, 100 Mana und dieselben vier Arenaaktionen. Klasse und Name bleiben sichtbar; Reisestufe, Ausrüstung, Talente und Gefährten beeinflussen den Arenakampf nicht. Drei Sekunden Countdown gehen einem höchstens 90 Sekunden langen Kampf voraus. Ein Zeitlimit ergibt ein Remis. Duelle zahlen keine Erfahrung, Beute, Gold oder Ranglistenpunkte und entfernen keine Reisegegenstände. Aufgeben, automatische Rückkehr, Verbindungsabbruch und Serverneustart behalten die PvE-Reise. Andere Gruppenmitglieder verändern während einer laufenden Arena nicht die gemeinsame Dungeonwelt.

## Ergänzende native Kampfproben

Der [native Gameplay-Audit](../tests/scripts/v5-gameplay-audit.mjs) prüft die tatsächlichen Weltspawns der elf Jagden, acht Dungeonzugänge und zwölf einzelne Kämpfe in den drei offenen Jagdregionen. Sein Waldläufer beginnt auf Stufe 52, 84 beziehungsweise 100 mit sieben Rare-Teilen und passiven Rängen bis drei. Er erhält keine Siegel, zusätzlichen aktiven Techniken, Sockel, Aufwertungen oder Gefährten. Die Fixtures teleportieren ihn zum einzelnen Ziel, entfernen sonstige Gegner und Deckung und füllen zwischen Kämpfen Leben, Mana und Erholung wieder auf. Gegnerbudget und Kampfschaden bleiben unverändert; normale Game-Aktionen führen die Siege herbei.

| Jagdprobe | Bosskampfzeiten | Beobachtete Bosszyklen | Erhaltener Schaden in den beiden Bosskämpfen |
| --- | --- | --- | --- |
| Mondbruch, Stufe 52 | 9,40 / 4,08 Sekunden | 3 / 1 | 56 / 0 |
| Blutmark, Stufe 84 | 11,76 / 13,72 Sekunden | 2 / 4 | 0 / 657 |
| Nexusriss, Stufe 100 | 12,24 / 6,24 Sekunden | 4 / 2 | 813 / 0 |

Alle zwölf Einzelkämpfe werden gewonnen; der Blutmark-Beschwörer erzeugt tatsächlich sechs beobachtete Diener. Jede Probe erfüllt jeweils einen Zählschritt pro Ziel, keine vollständige Jagd oder Kampagne. Die finalen drei erforderlichen Artentötungen wurden nach der echten Spawnprüfung in den Metadaten aktualisiert; die unveränderten Kampfspuren wurden dafür nicht erneut ausgespielt. Kurze Siege und mehrere Kämpfe ohne Schaden sind ein konkreter Anlass für weitere menschliche Balanceproben, kein Beleg für die gewünschte Langzeitschwierigkeit. Der Rohbericht liegt neben den Browserbildern als `gameplay-audit.json`.

## Reproduktion und Ergebnisgrenzen

```sh
node --test tests/ashen-horizon-network.test.js
node --test tests/pvp.test.js tests/v5-server.test.js tests/endgame.test.js tests/relics.test.js tests/audio.test.js tests/map-art.test.js
node tests/scripts/v5-gameplay-audit.mjs /tmp/emberfall-v5-gameplay.json
node tests/scripts/v5-browser-smoke.mjs /tmp/emberfall-v5-preview
npm test
npm run build
```

Die eigenständige Integrationssuite besteht mit **acht Tests und null Fehlern**. Sie verwendet reale Game-Instanzen, tatsächliche HTTP-Anfragen, separate persönliche Serverzustände und echte Serverneustarts. Der abschließende integrierte Lauf vom 13. Oktober 2026 besteht mit **442 Tests, null Fehlern und null übersprungenen Tests**; `npm run build` läuft mit der letzten UI- und Rendererfassung erfolgreich durch.

Die zusätzliche Chromiumprüfung besteht mit **14 Desktop- und 13 Mobilabläufen**, insgesamt **27 ausgeführten Zustandsprüfungen**. Zwei getrennte Browsercontexts erstellen beziehungsweise betreten dieselbe echte HTTP/SSE-Gruppe, stimmen dem Duell zu, verwenden eine vorgewarnte Arenaaktion und eine native Touchrolle, geben auf, kehren zurück und erhalten nach Gruppentrennung ihre vorherige Offlinejagd und Siegelwaffe. Zuvor führen beide Modi Jagdannahme, vorbereiteten Abschluss, gezielte Belohnung, Siegelinspektion, Anlegen, Lautstärkeänderung und Neuladen aus. Der Lauf meldet keine JavaScript-/Konsolenfehler, ungültigen Zahlen oder horizontale Überläufe. Er erzeugt Bericht und Screenshots unter `/workspace/scratch/emberfall-v5-preview`.

Die letzte frische Sichtprüfung bestätigt die mobile Arena mit freiem Kampfbild, kurzer Roll-/Risskreis-Beschriftung und roter Richtungsanzeige für den tatsächlich außerhalb des Bildausschnitts stehenden Gegner. Der Ergebnisdialog zeigt Rückkehrschaltfläche und automatische Rückkehrzeit vollständig; eine redundante Ergebnismeldung überdeckt den Text nicht mehr. Derselbe finale Zweiclient-Lauf besteht erneut mit allen 27 Zustandsprüfungen.

Menschliche Langzeitspielproben, subjektive Spielspannung, Klangqualität auf mehreren Ausgabegeräten, vollständige Endgame-Buildbalance und Last unter echten Internetbedingungen sind weiterhin nicht belegt. Die bestehenden Tests und automatisierten Browserabläufe begründen keine unabhängige 5/5-Bewertung. Eine statische Sites-Veröffentlichung benötigt für Internetgruppen und Duelle weiterhin einen separat erreichbaren, dauerhaft betriebenen HTTPS-Spielserver mit den vorhandenen HTTP/SSE-Endpunkten.

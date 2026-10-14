# V14: sichtbare Pixelbeute und der nächste RPG-Ausbau

Prüfstand: 14. Oktober 2026, V13-Basis `46aee1581bd05ce1bdc65b625d960fb6ebc6ca98`, vor der V14-Umsetzung. Diese Bestandsaufnahme trennt vorhandene Funktionen von Vorschlägen. Sie bestätigt weder MMO-Kapazität noch 200 Stunden menschlich geprüfte Spielzeit.

## Was bereits trägt

Die aktiven Kataloge enthalten acht Klassen, Stufe 1–100, sieben Ausrüstungsplätze, 16 Regionen, 96 Quests, acht Dungeons einschließlich drei Raids und 104 Werkbankrezepte. Generierte Gegenstände besitzen individuelle Namen, Affixe, Seltenheit, Sockel und feste Stufenanforderungen. Vergleich, Anlegen/Ablegen, Favoriten, Schutz, Lager und Ausstattungsvorlagen funktionieren bereits. Sammeln, Pflanzbeete, Questreihen, Aufträge, Weltaktivitäten und gelernte Techniken gehören zum bestehenden Spielkreislauf; diese Schleifen bleiben erhalten.

Quellen im Projekt: `src/catalog.js`, `src/classes.js`, `src/progression.js`, `src/loot.js`, `src/equipment-system.js`, `src/inventory-system.js`, `src/game.js`. Konten speichern dieselbe Figur über Geräte und Gruppen hinweg; Gruppen sind auf acht aktive Figuren begrenzt (`server/accounts.mjs`, `server/multiplayer.mjs`, [Kontodokumentation](accounts-v12.md)).

## Konkreter Beutebefund

| Schritt | Tatsächliches Verhalten der V13-Basis | Folgerung für V14 |
| --- | --- | --- |
| Erzeugen | `Game.killEnemy` würfelt auf dem Server persönliche Beute für lebende Gruppenmitglieder innerhalb von 1.200 Welteinheiten. Drops enthalten `item`, vollständiges `loot`, `ownerId`, Position und `life:120`. Die `item`-Kennung ist individuell; ein separates `drop.id` fehlt. | Darstellung aus dem echten Gegenstand ableiten. Neue Pixelbilder dürfen weder Rollwerte noch Dropchance verändern. |
| Übertragen | `MultiplayerHub.snapshot` überträgt nahe Drops samt `loot`; `NetworkClient.applySnapshot` übernimmt sie. Noch liegende Gegenstände gehören nicht zu `generatedItems` der empfangenden Figur. | Für Namen und Bilder zuerst `drop.loot` verwenden. Ein Inventar-Lookup allein reicht vor der Aufnahme nicht. |
| Aufnehmen | `Game.updateWorld` nimmt automatisch unter 40 Welteinheiten auf. `ownerId` muss zur lebenden Figur passen; `addItem` lehnt einen neuen generierten Gegenstand bei 240 belegten Beuteplätzen ab. | Besitz und tatsächlicher Serverbestand bleiben die Autorität. Eine neue Schaltfläche sendet ausschließlich eine Kennung. |
| Voller Rucksack | Einmalige Meldung je Drop über `drop.warned`; die 120-Sekunden-Frist läuft weiter. | Den Zustand sichtbar machen und direkt ins Gepäck führen. Längere Fristen oder Rückgewinnung sind eine eigene Designänderung. |
| Speichern | Aufgenommene Gegenstände werden gespeichert. Bodenbeute steht weder in `Game.capture` noch im dauerhaften Raumzustand; Neustart und Weltwechsel verlieren sie. Die regelmäßige Serversicherung erfolgt ungefähr alle zehn Sekunden. | Eine Beuteansicht darf keine dauerhafte Wiederherstellung versprechen. Dauerhafte Rückgewinnung benötigt einen geprüften Speichervertrag. |
| Zeigen | `Renderer.drop` zeichnet eine Vektor-Raute mit Seltenheitslicht und nahem Namen. Inventar und Vergleich verwenden überwiegend SVG-Symbole für die Gattung. | Der größte unmittelbare Gewinn sind erkennbare originale Pixelgegenstände in Welt, Raster und Details. |

Eine isolierte Nativeprobe mit zwei echten `MultiplayerHub`-Mitgliedern bestätigte: Der fremde Spieler kann die persönliche Beute nicht automatisch aufnehmen; sein Snapshot enthält trotzdem den kanonischen Namen. Der Besitzer erhält sie einmal. Bei voller Tasche erscheint genau eine Warnung, während die Frist weiterläuft. Die noch liegende Kennung fehlt im gespeicherten Zustand und nach einem nativen Neustart. Diese vorbereiteten Zustände sind eine Funktionsprobe, kein gespielter Bosskampf.

## Reihenfolge mit sichtbarem Nutzen

1. **Pixelgegenstände gemeinsam verwenden.** Ein originaler Atlas bzw. gemeinsamer Pixelzeichner deckt Waffenfamilien, alle sieben Plätze, Tränke und Materialien ab. Basis/Gattung bestimmt das Bild; Seltenheit ergänzt Rahmen und lesbaren Text. Weltbeute, Inventar und Vergleich verwenden dieselbe Zuordnung. Integer-Skalierung und ausgeschaltete Glättung passen zur bestehenden Canvas-Pixelwelt. Fehlende Bilder erhalten einen passenden Gattungsfallback. Namen und Werte bleiben die tatsächlichen Rollwerte.
2. **Beute bewusster lesen.** Eine kompakte Auswahl zeigt nahe eigene Funde mit Bild, Name, Seltenheit, Platz und erforderlicher Stufe. Antippen, Tastatur und Desktop öffnen dieselben Details. Nach automatischer Aufnahme führt die Auswahl zum realen Inventargegenstand. Die bisherige automatische Aufnahme kann dabei zunächst erhalten bleiben; neue modale Fenster dürfen den gemeinsamen Kampf nicht pausieren. Ein abgelaufener Fund bleibt kein aktiver Aufnahmebutton.
3. **Gezielte Aufnahme separat absichern.** Falls ergänzt: `pickupDrop(dropId)` akzeptiert genau eine begrenzte Zeichenkette. Server und native Spielmethode prüfen lebende Figur, aktuelle Welt, Entfernung, Besitzer, positive Restzeit und Kapazität; sie lesen den Gegenstand aus dem vorhandenen Drop. Nach erfolgreichem `addItem` wird derselbe Drop verbraucht. Wiederholung, fremde Kennung, Duell, entfernte Position und abgelaufene Beute verändern keinen Bestand. Automatische und gezielte Aufnahme teilen diese Prüfung. Keine übertragenen Itemobjekte, Preise, Affixe oder Besitzer vom Browser übernehmen.
4. **Verlustschutz bewusst entscheiden.** Eine spätere persönliche Rückgewinnung für volle Taschen benötigt Begrenzung, Ablauf, Besitzbindung, atomare Sicherung und einmalige Auszahlung. Ein Postfach nur als Oberfläche über verschwundener Beute wäre irreführend. Für wertvolle bestätigte Aufnahmen zuerst die Wiederherstellung nach Serverneustart und Speicherfehlern prüfen.

Diese Schritte erhöhen die Lesbarkeit und die Zahl sinnvoller Beuteentscheidungen. Sie erhöhen keine Wertebudgets, EP-Erträge, Seltenheitschancen oder Stufenfreigaben.

### Lokal umgesetzter Beutevertrag dieser Runde

V14 ergänzt `Game.pickupLoot(itemId)` und die Kontextaktion E für gültige eigene Funde unter 85 Welteinheiten. Automatische Aufnahme bleibt unter 40 Welteinheiten erhalten; beide Wege benutzen dieselben Prüfungen. Neu erzeugte Gegnerbeute wartet vor der Aufnahme 0,55 Sekunden (`pickupAfter`), damit der tatsächliche Fund sichtbar landen kann. Alte vorbereitete Drops ohne dieses Feld bleiben sofort aufnehmbar. Die bestehende `drop.item`-Kennung reicht aus; es wird keine zweite Itemkopie oder neue Speicherstruktur eingeführt.

Erfolgreiche Aufnahme ergänzt eine optionale `itemId` in der Beutemeldung. Der Server überträgt sie nur für einen bekannten Gegenstand im eigenen Gepäck; der Client prüft diesen Besitz nach Übernahme des Snapshots erneut. So kann die Oberfläche den echten aufgenommenen Gegenstand ansehen, ohne ihn nochmals aufzunehmen oder automatisch anzulegen. Bestehende Meldungen behalten ihren bisherigen Vertrag. Acht neue Prüfungen in `tests/ground-loot-v14.test.js` decken native Erzeugung/Aufnahme, zwei echte HTTP-Figuren, gefälschte Payloads, Besitz, Distanz, Verfall, volle Taschen, Duellsperre und die Browserweiterleitung ab. Bodenbeute wird weiterhin nicht dauerhaft gespeichert; automatische Aufnahme löst keine zusätzliche JSON-Sicherung aus.

## Was für eine WoW-artige Browserwelt noch fehlt

Blizzards offizieller [Einsteigerguide](https://worldofwarcraft.blizzard.com/en-us/news/24266319/new-players-starter-guide-welcome-to-world-of-warcraft) nennt Gilden, Chat, Auktionshaus sowie Gruppen-Dungeons und Raids als Teile seiner sozialen Erfahrung. Der historische [WoW-Classic-Einstieg](https://worldofwarcraft.blizzard.com/en-us/news/23090134/wow-classic-primer-for-new-players) beschreibt unter anderem Berufslehrer und gemeinsam vereinbarte Beuteregeln. Diese Referenzen begründen die folgenden Gestaltungsrichtungen; sie sind keine Zusage, sämtliche WoW-Systeme zu kopieren oder Blizzards Grafiken zu verwenden.

| Bereich | Emberfall-Stand | Nächster sinnvoller Ausbau |
| --- | --- | --- |
| Wiederkehrende Gemeinschaft | Offene Gruppen, Codes, Links und gespeicherte Konten; keine Freundes-/Gildenliste oder Spielkommunikation. | Zuerst Kontakte und Wiederbeitritt zu bekannten Mitspielern, anschließend begrenzter Gruppenchat mit Stummschaltung. |
| Gruppenziele | Gemeinsame Welt und Raids; Gruppenliste enthält Name, Auslastung und Verfügbarkeit. | Ziel, Dungeon, Stufenbereich und freiwillige Rollen anzeigen; vorhandene Gruppe auffindbar machen, bevor ein Matchmaker gebaut wird. |
| Öffentliche Welt | Jede persönliche bzw. Gruppenreise besitzt ihren eigenen Weltzustand. Die Gruppensimulation ist kein durchgehend gemeinsamer Realm. | Regionale Begegnungen zunächst innerhalb der bestehenden Gruppen vertiefen. Eine gemeinsame öffentliche Welt ist ein eigener Architektur- und Lasttestschritt. |
| Berufe | Aktive Werkbank-/Sammelrezepte funktionieren. `src/professions.js` enthält außerdem 20 Berufsrezepte; **keines** liegt im aktiven `RECIPES`-Katalog. `Game` nutzt daraus nur Verbrauchsprofile, keine integrierte Berufs-/Trainerlaufzeit. | Einen Beruf vollständig an Materialquellen, Lehrer, Rezeptfreischaltung, native Herstellung und serverseitig gespeicherten Fortschritt anschließen. |
| Spielerwirtschaft | NPC-Kauf/Verkauf, persönliches Lager und Ressourcen; kein Spielerhandel, Post oder Auktionshaus. | Handel erst nach atomarer Übertragung zweier Inventare, Eigentumsregeln und Duplikationsprüfungen. Die heutige Wirtschaft vorher messen. |
| Langfristige Entwicklung | Talent-/Technikwahl, Reise, Jagden, alternative Dungeonwege und Tiefenrekorde bestehen. | Mehr eigenständige regionale Folgen und nachvollziehbare Zielbeute. Die offenen Inhaltsvorschläge stehen in [Langzeitentwicklung](long-term-content-v10.md); bloß höhere Lebenswerte oder mehr identische Runs bestätigen keinen langen Spielumfang. |

Die aktuelle kleine Hetzner-Konfiguration ist auf zunächst 32 neue Konten begrenzt. Die [V13-Leistungsprobe](hosting-performance-v13.md) beschreibt acht bewegte Figuren und Anmeldespitzen; sie liefert keine MMO-Kapazitätsfreigabe. Pixelbeute sollte vorhandene Snapshots wiederverwenden und Atlasbilder gemeinsam laden, statt neue Abfragen oder Assets je Frame zu erzeugen.

## Abnahmekriterien für die nächste Beutestufe

- Weltfund, Karte und Detailansicht zeigen denselben tatsächlichen Gegenstand mit passendem Pixelbild und kanonischem Namen; alle sieben Ausrüstungsplätze und alte Spielstände besitzen Fallbacks.
- Seltenheit und Besitz sind zusätzlich zur Farbe verständlich. Auf 390 × 844 und 844 × 390 bleibt die Weltmitte nutzbar; Touch benötigt kein Hover.
- Mehrere Funde lassen sich ohne überlappende Namenswände auswählen. Aufnahme/Verfall und volle Tasche aktualisieren die Auswahl zuverlässig.
- Zwei Browser und ein Neustart prüfen die einmalige Auszahlung. Fremde, entfernte, abgelaufene und wiederholte Aufnahmekommandos ändern keinen Bestand; gefälschte Itemdaten werden verworfen.
- Die V13-Stufenlücke und Ausrüstungsfreigabe bleiben wirksam. Darstellung erhält dieselben RNG-Ergebnisse, Werte und Seltenheitsraten wie zuvor.

# Emberfall 7.0: sichtbare Ausrüstung und Klassen-Builds

Diese Erweiterung vertieft Charakteridentität und Kampfentscheidungen. Die bereits dokumentierten [RPG-Referenzen](reference-rpg-systems.md) liefern Gestaltungsprinzipien: Beute sichtbar machen, Voraussetzungen erklären, Builds mit nachvollziehbaren Vor- und Nachteilen anbieten und die Weltmitte freihalten. Grafik, Texte und Technik bleiben eigene Emberfall-Arbeit. Die Veröffentlichung behauptet keine Gleichwertigkeit mit Diablo oder World of Warcraft.

## Sichtbare Ausstattung

Alle sieben angelegten Plätze wirken auf dieselbe native Pixelfigur in der Welt und in der drehbaren Charakteransicht. Waffen erhalten zehn eigene Formen, darunter Schwert, Hammer, Bogen, Dolche, Stab und Zepter. Kleidung, Kopfschutz, Handschuhe und Schuhe verändern Form und Material; Schmuck und Elemente sitzen in kleinen Details. Seltenheit färbt nicht die ganze Figur ein. Das ursprüngliche Raster, die Klassenidentität, vier Blickrichtungen und der Fußpunkt bleiben erhalten. Die ursprüngliche Atlaswaffe wird bei einem Austausch entfernt.

Mitspieler und Duellgegner erhalten eine begrenzte Darstellung aus ihrer serverseitigen Reiseausrüstung. Diese Darstellung enthält keine Gegenstandswerte. Die vorhandenen einheitlichen Duellwerte bleiben verbindlich. Die statisch veröffentlichte Site enthält weiterhin keinen zusätzlichen Node-Mehrspielerdienst; gemeinsame Sitzungen laufen mit dem Projektserver.

## Fähigkeiten und Talente

Jede der acht Klassen erhält drei Techniken auf Stufe 16, 38 und 62. Die 24 Ergänzungen ergeben insgesamt 88 erlernbare aktive Fähigkeiten. Zwei belegbare Technikplätze verlangen weiterhin eine Auswahl und halten die Touchsteuerung kompakt.

| Mechanik | Entscheidung und Grenze |
| --- | --- |
| Kanalisieren | Drei Impulse auf einer beim Wirken festgelegten Bahn. Bewegung, tatsächlicher Lebensverlust oder eine neue erfolgreiche Aktion unterbrechen. Hindernisse blockieren Treffer; höchstens vier Ziele pro Impuls. |
| Markierungen | Zwei eigene Folgeangriffe verbrauchen begrenzte Ladungen. Der volle Bonus verlangt echte Voraussetzungen wie Verlangsamung, Spott, Brand, Fluch oder passenden Abstand. Fremde Treffer verbrauchen keine eigenen Ladungen. |
| Offensive Schritte | Der Schritt verwendet die normale Kollision. Der Angriff liegt am tatsächlich erreichten Ende; Mauern werden nicht durchquert. Keine zusätzliche Unverwundbarkeit. |
| Gegenwacht | Höchstens drei Gegenangriffe nach echtem Lebensverlust, mit mindestens einer Sekunde Abstand. Voll abgefangener Schaden löst nichts aus; Heilung hängt von tatsächlich angerichtetem Schaden ab. |

Die 32 neuen Talente ergänzen die bisherigen 164. Jede Klasse bekommt zwei zweistufige Passive auf Stufe 35 und zwei alternative Schlüsseltalente auf Stufe 70. Die neuen Schlussentscheidungen schließen einander aus. Wirkflächen, Reichweiten, Geschossverhalten, Dauer und Ressourcen werden am ausgeführten Profil verändert. Begrenzte Modifikatoren und negative Seiten verhindern kostenlose Rundumverbesserungen. Voraussetzungen, Klassenbindung und exklusive Wahl werden auch beim Import eines Spielstands geprüft; bestehende Talent-IDs bleiben erhalten.

## Kampf und Oberfläche

Der gemeinsame Animationssampler zeigt Richtung, Bewegung, Angriff, Zauber, Heilung, Schild, Ausweichen und Treffer. Sofortige Treffer beginnen in ihrer tatsächlichen Trefferphase; eine Vorbereitungsphase wird nur für tatsächlich vorbereitete Aktionen verwendet. Die Darstellung plant keinen eigenen Schaden und verschiebt den Charakter nicht. Reduzierte Bewegung behält die spielentscheidenden Hinweise bei.

Die Charakteransicht zeigt die wirklich angelegte Figur aus vier Richtungen. Such- und Zweigfilter machen die größeren Fähigkeiten- und Talentlisten erreichbar. Aktuelle Mana- und Abklingwerte stehen neben der Grundbeschreibung; Schlüsseltalente nennen ihre Kosten und Sperren.

## Prüfung

Die abschließende Gesamtsuite besteht 709 von 709 Tests ohne Fehler oder übersprungene Fälle; der Veröffentlichungsbuild läuft erfolgreich. Zusätzliche native Prüfungen belegen die folgenden konkreten Eigenschaften:

| Prüfung | Ergebnis und Umfang |
| --- | --- |
| Vollständige Boss-Builds | 16 von 16 Kämpfen mit allen acht Klassen gegen Asterion einschließlich seiner gerufenen Wächter gewonnen und die persönliche Belohnung genau einmal abgeholt. Pro Klasse gleiche sieben gültige Rare-Stücke, gleiche Talente und exakt 200 natürliche Stufenpunkte für den Vergleich bisheriger und neuer Belegung. Je zwei neue Passive und ein exklusiver Schluss sind tatsächlich gelernt. Fünf Heiltränke sind bereitgestellt. Dauer 21,44 bis 48 Sekunden, sieben bis 15 Bosszyklen. |
| Technik- und Synergietests | Alle 24 neuen Techniken erzeugen echte Treffer oder Schutz. Native Regressionen sichern drei gefundene Wechselwirkungen: Frostwacht behält ihre Laufzeit bei längerer Verlangsamung, periodische Heilung erhält den richtigen Bonus, Lebensentzug verändert auch Kanalisieren und Gegenwacht. Null- und ungültiger Schaden erzeugen keine Markierungsprocs. |
| Mehrspieler | Acht echte HTTP/SSE-Clients mit sieben Ausrüstungsplätzen; kanonische Darstellung, eigene Talentkosten, exklusive Wahl und Fortsetzung nach Serverneustart. Gefälschte Darstellungen und Aktionsstempel werden verworfen. Duelle behalten ihren einheitlichen Schaden und die unveränderte PvE-Reise. |
| Pixelgrafik | 88 gültige Ausrüstungen mit 1.824 Rasterframes unabhängig geprüft; kein Clipping, korrekte Spiegelung und Handkontakt. Alle 256 ursprünglichen Frames ohne Ausrüstung sind unverändert. Teil-Ausrüstung erhält die ursprüngliche Klassenwaffe exakt. Atlas und Metadaten bleiben bytegleich; maximale Darstellung 872 Bytes, beide Caches höchstens 160 Einträge. |
| Native Oberfläche | 88 Bedienabläufe auf 320×480, 844×390, 390×844 und 1440×1000 bestanden. Sieben Plätze wirklich angelegt, vier Blickrichtungen pixelgleich mit dem Welt-Compositor, echte Ablege- und Lernaktionen, Sperren und aktuelle Profilkosten. 32 Geometrie- und Alphaansichten ohne sichtbare Überlagerungen, Überlauf oder Browserfehler. |
| Welt-HUD | 40 Ansichten auf fünf Bildschirmgrößen sowie fünf echte Hinweistimelines: höchstens ein Hinweis, freie tatsächliche Spielfigur bei ruhender Kamera und erreichbare Touchziele. Bewegung, Kamerawackeln und sämtliche denkbaren Displays werden damit nicht pauschal zertifiziert. |

Die Bildschirmprüfungen fanden einen echten Touchfehler: Ein klebender Ausrüstungs-Inspector konnte auf kurzen Querformat-Panels die Ablegeaktion aus dem erreichbaren Bereich schieben. Er bleibt auf niedrigen Panels jetzt im normalen Scrollfluss. Kampfwinkel und vorbereitete Aktionszeiten folgen ihren tatsächlich ausgeführten Profilen, auch beim dritten Kombotreffer.

Deterministische Prüfbots, vorbereitete Inventare und isolierte Arenen sind keine menschlichen Langzeitspieltests. Der vollständige Bossvergleich verändert keine Gegnerwerte oder Trefferregeln. Nur die Positionierung am Start und an den Rufrunen, die Entfernung gewöhnlicher Umgebungsgegner und die ausgeschaltete zusätzliche Wildnisjagd sind deklarierte Prüfvorgaben; Arenahindernisse, Bewegung, Abbruch, Schaden und Belohnungen bleiben nativ. Die statische Sites-Veröffentlichung ersetzt keinen dauerhaft erreichbaren Mehrspielerserver.

Reproduzierbare Prüfskripte: `tests/scripts/v7-build-gameplay-audit.mjs`, `tests/scripts/v7-ui-browser-smoke.mjs` und `tests/scripts/hud-notice-browser-smoke.mjs`. Bildberichte bleiben außerhalb des Quell-Commits im Scratch-Verzeichnis; die bedeutungsvollen Regressionstests sind im Repository enthalten.

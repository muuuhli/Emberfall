# Pixelgegenstände und Beute – V14.0.0

Prüfstand: 14. Oktober 2026. V14 setzt die V13.0.1-Balance fort. Diese Runde erweitert Gegenstandsbilder, Inspektion und Aufnahme; sie bestätigt keine MMO-Kapazität oder 200 Stunden gespielte Kampagne.

## Originale Gegenstände

`src/item-art.js` zeichnet 52 originale Objektfamilien auf einem transparenten 32 × 32-Raster mit der vorhandenen 25-Farben-Palette. Kanonische Basisgegenstände bestimmen Silhouette und Material. Begrenzte Seltenheits-, Element-, Stufen- und Basisvarianten ergänzen Beschläge, Edelsteine und Runen; individuelle Loot-IDs oder Spielernamen erzeugen keine eigenen Grafikschlüssel. Die [Kontaktansicht](../assets/item-art-preview.png) zeigt jede Familie bei Originalgröße und dreifacher Vergrößerung. Das [Manifest](../assets/item-art-manifest.json) dokumentiert Quelle, Pivot und Varianten.

Canvas und Inline-SVG benutzen dieselben opaken Pixelreihen. Weltfunde erscheinen als reale Waffen, Rüstung oder Schmuck mit Schatten und kurzer Landung. Seltenheitsmarkierungen ergänzen die lesbare Seltenheit; fremde persönliche Beute erscheint gedimmt und heißt „Für Gefährten“. Nur der nächste eigene Fund erhält einen Namen, damit Beutehaufen keine Textwand erzeugen. Reduzierte Bewegung stoppt Landung und wandernde Funken.

Dieselben Bilder stehen im Gepäck, Inspektor, Vergleich, bei allen sieben angelegten Plätzen, im Händlerangebot, in Herstellung, Zutaten, Materialien und Sockeln. Die Itemwerte, Anforderungen und Seltenheitschancen wurden nicht geändert. Es gibt keine kopierten Franchisegrafiken oder zusätzliche Bilderdownloads je Gegenstand.

## Aufnahme und kompakte Information

Neue Gegnerbeute wartet 0,55 Sekunden vor der Aufnahme. Danach bleiben automatische Aufnahme unter 40 Welteinheiten und die eigene Kontextaktion E bzw. Touch unter 85 Welteinheiten verfügbar. Beide Wege prüfen denselben vorhandenen Drop, Besitz, Zustand, Entfernung, gültige Rollwerte und Restzeit. Wiederholte oder fremde Kommandos erzeugen keinen Gegenstand. Ein voller Rucksack meldet das Problem einmal je Drop.

Erfolgreiche Funde ergänzen die bestehende kurze Beutemeldung um ein 32-Pixel-Bild und „Ansehen“. Dieser Button und der Hinweisverlauf öffnen den tatsächlichen besessenen Gegenstand, einschließlich seiner Inventarseite. Verkaufte oder entfernte Gegenstände behalten den Meldungstext ohne aktiven Itembutton. Zusammengefasste Funde verlängern die ursprüngliche Hinweisfrist nicht.

Bodenbeute bleibt 120 Sekunden liegen und ist weiterhin nicht Teil des dauerhaften Spielstands. Neustart und Weltwechsel erhalten nur bereits aufgenommene Gegenstände. Es wurde weder ein Beutepostfach noch eine sofortige zusätzliche JSON-Sicherung je Fund eingeführt.

## Browserprüfung

Eine getrennte lokale Testreise entstand über native XP-, Gegenstands-, Ausrüstungs-, Talent- und Reisemethoden. Stufe, Lebenspunkte und Werte wurden nicht direkt gesetzt. Die deklarierte Grafikfixture besitzt einen Wächter der Stufe 27, sieben erlaubte Plätze und zusätzliche Vergleichsgegenstände. Sie wurde über den echten Dateiimport geladen; vorhandene Nutzerreisen wurden nicht ersetzt.

- Desktop: 847 × 853, alle sieben Plätze, sichtbare Rasterbilder und echter Vorher-/Nachhervergleich. [Screenshot](qa/item-art-desktop-v14.png).
- Mobil hochkant: 390 × 844, Bild und Anlegeaktion im Inspektor, kein horizontales Überlaufen (`body.scrollWidth=390`). [Screenshot](qa/item-art-mobile-v14.png).
- Mobil quer: 844 × 390, scrollbare Oberfläche ohne horizontales Überlaufen (`body.scrollWidth=844`). Dies ist eine Größenprüfung, keine Messung auf einem physischen Telefon.
- Zwei tatsächliche Gegner wurden anschließend durch normale J-Angriffe besiegt. Die zusammengefasste Fundmeldung zeigte das echte Hammerbild; der Hinweisverlauf öffnete den tatsächlich gefundenen Stufe-2-Hammer auf Gepäckseite 2. [Fundmeldung](qa/item-art-fund-v14.png). Die vorbereitete Ausrüstung ist keine Balance- oder Kampagnenprobe.

## Kosten und Prüfungen

Der Sprite- und SVG-LRU enthält jeweils höchstens 192 Formen. Der Browser hält höchstens 128 gemeinsam genutzte 32 × 32-Bitmaps; deren RGBA-Rohflächen belegen maximal 512 KiB zusätzlich zur Laufzeitverwaltung. Verdrängte Flächen werden freigegeben. Nach dem ersten Draw benötigt ein Gegenstandsbild einen `drawImage`-Aufruf. SVG fasst Pixelpfade je Palettenfarbe zusammen. Namen werden escaped; unbekannte Kennungen verwenden einen begrenzten Beutelfallback. Die Weltbeutebeschriftung wird einmal je Frame in einem Durchlauf ausgewählt.

Gezielte native Prüfungen decken alle Kataloggegenstände, sieben Plätze, gemeinsame Pixelgeometrie, sichere Markups, Cachegrenzen, Seltenheit, Besitz, Landung, reduzierte Bewegung, Itemvergleich und Hinweisfristen ab. Echte isolierte HTTP-Spieler prüfen fremde, entfernte, doppelte und gefälschte Aufnahme sowie den Browsertransport. Das frühere V5-DOM-Testdouble erhielt die tatsächlichen getrennten Bild-/Text-/Button-Elemente. Die abschließende vollständige Regression bestand mit **1.082/1.082 Tests**, ohne übersprungene Prüfungen; `npm run build` und `git diff --check` bestanden ebenfalls.

Die vorherige [Hetzner-Leistungsprobe](hosting-performance-v13.md) bleibt die Serverkapazitätsgrundlage. Die neue Grafik ist im Client; diese Runde verspricht keine höhere Spielerzahl oder geprüfte Telefon-FPS. Die [WoW-Bestandsaufnahme](wow-gap-roadmap-v14.md) beschreibt die noch fehlenden sozialen, wirtschaftlichen und langfristigen Systeme.

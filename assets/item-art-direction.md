# Emberfall: Gegenstände auf dem Pixelraster

Diese Familie erweitert die bestehenden originalen 2D-Sprites. Alle Objekte sind direkt in `src/item-art.js` auf einem 32×32-Raster gezeichnet. SVG und Canvas verwenden dieselben ganzzahligen Farbflächen; es gibt keine Emoji-, generische Linienicon-, 3D- oder KI-Rasterquelle.

## Technischer Rahmen

- Canvas 2D und sicheres Inline-SVG, ohne neue Renderingbibliothek.
- 32×32 native Pixel, transparenter Hintergrund, Mittelpunktanker `[16,16]`.
- Exakt dieselbe gedämpfte Palette mit 24 deckenden Farben plus Transparenz wie die ursprüngliche Charakterfamilie.
- Feste Konturen und harte Cluster; Licht von oben links. Drei Materialwerte für Stahl, Bronze, Holz, Leder, Stoff, Glas, Knochen und Pflanzen.
- Große Objekte mit lesbarer Gesamtform statt dünner Symbolstriche. Jedes katalogisierte Objekt umfasst mindestens 70 deckende Pixel; 24 oder mehr eigenständige Silhouetten werden automatisiert geprüft.
- Kein Filter, Gradient, Schattenraster, Blur, eingebrannter Text oder globaler Seltenheitstint.
- Nearest-Filtering und `shape-rendering="crispEdges"`. SVG-Zellen setzen `fill` und `stroke:none` ausdrücklich inline gegen globale UI-Stroke-Regeln.

## Visuelles System

52 Familien decken 198 Lootbasen, 191 feste Inventarobjekte, sämtliche elf Ressourcen sowie Gold und einen unbekannten Lootbeutel ab. Nach Zusammenführung gleicher Basis- und Festobjekt-IDs enthält das Manifest 241 kanonische Einträge. Alle sieben Ausrüstungsplätze haben echte Gegenstandsformen.

Waffen unterscheiden sich durch Klinge, Kopf, Schaft, Sehne oder Behälter. Grimoires, Laternen, Kerzen, Glocken, Räucherpfannen, Spiegel, Kronen und Sanduhren bleiben tatsächliche Gegenstände ihrer eigenen Familie. Rüstung zeigt Körperharnisch, Wams oder Robe; Kopf-, Hand- und Fußteile zeigen das reale Paar beziehungsweise das getragene Objekt. Schmuck besitzt eine erkennbare Fassung, Kette oder Rune. Vorräte zeigen Flaschen, Brot, Rationen und Schüsseln; Material zeigt Stämme, Erz, Blätter, Saatbeutel, Ähren oder Kristalle.

Gewöhnliche Ausrüstung verwendet kleine matte Fassungen. Höhere Seltenheiten ergänzen farbige Beschläge, sichtbare Edelsteinfassungen und bei legendären Gegenständen Goldrunen. Die Silhouette bleibt lesbar. Glut nutzt Rostrot/Bernstein, Frost Türkis, Natur Moosgrün, Leere Violett und heilige Gegenstände warmes Gold. Elementfarbe bleibt im Stein oder in wenigen Nähten; eine seltene Fassung übermalt den Elementkern nicht. Echte Sockel und bekannte Setfamilien können diesen Akzent bestimmen.

Die erste Zielfamilie aus Schwert, Bogen, Plattenharnisch, Visierhelm und Heilflasche wurde auf nativer Größe und vergrößert geprüft und als stärkste passende Richtung übernommen. [Die vollständige Kontaktseite](item-art-preview.png) zeigt alle 52 Familien, dieselbe Klinge in fünf Seltenheiten und denselben Stab in sechs Elementvarianten; jeweils 32-Pixel-Original und dreifache Nearest-Vergrößerung. Die Kontaktseite ist eine QA-Ansicht, kein Runtime-Atlas.

## API und Laufzeitbudget

```js
itemSpriteMarkup(item, { className: '', decorative: true });
drawPixelItem(ctx, item, centreX, centreY, { size: 32, opacity: 1 });
itemArtDescriptor(item);
getPixelItem(item);
```

`itemArtDescriptor` gibt `version`, `key`, `family`, `material`, `element`, `rarity`, `tier`, `variant`, `palette` und `canonicalId` zurück. Kanonische Basen bestimmen die Grundform; frei eingegebene Namen, Loot-UIDs und gerollte Werte werden weder gehasht noch für Form oder Cache verwendet. Unbekannte IDs werden zu demselben klar erkennbaren Beutel. Nur endliche bekannte Farben, Seltenheiten und Elementnamen sind möglich. Nicht dekorative SVGs erhalten ein escaptes Label; CSS-Klassen werden tokenweise geprüft.

`getPixelItem` liefert unveränderliche horizontale Zell-Runs mit Rastermaßen, Palette, Mittelpunktanker und Pixelzahl. Daraus können weitere Vorschauen oder Atlanten verlustfrei exportiert werden. Der SVG- und Raster-LRU hält jeweils höchstens 192 Styles. Im Browser puffert ein eigener LRU höchstens 128 32×32-Bitmaps: 512 KiB rohe RGBA-Pixelfläche, zuzüglich Browser-/Metadatenaufwand. Weitere Weltbilder brauchen nur einen `drawImage`-Aufruf. Bei fehlender Canvaserzeugung und in nativen Context-Mocks bleiben dieselben Runs als Fallback verfügbar. Verdrängte Bitmapflächen werden sofort freigegeben.

Canvas setzt und restauriert Alpha, Farbe und Nearest-Filtering über `save`/`restore`. Mittelpunkt und Zellgrenzen werden auf ganze Canvaspixel ausgerichtet. Darstellung 32/48/64/96 ist möglich; bei einer Vergrößerung mit ganzzahligen Faktoren bleiben die Originalcluster exakt gleich groß.

## Nachweise und Abnahme

```sh
node --test tests/item-art.test.js
```

Elf native Tests prüfen vollständige Katalog-/Slotabdeckung und mindestens 24 verschiedene gefüllte Silhouetten, Paletten und Pixelgrenzen, echte Element-/Sockel-/Seltenheitsvarianten, exakt identische SVG-/Canvaszellen, Mittelpunktanker und Context-Restaurierung, XSS-Escaping, unveränderte Gegenstandsdaten sowie beide begrenzten Cachepfade. 2000 unterschiedliche Loot-UIDs/Spielernamen ergeben für denselben Stil nur einen Cacheeintrag. Browser-Bitmaptests prüfen Wiederverwendung und Freigabe des Backing Stores.

Die komplette Kontaktseite wurde visuell geprüft. Im echten Browser wurden Inventar und Inspector bei 390×844, 844×390 und 847×853 geprüft. Zwei Gegner wurden nativ besiegt, ein tatsächlicher Hammerfund zeigte seine Gegenstandsgrafik, und der Hinweisverlauf führte zum richtigen besessenen Gegenstand auf Inventarseite zwei. Das ist eine Abnahme der integrierten Pipeline und eines echten Lootablaufs; es wird nicht behauptet, dass alle 52 Familien im Gameplay gefunden wurden.

Originale, für Emberfall geschriebene Pixelzeichnungen; keine fremden Bilder, Models oder Fonts in den Runtime-Sprites. Der Rechte- und Variantennachweis steht in [item-art-manifest.json](item-art-manifest.json). Die Lizenzregeln des Repositories gelten für die neue originale Projektarbeit.

# Emberfall Pixelart

Die aktuelle Art-Richtung ersetzt die aus 3D-Geometrie gerenderten Figuren durch originale, direkt auf einem Pixelraster gezeichnete 2D-Sprites. Ziel ist eine ruhige, warme Fantasy-Welt mit klaren Silhouetten, großen lesbaren Gesichtern und erkennbarer Klassenausrüstung.

## Technischer Rahmen

- Browser-Spiel mit Canvas 2D; keine zusätzliche Rendering-Bibliothek.
- Charakterzelle: 32 × 48 echte Bildpixel, transparente Umgebung, Fußanker `[16, 40]`.
- Einheitliche begrenzte Palette; dunkle Konturen, flächige Schatten und kleine helle Materialakzente.
- Acht Klassen und eigene NPC-Familie; vier Richtungen mit je acht Posen: idle, walk1–4, attack1–2, downed.
- Welt wird auf einer persistenten Canvasfläche mit halber Bildschirmauflösung gezeichnet und exakt zweifach ohne Interpolation vergrößert.
- Kamera und Figuren werden auf dem Weltpixelraster ausgerichtet. Namen und Questtexte werden darüber in voller Bildschirmauflösung gezeichnet.
- Bäume, Felsen und Gegner verwenden eigene Pixelcluster statt weich gerenderter Formen. Geometrie für Kampf-Flächen bleibt identisch zur Simulation.
- Gelände-Chunks behalten ihren begrenzten LRU-Cache; es wird keine riesige Canvasfläche für die ganze Open World angelegt.

## Visuelle Regeln

Wälder verwenden Tannengrün und Oliv, Eis verwendet gedämpftes Türkis, Verderbnis verwendet Violett und Glut verwendet Rostrot und Bernstein. Figuren haben einen klaren Kontrast zum Boden. Kämpfer sind über Schild, Rüstung und Waffen unterscheidbar, Zauberklassen über Roben, Stäbe und ihre Magiefarben. Licht kommt von oben links; Augen und Waffenakzente bleiben bei normaler Spielgröße lesbar. Laufposen bewegen Beine und Arme, ohne Kopf oder Fußanker zwischen Frames zu verschieben.

Die früheren Blender-Dateien bleiben im Repository als Entwicklungsstand erhalten. Der Browser-Build verwendet die Pixelart-Dateien. Quellgenerator, Metadaten und Kontaktansichten gehören zur bearbeitbaren Art-Pipeline.

## Abnahme

Kontaktansichten, Palette und Alpha werden auf Dateiebene geprüft. Danach folgen Ansichten im Spiel mit NPCs und mindestens zwei unterschiedlichen Klassen sowie Bewegung und Angriff. Automatische Rendererprüfungen decken Atlas-Auswahl, Fußanker, Pixelvergrößerung, Beschriftungen und Zeigerkoordinaten ab. Die optische Qualität wird anhand der tatsächlichen Spielansicht beurteilt.

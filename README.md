# Emberfall – Die letzte Glut

Ein eigenständiges, deutschsprachiges 2D-Action-RPG. Direkte Bewegung, gerichtete Schwertkombos, Ausweichrollen und Magie treffen auf eine frei erkundbare Fantasywelt mit Quests, Beute, Handwerk und Landwirtschaft.

## Spielen

Voraussetzung: Node.js 20 oder neuer. Keine Installation von Paketen nötig.

```sh
cd /Users/muhlack/Desktop/Gaming
npm start
```

Dann http://localhost:4173 öffnen. Das Spiel läuft komplett lokal. Der Spielstand bleibt im Browser auf dieser Adresse; unter Einstellungen kann er als JSON exportiert und wieder importiert werden.

## Steuerung

| Aktion | Steuerung |
| --- | --- |
| Bewegen | WASD oder Pfeiltasten |
| Zielen | Maus oder Bewegungsrichtung |
| Schwert / Dreierkombo | Linke Maustaste oder J |
| Ausweichen | Leertaste oder rechte Maustaste |
| Glutstoß | Q oder 1 |
| Feuernova | F oder 2 |
| Heiltrank | R oder 3 |
| Sprechen / Sammeln / Ernten / Truhe / Rasten | E |
| Inventar / Talente / Charakter | I / T / C |
| Weltkarte / Questbuch / Handwerk | M / L / B |
| Pause / Einstellungen | Escape |

Auf Touch-Geräten gibt es Richtungs- und Aktionsflächen. Alle Menüs sind mit Maus und Tastatur bedienbar.

## Deine erste Reise

Sprich mit Mira am Brunnen (E), Sera und Toma. Mira schickt dich gegen die Hainwölfe. Sera führt in die Alchemie ein, Toma in die Landwirtschaft. Zwei Talentpunkte stehen zu Beginn bereit. Auf den Wegen südlich und östlich des Dorfs liegen Ressourcen und Begegnungen. Rote Angriffsflächen kündigen gefährliche Treffer an: Rolle hinaus, dann schlage zurück.

Entzünde Glutherde mit E, um dort zu rasten und die Schnellreise auf der Karte freizuschalten. Ein Sieg über einen Boss bleibt gespeichert. Normale Gegner und Ressourcen kehren zurück. Der Acker wächst während aktiver Spielzeit; offene Menüs pausieren die Welt.

## Inhalt

- Vier zusammenhängende Regionen: Dämmerhain, Frostgrat, Aschenmoor und Glutöde.
- Zwölf Quests mit Hauptgeschichte und Nebenketten, sechs Dorfbewohner.
- Drei frei kombinierbare Talentbäume, zwölf Talente mit jeweils drei Rängen, Level 1–30.
- Neun Gegnertypen einschließlich drei Bossen mit angekündigten Flächenangriffen und einer zweiten Kampfphase.
- Zwölf Gegenstände, fünf Seltenheitsstufen, Ausrüstung, Handel, Beute und sechs Handwerksrezepte.
- Sammeln, acht Ackerbeete, Pflanzen, Ernten und Kochen.
- Weltkarte, Minikarte, Schnellreise, Questbuch, Charakterwerte und automatisch gesicherter Fortschritt.
- Eigene Pixelgrafik, animierte Effekte, prozedural komponierte Musik und Soundeffekte; optionale Bewegungseffekte.

Dies ist eine vollständig spielbare erste Version eines eigenständigen Spiels. Die genannten Inspirationsquellen liefern Genreideen; Namen, Welt, Geschichte, Grafik und Audio sind neu. Eine externe Sternebewertung wurde nicht vorgenommen.

## Entwicklung und Prüfung

```sh
npm test
```

Die Simulationslogik liegt in `src/game.js`; unveränderliche Inhalte in `src/content.js`, die reproduzierbare Welt in `src/world.js`, Darstellung in `src/renderer.js` und Menüs in `src/ui.js`. Das Spiel verwendet Canvas 2D und ES-Module ohne externe Laufzeitabhängigkeiten. `window.emberfall` erlaubt lokale Inspektion der Welt im Browser.

Das Titelbild wurde mit dem integrierten Imagegen-Werkzeug erzeugt. Prompt und Herkunft stehen in `assets/manifest.json`. Die Spielgrafik und Audio sind im Quellcode erstellt. Für Erweiterungen können Daten und Renderer getrennt verändert werden.

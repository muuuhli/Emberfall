# Emberfall: Finsternis-Erweiterung und Balanceprüfung

Diese Arbeitsfassung umfasst 80 eigenständige Gegnerarten mit jeweils einer Bossvariante. Die erzeugte offene Welt enthält 492 Gegner, 163 unterschiedliche Gegner-IDs und 192 Interaktionsobjekte aus 12 Kategorien. Das Arsenal ergänzt 64 Waffen, insgesamt 112 Ausrüstungsbasen, 12 Verbrauchsgegenstände und 68 Rezepte. Über die acht Klassen stehen 164 Talente und 64 zusätzlich erlernbare aktive Techniken zur Verfügung; Klassen-Grundaktionen bleiben separat erhalten.

## Reproduzierbares Zahlenmodell

Die folgenden Zeiten sind analytische Schätzungen und keine gemessenen menschlichen Spielzeiten. Für alle acht Klassen werden sechs Stufen verglichen. Jede Figur trägt drei passende Rare-Gegenstände: jeweils die höchste freigeschaltete Basis, bei Gleichstand alphabetisch nach ID. Waffen und Schmuck müssen den tatsächlichen Primärwert der Klasse tragen; Rüstung benötigt Leben und Rüstungsrating. Der feste RNG-Seed ist 991 plus Charakterstufe. Es werden keine Talente, erlernten Zusatztechniken, Sockel, Upgrades oder temporären Weltsegen eingerechnet.

Das vorhandene estimateCombat-Modell verwendet 70 % Angriffszeit, durchschnittliche Kombos und Krits sowie nachhaltige Mana-Regeneration für die beiden Grundzauber. Jede der 80 Arten wird zum Vergleich auf dieselbe Charakterstufe skaliert. Die niedrigsten und höchsten Zeiten über alle Arten und Klassen stehen in der Tabelle. Tatsächliche regionale Gegner behalten ihre regionalen Stufen. Drei Rare-Gegenstände auf Stufe 1 sind ein Vergleichsprofil und keine zugesicherte Startausrüstung.

| Charakterstufe | Grundrotation DPS | Normaler Gegner: Sekunden | Weltbossvariante: Sekunden |
|---:|---:|---:|---:|
| 1 | 61,21–118,64 | 0,16–1,09 | 0,83–5,69 |
| 10 | 183,76–281,76 | 0,41–2,16 | 2,12–11,21 |
| 25 | 377,04–560,2 | 0,6–3,04 | 3,1–15,79 |
| 50 | 689,84–1.114,73 | 0,77–4,28 | 4,02–22,27 |
| 75 | 1.037,97–1.678,63 | 0,95–5,26 | 4,93–27,37 |
| 100 | 1.339,78–2.181,16 | 1,16–6,47 | 6,03–33,66 |

Die Vielfalt entsteht aus unterschiedlichen Lebens- und Schadensbudgets, Angriffstakten, Reichweiten, Positionierung und acht Angriffsmustern. Das Zahlenmodell rechnet bei Gegnern deren angegebenen Windup und Erholung ein. Es bildet Projektilausweichen, Ansturmwege, Deckung, Diener, Schilde, Gegnerheilung und Mehrfachtreffer nicht nach. Daher beschreibt die Tabelle weder eine garantierte Schwierigkeit noch die tatsächliche Bossdauer im Browser. Die bestehenden acht Dungeons und ihre Raidanforderungen besitzen eigene Budgets und gehören nicht zur Weltboss-Spalte.

## Verbindliche Grenzen und echte Interaktionen

Die gemeinsamen Statgrenzen bleiben wirksam: höchstens 45 % Kritchance, 12 % Lebensraub, 45 % Skill-Abklingzeitverkürzung, 60 % Ausweichverkürzung und 300 Bewegungstempo. Rüstung bleibt ein Rating gegen die Stufe des Angreifers, mit höchstens 75 % Schadensreduktion. Gegenstände benutzen den bestehenden validierten Beutevertrag; zusätzliche Basen ändern keine alten gespeicherten Rollen. Niedrigstufige Gegner verlieren ihren EP-Wert gegenüber stark überlevelten Figuren.

Fässer und Urnen geben Ressourcen; Gefangene benötigen einen sicheren Umkreis; Sarkophage und Fluchtruhen verlangen einen echten Kampf. Ketten öffnen nahe Vorräte. Quellen und Lagerfeuer stellen Ressourcen wieder her, wobei Lagerfeuer Holz, fehlende Ressourcen und Ruhe außerhalb des Kampfes verlangen. Bluteid und Nachtäther kosten Kristalle, wirken zeitlich begrenzt und stapeln denselben Segen nicht mehrfach. Ihre kanonischen Werte werden beim Laden rekonstruiert.

Im Mehrspielerbetrieb prüft die Autorität jede Objekt-ID und physische Nähe. Bereits benutzte Objekte können kein zweites Mal belohnen; neu eröffnete Herausforderungen werden nach einem Serverneustart gemeinsam wiederhergestellt. Segen bleiben persönlich. Händlerangebote folgen Klasse und Stufe und verwenden ausschließlich den Serverpreis. Der Browser erhält eine vollständige Fortschrittsübersicht, auch wenn weit entfernte Weltobjekte aus den lokalen Snapshots entfernt werden.

## Automatisierte Prüfung und Grenzen

Die zusätzlichen HTTP-Integrationstests prüfen Händlerpreise und Zugang, zwei Spieler am selben Fass, Raumneustart, persönliche Segen und ihr Ablaufdatum, einen tatsächlichen Bosskill für die Fluchtruhe und die Weiterleitung des Browsers an die Autorität. Der separate Chromium-Smoke prüft Desktop- und Mobilansicht, Spielfläche, Inventar, Talente, Bestiarium und Interaktionsübersicht auf JavaScriptfehler, ungültige Zahlen und horizontales Überlaufen. Er speichert echte Screenshots für die Sichtprüfung.

Diese Prüfungen ersetzen keine längeren menschlichen Solo- und Gruppentests. Besonders Endgame-Kombinationen aus legendärer Ausrüstung, Spezialisierungen, Heilung und mehreren Schadensflächen müssen weiter beobachtet werden. Es wird keine Mindestspielzeit oder Spielzeit von 200 Stunden aus diesen Rechnungen abgeleitet.

## Ausführen

~~~sh
node tests/scripts/darkness-balance-audit.mjs
node tests/scripts/darkness-balance-audit.mjs --markdown
node --test tests/darkness-network.test.js tests/network.test.js
node tests/scripts/darkness-browser-smoke.mjs /tmp/emberfall-darkness-qa
npm test
~~~

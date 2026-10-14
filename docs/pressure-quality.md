# Version 5.1: mobile Hinweise und Aschenjagd

Geprüft am 14. Oktober 2026. Die Browserproben verwenden echtes Chromium mit emulierten Bildschirmgrößen; die Kampfproben laufen in der tatsächlichen Game-Simulation. Sie ersetzen keine menschlichen Smartphone- oder Langzeitspieltests.

## Ergebnis

Mehrere gleichzeitige Meldungen konkurrierten mit Wegziel, Chronik und Interaktion. Die neue Leiste zeigt genau einen priorisierten Hinweis. Beute-/EP- und Questzielserien werden zusammengefasst, ein begrenzter Verlauf bleibt in den Einstellungen. Sehr kleine Displays zeigen den aktuellen Interaktionspartner anstelle eines längeren Wegziels. Auf Desktop fließen Wegziel, Gefahr und Hinweis ebenfalls nacheinander.

Die Welt hatte 492 Gegner, davon 409 gewöhnliche. Große Regionen enthielten jeweils nur rund 30 gewöhnliche Gegner; im Nexusriss lagen die Gegner besonders weit auseinander. Im vorherigen isolierten Rangervergleich fielen gewöhnliche Ziele nach 0,28–1,72 Sekunden, oft vor ihrem ersten Angriff. Neun von zwölf Kämpfen verursachten keinen Schaden. Ein globaler Lebensaufschlag hätte die ruhigen Strecken nicht behoben.

Die neue Planung erzeugt deshalb begrenzte lokale Gruppen während tatsächlicher Erkundung: kleinere Anfängergruppen, drei/fünf/sieben Gegner in den späteren Phasen, bis zu zehn bei nahen Mitspielern. Acht Sekunden Vorwarnung, feste Markierungen, Randpfeile und eine freie Rückzugsrichtung machen die Ankunft verständlich. Dorf, Schrein, Dungeon und Arena bleiben getrennt. Vor Materialisierung, Beschwörung und gewöhnlichem Respawn wird das aktuelle lokale Spawnbudget geprüft. Bereits vorhandene Gegner können sich weiterhin natürlich durch die Welt bewegen.

Jede dritte Eskalation wird ab Stufe 20 zur Blutnacht. Ihre zwei Eliten haben lokale höhere Kampfbudgets. Nahkampfeliten können mit einem vollständig angekündigten, kollisionsgebundenen Vorstoß aufschließen; vier versetzte Angriffe dürfen gleichzeitig vorbereitet werden. Gewöhnliche Gruppen bleiben schwächer. Das eigene Gebiet bestimmt weiterhin die Gegnerstufe. Die Blutnacht reduziert weder heimlich die Spielerwerte noch trifft sie ohne Warnung.

## Browserprüfung

`node tests/scripts/hud-notice-browser-smoke.mjs /tmp/emberfall-hud-complete`

Ein vollständiger Lauf prüfte 40 Situationen auf 390×844, 320×568, 844×390, 320×480 und 1440×1000: Wegziel neben Interaktion, Meldungsserien mit tatsächlicher Blutnacht, benannter NPC, Chronikwechsel, Inventarhinweis, Verlauf, PvP-Einstellungen sowie aktive Arena, Countdown und Ergebnis mit echter Fehlermeldung. Es gab keine Rechtecküberlagerungen zwischen den geprüften HUD-/Touch-/Panelinhalten, keinen horizontalen Überlauf und keine Laufzeit-/Konsolenfehler. Höchstens ein Hinweis war gleichzeitig vorhanden. Der separate Zeitablauf prüfte Fehler vor Level und Story, 36 korrekt zusammengefasste EP sowie Fehlerspam ohne unbegrenzte Verlängerung.

Bericht und Bilder liegen unter `/workspace/scratch/emberfall-v5.1-preview/mobile-hud/`. Diese Prüfung belegt die untersuchten Zustände und Größen, keine allgemeine Aussage über jedes physische Smartphone.

## Tatsächliche Kampfproben

`node tests/scripts/pressure-gameplay-audit.mjs /tmp/emberfall-pressure-final.json`

Die deklarierte Vorbereitung enthält sieben Rare-Gegenstände, begrenzte passive Talente, fünf passende Heiltränke und volle Startwerte. Bestehende Umgebungskämpfe, Deckung und Ereignisse werden für den Vergleich entfernt; regionale Stufen, acht Sekunden Warnung, tatsächliche Gegner und Schadensregeln bleiben erhalten. Der Zeitplan wird gezielt auf die jeweilige Welle gestellt. Passive Figuren handeln nicht. Stationäre Figuren nutzen die Grundrotation ohne Bewegung oder Tränke. Reaktive Figuren zielen, bewegen sich, rollen und können Tränke verbrauchen. Keine Probe beendet Gegner durch künstliche Sofortkills.

Die Auswertung umfasst 54 Fälle für Ranger und Wächter auf Stufe 20, 52 und 100. Nach der ersten Abstimmung wurden die 18 Blutnachtfälle mit dem verschärften Entwurf erneut gemessen; die 36 unveränderten Standard-/Rudelfälle stammen aus dem vorherigen vollständigen Lauf. Der gespeicherte Bericht kennzeichnet diese Herkunft ausdrücklich.

| Finale Blutnacht | Stationärer Ranger | Reaktiver Ranger |
| --- | --- | --- |
| Stufe 20 | besiegt nach 24,8 s | Sieg nach 17,96 s |
| Stufe 52 | besiegt nach 16,36 s | Sieg nach 13,28 s |
| Stufe 100 | Sieg nach 30,4 s; 60,2 % kumulativer Schaden | Sieg nach 23,84 s; 6 % kumulativer Schaden |

Alle sechs passiven Blutnachtprofile wurden innerhalb von 19,96–34,2 Sekunden besiegt. Die vorbereiteten reaktiven Ranger gewannen alle drei Fälle. Bewegung und Warnreaktion besitzen damit einen messbaren Nutzen; bloßes Stehen und Schießen reicht nicht mehr überall.

Der Wächter schützt sich durch seine Schildrotation wesentlich stärker. Stationär besiegt er die vollständige Gruppe in diesen 85-Sekunden-Proben nicht. Reaktiv gewinnt er die Blutnacht auf Stufe 20; die Stufe-52-/100-Proben erreichen das Zeitlimit. Der einfache Controller priorisiert oft beschworene Diener und verwendet keine erlernten Zusatztechniken. Ein Zeitlimit wird deshalb weder als Sieg noch als Beleg eines unmöglichen Kampfes ausgegeben. Weitere Klassen-/Build- und menschliche Balanceproben bleiben sinnvoll.

Berichte liegen unter `/workspace/scratch/emberfall-v5.1-preview/`. Die ursprüngliche Einzelzielbaseline steht daneben in `baseline-gameplay.json`.

## Speicherung und Koop

Eigene Prüfungen decken relative Wildniszeiten, eingefrorene Warnorte, Abstand lebender Spieler zu Home und Leiche, lokale Spawn-/Summonkapazität, Rückzug, tatsächliche Killbelohnungen, einmalige Auszahlungen und atomare Importablehnung ab. Der Server aktualisiert den gemeinsamen Zeitplan einmal pro Raumtick. Neustarts rekonstruieren Gegnerwerte aus regionalen Plänen, erhalten verletzte beziehungsweise bereits besiegte Akteure und entfernen rohe Director-Diener. Entfernte Clients exportieren die vollständigen Zustände trotz räumlich gekürzter Renderingdaten. PvP friert die PvE-Planung ein und bleibt bei seinen gleichen Kampfwerten.

Die Prüfung fand und behob zusätzlich einen veralteten `overworld`-Verweis nach Raumwiederherstellung. Ohne den Fix hätte ein späterer Export eine ältere Vorwarnung anstelle des aktuellen Kampfes gespeichert.

## Abschlussprüfung

`npm test`: 482 von 482 Tests bestanden, keine Fehler oder ausgelassenen Tests. `npm run build`: Version 5.1.0 erfolgreich gebaut. Die Veröffentlichung verwendet genau diesen geprüften Quellstand; bestehende GitHub- und Sites-Zuordnung sowie der private Zugriff bleiben erhalten.

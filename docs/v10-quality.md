# Emberfall V10: geprüfter Ausbau

Prüfstand: 14. Oktober 2026. V10 baut auf dem frisch abgerufenen GitHub-Stand V9 auf. Es ist eine spielbare Entwicklungsfassung; das aktive Ziel bleibt mindestens 200 Stunden abwechslungsreiche Entwicklung mit acht Klassen und anspruchsvollen Gruppenbossen. Dieser Bericht bestätigt diese Langzeitspielbarkeit noch nicht.

## Spielbare Veränderungen

Alle acht neuen Dungeoninstanzen erhalten einen südlichen Reiseflügel. Auf zwei Ebenen kann die Gruppe jeweils Wachtkampf, Glutstaffel oder Wandelgang wählen. Ein Weg je Ebene öffnet die nächste Passage; weitere Wege öffnen eigene Vorratskisten. Wachtkämpfe verwenden reale Deckung und gemischte Gegner. Staffeln verlangen drei geordnete Runenkontakte und je zwei Sekunden Standzeit durch denselben lebenden Träger. Wandelgänge warnen ihre tatsächlichen Segmentflächen 1,8 Sekunden vor dem Einschlag. Alte Instanzspeicher bleiben auf ihrer ursprünglichen kleineren Karte.

Jede Klasse besitzt zwei neue erlernbare Technikprägungen ab Stufe 70 für je zwölf Quellensiegel. Lernen und Aktivieren sind getrennte Entscheidungen. Eine Variante kann aktiv sein und verändert Q oder F mit einem konkreten Vorteil und Nachteil. Ein kostenloser Wechsel in einer Siedlung erhält laufende Abklingzeiten; im normalisierten PvP ruhen die Varianten. Die Oberfläche zeigt die mit dem aktuellen Aufbau berechneten Gegenwerte.

Wegkammern vergeben Quellensiegel erst zusammen mit dem tatsächlichen Bossabschluss. Persönliche Ansprüche sind an Kammer und Tiefe gebunden; Abbrechen oder erneutes Abschließen derselben bereits belohnten Kammer erzeugt keine weitere Wegeprämie. Die gewöhnlichen Abschluss- und Truhenregeln bleiben davon getrennt. Wiederholte Abschluss-EP folgen der relevanten Dungeonstufe und Tiefe; der erste Entdeckerabschluss behält seine Prämie. Gewöhnliche Siegelwächter verwenden jetzt ihr echtes Level statt eines konstanten, für frühe Dungeons viel zu hohen EP-Budgets.

Die vorhandene Warnungsleiste zeigt Wegwahl, Siegel und aktive Staffel, während Raidmechaniken weiterhin Vorrang besitzen. Journal und Atlas zeigen dieselben Räume, Tore und Aufgaben. Die globale Instanzkarte benutzt die vollständige initiale Netzgeometrie und den vollständigen Bosscheckpoint, auch wenn die aktuelle Kampfansicht diese Objekte ausblendet.

## Prüfungen und tatsächliche Spielproben

`npm test` besteht mit **929/929 Tests**. Der vollständige Lauf enthält native Kampf-, Bewegungs-, Speicher-, UI-, HTTP/SSE-, Gruppen- und Neustartprüfungen. Die beiden zuerst gefundenen Rückwärtskompatibilitätsfehler wurden im Produkt behoben: fehlende alte Klassenkennungen werden vor der neuen Prägungsprüfung normalisiert; neue Wegobjekte besitzen explizite initiale Aktivzustände und behalten diese beim Roundtrip. Die alten Prüfungen wurden dafür nicht abgeschwächt.

Die neuen nativen Castproben verwenden alle sechzehn Prägungen über `Game.action`. Zusätzliche Gegner- und Gruppenfälle prüfen fünf tatsächliche Pfeiltreffer gegenüber einem Fokuspfeil, weiter entfernte Heilziele und tatsächliche Frostwirkungen nach einem Projektiltreffer. Speicherproben erhalten laufende und inzwischen abgewählte Abklingzeiten, angefangene Staffelstandzeiten und bereits verbrauchte Gefahrenhits. Ungültige Importe verändern die laufende Reise nicht.

Der [Dungeonbericht](dungeon-routes-v10-design.md) enthält 1.536 Kollisionskarten, 48 bei Tempo 120 ohne Rolle absolvierte Staffeln und vollständig native Reisen durch Wurzelgewölbe und Frostkathedrale. Nach dem Einlass benutzen diese Reisen normale Bewegung, Kämpfe und Interaktionen ohne HP-, Positions- oder Cooldown-Korrekturen. Die Rare-Ausrüstung und legalen Einstiegsstufen sind deklarierte Fixtures; ihre Beschaffung wird nicht mitgespielt. Die Reisen dauern etwa zwei Minuten; die Solo-Bossengagements nur 6,10 beziehungsweise 12,90 Sekunden. Diese Befunde zeigen weiterhin zu kurze Solo-Endkämpfe für die gewünschte nachhaltige Herausforderung.

Der [Raidvergleich](raid-v10-technique-quality.md) spielt alle drei Raids jeweils ungeprägt und mit den beiden Varianten durch. Selbe sieben Rare-Teile, Talente, Punktetats, Vorräte und Controller; zwölf Prägungssiegel je Figur sind eine erklärte Freischaltungsfixture. Alle neun Gruppen siegen lebend. Die nativen Kämpfe dauern 107,24 bis 217,32 Sekunden und lösen die tatsächlichen Bossaufgaben aus. Der Weltenkernlauf mit Variante 1 ist 19 Prozent schneller; das ist kein isolierter Dominanznachweis einer einzelnen Klassenwahl und verlangt weitere menschliche und stärkere Ausrüstungsproben.

## Sichtbare Browserprüfung

Die Browserprobe nutzt einen separaten Loopback-Server auf Port 4175 mit wegwerfbaren Gruppen, legalen Einstiegsstufen und 24 ausdrücklich bereitgestellten Testsiegeln für die Lernoberfläche. Nutzerreisen auf Port 4174 werden dabei nicht verändert. Alle Browseraktionen erfolgen über normale Menüs, Bewegungstasten und Touchbuttons; keine verborgenen Game-Objekte werden im Browser manipuliert.

- 390 × 844: Server prüfen, Gruppe erstellen, Technik mit zwölf Siegeln erlernen und anschließend prägen. Der verfügbare Vorrat sinkt von 24 auf zwölf, die gewählte Technik wird als geprägt angezeigt. Kein horizontaler Dokument-/Panelüberlauf; relevante Buttons sind mindestens 44 Pixel hoch.
- 1280 × 900: beide Varianten samt tatsächlichem Grundtechnikvergleich in der Talenteansicht gelesen.
- 390 × 844: Dungeon körpernah mit der Touchaktion betreten, Hinweis zu den drei Wegen lesen und große Karte mit Boss und allen sechs Kammern öffnen. Danach die erste Glutstaffel mit normalen Bewegungstasten und Touchkontakten erfolgreich gelöst; der echte Fortschritt zeigt 1/2 Wegsiegel.
- 844 × 390: derselbe gemeisterte Weg bleibt sichtbar, die 44 Pixel hohe Statusleiste und Touchsteuerung überlappen nicht.

Prüfbilder: [Technik mobil](qa/technique-v10-mobile.png), [Technik Desktop](qa/technique-v10-desktop.png), [Dungeonstart](qa/dungeon-routes-v10-mobile.png), [Atlas](qa/dungeon-atlas-v10-mobile.png), [gemeisterte Staffel](qa/dungeon-relay-v10-mobile.png), [Queransicht](qa/dungeon-relay-v10-landscape.png).

## Netztransport und Betrieb

Der [Transportbericht](internet-backend-v10.md) vergleicht vollständige Zustände mit ausgehandelten Änderungen in denselben nativen stehenden, bewegten und Raid-Szenarien. Der Rohdatenbedarf sinkt dort um 97,7 bis 99,2 Prozent. Echte HTTP/SSE-Proben prüfen acht Figuren, Altclients, getrennte persönliche Daten, atomare Basissequenzen und Wiederverbindung. Ein normaler Delta-Schritt ersetzt die Terrain-Objektidentität nicht. Vollständige Atlasgeometrie, Dungeonportale und erforderliche NPC-Quelldaten bleiben erhalten.

Diese Messung belegt keine MMO-Kapazität. Insbesondere liegt die stehende 32-Raum-Probe mit Delta-P95 45,825 ms weiterhin oberhalb des 40-ms-Tickbudgets. Netzwerkdurchsatz, TLS und mobile Client-FPS sind dadurch nicht gemessen.

Das [dedizierte Betriebspaket](../server/DEPLOYMENT.md) enthält einen echten Node-Start, strenge Speicherprüfung, Health-Endpunkt, Docker- und Caddy-Konfiguration. Native Starts, HTTP, CORS, persistente Neustarts und Ablehnung beschädigter Daten sind geprüft. Alle angelegten gespeicherten Charaktere bleiben erhalten, auch wenn ein Raum im Lauf seiner Lebenszeit mehr als acht unterschiedliche Reisende hatte; acht Plätze begrenzen weiter die gleichzeitig aktiven Menschen. Docker/Caddy sind hier nicht installiert, daher sind Containerbau und öffentliches TLS nicht ausgeführt.

Ein kontrollierter HTTPS-Host, DNS/Betriebszugang, dauerhafte Konten mit gruppenunabhängigen Charakteren und eine tatsächliche Internet-Gruppenabnahme fehlen weiterhin. Die vorhandene Sites-Veröffentlichung bleibt eine statische Browserfassung; ihr Zugriff wird bei Veröffentlichung beibehalten. Die Serveradresse lässt sich für einen tatsächlich vorhandenen Dienst im Gruppenmenü prüfen und speichern.

## Offenes Gesamtziel

`fullCampaignHoursVerified` und `campaignPacing.verifiedHours` bleiben null. Kartenkombinationen, Testanzahl, automatisierte Kampfzeiten und wiederholbare Prämien sind kein Nachweis über 200 interessante Stunden. Als nächster großer Inhaltsbereich fehlen insbesondere zusammenhängende offene Weltfeldzüge mit verschiedenen Aufgaben und realen Folgen, mehr langfristige Ausrüstungsentscheidungen, anspruchsvollere Solo-Endkämpfe und dokumentierte menschliche Kampagnen-/Gruppensitzungen. Der [Langzeitentwurf](long-term-content-v10.md) trennt diese ausstehenden Inhalte von der tatsächlich implementierten V10-Fassung.

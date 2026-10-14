# Internet-Backend: geprüfter Ausgangspunkt für V10

Stand: 14. Oktober 2026. Untersuchte Quelle: Emberfall V9, Commit `271bd8e18986278691f5449b8c5a9477cf1d755a`. Diese Untersuchung stellt keinen bereits bereitgestellten Internet-Spielserver und keinen Nachweis über 200 Stunden Spielumfang dar.

## Ergebnis

Der vorhandene Node-Spielserver ist die unmittelbar verwendbare Grundlage für echte, autoritative Internet-Gruppen. Er braucht einen dauerhaft laufenden Prozess, persistenten Speicher, einen erreichbaren HTTPS-Ursprung und eine passende Frontend-Konfiguration. Der aktuelle Sites-Auftritt ist statisch. Seine gespeicherte Projekt-ID und sein Zugriff bleiben unverändert.

Die installierte Sites-Version bietet Worker-Anfragen sowie D1 und R2. Ihre Dokumentation und ihre nativen Werkzeuge enthalten keinen Vertrag zur Bereitstellung eines Durable-Object-Namensraums, eines Containers oder eines dauerhaft laufenden Node-Prozesses. Daraus folgt **keine allgemeine Unmöglichkeit** solcher Cloudflare-Funktionen: Eine Bereitstellung über dieses Sites-Projekt ist lediglich nicht nachgewiesen. Eine erfundene Manifest-Erweiterung ist keine belastbare Deployment-Lösung.

Ein zweiter konkreter Befund ist bereits im Repository lösbar: Die derzeitigen vollständigen Zustandsnachrichten erzeugen selbst bei stehenden Charakteren sehr viel Traffic. Die Simulation allein ist erheblich günstiger als die wiederholte Aufbereitung und Serialisierung dieser Nachrichten.

## Was die Plattform tatsächlich anbietet

| Untersuchte Quelle | Belegte Fähigkeit oder Grenze |
| --- | --- |
| Installierter Sites-Skill, Abschnitt „Hosting manifest“ | `project_id`, `static`, `d1`, `r2`, `capabilities`, `plugins` und `connectors` sind dokumentierte Manifest-Felder. |
| Sites-Referenz `references/storage.md` | Sites provisioniert deklarierte D1- und R2-Bindings. Schema-Migrationen werden mit der Veröffentlichung angewendet. |
| Sites-Vinext-Starter `vite.config.ts` | Lokale D1-/R2-Bindings und `nodejs_compat`; kein Durable-Object-Binding im gelieferten Starter. |
| Sites-Worker-ESM-Starter | Standard-Worker mit `fetch(request, env, ctx)`. Der einfache Starter kopiert nur seine Worker-Datei und das Hosting-Manifest. Er ist kein direkter Ersatz für die bestehenden externen Spielassets. |
| Aktuell verfügbare native Sites-Werkzeuge | Sites, Versionen, Deployments, Zugriffe, Umgebungsvariablen, Datenbankansichten und Zeitpläne; kein aufrufbares Werkzeug zur Provisionierung eines Game-Actors oder Durable-Object-Namensraums. |
| `.openai/hosting.json` | Projekt `appgprj_6ace1cb42b288191a14ad2a1af4ef550`, `static.directory: "dist"`. |
| Frische `get_site`-Abfrage | Bestehender Zugriff `custom`, ein erlaubter Nutzer, keine erlaubten Gruppen; aufrufender Nutzer ist Eigentümer. Keine Zugriffseinstellung wurde geändert. |

Die Sites-Skilldateien stammen aus Plugin-Version `1.0.2-remix-b.1`. Die untersuchten relativen Dateien sind unter `skills/sites/` zu finden; ihre internen Entwicklungseinstellungen wurden nicht als Produktionsfreigabe interpretiert.

Cloudflare dokumentiert Worker als zustandslose Eingangspunkte und Durable Objects als eindeutige, koordinierende Instanzen für beispielsweise Spielräume. Ein normales globales `Map` im Worker garantiert deshalb keinen einzigen gemeinsamen Raum über mehrere Anfragen oder Standorte. [Cloudflare: Rules of Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/)

Durable Objects benötigen ein echtes Binding und eine registrierte Klasse. Die Cloudflare-Konfiguration allein beweist nicht, dass ein Sites-Deployment diese Ressourcen provisioniert. [Cloudflare: Configure Durable Object bindings](https://developers.cloudflare.com/durable-objects/get-started/)

Worker können lange HTTP-Antworten streamen, solange die Verbindung besteht. Trotzdem gelten CPU- und Speichergrenzen, Unterbrechungen bei Laufzeitwechseln und nur begrenzte Nachlaufzeit nach einem Verbindungsende. Der dokumentierte Speicher beträgt 128 MB je Isolate; der tatsächlich für dieses Sites-Projekt verfügbare CPU-Tarif wurde nicht ermittelt. [Cloudflare: Workers limits](https://developers.cloudflare.com/workers/platform/limits/)

Die aktuelle Cloudflare-Kompatibilität kann `node:http` über einen Worker-Handler vermitteln; ein dortiges `listen()` ist eine interne Routing-Kennung und kein geöffneter Serverport. Diese Kompatibilität liefert weder dauerhaften Dateispeicher noch die fehlende, eindeutig zuständige Raumsimulation. [Cloudflare: Node.js HTTP integration](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/)

## Gemessener V9-Aufwand

Die folgenden Werte wurden mit Node `v24.13.1` auf dem lokalen macOS-Arbeitsrechner gemessen. Jeder Raum enthielt acht echte `Game`-Instanzen mit den acht kanonischen Klassen; die Welt und die Spielregeln blieben unverändert. Der Zufallswert war fest `.5`, Charaktere standen am normalen Startpunkt. `hub.tick(.04)` führte die native Simulation aus. Speicher war deaktiviert; kein Nutzer-Spielstand wurde verwendet oder verändert.

Die Werte sind lokale Entwicklungsproben und keine Produktionskapazitätszusage. Insbesondere fehlen dabei tatsächliche Netzwerkverbindungen, TLS, Raidlast und clientseitige Verarbeitung.

### Simulation ohne Nachrichtenempfänger

Nach 20 Aufwärmticks wurden 200 Ticks gemessen. Heap-Differenzen wurden nach expliziter Garbage Collection erhoben; RSS ist der gesamte Node-Prozess und darf nicht mit einem Worker-Heap-Limit gleichgesetzt werden.

| Räume / Charaktere | Tick Median | Tick P95 | CPU je Tick | Zusätzlicher Heap | Vollständiger Room-Save |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 8 | 0,179 ms | 0,261 ms | 0,296 ms | 1,90 MiB | 0,972 MiB |
| 8 / 64 | 1,311 ms | 1,575 ms | 1,714 ms | 9,81 MiB | 7,774 MiB |
| 32 / 256 | 5,427 ms | 5,836 ms | 5,853 ms | 38,89 MiB | 31,096 MiB |

32 Räume aufzubauen dauerte rund 11,26 Sekunden. `hub.capture()` benötigte dabei 56,13 ms, die anschließende JSON-Serialisierung weitere 42,59 ms. Diese beiden Schritte blockieren den derzeitigen Prozess synchron; tatsächliche Dateizugriffe wurden in dieser Probe nicht gemessen.

### Simulation mit vollständiger Nachrichtenserialisierung

Jeder Charakter erhielt einen Stream-Sink mit `write()` und ohne Backpressure. Dieser zählte Bytes, ohne eine Netzwerkverbindung aufzubauen. Die erste Layout-Nachricht war vorher übertragen; nach 20 Aufwärmticks wurden 100 Ticks gemessen. V9 sendet jede zweite Simulationsframe, also 12,5 Nachrichten pro Sekunde und Charakter.

| Räume / Charaktere | Tick Median | Tick P95 | Tick Maximum | CPU je Tick | Rohdaten pro simulierter Sekunde |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 / 8 | 4,066 ms | 4,685 ms | 4,967 ms | 2,822 ms | 8,104 MiB |
| 32 / 256 | 123,608 ms | 130,554 ms | 139,774 ms | 67,883 ms | 259,318 MiB |

Die erste Nachricht mit Weltlayout war etwa 0,284 MiB groß. Eine normale spätere Nachricht in der Achtpersonenprobe war etwa 82,50 KiB groß. Bei 32 Räumen übersteigt allein die Serialisierungsprobe das 40-ms-Framebudget deutlich. Der gemessene Rohdatenstrom entspräche ungefähr 2,18 Gbit/s vor Protokollkosten; Kompression wurde weder aktiviert noch als Ersatz für weniger unveränderte Daten angenommen.

Eine separate Probe mit nur einem Charakter zerlegte die größten Nachrichtenfelder:

| Feld | JSON-Größe |
| --- | ---: |
| `world` | 34.380 Bytes |
| `authoritativeWorldEventSummary` | 33.220 Bytes |
| `npcs` | 5.168 Bytes |
| `authoritativeInteractionSummary` | 2.678 Bytes |

Innerhalb von `world` entfielen 13.996 Bytes auf Gegner, 8.777 auf Interaktionen, 4.588 auf Eventobjekte und 3.946 auf Weltereignisse. Die Nachrichten sind also nicht allein Bewegungsupdates: Sie wiederholen beispielsweise den globalen Eventkatalog und dessen Journalzustände.

Ein neuer `Game` einschließlich `applySave()` eines legal erstellten Startspielstands benötigte in acht Durchläufen 84,07–102,98 ms. Die Welt enthielt 492 Gegner. Eine Rekonstruktion je 40-ms-Frame liegt schon ohne Datenbankzugriff über diesem Framebudget; acht Charaktere vervielfachen den Aufwand.

## Warum D1 pro Frame keine fertige Lösung ist

D1 kann transaktionale SQL-Batches ausführen. Daraus folgt keine einzelne dauerhaft laufende JS-Instanz, die die komplette Echtzeitwelt besitzt. [Cloudflare: D1 batch transactions](https://developers.cloudflare.com/d1/worker-api/d1-database/)

„Spielstand lesen, `new Game()`, Tick, Spielstand schreiben“ erzeugt in der gemessenen V9-Fassung zu hohe Rekonstruktionskosten. Ohne zusätzliche Eigentümerwahl und Versionsprüfungen konkurrieren mehrere Requests außerdem um Boss-HP, Beute und Inventare. Mit korrekten Sperren und Fencing wäre ein D1-gesteuerter Actor prinzipiell konstruierbar; er bräuchte jedoch Befehlsqueues, Lease-Erneuerung, eine über Verbindungsausfälle robuste Tickquelle, geordnete Übergaben und nachgewiesene Datenbanklatenzen. Dieser vollständige Dienst existiert hier nicht. Eine bloße D1-Tabelle erfüllt ihn nicht.

Ebenso hilft ein temporärer Quick Tunnel dem vorhandenen Transport nicht: Cloudflare dokumentiert ausdrücklich fehlende SSE-Unterstützung, wechselnde Hostnamen und keine Verfügbarkeitsgarantie. Es wurde kein Tunnel gestartet und kein lokaler Dienst öffentlich freigegeben. [Cloudflare: Quick Tunnel limitations](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

## Umsetzung und nächster Implementierungspfad

Die Punkte 1–5 wurden anschließend im V10-Arbeitsstand umgesetzt und mit nativen HTTP-/SSE-Prüfungen abgesichert. Account-Charaktere über Raumgrenzen und das tatsächliche Internet-Deployment bleiben offen.

1. **Nachrichten aufteilen — umgesetzt.** Ein vollständiger Snapshot bleibt für Beitritt, Wiederverbindung, Weltwechsel und portable Exporte verfügbar. `events?deltas=1` handelt den neuen Transport aus; HTTP und alte Ereignisclients behalten vollständige Protocol-1-Nachrichten. Laufende Änderungen enthalten einen Bezug zur exakten Basissequenz. Große semantische Daten wie NPC-Listen, Eventjournale, Inventar und Questzustand werden bei Änderungen gesendet. Bekannte verschachtelte Dungeon-/Checkpoint-Datensätze und stabile Akteur-IDs werden innerhalb dieser Felder gepatcht; laufende Kampftimer senden deshalb keine ganze Bossdefinition oder Kammerbeschreibung erneut.
2. **Änderungen korrekt erkennen — umgesetzt.** Jede Stream-Verbindung besitzt eine eigene Basis aus unveränderlichen JSON-Signaturen. Bewegen sich Figuren, verändern sich HP, Beute oder Questdaten oder kommen Akteure in den Sichtbereich, entstehen daraus die entsprechenden Änderungen. Fehlende, doppelte, falsch geordnete oder fremde Basissequenzen verändern den Clientcache nicht; die Verbindung fordert über einen neuen Stream vollständigen Zustand an. Rendererinterpolation besitzt getrennte Kopien. Die vollständige initiale Dungeon-Geometrie bleibt für den Atlas erhalten, auch wenn dynamische Ansichten Strukturen ausblenden. Eine gewöhnliche Delta-Nachricht ersetzt nicht die Terrain-Objektidentität.
3. **Erneut messen — durchgeführt.** Die untenstehenden 1-/32-Raum-Proben vergleichen dieselbe native Simulation mit vollständigem beziehungsweise ausgehandeltem Transport. Echte HTTP/SSE-Prüfungen decken acht Klassen, Alt-/Delta-Clients, portable Raidwarnungen und Wiederverbindungen ab. Das Entwicklungsprofil zeigte zusätzlich wiederholte PvP-Verfügbarkeitsprüfungen mit kompletten Gegner-Scans. Diese werden jetzt einmal pro Charakter innerhalb genau eines synchronen Broadcast-Batches ausgeführt; nach dem Batch ist der Cache verworfen. HTTP-Anfragen und Befehle zwischen Ticks prüfen den aktuellen Kampfzustand erneut.
4. **Node-Betrieb konkret vorbereiten — umgesetzt.** `server/dedicated.mjs`, Dockerfile, Compose- und Caddy-Beispiel enthalten den bestehenden autoritativen Prozess, persistenten privaten Datenpfad, geordnetes SIGTERM-Shutdown, Gesundheitsprüfung und HTTPS-Proxy-Konfiguration mit deaktivierter SSE-Pufferung. Beschädigte Speicher verhindern den dedizierten Start statt vorhandene Reisen durch neue Gruppen zu ersetzen. Inaktive persönliche Charaktere und Räume werden beim Neustart vollständig erhalten; die Grenze von acht betrifft aktive Sitzungen. Ein echter Leave-/Neubeitritt-/Neustart-Test schützt insbesondere den neunten Lebenszeitcharakter. Die [Betriebsanleitung](../server/DEPLOYMENT.md) benennt benötigte Infrastruktur und die noch nicht ausgeführte Docker-/TLS-Verifikation.
5. **Frontend verbinden — umgesetzt.** Der normale gleichnamige `/api`-Ursprung bleibt Standard. `NetworkClient.setServerAddress()` prüft eine konkret eingegebene Adresse zuerst mit einem Protocol-1-Handshake; erst nach Erfolg ändert sich die Auswahl. Ein fehlgeschlagener oder nach acht Sekunden abgebrochener Versuch lässt die bisherige Adresse und Tokens bestehen. Sitzungen sind weiterhin an ihren Ursprung gebunden. Der dedizierte Dienst erlaubt für ein getrenntes Frontend genau den konfigurierten Ursprung. Alternativ bedient der gleiche HTTPS-Proxy Spielassets und API unter einer Adresse.
6. **Dauerhafte Charaktere von Gruppen lösen.** Für einen MMO-ähnlichen Dienst braucht ein Account serverseitig gespeicherte Charaktere, die zwischen Gruppen und Instanzen wechseln können. V9 erzeugt beim Beitritt einen neuen Gruppencharakter und hält Fortschritt innerhalb dieses Raums. Eine portable Client-Datei darf keinen ungeprüften Online-Charakter oder Online-Beute erzeugen. Charakter- und Instanzdaten müssen vor einer späteren Verteilung auf mehrere Nodes getrennt werden.
7. **Erst dann Internet-Nachweis.** Zwei unabhängige Besucher beziehungsweise Geräte verbinden sich über das tatsächliche HTTPS-Deployment, bewegen sich in derselben autoritativen Welt und erhalten dieselben Casts. Danach werden Token-Wiederverbindung, Serverneustart während eines Raids, persistente Beute, Gruppenwechsel und ein Achtpersonenraid geprüft. Bis zu diesem Nachweis bleibt Internet-Koop offen.

Ein eigener Cloudflare-Backenddienst mit **einem Durable Object je Gruppe beziehungsweise Raidinstanz** wäre eine passende spätere Alternative: Worker routet, Actor besitzt die Simulation, SQLite-Speicher hält Checkpoints, WebSockets verteilen Änderungen. Aktive Kämpfe benötigen echte Tickarbeit; Hibernation reduziert Idle-Kosten und ersetzt keine laufende Simulation. Nach dem Aufwachen wird Zustand aus persistentem Speicher wiederhergestellt. [Cloudflare: Durable Objects and WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

Dieser Alternative fehlen derzeit eine nachgewiesene Deployment-Berechtigung und ein bestätigter Binding-Vertrag im bestehenden Sites-Projekt. Für den Node-Pfad fehlen ein ausgewählter dauerhaft erreichbarer Host und dessen Betriebszugang. Solange diese externe Auswahl fehlt, können Nachrichtentransport, Betriebsartefakte, Account-/Charaktergrenzen und Restart-Prüfungen vollständig im Repository umgesetzt werden.

## Vergleichbare V10-Transportmessungen

`tests/scripts/network-v10-benchmark.mjs` verwendet jeweils dieselbe native Simulation: 40 Aufwärmticks und 200 gemessene Ticks à 40 ms. Die vollständige und die Delta-Variante unterscheiden sich nur in der Aushandlung des Transports. Die Proben liefen vor der anschließenden großen Testsuite; spätere statische Portal-/NPC-Layoutkorrekturen sind nicht in den angegebenen Initial-/Heap-Messungen enthalten. Laufende Pakete müssen diese Initialgeometrie nicht erneut senden.

| Szenario | Transport | CPU je Tick | Tick P95 | Rohdaten / simulierte Sekunde | Mittleres Paket |
| --- | --- | ---: | ---: | ---: | ---: |
| 8 Figuren, stehende Oberwelt | vollständig | 1,492 ms | 2,957 ms | 8,1182 MiB | 83,130 KiB |
| 8 Figuren, stehende Oberwelt | Delta | 1,170 ms | 1,962 ms | 0,0622 MiB | 0,636 KiB |
| 256 Figuren, 32 stehende Räume | vollständig | 41,690 ms | 77,813 ms | 259,7828 MiB | 83,130 KiB |
| 256 Figuren, 32 stehende Räume | Delta | 29,135 ms | 45,825 ms | 1,9888 MiB | 0,636 KiB |
| 8 bewegte Oberweltfiguren | vollständig | 1,546 ms | 3,025 ms | 8,2925 MiB | 84,915 KiB |
| 8 bewegte Oberweltfiguren | Delta | 1,328 ms | 2,029 ms | 0,1886 MiB | 1,931 KiB |
| 8 Figuren im V10-Raid | vollständig | 1,213 ms | 2,454 ms | 6,8845 MiB | 70,497 KiB |
| 8 Figuren im V10-Raid | Delta | 1,253 ms | 1,824 ms | 0,1053 MiB | 1,078 KiB |

Die bewegte Gruppe legte in beiden Varianten zusammen 11.400 Spielpixel über native Bewegungsupdates zurück. Im Raid wurden dieselben 60 Frames mit einer tatsächlich aus der Bosssteuerung entstandenen einzigartigen Warnung beobachtet; seine native Verdrängung bewegte Figuren zusammen 140 Pixel. Die Raidprobe isoliert die obere Arena von der Navigation, behält den kanonischen Wegwächter-/Checkpoint-Kader und enthält die V10-Kammerdaten. Sie ist keine Balance- oder Clear-Time-Messung.

Der Rohdatenbedarf sinkt um etwa 99,2 % im stehenden Fall, 97,7 % bei der bewegten Gruppe und 98,5 % in dieser Raidprobe. CPU und P95 verbessern sich im großen stehenden Fall; beim kleinen Raid bleibt der gemessene CPU-Mittelwert praktisch gleich und steigt leicht. Daraus folgt keine pauschale CPU-Verbesserung für jede Kampfphase.

Die 32-Raum-Probe liegt mit Delta-P95 weiterhin über dem 40-ms-Tickbudget. Der gemessene Heap betrug dort etwa 107,14 MiB; das ist Node-Entwicklungsheap, keine Bestätigung eines Sites-Isolate-Betriebs. Netzwerkdurchsatz, TLS und mobile Client-FPS wurden mit dem Sink nicht gemessen. Gerade diese Ergebnisse begrenzen die Aussage: Weniger Daten sind belegt; eine garantierte MMO-Kapazität oder ein produktiver Internetserver sind es nicht.

Reproduzierbare Befehle:

```sh
node --expose-gc tests/scripts/network-v10-benchmark.mjs
node --expose-gc tests/scripts/network-v10-benchmark.mjs --rooms=1 --scenario=overworld-moving
node --expose-gc tests/scripts/network-v10-benchmark.mjs --rooms=1 --scenario=raid
```

## Unverändert offene Zielanforderungen

Eine erreichbare Gruppe allein ist noch keine große gemeinsame MMO-Welt. Die echte 200-Stunden-Anforderung braucht sinnvolle Kampagnen- und Endgame-Inhalte, fortlaufende Klassenprogression und langfristig tragfähige Balance. Diese Untersuchung erklärt einen konkret verifizierbaren Weg zum Internetbetrieb; sie wertet weder wiederholte Farmrunden noch technische Simulationszeit als bereits erfüllte menschliche Spielzeit.

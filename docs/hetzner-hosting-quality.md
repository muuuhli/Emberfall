# Emberfall: Hetzner-Hosting über IP

Prüfstand: 14. Oktober 2026. Der vorhandene Gaming-Server wurde nach Anmeldung und Bestandsprüfung genutzt. Es wurde kein neuer Server bestellt. Die bisherige Sites-Freigabe wurde nicht verändert.

## Installation

Ubuntu 24.04.4 LTS, x86_64, ein verfügbarer CPU-Kern und rund 1,9 GiB RAM. Docker 29.1.3 und Compose 2.40.3 waren vorhanden. Drei bisherige Gaming-Container verwenden die Ports 80, 443 und 8443; sie wurden weder ersetzt noch neu gestartet.

Emberfall läuft auf dem vorher freien TCP-Port 8088 als eigenes Compose-Projekt. Die Host-Firewall erhält ausschließlich die zusätzliche Emberfall-Portregel. Spiel und API verwenden denselben HTTP-Ursprung. Die Domain-/TLS-Variante wurde für diesen ersten IP-Betrieb nicht gestartet.

Die erste vollständige Betriebsprobe verwendet den geprüften GitHub-Commit `e731b6652809801822fa7517bf071701ae4f8c44`. Das Quellarchiv wurde vor dem tatsächlichen Containerbau auf dem Zielhost mit SHA-256 geprüft. Laufzeitänderungen dieser Fassung und ihre Tests bleiben bei der anschließenden Ergänzung dieses Betriebsberichts unverändert. Images tragen den jeweiligen vollständigen Quell-Commit als Tag; die private Betreiberkonfiguration wählt das aktive Release.

Der Node-Prozess läuft als Benutzer `node` mit schreibgeschütztem Container-Dateisystem. Das eigene Volume `emberfall_data` behält Gruppenstände über Neustarts und Releasewechsel. Die Betreiberkonfiguration liegt außerhalb des Releaseverzeichnisses mit Modus 0600. Cgroups begrenzen den Dienst auf eine halbe CPU und 768 MiB RAM; Node erhält 384 MiB Heap. Containerprotokolle rotieren mit höchstens drei Dateien zu je 10 MiB. Das Neustartverhalten ist `unless-stopped`; SIGTERM bekommt 15 Sekunden für die Speicherung.

## Tatsächlich ausgeführte Prüfungen

- **955/955 lokale Tests bestanden**, einschließlich neun zusätzlicher nativer Ressourcenprüfungen. Neue Create-/Join-Anmeldungen teilen zehn Versuche je Socket-IP und Minute. Neue Speicherbelegung endet bei 32 Gruppen beziehungsweise 64 Charakteren pro Gruppe; Altstände und vorhandene Tokens werden erhalten. Vier SSE-Verbindungen je Token sind erlaubt, ein geschlossener Stream gibt seinen Platz wieder frei. Gefälschte Proxy-Header bestimmen die IP-Grenze nicht.
- **Docker Compose validiert und Image auf Hetzner gebaut.** Der Imagebau verwendet das offizielle Node-24-Bookworm-Image. Der Container erreicht `healthy`; `/healthz` meldet `ready` und Protocol 1.
- **Öffentliche Erreichbarkeit vom Arbeitsrechner:** HTTP 200 für die Spielseite und erfolgreicher Gesundheitscheck über die Server-IP mit Port 8088.
- **Zwei echte HTTP/SSE-Clients über diese öffentliche Adresse:** Wächter und Druide treten derselben Gruppe bei. Beide Ereignisströme liefern ihre vollständige Ausgangssicht und anschließend konsistente Protocol-1-Änderungen. Native Bewegung verschiebt den ersten Charakter um 109 Pixel; die Gruppe zeigt beide Figuren.
- **Neustart und Speicherung:** Beide Testfiguren verlassen die Gruppe, der Dienst stoppt geordnet und erhält vorher eine private Sicherung des Gruppenspeichers. Nach erneutem gesundem Start verbinden sich beide mit ihren vorhandenen Tokens. IDs, Klasse, Stufe, Gold und Position werden erhalten. Tokens werden ausschließlich im Testprozess gehalten und nicht ausgegeben oder ins Repository geschrieben.

Die eigene Betriebsgruppe wird nur entfernt, wenn ihr Gruppencode und die vollständige Liste ihrer beiden selbst angelegten Figuren exakt passen. Andere Gruppen bleiben erhalten; das private Vor-Neustart-Backup bleibt als wiederherstellbare Sicherung bestehen. Die anschließend veröffentlichte Fassung und die weiterhin laufenden bisherigen Gaming-Container werden abschließend geprüft.

## Grenzen dieser Abnahme

Die IP-Fassung nutzt HTTP. Sie ersetzt keine geprüfte HTTPS-Veröffentlichung und wird aus dem bestehenden HTTPS-Sites-Frontend nicht als unsicheres Backend ausgewählt; zum Spielen wird die eigene IP-Adresse geöffnet. Die Gruppentests sind automatisierte reale Clients, keine unabhängigen menschlichen Mehrgerätesitzungen. Die Prüfungen belegen Betrieb und Persistenz, keine MMO-Kapazität, keinen Langzeit-Lasttest und keinen 200-Stunden-Spielumfang. Einzelspielerstände bleiben im Browser; bestehende lokale Gruppenstände wurden nicht auf den neuen Host kopiert.

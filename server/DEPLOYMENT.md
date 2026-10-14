# Dauerhaft erreichbarer Emberfall-Spielserver

Der dedizierte Einstiegspunkt `server/dedicated.mjs` betreibt die vorhandene autoritative Node-Simulation, liefert die Spielassets und hält Gruppenreisen in einem privaten Datenverzeichnis. Die aktuelle Sites-Veröffentlichung bleibt ihrem bisherigen Projekt und Zugriff zugeordnet. Zusätzlich ist die [IP-Hostingvariante](../deploy/HETZNER.md) auf dem vorhandenen Hetzner-Gaming-Server eingerichtet; der [Betriebsbericht](../docs/hetzner-hosting-quality.md) beschreibt die tatsächlichen Prüfungen.

## Lokal geprüfter Node-Einstieg

Node 24 genügt; der Spielserver hat keine zusätzlichen npm-Laufzeitabhängigkeiten. Ein gewöhnlicher `npm start` behält den bisherigen lokalen Start bei. Für den dauerhaften Einstieg:

```sh
node server/dedicated.mjs
```

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Lokale Bindeadresse: `127.0.0.1`, `0.0.0.0`, `::1` oder `::`. TLS übernimmt der vorgeschaltete HTTPS-Dienst. |
| `PORT` | `4173` | Ganze Zahl zwischen 1 und 65535. |
| `EMBERFALL_DATA_DIR` | `.emberfall-server` | Eigenes privates Verzeichnis; enthält `rooms.json`. `src`, `assets`, `dist` und das Projektwurzelverzeichnis sind ausgeschlossen. |
| `EMBERFALL_MAX_ROOMS` | `32` | Begrenzung zwischen 1 und 32 aktiven Gruppen. Das Compose-Beispiel beginnt mit 8; daraus wird keine garantierte Spielerzahl abgeleitet. |
| `EMBERFALL_ALLOWED_ORIGIN` | leer | Optional genau ein zusätzlich erlaubter Frontend-Ursprung, etwa die bestehende Sites-Adresse. HTTPS erforderlich; lokales HTTP ist für Loopback erlaubt. |

Beim Start prüft der Dienst Schreibzugriff und atomaren Dateiaustausch, ohne bestehende Spielstände zu überschreiben. Ein unlesbarer Speicher, eine unbekannte Reiseversion oder ein nicht wiederherstellbarer Charakter verhindern den Produktionsstart. Die bisherige tolerante lokale Startweise bleibt unverändert. Gruppen-Dateien werden mit Modus `0600` geschrieben; ein neu erstelltes privates Verzeichnis erhält `0700`.

`GET /healthz` und `HEAD /healthz` melden `200` für einen laufenden Dienst ohne bekannten Speicherfehler. Ein fehlgeschlagener Speicherversuch führt zu `503`; eine spätere erfolgreiche Speicherung kann den Zustand wiederherstellen. Die Antwort enthält keine Spielstände, Gruppencodes, Namen, Tokens oder Dateipfade. Diese Gesundheitsprüfung bestätigt noch keine Internet-Erreichbarkeit.

## Docker und HTTPS vorbereiten

Benötigt werden ein vorhandener, dauerhaft laufender Docker-Host, eine eigene Domain beziehungsweise ein kontrollierbarer Hostname und dessen DNS-Zuordnung. Port 80 und 443 müssen den HTTPS-Dienst erreichen. Für dieses Ziel wurden weder ein Konto noch ein kostenpflichtiger Host oder eine Domain eingerichtet.

Das Docker-Image verwendet Node 24, läuft als Nutzer `node`, hält `/data` in einem Volume und startet den dedizierten Einstiegspunkt. Der Build-Kontext schließt Git-Metadaten, lokale Spielstände, Umgebungsdateien, Tests und Buildarchive aus. Docker dokumentiert `HEALTHCHECK` für die Dienstprüfung und Volumes für Daten außerhalb des flüchtigen Container-Dateisystems. [Dockerfile](https://docs.docker.com/reference/dockerfile/#healthcheck), [Docker-Volumes](https://docs.docker.com/engine/storage/volumes/)

Kopiere das Betreiberbeispiel und ersetze dessen Beispielhostname durch einen vorhandenen eigenen Hostnamen:

```sh
cp deploy/.env.example deploy/.env
```

Danach sind dies die konkreten Befehle für den ausgewählten Host:

```sh
docker compose --env-file deploy/.env -f deploy/compose.yaml config
docker compose --env-file deploy/.env -f deploy/compose.yaml up -d --build
docker compose --env-file deploy/.env -f deploy/compose.yaml ps
```

Caddy übernimmt HTTPS und leitet an den privaten Container-Port weiter. `flush_interval -1` verhindert, dass der Proxy laufende Spielereignisse zu größeren Paketen bündelt. Die Konfiguration aktiviert keine Zugriffsprotokolle, weil Sitzungs-URLs Bearer-Tokens enthalten. Die Zertifikatsvoraussetzungen und das Flush-Verhalten sind in der offiziellen Caddy-Dokumentation beschrieben. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https), [reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)

Wenn Spielseite und API dieselbe neue HTTPS-Adresse verwenden, bleibt `EMBERFALL_ALLOWED_ORIGIN` leer. Die bestehende Sites-Seite kann einen separat betriebenen HTTPS-Spielserver auswählen; dafür wird ihr exakter Ursprung hier eingetragen. Die Sites-Zugriffsfreigabe wird dadurch nicht erweitert. Besucher, die dort bisher keine Freigabe haben, erhalten durch eine Backend-Adresse keinen Sites-Zugang.

Der Dienst erlaubt Same-Origin sowie genau den konfigurierten zusätzlichen Ursprung. Das Frontend prüft vor einem Serverwechsel `GET /api/rooms` auf `protocol: 1` und eine Raumliste. JSON-Befehle verwenden POST; der Ereignisstrom verwendet `GET /api/session/<token>/events?deltas=1`. HTTP-Snapshots und Ereignisströme ohne Aushandlung bleiben mit vollständigen Protocol-1-Nachrichten kompatibel. Ein Serverwechsel ist während einer laufenden oder gerade aufgebauten Gruppenverbindung gesperrt.

## Fortschritt und Wartung

Genau ein Node-Prozess besitzt diese JSON-Speicherung. Starte keine zweite autoritative Instanz gegen dasselbe Volume. Für mehrere Server braucht es anschließend getrennte Raumzuständigkeit und eine gemeinsame Account-/Charakterdatenbank. V9/V10 besitzen weiterhin raumgebundene Gruppencharaktere; ein ausgewählter Host allein erzeugt kein Account-System.

SIGTERM/SIGINT beendet die Tickquelle, schreibt die Reisen und schließt die Streams. Das Compose-Beispiel gibt hierfür 15 Sekunden. Lernkäufe und Technikwechsel werden unmittelbar gespeichert; neue abgeschlossene Wegkammern, Bossabschlüsse und Raidwipes schreiben beim tatsächlichen Übergang. Unveränderte Journale lösen keine Speicherung pro Nachrichtenframe aus.

Für eine konsistente private Sicherung stoppe den Emberfall-Dienst, kopiere `/data/rooms.json` aus dem Volume in ein zugriffsbeschränktes Backup-Verzeichnis und starte den Dienst wieder. Die Datei enthält Wiederanmeldetokens. Prüfe eine Wiederherstellung mit einem getrennten Datenverzeichnis; der Container-Nutzer benötigt wieder Schreibrechte. Bewahre das Volume auch bei einer neuen Image-Version auf.

## Prüfstand dieser Fassung

Die native Node-Ausführung wurde mit echten HTTP-/SSE-Verbindungen geprüft: acht unterschiedliche Klassen, Alt-/Delta-Clients, erneuter Streambeginn, Gruppenreise-Neustart, sofort gespeicherte Technikprägungen, Dungeon-/Raid-Warnungen und portable Checkpoints. Gesonderte Prüfungen decken Umgebungsgrenzen, CORS, private Datenpfade, Health-Status und abgewiesene beschädigte Speicher ab.

Docker und Caddy sind im aktuellen Arbeitsrechner nicht installiert. Der Docker-Build und die öffentliche IP-Ausführung wurden auf dem ausgewählten Hetzner-Server geprüft, einschließlich zwei HTTP/SSE-Clients und Wiederaufnahme nach Neustart. Die IP-Fassung verwendet wie angefordert HTTP und einen eigenen Port. Eine Domain, ein TLS-Zertifikat und unabhängige menschliche Gruppenproben über HTTPS sind weiterhin nicht geprüft.

Die [Transportmessungen](../docs/internet-backend-v10.md) zeigen weniger unveränderte Daten und geringeren CPU-Aufwand. Sie belegen keine MMO-Kapazität, keine Browser-FPS und keinen bereits abgeschlossenen 200-Stunden-Spielumfang.

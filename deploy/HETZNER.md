# Emberfall auf dem vorhandenen Hetzner-Gaming-Server

Diese Variante liefert Spiel und Gruppenserver gemeinsam über
`http://<SERVER-IP>:<PORT>`. Sie verwendet einen eigenen Docker-Compose-Projektnamen
`emberfall` und einen freien Port, standardmäßig `8088`. Bestehende Gaming-Dienste,
ihre Ports und ihre Daten bleiben erhalten. Caddy und eine Domain werden hierfür
nicht benötigt; die separate HTTPS-Konfiguration bleibt verfügbar.

## 1. Den Server prüfen

Zunächst am vorhandenen Server anmelden und Betriebssystem, laufende Dienste,
Docker-Version, freien Speicher sowie Portbelegung lesen:

```sh
id
cat /etc/os-release
df -h
free -h
systemctl --type=service --state=running --no-pager
ss -lntup
docker version
docker compose version
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
```

Falls Docker oder Compose fehlen, zuerst eine passende Installation mit dem
Betreiber abstimmen. Kein Installationsskript ungeprüft ausführen. Auch die
bestehende Host-Firewall und die dem Server zugewiesene Hetzner-Firewall prüfen.
Nur den gewählten TCP-Port für Emberfall freigeben, soweit erforderlich; keine
bestehenden Regeln entfernen. Belegt bereits ein Dienst `8088`, einen anderen
freien Port wählen und in der Konfiguration eintragen.

## 2. Eine geprüfte Fassung starten

Den geprüften, mit `origin/main` synchronisierten Commit nach
`/srv/emberfall/releases/<GEPRUEFTER-GIT-SHA>` übertragen. Keine lokalen
Spielstände, Zugangsdaten oder `.env`-Dateien mitnehmen. Die echte Konfiguration
liegt außerhalb der Release-Verzeichnisse unter `/srv/emberfall/.env.ip`.
Die Vorlage `deploy/.env.ip.example` kopieren, Zugriffsrechte auf `600` setzen
und `EMBERFALL_RELEASE` auf den vollständigen 40-stelligen Commit-SHA setzen.
`local` ist nur für lokale Probeläufe gedacht. Die folgenden Befehle als
berechtigter Betreiber mit dem tatsächlich gewählten Release-Pfad ausführen:

```sh
EMBERFALL_SOURCE=/srv/emberfall/releases/<GEPRUEFTER-GIT-SHA>
ef() {
  docker compose --project-name emberfall \
    --env-file /srv/emberfall/.env.ip \
    -f "$EMBERFALL_SOURCE/deploy/compose.ip.yaml" "$@"
}

ef config
ef build emberfall
ef up -d --no-build --wait emberfall
ef ps
ef logs --tail=50 emberfall
```

Die Optionen des installierten Compose vorab prüfen; unterstützt es `--wait`
nicht, mit `up -d --no-build emberfall` starten und den Zustand mit `ef ps`
bis `healthy` kontrollieren. Der Healthcheck stammt aus dem bestehenden
Dockerfile. Der Prozess läuft als Benutzer `node`, speichert ausschließlich im
Volume und erhält höchstens acht Gruppenräume in der Standardkonfiguration.
Das ist keine Zusage für eine bereits gemessene Internet-Spielerkapazität.
Der Container ist standardmäßig auf 768 MiB RAM und eine halbe CPU begrenzt; Node
erhält höchstens 384 MiB Heap. Die Containergrenzen stehen in der echten
`.env.ip` als `EMBERFALL_MEMORY_LIMIT`, `EMBERFALL_CPU_PERIOD` und
`EMBERFALL_CPU_QUOTA`. Die V12-Konfiguration verwendet 25.000 Mikrosekunden
Quota je 50.000 Mikrosekunden Periode: weiterhin eine halbe CPU, mit kürzeren
Drosselpausen bei Anmeldungen. `cpus` nicht gleichzeitig setzen. Vor einer
Erhöhung den Bedarf der bestehenden Gaming-Dienste erneut prüfen.

Für den öffentlichen Betrieb gelten zehn neue Anmeldeversuche pro IP und Minute bei
Gruppenerstellung und neuem Gruppenbeitritt, höchstens vier gleichzeitige
Ereignisverbindungen pro Sitzungstoken sowie 64 gespeicherte Charaktere pro
Gruppe und 32 gespeicherte Gruppen. Vorhandene größere Altstände werden dafür
nicht gekürzt. Das Wiederverbinden eines vorhandenen Charakters bleibt möglich;
eine Gruppe hat weiterhin höchstens acht aktive Spieler. Die tatsächlich
gestartete Konfiguration beim Servercheck bestätigen.

Den konfigurierten Port zunächst vom Server und anschließend von einem anderen
Gerät prüfen. Beispiel für Port `8088`:

```sh
curl --fail --silent --show-error http://127.0.0.1:8088/healthz
```

Im externen Browser `http://<SERVER-IP>:8088` öffnen, Einzelspieler starten und
zwei Browser in dieselbe Gruppe aufnehmen. Bewegung und geteilte Aktionen
prüfen. Die Gruppe speichern, nur den Emberfall-Dienst neu starten und die
gespeicherte Gruppe erneut verbinden. So werden Erreichbarkeit, Gruppenserver
und Speicherung geprüft. Ein erfolgreicher lokaler Build ersetzt diese Tests
auf Hetzner nicht.

## 3. Persistente Daten und private Sicherung

Das explizit benannte Volume `emberfall_data` bleibt bei wechselnden
Release-Verzeichnissen gleich. Es enthält `/data/rooms.json` mit Gruppendaten
und Wiederanmeldetokens. Lokale Gastreisen bleiben im Browser. Angemeldete
Figuren, Passwortableitungen und Sitzungshashes liegen im selben privaten
Serverspeicher. Niemals `down -v`, `docker volume rm` oder eine pauschale
Docker-Bereinigung zum Aktualisieren verwenden.

Vor einer Aktualisierung das laufende Spiel stoppen, damit SIGTERM die Gruppen
vollständig speichert. Erst danach die Datei kopieren. Das folgende Beispiel
legt die Sicherung mit privaten Rechten an und veröffentlicht sie erst nach
erfolgreicher Kopie durch Umbenennen im selben Verzeichnis:

```sh
umask 077
backup_dir=/srv/emberfall/backups
mkdir -p "$backup_dir"
chmod 700 "$backup_dir"
ef stop emberfall
backup_tmp=$(mktemp "$backup_dir/.rooms-XXXXXXXX")
if ef cp emberfall:/data/rooms.json "$backup_tmp"; then
  chmod 600 "$backup_tmp"
  backup_file="$backup_tmp.json"
  mv "$backup_tmp" "$backup_file"
  printf 'Private Sicherung: %s\n' "$backup_file"
  ef start emberfall
else
  rm -f "$backup_tmp"
  ef start emberfall
  printf 'Sicherung fehlgeschlagen; Aktualisierung abbrechen.\n' >&2
  exit 1
fi
```

Vor dem ersten Start existiert eventuell noch keine `rooms.json`; dann gibt es
auch keinen gespeicherten Gruppenstand zu sichern. Backups nicht ins Repository
oder in öffentlich ausgelieferte Verzeichnisse legen. Datum, bisheriges
Image-Tag und zugehörigen Quell-Commit beim Backup privat festhalten.

## 4. Aktualisieren und zurückrollen

Vor der Änderung den vorherigen vollständigen `EMBERFALL_RELEASE`-Wert sichern.
`EMBERFALL_SOURCE` auf den neuen geprüften Release-Pfad setzen. Das neue Image
mit seinem vollständigen Commit-SHA bauen, während die laufende Fassung und
die echte `.env.ip` noch den bisherigen Stand verwenden:

```sh
new_release=<GEPRUEFTER-GIT-SHA>
EMBERFALL_SOURCE=/srv/emberfall/releases/$new_release
EMBERFALL_RELEASE="$new_release" ef build emberfall
```

Danach das Backup erstellen, die echte `.env.ip` auf das neue SHA-Tag umstellen
und mit `ef up -d --no-build --wait emberfall` nur Emberfall ersetzen. Das
Volume bleibt bestehen. Healthcheck, externes Spiel und Wiederverbinden
danach erneut prüfen.

Für einen Rollback wieder den alten Release-Pfad und das alte Image-Tag wählen.
Das alte Image und seine Quelldateien deshalb bis zur erfolgreichen Prüfung
aufbewahren. **Ein älterer Server darf den inzwischen aktualisierten Spielstand
nur lesen, wenn dessen Schema nachweislich kompatibel ist.** Andernfalls das
Backup von vor der Aktualisierung wiederherstellen; Fortschritt nach dieser
Sicherung geht dabei verloren.

Zum Wiederherstellen den Dienst stoppen und die private Datei über stdin als
Container-Benutzer `node` in das unveränderte Volume schreiben. Das erhält die
Schreibrechte und ersetzt `rooms.json` erst nach gültiger JSON-Lektüre:

```sh
# ef verwendet hier bereits den alten Release-Pfad und das alte Image-Tag.
ef stop emberfall
ef run --rm -T --no-deps --entrypoint node emberfall -e '
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const bytes = fs.readFileSync(0);
  JSON.parse(bytes.toString("utf8"));
  const temp = "/data/.restore-" + crypto.randomUUID();
  fs.writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
  fs.renameSync(temp, "/data/rooms.json");
' < "$backup_file"
ef up -d --no-build --wait emberfall
ef ps
```

Die JSON-Prüfung bestätigt nur die Dateistruktur, nicht die Save-Kompatibilität.
Eine Wiederherstellung zunächst mit separatem Test-Volume und anderem freien
Port prüfen. Das Produktiv-Volume nicht mit einem ungeprüften Save überschreiben.
Eine spätere Domain mit HTTPS ist über die bestehende `deploy/compose.yaml`
möglich; den Wechsel und die übernommenen Volumes vorher ausdrücklich prüfen.

## 5. Konten mit HTTPS direkt über die IP

Passwörter dürfen am öffentlichen HTTP-Port nicht angenommen werden. Der
zusätzliche Proxy aus `compose.account.yaml` bietet HTTPS auf einem freien
Port, standardmäßig `9443`. `deploy/.env.account.example` ergänzt die private
`.env.ip`; die IP, das tatsächliche private Emberfall-Netz und das vorhandene
Proxy-Netz vor Ort prüfen. `EMBERFALL_PROXY_IP` ist eine freie feste Adresse
im Spielnetz; `EMBERFALL_TRUSTED_PROXY_CIDR` vertraut genau dieser Adresse mit
`/32`. Das Docker-Gateway und andere Container gehören nicht dazu.
`EMBERFALL_TLS_CONFIG` kann auf eine öffentliche
Konfigurationsdatei außerhalb wechselnder Release-Verzeichnisse zeigen.
Compose löst relative Mounts vom Verzeichnis der ersten Compose-Datei aus auf.

Der Proxy erhält mit Caddy 2.11.4 und `tls force_automate` ein öffentliches
IP-Zertifikat von Let's Encrypt mit dem Profil `shortlived`. `default_sni`
ermöglicht IP-Aufrufe von Clients ohne SNI. Die sechs Tage gültigen
[IP-Zertifikate](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability)
werden automatisch erneuert; beide TLS-Volumes müssen erhalten bleiben.
Die Validierung und jede Erneuerung benötigen weiterhin Port 80.

Wenn dort bereits ein anderer Proxy läuft, ausschließlich den Pfad
`/.well-known/acme-challenge/*` für die gewählte IP an `emberfall-https:80`
im gemeinsamen privaten Netz weitergeben. Vor der Änderung die bestehenden
HTTP-Antworten erfassen, die Konfiguration privat sichern, `caddy validate`
ausführen und die vorhandenen HTTPS-Routen auf Gleichheit prüfen. Eine
benötigte bestehende HTTP-Weiterleitung exakt erhalten, anschließend prüfen
und bei Abweichung zurückrollen. Einen einzelnen Docker-Dateimount durch
Schreiben in dieselbe Datei erhalten; ein atomarer Dateiaustausch würde seinen
gebundenen Inode zurücklassen. Den vorhandenen Proxy nur kontrolliert neu laden.

Beide Vorlagen für das bereits geprüfte Release verwenden:

```sh
ef() {
  docker compose --project-name emberfall \
    --env-file /srv/emberfall/.env.ip \
    -f "$EMBERFALL_SOURCE/deploy/compose.ip.yaml" \
    -f "$EMBERFALL_SOURCE/deploy/compose.account.yaml" "$@"
}
ef config
ef up -d --no-build --wait emberfall emberfall-https
curl --fail --silent --show-error https://<SERVER-IP>:9443/healthz
```

Nur den zusätzlichen Emberfall-TCP-Port freigeben. Browser und curl müssen
das Zertifikat ohne Sicherheitsausnahme akzeptieren. Die direkten HTTP-Aufrufe
geben für Konten `requiresHTTPS` und den sicheren Ursprung zurück; Anmeldung
und Registrierung antworten dort mit 426. Ein gefälschtes
`X-Forwarded-Proto` von öffentlichen Clients reicht nicht aus: akzeptiert wird
nur HTTPS mit dem exakt konfigurierten Host und dem angegebenen privaten
Proxy. Sitzungscookies sind Secure, HttpOnly, SameSite=Strict und auf
`/api/account` begrenzt. Jeder verbundene Tab bindet seine Befehle zusätzlich
an seine persönliche Figurenkennung.

Kontoaufnahme: zunächst 32 Konten auf diesem kleinen Server, konfigurierbar
mit `EMBERFALL_MAX_ACCOUNTS` zwischen 1 und 128. Ein niedrigeres Aufnahmelimit
entfernt keine bestehenden Figuren. Ausgebautes Gepäck und Lager vergrößern
die Speicher-Spitzen der atomaren JSON-Sicherung; 128 ausgewachsene Konten
wurden nicht als Betriebskapazität freigegeben. Acht Sitzungen pro Konto und
vier gleichzeitige Ereignisverbindungen pro Figur. Die acht aktiven Welten
umfassen nun auch persönliche Serverwelten. Ruhende Kontowelten simulieren
nicht. Registrierung ist auf zehn Versuche je IP und Stunde begrenzt; Login
auf zwanzig Versuche je IP sowie zwölf je Spielername in fünfzehn Minuten.
Die Passwortableitung verwendet asynchrones scrypt N32768/r8/p3 mit höchstens
zwei parallelen Jobs. Die [Leistungsprüfung](../docs/hosting-performance-v12.md)
belegt nur ihre ausdrücklich gemessenen Szenarien.

Ein Rollback auf V11 muss die private Sicherung vor Einführung der Konten
verwenden: V11 erkennt die optionalen Konto-Metadaten nicht und würde sie beim
Speichern verlieren. Laufende Konten niemals mit einem alten Server öffnen.

## 6. Entwicklungsstand direkt aus Git aktualisieren

Nach einem geprüften und nach `origin/main` übertragenen Entwicklungsstand
aktualisiert [update-from-git.sh](update-from-git.sh) den vorhandenen Dienst
direkt auf dem Hetzner-Server. Ein manuell hochgeladenes Quellarchiv ist dafür
nicht mehr nötig. Das Repository `muuuhli/Emberfall` ist öffentlich; der
standardmäßige HTTPS-Lesezugriff benötigt weder GitHub-Token noch Deploy-Key.
Die Betreiberkonfiguration und sämtliche Spielerdaten bleiben außerhalb von Git.

Den Einstieg einmal aus einem bereits geprüften Release installieren; dafür
den wirklichen vollständigen Commit-SHA einsetzen:

```sh
install -m 700 \
  /srv/emberfall/releases/<GEPRUEFTER-GIT-SHA>/deploy/update-from-git.sh \
  /srv/emberfall/update-from-git

# Den neuen origin/main-Stand genau einmal auflösen und als SHA ausliefern:
/srv/emberfall/update-from-git main

# Alternativ einen konkret geprüften Commit auf origin/main wählen:
/srv/emberfall/update-from-git <GEPRUEFTER-VOLLSTAENDIGER-COMMIT-SHA>
```

Die Befehle werden als berechtigter Betreiber auf dem Server ausgeführt.
Benötigt werden Bash, Git, Docker mit Compose und `up --wait`, curl, Python 3,
tar und flock. Der vorhandene Konto-/TLS-Betrieb aus Abschnitt 5 muss bereits
funktionieren. Das Skript richtet keine Firewall, fremden Reverse-Proxy oder
neuen Server ein. Es verwendet standardmäßig den Git-Cache
`/srv/emberfall/repo`, die vorhandene private `.env.ip`, die Release-Verzeichnisse
und das private Backup-Verzeichnis. Andere Pfade können mit `--repo-dir`,
`--env-file`, `--release-root` und `--backup-root` angegeben werden.
`--current-link` und `--source-marker` wählen die Betreiber-Metadaten. Ohne
diese Optionen liegen `current` und `DEPLOYED_SOURCE` neben der `.env`-Datei.
Ein vorhandenes `current` muss auf den bisherigen Release zeigen;
`DEPLOYED_SOURCE` enthält dessen vollständigen SHA mit Zeilenumbruch.

Ein vorhandener Git-Checkout bleibt einschließlich lokaler Änderungen erhalten:
das Skript holt nur `origin/main` und erzeugt eine separate Release-Kopie über
`git archive`. `origin` muss ausdrücklich das Emberfall-Repository benennen.
Bei einem künftig privaten Repository einen vom Betreiber bereitgestellten
lesenden SSH-Zugang außerhalb des Repositories konfigurieren; das Skript
speichert keine Zugangsdaten und nimmt keine Token-URL an.

Der Ablauf baut zunächst das Image mit dem vollständigen Commit-SHA, während
die bisherige Spielsimulation weiterläuft. Er stoppt anschließend nur den
Emberfall-Spielserver, legt Spielstand und bisherige Konfiguration privat mit
Dateirechten `0600` ab und prüft den Spielstand mit der neuen Autorität in einem
wegwerfbaren Container ohne Netzwerk und ohne Produktivvolume. Erst nach dieser
Prüfung wird `EMBERFALL_RELEASE` atomar in der privaten Konfiguration ersetzt.
Aktualisiert werden ausschließlich `emberfall` und der eigene Dienst
`emberfall-https`; das feste Volume `emberfall_data` und beide TLS-Volumes bleiben
erhalten. Gruppen sind während des kurzen Dienstwechsels vorübergehend getrennt.

Die Abnahme vergleicht Image-ID und Commit-Label, sämtliche Laufzeitdateien im
Container und die öffentlich über HTTPS gelieferten Start-/UI-Dateien mit dem
gewählten Git-Archiv. curl prüft das echte Zertifikat ohne Sicherheitsausnahme,
den Healthcheck und den sicheren Konto-Endpunkt. Ein abweichender Ursprung,
anderes Datenvolume, geänderte vorhandene Release-Dateien oder ein Commit
außerhalb des geholten `origin/main` bricht die Aktualisierung ab.
Erst nach sämtlichen erfolgreichen Prüfungen werden der `current`-Symlink und
die Datei `DEPLOYED_SOURCE` jeweils atomar auf den neuen geprüften Stand gesetzt.
Die SHA-Datei behält private Rechte `0600`. Ihre vorherigen Werte liegen beim
Backup; schlägt eine Veröffentlichung dazwischen fehl, stellt die
Fehlerbehandlung auch diese Metadaten wieder her. Fremde Änderungen an den
Metadaten werden dabei nicht überschrieben.

Bei einem Fehler vor der Umstellung wird die unveränderte bisherige Fassung
wieder gestartet. Bei einem Fehler nach der Umstellung sichert das Skript den
fehlgeschlagenen Stand zusätzlich privat und stellt **Konfiguration und passenden
Spielstand von vor dem Update gemeinsam** wieder her, bevor es die alte Fassung
startet. Fortschritt während dieses kurzen fehlgeschlagenen Wechsels befindet
sich im zusätzlichen `failed-state.json`; er wird nicht mit dem alten Schema
vermengt. Automatische Rückwärtsupdates werden grundsätzlich abgewiesen.
Backups und alte Images erst nach der erfolgreichen Abnahme nach eigener
Aufbewahrungsregel bereinigen; das Skript löscht keine Produktivvolumes.

Die [nativen Ablaufprüfungen](../tests/update-from-git.test.js) führen das echte
Shellskript mit isolierten Git-/Docker-/HTTP-Gegenstellen aus und prüfen auch
Fehler bei Build, Backup, Speicherkompatibilität, Dienststart, TLS und
Quellvergleich. Diese Gegenstellen ersetzen keine tatsächliche Docker- und
HTTPS-Abnahme auf dem Server.

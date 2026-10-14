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
`.env.ip` als `EMBERFALL_MEMORY_LIMIT` und `EMBERFALL_CPU_LIMIT`. Vor einer
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
und Wiederanmeldetokens. Einzelspieler-Spielstände bleiben im Browser des
jeweiligen Spielers. Niemals `down -v`, `docker volume rm` oder eine pauschale
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

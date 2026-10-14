# V13: Begrenzte Leistungsprüfung auf Hetzner Gaming

Die einmalige Messung des aktuellen V13-Runtimes mit acht bewegten Figuren und zwei parallelen Registrierungen gefolgt von zwei parallelen Logins ist funktional erfolgreich. Die Gesamt-P95-Ziele wurden eingehalten, die engeren Ziele während des Anmeldebursts wurden diesmal überschritten: Tick-P95 45.529 ms bei 40 ms Budget, SSE-Lücken-P95 180.937 ms bei 160 ms Budget. Das Ergebnis wird vollständig dokumentiert; es gab keinen weiteren Lauf zur Auswahl besserer Zahlen, keine CPU-Erhöhung und keine Abschwächung der Passwortberechnung.

Gemessen am 14. Oktober 2026 tatsächlich auf Hetzner Gaming, Linux, Node v24.21.0. Verwendet wurde Image `emberfall:702e4240ebc08bb36f7f951068a59b4a83839b7f` mit unveränderter Docker-ID `sha256:e78d722d4dc5fc50c409fcbbdde580559fac095b16cc05dd7233676c64b18ff1`. Seine Spiel-/Account-Runtime entspricht V13.0.1. Der anschließend ergänzte, hier unbenutzte Update-Validator und die Paketversionsangabe sind keine gemessenen Runtimeänderungen. Die Probe erfolgte vor der Veröffentlichung dieses Images; daraus wird kein Erfolg des Deployments abgeleitet.

## Last, Isolation und Ressourcen

Die unveränderte [native V12-Messhilfe](../tests/scripts/hosting-performance-v12.mjs) wurde als eigenes lesbares Testskript gemountet. Ihr SHA-256 ist `1a3d0075fa94c4fdab00deacddaa1ba294724fa9e75c6f2d606ff1fb9ef71623`. Die bestehende [V12-Messmatrix](hosting-performance-v12.md) bleibt unverändert.

Die acht Gastfiguren gehören zu einer Oberweltgruppe und senden alle 75 ms echte HTTP-Bewegungskommandos. Nach fünf Sekunden Warmlauf folgt ein 20-s-Messfenster; fünf Sekunden nach dessen Beginn starten die zwei Registrierungen, danach die zwei Logins. Die beiden Kontofiguren bleiben in ihren persönlichen Welten inaktiv. Dies ist kein Kampf-, Dungeon-, Raid-, Browser-FPS- oder Mobile-Rendertest. Es wurden weder 64 gleichzeitig aktive Spieler noch eine MMO-Kapazität geprüft.

Der eigene Testcontainer nutzte `--network none`, keine Ports und kein Produktivvolume, einen schreibgeschützten Root-Dateibaum und ein eigenes `/tmp`-Tmpfs. Alle Anfragen gingen ausschließlich an den privaten Loopback-Server im Container. Grenzen: 0,5 CPU mit 50.000 µs Periode / 25.000 µs Quota, 768 MiB Container-RAM, 384 MiB Node-Heap. Der Clienttreiber läuft im selben Prozess wie die Autorität; CPU/RSS schließen ihn ein. Initiale SSE-Zustände und Warmlauf sind aus den Transportstatistiken ausgeschlossen.

Während der Messung erfolgten keine Hostbuilds oder Deploys. Die fünf vorhandenen Dienste waren vor und nach der Probe aktiv, die Spielcontainer gesund. Die Probe beendete sich mit Exit-Code 0 und entfernte ihren Container und ihre privaten Fixtures. Sie änderte keine laufenden Dienste, Accounts, Spielstände, Proxy- oder Firewallregeln.

## Tatsächliche Messwerte

Das Messfenster dauerte 19.999 s, der Anmeldeburst 2694.877 ms. P95 bedeutet hier die Quantile dieser kurzen konkreten Probe, keine langfristige Latenzgarantie.

| Metrik | Gesamtes Messfenster | Nur Anmeldeburst | Vorgesehenes P95-Ziel |
| --- | ---: | ---: | ---: |
| Tick P50 | 4.399 ms | 5.404 ms | — |
| Tick P95 | 17.407 ms | **45.529 ms** | 40 ms |
| Tick Maximum | 100.165 ms | 50.487 ms | — |
| HTTP-Eingabe-RTT P95 | 19.490 ms | 55.722 ms | 100 ms |
| HTTP-Eingabe-RTT Maximum | 108.119 ms | 108.119 ms | — |
| SSE-Abstand P95 | 109.178 ms | **180.937 ms** | 160 ms |
| SSE-Abstand Maximum | 182.056 ms | 182.056 ms | — |
| Event-Loop-Verzögerung P95 | 22.561 ms | 55.607 ms | — |
| Speicher-Checkpoint P95 | 102.566 ms | 90.575 ms | — |

Die Tickquantilen umfassen 475 / 52 Stichproben insgesamt / im Burst; SSE-Abstände 1896 / 208. Es wurden 1947 Eingaben beantwortet, 8 Sendeversuche wegen einer noch offenen vorherigen Anfrage ausgelassen. Diese ausgelassenen Versuche sind keine behaupteten verlorenen Serverpakete. Alle acht SSE-Streams lieferten jeweils 238 Deltas ohne Sequenz- oder Streamfehler. Rohtransport gesamt 162.382 KiB/s, durchschnittliches Paket 1.706 KiB, ohne Kompression und öffentliche Proxy-/Netzlatenz.

CPU im gesamten Fenster: 25.612 % eines Kerns. RSS-Spitze 207.539 MiB, Heap-Spitze 45.241 MiB, separat gemeldete Cgroup-Speicherspitze 157.066 MiB bei bestätigtem 768-MiB-Limit. Der Container wurde in 70 CPU-Perioden gedrosselt; kumulierte Drosselzeit 1621.011 ms. Speichergrenzen wurden nicht erreicht.

Die beiden Registrierungs-RTTs lagen bei 1390.671 bis 1397.883 ms; beide Logins bei 1293.624 bis 1295.581 ms. Mit jeweils zwei Stichproben wäre eine repräsentative „Login-P95“ irreführend. Höchstens zwei Passwortberechnungen liefen gleichzeitig, alle vier abgeschlossen. Die private Account-Erstellung konstruierte zwei Figuren in 6.329 bis 32.627 ms. Der native Neustart dauerte 1101.132 ms und erhielt alle acht Figuren, beide Kontodatensätze und Anmeldecookies; die Kontowelten blieben inaktiv.

## Einordnung

Die vorherige V12-Einzelprobe mit denselben 50/25-ms-CPU-Grenzen erreichte im Burst 18,386 ms Tick-P95 und 148,114 ms SSE-P95. Diese V13-Einzelprobe zeigt, dass die damalige Zielerreichung keine zuverlässige Garantie unter paralleler Anmeldung ist. Zwei kurze Läufe verschiedener Stände trennen Codekosten, Schedulerphasen und Hostschwankungen nicht ausreichend für eine ursächliche Regressionsbehauptung.

Gemessen wurden weiterhin teure synchrone Checkpoints: bis 102.566 ms, während des Bursts bis 90.575 ms. Zusammen mit der protokollierten CPU-Drosselung sind dies konkrete Ansatzpunkte für eine spätere begrenzte Optimierung. Die aktuelle Aussage lautet: acht bewegte Figuren funktionieren in dieser Probe, die endliche Kontoburstphase verursacht sichtbare Latenzspitzen. Eine Kapazitäts- oder Latenzgarantie für mehr Spieler wird daraus nicht abgeleitet.

## Reproduktion und Rohdaten

```sh
docker run --rm --network none --cpu-period 50000 --cpu-quota 25000 --memory 768m \
  --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e NODE_OPTIONS=--max-old-space-size=384 \
  -v /srv/emberfall/benchmarks/hosting-performance-v13.mjs:/app/tests/scripts/hosting-performance-v12.mjs:ro \
  --entrypoint node emberfall:702e4240ebc08bb36f7f951068a59b4a83839b7f \
  /app/tests/scripts/hosting-performance-v12.mjs \
  --players 8 --rooms 1 --seconds 20 --warmup 5 --account-burst
```

Die tatsächlich ausgeführte Remote-Probe hatte zusätzlich einen 40-s-Prozess-Timeout. Ihr ursprüngliches, unverändertes Roh-JSON liegt lokal und ignoriert unter `.openai/.local/performance-v13/hetzner-v13-8-players-account-burst.json`. Es enthält ausschließlich Messwerte und Prüfergebnisse, keine Passwörter, Cookies oder Tokens. Das Feld `probe: isolated-native-http-sse-v12` benennt die wiederverwendete Messhilfe, nicht die Spielversion.

# Isolierte Leistungsprüfung für den Hetzner-Spielserver

Die Probe startet einen eigenen dedizierten Node-Spielserver auf einem zufälligen
Loopback-Port. Sie erzeugt ausschließlich eigene Figuren und Gruppen in einem
privaten temporären Verzeichnis. Einen Remote-Zielparameter gibt es nicht;
Port 8088, vorhandene Gruppen und andere Gaming-Dienste werden nicht verwendet.
Nach der Messung werden die Testverbindungen, der Server und der eigene Speicher
geschlossen beziehungsweise entfernt. Die Probe löst keine Produktänderung aus.

```sh
node tests/scripts/hosting-performance-v12.mjs --players 2 --seconds 20 --warmup 5
node tests/scripts/hosting-performance-v12.mjs --players 4 --seconds 20 --warmup 5
node tests/scripts/hosting-performance-v12.mjs --players 8 --seconds 20 --warmup 5
```

Eine Ausführung enthält höchstens acht Figuren. Standardmäßig reisen alle in
einer Gruppe; `--rooms 2` verteilt dieselbe Gesamtzahl auf zwei Gruppen.
Die Eingabeintervalle von 75 Millisekunden entsprechen der Mindestdistanz im
normalen Browser-Client. Je Figur ist höchstens eine Anfrage gleichzeitig offen.
Normale Bewegungsbefehle beschreiben kleine Rechtecke nahe dem Ausgangspunkt;
Figurenwerte, Positionen, Gesundheit und Weltzustände werden nicht manipuliert.
Diese Oberweltprobe ersetzt deshalb keine volle Raid- oder PvP-Messung.

Die ersten fünf Sekunden und die vollständigen SSE-Ausgangszustände gehen nicht
in die Transportmessung ein. Gemessen werden reale HTTP-Antwortzeiten und
SSE-Ankünfte, Sequenzkonsistenz, Tickdauer und Tickabstände, Verzögerung der
Ereignisschleife, CPU-Verbrauch und Spitzenwerte von RSS/Heap. Die normale
Zehn-Sekunden-Speicherung bleibt aktiviert. Zusätzlich erfolgt ein ausdrücklich
deklarierter Speichercheckpoint in der Mitte der Probe; die gemessene Dauer
umfasst Erfassung, JSON und den echten atomaren Dateispeicher. Nach der Probe
prüft ein tatsächlicher Serverneustart die unveränderten persönlichen Kennungen,
Klassen, Stufen, Goldwerte und Positionen. Sitzungstokens und Speicherinhalte
werden nicht ausgegeben.

Clienttreiber und Autorität laufen in derselben Node-Instanz. CPU und Speicher
enthalten daher beide Seiten; die umhüllte Tickdauer misst nur die Autorität.
Loopback-Antwortzeiten bestätigen keine öffentlichen Internetlatenzen. Die
angegebenen Budgets sind Prüfziele und keine automatische Kapazitätszusage:
40 Millisekunden pro Tick, nominell 80 Millisekunden pro Snapshot,
SSE-P95 höchstens 160 Millisekunden und HTTP-P95 höchstens 100 Millisekunden.
Die Ereignisschleifenmessung verwendet eine Auflösung von zehn Millisekunden;
ihr typischer Grundwert liegt entsprechend bereits nahe zehn Millisekunden.

## Optionale Kontoprobe unter laufender Gruppenlast

```sh
node tests/scripts/hosting-performance-v12.mjs \
  --players 8 --seconds 20 --warmup 5 --account-burst
```

Die Option benötigt ein Image mit den neuen Kontofunktionen. Fünf Sekunden nach
Beginn des Messfensters registriert sie zwei eigene Konten parallel und meldet
diese anschließend parallel an. Beide persönlichen Welten bleiben inaktiv;
neben den acht bewegten Gastfiguren wird keine weitere Welt simuliert. Die
Passwörter werden ausschließlich für diese Probe zufällig erzeugt, nach den
Anmeldungen aus den Fixtures entfernt und weder ausgegeben noch ins Repository
geschrieben. Cookiewerte bleiben im Testprozess. Nur die eigene Loopback-Adresse
wird verwendet; für diesen privaten Test sind lokale HTTP-Anfragen erlaubt.

Das JSON ergänzt Antwortzeiten für Registrierung und Anmeldung, die tatsächlich
ausgeführte asynchrone Passwortberechnung, ihre maximale Parallelität sowie
CPU, Tickzeiten, Eingabeantwortzeiten, SSE-Abstände und Ereignisschleifenwerte
während dieses konkreten Anmeldefensters. Registrierung und Anmeldung enthalten
auch die Weltanlage und dauerhafte Speicherung; diese beiden Abschnitte erhalten
zusätzliche getrennte Dauerwerte. Die separat umhüllte Passwortberechnung misst
ihre asynchrone Aufrufdauer einschließlich der Zeit bis zur Callback-Ausführung;
das ist keine isolierte CPU-Zeitmessung des Kryptoverfahrens. Der Kontoanmeldetest muss innerhalb
des unverändert langen Messfensters fertig werden, sonst gilt die Probe als
fehlgeschlagen. Authentifizierungsanfragen erhalten eine Höchstfrist von
40 Sekunden; die normale Eingabemessung behält ihre bisherige Fünf-Sekunden-Frist.

Der anschließende native Neustart prüft zusätzlich die beiden Kontodatensätze und
die fortbestehenden Anmeldecookies sowie ihre inaktiven persönlichen Welten.
Die übrigen Gastmessungen und Wiederanmeldetests bleiben erhalten. Der Burst
ist ein deklariertes Ereignis mit zwei legitimen gleichzeitigen Anmeldungen,
kein Registrierungsangriff oder dauerhafter Lasttest. Eine kurze Einzelprobe
ist keine verlässliche Login-P95-Aussage für den öffentlichen Betrieb.

## Auf Hetzner mit den tatsächlichen Containergrenzen

Nur das geprüfte Release-Image verwenden. Das Produktimage enthält bewusst keine
Tests. Für die Probe wird deshalb genau dieses einzelne Skript lesend an seinen
passenden Modulpfad gemountet. Der Testcontainer hat kein externes Netzwerk und
kein Produktivvolume. Er kann weder den öffentlichen Server noch andere Spiele
über das Netzwerk ansprechen. Die Grenze von einer halben CPU und 768 MiB bleibt
wie beim laufenden Emberfall-Dienst erhalten.

```sh
release=<GEPRUEFTER-VOLLSTAENDIGER-COMMIT-SHA>
script=/srv/emberfall/releases/$release/tests/scripts/hosting-performance-v12.mjs
docker run --rm --network none --cpu-period 50000 --cpu-quota 25000 --memory 768m \
  --read-only --tmpfs /tmp --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -e NODE_OPTIONS=--max-old-space-size=384 \
  -v "$script:/app/tests/scripts/hosting-performance-v12.mjs:ro" \
  --entrypoint node "emberfall:$release" \
  /app/tests/scripts/hosting-performance-v12.mjs \
  --players 2 --seconds 20 --warmup 5
```

Die ausgewählten 50.000/25.000 Mikrosekunden erhalten die halbe CPU; ihre
Abnahme und der Vergleich zur ursprünglichen 100-ms-Periode stehen unten.
Für die ursprüngliche Baseline wurde stattdessen `--cpus 0.5` verwendet.
Die drei Spielerzahlen nacheinander prüfen, höchstens einen Testcontainer zugleich.
Vorher und nachher die vorhandenen Dienste sowie CPU und Speicher des Hosts
prüfen. Cgroup-Werte im JSON bestätigen die verwendeten Grenzen und zeigen
CPU-Drosselung. `peakCgroupMemoryMiB` zählt den gesamten Testcontainer seit seinem
Start; RSS/Heap zählen nur das ausgewiesene Messfenster. Bei Überschreitungen
erst den dominierenden gemessenen Abschnitt untersuchen und anschließend dieselbe
Probe wiederholen. Die Grenzen nicht ohne Prüfung des übrigen Hosts erhöhen.

## Lokale Plausibilitätsprüfung

Am 14. Oktober 2026 bestand eine kurze Probe auf macOS mit Node 24.13.1, zwei
Figuren in einer Gruppe, einer Sekunde Aufwärmen und drei Sekunden Messung.
74 Autoritätsticks hatten P95 5,427 ms; 78 HTTP-Eingaben P95 6,816 ms.
74 Delta-Snapshots kamen mit P95 84,819 ms Abstand an. Der zusätzliche atomare
Checkpoint dauerte 8,210 ms; der tatsächliche Neustart mit unveränderten
Figurenwerten bestand. CPU 11,388 Prozent eines Kerns und RSS 139,094 MiB
enthalten sowohl Server als auch Testtreiber. Keine Eingabe wurde übersprungen.

Diese kurze lokale Ausführung prüft Funktion und Beendigung der Probe; sie
liefert keine Hetzner-Kapazitätszusage. Registrierung, Passwortberechnung,
längere Spielreisen, öffentliche Netzlatenz, TLS und mobile Renderleistung
gehören nicht zu dieser lokalen Gastprobe. Die optionale Kontoprobe wird gesondert
ausgewertet.

Die erste lokale Kontoprobe mit zwei Gastfiguren, einer Sekunde Aufwärmen und
zwölf Sekunden Messung bestand ebenfalls. Zwei parallele Registrierungen und
zwei anschließende parallele Anmeldungen dauerten zusammen 583,357 ms; höchstens
zwei KDF-Aufrufe liefen gleichzeitig. Registrierung-Maximum 359,112 ms,
Anmeldung-Maximum 223,812 ms, KDF-Maximum 271,244 ms. Beide Konten und ihre Cookies
bestanden die anschließende Neustartprüfung, ohne ihre privaten Welten zu
aktivieren. Der SSE-Abstand erreichte im Burstfenster 202,796 ms und die
Eingabeantwort 87,409 ms; zwei Sendeintervalle wurden übersprungen. Globale
P95-Werte von 82,725 beziehungsweise 1,169 ms hätten diesen kurzen Ausreißer
verdeckt. Das ist eine technische Probe auf dem Mac, keine Hetzner-Kapazitäts-
oder Internetlatenzaussage. Die getrennte Weltanlage-/Speicherinstrumentierung
wurde danach für die tatsächlichen Hetzner-Burstproben ergänzt.

## Tatsächliche Hetzner-Baseline

Am 14. Oktober 2026 wurden die drei Proben nacheinander auf dem vorhandenen
Hetzner-Gaming-Host ausgeführt. Jede verwendet das zuvor laufende Image
`emberfall:2acbaa59e119f0edd06602d61fc7ea74a485cbab`, Node 24.21.0, eine Gruppe,
fünf Sekunden Aufwärmen und 20 Sekunden Messung. Cgroups bestätigten eine
halbe CPU und 768 MiB; der Testcontainer hatte kein externes Netzwerk und kein
Produktivvolume. Produktionscontainer und vorhandene Spieldaten wurden nicht
verändert. Diese Baseline enthält noch keine neuen Spielerkonten.

| Figuren | Tick P95 | Tick Maximum | HTTP P95 | SSE-Abstand P95 | Speicher P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 4,440 ms | 26,763 ms | 2,351 ms | 83,639 ms | 25,944 ms |
| 4 | 7,282 ms | 75,412 ms | 3,991 ms | 84,528 ms | 72,452 ms |
| 8 | 12,651 ms | 42,624 ms | 8,129 ms | 91,050 ms | 26,064 ms |

| Figuren | CPU, ein Kern | RSS-Spitze | Heap-Spitze | SSE-Rohdaten gesamt | Ereignisschleife P95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 | 9,732 % | 125,887 MiB | 34,141 MiB | 34,395 KiB/s | 11,600 ms |
| 4 | 15,440 % | 144,156 MiB | 39,702 MiB | 71,064 KiB/s | 13,451 ms |
| 8 | 22,090 % | 148,324 MiB | 38,473 MiB | 167,069 KiB/s | 18,792 ms |

496 beziehungsweise 495 Autoritätsticks lieferten diese Messwerte. Alle
2/4/8 Verbindungen erhielten durchgehend konsistente Delta-Snapshots;
530/1.050/2.046 gemessene Eingaben benötigten keine übersprungenen Sendeintervalle.
Die drei echten Speichercheckpoints je Probe enthalten den expliziten zusätzlichen
Checkpoint. Bei nur drei Stichproben entspricht Speicher-P95 dem Maximum und
ist keine belastbare Langzeitstatistik. Die tatsächlichen Neustarts behielten
alle verglichenen Figurenwerte und Positionen; sie dauerten rund 1,194/2,086/3,998
Sekunden für 2/4/8 Figuren.

Die P95-Prüfziele für diese bewegte Oberweltgruppe wurden mit allen drei
Spielerzahlen erreicht. Einzelne Ticks lagen bei vier und acht Figuren über
40 Millisekunden; die festen Tickabstände erreichten dort 76,087 beziehungsweise
87,278 Millisekunden. Die Viererprobe enthält einen 72,452-ms-Speichercheckpoint
und eine Ereignisschleifen-Spitze von 83,886 ms. Dieser Speicherausreißer wiederholt
sich in der Achterprobe nicht. CPU-Drosselung durch die reale halbe CPU trat
1/3/10-mal auf und betrug insgesamt 3,165/98,226/168,777 ms. Ursache und Anteil
von Serialisierung, Datenträger, Garbage Collection und Drosselung sind damit
noch nicht getrennt; eine konkrete Beschleunigung wurde nicht behauptet oder
ungeprüft in den Produktivspeicher eingebaut.

Die Original-JSON der Vierer- und Achterprobe liegen ausschließlich im ignorierten
lokalen Ordner `.openai/.local/performance-v12/` unter
`hetzner-baseline-4.json` und `hetzner-baseline-8.json`. Die Zweierwerte stammen
aus dem ausgewerteten ursprünglichen Tooloutput; dafür wird keine vorhandene
Rohdatendatei behauptet. Die Probe belegt eine aktive bewegte Oberweltgruppe,
keine acht gleichzeitig vollen Gruppen, keine Raid-Spitze und keinen langen
Serverbetrieb. Vor der Freigabe neuer Kontofunktionen denselben Vergleich mit
dem tatsächlich gebauten neuen Image wiederholen und Passwortberechnung sowie
den veränderten dauerhaften Speicher separat untersuchen.

## Neue Kontofassung vor der Weltinitialisierungsoptimierung

Anschließend wurden dieselben drei Proben mit dem geprüften neuen Image
`emberfall:account-v12-candidate` ausgeführt. Vor jeder Ausführung wurde dessen
Image-ID `sha256:7d0d9bf32c85be0564694fce8e44cd6260d04b4ebf9486581489c468daadc7ef`
kontrolliert. Die aktuelle Benchmarkdatei wurde separat lesend gemountet;
SHA-256 `1a3d0075fa94c4fdab00deacddaa1ba294724fa9e75c6f2d606ff1fb9ef71623`.
Limits, Node-Version, Loopback, Aufwärmen und Messfenster blieben gleich.
Der Docker-Test bekam zusätzlich eine Gesamthöchstfrist von 40 Sekunden.

| Figuren | Tick P95 | Tick Maximum | HTTP P95 | SSE-Abstand P95 | Speicher Maximum | RSS-Spitze | CPU, ein Kern |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2 | 4,429 ms | 29,314 ms | 2,258 ms | 83,344 ms | 23,104 ms | 129,008 MiB | 10,450 % |
| 4 | 7,148 ms | 27,276 ms | 4,592 ms | 85,944 ms | 21,422 ms | 138,688 MiB | 15,325 % |
| 8 | 12,739 ms | 61,506 ms | 5,481 ms | 87,862 ms | 59,370 ms | 146,695 MiB | 21,147 % |

Alle drei tatsächlichen Neustarts bestanden. Keine dieser normalen Gastproben
übersprang ein Eingabeintervall. Ihre globalen P95-Werte liegen in derselben
Größenordnung wie die ursprüngliche Baseline. Einzelne Unterschiede oder ein
kleinerer Maximalausreißer werden mangels Wiederholungsreihe nicht als allgemeine
Beschleunigung gewertet. Die Original-JSON heißen lokal
`hetzner-candidate-2.json`, `hetzner-candidate-4.json` und
`hetzner-candidate-8.json`. Für die Zweierprobe bleibt zusätzlich die ursprüngliche
Ausgabe mit der Skripthash-Prüfzeile als `hetzner-candidate-2.raw` erhalten;
die JSON-Zeile wurde ohne Änderung der Messwerte daraus entnommen.

### Tatsächlicher Anmeldeburst mit acht laufenden Figuren

Die vierte Probe verwendete dasselbe unveränderte Image und die Option
`--account-burst`. Zwei parallele Registrierungen und zwei anschließende Logins
beendeten sich innerhalb des Messfensters. Beide Konten, ihre Cookies und alle
Gastfiguren bestanden die echte Neustartprüfung; die persönlichen Kontowelten
blieben inaktiv. Die Originalausgabe liegt lokal als
`hetzner-candidate-8-account-burst.json`.

| Abschnitt | Gemessen |
| --- | ---: |
| Gesamter Burst | 3.385,551 ms |
| Registrierung Maximum, zwei Anfragen | 1.687,387 ms |
| Login Maximum, zwei Anfragen | 1.697,017 ms |
| KDF Maximum, vier Aufrufe; höchstens zwei parallel | 1.525,203 ms |
| Neue Game-Konstruktionen | 202,469 und 266,809 ms |
| Vier Speicherschritte während der Anmeldung, Maximum | 95,065 ms |
| Tick P95 im Burst | 28,781 ms |
| Eingabeantwort P95 / Maximum im Burst | 12,991 / 304,538 ms |
| SSE-Abstand P95 / Maximum im Burst | 213,252 / 594,778 ms |
| Ereignisschleife P95 / Maximum im Burst | 65,372 / 295,174 ms |
| CPU während des Bursts, ein Kern | 50,951 % |
| RSS-Spitze des gesamten Messfensters | 208,477 MiB |

Das SSE-P95-Ziel von 160 Millisekunden wurde **während der Kontoanlage verfehlt**.
Globale P95-Werte von 103,014 ms für SSE und 9,098 ms für Eingaben hätten diesen
kurzen Engpass verdeckt. 16 Eingabeintervalle wurden übersprungen; die
Eingabeanfragen blieben auf höchstens eine offene Anfrage je Figur begrenzt.
46 CPU-Drosselperioden dauerten in Summe 1.907,330 ms. Die Ergebnisse bestätigen
damit einen konkreten Verbesserungsbedarf vor der Kontofreigabe und keine
vollständig stabile Anmeldung unter Gruppenlast.

### Gezielte Maßnahme und ihre nativen Prüfungen

Die synchrone Game-Konstruktion erzeugte bei jeder neuen Figur dieselbe
deterministische Welt erneut. Die Serverfactory erzeugt diese kanonische Welt
jetzt einmal vor dem Öffnen des Servers und kopiert sie für jede Figur mit
`structuredClone`. Jede Welt besitzt eigene veränderliche Gegner, Ressourcen,
Ereignisse, Bäume und weitere Zustände. Persönliche Game-Felder und Klassen
werden weiterhin frisch initialisiert. Normale Browsergames und benutzerdefinierte
Hub-Factories behalten ihren bisherigen Standardweg. Passwortparameter und
Kontoprotokoll wurden für diese Maßnahme nicht abgeschwächt.

Vier native Prüfungen bestanden: vollständige Ausgangsäquivalenz aller acht
Klassen einschließlich NPC-Katalogidentität; unabhängige Welt- und persönliche
Mutationen; gleiche Reset-/Save-Übernahme; tatsächlicher Gast-/Kontoneustart mit
getrennten Welten, erhaltenem Fortschritt und ursprünglichen Kennungen.
Ein zusätzlicher lokaler Vergleich mit je zehn Game-Konstruktionen hatte auf
dem Mac einen Median von 67,901 ms für die Weltgenerierung und 3,250 ms für
die unabhängige Kopie. Das ist ein lokaler Konstruktionsvergleich und keine
öffentliche Serverlatenz.

### Gemessener Vergleich nach der gezielten Optimierung

Die Wiederholung verwendete `emberfall:account-v12-optimized` mit kontrollierter
Image-ID `sha256:29d19a3987924f2b7d13e57264551c7f685507d57f0e72c3e285b750a4e93230`.
Alle Ressourcen- und Probenparameter blieben gleich: 0,5 CPU mit der üblichen
100-ms-CFS-Periode, 768 MiB, acht Gastfiguren, fünf Sekunden Aufwärmen und
20 Sekunden Messung. Die normale Achterprobe erreichte Tick-P95 14,237 ms,
HTTP-P95 7,624 ms und SSE-Abstand-P95 91,230 ms bei RSS 151,262 MiB und
CPU 22,950 Prozent eines Kerns. Keine Eingabeintervalle wurden übersprungen;
der unveränderte Gastzustand bestand den Neustart in 798,200 ms.

| Kontoburstabschnitt | Vor der Factory | Nach der Factory |
| --- | ---: | ---: |
| Neue Game-Konstruktion, Maximum | 266,809 ms | 5,176 ms |
| Gesamte Registrierung-/Loginfolge | 3.385,551 ms | 2.353,925 ms |
| Registrierung, Maximum | 1.687,387 ms | 1.071,681 ms |
| Login, Maximum | 1.697,017 ms | 1.281,513 ms |
| SSE-Abstand P95 im Burst | 213,252 ms | 142,890 ms |
| SSE-Abstand Maximum im Burst | 594,778 ms | 200,261 ms |
| Eingabeantwort P95 im Burst | 12,991 ms | 33,270 ms |
| Eingabeantwort Maximum im Burst | 304,538 ms | 199,089 ms |
| Ereignisschleife Maximum im Burst | 295,174 ms | 107,414 ms |
| Übersprungene Eingabeintervalle gesamt | 16 | 8 |

Die konkreten Konstruktionsspitzen wurden reduziert; das SSE-P95-Ziel im
Anmeldefenster wurde jetzt erreicht. Der Vergleich zeigt zugleich weiterhin
kurze Ausreißer und keine garantierte verzögerungsfreie Anmeldung. Die
Input-P95 wurde in dieser Burstprobe größer, blieb aber unter ihrem 100-ms-Ziel.
Passwortparameter und ihre maximale Parallelität blieben unverändert.
Der gemessene Speicher-Maximalwert während der Anmeldung blieb 92,356 ms;
Speicherung und CPU-Drosselung werden nicht als vollständig gelöst behauptet.

Alle Gastzustände, beide Kontodatensätze und Cookies bestanden erneut den
tatsächlichen Neustart; die Kontowelten blieben inaktiv. Die Rohdaten heißen
lokal `hetzner-optimized-8.json` und `hetzner-optimized-8-account-burst.json`.
Eine kürzere CPU-Periode wurde aufgrund dieses einzelnen erreichten P95-Ziels
zunächst nicht eingestellt. Die folgende Wiederholung mit dem endgültigen Image
zeigte, warum dieser Einzelwert noch keine stabile Zusage war.

### Abschließende Prüfung des endgültigen Images und der CPU-Periode

Das endgültige Image `emberfall:account-v12-final-candidate` besitzt die geprüfte
ID `sha256:d4fb9998c28390236ee25d36edb1c4dcfe6ffe41395ecca4b5812ecbb5741f25`.
Seine `server.mjs` hat SHA-256
`ca2e7a3ecbf1f05369858f22556df1788e26bfabf8981d60a963ed806f6a0566`.
Gegenüber der vorherigen Factoryfassung wurde zusätzlich die Absicherung
öffentlicher Bindeadressen verschärft; dieser geänderte Zweig wird durch die
private Loopback-Probe nicht ausgeführt. Trotzdem erfolgte die abschließende
Messung mit diesem exakten Image.

Die Wiederholung bei der üblichen 100-ms-CPU-Periode verfehlte das SSE-P95-Ziel
im Burst mit 195,625 ms. Eine 20-ms-Periode bei unveränderter halber CPU brachte
SSE-P95 auf 147,015 ms, erhöhte aber gleichzeitig die Tick-P95 im Burst auf
67,062 ms. Dieser Zielkonflikt wurde nicht durch einen globalen P95-Wert verdeckt.
Ein letzter begrenzter Vergleich mit 50 ms Periode und 25 ms Quota erreichte
beide Ziele. Der gleiche native Code, dieselben acht Gastfiguren, zwei parallele
Registrierungen und zwei Logins, die unveränderte Passwortberechnung und der
gleiche Speicher wurden verwendet. Alle drei tatsächlichen Neustarts erhielten
Figuren, beide Konten und Cookies; ihre persönlichen Welten blieben inaktiv.

| CPU-Periode / Quota | Globale Tick-P95 | Tick-P95 im Burst | SSE-P95 im Burst | Eingabe-P95 im Burst | Übersprungene Eingaben |
| --- | ---: | ---: | ---: | ---: | ---: |
| 100 / 50 ms, 0,5 CPU | 15,148 ms | 19,468 ms | 195,625 ms | 14,465 ms | 0 |
| 20 / 10 ms, 0,5 CPU | 24,275 ms | 67,062 ms | 147,015 ms | 37,606 ms | 0 |
| **50 / 25 ms, 0,5 CPU** | **15,456 ms** | **18,386 ms** | **148,114 ms** | **45,071 ms** | **0** |

Für die ausgewählte 50-ms-Probe lagen Registrierung-Maximum und Login-Maximum
bei 1.239,733 beziehungsweise 1.241,749 ms. Die gesamte Anmeldefolge dauerte
2.482,455 ms; höchstens zwei KDF-Aufrufe liefen zugleich. RSS-Spitze 210,309 MiB,
Heap-Spitze 53,681 MiB und CPU 25,872 Prozent eines Kerns im gesamten Messfenster
enthalten weiterhin Server und Clienttreiber. Die Anmeldephase nutzte 49,927
Prozent eines Kerns und hielt damit die gleiche halbe CPU. Eine Erhöhung auf
0,75 CPU war nicht erforderlich und wurde nicht getestet oder vorgenommen.

Die maximale SSE-Lücke blieb 197,938 ms; der gesamte Speicher-Maximalwert blieb
89,617 ms. Die Abnahme bestätigt die angegebenen P95-Ziele für diese konkrete
Oberwelt-/Anmeldeprobe, keine verzögerungsfreie Ausführung oder maximale
MMO-Kapazität. Die Periode reduziert problematische Wartemuster, erhöht aber
weder die CPU-Quote noch die Sicherheitseinstellungen des Passwortverfahrens.
Für die Veröffentlichung wurde daher die explizite Konfiguration
`cpu_period: 50000` / `cpu_quota: 25000` in der Compose-Vorlage gewählt;
kein zusätzliches `cpus` parallel setzen. Die Betreiberwerte heißen
`EMBERFALL_CPU_PERIOD` und `EMBERFALL_CPU_QUOTA`; ihr Quotient bestimmt weiterhin
die halbe CPU. Speichergrenze 768 MiB und Node-Heap 384 MiB bleiben erhalten.

Die zusätzliche Konto-Konfiguration begrenzt neue Registrierungen über
`EMBERFALL_MAX_ACCOUNTS=32`. Die API unterstützt als validierten Einstellbereich
bis 128, aber die Hetzner-Vorlage wählt ausdrücklich 32. Auch inaktive private
Charaktere mit ausgebautem Gepäck und Lager beanspruchen beim Erfassen und
Speichern Heap. Deshalb wird aus der frischen Zweikonten-Burstprobe keine
128-Konten-Zusage abgeleitet. Vorhandene Datensätze werden durch diese
Aufnahmegrenze nicht gelöscht. Acht gleichzeitig aktive Welten und acht aktive
Figuren je Gruppe bleiben separate Schutzgrenzen und keine gemessene
Kapazitätsgarantie für acht gleichzeitig volle Gruppen.

Die ursprünglichen, unveränderten JSON liegen lokal unter
`hetzner-final-8-account-burst.json`,
`hetzner-final-8-account-burst-20ms.json` und
`hetzner-final-8-account-burst-50ms.json` im ignorierten Messordner. Die letzte
ausgewählte Probe beendete sich ordnungsgemäß innerhalb ihrer 40-Sekunden-Frist.
Weitere Tuningrunden wurden danach nicht gestartet.

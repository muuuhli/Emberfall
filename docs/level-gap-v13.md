# V13: Native Prüfung des PvE-Levelabstands

Der gemeldete Fall „Level 27 besiegt Level 68 zu einfach“ ist mit legal ausgerüsteten Figuren aller acht Klassen reproduziert. Die Korrektur verhindert in sämtlichen 48 geprüften L27/L68-Konstellationen jeden von der Level-27-Figur ausgehenden Schaden und jeden Kill. Die nativen Gegner starten und enden dort mit vollen Lebenspunkten. Kämpfe auf gleichem Level bleiben in dieser Probe erreichbar; +5 und +10 werden stufenweise schwieriger.

Gemessen am 14. Oktober 2026 lokal mit Node und der echten `Game`-Simulation, ohne Browser, Serververbindung, Produktivkonto oder Nutzerspielstand. Je Fassung wurden 192 Kämpfe simuliert: acht Klassen × vier Levelabstände × drei Gegnervarianten × zwei Controller. Jeder Kampf hat höchstens 120 simulierte Sekunden mit 40-ms-Schritten. Dies prüft einen konkreten Balancefehler; es ist keine menschliche Spielspaß- oder Sternebewertung.

## Versuchsaufbau und Grenzen

Die Figuren wählen ihre echte Klasse und erhalten die kumulative XP bis Level 27 über `gainXp`. Dadurch entstehen die regulären 54 Talentpunkte. Fähigkeiten und Talente werden ausschließlich mit `learnAbility`, `learn` und den tatsächlichen Voraussetzungen erlernt. Alle sieben Ausrüstungsplätze erhalten deklarierte, deterministisch erzeugte seltene Level-27-Drops; Auswahl, Anlegen und tatsächliches Mindestlevel werden durch Produktmethoden geprüft. Das bildet einen gut ausgerüsteten Level-27-Build ab. Drop-Erwerb, Reisezeit und durchschnittliche Zufallsbeute werden nicht vorgespielt.

Nach dem Anlegen erholt sich die Figur durch die echte Regeneration im Startdorf vollständig. Die Probe setzt weder Spielerlevel noch Punkte, HP oder Mana direkt. Alle Klassen verwenden nur die fünf unveränderten Heiltränke aus dem Startinventar. Keine zusätzlichen Tränke, Upgrades, Edelsteine, Relikte oder Begleiter werden vergeben. Zwischen Vorbereitung und Kampf wird nur ein selbst erzeugter In-Memory-Checkpoint mit `capture`/`applySave` genutzt.

Die Gegner stehen in einer offenen regionalen Arena. Unbeteiligte Gegner, Hindernisse, Siedlungsschutz und andere Weltaktivitäten sind für diesen isolierten Vergleich entfernt. Die anfängliche Platzierung ist eine deklarierte Fixture; danach bewegt ausschließlich die native Steuerung die Figur. Gegnerwarnungen, KI, Projektile, Schadensberechnung, Rüstung, Klassenheilung und Cooldowns laufen unverändert durch `Game.update` und die Produktionsmethoden.

Die Levelleiter verwendet jeweils eine tatsächlich dort vorkommende Nahkampfspezies. Es wird deshalb keine universelle Kurve für exakt denselben Gegnertyp behauptet. Normal- und Championgegner entstehen über `createBestiaryEnemy`; „Champion“ bedeutet hier die native regionale Boss-Variante dieser Spezies, kein einzigartiger Story- oder Raidboss. Die Elite entsteht über einen validierten Hard-Tier-Warnplan des echten Encounter Directors. Ein eigens vorbereiteter, regional berechtigter Reisender löst nur den Spawn aus und nimmt nicht am Kampf teil. Anschließend wird ein Eliteakteur aus dem Zweierpack isoliert; Packlebensdauer und weiterer Director-Nachschub werden ausgesetzt, alle nativen Elitewerte und die eigene Kampf-KI bleiben erhalten. Gruppenstärke ist eins.

| Gegnerlevel | Regionale Spezies | Normal-HP | Hard-Elite-HP | Champion-HP |
| --- | --- | ---: | ---: | ---: |
| 27 | `jade_stalker` | 592 | 1362 | 3078 |
| 32 | `drowned_pike` | 1130 | 2599 | 5876 |
| 37 | `thorn_knight` | 1519 | 3494 | 7899 |
| 68 | `frost_colossus` | 4288 | 9862 | 22298 |

Der wiederverwendete V8-Controller zielt exakt und führt eine deterministische Rotation aus. `reactive` reagiert auf bereits sichtbare Warnflächen und Projektile, weicht aus und darf unter 40 % HP endliche Tränke verwenden. `reckless` nutzt dieselbe offensive Rotation und bevorzugte Reichweite, ignoriert Warnungen und nutzt weder Ausweichen noch Tränke. Auch dieser Stil hält Reichweite; er ist kein absichtlich stillstehender Spieler. Die automatische Reaktion hat keine menschliche Verzögerung. Pro Tick können mehrere aktuell erlaubte Aktionen ausgeführt werden. Somit ist die Probe ein reproduzierbarer mechanischer Vergleich, kein Nachweis, dass ein durchschnittlicher Spieler jedes Ergebnis erreicht.

## Ursache und Korrektur

Vorher wurde in `Game.hitEnemy` der relative Gegnerlevel nicht berücksichtigt. Eigene Rüstung bezog zwar den Angreiferlevel ein, erzeugte aber keine eigenständige Strafkurve für eine viel zu niedrige Figur. Starke Level-27-Builds konnten langsamere Gegner kiten und trotz 41 Level Unterschied ihre volle Schadensrotation anwenden. Vor der Änderung gewannen alle acht Klassen die L68-Normal- und Elitefälle in beiden Stilen; alle acht reaktiven Normal- und Elitefälle blieben ohne HP-Schaden oder Schildabsorption. Normale L68-Gegner mit 4288 HP fielen reaktiv in 3,32 bis 7,56 Sekunden.

`pveLevelGap` bildet nun den Levelabstand unabhängig von Ausrüstung ab. Bis einschließlich +3 bleibt die Levelregel unverändert. Darüber wirkt `1 / (1 + ((gap - 3) / 4)^2)` auf ausgehenden Schaden und Kontrollwirkung. Ab +20 sind diese Wirkungen null, bevor Mindestschaden oder Folgeeffekte greifen. Normaler eingehender PvE-Schaden steigt mit `min(4, 1 + max(0, gap - 3) * 0.15)`. PvP, Umweltschaden und bewusst geskriptete Prozentmechaniken bleiben an ihren eigenen Aufrufstellen geregelt.

| Abstand | Ausgehender Faktor / Kontrollfaktor | Eingehender Faktor |
| --- | ---: | ---: |
| +0 | 1,0000 | 1,00 |
| +5 | 0,8000 | 1,30 |
| +10 | 0,2462 | 2,05 |
| +41 | 0,0000 | 4,00 |

Die Levelprüfung sitzt zentral im realen Trefferpfad; zusätzliche langsame, provozierende und zurückstoßende Wirkungen folgen derselben Herausforderungsregel. Der native Vergleich verändert keine Gegner-HP oder Schadensbudgets. Es wird keine neue vollständige Heilung bei Aggroverlust beansprucht: die KI bleibt in dieser Änderung erhalten, die Übermächtigkeitsregel verhindert bei +41 bereits jeden Abtrag durch Kiting.

Ausgehende Gruppen-Effekte behalten ihre tatsächliche Figur als Besitzer. Ist diese nicht mehr im simulierten gemeinsamen Raum, werden ihre Geschosse, Schadenszonen und Diener entfernt; sie übernehmen keine andere Charakterstufe. Eigene native Mehrspielerprüfungen decken unterschiedliche Stufen sowie zurückgelassene Effekte beim Gruppenaustritt ab. Die sieben Ausrüstungsplätze verwenden beim Anlegen und Wiederherstellen dieselben Stufen- und Klassenanforderungen. Generierte Gegenstände verlangen mindestens ihre kanonische Basis- und Rollstufe, auch wenn importierte Zusatzdaten ein niedrigeres Mindestlevel behaupten. Unzulässig angelegte Gegenstände bleiben ohne Verlust im Gepäck; die UI zeigt dieselbe erforderliche Stufe.

## Tatsächliche Ergebnisse

Die Siegspalten zählen `reactive` und `reckless` getrennt, jeweils von acht Klassen. Die Zeit ist der Median der erfolgreichen reaktiven Kämpfe, in simulierten Sekunden; ein Gedankenstrich bedeutet keine Siege. Siegquoten werden aufgezeichnet, nicht als frei gewähltes Qualitätsziel erzwungen.

| Abstand / Gegnerlevel | Variante | Siege vorher (reactive; reckless) | Siege nachher (reactive; reckless) | Median R vorher → nachher (s) |
| --- | --- | ---: | ---: | ---: |
| +0 / L27 | Normal | 8; 8 | 8; 8 | 0.30 → 0.30 |
| +0 / L27 | Hard-Elite | 8; 8 | 8; 8 | 1.20 → 1.20 |
| +0 / L27 | Regionaler Champion | 8; 8 | 8; 8 | 3.34 → 3.34 |
| +5 / L32 | Normal | 8; 8 | 8; 8 | 1.08 → 1.34 |
| +5 / L32 | Hard-Elite | 8; 8 | 8; 8 | 2.84 → 3.20 |
| +5 / L32 | Regionaler Champion | 8; 8 | 8; 8 | 8.82 → 9.86 |
| +10 / L37 | Normal | 8; 8 | 8; 8 | 1.46 → 6.78 |
| +10 / L37 | Hard-Elite | 8; 8 | 8; 8 | 3.48 → 16.24 |
| +10 / L37 | Regionaler Champion | 8; 8 | 8; 4 | 12.10 → 46.12 |
| +41 / L68 | Normal | 8; 8 | 0; 0 | 4.78 → — |
| +41 / L68 | Hard-Elite | 8; 8 | 0; 0 | 11.32 → — |
| +41 / L68 | Regionaler Champion | 8; 4 | 0; 0 | 31.44 → — |

Alle 48 +0-Kämpfe bleiben erfolgreich; die Medianzeiten jeder Variante und beider Stile entsprechen exakt der Baseline. Auch die gut ausgerüsteten +5-Builds gewinnen weiterhin, benötigen aber länger. Bei +10 steigt beispielsweise die reaktive Normalzeit von 1,46 auf 6,78 Sekunden und die Elitezeit von 3,48 auf 16,24 Sekunden. Beim +10-Champion sterben nachher vier von acht Figuren ohne Ausweichen, vorher keine.

Bei +41 verursachen alle 48 Fälle exakt null Schaden und besiegen keinen Gegner. Alle verbleibenden Gegner-HP entsprechen ihren initialen nativen Maximalwerten. Die reaktiven Figuren können in mehreren Fällen trotzdem die gesamten 120 Sekunden überleben oder kiten; es wird keine unvermeidbare Niederlage behauptet. Ohne Ausweichen sterben drei von acht Figuren gegen Normalgegner und alle acht gegen Elite und Champion. Die endlichen Tränke werden nach der Korrektur tatsächlich beansprucht, maximal fünf in einem Elitefall.

Die sehr kurzen +0-Zeiten zeigen außerdem die Grenze der Arena mit einem vollständig selten ausgerüsteten Build und automatisch ausgeführter Burst-Rotation. Sie belegen das Ausbleiben einer Levelabstandsregression, nicht ausgewogene Kampagnenbegegnungen oder perfekte Schwierigkeit sämtlicher Klassen. Gruppen, Gelände, Fernkampfarten, einzigartige Bosse und menschliche mobile Eingaben brauchen eigene Spieltests.

## Reproduktion und prüfbare Nachweise

Die Standardausgabe der Probe liegt unter `.openai/.local/level-gap-v13-current.json`; die hier angegebenen Messbefehle schreiben eigene Vorher-/Nachherdateien nach `.openai/.local/`. Diese sind ignorierte lokale Audit-Artefakte und werden nicht als Nutzerspielstände oder Zugangsdaten ins Repository aufgenommen. Das Skript benötigt weder Ports noch Hetznerzugriff. Die folgenden zwei Befehle verwenden unveränderliche Quellkopien mit `src/` und einer `package.json` mit ESM-Konfiguration; alternativ kann für einen Einzelstand `--source-root` auf die Repository-Wurzel zeigen.

```sh
node tests/scripts/level-gap-v13-audit.mjs \
  --source-root .openai/.local/v13-baseline-source \
  --output .openai/.local/level-gap-v13-before.json

node tests/scripts/level-gap-v13-audit.mjs \
  --source-root .openai/.local/v13-after-source \
  --compare .openai/.local/level-gap-v13-before.json \
  --output .openai/.local/level-gap-v13-after.json
```

Für eine begrenzte Einzelprobe stehen `--classes ranger`, `--gaps 41`, `--kinds normal` und `--styles reactive` zur Verfügung. `--seconds` darf 10 bis 180 betragen, Standard 120. `--compare` verlangt identische Skript-/Controller-Hashes, Zeitschritte, Zeitlimits und Matrixdimensionen und prüft strikt identische Charakterfixtures einschließlich Mindestlevel, Punktbudget, Lernen, Regeneration sowie identische native Gegnerbudgets. Danach prüft es keinen Kill/Schaden bei den untersuchten Abständen ab +20 und die weiterhin erreichbaren zuvor erfolgreichen reaktiven Normalfälle auf gleichem Level. Fehlschlag oder Quelländerung ergibt Exit-Code 1.

Beide vollständigen Läufe endeten mit Exit-Code 0 und `sourceChangedDuringRun: false`. Alle drei Vergleichsprüfungen bestanden, einschließlich der 48 Übermächtigkeitsfälle. Die Rohdaten enthalten die Anzahl ausgeführter Aktionen, endliche Trankreste, Schaden, Schildabsorption, Mindest-HP, Zeit, native Gegnerwerte und HP unmittelbar vor Kill-Belohnungen; eine natürliche Level-up-Heilung nach einem Sieg wird dadurch nicht als Kampferholung fehlinterpretiert.

| Nachweis | SHA-256 |
| --- | --- |
| Audit-Skript, in beiden vollständigen Läufen | `54c08b2638df6d4b263dc07b39d046653aa9d6eb2ff4d318ab6e569ffb6dd76f` |
| Wiederverwendetes V8-Controller-Skript | `cf6b0e01c0e66b991daeadb9be24596406ad05cd3a6ff30d2aeb5763d533c4e5` |
| Unveränderliche V12-Baseline: sortierter Hash aller `src/*.js` | `ca3e862c3238a8233c14b9cfcc65620e11155a46771216a7424039c21135f708` |
| Nachher-Snapshot: sortierter Hash aller `src/*.js` | `b14d08657ffd31d1f6d3c1565e8167826c39aec3d267ef796cbd7e0b83fb8f5f` |

Das Nachher-Ergebnis wurde anschließend gegen die tatsächlich bearbeiteten Produktdateien geprüft: `game.js`, `balance.js`, `loot.js`, `ability-runtime.js`, `enemy-ai.js`, `raid-encounters.js`, `talent-combat.js`, `classes.js`, `bestiary.js`, `encounter-director.js`, `world.js` und `progression.js` waren bytegleich mit den eingefrorenen Messquellen. UI-Dateien können parallel weiterbearbeitet werden; daraus wird keine zusätzliche Combatmessung abgeleitet.

Die abschließende vollständige Testsuite besteht mit 1.053 Prüfungen ohne Fehler. Der Veröffentlichungsbuild und die Whitespace-Prüfung sind erfolgreich. Darin enthalten sind 17 Ablauf- und Fehlerprüfungen des Git-Updaters, zwei Prüfungen seiner echten Datei-/Konto-Wiederherstellung sowie gezielte Konto-, Gruppen-, Ausrüstungs- und PvE-Regressionsfälle.

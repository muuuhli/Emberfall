# Emberfall – Balanceversion 2

Seltene Beute trägt jetzt einen wesentlichen Anteil zu Schaden und Überleben bei. Rüstung wird als Rating gegen die Gegnerstufe berechnet; der automatische Rüstungsanstieg allein macht Figuren auf Stufe 100 nicht mehr nahezu immun. Die folgenden Werte sind ein analytisches Entwicklungsmodell, keine gemessenen Spieltests und kein Beleg für eine Spielzeit von 200 Stunden.

## Annahmen und Grenzen

- Acht aktuelle Klassenprofile, eigene Starterwaffe aus `ITEMS[class.weaponId]`, Charakterstufen 1/10/25/50/75/100.
- Rare-Vergleich: drei Gegenstände der gleichen Stufe, jeweils die höchste freigeschaltete kompatible Basis mit Primärschaden beziehungsweise Leben und Rüstung; feste RNG-Seed `991 + level`. Primärschaden bevorzugt physische Klassen und Zauberklassen passend.
- Keine Talente, zusätzlichen freischaltbaren Aktivfähigkeiten, Sockel, Setboni, Upgrades oder Berufsmeisterschaften. Dadurch ist die Auswahl explizit und reproduzierbar; dies ist keine Optimierungsprüfung sämtlicher Builds.
- 70 % Angriffszeit, Mittelwert aller dritten Kombotreffer (1,55×), kritische Treffer 1,7×, mittlere Schadensvarianz 1,0. Bolt/Nova werden über Abklingzeit und nachhaltige Mana-Regeneration gemittelt. Der Startvorrat Mana und kurzfristiger Burst bleiben außerhalb des Modells.
- TTK: Zeit bis zum Besiegen eines einzelnen stationären Gegners. TTD: Überleben bei einem Treffer alle 1,65 Sekunden, ohne Rollen, Heilung, Schilde, Lebensraub oder Trank. Drei Gegner verkürzen diese TTD im Modell auf ein Drittel.
- Summons: 80 % Zielkontakt; Lebensdauer und Wiederbeschwörung berücksichtigen mögliche Überlappung. Die Rechnung ersetzt weder Navigation noch echte Bossmechanik.
- Die neuen normalen Gegnerbudgets gelten in der Integration nur für die Overworld ab Stufe 12. Die Zeilen 1 und 10 sind Gleichstufen-Vergleiche; reale Wolf-/Glutbrut-Werte stehen separat darunter. Authored Dungeons und Bosse behalten ihre eigenen Lebens-/Schadensbudgets.
- Gruppenheilung ist eine nominelle Obergrenze pro Ziel. Reichweite, Überheilung, Gefahr beim Zusammenstehen und Ressourcenverbrauch müssen im Browser geprüft werden.

## Gleichstufige normale Gegner: Rare-Ausrüstung

Jede Zelle enthält **TTK / TTD in Sekunden**.

| Klasse | Stufe 1 | 10 | 25 | 50 | 75 | 100 |
|---|---:|---:|---:|---:|---:|---:|
| Wächter | 0.6 / 41.2 | 1.3 / 29.9 | 1.8 / 28.3 | 2.5 / 25.6 | 3.0 / 21.4 | 3.7 / 21.2 |
| Paladin | 0.6 / 34.9 | 1.2 / 25.4 | 1.6 / 28.3 | 2.4 / 27.5 | 2.9 / 21.1 | 3.4 / 20.7 |
| Waldläufer | 0.5 / 27.8 | 1.0 / 22.1 | 1.4 / 21.0 | 1.9 / 19.8 | 2.3 / 17.8 | 2.8 / 17.8 |
| Nachtklinge | 0.4 / 25.7 | 0.8 / 21.2 | 1.2 / 20.2 | 1.6 / 19.3 | 2.0 / 17.3 | 2.4 / 17.4 |
| Flammenrufer | 0.3 / 26.1 | 0.8 / 20.8 | 1.4 / 22.1 | 2.0 / 23.2 | 2.4 / 17.7 | 2.8 / 17.7 |
| Frostweber | 0.4 / 33.4 | 0.9 / 25.6 | 1.5 / 24.9 | 2.2 / 25.5 | 2.6 / 19.5 | 3.1 / 19.4 |
| Druide | 0.4 / 34.6 | 1.0 / 24.9 | 1.7 / 24.7 | 2.4 / 25.1 | 3.0 / 19.5 | 3.5 / 19.3 |
| Schattenbinder | 0.3 / 31.0 | 0.9 / 23.3 | 1.3 / 23.6 | 2.0 / 24.1 | 2.2 / 18.7 | 2.6 / 18.6 |

Das normale Stufe-100-Profil hat 4956 Leben und 287 Rohschaden. Der Rare-Vergleich bleibt bei rund 2,4–3,7 Sekunden pro Gegner. Beim Wächter ist die längere TTK durch Schilde und Taunt ergänzt; der Druide liefert Gruppenheilung, Frost und Waldläufer kontrollieren beziehungsweise treffen mehrere Ziele. Diese Vorteile werden nicht in einen einzigen Schadensrang zusammengezogen.

## Reale frühe Begegnungen mit eigenen Starterwaffen

Wolf: 38 Leben / 7 Schaden / Stufe 1. Glutbrut: 150 Leben / 23 Schaden / Gegnerstufe 9, Charakterstufe 10.

| Klasse | Starter-ID | Wolf TTK / TTD | Glutbrut TTK / TTD |
|---|---|---:|---:|
| Wächter | `rusty_blade` | 1.0 / 51.1 | 1.6 / 26.7 |
| Paladin | `novice_hammer` | 1.1 / 46.2 | 1.5 / 23.4 |
| Waldläufer | `novice_bow` | 0.6 / 31.6 | 1.1 / 18.2 |
| Nachtklinge | `novice_daggers` | 0.6 / 28.9 | 1.0 / 17.1 |
| Flammenrufer | `novice_ember_staff` | 0.5 / 28.9 | 1.1 / 16.3 |
| Frostweber | `novice_rime_scepter` | 0.6 / 33.0 | 1.3 / 19.8 |
| Druide | `novice_living_branch` | 0.7 / 34.4 | 1.4 / 20.4 |
| Schattenbinder | `novice_soul_focus` | 0.6 / 30.3 | 1.2 / 18.6 |

## Wirkung beim Wechsel der Ausrüstung auf Stufe 100

Die Starterspalte verwendet weiterhin die tatsächlich hinterlegten Anfangsgegenstände. Rare/Epic verwenden drei passende Stufe-100-Gegenstände; die Verbesserung enthält offensive und defensive Boni.

| Klasse | DPS Starter → Rare → Epic | Rare DPS-Verhältnis | TTD Starter → Rare | Primärbonus Rare-Waffe |
|---|---:|---:|---:|---:|
| Wächter | 644.1 → 1335.3 → 1518.3 | 2.07× | 10.6 → 21.2 | +273.5 damage |
| Paladin | 717.8 → 1464.6 → 1757.6 | 2.04× | 9.8 → 20.7 | +233.3 damage |
| Waldläufer | 875.6 → 1793.3 → 2051.2 | 2.05× | 8.3 → 17.8 | +266.1 damage |
| Nachtklinge | 1005.5 → 2085.6 → 2377.9 | 2.07× | 8.0 → 17.4 | +258.7 damage |
| Flammenrufer | 764.6 → 1785.4 → 2081.9 | 2.34× | 7.8 → 17.7 | +414.8 spellDamage |
| Frostweber | 698.8 → 1614.8 → 1877.3 | 2.31× | 8.9 → 19.4 | +414.8 spellDamage |
| Druide | 636.4 → 1404.9 → 1617.6 | 2.21× | 8.9 → 19.3 | +414.8 spellDamage |
| Schattenbinder | 755.9 → 1905.9 → 2247.1 | 2.52× | 8.4 → 18.6 | +414.8 spellDamage |

Alle Rare-/Epic-Vergleiche ab Stufe 10 bieten mindestens den doppelten Primärbonus der eigenen Starterwaffe und den doppelten Lebensbonus der Startrüstung. Die Tests verlangen außerdem mindestens 35 % mehr effektiven Schaden und 20 % mehr Überleben gegenüber dem Starter-Loadout.

## Heilung, Manadruck und Gegnermengen

Heilung pro Sekunde ist auf Mana-Regeneration begrenzt. Eingehender Schaden wird hier bewusst zusätzlich bei **einem beziehungsweise drei Treffern pro drei Sekunden** dargestellt, wie für die frühe Heilrollenprüfung gewünscht; TTD oben verwendet das schnellere 1,65-Sekunden-Szenario. Ohne Ausrüstung ist `naked`, mit eigener Starterwaffe/Startrüstung `starter`.

| Klasse | Stufe | Ausrüstung | Leben | Mana-Duty | Heilung/s je Ziel | 1 Gegner/s | 3 Gegner/s |
|---|---:|---|---:|---:|---:|---:|---:|
| Paladin | 12 | naked | 272.8 | 54 % | 10.5 | 9.3 | 28.0 |
| Paladin | 12 | starter | 280.8 | 54 % | 10.5 | 9.0 | 27.0 |
| Paladin | 12 | rare | 383.7 | 54 % | 11.8 | 7.3 | 22.0 |
| Paladin | 25 | naked | 439.2 | 54 % | 19.0 | 18.0 | 54.0 |
| Paladin | 25 | starter | 447.2 | 54 % | 19.0 | 17.7 | 53.0 |
| Paladin | 25 | rare | 703.1 | 54 % | 23.9 | 13.7 | 41.0 |
| Paladin | 100 | naked | 1399.2 | 54 % | 68.0 | 79.0 | 237.0 |
| Paladin | 100 | starter | 1407.2 | 54 % | 68.0 | 78.7 | 236.0 |
| Paladin | 100 | rare | 2071.3 | 75 % | 186.0 | 55.0 | 165.0 |
| Druide | 12 | naked | 251.2 | 63 % | 14.3 | 10.0 | 30.0 |
| Druide | 12 | starter | 259.2 | 63 % | 18.3 | 9.7 | 29.0 |
| Druide | 12 | rare | 396.1 | 78 % | 41.2 | 8.0 | 24.0 |
| Druide | 25 | naked | 409.8 | 63 % | 26.1 | 19.0 | 57.0 |
| Druide | 25 | starter | 417.8 | 63 % | 30.1 | 19.0 | 57.0 |
| Druide | 25 | rare | 629.1 | 72 % | 69.1 | 14.0 | 42.0 |
| Druide | 100 | naked | 1324.8 | 63 % | 94.4 | 83.3 | 250.0 |
| Druide | 100 | starter | 1332.8 | 63 % | 98.4 | 82.7 | 248.0 |
| Druide | 100 | rare | 1996.9 | 87 % | 291.9 | 57.0 | 171.0 |

Heiler können einzelne normale Gegner bewusst sicher überstehen. Rare-Ausrüstung erhöht ihre Reserve für mehrere Gegner; der Druide verzichtet dafür auf direkte offensive Bolt-/Nova-Aktionen. Eine aktive, volle Heilrotation reduziert Mana und erfordert Reichweite beziehungsweise Positionierung. Das Modell enthält keine behauptete Garantie, dass jeder Pack oder Boss damit angemessen schwierig ist.

## Bossbudgets: Orientierung für Browser-Tests

Bestehende Tier-1-Bossleben werden hier beibehalten. 50 % Angriffszeit für Ausweichbewegung; die Solo-Spalte verwendet den Wächter, Gruppenwerte nutzen eine Mischung aus Tank, Heilung und Schaden. Raid-Schilde und Plattenwege benötigen zusätzliche Zeit, die im Zahlenwert nicht enthalten ist.

| Dungeon | Minimumstufe | Spieler | Bossleben | Analytische Sekunden bei Rare |
|---|---:|---:|---:|---:|
| Wurzelgewölbe | 12 | 1 | 4600 | 33.8 |
| Salzarchiv | 25 | 1 | 9200 | 35.0 |
| Dornenkloster | 36 | 1 | 14600 | 38.2 |
| Zerbrochenes Uhrwerk | 50 | 1 | 24000 | 49.6 |
| Frostkathedrale | 60 | 1 | 35000 | 58.9 |
| Sturmzitadelle | 70 | 3 | 125000 | 50.2 |
| Nachtschlund | 85 | 4 | 245000 | 59.7 |
| Weltenkern | 95 | 8 | 850000 | 90.0 |

Über alle acht Solo-Klassen reichen die gleichen Modelle im Wurzelgewölbe von 21,6–33,8 Sekunden, im Salzarchiv von 23,4–35,0, im Dornenkloster von 25,6–38,2, im Uhrwerk von 31,7–49,6 und in der Frostkathedrale von 38,2–58,9. Soll bereits die schnellste Klasse in den ersten beiden Dungeons mindestens 25 Sekunden kämpfen, ist eine separate Datenanpassung auf 5520 beziehungsweise 11040 Bossleben sinnvoll (jeweils +20 %); sie gehört nicht zur Beutemoduländerung.

Seltene Ausrüstung verkürzt Kämpfe und verbessert die Reserve bei Fehlern. Das Spätspiel bleibt an Rüstungsrating, Bossphasen, Gruppensiegel, Wiederbelebung und Enrage gebunden. Tier-30-/Legendär-/Talent-Maximum ist nicht durch den Rare-Vergleich bewiesen: hohe Heilung und Lebensraub können gewöhnlichen Boss-Chipschaden übertreffen. Vor Veröffentlichung müssen entsprechende Builds gegen echte Phasen getestet werden; erforderliche Mechanikfehler bleiben True-Damage-/Wipe-Regeln.

## Exakte Regeln und Integrations-API

- `basePlayerStats(level)`: Leben `100+12L`, Mana `80+5L`, physischer Grundschaden `12+3L`, Zaubergrundwert `12+4L`, Rüstungsgrundwert `3+0.24(L-1)`; alle zwölf bisherigen Statnamen.
- `classStatModifiers(classId,level)`: ersetzt das erneute Addieren von `class.statMods`. Rollen-Leben skaliert mit `1+0.04(L-1)`, Rollen-Rüstung mit `1+0.045(L-1)`, Rollen-Schaden/Zauberwert mit `1+0.025(L-1)`.
- `capCombatStats(stats,{level})`: nach Gegenständen, Talenten, Sets und Meisterschaften anwenden. Kritisch maximal 45 %, Lebensraub 12 %, Skill-Abklingzeitverkürzung 45 %, Ausweichverkürzung 60 %, Tempo 300.
- `armorMitigation(rating,attackerLevel)`: `rating / (rating + 20 + 1.6*(attackerLevel-1))`, maximal 75 %. Gegnerstufe ist die Stufe des Schadensursprungs. `incomingDamage(amount,{armor,attackerLevel,trueDamage})` gibt den gerundeten Treffer zurück; positiver Schaden mindestens 1, Null bleibt Null. True Damage umgeht Rüstung.
- `classPowerMultiplier(classId,kind)`: genau einmal bei der Erstellung von `attack`, `spell`, `heal`, `summon` oder `shield` anwenden. Drain-Heilung verwendet ebenfalls `heal`, nicht die Schadens- und Heilfaktoren doppelt auf den gleichen Wert.
- `normalEnemyStats(level,{tier})`: Overworld ab Stufe 12; `HP=38+18(L-1)+0.32(L-1)^2`, `Damage=7+2.2L+0.006L^2`. Tier ist begrenzt auf 1–30.
- `enemyXpReward(baseXp,{enemyLevel,playerLevel,boss})`: voller Wert bis fünf Stufen Abstand, danach 60/25/10/0 % bei Abständen 6/10/15/20. Bosse behalten mindestens 10 %; Quest-/Dungeonabschluss-EP passieren diesen Helfer nicht.
- `estimateCombat({level,classId,stats,enemy,attackUptime})`: reine analytische Zahlen, keine Laufzeit-Spielsimulation.

| Klasse | Angriff | Zauber | Heilung | Diener | Schild |
|---|---:|---:|---:|---:|---:|
| Wächter | 0.78 | 0.9 | 1 | 1 | 0.65 |
| Paladin | 1.1 | 1 | 0.55 | 1 | 0.7 |
| Waldläufer | 1.15 | 1.1 | 1 | 1 | 1 |
| Nachtklinge | 1 | 1 | 1 | 1 | 1 |
| Flammenrufer | 1.4 | 1.1 | 1 | 1 | 1 |
| Frostweber | 1.35 | 1 | 1 | 1 | 1 |
| Druide | 1.35 | 1 | 0.35 | 1 | 1 |
| Schattenbinder | 1.05 | 0.9 | 0.5 | 0.65 | 1 |

## Beuteformat und Speicherkompatibilität

Neue Gegenstände speichern `balanceVersion:2` und den Erzeugungsklassenkontext `classId`. Ohne Versionsfeld beziehungsweise mit Version 1 bleibt die alte Basis- und Affixformel der Validierungsvertrag. Bei `computeItemStats` wird ein kanonischer alter Roll auf das neue Budget abgeleitet, samt seiner ursprünglichen Affixqualität; sein gespeichertes `stats`-Objekt wird niemals überschrieben. Manipulierte Basiswerte und falsche Versionen scheitern weiterhin an der Validierung. IDs, Raritätsquoten, Seltenheits-Pity, Basistypen, Set-IDs und Sockelschema bleiben bestehen.

Neue Waffenrollen verlangen beim zufälligen Fund den tatsächlichen Primärstat der Klasse; ein Schattenbinder findet deshalb keinen zufälligen physischen Dolch als Zauberwaffe. Magische Klassen rollen keine nutzlosen Stärke-Affixe. Paladine können hybride Hammer-/Zauberwerte erhalten. Jede neue Rüstung hat eine Lebens- und Rüstungsbasis; Materialunterschiede bleiben als Zusatzbudget für Mana, Beweglichkeit oder höhere defensive Werte bestehen.

Upgrades 0–10 und Dungeontiefe 1–30 verstärken flache Werte, ohne Prozentsätze oder Sockel multiplizieren zu lassen. Der kombinierte Gegenstand wird zusätzlich begrenzt: Kritisch 12 %, Lebensraub 8 %, Cooldown 14 %, Dodge 20 %, Leben 4000, Schaden 1200, Zauberwert 1600, Rüstung 150. Globale Figuren-Caps gelten anschließend erneut. Sockel, Sets und Meisterschaften können dadurch keine unbegrenzte Prozentverstärkung erzeugen.

## Reproduktion

Die quantitativen Verträge und alten Speicherwerte werden mit folgendem Befehl geprüft:

```sh
node --test tests/balance.test.js tests/loot.test.js tests/professions.test.js
```

Das Loadout-Verfahren ist in `tests/balance.test.js` als `loadout` vollständig enthalten. Es liest die aktuellen Klassenprofile und Starter-IDs. Die zentrale Rechnung ist `estimateCombat` in `src/balance.js`. Bei Änderungen an Profilen oder Gegenständen müssen diese Tabellen neu erzeugt und die Browser-Szenarien erneut geprüft werden.

# V15: Drei lernbare Berufe

Alchemie, Schmiedekunst und Runenkunst sind mit den vorhandenen Lehrern und dem echten Handwerkssystem verbunden. 20 zusätzliche Rezepte, sieben herstellbare Verbrauchsgegenstände und 20 Berufsmaterialien sind im Katalog verfügbar. Die 104 bestehenden Rezept-IDs und Definitionen bleiben erhalten: Herstellung verlangt für sie weiterhin die bisherigen Charakter-, Klassen- und Reisebedingungen, keinen neuen Beruf oder Lehrer.

## Lernen, Fortschritt und Meisterschaften

| Beruf | Lehrer | Bestehende Position | Ausbildung |
| --- | --- | --- | --- |
| Schmiedekunst | Elin | 390, 1280 | 20 Gold |
| Alchemie | Sera | 455, 1100 | 20 Gold |
| Runenkunst | Mira | 580, 1130 | 20 Gold |

Lernen verlangt eine begonnene Reise, eine lebende Figur in der Oberwelt, einen ruhigen Moment außerhalb des Kampfes und weniger als 85 Pixel Abstand zum passenden Lehrer. Jeder Beruf wird einmal gelernt; alle drei sind möglich. Insgesamt kostet das 60 Gold. Die ursprünglichen 45 Startgold reichen für zwei Berufe; für den dritten fehlen 15 Gold. Alte Spielstände beginnen ohne gelernte Berufe, verlieren aber ihre vorhandenen Gegenstände und Rezepte nicht durch eine neue Berufspflicht.

Die getrennte Liste `professionTraining` enthält höchstens die drei bekannten, eindeutigen Berufs-IDs. `professions` behält Version 1 und je Beruf `level`, `xp`, `mastery`. Nicht gelernte Berufe müssen auf Level 1, XP 0 und ohne Meisterschaft bleiben. Beliebige Namen, doppelte IDs, fremde Meisterschaften und fortgeschrittene ungelehrte Speicherzustände werden abgelehnt.

| Charakterlevel | Maximaler Berufslevel |
| --- | ---: |
| 1–9 | 10 |
| 10–24 | 25 |
| 25–49 | 50 |
| 50–74 | 75 |
| 75–100 | 100 |

Am aktuellen Charakterlimit ist XP immer null. Überschuss wird verworfen; abgespeicherte XP am Limit sind ungültig. Eine spätere Charakterstufe gibt deshalb keine gebunkerten Berufslevel frei. XP entsteht ausschließlich nach erfolgreicher kanonischer Herstellung eines gelernten Berufs. Von den alten Rezepten sind genau `brew_heal`, `brew_mana`, `bake_bread` der Alchemie sowie `forge_forest`, `forge_mail`, `forge_ember` der Schmiede zugeordnet. Andere alte Rezepte geben keine neu erfundene Berufserfahrung.

Die Basissteigerung benötigt `12 + 2 × Berufslevel` XP pro Level. Bei überalterten Rezepten sinkt der Ertrag auf die Hälfte, dann ein Viertel, schließlich null: voller Ertrag bis zehn Level über der Rezeptanforderung, halb bis +25, viertel bis +49, null ab +50. Runenkunst beginnt mit `distill_dust` ab Charakterlevel 6. Berufslevel 25 ist bereits bei Charakterlevel 24 erreichbar; damit sind die ersten Tier-2-Tränke und Edelsteine tatsächlich freischaltbar. Neue Berufsrezepte vergeben keine zusätzliche Charakter-XP-Prämie; bestehende Rezepte behalten ihre bisherigen Charakter-XP.

Jeder Beruf hat drei alternative Meisterschaften ab Berufslevel 75. Wählen und Wechseln geschieht beim passenden Lehrer außerhalb des Kampfes; genau eine Wahl pro Beruf ist aktiv. Meisterschaftsränge ergeben sich aus 75/90/100 und werden nicht als frei importierbare Wahrheit gespeichert. Schmiedeboni erreichen höchstens +6 Rüstung/+60 maximales Leben oder +18 Waffenschaden beziehungsweise +1,5 % Krit/+2,4 % Abklingzeitverkürzung. Runenkunst bietet höchstens +30 Zauberkraft, +60 Mana/+1,8 Regeneration oder +12 % zusätzliche Sockelwirkung. Alchemie erreicht +12 % Heil- beziehungsweise Mana-Trankwirkung oder +24 % Mahlzeitwirkung.

Diese Boni sind abgeleitet, gelten nur für gelernte Berufe und gehen durch die bestehenden Statbegrenzungen. Meisterschaftswahl oder Berufslevel geben keine sofortige HP-/Mana-Füllung. Zusätzliche Sockelwirkung verwendet dasselbe kanonische Ausrüstungsbudget wie der Grundstein: beispielsweise Ring 0,28, Waffe 1,00. Die V13-Regel gegen übermächtige Gegner bleibt unverändert.

## Materialien und erreichbare Rezeptleiter

Regionale Materialien kommen als zusätzliche kleine Ausbeute aus den vorhandenen Rohstoffknoten; die gewöhnlichen Rohstoffe und deren Questereignisse bleiben erhalten. Der Zusatz entsteht erst ab dem tatsächlichen Mindestlevel der Region, nicht durch einen niedrigen Charakter, der in eine Endgamezone läuft.

| Materialtier | Erste mögliche Region | Mindestcharakterlevel dort | Wichtige Verwendung |
| --- | --- | ---: | --- |
| 2 | Sonnensteppe | 12 | Erste stärkere Tränke, Klassenwaffe, reine Edelsteine |
| 3 | Obsidianpass | 44 | Mondstahl, Mondrüstung, Mondtränke und Festmahl |
| 4 | Traumsenke | 76 | Quellenstahl, epische Klassenrüstung/-waffen, makellose Edelsteine und höchste Tränke |

Die sieben Alchemierezepte verwenden Tier-2/3/4-Kräuter und Kristalle sowie gewöhnlichen Weizen. Die sechs Schmiederezepte enthalten zwei echte Legierungen und vier instanzierte Ausrüstungsrezepte. Sie erzeugen über den nativen Lootgenerator klassentaugliche Gegenstände für alle acht Klassen, mit regulären Affixen, Sockeln, Balanceversion 2 und tatsächlichen Mindestleveln. Die sieben Runenrezepte umfassen Staubdestillation sowie je Rubin/Saphir/Smaragd in Tier 2 und 3. Gem-Tier ist im gültigen Sockelschema erhalten; Zerlegen liefert die entsprechende Ressourcenstufe zurück.

Jedes neue Rezept verlangt gelerntes Handwerk, passenden Berufs- und Charakterlevel sowie den korrekten Lehrer. Materialien, Ausgabekapazität, Klassen- und Reisebedingungen werden vor dem verbindlichen Abschluss geprüft; erfolglose Herstellung verbraucht weder Zutaten noch Berufserfahrung. Keine vom Client gelieferte Rezeptbeschreibung, Statmenge oder XP-Zahl ist maßgeblich.

## Tatsächliche native Herstellungsprobe

Der lokale Native-Bericht `.openai/.local/professions-v15/native-ladder.json` verwendet echte `Game.trainProfession`- und wiederholte `Game.craft`-Aufrufe. Er prüft bei jeder Aktion den exakten Zutatenabzug und erreicht alle drei Berufslevel 100 mit XP 0.

Die Grenzen dieser Funktionsprobe sind ausdrücklich: Wächter mit Charakterlevel 100 durch die native XP-Methode als deklarierte Fixture, zusätzliches Gold als Fixture, Position 24 Pixel vom kanonischen Lehrer, isoliert aufgestockte Materialien und entfernte Gegner. Die Berufslevel selbst wurden in dieser Leiter vollständig durch erfolgreiche Herstellung erworben. Sammelwege, Materialerwerb, Reisen, Begegnungen und menschliche Spielzeit wurden dabei nicht gespielt. Es ist kein Beleg für eine 200-Stunden-Kampagne oder die Dauer bis zur Meisterschaft.

| Beruf | Lehrer | Tatsächliche Gebühr | Erfolgreiche native Crafts | Endlevel / Rest-XP |
| --- | --- | ---: | ---: | ---: |
| Alchemie | sera | 20 Gold | 123 | 100 / 0 |
| Schmiedekunst | elin | 20 Gold | 116 | 100 / 0 |
| Runenkunst | mira | 20 Gold | 145 | 100 / 0 |

Die insgesamt 384 erfolgreichen Aktionen verwendeten folgende kanonische Rezepte:

| Beruf | Rezept-ID | Tatsächliche Aktionen |
| --- | --- | ---: |
| Alchemie | `brew_heal` | 38 |
| Alchemie | `brew_greater_heal` | 35 |
| Alchemie | `brew_superior_heal` | 8 |
| Alchemie | `cook_frontier_feast` | 31 |
| Alchemie | `brew_supreme_heal` | 4 |
| Alchemie | `brew_supreme_mana` | 7 |
| Schmiedekunst | `forge_forest` | 38 |
| Schmiedekunst | `forge_frontier_weapon` | 28 |
| Schmiedekunst | `smelt_moonsteel` | 34 |
| Schmiedekunst | `smelt_sourcesteel` | 4 |
| Schmiedekunst | `forge_source_weapon` | 6 |
| Schmiedekunst | `forge_source_armor` | 6 |
| Runenkunst | `distill_dust` | 38 |
| Runenkunst | `bind_ruby_t2` | 84 |
| Runenkunst | `bind_ruby_t3` | 23 |

Tatsächlich erzeugte Ausgaben, getrennt von bereitgestellten Ausgangsmaterialien:

- Alchemie: 38 × `heal_potion`, 35 × `greater_heal`, 8 × `superior_heal`, 31 × `frontier_feast`, 4 × `supreme_heal`, 7 × `supreme_mana`.
- Schmiedekunst: 38 × `forest_blade`, 28 × `generated_weapon_rare`, 68 × `alloy_t3`, 8 × `alloy_t4`, 6 × `generated_weapon_epic`, 6 × `generated_armor_epic`.
- Runenkunst: 152 × `dust`, 84 × `ruby_t2`, 23 × `ruby_t3`.

Für diese konkrete Auswahl wurden folgende Zutaten tatsächlich abgebucht. Zwischenprodukte sind ausdrücklich enthalten; sie dürfen nicht nochmals als unmittelbar gesammelte Rohstoffe gezählt werden.

| Beruf | Zutat | Abgebuchte Summe |
| --- | --- | ---: |
| Alchemie | `herb` | 114 |
| Alchemie | `herb_t2` | 175 |
| Alchemie | `crystal_t2` | 70 |
| Alchemie | `herb_t3` | 172 |
| Alchemie | `crystal_t3` | 55 |
| Alchemie | `wheat` | 248 |
| Alchemie | `herb_t4` | 67 |
| Alchemie | `crystal_t4` | 72 |
| Schmiedekunst | `wood` | 190 |
| Schmiedekunst | `ore` | 152 |
| Schmiedekunst | `ore_t2` | 336 |
| Schmiedekunst | `wood_t2` | 140 |
| Schmiedekunst | `crystal_t2` | 112 |
| Schmiedekunst | `dust` | 536 |
| Schmiedekunst | `ore_t3` | 204 |
| Schmiedekunst | `crystal_t3` | 68 |
| Schmiedekunst | `ore_t4` | 32 |
| Schmiedekunst | `crystal_t4` | 72 |
| Schmiedekunst | `alloy_t4` | 84 |
| Schmiedekunst | `wood_t4` | 66 |
| Runenkunst | `crystal` | 152 |
| Runenkunst | `herb` | 38 |
| Runenkunst | `crystal_t2` | 840 |
| Runenkunst | `dust` | 1017 |
| Runenkunst | `ore_t2` | 252 |
| Runenkunst | `ruby_t2` | 46 |
| Runenkunst | `crystal_t4` | 184 |

Die Probe stockt Zutaten pro Aktion auf, auch wenn gleichartige Zwischenprodukte bereits vorliegen. Daher beweist die Ausgabe keine geschlossene Selbstversorgungswirtschaft. Beispielsweise wurden acht Quellenstahl erzeugt, aber 84 Quellenstahl in der Schmiedeleiter verbraucht; im wirklichen Ablauf müssen die zusätzlichen 76 über weitere Veredelung entstehen. Das erfordert 38 zusätzliche Veredelungen mit 304 `ore_t4`, 114 `crystal_t4` und 152 `dust`. Umgekehrt decken die 84 erzeugten reinen Rubine die 46 später benötigten Zwischensteine bereits, wenn eigene Bestände zuerst genutzt werden. Für Runenkunst stehen 152 erzeugte Staub den 1017 abgebuchten gegenüber; ohne Staub aus Zerlegen/Belohnungen wären mindestens 217 weitere Destillationen nötig. Diese Zusatzbedarfe sind aus Rezeptmengen abgeleitete Rechnungen, keine weiteren ausgeführten Native-Aktionen.

Das Handwerk hat damit eine prüfbare Leiter und echte regionale Materialkosten. Die 20 zusätzlichen Rezepte werden nicht durch eine behauptete lange Spielzeit aufgebläht. Ein vollständiger Sammel-/Reise-Spieltest muss insbesondere die Kristall- und Staubversorgung sowie die Rückwege zu den Lehrern beurteilen.

## API, Prüfungen und Umfang

`src/profession-system.js` stellt read-only `canTrainProfession`, `canChooseProfessionMastery`, `craftProfessionGate`, `professionSummary`, `validateProfessionTraining`, `isProfessionTrained` und `getRecipeProfession` bereit. Gates geben `ok`, `reason`, `code`, kanonischen Beruf und Lehrer zurück; Herstellungsinfos enthalten tatsächlichen capbereinigten `xpGain`. `craftedEquipmentPreview` wählt eine passende kanonische zukünftige Basis ohne RNG, Loot-ID, Stats oder Gegenstandsvergabe. UI-Vorschau und Autorität verwenden dieselben Daten, während der native Abschluss alle Verbrauchs- und Ausgabeprüfungen übernimmt.

```sh
node --test tests/professions.test.js tests/profession-system.test.js
node --test tests/profession-integration-v15.test.js
```

26 reine Modulprüfungen bestanden. Sie decken Katalog-/Legacyerhalt, alle Lehrer, Lebens-/Kampf-/Oberwelt-/Startedbedingungen, Training-Save-Korrelation, Cap-Stockpiling, kanonische XP, Materialregion-Gates, Meisterschaften, budgetierte Sockel und alle vier Ausrüstungsausgaben für alle acht Klassen ab. Zusätzlich bestanden elf native Coreprüfungen und fünf HTTP/SSE-/Persistenzprüfungen des Integrationsstrangs: echte Herstellung, volle Tasche und Output-Rollback, Sockeln/Zerlegen, Statcache-Invaliderung, Speicherfortführung und Trennung verschiedener Spieler. Netztests benötigen nur isolierte lokale Fixtures, keine öffentlichen Konten oder Hetznerdaten.

Die abgeleiteten Berufsboni werden im Spiel nach gelerntem Beruf, Rang und Meisterschaft gepuffert; normale Gegenstände brauchen keinen zusätzlichen Statclone. Eine lokale Mikroprobe maß geringe Mehrkosten bei neutralen und mit Sockeln ausgestatteten Figuren. Daraus wird weder eine Beschleunigung noch HTTP-, Mobile-FPS- oder MMO-Kapazität abgeleitet.

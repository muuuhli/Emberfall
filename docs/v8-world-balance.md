# V8: Wildnis, Gruppenbosse und Belohnungen

Die integrierte V8-Fassung tötet passive Charaktere im unveränderten Druckvergleich im Mittel nach 17,5 statt 29,1 Sekunden. Gruppenbosse erreichen jetzt auch gegen acht nahe Spieler mehrere echte Angriffe. Reagierende Solo-Bots behalten dagegen dieselben 15 Siege und drei Zeitüberschreitungen bei sehr wenig Lebensverlust. Diese verbleibende Grenze ist Teil des Ergebnisses.

## Vergleich und Vorbereitung

Der Ausgangsstand ist V7, Commit `d6fc0b005d523d0f9c8f24c906a96e7ee765c3d4`. V8 wurde nach dem gemeinsamen Einfrieren der Produktdateien geprüft. Der Druckvergleich umfasst pro Fassung 54 native Game-Proben: Wächter und Waldläufer auf Stufe 20, 52 und 100; Aschenjagd, Finsteres Rudel und Blutnacht; jeweils passiv, stationär und reagierend.

Der bestehende [Druckcontroller](../tests/scripts/pressure-gameplay-audit.mjs) blieb identisch. Beide Fassungen verwenden dieselben sieben legalen Rare-Ausrüstungsteile, dasselbe Zufallsverfahren und dieselbe passive Lernfolge mit verdientem Punktebudget und höchstens Rang drei. Die Vergleichshülle entfernt vor der Vorbereitung sämtliche Starter-Verbrauchsgüter und gibt genau fünf passende Heilmittel. Beide vollständigen Durchläufe verbrauchten tatsächlich **null** Tränke. Das bereinigte V7 wiederholte die ursprünglichen 54 Ergebnisse einschließlich Zeiten, Lebensverlust und Aktionen exakt.

Die Vorbereitung entfernt Umgebungstruppler, Bäume, Felsen, Gebäude und andere Aktivitäten. Die regionalen Stufen und Schreine bleiben bestehen. Nur der Wildnistimer wird zur Auswahl der gewünschten Welle vorgezogen; die echte Achtsekundenwarnung, Spawnplanung, volle Gegnerbudgets, KI, Treffer und Niederlagen bleiben aktiv. Der Controller verwendet Grundangriff, die beiden Standardfähigkeiten und beim reagierenden Stil Bewegung, sichtbare Warnungen und Ausweichrollen. Zusätzliche erlernte Aktive, Gefährten, Sockel und Aufwertungen gehören nicht zu dieser Probe.

## 54 Druckfälle pro Fassung

| Stil | V7: tot / Sieg / Zeitlimit | V8: tot / Sieg / Zeitlimit | Ø verlorenes Leben V7 → V8 | Ø Dauer V7 → V8 |
| --- | --- | --- | --- | --- |
| Passiv | 18 / 0 / 0 | 18 / 0 / 0 | 100,0 % → 100,0 % | 29,1 s → 17,5 s |
| Stationär | 3 / 6 / 9 | 3 / 6 / 9 | 24,2 % → 26,4 % | 49,7 s → 48,5 s |
| Reagierend | 0 / 15 / 3 | 0 / 15 / 3 | 1,1 % → 1,2 % | 33,2 s → 33,2 s |

„Zeitlimit“ bedeutet das Ende des Audits nach 85 Kampfsekunden. Es zählt weder als Sieg noch als Niederlage; die Spielwelle selbst darf 90 Sekunden laufen. Der Lebensverlust summiert angewendeten HP-Schaden relativ zum anfänglichen maximalen Leben. Schildabsorption gehört nicht dazu. In beiden Fassungen entkam kein Charakter aus der Begegnung; die größte beobachtete lebende Population einschließlich gegnerischer Diener betrug elf.

Die drei reagierenden Wächter-Zeitlimits bleiben: Stufe 52 in der Blutnacht sowie Stufe 100 im Finsteren Rudel und in der Blutnacht. Sie enden weiter mit null HP-Schaden. Auch mehrere stationäre Wächter-Proben bleiben lange Schild-/Reichweiten-Stalemates. Auf Stufe 100 steigt der HP-Verlust des reagierenden Waldläufers in der Blutnacht von 13,1 auf 15,2 Prozent; seine Siegzeit bleibt 24,72 Sekunden. Diese Messung rechtfertigt keine pauschale Behauptung, jeder Solo-Kampfstil sei nun schwieriger.

## Native Gruppenbosse

Zwölf weitere Proben verwenden echte MultiplayerHub-Ticks mit einer, zwei, vier und acht nahen Waldläuferfiguren. Alle besitzen dieselbe legale Rare-/Passive-Vorbereitung, genau fünf Heilmittel und volle echte Gegner-HP. Startaufstellung und Bindung der Spuren sind Vorbereitung; der Kampf benutzt native Bewegung, Angriffe, Projektile und Ausweichrollen. Der Bot liest die aktuell sichtbaren Bossformen direkt. Umgebungstruppen und Deckung sind für diesen Vergleich entfernt, eine zusätzliche Wildnisjagd wird während der isolierten Messung zurückgehalten.

Die Zahlen geben Kampfsekunden ab Bossmaterialisierung an. Die Spurenwache vor Asterion bleibt Teil der echten Begegnung; ihr Aufwand ist in den Proben vorhanden.

| Boss und Stufe | Spieler | V7 | V8 | Echte Bossangriffe V7 → V8 |
| --- | --- | --- | --- | --- |
| Irdan · 12 | 1 | 9,28 s | 9,28 s | 3 → 3 |
| Irdan · 12 | 2 | 4,60 s | 7,08 s | 1 → 2 |
| Irdan · 12 | 4 | 2,20 s | 6,28 s | 0 → 2 |
| Irdan · 12 | 8 | 0,76 s | 6,04 s | 0 → 2 |
| Vey · 52 | 1 | 13,76 s | 13,76 s | 4 → 4 |
| Vey · 52 | 2 | 7,56 s | 11,20 s | 2 → 4 |
| Vey · 52 | 4 | 3,40 s | 9,64 s | 1 → 3 |
| Vey · 52 | 8 | 1,32 s | 9,04 s | 0 → 3 |
| Asterion · 100 | 1 | 25,84 s | 25,84 s | 8 → 8 |
| Asterion · 100 | 2 | 12,28 s | 20,04 s | 4 → 6 |
| Asterion · 100 | 4 | 6,24 s | 16,92 s | 2 → 5 |
| Asterion · 100 | 8 | 3,40 s | 15,32 s | 1 → 5 |

Alle zwölf V8-Gruppenproben gewannen ohne verlorene HP. Das Ergebnis bestätigt längere und tatsächlich ausgeführte Gruppenbegegnungen. Menschliche Reaktionszeit, Touchbedienung, schlechtes Netz, andere Gruppenzusammenstellungen und zusätzliche Überlandgegner sind davon getrennte Bedingungen.

## Skalierung und Stapelgrenzen

Nur lebende, berechtigte, tatsächlich aktive Spieler in der Nähe zählen. Weltaktivitäten frieren die Zahl während des ersten Warnungsupdates je Welle ein, bei weniger als 520 Welteinheiten Abstand. Der Director verwendet bei der Planung weniger als 700 Einheiten. Tote, Niedergeschlagene, PvP-Figuren, zu niedrige Stufen, ferne und duplizierte Figuren erhöhen das Budget nicht; der Server übergibt ausschließlich aktive Teilnehmer. Beitritt und Trennung verändern bestehende Gegner-HP weder nach oben noch nach unten.

| Begegnung | HP-Faktor bei n Teilnehmern | Maximum bei acht |
| --- | --- | --- |
| Benannter Boss / Bossfinale | `1 + 0,55 × (n−1)` | 4,85 |
| Normale Aktivitätswelle | `1 + 0,35 × (n−1)` | 3,45 |
| Director-Gegner | `1 + 0,20 × (n−1)` | 2,40 |

Mobzahl, Angriffsschaden und Spawntakt wurden dafür nicht erhöht. Die Wildnis behält die ersten Warnungen nach 75/40/25 berechtigten Erkundungssekunden, acht Sekunden Vorwarnung, höchstens zehn Director-Körper und zwölf lokale Gegner einschließlich weiterer Quellen. Trials behalten sechs Sekunden Vorwarnung, getrennte Wellen, ihre Rastentscheidung und einen einzelnen Schlussboss.

Der ergänzende Spawnvergleich umfasst je Fassung 192 Director-Fälle über Stufen 1/4/8/12/20/52/76/100, jede Gruppengröße eins bis acht und alle drei Druckphasen sowie 24 erste Trialwellen. Gruppen erhalten mehr HP innerhalb der bisherigen Körpergrenzen. Jede lokal laufende Aktivität pausiert neue Directorplanung im Radius 800. Ein neues Zeichen blockiert eine vorhandene nahe Wildniswarnung oder eine andere aktive Aktivität innerhalb desselben Radius. Damit löscht ein Start keine angekündigte Jagd und ruft keinen zweiten versteckten lokalen Wellenstapel.

## Belohnungen und gespeicherter Fortschritt

Die ersten zwei passenden bezahlten Boss-/Expeditions-/Trialabschlüsse behalten die Boss-Fundchancen. Ab dem dritten bezahlten Abschluss gelten normale Fundchancen; XP, Gold und Staub folgen weiterhin den bisherigen Faktoren 100/50/25 Prozent. Die Abschlusswahl eines Risikopfads behält ihren tatsächlichen Bonus.

Bei mindestens zwanzig Stufen Abstand über der Begegnung gibt es null XP, zehn Prozent des sonstigen Goldbetrags, null direkten Abschlussstaub und einen gewöhnlichen Gegenstand auf der Begegnungsstufe. Dieser erzwungene gewöhnliche Fund verändert weder den Legendary- noch den Boss-Pity-Zähler. Ein echtes passendes Risikoabenteuer baut den normalen Pityfortschritt weiterhin auf. Die Zahlen beschreiben die Aktivitätsbelohnung vor der separaten Goldverrechnung einer PvE-Niederlage.

Die 17 zusätzlichen Prüfungen in [v8-pressure-economy.test.js](../tests/v8-pressure-economy.test.js) bestätigen alle acht Gruppengrößen, Warnfristen, Trennung/Beitritt, alte und neue Director-Saves, unveränderte HP nach einem Treffer, persönliche graue und passende Gruppenclaims, Risiko-Pity, exakte Vorschau, Einmalzahlung und Reload. Die bestehenden 17 Jagden, neun Jagdbelohnungen, Preise und verdienten Beutestufengrenzen bleiben erhalten. Ein auf Stufe 100 importierter gültiger Vorrat aus Sivra-Jagden erzeugt weiterhin höchstens seltene Beute auf Stufe 18 und öffnet keinen epischen Kauf.

## Wiederholen und Artefakte

Die [Vergleichshülle](../tests/scripts/v8-pressure-comparison-audit.mjs) verwendet den vorhandenen Druckcontroller des jeweiligen Quellbaums und protokolliert dessen SHA-256 sowie die fünf Anfangsheilmittel. Die beiden Quellen müssen vor dem Vergleich eingefroren sein.

```sh
node tests/scripts/v8-pressure-comparison-audit.mjs /tmp/emberfall-v8-pressure-final-v7-five.json /tmp/emberfall-v8-baseline
node tests/scripts/v8-pressure-comparison-audit.mjs /tmp/emberfall-v8-pressure-final-v8-five.json
node tests/scripts/v8-world-group-gameplay-audit.mjs /tmp/emberfall-v8-world-groups-final.json
node --test tests/v8-pressure-economy.test.js
```

Die [Gruppenhülle](../tests/scripts/v8-world-group-gameplay-audit.mjs) wiederholt die zwölf echten Bosskämpfe sowie die Director- und Trial-Spawnmatrix. Die Spawnmatrix prüft Planungsbudgets und Populationen; nur die ausdrücklich genannten Kämpfe sind vollständige native Combatproben.

Artefakte dieser Abnahme: `/tmp/emberfall-v8-pressure-final-v7-five.json`, `/tmp/emberfall-v8-pressure-final-v8-five.json`, `/tmp/emberfall-v8-pressure-comparison.json`, `/tmp/emberfall-v8-world-groups-v7.json` und `/tmp/emberfall-v8-world-groups-final.json`. Es handelt sich um reproduzierbare Bot- und Zustandsprüfungen mit ausgewiesenen Vorbereitungen; sie decken zwei Klassen im Druckvergleich und eine Klasse im Gruppenvergleich ab.

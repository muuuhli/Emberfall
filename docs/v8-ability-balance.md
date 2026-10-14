# V8: Fähigkeiten, Ressourcen und Schutzgrenzen

Die Ausgangsmessung verwendet den unveränderten V7-Commit `d6fc0b005d523d0f9c8f24c906a96e7ee765c3d4`. Alle 88 aktiven Fähigkeiten und 196 Talente behalten ihre gespeicherten IDs und Lernpfade. V8 korrigiert den gemeinsamen Dienerhöchstwert und einen nicht angewendeten Spottbonus; zusätzliche pauschale Fähigkeits-, Heilungs- oder Schildschwächungen wurden aus diesen Proben nicht abgeleitet.

## 440 wirkliche Zweierkombinationen

Jede der acht Klassen besitzt elf erlernbare Aktive. Der native Audit spielt alle `11 × 10 / 2 = 55` ungeordneten Zweierkombinationen pro Klasse, insgesamt 440 Proben mit jeweils 45 aktiven Sekunden. Die zwei belegten Slots sowie Grundangriff, Kernfähigkeit und Flächenfähigkeit laufen über `Game.useLearnedAbility` und `Game.action`. Akzeptierte Aktionen, tatsächlicher Schaden, Manaausgaben und Abklingzeiten werden gemessen. Kanäle werden vollständig gehalten, solange kein tatsächlicher Schaden oder eine andere native Unterbrechung auftritt.

Die Figuren erreichen Stufe 100 durch echte Erfahrung und erhalten dabei ihren natürlichen Etat von 200 Talentpunkten. Fähigkeiten, Ränge und Voraussetzungen werden über `learnAbility` beziehungsweise `learn` bezahlt; der Audit prüft `ausgegeben + übrig = 200`. Beide neuen unterstützenden Talente erhalten Rang zwei, der erste ausschließende Eid Rang eins. Es werden keine zusätzlichen Questpunkte vergeben.

Zwei klar getrennte Aufbauvarianten wurden gemessen:

- `bounded`: alte Ränge höchstens drei; alle elf Aktiven gelernt. Je nach Klasse bleiben 44–61 Punkte ungenutzt. Diese erste Registryprobe ist kein vollständig ausgegebener Endgameaufbau.
- `paid`: kanonische Ränge bis zu ihrem tatsächlichen Höchstwert, nach Ressourcen- und Angriffswerten priorisiert. Sieben Klassen geben 200 Punkte aus; der Druide 199 und behält einen Punkt. Die Voraussetzungs- und Ausschlussregeln bleiben wirksam. Die Priorisierung ist eine nachvollziehbare Heuristik, kein mathematisch bewiesenes Optimum aller möglichen Builds.

Jede Figur trägt sieben tatsächlich erzeugte, klassenkompatible seltene Gegenstände. Je Slot wird zuerst die höchste zulässige Mindeststufe gewählt, dann die alphabetische Basis-ID. Dadurch kann auch eine physische Klasse einen arkanen Talisman erhalten. Diese Ausrüstung ist innerhalb einer Klasse für alle Paare gleich; die Zahlen ersetzen deshalb keinen Vergleich mit optimierter Rollenausrüstung. Sockelsteine, Aufwertungen, Siegelwaffen, Nahrung und Gefährten werden nicht ergänzt. Kanonische zufällige Setzuordnungen bleiben erhalten.

Die Schadenspuppe ist ein Wolf mit ausdrücklich künstlich hohem Leben und ohne Gegner-KI. Deckung, Umgebung, Weltaktivitäten und geplante Gegnerwellen werden im abschließenden Audit isoliert. Nativer Rückstoß und Spielerbewegung bleiben wirksam. Der korrigierte Nahkampfcontroller läuft auf 60 % der tatsächlich angepassten Grundangriffsreichweite zu; Fernkämpfer nähern sich auf 100 Schritte. Ein früherer Controller lief erst oberhalb von 120 Schritten nach und unterschätzte dadurch Wächter und Nachtklinge. Diese verworfenen ersten Schadensspannen werden hier nicht verwendet.

Die Aufbereitung zur Reproduktion fand eine weitere Grenze der historischen Fixture: Eine sehr große `nextIn`-Wartezeit allein wurde beim ersten Start des Director auf 25 Sekunden zurückgesetzt. In den historischen Schutzproben erschienen dadurch null zusätzliche Akteure beim Wächter und je drei beim Druiden und Schattenbinder, weiterhin ohne Gegner-KI. Der abschließende Audit verhindert diesen ersten Start ausdrücklich und verlangt null fremde Akteure. Alle 440 Paarproben wurden erneut gegen die unveränderte V7-Quelle gemessen; nur diese bereinigten Werte stehen in der folgenden Tabelle. Die historischen Paarwerte sind keine vollständig isolierten Puppenwerte und dürfen nicht mit der neuen Tabelle vermischt werden. Die drei Schutzproben und alle 18 Mehrquellenproben wurden ebenfalls sauber isoliert wiederholt: Ihre Heilungs-, Lebens-, Schild- und Todesergebnisse blieben exakt gleich.

Die folgenden V7-Spannen stammen ausschließlich aus dem korrigierten, bezahlten 440-Paar-Lauf. Schaden/s umfasst auch Grund- und Kernaktionen. Mana/s ist der tatsächlich ausgegebene Durchschnitt, einschließlich der beiden Aktiven.

| Klasse | Schaden/s, kleinster–größter Paarwert | Mana/s | Ausgegeben / übrig |
|---|---:|---:|---:|
| Wächter | 1.714,89–2.191,76 | 11,96–16,34 | 200 / 0 |
| Paladin | 1.954,22–2.379,87 | 20,70–25,33 | 200 / 0 |
| Waldläufer | 2.206,44–2.833,09 | 12,21–15,19 | 200 / 0 |
| Nachtklinge | 2.686,78–3.589,91 | 16,18–20,50 | 200 / 0 |
| Flammenrufer | 3.278,73–4.195,09 | 15,25–20,70 | 200 / 0 |
| Frostweber | 2.904,60–3.598,96 | 14,62–18,37 | 200 / 0 |
| Druide | 2.067,04–2.596,76 | 15,68–20,30 | 199 / 1 |
| Schattenbinder | 3.668,73–4.714,33 | 14,64–20,76 | 200 / 0 |

Eine Wiederbelebung hat ohne gefallenen Gefährten kein gültiges Ziel; alle zehn Paare mit dieser Fähigkeit werden trotzdem regulär geprüft und geben dafür weder Mana noch Abklingzeit aus. Reaktionswachten lösen ohne eingehenden Lebensschaden keine Antwort aus. Heilung, Bewegung, Kontrolle, Gruppenunterstützung und Warnungsvermeidung lassen sich aus diesem Schadenspuppenvergleich nicht als nutzlos einstufen. Die getrennte native Boss-/Gruppenprüfung steht in [v8-balance-matrix.md](v8-balance-matrix.md), der Vergleich mit Rollenausrüstung in [v8-class-balance.md](v8-class-balance.md).

## Korrigierte Dienergrenze und Spottwirkung

V7 begrenzte nur gelernte Beschwörungen. Zusammen mit dem Kernpakt wurden in der Registry- und Schutzprobe bis zu zwölf eigene lebende Diener gemessen. V8 zählt Kern- und gelernte Beschwörungen gemeinsam: höchstens acht lebende eigene Diener, pro Besitzer. Ein Begleiter, fremde Diener und bereits abgelaufene Einträge verbrauchen diese Plätze nicht. Ist kein Platz verfügbar, lehnt die native Vorprüfung den Ruf vor Mana- und Abklingzeitverbrauch ab. Bei Teilkapazität entstehen genau die verbleibenden Diener; die Zahl wird vor der Schleife festgehalten. Zwei verschiedene Beschwörer teilen keine globale Acht-Dienergrenze.

Der bestätigte Bonus des Wächtertalents **Eid am letzten Tor** erreichte gelernte Spottfähigkeiten zuvor nicht. Der angepasste Spott erhält jetzt ein eigenes `tauntRadius`, ohne den gewöhnlichen Wirkbereich nochmals zu vergrößern. Beim Schwarzen Banner mit Wachsamer Aegis Rang zwei bleiben 417,6 Schritte gewöhnlicher Bereich bestehen; der zusätzliche 25-%-Spottbonus erreicht 522 Schritte. Die bezahlten Nachteile bleiben erhalten: 25 % längere Schildabklingzeit und sechs weniger Tempo. Ein echter Gegner in 450 Schritten wird nun provoziert, einer in 530 Schritten nicht. Definitionen bleiben unverändert und werden nicht in Spielständen umgeschrieben.

## Gleiche 200-Punkte-Schutzaufbauten vor und nach V8

Die drei getrennten Ressourcenproben verwenden unveränderte, vollständig bezahlte 200-Punkte-Aufbauten mit legalen Voraussetzungen. Ihre Priorisierung lautet Abklingverkürzung, Mana-Regeneration, Lebensraub, maximales Leben. Ihre aktiven Paare sind `guardian_iron_oath`/`guardian_last_watch`, `druid_spring_rain`/`druid_moonwell` und `shadowbinder_legion`/`shadowbinder_abyss_eye`. Die Rohberichte enthalten sämtliche Ränge und die wirklichen Ausrüstungswerte.

Jede einzelne Quelle versucht 100 Rohschaden frühestens nach 0,25 Sekunden im nativen Raster von 0,04 Sekunden. Tatsächlich liegen die Versuche deshalb **0,28 Sekunden auseinander**, also 321 Versuche pro Quelle in 90 Sekunden. Die angegebenen Schäden und Todeszeiten wurden tatsächlich gemessen; es wird kein exakter 400-Rohschaden/s-Takt behauptet. Die künstlichen Quellen laufen durch echte Rüstung und Schadensregeln, sind aber keine Gegner-KI oder Boss-Siegprobe.

Die erste Vergleichsreihe beginnt mit 20 % Leben und vollem Mana. Sie verwendet eine Quelle und ignoriert ausdrücklich Ausweichimmunität. Die V8-Reihe enthält die gemeinsame Dienergrenze, die globale 8-%-Lebensraubgrenze, das gemeinsame passive Heilbudget von 2 % maximalem Leben/s und die getrennten Angreiferpausen. Direkte Klassenheilung und Entzug bleiben eigene Mechaniken.

| Gleicher Aufbau, 90 s | Gemessene V8-Heilung/s | Lebensschaden/s | Manaausgabe/s | Mana-Regeneration/s | Ergebnis |
|---|---:|---:|---:|---:|---|
| Wächter | 33,72 | 0 | 11,39 | 15,89 | Lebt; 100 % Schildabdeckung |
| Druide | 211,46 | 185,47 | 18,43 | 17,82 | Lebt; 2.936,80 / 2.988,80 Leben |
| Schattenbinder | 213,55 | 192,60 | 16,49 | 16,47 | Lebt; 2.429,57 / 2.718,40 Leben; höchstens acht Diener |

Die Schattenbinderprobe hatte vorher zwölf Diener und 719,21 diagnostisch angeforderte Heilpunkte/s, danach acht und 247,99. `requestedHps` zählt Heilaufrufe vor dem Abgleich mit fehlendem Leben und ist keine garantierte nachhaltige Heilung. `hps` zählt nur tatsächlich wiederhergestelltes Leben. Gerade beim vollen Wächterleben ist ein hoher angeforderter Wert kein Beleg für weitere echte Heilung.

Die zweite Reihe beginnt mit vollem Leben und verwendet drei, vier oder fünf getrennte Angreifer-IDs. Die echten Angreiferpausen werden eingehalten. Jede Kombination läuft einmal mit vollem und einmal mit einem Viertel des maximalen Manas; alle sechs Proben pro Klasse haben denselben bezahlten Aufbau.

| Aufbau | Drei Quellen | Vier Quellen | Fünf Quellen |
|---|---|---|---|
| Wächter | Lebt nach 90 s; 506,36 / 3.793,82 Leben; 75 % Schildabdeckung | Tod nach 21,84 s | Tod nach 11,76 s |
| Druide | Lebt nach 90 s; 2.393,99 / 2.988,80 Leben | Tod nach 16,80 s | Tod nach 10,92 s |
| Schattenbinder | Tod nach 8,96 s | Tod nach 5,60 s | Tod nach 3,92 s |

Volles und viertelvolles Startmana führten in diesen 18 Proben zu denselben Überlebens- und Todeszeiten. Der Wächter regeneriert bei diesem gezielt bezahlten Aufbau mehr Mana, als seine Rotation verbraucht. Trotzdem sinkt seine Schildabdeckung unter Gruppendruck und vier Quellen besiegen ihn. Diese begrenzten Ergebnisse begründen keine zusätzliche pauschale Schild-/Heilschwächung. Tatsächliche Gegnergruppen, Bewegungsdruck und Bosswarnungen müssen getrennt bewertet werden.

## Wiederholen und Prüfen

[v8-ability-balance-audit.mjs](../tests/scripts/v8-ability-balance-audit.mjs) lädt einen angegebenen Quellbaum und benötigt einen ausdrücklich angegebenen JSON-Ausgabepfad. Es enthält keine fest eingetragenen Arbeitsverzeichnisse, Kontodaten oder Netzwerkanfragen. Der Bericht enthält tatsächliche Ausrüstung, alle Ränge, Punkte, Profile, akzeptierte Aktionen, Schaden, Ressourcen, Quellversuche und gemessene Druckabstände. SHA-256-Werte sämtlicher JavaScript-Dateien unter `src` werden vor und nach dem Lauf verglichen; Änderungen während der Messung brechen den Lauf ab. Der Controller selbst erhält ebenfalls einen Fingerprint.

Ein vorhandener Checkout des Ausgangscommits kann als `--source-root` verwendet werden. Beispielsweise lässt sich ein separater Checkout vor dem Vergleich mit `git worktree add --detach ../Emberfall-v7 d6fc0b0` erstellen. Ausgaben im Beispiel liegen außerhalb des Repositorys:

```sh
node tests/scripts/v8-ability-balance-audit.mjs --source-root ../Emberfall-v7 --build paid --output ../ability-v7.json
node tests/scripts/v8-ability-balance-audit.mjs --source-root . --build paid --output ../ability-v8.json
node tests/scripts/v8-ability-balance-audit.mjs --mode sustain --output ../ability-sustain.json
node tests/scripts/v8-ability-balance-audit.mjs --mode multisource --output ../ability-pressure.json
node --test tests/v8-ability-balance.test.js
```

Ohne `--mode` laufen 440 Paarproben, drei Einquellenproben und 18 Mehrquellenproben. `--build bounded` wiederholt die erste Registryprobe; `--pair-limit 1` ist ausdrücklich nur eine gekürzte Funktionsprüfung mit acht Paarproben. Der voreingestellte `--director isolated` prüft in jeder Probe null zusätzliche Akteure. `--director historical` reproduziert ausdrücklich den beschriebenen alten Einmalstart und zeichnet die beobachteten zusätzlichen Akteure als `extraActorPeak` auf; er dient ausschließlich dem Nachvollziehen der alten Laufzeitberichte. Zwischen isolierten Proben werden kurzlebige Kampfzustände einschließlich Lebensraubguthaben und Angreiferpausen zurückgesetzt; das ist eine deklarierte unabhängige Testfixture und keine Möglichkeit im normalen Spiel. Der gespeicherte Controller korrigiert die erwähnte Nahkampfnachführung; die verworfene 120-Schritte-Steuerung wird nicht angeboten.

Die historischen ausführlichen Arbeitsberichte wurden unter `/tmp/emberfall-v8-ability-pairs-baseline-corrected.json`, `/tmp/emberfall-v8-ability-pairs-baseline-paid-builds.json`, `/tmp/emberfall-v8-ability-sustain-after-hooks.json` und `/tmp/emberfall-v8-ability-sustain-multisource.json` erzeugt. Sie sind kurzlebige Laufzeitdateien und kein Bestandteil des Git-Repositorys. Der enthaltene Audit kann neue, mit Fingerprints belegte Berichte erzeugen. Seine künstliche Arena ist kein importierbarer Spielstand.

Die abschließende Reproduktion enthält 440 bereinigte V7-Paare in `/workspace/scratch/emberfall-v8-preview/ability-pairs-baseline-isolated.json`, drei unveränderte V8-Schutzproben in `ability-sustain-isolated.json` und 18 unveränderte V8-Mehrquellenproben in `ability-pressure-isolated.json` desselben Arbeitsverzeichnisses. Alle Quellen blieben während der jeweiligen Läufe unverändert und alle Proben meldeten null zusätzliche Akteure. Ein gekürzter Achtpaarlauf und die Syntaxprüfung des Audits wurden ebenfalls ausgeführt.

Die neun Regressionen in `tests/v8-ability-balance.test.js` prüfen die Registry, native Kosten aller 88 Fähigkeiten, kanonische separate Spottreichweite, den echten entfernten Spottgegner und den ausschließenden Eid, beide atomaren Vollkapazitätsablehnungen, Teilkapazitäten einschließlich zweier verbleibender Plätze, verschiedene Besitzer mit einem legitim erworbenen Begleiter sowie die Speicherung von Kern- und erlernten Abklingzeiten. Ältere Spielstände bleiben ladbar; gefälschte Abklingzeiten werden atomar abgelehnt.

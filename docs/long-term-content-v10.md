# V10: sinnvolle Entwicklung über den Levelbalken hinaus

Diese Arbeitsnotiz prüft die bestehende V9-Fassung und beschreibt den nächsten spielbaren Ausbau. Sie bestätigt keinen 200-Stunden-Umfang. Der Auftrag bleibt ein großes zusammenhängendes Browser-RPG mit acht Klassen, anspruchsvollen Gruppenbossen und mindestens 200 Stunden interessanter Spielentwicklung. Neue Zähler, längere EP-Kurven oder endlose identische Wiederholungen erfüllen ihn nicht.

Prüfstand: 14. Oktober 2026, lokaler V9-Commit `271bd8e18986278691f5449b8c5a9477cf1d755a`. Die bestehenden nativen Raidmessungen und ihre Grenzen stehen in `docs/raid-v9-quality.md`.

## Was V9 tatsächlich anbietet

Die Kataloge enthalten 16 Regionen, 96 Quests, acht Dungeons einschließlich drei Raids, 17 Jagden und 33 Weltaktivitäten einschließlich acht Expeditionen. Die acht Klassen besitzen echte Fähigkeiten, Talentvoraussetzungen, zwei zusätzliche Aktionsplätze, sieben angelegte Ausrüstungsplätze, Sockel und begrenzte Wertebudgets. V9 ergänzt wesentlich bessere Gruppenmechaniken, echten Heilungsdruck und gemeinsame begrenzte Kampfbelebungen.

Langfristige Entscheidungen bleiben dünner als diese Menge vermuten lässt:

- Eine neue Dungeontiefe verwendet dieselbe Grundkarte und dieselben Rätsel. Sie erhöht Leben um 38 Prozent und Schaden um 7,5 Prozent je zusätzlicher Tiefe. Nur zwei globale Affixe ergänzen Aufgaben: Spalten ab Tiefe 4 und Echos ab Tiefe 8 (`src/dungeons.js`).
- Expeditionen verwenden feste Bühnenfolgen. Die frühe Wahl „sicher/riskant“ verändert hauptsächlich Gegnermenge, Bossleben und Abschlussbeute. `stageOf` liest stets `definition.stages[event.stageIndex]`; es gibt derzeit keine echte alternative Route, die andere Aufgaben oder Bossfähigkeiten hervorbringt (`src/world-events.js`).
- Aktive Weltaktivitäten werden beim Laden als gescheitert wiederhergestellt. Für eine längere Expedition braucht es eine eigene überprüfte Fortsetzung; bloß mehr Schritte in die vorhandene Liste einzutragen verschlechtert den Wiedereinstieg.
- Legendenaffixe und die vier Sets sind überwiegend flache Wertepakete. Die zwei seltenen Waffensiegel bieten bereits begrenzte tatsächliche Wirkungen, aber nicht planbare Klassenspezialisierungen (`src/loot.js`, `src/relics.js`).
- Eine volle Aufwertung auf +10 kostet 350 Arkanstaub je Gegenstand, 2.450 für sieben Gegenstände. Diese Materialschleife entwickelt Werte, aber noch keine neue Spielweise.
- Quellensiegel werden für Raids und einzelne Erfolge vergeben. Die aktuelle Quellensuche findet keinen Verbraucher dieser Ressource. Ein Raidabschluss führt damit noch nicht zu einer gezielt kaufbaren dauerhaften Entscheidung.

## Größte Belohnungslücke

`Game.killEnemy` verwendet `enemyXpReward`, die niedrige Gegner gegenüber hochstufigen Figuren abwertet. Der Dungeonabschluss ruft dagegen unmittelbar `gainXp(rewards.completionXp)` auf. `dungeonTierRewards` liefert dafür den vollen Bossgrundwert, unabhängig von der Charakterstufe und unabhängig von früheren Abschlüssen. So überwiegt bei veralteten Dungeons der unveränderte Abschlussbonus die korrekt reduzierte Killbelohnung.

Die folgende Probe benutzt die echte `Game.gainXp`-Methode und die echten Belohnungsfunktionen, zahlt aber ausschließlich die beiden nativen EP-Beträge. Sie spielt keine Kämpfe, Laufwege, Gruppensuche oder Vorratsbeschaffung und darf nicht als Spielzeitmessung gelesen werden.

| Wiederholungsroute | Start → Ziel | Abschlüsse | Kill-EP insgesamt | Abschluss-EP insgesamt |
| --- | --- | ---: | ---: | ---: |
| Sturmzitadelle, Tiefe 1 | 75 → 100 | 61 | 3.186.000 | 10.980.000 |
| Nachtschlund, Tiefe 1 | 90 → 100 | 15 | 3.162.240 | 3.888.000 |
| Wurzelgewölbe, Tiefe 1 | 90 → 91 | 77 | 55.440 | 554.400 |

Die gesamte EP-Anforderung von Stufe 1 bis 100 beträgt 21.244.125. Alle 96 einmaligen Questbelohnungen ergeben zusammen 5.879.738 EP. Diese Summe ist keine spielbare Route: Voraussetzungen, Gegner-EP, Reihenfolge, Nebentätigkeiten und Stufen bei der Abgabe sind darin nicht simuliert. Sie zeigt dennoch, dass der bestehende Kampagnenplan stark auf wiederholbare Tätigkeiten angewiesen ist.

Eine faire Korrektur muss gleichzeitig neue attraktive Entwicklung eröffnen. V10 erhält die Entdeckerprämie des ersten Dungeonabschlusses. Reguläre wiederholte Abschluss-EP berücksichtigen die tatsächlich gemeisterte Herausforderung und den Charakterabstand; zusätzliche Tiefe erhöht dafür die relevante Stufe alle zwei Schritte um eins. Beute, Jagdfortschritt, Staub, Quellensiegel und persönliche Tiefenrekorde bleiben der Sinn späterer Wiederholungen. Diese Änderung zusammen mit den neuen Dungeonwegen und einer vollständigen Levelroute weiter abstimmen; kein globales Verlangsamen der EP-Kurve. Die vorstehende Tabelle beschreibt ausdrücklich die unveränderte V9-Basis, nicht die neue Zahl der Wiederholungen.

## Empfohlener Ausbau: Feldzüge und Technikprägungen

Der konkrete V10-Schritt beginnt mit zusätzlichen Wegen in den acht bestehenden Dungeons und den unten beschriebenen Technikprägungen. Zwei Prüfungsstufen bieten jeweils einen Wachtkampf, eine Glutstaffel und einen Wandelgang; pro Stufe genügt ein Weg, weitere Wege sind freiwillig. Die genaue Geometrie und Laufzeit stehen in `docs/dungeon-routes-v10-design.md`. Gemeisterte Raidwege beziehungsweise geeignete tiefe Solo-Dungeonwege geben nach dem wirklichen Bossabschluss persönliche Quellensiegel. Der Charakterbeleg bindet die Prämie an Kammer und Tiefe; ein Abbruch oder bloßes Wiederholen derselben bereits belohnten Kammer bezahlt sie nicht erneut. Diese Belohnung verbindet die neue Entscheidung vor dem Boss mit einer anderen Spielweise danach.

Die sechs folgenden Feldzüge beschreiben die anschließende offene-Welt-Erweiterung. Ihre Aktivitäten werden in diesem V10-Schritt noch nicht behauptet oder in bestehende Definitionen hineingeschrieben.

Der nächste Ausbau verbindet zwei derzeit getrennte Lücken: echte alternative Abenteuerwege in der offenen Welt und planbare Fähigkeitenentwicklung aus der Ausrüstung. Die bereits vorhandenen Regionen, Familien, Gegnertypen, interaktiven Requisiten und Klassenprofile bleiben die Grundlage. Eine bloße Liste zusätzlicher Jagdaufträge wäre dafür zu wenig.

Ein Feldzug ist ein regionaler zusammenhängender Einsatz. Der Spieler wählt seine Route an einem sichtbaren Vorposten, spielt mehrere räumlich getrennte Aufgaben und bringt die tatsächlich erkämpfte Folge in das Finale. Die alternativen Routen besitzen unterschiedliche Ziele, Gegneranordnungen und Folgen; sie tauschen nicht nur Leben gegen einen höheren Belohnungsmultiplikator. In Gruppen wird die gewählte Route gemeinsam gespielt und die Beteiligung jeder Figur geprüft. Solospieler können die ersten Einsätze beenden; spätere Einsätze ergänzen die vorhandene Raidvorbereitung.

| Feldzug / Einstieg | Weg A | Weg B | Tatsächliche Folge im Finale |
| --- | --- | --- | --- |
| Salzwacht / Sturmküste, 35 | Gefangene durch zwei Angriffswege eskortieren | Zwei sichtbare Kettenwerfer zerstören, während Wachen flankieren | A erhält einen begrenzten Vorratshelfer; B entfernt eine angekündigte Kettenbahn. |
| Glaswall / Obsidianpass, 45 | Drei Feuerleitungen in sinnvoller Reihenfolge abschalten | Den fahrenden Schmiedewagen gegen gemischte Schützen und Brecher schützen | A entfernt einen wandernden Flammenstreifen; B erhält zwei freiwillig auslösbare Reparatur-/Schutzladungen. |
| Verlorener Morgen / Mondbruch, 55 | Zeitanker abwechselnd aktivieren und ihren sichtbaren Rhythmus halten | Nachbildpakete in gewählter Reihenfolge brechen, bevor sich Bahnen schließen | A erhält längere sichere Bewegungsfenster; B weniger Zusatzziele. |
| Rote Grenzwacht / Blutmark, 70 | Zwei getrennte Vorratslager verteidigen und Vorräte bewusst verteilen | Den Blutbrunnen erreichen und seine drei versetzten Angriffszeichen brechen | A erhält einen geteilten endlichen Heilvorrat; B entfernt den Heilungsfluch im Finale. |
| Sternenrückkehr / Sternensund, 90 | Die Leuchtzeichen öffnen einen sicheren, aber bewachten Rückweg | Den direkt angezeigten Rissweg mit engeren Warnflächen durchqueren | A sichert eine einzelne Rettungsmöglichkeit; B unterbindet eine Zusatzgegnerwelle. |
| Letzte Quellwacht / Nexusriss, 100 | Verschiedene Menschen koordinieren zwei getrennte Quellstationen | Die Gruppe zerstört sichtbare Anker in selbst gewählter Reihenfolge | A erhält ein Schutzfenster; B beeinflusst die nächste tatsächliche Ring-/Fächerfolge. |

Diese sechs Konflikte sind ein inhaltlicher Arbeitsvorschlag, keine schon fertigen Abenteuer und keine Stundenrechnung. Zuerst Salzwacht und Glaswall vollständig bauen, spielen und auf ihre unterschiedlichen Entscheidungen prüfen; danach dieselbe Laufzeit mit eigenständigen nächsten Konflikten erweitern. Die Gesamtanforderung wird dadurch nicht auf zwei Einsätze reduziert.

Die Routen müssen physisch im vorhandenen Gelände liegen. Wellen dürfen nicht lediglich am selben Zeichen erscheinen. Abstand, Deckung, engere und weitere Wege sowie bedrohte Ziele schaffen Stellungsspiel. Mobilansicht und Karte zeigen das aktuelle konkrete Ziel, die Route und die bevorstehende Folge. Unangekündigte irreversible Nachteile sind kein interessanter Schwierigkeitsgrad.

## Dauerhafte Belohnung mit echter Klassenwirkung

Der erste V10-Schritt gibt Quellensiegeln einen gezielten Verbraucher: Jede Klasse erhält zwei Varianten einer vorhandenen Q-/F-Technik. Eine Variante kostet 12 Quellensiegel, beginnt ab Stufe 70 und wird einmalig erlernt. Die alternative Variante kostet ebenfalls 12 Siegel; kein höherer Preis behauptet eine stärkere Wahl. Sie verbessert nicht pauschal alle Werte und benötigt keine legendäre Zufallsbeute. Vorhandene Ausrüstung bleibt nützlich. Spätere eigenständige Feldzüge können weitere Fähigkeiten über tatsächlich bewältigte Routen freischalten.

Nur eine Prägung kann aktiv sein; sie verändert eine ausdrücklich benannte Grundtechnik. Der Wechsel ist außerhalb des Kampfes an einer Siedlung kostenlos und behält ihre laufenden Abklingzeiten. Prägungen ruhen im normalisierten PvP. Die zwei Schwerpunkte pro Klasse schaffen unterschiedliche Antworten auf Einzelziel, Gruppengefahr und Versorgung; die Zahlen werden nach tatsächlichen Kampfmessungen überprüft.

Beispiele für überprüfbare Gegenwerte:

- Waldläufer: Durchschlag trifft eine Reihe von fünf Gegnern mit schwächeren Treffern und kürzerer Reichweite, oder genau einen Gegner stärker aus größerer Entfernung mit längerer Einsatzpause.
- Paladin: größerer Heilradius bei niedrigerer Heilung, oder kürzerer Radius mit höherer Einzelheilung und längerer Pause. Reale Gruppen außerhalb beziehungsweise innerhalb der beiden Radien liefern den Vergleich.
- Wächter: längerer Schild bei geringerer Stärke, oder kürzerer Schild für einen stärkeren angekündigten Einschlag. Schutz muss im realen Schadenspfad gemessen werden.
- Flammenrufer: stärkerer direkter Feuerball mit kleinerer Spritzfläche und längerer Pause, oder größere Spritzfläche bei schwächeren Treffern und kürzerer Reichweite. Einzelne Bossziele und Rudel begründen die Wahl.
- Frostweber: längere, schwächere Kontrolle oder kürzere, stärkere Kontrolle; Bosskontrolle bleibt begrenzt.
- Nachtklinge: weiterer Schattenstich mit kleinerem Trefferumkreis und weniger Schaden, oder kürzerer Vorstoß mit größerem Trefferumkreis und stärkeren Treffern. Die stärkere Variante muss näher an die Ziele.
- Druide: längere und stärkere Heilimpulse bei schwächerer sofortiger Heilung oder stärkerer Sofortheilung mit kürzeren, schwächeren Heilimpulsen. Der Wirkungsradius bleibt gleich.
- Schattenbinder: länger bestehender Diener mit langsamerem Angriff oder kurzlebiger schnellerer Diener. Das bestehende gemeinsame Dienerlimit gilt unverändert.

Die Freischaltungen und Folgen sollten im bisherigen Reise-/Fähigkeiten-/Ausrüstungsbereich erklärt werden. Neue Ressourcenfenster, zusätzliche Pflicht-Aktionsleisten und ein unverständlicher zweiter Talentbaum sind dafür nicht nötig. Das Endgame braucht außerdem später weitere Ausrüstungsentscheidungen, etwa gezielte Affixprägung oder echte Setwirkung. Diese Phase sollte jedoch nach den ersten tatsächlich messbaren Technikentscheidungen folgen, damit mehrere unbekannte Schadenssteigerungen nicht gleichzeitig die Raids entwerten.

Die Preisentscheidung wurde durch echte `Game.updateWorld`-Abschlusszahlungen und `Game.interact`-Truhenzahlungen geprüft. Dafür wurde ein besiegter Boss vorbereitet; die Probe ist kein gespielter Kampf und keine Zeitmessung.

| Dungeontiefe | Quellensiegel je Figur für Abschluss | Zusätzlich für die öffnende Figur aus der gemeinsamen Siegestruhe |
| --- | ---: | ---: |
| 1 | 1 | 0 |
| 5 | 1 | 1 |
| 10 | 2 | 2 |
| 20 | 4 | 4 |
| 30 | 6 | 6 |

Die Truhe zahlt ihr Extra derzeit nur einmal an die öffnende Figur. Ihr Zusatz darf daher nicht als garantierter Ertrag jeder Gruppenfigur in die Preisrechnung eingehen. V10-Routenprämien sollen nach einem Bossabschluss jeder tatsächlich beteiligten Figur genau einmal zugutekommen; abgebrochene Wege dürfen keine Siegel erzeugen. Damit ergänzen konkrete Aufgaben die vorhandene Raidentwicklung. Aus dem Preis lässt sich weiterhin keine Spielstundenanzahl ableiten.

## Umsetzung an vorhandenen Schnittstellen

**Inhalt und Laufzeit:** ein eigener kanonischer Feldzugkatalog plus schlanke Laufzeit, mit wiederverwendeten Objektarten und Gegner-/Warnungsprofilen. `interactWorldEvent`, `updateWorldEvents`, Beitragsprüfungen und bestehende Stage-Typen liefern die Prinzipien. Bestehende Weltaktivitäten müssen unverändert funktionieren. Ein Feldzug benötigt ausdrücklich ausgewählte Routenlisten, den aktuellen räumlichen Mittelpunkt, klar begrenzte unterstützende Ladungen und kanonische Bossfolgen. Das bestehende `event.bonus` ist kein Ersatz dafür.

**Charakterentwicklung:** `src/technique-specializations.js` enthält den kanonischen Katalog, Freischaltungsprüfung, gültigen aktiven Slot und angepasste Fähigkeitenprofile. `Game.action` stellt für Q/F nach `applyTalentAbilityProfile` das endgültige Profil zusammen, bevor Kosten, Reichweite und Gegner-/Verbündetenwahl erfolgen. Dadurch messen Anzeigen und Spiel dieselben Werte. Keine Änderungen des globalen gefrorenen Fähigkeitskatalogs; keine frei importierten Multiplikatoren. Das reine Modul besteht 18 Prüfungen. Der bestehende Talente-/Fähigkeitenbereich zeigt die zwei eigenen Varianten mit Vorteilen, Nachteilen, Preis und dem numerischen Grundtechnikvergleich. Die native Oberfläche wurde zusätzlich über ihre Produktionshandler und eine echte verzögerte HTTP-Prägung geprüft; sichtbare Browser-/Geräteprüfung und die vollständige Cast-/Saveintegration werden gesondert im laufenden V10-Ausbau bestätigt.

Die genaue Integrationsschnittstelle lautet:

```js
game.techniqueSpecializations = {version: 1, learned: [], active: null};
createTechniqueSpecializationState();
validateTechniqueSpecializations(saved, {classId, level});
restoreTechniqueSpecializations(saved, {classId, level});
captureTechniqueSpecializations(game);
canLearnTechniqueSpecialization(game, id); // {ok, reason}
learnTechniqueSpecialization(game, id); // bool; nur Zustand und Ressourcen
canSelectTechniqueSpecialization(game, id); // {ok, reason}; id=null entfernt
selectTechniqueSpecialization(game, id); // bool; keine Kosten und kein CD-Reset
applyTechniqueSpecialization(profile, game, {action}); // bolt oder nova
techniqueSpecializationSummary(game); // eigene zwei Angebote + Vergleichsprofile
techniqueCooldownCeiling(saved, classId, action); // größter erlernter CD-Faktor
```

Lernen setzt den aktiven Slot noch nicht automatisch. `Game` übernimmt Rückmeldung, Änderungsereignis und Speichern. Die Speicherschranke laufender Grundtechnik-Pausen berücksichtigt mit `techniqueCooldownCeiling` alle erlernten Varianten, auch wenn die vorher gewirkte Prägung inzwischen gewechselt oder entfernt wurde. Talentfaktoren und negative pauschale Cooldown-Modifikatoren werden zusätzlich weiter wie bisher berücksichtigt; ein aktiver Slot allein wäre dafür zu eng.

**Speicherung:** Feldzugzustand enthält kanonische IDs und erlaubte Fortschritte, keine frei wählbare Belohnung oder Effektstärke. Laufende Einsätze behalten Route, Phase, beschädigte Ziele, verbrauchte Unterstützungsaktionen und korrekt relative Warnzeiten. Erst eine vollständige überprüfte Wiederherstellung ersetzt das bisherige Scheitern beim Laden. Charakterrekorde, einmalige Freischaltungen, gekaufte Prägungen und die aktive Wahl sind getrennt. Alte Reisen erhalten leeren neuen Zustand. Ein ungültiger Import ändert kein vorhandenes Spielobjekt.

**Gruppenspiel:** gemeinsam simulierte Route und Einsatzakteure gehören zum Zimmer, persönliche Beitrags-/Belohnungsansprüche zum Charakter. Die Server- und Client-Methodenlisten in `server/multiplayer.mjs` und `src/network.js` werden zusammen erweitert. HTTP nimmt nur bekannte Kennungen an, keine fertige Route, freie Bosswerte oder vom Client behauptete Abschlüsse. Aufnahme, Austritt und Raumneustart dürfen Ziele weder heilen noch einen persönlichen Anspruch doppelt bezahlen.

**Oberfläche:** vorhandene Karte, Zielverfolgung, Abenteueransicht, Fähigkeitenbereich und Warnungsleiste erhalten den Inhalt. Der Spieler sieht vor der Route die eigentliche Aufgabe und die Folge, im Einsatz das nächste physische Ziel und vor dem Prägen die vollständigen Gegenwerte. Ein angewandtes Profil muss mit seinem tatsächlichen Radius, Schaden und Kosten erklärt werden.

## Aufteilung und Qualitätsbelege

Parallel möglich sind ein Inhalts-/Laufzeitpaket, ein reines Prägungs-/Belohnungspaket und Oberfläche/Renderer. `Game` sowie Netzwerk-/Speicherverkabelung haben einen Besitzer, damit keine konkurrierenden Umbauten stattfinden. Zuerst genaue Methoden und Zustandsformen vereinbaren.

Passende Prüfungen müssen mehr als Kataloganzahlen bestätigen:

1. Beide ersten Routen normal durchspielen; Ziele an tatsächlichen Orten erreichen, die unterschiedlichen Finalefolgen erleben und nur als beteiligte Figur belohnt werden.
2. Jede angebotene Technik verändern, in einem passenden Einzelziel-/Rudel-/Gruppenfall verwenden und ihren Nachteil messen. Kein unbedingter Gewinner soll beide Fälle beherrschen.
3. Nach Routenwahl, beschädigtem Schutzziel, verbrauchter Ladung und angekündigtem Bossangriff speichern/laden; kein Heilen, Zurücksetzen, doppelter Anspruch oder verlorenes Geld.
4. HTTP/SSE mit mehreren Figuren prüfen; eigenes Save-Export und Zimmerneustart müssen denselben Einsatz fortsetzen. Gefälschte Kennungen und abgeschlossene Fremdrouten bleiben unwirksam.
5. Bestehende Raids mit Rare-Ausrüstung, neuen Prägungen und anschließend mit realistischer höherer Ausrüstung messen. Rollenbeiträge, Heilvorräte und Mechanikzeit dürfen nicht durch unbemerkte Verstärkung verschwinden.
6. Sichtbare mobile und Desktop-Reise durch die Auswahl, Karte, Ziele, Finale und Prägung aufnehmen; keine verborgenen Browserzustände als Nachweis einer sichtbaren Spielroute benutzen.

Für die 200-Stunden-Abnahme bleibt eine echte Langzeitroute nötig: frischer Charakter, gewählte Klasse, vollständige Meilensteine, Ausrüstungsentscheidungen, freiwillige Wiederholungen, Fehlversuche, Versorgung und Gruppenabende. Automatische Spielcontroller können Abkürzungen und monotone Stellen finden, menschliche Sitzungen müssen Spaß und nachhaltige Entscheidungen belegen. `campaignPacing.verifiedHours` bleibt bis dahin null; auch zusätzliche Feldzüge und Technikvarianten rechtfertigen keine erfundene Stundenangabe.

# Emberfall: verbindliches Ausbauziel

Ein großes kooperatives 2D-Action-RPG mit acht unterschiedlichen Klassen, Fortschritt bis Level 100, Rätseldungeons, schweren Gruppenbossen, tiefem Loot, mehr Quests, besserer Grafik/Animation und mindestens 200 Stunden sinnvoller Spielentwicklung. Das Ziel bleibt aktiv. Eine externe 5/5-Bewertung und 200 Stunden Spielqualität werden nicht behauptet.

## Umgesetzt und geprüft am 13. Oktober 2026

- Acht echte Klassen mit unterschiedlichen Grundangriffen, Heilung, Schilden, Taunts, Fallen, Durchschlag, Dashstrike, Lebensentzug und Beschwörungen; Klassenkampf wird durch reale Game- und HTTP-Servertests geprüft.
- Level 100, 16 verbundene Regionen auf einer Welt von 19.200 × 14.400 Einheiten, 72 Storyquests mit Levelvoraussetzungen; regionale Gegnerwerte und Loot entsprechen ihrem tatsächlichen Gebiet.
- Acht Dungeons mit Runensequenzen, Lichtlinsen, Hebeln, schiebbaren Kisten und gemeinsamen Drucksiegeln. 30 Tiefen mit echten Schadens-/Belohnungsänderungen, Risswarnungen ab Tiefe 4 und lebenden Echowellen ab Tiefe 8.
- Raids erfordern 3, 4 oder 8 lebende Menschen. Gleichzeitige Siegel, Schildfenster, Sammeln/Verteilen und Enrage wirken im Serverkampf. Todesfälle und Austritte zwischen Server-Ticks erlauben keinen Bosskill mit zu kleiner Gruppe.
- Instanzierte Ausrüstung mit 38 Grundtypen, Affixen, klassenbezogenen legendären Eigenschaften, vier Sets, Sockeln, begrenzten Aufwertungen, Seltenheitsraten und Pechschutz. Höhere Tiefen verbessern tatsächliche Ausrüstungswerte. Gepäck und Metadaten bleiben begrenzt.
- Wiederholbare regionale Aufträge mit drei Angeboten je passender Levelspanne und höchstens drei aktiven Aufgaben: Jagd, Sammeln, Handwerk, Landwirtschaft und Dungeons. Neue Ereignisse zählen; bereits gelagerte Materialien und alte Kills zählen nicht. Belohnungen, Orte und Speicherzustände werden autoritativ geprüft.
- Echte HTTP/SSE-Gruppensimulation mit serverseitigem Kampf, eigenen Charakteren und persönlicher Beute. Zwei unabhängige sichtbare Browser wurden derselben Gruppe verbunden; Bewegung und Figuren waren gegenseitig sichtbar. Gruppencharaktere wurden nach Neuladen und Serverneustart wieder aufgenommen.
- Versionierte Einzelspielstände übernehmen alte Reisen. Rätsel, Bossbelohnungen, Aufträge, Kampfzeit, bevorstehende Risse und lebende Echowellen werden gespeichert. Server-Sitzungen und verbleibende Pflanzen-/Ressourcenzeiten überstehen Neustarts.
- Originale Blender-Figuren: acht Klassen × vier Richtungen × acht Posen. Der 4096 × 1536 RGBA-Atlas nutzt 128 × 192 physische Pixel je Zelle; Native `.blend` und Generator bleiben bearbeitbar. Im Browser sichtbar geprüft, Alpha/Abmessungen geprüft und abgeschnittene Liegeposen korrigiert.
- Terrain-LRU ist auf 64 Chunks à 512 Pixel begrenzt (64 MiB), statt die ganze Welt in einen einzigen Canvas zu zeichnen. Tests prüfen die Grenze, Wiederverwendung und Dungeonwechsel. Die Minikarte zeigt einen lokalen Ausschnitt; die Weltkarte alle Regionen.

## Noch offen: Umfang und Qualität

1. **200 Stunden sinnvoller Entwicklung sind nicht belegt.** `node tests/scripts/pacing-audit.mjs` reproduziert eine analytische Abschätzung, keinen menschlichen Spieltest. Aktuelle Tier1-Wiederholungen erlauben Fortschritt bis 100 wesentlich schneller als das Ziel; zusätzliche Aufträge und höhere Tiefen allein lösen die Inhaltsfrage nicht.
2. Levelrelevanz der Kampf-EP und der Dungeonbelohnungen, Erstabschlussboni und Lücken zwischen Gebietsstufen müssen gemeinsam abgestimmt werden. Die EP-Kurve wird nicht einfach verlangsamt, um eine Stundenangabe zu erzwingen.
3. Dungeonwege, einzelne Bossmechaniken, Rätselvarianten und Endgame-Ziele brauchen mehr Eigenständigkeit. Prestige, Fraktionen, Klassenmeisterschaft und spätes Handwerk sollen echte Freischaltungen statt reine Zählaufgaben bieten.
4. Schwierigkeit und Gruppenspaß benötigen menschliche Spieltests: Zeit pro Meilenstein, Wipes, Heilungsdruck, Rollenbedarf, freiwillige Wiederholungen und Anteil interessanter Tätigkeiten. Automatisierte Mechaniktests belegen keine ausbalancierte Schwierigkeit.
5. Browserleistung muss auf weiteren Geräten sowie mit acht sichtbaren Teilnehmern über längere Sitzungen geprüft werden. Die Speichergrenze des Terrain-Caches ist geprüft; eine allgemeine Bildratenzusage gibt es nicht.
6. **Mehrspieler funktioniert lokal und im LAN.** Der Sites-Link veröffentlicht die Browser-Dateien. Ein dauerhaft erreichbarer Internet-Mehrspieler-Dienst und passende Freigaben für weitere Besucher sind noch nicht eingerichtet.

## Nächste Arbeit

Levelrelevante Belohnungen, vielfältigere Dungeon- und Bossinhalte, spätes Handwerk und dauerhafte Endgame-Freischaltungen ausbauen. Danach vollständige Spielrouten und Gruppenläufe messen. Das Ziel erst abschließen, wenn alle verbindlichen Anforderungen tatsächlich erfüllt und passend geprüft sind.

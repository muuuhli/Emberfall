# Emberfall V11: kompakte Browseroberfläche

Prüfstand: 14. Oktober 2026. Diese Fassung bearbeitet die gewünschte Übersicht und Bedienung auf Desktop und mobilen Geräten. Sie erweitert weder den Kampagnenumfang noch den Nachweis der Langzeitbalance.

## Oberfläche

Die vier Hauptbereiche heißen Held, Inventar, Quests und Welt. Desktopmenüs besitzen eine schmale Seitennavigation; mobile Menüs zeigen die Hauptbereiche und nur deren aktive Unterbereiche. Titel und Beschreibungen sind kürzer. Erweiterte Inventarfilter bleiben zunächst geschlossen; mobil erscheinen Gegenstände als lesbare Zeilen mit weiterhin erreichbaren Vergleichen, Sockeln, Aufwertungen und Anlegeaktionen.

Lebenspunkte und Mana erscheinen als kompakte Balken. Die obere Leiste misst 48 Pixel auf Desktop und 44 Pixel auf Touchansichten. Die mobile Minikarte misst 80 Pixel; die acht Touchaktionen besitzen jeweils 50 × 44 Pixel. Hinweise und die Zielchronik stehen in einem optionalen Seitenfenster, das zunächst geschlossen bleibt und seine Höhe dem Inhalt anpasst. Das Buchsymbol oder H öffnet es, Escape schließt zunächst dieses Fenster.

Gewöhnliche Meldungen stehen höchstens drei Sekunden sichtbar, wichtige Fortschritte 3,2 Sekunden und Warnungen höchstens vier Sekunden nach Ankunft. Gleichrangige neue Meldungen ersetzen ältere; unterbrochene Meilensteine werden nicht später wieder eingeblendet. Bündelung und Priorität bleiben erhalten. Der Verlauf bewahrt die letzten 40 Einträge während der Sitzung, je Bündel höchstens 80 ursprüngliche Meldungstexte. Ein Neuladen beginnt einen neuen Verlauf. Auch Ergänzungen zu bereits gelesenen Bündeln erscheinen wieder als ungelesen. Benachrichtigungen öffnen das Fenster nicht automatisch.

Beim Lesen pausiert ein lebendes Solospiel. In einer Gruppe läuft der Server weiter, während lokale Spielaktionen gesperrt sind. Das Öffnen löscht gehaltene Tasten, Joystickzustand und gepufferte Touchaktionen. Tod und Duellergebnisse behalten Vorrang. Fokus und Scrollposition werden bei Aktualisierungen erhalten.

## Prüfungen

`npm test`: **946/946 Tests bestanden**. Darunter sieben echte Meldungsqueue-Prüfungen, zwölf neue Infofenster-Prüfungen und zwei neue Navigationsprüfungen. Sie prüfen unter anderem Ablauf ohne Meldungsstau, unveränderte Fristen bei Dauerbetätigung, vollständige sichere Texte, neue ungelesene Bündel, tatsächlichen MobileInput-Reset, Offline-/Onlinepause, Escape/Tab/Fokus, Elternmenüs, Tod, PvP und die Erreichbarkeit aller zwölf bisherigen Bereichsansichten. `npm run build` und `git diff --check` sind erfolgreich.

Die Browserprüfung verwendet den separaten Loopback-Port 4175 ohne persistente Serverdaten und die vorhandene Testreise „Mobile Prüfung“, Flammenrufer Stufe 12. Stufe und Beute sind eine UI-Fixture; ihre Beschaffung wurde hier nicht durchgespielt. Nutzerreisen auf Port 4174 erhalten keine Testdaten. Alle Bedienaktionen erfolgen über normale Buttons und Tastatur; Browserauswertung liest ausschließlich sichtbaren DOM und Layout.

- 1280 × 900: kompakter Weltstatus, Inventar mit Seitennavigation und gefalteten Filtern, optionaler Hinweisverlauf.
- 390 × 844: lesbare Beuteliste, Glutlehrlingsstab angelegt und zum vorherigen Glutzauberstab zurückgewechselt; beide Meldungen im Verlauf gelesen. Hinweise automatisch ausgeblendet, ungelesener Zähler erhalten. H, Escape und Zielansicht funktionieren. Das Fenster misst mit zwei Meldungen 232 Pixel und mit dem leeren Reiseziel 247 Pixel Höhe.
- 844 × 390 und 360 × 640: Status, Infofenster und Touchaktionen bleiben innerhalb der Ansicht. Kein horizontaler Dokumentüberlauf in den geprüften Ansichten.
- Nach einer gezielten Korrekturbatch wurden Mobilzeilen, gefaltete Desktopfilter, Fensterhöhe und Toastposition bestätigt. Keine Browserwarnungen oder JavaScriptfehler aufgezeichnet.

Prüfbilder: [Welt Desktop](qa/ui-v11-desktop-world.png), [Inventar Desktop](qa/ui-v11-desktop-inventory.png), [Info Desktop](qa/ui-v11-desktop-info.png), [Welt mobil](qa/ui-v11-mobile-world.png), [Inventar mobil](qa/ui-v11-mobile-inventory.png), [Info mobil](qa/ui-v11-mobile-info.png), [Ziele mobil](qa/ui-v11-mobile-goals.png), [Querformat](qa/ui-v11-landscape-world.png).

Die mobile Prüfung verwendet Browsergrößen, keine physischen iOS-/Android-Geräte. Das Gesamtziel und die ausstehenden Kampagnen- und Internet-Gruppenprüfungen aus V10 bleiben offen.

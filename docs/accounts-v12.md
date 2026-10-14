# Spielerkonten und gemeinsame Reisen

Das Spielerkonto wird über das kleine Kontosymbol oder die Startseite geöffnet.
Anmelden und Konto erstellen verwenden Spielername und Passwort, ohne einen
E-Mail-Dienst. Der Spielername hat 3–24 ASCII-Buchstaben, Zahlen, Unterstriche oder
Bindestriche; Groß- und Kleinschreibung bezeichnet dasselbe Konto. Das Formular
verlangt mindestens zwölf Passwortzeichen. Der Server begrenzt die UTF-8-Länge
zusätzlich auf 128 Bytes. Bei der Registrierung stehen die acht bestehenden
Klassen zur Wahl; ein abweichender Charaktername ist optional.

Nach der Anmeldung zeigt das Konto den gespeicherten Charakter mit Klasse und
Stufe. „Reise fortsetzen“ verbindet diesen Charakter mit seiner Serverreise.
Ist diese Reise bereits verbunden, kehrt die Schaltfläche zur aktuellen Welt
zurück. „Ohne Anmeldung spielen“ bleibt für die lokale Browserreise verfügbar.
Eine zuvor lokale Reise bleibt beim Konto verbunden als separate Sicherung im
Browser erhalten und wird beim Abmelden wiederhergestellt.

## Fortschritt zwischen Geräten

Der Spielserver besitzt den maßgeblichen Charakterstand. Bewegung, Kämpfe,
Ausrüstung, Techniken und Quests laufen über die bestehende autoritative
Simulation; die Browseransicht übernimmt deren Zustände. Ein anderes Gerät lädt
nach Anmeldung mit demselben Konto denselben gespeicherten Charakter. Es werden
keine unabhängigen lokalen Charakterkopien miteinander zusammengeführt.

Ein Konto besitzt genau eine Figur mit einer dauerhaften persönlichen UUID.
Eine private Solowelt, das Erstellen oder Betreten einer Gruppe und das Verlassen
der Gruppe verwenden diese Figur weiter. Gruppenaustritt führt sie in eine
private Serverwelt zurück. Er erzeugt keinen neuen Charakter. Mehrere Geräte
mit demselben Konto betrachten und steuern dieselbe Figur; sie zählen nicht als
zusätzliche Menschen für eine Raidgruppe.

Konten und Charaktere gehören zum vorhandenen privaten, atomar geschriebenen
Serverspeicher. Passwörter werden serverseitig gesalzen mit scrypt abgeleitet.
Der Browser nutzt ein HttpOnly-Sitzungscookie; Passwortfelder werden nach einer
Anfrage und beim Verlassen des Formulars geleert. Passwörter gelangen weder in
UI-Entwürfe noch in den Hinweisverlauf. Das Konto wird beim Öffnen erneut geprüft,
damit ein in einem anderen Tab gewechseltes Konto nicht als alte Identität
weitergeführt wird. Verbundene Befehle und Streams werden zusätzlich an die
persönliche Kennung des jeweiligen Tabs gebunden.

## Gruppen finden und einladen

Das Gruppenfenster zeigt offene Gruppen mit Beitreten-Schaltfläche. Volle oder
vom Server gesperrte Gruppen sind nicht anwählbar. „Gruppe erstellen“ benutzt
den vorhandenen Kontocharakter; als Gast gelten weiterhin getrennte
Gruppencharaktere. Serveradresse, Gastname, Klasse und Gruppenname sind unter den
erweiterten Einstellungen erreichbar.

Eine aktive Gruppe bietet „Einladungslink kopieren“. Der Link trägt ihren
achtstelligen Code als `?join=…`; ein ausdrücklicher Klick bestätigt den Beitritt.
Das Öffnen eines Links allein verbindet keine Gruppe. Nach dem Kopieren erscheint
immer auch ein auswählbarer Link, damit er auf jedem Gerät manuell geteilt werden
kann. Falls die Zwischenablage nicht verfügbar ist, wird dieser Link direkt
ausgewählt. Der Gruppencode bleibt
als einklappbare Alternative erreichbar. Nach einer Anmeldung wird eine
mitgebrachte Einladung im Konto angezeigt.

## Sicherer Zugang und Betriebsgrenzen

Auf einem öffentlichen HTTP-Zugang zeigt das Konto nur einen Link zur
konfigurierten HTTPS-Spieladresse und keine Passwortfelder. Eine Einladung
bleibt in diesem Link erhalten. Die TLS-/Proxy-Konfiguration steht im
[Hetzner-Betriebspaket](../deploy/HETZNER.md). Das öffentliche IP-Zertifikat
wurde mit der System-Vertrauenskette ohne Sicherheitsausnahme geprüft.

Die API erlaubt eine Aufnahmegrenze zwischen einem und 128 Konten; die
Hetzner-Konfiguration begrenzt die Aufnahme zunächst auf 32. Das begrenzt
auch Speicher-Spitzen durch ausgebautes Gepäck und Lager. Das Hetzner-Compose-Beispiel
begrenzt gleichzeitig aktive Welten auf acht; dazu zählen private Solowelten
und Gruppenwelten. Eine Gruppe hat höchstens acht aktive Reisende. Diese
Schutzgrenzen sind keine nachgewiesene MMO-Kapazität. Die getrennte
[Leistungsprüfung](hosting-performance-v12.md) beschreibt Messverfahren,
beobachtete Werte und deren Grenzen.

Die nativen [Kontotests](../tests/accounts-ui-v12.test.js) prüfen Formulare,
Anfragezustände, Fehlerrückmeldung, Identitätswechsel, Gruppenbeitritt und
Linkfallbacks mit Produktionshandlern. Sie simulieren keine Browsergeometrie.
Die mobile Gestaltung erhält die kompakte Menüstruktur, scrollbaren Inhalt,
44-Pixel-Bedienflächen und 16-Pixel-Eingabetext. Im Browser wurden Anmeldung,
Fortsetzen, Gruppenbildung, Einladungsbeitritt und Abmelden bei 390 × 844
geprüft, außerdem die Desktopstruktur bei 1280 × 800. Die Figur behielt ihre
Klasse; Abmelden stellte die frühere lokale Reise wieder her. Das Kopieren
zeigte auch nach Erfolg den auswählbaren Link. Eine physische mobile
Bildschirmtastatur und die Framerate auf echten Smartphones wurden nicht gemessen.

# V16: Gemeinschaft über Gruppenwechsel hinweg

Dieser Ausbau verbindet die vorhandenen dauerhaften Konten mit Freundschaften, Gilden und Gildenkommunikation. Die persönliche Figur und ihre Gegenstände bleiben im bestehenden autoritativen Spielspeicher. Gemeinschaft ersetzt weder die Gruppensimulation noch eine gemeinsame öffentliche Welt: Eine aktive Spielgruppe bleibt auf acht Figuren begrenzt.

## Konten und Zustimmung

Freundesanfragen werden an einen exakten Kontonamen (Groß- und Kleinschreibung werden gleichbehandelt) gesendet. Erst die ausdrückliche Annahme erzeugt eine beidseitige Freundschaft. Eingehende und ausgehende Anfragen lassen sich ablehnen beziehungsweise zurückziehen; Freundschaften lassen sich entfernen. Blockieren trennt Freundschaft und Anfragen und sperrt neue Kontaktaktionen in beide Richtungen. Blockierte Chatbeiträge werden in der eigenen Gildenansicht ausgeblendet.

Gilden werden mit einem eindeutigen Namen gegründet. Einladungen verlangen Zustimmung; ein Konto gehört höchstens einer Gilde an. Gildenleiter können die Leitung übertragen und Offiziere ernennen. Offiziere können Mitglieder einladen und gewöhnliche Mitglieder entfernen; sie erhalten keine Macht über den Leiter oder gleichrangige Offiziere. Ein Leiter mit weiteren Mitgliedern muss die Leitung vor dem Austritt übertragen. Ein Gildenwechsel vergibt weder Gold noch Ausrüstung oder Charakterfortschritt.

Die Grenzen sind 32 Freunde und 32 blockierte Konten je Konto, 32 Mitglieder je Gilde und begrenzte offene Anfragen beziehungsweise Einladungen. Diese Grenzen sind Daten- und Bediengrenzen; sie erlauben keine größere aktive Spielgruppe und bestätigen keine entsprechende Serverkapazität.

## Mitstreiter wiederfinden und beitreten

Bekannte Mitspieler zeigen die vom Server bestimmte Figur, Klasse und Stufe. Präsenz setzt eine echte, weiterhin autorisierte Verbindung zum Spiel voraus. Eine nur angemeldete oder gespeicherte Figur ist dadurch nicht automatisch online.

Der direkte Gruppenbeitritt gilt für gegenseitige Freunde oder Mitglieder derselben Gilde. Der Server ermittelt die tatsächliche aktuelle Gruppe; der Browser liefert nur die Zielkonto-ID. Persönliche Reisen geben keinen Einladungscode preis. Blockierung, Offlinezustand, volle Gruppen, laufende Dungeons, Duelle und die bestehenden Kampf-/Charakterbedingungen verhindern einen unzulässigen Wechsel. Der normale atomare Gruppenwechsel überträgt dieselbe Figur mitsamt Fortschritt und laufenden Zeitbedingungen.

## Gildenchat

Nachrichten sind auf 240 Zeichen begrenzt. Gespeichert werden höchstens die letzten 50 Beiträge je Gilde. Nur aktuelle Mitglieder erhalten ihre Gildenhistorie; nach Austritt oder Entfernung endet dieser Zugriff. Frühere Beiträge dürfen als Historie erhalten bleiben, wenn ihr Verfasser später austritt. Die Darstellung behandelt Namen und Nachrichten als Text.

Der Chat erscheint im geöffneten Gemeinschaftsfenster. Authentifizierte Serverereignisse übertragen neue Zustände, während das normale Spielfeld frei bleibt. Der Server begrenzt Anfragen, Nachrichten und gleichzeitige Gemeinschaftsverbindungen. Langsame Leser dürfen keinen unbegrenzten Ausgabepuffer erzeugen. Logout und ungültige Sitzungen beenden die zugehörige Verbindung.

## Autorität und Speichern

Der versionierte Multiplayer-Checkpoint erhält ein optionales `social`-Feld. Eine V15-Reise ohne dieses Feld beginnt mit leerer Gemeinschaft und behält ihre Figuren. Das Feld enthält nur kanonische Beziehungen, Rollen, Einladungen und begrenzte Historie; Zugangsdaten bleiben im vorhandenen Kontenspeicher. Der tatsächliche Deployment-Validator rekonstruiert dieselbe Serverautorität und muss widersprüchliche Beziehungen ablehnen.

Gemeinschaftsänderungen werden erst nach erfolgreichem atomarem Speichern bestätigt und veröffentlicht. Bei einem Speicherfehler wird der vorherige Zustand wiederhergestellt. Auch ein direkter Kontaktbeitritt verwendet die bestehenden Rücksetzregeln für Gruppenwechsel. Der vorhandene Git-Updater sichert den gesamten privaten Checkpoint vor dem Versionswechsel und nimmt keine öffentlichen Spielerstände als Testdaten.

`/api/account/social` liefert nur die Ansicht des authentifizierten Kontos. POST-Aktionen und `/api/account/social/join` binden zusätzlich die erwartete Konto-ID; der Ereignisstrom bindet sie über seine Query. Das verhindert, dass ein veralteter Tab nach einem Cookiewechsel unbemerkt für ein anderes Konto handelt. Neue Browserdaten dürfen weder Rollen, Besitzer, Gruppenautorität noch Chatverfasser festlegen.

## Weitere Entwicklung

Freundschaften und Gilden machen bestehende Mitspieler wiederauffindbar. Für die vollständige Zielwelt fehlen weiterhin die Architektur einer größeren gemeinsamen Welt, atomarer Spielerhandel, eine geprüfte Wirtschaft, mehr eigenständige langfristige Inhalte und menschliche Langzeitabnahme. Die 200 Stunden aus dem Entwicklungsziel sind weiterhin nicht verifiziert. Die konkrete Funktions-, Browser- und Lastabnahme dieser Version wird im zugehörigen Qualitätsbericht mit ihren tatsächlichen Grenzen dokumentiert.

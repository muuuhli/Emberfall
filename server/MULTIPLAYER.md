# Emberfall Gruppenserver

Der Node-Spielserver simuliert gemeinsame Gegner, Kampf, Ressourcen, Beute und Dungeons. Jeder Gruppencharakter hat eigenes Inventar, Talente und Questfortschritt. Ein Browser übermittelt ausschließlich Tasten, Blickrichtung und benannte Aktionen. Positionen, Schaden, Erfahrung und Gegenstände werden auf dem Server berechnet.

Bis zu acht aktive Spieler können einem Raum über seinen achtstelligen Code beitreten. Die Simulation läuft mit 25 Schritten pro Sekunde; Browser erhalten ungefähr 12,5 Zustandsmeldungen pro Sekunde über Server-Sent Events. Die Darstellung interpoliert Figurenbewegungen zwischen diesen Meldungen. Ein geöffnetes Menü oder ein besiegter Spieler hält die gemeinsame Welt nicht an.

## Spielen im lokalen Netz

Starte im Projektordner `npm run multiplayer`. Alle Mitspieler öffnen `http://IP-DIESES-RECHNERS:4173` in ihrem Browser. Eine Person erstellt über das Gruppenmenü einen Raum und teilt seinen Code; die anderen treten über denselben Server bei. Das Spiel kann auf diesem Rechner außerdem über `http://localhost:4173` geöffnet werden. Ein bereits laufender Einzelspielerserver auf Port 4173 muss vorher beendet werden.

`npm run dev` und `npm start` binden standardmäßig ausschließlich `127.0.0.1`. Der explizite Multiplayer-Befehl setzt `HOST=0.0.0.0`. Eigene Ports sind beispielsweise mit `PORT=4174 npm run multiplayer` möglich. Die lokale Firewall muss Verbindungen der Mitspieler zu diesem Server zulassen.

## Anbindung

`MultiplayerHub` wird in `server.mjs` vor dem Handler für statische Dateien aufgerufen:

```js
const hub = new MultiplayerHub({ storage: createFileRoomStorage(savePath) });
if (await hub.handle(req, res)) return;
```

Die Speicherdatei enthält vertrauliche Sitzungsschlüssel und darf niemals statisch ausgeliefert werden. `createFileRoomStorage` schreibt mit Dateimodus 0600 über eine temporäre Datei und anschließendes Umbenennen. Räume werden alle zehn Sekunden und beim Beitritt/Verlassen gespeichert. Auf dem Server gespeicherte Charaktere können mit ihrem im Browser gespeicherten Sitzungsschlüssel wieder aufgenommen werden. Verlassen und längere Verbindungsunterbrechungen setzen einen Charakter inaktiv; seine Fortschritte bleiben erhalten. Nach einem Serverneustart kehren Dungeon-Gruppen in ihre gespeicherte offene Welt zurück.

Die integrierte Startfunktion `startServer({port,host,storagePath,autoTick})` ist aus `server.mjs` importierbar. Ein Import startet keinen Server. Standardmäßig schreibt die Startfunktion `.emberfall-server/rooms.json`; das HTTP-Routing liefert ausschließlich `index.html`, Browserquellen aus `src/` und Laufzeitbilder bzw. JSON-Manifeste aus `assets/` aus. Serverquellen, gespeicherte Sitzungen, versteckte Dateien, Blenderprojekte und Erzeugungsskripte sind darüber nicht abrufbar. SIGINT und SIGTERM speichern den Hub und schließen seine Verbindungen.

Die Clientintegration erstellt `new NetworkClient(game)`. Bei `network.online` ruft die Hauptschleife `network.update(dt)` und `network.sendInput(game.keys, angle)` auf. Die normale lokale `game.update(dt)`-Simulation bleibt in diesem Modus aus. Inventar-, Kampf-, Quest- und Dungeonmethoden leitet der Client automatisch an den Server weiter. Beim Trennen wird die vorherige Einzelspielerreise wiederhergestellt.

## HTTP-Schnittstelle

| Methode | Pfad | Funktion |
| --- | --- | --- |
| GET | `/api/rooms` | Aktive Gruppen und Klassen anzeigen |
| POST | `/api/rooms` | Raum und neuen Gruppencharakter erstellen |
| POST | `/api/rooms/CODE/join` | Neuen Gruppencharakter hinzufügen |
| GET | `/api/session/TOKEN` | Gespeicherte Sitzung wieder aufnehmen |
| GET | `/api/session/TOKEN/events` | Laufende Zustandsmeldungen |
| POST | `/api/session/TOKEN/command` | Eingaben und Aktionen ausführen |
| POST | `/api/session/TOKEN/leave` | Charakter inaktiv setzen und speichern |

JSON-Befehle sind auf 4096 Bytes begrenzt. Die API akzeptiert standardmäßig nur denselben Browserursprung; ein getrennt gehostetes Frontend benötigt einen ausdrücklich eingetragenen `allowedOrigin` und einen über HTTPS erreichbaren Backendserver. Die Sitzungsschlüssel werden nicht in Gruppenzuständen oder Katalogen angezeigt.

## Reichweite

Ein Server, den alle Browser im selben lokalen Netz erreichen, ermöglicht echtes Gruppenspiel im LAN. Für Spieler über das Internet wird ein öffentlich erreichbarer HTTPS-Node-Server benötigt. Eine statisch auf ChatGPT Sites veröffentlichte Seite stellt diesen Backendserver nicht bereit. Ein HTTPS-Frontend kann zudem keine ungesicherte lokale HTTP-API benutzen. Internet-Hosting, Benutzerkonten, verteilte Server, Matchmaking, Moderation und Betrieb über viele hundert Stunden sind zusätzliche Arbeit; die vorhandenen Netzwerkprüfungen belegen konkrete Mehrspieleraktionen und keine solche Betriebsdauer.

Mit `node --test tests/network.test.js` werden zwei tatsächliche HTTP/SSE-Clients gegen einen ausschließlich auf Loopback geöffneten Testserver geprüft. Die Prüfungen decken gemeinsamen Gegnerschaden und Tod, gemeinsame Quest-/EP-Gutschrift, serverseitige Bewegung, abgewiesene manipulierte Charakterwerte, getrennte Todeszustände, Gruppengrenzen und gespeicherte Sitzungen ab.

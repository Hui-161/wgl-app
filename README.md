# WGL – Was geht Leipzig? (Web-App)

Termine Leipziger Locations: Konzerte, Partys, Theater, Lesungen, Kino.
Läuft im Browser und als Telegram-Mini-App des Bots „WGL – Was geht Leipzig?“.

- Statische Seite (`index.html`, `app.css`, `app.js`), kein Tracking, keine Cookies. Einzige Bibliothek:
  [Leaflet 1.9.4](https://leafletjs.com) für die Karte, im Repo unter `vendor/leaflet/` (BSD-2-Lizenz, Prüfsumme
  des npm-Pakets `sha1 23fae724e282fa25745aff82ca4d394748db7d8d`). Kartenkacheln: © OpenStreetMap-Mitwirkende –
  sie werden erst geladen, wenn man den Reiter „Karte“ öffnet.
- Termine kommen aus `events.json` auf dem Branch **`data`** (wird automatisch alle paar Stunden
  aktualisiert, immer genau ein Commit).
- Einstellungen und Merkliste bleiben auf dem eigenen Gerät (`localStorage`).
- Alle Angaben ohne Gewähr – im Zweifel gilt die Seite der Location.

Lokal testen: `events.json` als `dev-events.json` daneben legen und den Ordner über
`http://localhost` ausliefern (die App lädt dort die lokale Datei).

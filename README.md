# WGL – Was geht Leipzig? (Web-App)

Termine Leipziger Locations: Konzerte, Partys, Theater, Lesungen, Kino.
Läuft im Browser und als Telegram-Mini-App des Bots „WGL – Was geht Leipzig?“.

- Statische Seite (`index.html`, `app.css`, `app.js`), keine Fremdbibliotheken, kein Tracking, keine Cookies.
- Termine kommen aus `events.json` auf dem Branch **`data`** (wird automatisch alle paar Stunden
  aktualisiert, immer genau ein Commit).
- Einstellungen und Merkliste bleiben auf dem eigenen Gerät (`localStorage`).
- Alle Angaben ohne Gewähr – im Zweifel gilt die Seite der Location.

Lokal testen: `events.json` als `dev-events.json` daneben legen und den Ordner über
`http://localhost` ausliefern (die App lädt dort die lokale Datei).

# Spritfinder

Einmal tippen, in Google Maps landen, losfahren. Keine Werbung, kein Konto, keine Abhängigkeiten.

- Findet den Standort per GPS
- Zeigt nur **geöffnete** Tankstellen mit dem gewählten Kraftstoff (E10 · Super E5 · Diesel) und aktuellem Preis
- Sucht zuerst im Umkreis von **5 km**, erweitert bei Bedarf automatisch auf 10 → 25 → 50 km
- Sortierung nach Entfernung oder Preis, die **günstigste** ist markiert
- Ein Tipp auf die Tankstelle startet die Route in **Google Maps**
- Läuft als Web-App (PWA) auf dem iPhone-Homescreen

## Datenquellen

| Land | Quelle | Key |
|---|---|---|
| Deutschland | [Tankerkönig](https://creativecommons.tankerkoenig.de) (MTS-K) | kostenloser API-Key, in der App unter ⚙ eintragen |
| Österreich | [E-Control Spritpreisrechner](https://api.e-control.at/sprit/1.0/doc) | keiner |
| Schweiz, Italien | – (keine offene Live-API mit Öffnungsstatus angebunden) | – |

Alle aktiven Quellen werden parallel abgefragt und zusammengeführt. E-Control kennt kein E10, sondern „Super 95“ – das wird in der Karte dann als Zusatz angezeigt. Unter ⚙ gibt es ausserdem **Demo-Daten** zum Ausprobieren ohne Key (auch via `?demo`).

Der API-Key wird nur im `localStorage` des Geräts gespeichert und nur an die Tankerkönig-API gesendet.

## Lokal starten

```sh
npm start        # http://localhost:8080
npm test         # Unit-Tests der Logik (node:test, keine Dependencies)
```

Die Standortabfrage funktioniert nur über **HTTPS** oder `localhost`.

## Aufs iPhone

1. Ordnerinhalt auf einem HTTPS-Hosting bereitstellen (z. B. GitHub Pages, Netlify, Cloudflare Pages – alle Pfade sind relativ).
2. In Safari öffnen → Teilen → **Zum Home-Bildschirm**.
3. Beim ersten Start Standortzugriff erlauben und unter ⚙ den Tankerkönig-Key eintragen.

## Aufbau

| Datei | Inhalt |
|---|---|
| `core.js` | reine Logik: Distanz, Normalisierung der API-Antworten, Filter, Sortierung, Maps-Link |
| `providers.js` | Datenquellen (Tankerkönig, E-Control, Demo), parallele Abfrage, Cache der Rohdaten |
| `app.js` | UI, Standort, Radius-Erweiterung, Einstellungen |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA-Hülle (nur die App-Dateien werden gecacht, Preise nie) |

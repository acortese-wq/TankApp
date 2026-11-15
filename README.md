# Spritfinder (Schweiz)

Einmal tippen, in Google Maps landen, losfahren. Keine Werbung, kein Konto, keine Abhängigkeiten.

- Findet den Standort per GPS
- Zeigt nur **geöffnete** Tankstellen mit dem gewählten Kraftstoff (Bleifrei 95 · Bleifrei 98 · Diesel) und dem aktuellen Preis in CHF – inklusive Alter der Preisangabe
- Sucht zuerst im Umkreis von **5 km**, erweitert bei Bedarf automatisch auf 10 → 25 → 50 km
- Sortierung nach Entfernung oder Preis, die **günstigste** ist markiert
- Ein Tipp auf die Tankstelle startet die Route in **Google Maps** (mit der Place-ID der Tankstelle)
- Läuft als Web-App (PWA) auf dem iPhone-Homescreen, im iOS-Look (Hell/Dunkel, Dynamic Type, Bottom Sheet, Pull-to-Refresh)
- Zeigt beim Start sofort den letzten Stand (auch ohne Netz) und aktualisiert im Hintergrund
- Verständliche Fehlermeldungen (falscher Key, API nicht aktiviert, Referrer-Beschränkung, kein Netz)

E10 wird in der Schweiz nicht verkauft; Standard ist Bleifrei 95.

## Datenquelle: Google Maps

Preise, Öffnungsstatus und Preis-Zeitstempel kommen aus der **Places API (New)** (`places:searchNearby`, Feld `fuelOptions`). Das sind dieselben Preise, die Google Maps anzeigt.

Einrichten:

1. In der [Google Cloud Console](https://console.cloud.google.com) ein Projekt anlegen, **Places API (New)** aktivieren, Abrechnung hinterlegen (Google gewährt ein monatliches Gratiskontingent; `fuelOptions` gehört zu einer höheren Preisstufe – Kosten im Blick behalten und ein Budget-Limit setzen).
2. API-Key erstellen und **beschränken**: Anwendungsbeschränkung *HTTP-Referrer* auf die Adresse, unter der die App liegt, und API-Beschränkung auf *Places API (New)*. Der Key steckt im Browser und ist sonst für jeden einsehbar.
3. In der App unter ⚙ eintragen. Der Key bleibt im `localStorage` des Geräts.

Grenzen:

- Nearby Search liefert **maximal 20 Treffer**, nach Entfernung sortiert. In dichten Gebieten kann eine Tankstelle mit Preis ausserhalb der 20 nächsten liegen und fehlt dann.
- Google zeigt nicht für jede Tankstelle einen Preis. Ohne Preis wird eine Station nicht gelistet.
- Fehlt der Öffnungsstatus, wird die Station gelistet und mit «Öffnungszeiten unbekannt» vermerkt.

Unter ⚙ gibt es ausserdem **Demo-Daten** zum Ausprobieren ohne Key (auch via `?demo`).

## Lokal starten

```sh
npm start        # http://localhost:8080
npm test         # Unit-Tests der Logik (node:test, keine Dependencies)
```

Die Standortabfrage funktioniert nur über **HTTPS** oder `localhost`.

## Aufs iPhone

Die App wird über **GitHub Pages** ausgeliefert (HTTPS, nötig für den Standort):

`https://acortese-wq.github.io/TankApp/`

1. In Safari öffnen → Teilen → **Zum Home-Bildschirm**.
2. App vom Homescreen starten, Standort erlauben.
3. Der Einrichtungsassistent führt durch die Google-Einrichtung (Key erstellen, einfügen, verbinden). Danach ist alles erledigt.

Hinweis: Safari und die Homescreen-App haben **getrennte Speicher**. Den Key also in der Homescreen-App einfügen, nicht in Safari.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` führt bei jedem Pull Request die Tests aus und veröffentlicht bei jedem Push auf `main` automatisch. Der Cache-Name des Service Workers wird pro Commit gesetzt, Updates kommen so von selbst auf dem iPhone an.

Einmalig im Repository: **Settings → Pages → Source: GitHub Actions**.

## Aufbau

| Datei | Inhalt |
|---|---|
| `core.js` | reine Logik: Distanz, Normalisierung der Places-Antwort, Filter, Sortierung, Maps-Link |
| `providers.js` | Google-Places-Abfrage, Demo-Daten, Cache der Rohdaten |
| `app.js` | UI, Standort, Radius-Erweiterung, Einstellungen |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA-Hülle (nur die App-Dateien werden gecacht, Preise nie) |

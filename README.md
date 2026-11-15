# Aktionen

Schneller Einstieg zu den Wochenaktionen bei Coop, Migros, Denner und Co. – als Web-App für den iPhone-Homescreen, im iOS-Look (Hell/Dunkel, Dynamic Type). Keine Werbung, kein Konto, keine Abhängigkeiten.

**Wichtig:** Die App ist eine **inoffizielle Verknüpfung** zu [aktionis.ch](https://www.aktionis.ch) (CouponPlus AG). Sie **kopiert keine Inhalte** – alle Angebote, Texte und Bilder bleiben auf aktionis.ch. Laut dessen [Nutzungsbedingungen](https://www.aktionis.ch/terms) braucht die Vervielfältigung von Inhalten die schriftliche Zustimmung der Rechteinhaberin. Deshalb gibt es hier nur Links.

## Funktionen

- **Suche:** Produkt eintippen, Return → Treffer auf aktionis.ch
- **Aktionen in meiner Nähe:** öffnet aktionis.ch mit Standortfilter
- **Anbieter:** Coop, Migros, Denner, ALDI Suisse, Lidl, Volg, SPAR, OTTO'S, Coop Megastore
- **Kategorien:** Backwaren, Bio, Fleisch, Getränke, Kaffee/Tee …
- **Meine Suchen:** Suchbegriffe mit dem Lesezeichen-Symbol merken (nur auf deinem Gerät), per «Bearbeiten» löschen
- **Mein Aktionis:** Direktlinks zu Merkliste und Alarm (gehören zu deinem Konto auf aktionis.ch)

Alle Links öffnen aktionis.ch in einem neuen Tab. Gespeichert werden ausschliesslich deine Suchbegriffe, im `localStorage` des Geräts.

## Lokal starten

```sh
npm start        # http://localhost:8080
npm test         # Unit-Tests der Logik (node:test, keine Dependencies)
```

## Aufs iPhone

Die App wird über **GitHub Pages** ausgeliefert: `https://acortese-wq.github.io/TankApp/`

1. In Safari öffnen → Teilen → **Zum Home-Bildschirm**.
2. Fertig. Es ist keine Einrichtung nötig.

## Deployment (GitHub Pages)

`.github/workflows/pages.yml` führt bei jedem Pull Request die Tests aus und veröffentlicht bei jedem Push auf `main` automatisch. Der Cache-Name des Service Workers wird pro Commit gesetzt, Updates kommen so von selbst auf dem iPhone an.

Einmalig im Repository: **Settings → Pages → Source: GitHub Actions**.

## Ausbau mit Zustimmung

Eine eigene Darstellung der Angebote (Preise, Rabatte, Bilder) wäre möglich, sobald die CouponPlus AG einen Feed oder eine Schnittstelle freigibt. Ohne diese Zustimmung bleibt es bei Links.

## Aufbau

| Datei | Inhalt |
|---|---|
| `core.js` | reine Logik: Link-Bau für aktionis.ch, Anbieter/Kategorien, Verwaltung der eigenen Suchbegriffe |
| `app.js` | UI und Speicher |
| `sw.js`, `manifest.webmanifest`, `icons/` | PWA-Hülle (nur die App-Dateien werden gecacht) |

## Verlauf

Aus diesem Repository ging zuvor der «Spritfinder» (Schweizer Tankstellen-Preise über Google Maps) hervor. Er ist in der Git-Historie erhalten (Pull Request #1).

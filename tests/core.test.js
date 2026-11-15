import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cheapest, formatAge, formatDelta, formatDistance, formatPrice, friendlyError, haversineKm, mapsUrl, moneyToNumber,
  normalizeGooglePlaces, selectStations, sortStations,
} from '../core.js';

const origin = { lat: 47.3769, lng: 8.5417 }; // Zürich
const north = (km) => ({ latitude: origin.lat + km / 111.2, longitude: origin.lng });
const chf = (v) => ({ currencyCode: 'CHF', units: String(Math.floor(v)), nanos: Math.round((v % 1) * 1e9) });

test('haversine: 1° Breite ≈ 111 km', () => {
  assert.ok(Math.abs(haversineKm(47, 9, 48, 9) - 111.2) < 0.5);
});

test('moneyToNumber: units als String + nanos', () => {
  assert.equal(moneyToNumber({ currencyCode: 'CHF', units: '1', nanos: 859000000 }), 1.859);
  assert.equal(moneyToNumber({ units: '2' }), 2);
  assert.equal(moneyToNumber(undefined), null);
  assert.equal(moneyToNumber({ units: '0', nanos: 0 }), null);
});

test('Google Places: Kraftstoff-Mapping, Preis-Alter, offen/unbekannt, ohne Preis', () => {
  const json = {
    places: [
      {
        id: 'P1', displayName: { text: 'Migrol Service' }, shortFormattedAddress: 'Hardstrasse 1, Zürich',
        location: north(2), currentOpeningHours: { openNow: true },
        fuelOptions: { fuelPrices: [
          { type: 'SP95', price: chf(1.859), updateTime: '2026-11-15T10:00:00Z' },
          { type: 'SP98', price: chf(1.999), updateTime: '2026-11-15T10:00:00Z' },
          { type: 'DIESEL', price: chf(1.929), updateTime: '2026-11-15T09:00:00Z' },
        ] },
      },
      { id: 'P2', displayName: { text: 'Ohne Preis' }, location: north(1), currentOpeningHours: { openNow: true } },
      { id: 'P3', displayName: { text: 'Zu' }, location: north(1.5), currentOpeningHours: { openNow: false }, fuelOptions: { fuelPrices: [{ type: 'SP95', price: chf(1.7) }] } },
      { id: 'P4', displayName: { text: 'Unbekannt' }, location: north(3), fuelOptions: { fuelPrices: [{ type: 'REGULAR_UNLEADED', price: chf(1.8) }] } },
      { id: 'P5', displayName: { text: 'Ohne Ort' } },
    ],
  };
  const b95 = normalizeGooglePlaces(json, origin, 'b95');
  assert.equal(b95.length, 4, 'Stationen ohne Koordinaten fallen raus');
  assert.equal(b95[0].price, 1.859);
  assert.equal(b95[0].address, 'Hardstrasse 1, Zürich');
  assert.equal(b95[0].updatedAt, Date.parse('2026-11-15T10:00:00Z'));
  assert.equal(b95[0].openKnown, true);
  assert.equal(b95[1].price, null);
  assert.equal(b95[2].isOpen, false);
  assert.equal(b95[3].isOpen, true, 'unbekannte Öffnungszeit zählt als offen');
  assert.equal(b95[3].openKnown, false);
  assert.equal(b95[3].price, 1.8, 'REGULAR_UNLEADED wird als Bleifrei 95 erkannt');
  assert.equal(normalizeGooglePlaces(json, origin, 'b98')[0].price, 1.999);
  assert.equal(normalizeGooglePlaces(json, origin, 'diesel')[0].price, 1.929);
  assert.deepEqual(normalizeGooglePlaces({}, origin, 'b95'), []);
  assert.throws(() => normalizeGooglePlaces(null, origin, 'b95'));
});

test('Google Places: bei mehreren Preisen gewinnt der aktuellere', () => {
  const json = { places: [{ id: 'X', location: north(1), fuelOptions: { fuelPrices: [
    { type: 'SP95', price: chf(1.9), updateTime: '2026-11-14T08:00:00Z' },
    { type: 'REGULAR_UNLEADED', price: chf(1.85), updateTime: '2026-11-15T08:00:00Z' },
  ] } }] };
  assert.equal(normalizeGooglePlaces(json, origin, 'b95')[0].price, 1.85);
});

const mk = (id, km, price, isOpen = true) => ({ id, distKm: km, price, isOpen });

test('selectStations: nur offen, mit Preis, im Radius, ohne Duplikate', () => {
  const all = [mk('a', 3, 1.8), mk('a', 3, 1.8), mk('b', 4, 1.7, false), mk('c', 6, 1.6), mk('d', 2, null)];
  assert.deepEqual(selectStations(all, 5).map((s) => s.id), ['a']);
  assert.deepEqual(selectStations(all, 10).map((s) => s.id), ['a', 'c']);
});

test('sortStations / cheapest: Preis mit Entfernung als Tiebreaker', () => {
  const l = [mk('far', 4, 1.7), mk('near', 1, 1.8), mk('mid', 2, 1.7)];
  assert.deepEqual(sortStations(l, 'dist').map((s) => s.id), ['near', 'mid', 'far']);
  assert.deepEqual(sortStations(l, 'price').map((s) => s.id), ['mid', 'far', 'near']);
  assert.equal(cheapest(l).id, 'mid');
  assert.equal(cheapest([]), null);
});

test('Formatierung, Preis-Alter & Maps-Link', () => {
  assert.equal(formatPrice(1.859), '1,859');
  assert.equal(formatPrice(1.8), '1,800');
  assert.equal(formatDistance(0.04), '100 m');
  assert.equal(formatDistance(0.46), '500 m');
  assert.equal(formatDistance(1.26), '1,3 km');
  const now = Date.parse('2026-11-15T12:00:00Z');
  assert.equal(formatAge(now - 30_000, now), 'gerade eben');
  assert.equal(formatAge(now - 25 * 60_000, now), 'vor 25 Min.');
  assert.equal(formatAge(now - 3 * 3600_000, now), 'vor 3 Std.');
  assert.equal(formatAge(now - 3 * 86400_000, now), 'vor 3 Tagen');
  assert.equal(formatAge(null, now), null);
  assert.equal(
    mapsUrl({ lat: 47.1, lng: 9.2, placeId: 'ChIJabc' }),
    'https://www.google.com/maps/dir/?api=1&destination=47.1%2C9.2&travelmode=driving&destination_place_id=ChIJabc',
  );
  assert.equal(mapsUrl({ lat: 47.1, lng: 9.2 }), 'https://www.google.com/maps/dir/?api=1&destination=47.1%2C9.2&travelmode=driving');
});

test('formatDelta: Rappen-Abstand zur günstigsten', () => {
  assert.equal(formatDelta(1.879, 1.819), '+6 Rp.');
  assert.equal(formatDelta(1.819, 1.819), null);
  assert.equal(formatDelta(1.8196, 1.819), null);
});

test('friendlyError: übersetzt typische Fehler', () => {
  const p = 'https://x.github.io/TankApp/*';
  assert.match(friendlyError('HTTP 403: Requests from referer https://evil are blocked.', { pattern: p }), /andere Web-Adresse.*TankApp\/\*/);
  assert.match(friendlyError('HTTP 400: API key not valid. Please pass a valid API key.'), /ungültig/);
  assert.match(friendlyError('HTTP 403: Places API (New) has not been used in project 123 before or it is disabled.'), /noch nicht aktiviert/);
  assert.match(friendlyError('HTTP 403: This API method requires billing to be enabled.'), /Abrechnung/);
  assert.match(friendlyError('HTTP 429: Quota exceeded'), /Kontingent/);
  assert.match(friendlyError('Load failed'), /Keine Verbindung/);
  assert.match(friendlyError('HTTP 500: kaputt'), /Google Maps meldet: HTTP 500/);
});

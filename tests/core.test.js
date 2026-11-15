import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cheapest, formatDistance, formatPrice, haversineKm, mapsUrl,
  normalizeEControl, normalizeTankerkoenig, selectStations, sortStations,
} from '../core.js';

const origin = { lat: 47.0, lng: 9.0 };
const at = (km) => ({ lat: 47.0 + km / 111.2, lng: 9.0 }); // km nördlich

test('haversine: 1° Breite ≈ 111 km', () => {
  assert.ok(Math.abs(haversineKm(47, 9, 48, 9) - 111.2) < 0.5);
});

test('Tankerkönig: normalisiert, ignoriert fehlende Preise (false) und Stationen ohne Koordinaten', () => {
  const json = {
    ok: true,
    stations: [
      { id: 'a', brand: 'ARAL', name: 'Aral X', street: 'Hauptstr.', houseNumber: '1', postCode: 80331, place: 'München', ...at(2), e10: 1.859, e5: 1.9, diesel: 1.7, isOpen: true },
      { id: 'b', brand: '', name: 'Frei', ...at(1), e10: false, isOpen: true },
      { id: 'c', name: 'Ohne Koordinaten', e10: 1.8, isOpen: true },
    ],
  };
  const out = normalizeTankerkoenig(json, origin, 'e10');
  assert.equal(out.length, 2);
  assert.equal(out[0].price, 1.859);
  assert.equal(out[0].street, 'Hauptstr. 1');
  assert.equal(out[0].place, '80331 München');
  assert.equal(out[1].price, null);
  assert.equal(out[1].brand, 'Frei');
  assert.ok(Math.abs(out[0].distKm - 2) < 0.05);
  assert.throws(() => normalizeTankerkoenig({ ok: false, message: 'apikey nicht angegeben' }, origin, 'e10'), /apikey/);
});

test('E-Control: wählt SUP/DIE, übernimmt Label und Offen-Status', () => {
  const list = [
    { id: 7, name: 'OMV Test', open: true, location: { address: 'Hauptplatz 3', postalCode: '6020', city: 'Innsbruck', latitude: at(3).lat, longitude: at(3).lng },
      prices: [{ fuelType: 'SUP', amount: 1.549, label: 'Super 95' }, { fuelType: 'DIE', amount: 1.499, label: 'Diesel' }] },
    { id: 8, name: 'Zu', open: false, location: { latitude: at(1).lat, longitude: at(1).lng }, prices: [] },
  ];
  const e10 = normalizeEControl(list, origin, 'e10');
  assert.equal(e10[0].price, 1.549);
  assert.equal(e10[0].fuelLabel, 'Super 95');
  assert.equal(e10[1].isOpen, false);
  assert.equal(normalizeEControl(list, origin, 'diesel')[0].price, 1.499);
  assert.throws(() => normalizeEControl({}, origin, 'e10'));
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

test('Formatierung & Maps-Link', () => {
  assert.equal(formatPrice(1.859), '1,859');
  assert.equal(formatPrice(1.8), '1,800');
  assert.equal(formatDistance(0.04), '100 m');
  assert.equal(formatDistance(0.46), '500 m');
  assert.equal(formatDistance(1.26), '1,3 km');
  assert.equal(mapsUrl({ lat: 47.1, lng: 9.2 }), 'https://www.google.com/maps/dir/?api=1&destination=47.1%2C9.2&travelmode=driving');
});

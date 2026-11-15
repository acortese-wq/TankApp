// Datenquellen. Jede liefert normalisierte Stationen (siehe core.js).
import { normalizeGooglePlaces } from './core.js';

const TIMEOUT_MS = 12000;
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.shortFormattedAddress',
  'places.location',
  'places.currentOpeningHours.openNow',
  'places.fuelOptions',
].join(',');

async function postJson(url, { headers, body, signal }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.json())?.error?.message || '';
      } catch {
        /* kein JSON */
      }
      throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// Google Maps – Places API (New), Nearby Search. Liefert max. 20 Treffer, nach Entfernung sortiert.
const google = {
  name: 'Google Maps',
  enabled: (s) => Boolean(s.googleKey && s.googleKey.trim()),
  cacheKey: ({ origin, radiusKm }) => `g|${origin.lat}|${origin.lng}|${radiusKm}`, // Rohdaten enthalten alle Kraftstoffe
  normalize: (raw, { origin, fuel }) => normalizeGooglePlaces(raw, origin, fuel),
  fetch({ origin, radiusKm, settings, signal }) {
    return postJson(PLACES_URL, {
      signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': settings.googleKey.trim(),
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: {
        includedTypes: ['gas_station'],
        maxResultCount: 20,
        rankPreference: 'DISTANCE',
        languageCode: 'de',
        regionCode: 'CH',
        locationRestriction: {
          circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius: radiusKm * 1000 },
        },
      },
    });
  },
};

// Demo-Daten zum Ausprobieren ohne Netzwerk/Key (Rohdaten im Places-Format)
const demo = {
  name: 'Demo',
  enabled: (s) => Boolean(s.demo),
  cacheKey: ({ origin }) => `demo|${origin.lat}|${origin.lng}`,
  normalize: (raw, { origin, fuel }) => normalizeGooglePlaces(raw, origin, fuel),
  async fetch({ origin }) {
    const brands = ['Migrol', 'Coop Pronto', 'Avia', 'Shell', 'BP', 'Agrola', 'Tamoil', 'Socar', 'Eni', 'Esso'];
    const base = { SP95: 1.78, SP98: 1.93, DIESEL: 1.82 };
    let seed = Math.round(origin.lat * 1000) ^ Math.round(origin.lng * 1000);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    const money = (v) => ({ currencyCode: 'CHF', units: String(Math.floor(v)), nanos: Math.round((v % 1) * 1e9) });
    return {
      places: brands.map((brand, i) => {
        const dist = 0.5 + rnd() * 8.5;
        const ang = rnd() * 2 * Math.PI;
        const updated = new Date(Date.now() - Math.round(rnd() * 36e5 * 20)).toISOString();
        return {
          id: `demo-${i}`,
          displayName: { text: brand },
          shortFormattedAddress: `Demostrasse ${i + 1}, Demo-Ort`,
          location: {
            latitude: origin.lat + (dist / 111.2) * Math.sin(ang),
            longitude: origin.lng + (dist / (111.2 * Math.cos((origin.lat * Math.PI) / 180))) * Math.cos(ang),
          },
          currentOpeningHours: { openNow: i % 4 !== 3 }, // jede vierte ist geschlossen
          fuelOptions: {
            fuelPrices: Object.entries(base).map(([type, v]) => ({
              type,
              price: money(Math.round((v + (rnd() - 0.5) * 0.2) * 1000) / 1000),
              updateTime: updated,
            })),
          },
        };
      }),
    };
  },
};

export const PROVIDERS = [google, demo];

/**
 * Fragt alle aktiven Quellen parallel ab. Teilausfälle werden in `errors` gemeldet,
 * solange mindestens eine Quelle antwortet.
 */
export async function fetchAll({ origin, radiusKm, fuel, settings, signal, cache }) {
  const active = PROVIDERS.filter((p) => p.enabled(settings));
  const ctx = { origin, radiusKm, fuel, settings, signal };
  const results = await Promise.allSettled(
    active.map(async (p) => {
      const key = p.cacheKey(ctx);
      if (!cache.has(key)) cache.set(key, await p.fetch(ctx));
      return p.normalize(cache.get(key), ctx); // Cache hält Rohdaten; Preis hängt vom gewählten Kraftstoff ab
    }),
  );
  const stations = [];
  const errors = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') stations.push(...r.value);
    else if (!signal?.aborted) errors.push({ source: active[i].name, message: r.reason?.message || 'Fehler' });
  });
  return { stations, errors, activeCount: active.length };
}

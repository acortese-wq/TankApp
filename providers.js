// Datenquellen. Jede liefert normalisierte Stationen (siehe core.js).
import { ECONTROL_FUEL, normalizeEControl, normalizeTankerkoenig, haversineKm } from './core.js';

const TIMEOUT_MS = 12000;

async function getJson(url, signal) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

// Deutschland – braucht einen kostenlosen API-Key (creativecommons.tankerkoenig.de)
const tankerkoenig = {
  name: 'Tankerkönig',
  enabled: (s) => Boolean(s.tankerkoenigKey && s.tankerkoenigKey.trim()),
  cacheKey: ({ origin, radiusKm }) => `tk|${origin.lat}|${origin.lng}|${Math.min(radiusKm, 25)}`, // type=all → kraftstoffunabhängig
  normalize: (raw, { origin, fuel }) => normalizeTankerkoenig(raw, origin, fuel),
  async fetch({ origin, radiusKm, settings, signal }) {
    const r = Math.min(radiusKm, 25); // API-Maximum
    const url =
      'https://creativecommons.tankerkoenig.de/json/list.php' +
      `?lat=${origin.lat}&lng=${origin.lng}&rad=${r}&type=all` +
      `&apikey=${encodeURIComponent(settings.tankerkoenigKey.trim())}`;
    return getJson(url, signal);
  },
};

// Österreich – offen, kein Key. Liefert die nächstgelegenen Stationen (kein Radius-Parameter).
const econtrol = {
  name: 'E-Control',
  enabled: (s) => s.econtrol !== false,
  cacheKey: ({ origin, fuel }) => `ec|${origin.lat}|${origin.lng}|${ECONTROL_FUEL[fuel]}`,
  normalize: (raw, { origin, fuel }) => normalizeEControl(raw, origin, fuel),
  async fetch({ origin, fuel, signal }) {
    const url =
      'https://api.e-control.at/sprit/1.0/search/gas-stations/by-address' +
      `?latitude=${origin.lat}&longitude=${origin.lng}` +
      `&fuelType=${ECONTROL_FUEL[fuel]}&includeClosed=false`;
    return getJson(url, signal);
  },
};

// Demo-Daten zum Ausprobieren ohne Netzwerk/Key
const demo = {
  name: 'Demo',
  enabled: (s) => Boolean(s.demo),
  cacheKey: ({ origin, fuel }) => `demo|${origin.lat}|${origin.lng}|${fuel}`,
  normalize: (raw) => raw,
  async fetch({ origin, fuel }) {
    const brands = ['Aral', 'Shell', 'OMV', 'Agip', 'Avia', 'BP', 'Esso', 'Jet', 'Eni', 'Total'];
    const base = { e10: 1.79, e5: 1.86, diesel: 1.69 }[fuel];
    let seed = Math.round(origin.lat * 1000) ^ Math.round(origin.lng * 1000);
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    return brands.flatMap((brand, i) => {
      const dist = 0.5 + rnd() * 8.5;
      const ang = rnd() * 2 * Math.PI;
      const lat = origin.lat + (dist / 111.2) * Math.sin(ang);
      const lng = origin.lng + (dist / (111.2 * Math.cos((origin.lat * Math.PI) / 180))) * Math.cos(ang);
      return [
        {
          id: `demo:${i}`,
          source: 'Demo',
          brand,
          name: brand,
          street: `Demostrasse ${i + 1}`,
          place: 'Demo-Ort',
          lat,
          lng,
          distKm: haversineKm(origin.lat, origin.lng, lat, lng),
          price: Math.round((base + (rnd() - 0.5) * 0.2) * 1000) / 1000,
          fuelLabel: fuel.toUpperCase(),
          isOpen: i % 4 !== 3, // jede vierte ist geschlossen
        },
      ];
    });
  },
};

export const PROVIDERS = [tankerkoenig, econtrol, demo];

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

// Reine Logik ohne DOM/Netzwerk – testbar mit `node --test`.

export const RADII = [5, 10, 25, 50]; // km, wird der Reihe nach erweitert
export const FUELS = { e10: 'E10', e5: 'Super E5', diesel: 'Diesel' };

const EARTH_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_KM * Math.asin(Math.sqrt(a));
}

const price = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const coord = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function station(base, origin) {
  const lat = coord(base.lat);
  const lng = coord(base.lng);
  if (lat === null || lng === null) return null;
  return { ...base, lat, lng, distKm: haversineKm(origin.lat, origin.lng, lat, lng) };
}

// ---- Tankerkönig (DE) -------------------------------------------------------
// GET /json/list.php?type=all  →  { ok, stations:[{id,name,brand,street,houseNumber,
//   postCode,place,lat,lng,dist,e5,e10,diesel,isOpen}] }
export function normalizeTankerkoenig(json, origin, fuel) {
  if (!json || json.ok !== true) {
    throw new Error((json && json.message) || 'ungültige Antwort');
  }
  return (json.stations || [])
    .map((s) =>
      station(
        {
          id: `tk:${s.id}`,
          source: 'Tankerkönig',
          brand: s.brand || s.name || 'Tankstelle',
          name: s.name || '',
          street: [s.street, s.houseNumber].filter(Boolean).join(' '),
          place: [s.postCode, s.place].filter(Boolean).join(' '),
          lat: s.lat,
          lng: s.lng,
          price: price(s[fuel]),
          fuelLabel: FUELS[fuel],
          isOpen: s.isOpen === true,
        },
        origin,
      ),
    )
    .filter(Boolean);
}

// ---- E-Control (AT) ---------------------------------------------------------
// E-Control kennt SUP (Super 95), DIE (Diesel), GAS (Erdgas).
export const ECONTROL_FUEL = { e10: 'SUP', e5: 'SUP', diesel: 'DIE' };

export function normalizeEControl(list, origin, fuel) {
  if (!Array.isArray(list)) throw new Error('ungültige Antwort');
  const code = ECONTROL_FUEL[fuel];
  return list
    .map((s) => {
      const loc = s.location || {};
      const p = (s.prices || []).find((x) => x.fuelType === code);
      return station(
        {
          id: `ec:${s.id}`,
          source: 'E-Control',
          brand: s.name || 'Tankstelle',
          name: s.name || '',
          street: loc.address || '',
          place: [loc.postalCode, loc.city].filter(Boolean).join(' '),
          lat: loc.latitude,
          lng: loc.longitude,
          price: price(p && p.amount),
          fuelLabel: (p && p.label) || (code === 'DIE' ? 'Diesel' : 'Super 95'),
          isOpen: s.open !== false,
        },
        origin,
      );
    })
    .filter(Boolean);
}

// ---- Auswahl / Sortierung ---------------------------------------------------
export function selectStations(all, radiusKm) {
  const seen = new Set();
  return all.filter((s) => {
    if (seen.has(s.id)) return false;
    seen.add(s.id);
    return s.isOpen && s.price !== null && s.distKm <= radiusKm;
  });
}

export function sortStations(list, mode) {
  const byDist = (a, b) => a.distKm - b.distKm;
  const byPrice = (a, b) => a.price - b.price || byDist(a, b);
  return [...list].sort(mode === 'price' ? byPrice : byDist);
}

export function cheapest(list) {
  return list.length ? sortStations(list, 'price')[0] : null;
}

// ---- Formatierung / Links ---------------------------------------------------
export function formatPrice(p) {
  return p.toFixed(3).replace('.', ',');
}

export function formatDistance(km) {
  if (km < 1) return `${Math.max(100, Math.round(km * 10) * 100)} m`;
  return `${km.toFixed(1).replace('.', ',')} km`;
}

export function mapsUrl(s) {
  const dest = `${s.lat},${s.lng}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

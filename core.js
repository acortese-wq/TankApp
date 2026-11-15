// Reine Logik ohne DOM/Netzwerk – testbar mit `node --test`.

export const RADII = [5, 10, 25, 50]; // km, wird der Reihe nach erweitert (Places-Maximum: 50 km)
export const FUELS = { b95: 'Bleifrei 95', b98: 'Bleifrei 98', diesel: 'Diesel' };

// Google Places `fuelOptions.fuelPrices[].type` je Kraftstoff (Reihenfolge = Priorität)
export const GOOGLE_FUEL_TYPES = {
  b95: ['SP95', 'REGULAR_UNLEADED'],
  b98: ['SP98', 'PREMIUM'],
  diesel: ['DIESEL'],
};

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

// Google `Money`: { currencyCode, units: "1", nanos: 859000000 }
export function moneyToNumber(m) {
  if (!m) return null;
  const v = Number(m.units || 0) + (m.nanos || 0) / 1e9;
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null;
}

// ---- Google Places API (New): places:searchNearby ---------------------------------
// FieldMask: places.id,places.displayName,places.formattedAddress,places.shortFormattedAddress,
//            places.location,places.currentOpeningHours.openNow,places.fuelOptions
export function normalizeGooglePlaces(json, origin, fuel) {
  if (!json || typeof json !== 'object') throw new Error('ungültige Antwort');
  const types = GOOGLE_FUEL_TYPES[fuel];
  return (json.places || [])
    .map((p) => {
      const lat = p.location?.latitude;
      const lng = p.location?.longitude;
      if (typeof lat !== 'number' || typeof lng !== 'number') return null;

      // passende Preise des Kraftstoffs; bei mehreren der aktuellste, sonst nach Priorität
      const matches = (p.fuelOptions?.fuelPrices || [])
        .filter((fp) => types.includes(fp.type) && moneyToNumber(fp.price) !== null)
        .sort((a, b) => (Date.parse(b.updateTime) || 0) - (Date.parse(a.updateTime) || 0) || types.indexOf(a.type) - types.indexOf(b.type));
      const best = matches[0];
      const openNow = p.currentOpeningHours?.openNow;

      return {
        id: `g:${p.id}`,
        placeId: p.id,
        source: 'Google Maps',
        brand: p.displayName?.text || 'Tankstelle',
        address: p.shortFormattedAddress || p.formattedAddress || '',
        lat,
        lng,
        distKm: haversineKm(origin.lat, origin.lng, lat, lng),
        price: best ? moneyToNumber(best.price) : null,
        updatedAt: best?.updateTime ? Date.parse(best.updateTime) || null : null,
        isOpen: openNow !== false, // unbekannt (undefined) zählt als offen, wird in der Karte vermerkt
        openKnown: typeof openNow === 'boolean',
      };
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

export function formatAge(updatedAt, now = Date.now()) {
  if (!updatedAt) return null;
  const min = Math.max(0, Math.round((now - updatedAt) / 60000));
  if (min < 2) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} Std.`;
  const d = Math.round(h / 24);
  return d === 1 ? 'vor 1 Tag' : `vor ${d} Tagen`;
}

export function mapsUrl(s) {
  const params = new URLSearchParams({ api: '1', destination: `${s.lat},${s.lng}`, travelmode: 'driving' });
  if (s.placeId) params.set('destination_place_id', s.placeId);
  return `https://www.google.com/maps/dir/?${params}`;
}

// Abstand zur günstigsten Tankstelle in Rappen, z. B. "+6 Rp." (null bei < 1 Rp.)
export function formatDelta(price, bestPrice) {
  const rp = Math.round((price - bestPrice) * 100);
  return rp >= 1 ? `+${rp} Rp.` : null;
}

// Übersetzt technische API-/Netzwerkfehler in verständliche Hinweise.
export function friendlyError(message, { pattern = 'deine Web-Adresse' } = {}) {
  const m = String(message || '');
  if (/referer|referrer/i.test(m))
    return `Der Key ist auf eine andere Web-Adresse beschränkt. Erlaube in der Google Cloud Console unter «Websites» das Muster ${pattern}`;
  if (/API key not valid|API_KEY_INVALID|keyInvalid/i.test(m))
    return 'Der Key ist ungültig. Bitte prüfe, ob er vollständig kopiert wurde.';
  if (/API_KEY_SERVICE_BLOCKED|are blocked|API_KEY_API_BLOCKED/i.test(m))
    return 'Der Key darf diese API nicht nutzen. Erlaube bei den API-Einschränkungen «Places API (New)».';
  if (/has not been used|is disabled|SERVICE_DISABLED|not been enabled/i.test(m))
    return 'Die «Places API (New)» ist in diesem Google-Projekt noch nicht aktiviert.';
  if (/billing|BILLING/i.test(m))
    return 'Für das Google-Projekt ist die Abrechnung nicht aktiviert (Pflicht für die Places API, es gibt ein Gratiskontingent).';
  if (/HTTP 429|quota|RESOURCE_EXHAUSTED/i.test(m))
    return 'Das Google-Kontingent ist aufgebraucht. Bitte später erneut versuchen.';
  if (/Failed to fetch|NetworkError|Load failed|abort|timeout/i.test(m))
    return 'Keine Verbindung zu Google Maps. Bitte Internetverbindung prüfen.';
  return `Google Maps meldet: ${m}`;
}

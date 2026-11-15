// Reine Logik ohne DOM/Netzwerk – testbar mit `node --test`.
// Die App verlinkt nur auf aktionis.ch (CouponPlus AG) und kopiert keine Inhalte.

export const BASE = 'https://www.aktionis.ch';
export const NEARBY_URL = `${BASE}/deals?around_me=on`;
export const WATCHLIST_URL = `${BASE}/profile/watchlist`;
export const ALERT_URL = `${BASE}/profile/alert`;

// Navigationsziele: Name der Anbieter bzw. Kategorien und ihr URL-Kürzel auf aktionis.ch
export const VENDORS = [
  { name: 'Coop', slug: 'coop' },
  { name: 'Migros', slug: 'migros' },
  { name: 'Denner', slug: 'denner' },
  { name: 'ALDI Suisse', slug: 'aldi-suisse' },
  { name: 'Lidl', slug: 'lidl' },
  { name: 'Volg', slug: 'volg' },
  { name: 'SPAR', slug: 'spar' },
  { name: "OTTO'S", slug: 'otto-s' },
  { name: 'Coop Megastore', slug: 'coop-megastore' },
];

export const CATEGORIES = [
  { name: 'Backwaren / Patisserie', slug: 'Backwaren-Patisserie' },
  { name: 'Bio', slug: 'Bio' },
  { name: 'Cerealien', slug: 'Cerealien' },
  { name: 'Vorräte', slug: 'Vorräte' },
  { name: 'Fertiggerichte', slug: 'Fertiggerichte' },
  { name: 'Fleisch / Wurstwaren', slug: 'Fleisch-Wurstwaren' },
  { name: 'Fisch / Meeresfrüchte', slug: 'Fisch-Meeresfrüchte' },
  { name: 'Früchte / Gemüse', slug: 'Früchte-Gemüse' },
  { name: 'Milchprodukte / Eier', slug: 'Milchprodukte-Eier' },
  { name: 'Süsses / Snacks', slug: 'Süsses-Snacks' },
  { name: 'Tiefkühlprodukte', slug: 'Tiefkühlprodukte' },
  { name: 'Vegetarisch / Vegan', slug: 'Vegetarisch-Vegan' },
  { name: 'Mineralwasser', slug: 'Mineralwasser' },
  { name: 'Softdrinks', slug: 'Softdrinks' },
  { name: 'Frucht- / Gemüsesäfte', slug: 'Frucht-Gemüsesäfte' },
  { name: 'Bier', slug: 'Bier' },
  { name: 'Wein', slug: 'Wein' },
  { name: 'Kaffee / Tee', slug: 'Kaffee-Tee' },
];

export const vendorUrl = (slug) => `${BASE}/vendors/${encodeURIComponent(slug)}`;
export const categoryUrl = (slug) => `${BASE}/q/${encodeURIComponent(slug)}`;
export const searchUrl = (q) => `${BASE}/deals?q=${encodeURIComponent(q.trim())}`;

// ---- Eigene Suchbegriffe (nur auf dem Gerät) -------------------------------------
export const MAX_SEARCHES = 30;
export const MAX_TERM_LENGTH = 40;

export function cleanTerm(term) {
  return String(term ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TERM_LENGTH);
}

const same = (a, b) => a.toLocaleLowerCase('de-CH') === b.toLocaleLowerCase('de-CH');

/** Neuester Begriff zuerst, ohne Duplikate (Gross-/Kleinschreibung egal), max. MAX_SEARCHES. */
export function addSearch(list, term) {
  const t = cleanTerm(term);
  if (!t) return list;
  return [t, ...list.filter((x) => !same(x, t))].slice(0, MAX_SEARCHES);
}

export function removeSearch(list, term) {
  return list.filter((x) => !same(x, term));
}

/** Liest gespeicherte Begriffe defensiv (kaputter oder fremder Speicherinhalt → leere Liste). */
export function sanitizeSearches(raw) {
  if (!Array.isArray(raw)) return [];
  // Gespeichert ist neuester zuerst: von alt nach neu einfügen, damit bei Duplikaten der neueste gewinnt.
  return [...raw].reverse().reduce((acc, t) => (typeof t === 'string' ? addSearch(acc, t) : acc), []);
}

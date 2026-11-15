import {
  FUELS,
  RADII,
  cheapest,
  formatAge,
  formatDelta,
  formatDistance,
  formatPrice,
  friendlyError,
  mapsUrl,
  selectStations,
  sortStations,
} from './core.js';
import { fetchAll } from './providers.js';

const STORE_KEY = 'spritfinder.v1';
const LAST_KEY = 'spritfinder.last.v1';
const STALE_MS = 5 * 60 * 1000; // nach 5 Min. Hintergrund neu laden
const LAST_MAX_AGE_MS = 12 * 60 * 60 * 1000; // gespeicherten Stand max. 12 h anzeigen

// ---- Speicher (Fehler abfangen: privater Modus, blockierte Website-Daten) --------
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* gilt dann nur für diese Sitzung */
  }
};

const defaults = { fuel: 'b95', sort: 'dist', googleKey: '', demo: false };
const settings = { ...defaults, ...(read(STORE_KEY) || {}) };
if (!(settings.fuel in FUELS)) settings.fuel = defaults.fuel;

// Einrichtung per Link: …/#key=AIza… (Fragment geht nie an einen Server) bzw. ?demo
const hashKey = new URLSearchParams(location.hash.slice(1)).get('key');
if (hashKey) {
  settings.googleKey = hashKey.trim();
  write(STORE_KEY, settings);
  history.replaceState(null, '', location.pathname + location.search);
}
if (new URLSearchParams(location.search).has('demo')) settings.demo = true;

const saveSettings = () => write(STORE_KEY, settings);
const hasSource = () => Boolean(settings.googleKey.trim() || settings.demo);

// ---- DOM ----------------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {
  nav: $('nav'),
  title: $('title'),
  caption: $('caption'),
  state: $('state'),
  stateIcon: $('state-icon'),
  stateTitle: $('state-title'),
  stateText: $('state-text'),
  stateActions: $('state-actions'),
  setup: $('setup'),
  controls: document.querySelector('.controls'),
  setupKey: $('setup-key'),
  pattern: $('pattern'),
  list: $('list'),
  foot: $('foot'),
  refresh: $('btn-refresh'),
  settingsBtn: $('btn-settings'),
  dialog: $('settings'),
  setKey: $('set-key'),
  setDemo: $('set-demo'),
  ptr: $('ptr'),
  fuelGroup: $('fuel-group'),
  sortGroup: $('sort-group'),
  fuelBtns: [...document.querySelectorAll('#fuel-group button')],
  sortBtns: [...document.querySelectorAll('#sort-group button')],
};

const referrerPattern = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}*`;
els.pattern.textContent = referrerPattern;

const state = { origin: null, result: null, cache: new Map(), run: 0, ctrl: null, lastRunAt: 0 };

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const ICONS = {
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
  alert: '<path d="M12 3l10 18H2L12 3z"/><path d="M12 10v5M12 18v.01"/>',
  fuel: '<path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h14M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3M8 8h4"/>',
  wifi: '<path d="M2 9a15 15 0 0 1 20 0M5 13a10 10 0 0 1 14 0M8.5 16.5a5 5 0 0 1 7 0M12 20v.01M3 3l18 18"/>',
};
function icon(name, size = 28) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
}

// ---- Anzeige-Zustände -------------------------------------------------------------------
function setCaption(text, kind = '') {
  els.caption.textContent = text;
  els.caption.className = `caption ${kind}`.trim();
}

function showState({ icon: ic = 'alert', title, text, actions = [], banner = false }) {
  els.state.classList.toggle('banner', banner);
  els.stateIcon.innerHTML = icon(ic, banner ? 20 : 28);
  els.stateTitle.textContent = title;
  els.stateText.textContent = text || '';
  els.stateText.hidden = !text;
  els.stateActions.replaceChildren(
    ...actions.map(({ label, onClick, kind = 'filled' }) => {
      const b = el('button', `btn ${kind}`, label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      return b;
    }),
  );
  els.state.hidden = false;
  els.setup.hidden = true;
  els.controls.hidden = false;
}
const hideState = () => {
  els.state.hidden = true;
  els.setup.hidden = true;
  els.controls.hidden = false;
};
function showSetup() {
  els.state.hidden = true;
  els.setup.hidden = false;
  els.controls.hidden = true; // vor der Einrichtung unnötig
}

function showSkeleton() {
  els.list.setAttribute('aria-busy', 'true');
  els.list.classList.remove('stale');
  els.list.replaceChildren(
    ...[0, 1, 2].map(() => {
      const li = el('li', 'card skel');
      const main = el('div', 'main');
      const a = el('div', 'bar');
      a.style.width = '45%';
      const b = el('div', 'bar');
      b.style.width = '70%';
      const c = el('div', 'bar');
      c.style.width = '35%';
      main.append(a, b, c);
      const p = el('div', 'bar');
      p.style.width = '64px';
      p.style.height = '1.6em';
      li.append(main, p);
      return li;
    }),
  );
}

function renderControls() {
  els.fuelBtns.forEach((b, i) => {
    const on = b.dataset.fuel === settings.fuel;
    b.setAttribute('aria-checked', String(on));
    if (on) els.fuelGroup.style.setProperty('--i', i);
  });
  els.sortBtns.forEach((b, i) => {
    const on = b.dataset.sort === settings.sort;
    b.setAttribute('aria-checked', String(on));
    if (on) els.sortGroup.style.setProperty('--i', i);
  });
}

const plural = (n) => (n === 1 ? 'offene Tankstelle' : 'offene Tankstellen');
const clock = (d) => d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });

function renderList({ stale = false } = {}) {
  const r = state.result;
  els.list.setAttribute('aria-busy', 'false');
  els.list.classList.toggle('stale', stale);
  if (!r) {
    els.list.replaceChildren();
    els.foot.textContent = '';
    return;
  }
  const best = cheapest(r.stations);
  const nearest = sortStations(r.stations, 'dist')[0];
  const sorted = sortStations(r.stations, settings.sort);

  els.list.replaceChildren(
    ...sorted.map((s) => {
      const isBest = s.id === best.id;
      const a = el('a', `card${isBest ? ' best' : ''}`);
      a.href = mapsUrl(s);
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute(
        'aria-label',
        `${s.brand}, ${formatPrice(s.price)} Franken pro Liter, ${formatDistance(s.distKm)}${isBest ? ', günstigste' : ''} – Route in Google Maps starten`,
      );

      const main = el('div', 'main');
      const head = el('div', 'brand', s.brand);
      if (isBest) head.append(el('span', 'badge', 'Günstigste'));
      else if (r.stations.length > 1 && s.id === nearest.id) head.append(el('span', 'badge near', 'Am nächsten'));
      main.append(head);
      if (s.address) main.append(el('div', 'addr', s.address));
      const age = formatAge(s.updatedAt);
      const meta = [formatDistance(s.distKm)];
      if (age) meta.push(`Preis ${age}`);
      if (!s.openKnown) meta.push('Öffnungszeiten unbekannt');
      main.append(el('div', 'meta', meta.join(' · ')));

      const priceBox = el('div', 'price');
      priceBox.append(el('strong', '', formatPrice(s.price)), el('small', '', 'CHF/l'));
      const delta = isBest ? null : formatDelta(s.price, best.price);
      if (delta) priceBox.append(el('span', 'delta', delta));

      const chev = el('span', 'chev');
      chev.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

      a.append(main, priceBox, chev);
      const li = el('li');
      li.append(a);
      return li;
    }),
  );

  const n = r.stations.length;
  setCaption(`${n} ${plural(n)} im Umkreis von ${r.radiusKm} km · ${stale ? 'Stand' : 'Aktualisiert'} ${clock(r.at)}`);
  els.foot.textContent = 'Preise und Öffnungsstatus: Google Maps';
}

// ---- Standort -----------------------------------------------------------------------------
const round = (n) => Math.round(n * 1e4) / 1e4; // ~11 m: gute Cache-Treffer, genug Präzision

function locate() {
  return new Promise((resolve, reject) => {
    const fail = (kind, message) => reject(Object.assign(new Error(message), { kind }));
    if (!('geolocation' in navigator)) return fail('nogeo', 'Dieses Gerät unterstützt keine Standortbestimmung.');
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lng: round(p.coords.longitude) }),
      (e) =>
        fail(
          e.code === 1 ? 'denied' : 'unavailable',
          e.code === 1 ? 'Standortzugriff ist ausgeschaltet.' : e.code === 3 ? 'Der Standort wurde nicht rechtzeitig gefunden.' : 'Standort nicht verfügbar.',
        ),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}

// ---- Suche ----------------------------------------------------------------------------------
async function search({ relocate = true } = {}) {
  const run = ++state.run;
  state.ctrl?.abort();
  const ctrl = (state.ctrl = new AbortController());
  const stale = () => run !== state.run;
  const retry = { label: 'Erneut versuchen', onClick: () => search() };

  if (!hasSource()) {
    state.result = null;
    renderList();
    setCaption('');
    showSetup();
    return;
  }

  hideState();
  els.refresh.disabled = true;
  els.refresh.classList.add('spin');
  if (state.result) els.list.classList.add('stale');
  else showSkeleton();

  // Fehler anzeigen: vorhandene Liste bleibt (abgedunkelt) stehen, sonst Vollbild-Hinweis
  const fail = ({ icon: ic, title, text, actions }) => {
    if (state.result) {
      renderList({ stale: true });
      showState({ icon: ic, title, text, actions, banner: true });
    } else {
      renderList();
      setCaption('');
      showState({ icon: ic, title, text, actions });
    }
  };

  try {
    if (relocate || !state.origin) {
      setCaption('Standort wird bestimmt …', 'busy');
      const origin = await locate();
      if (stale()) return;
      if (!state.origin || state.origin.lat !== origin.lat || state.origin.lng !== origin.lng) state.cache.clear();
      state.origin = origin;
    }

    const errors = new Map();
    for (const radiusKm of RADII) {
      setCaption(`Suche im Umkreis von ${radiusKm} km …`, 'busy');
      const { stations, errors: errs } = await fetchAll({
        origin: state.origin,
        radiusKm,
        fuel: settings.fuel,
        settings,
        signal: ctrl.signal,
        cache: state.cache,
      });
      if (stale()) return;
      errs.forEach((e) => errors.set(e.source, e.message));
      if (errors.size) break; // Fehler (z. B. Key) – grösserer Radius würde nichts ändern
      const picked = selectStations(stations, radiusKm);
      if (picked.length) {
        state.result = { stations: picked, radiusKm, at: new Date() };
        state.lastRunAt = Date.now();
        write(LAST_KEY, { fuel: settings.fuel, at: state.result.at.getTime(), radiusKm, stations: picked });
        hideState();
        renderList();
        return;
      }
    }

    if (errors.size) {
      const message = friendlyError([...errors.values()][0], { pattern: referrerPattern });
      const offline = /Keine Verbindung/.test(message);
      fail({
        icon: offline ? 'wifi' : 'alert',
        title: offline ? 'Keine Verbindung' : 'Preise nicht verfügbar',
        text: message,
        actions: [
          { label: 'Erneut versuchen', onClick: () => search({ relocate: false }) },
          ...(offline ? [] : [{ label: 'Einstellungen', kind: 'tinted', onClick: openSettings }]),
        ],
      });
    } else {
      state.result = null;
      fail({
        icon: 'fuel',
        title: 'Keine Tankstelle mit Preis gefunden',
        text: `Im Umkreis von ${RADII.at(-1)} km ist keine geöffnete Tankstelle mit ${FUELS[settings.fuel]}-Preis bei Google Maps hinterlegt.`,
        actions: [retry],
      });
    }
  } catch (err) {
    if (stale()) return;
    const denied = err.kind === 'denied';
    fail({
      icon: 'pin',
      title: denied ? 'Standort ist aus' : 'Standort nicht gefunden',
      text: denied
        ? 'Erlaube den Standortzugriff, damit die nächsten Tankstellen gefunden werden:\nEinstellungen › Datenschutz & Sicherheit › Ortungsdienste › Safari-Websites bzw. Spritfinder'
        : err.message,
      actions: [retry],
    });
  } finally {
    if (!stale()) {
      els.refresh.disabled = false;
      els.refresh.classList.remove('spin');
    }
  }
}

// ---- Einstellungen / Einrichtung --------------------------------------------------------
async function paste(input) {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    if (text) input.value = text;
  } catch {
    input.focus(); // Zwischenablage gesperrt: manuell einfügen
  }
}

function applyKey(value) {
  settings.googleKey = value.trim();
  if (settings.googleKey) settings.demo = false;
  saveSettings();
  state.cache.clear();
  state.result = null;
  search({ relocate: false });
}

function openSettings() {
  els.setKey.value = settings.googleKey;
  els.setDemo.checked = settings.demo;
  els.dialog.returnValue = ''; // sonst gilt bei «Esc» noch der letzte Wert
  els.dialog.showModal();
}

els.settingsBtn.addEventListener('click', openSettings);
$('set-paste').addEventListener('click', () => paste(els.setKey));
$('set-clear').addEventListener('click', () => {
  els.setKey.value = '';
});
els.dialog.addEventListener('click', (e) => {
  if (e.target === els.dialog) els.dialog.close('cancel'); // Tipp auf den abgedunkelten Hintergrund
});
els.dialog.addEventListener('close', () => {
  if (els.dialog.returnValue !== 'save') return;
  settings.googleKey = els.setKey.value.trim();
  settings.demo = els.setDemo.checked;
  saveSettings();
  state.cache.clear();
  state.result = null;
  search({ relocate: false });
});

$('setup-paste').addEventListener('click', () => paste(els.setupKey));
$('setup-connect').addEventListener('click', () => {
  if (els.setupKey.value.trim()) applyKey(els.setupKey.value);
  else els.setupKey.focus();
});
els.setupKey.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('setup-connect').click();
});
$('setup-copy').addEventListener('click', async (e) => {
  try {
    await navigator.clipboard.writeText(referrerPattern);
    e.target.textContent = 'Kopiert ✓';
    setTimeout(() => (e.target.textContent = 'Kopieren'), 1800);
  } catch {
    /* Muster ist sichtbar und markierbar */
  }
});
$('setup-demo').addEventListener('click', () => {
  settings.demo = true;
  saveSettings();
  search({ relocate: false });
});

// ---- Steuerung -------------------------------------------------------------------------------
els.refresh.addEventListener('click', () => {
  state.cache.clear();
  search();
});

els.fuelBtns.forEach((b) =>
  b.addEventListener('click', () => {
    if (settings.fuel === b.dataset.fuel) return;
    settings.fuel = b.dataset.fuel;
    saveSettings();
    renderControls();
    search({ relocate: false });
  }),
);

els.sortBtns.forEach((b) =>
  b.addEventListener('click', () => {
    settings.sort = b.dataset.sort;
    saveSettings();
    renderControls();
    if (state.result) renderList({ stale: els.list.classList.contains('stale') });
  }),
);

// Nach 5 Minuten im Hintergrund / bei wiederkehrender Verbindung neu laden
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.lastRunAt && Date.now() - state.lastRunAt > STALE_MS) {
    state.cache.clear();
    search();
  }
});
addEventListener('online', () => hasSource() && search({ relocate: false }));

// Kompakter Titel in der Navigationsleiste, sobald der grosse Titel wegscrollt
if ('IntersectionObserver' in window) {
  new IntersectionObserver(
    ([e]) => els.nav.classList.toggle('scrolled', !e.isIntersecting && e.boundingClientRect.top < 0),
    { rootMargin: '-52px 0px 0px 0px' },
  ).observe(els.title);
}

// Pull-to-Refresh
{
  let y0 = null;
  let dy = 0;
  const set = (v) => {
    dy = v;
    els.ptr.style.setProperty('--dy', v);
    els.ptr.classList.toggle('ready', v >= 70);
  };
  addEventListener(
    'touchstart',
    (e) => {
      y0 = scrollY <= 0 && !els.refresh.disabled && !els.dialog.open ? e.touches[0].clientY : null;
    },
    { passive: true },
  );
  addEventListener(
    'touchmove',
    (e) => {
      if (y0 === null) return;
      const d = e.touches[0].clientY - y0;
      if (d > 0 && scrollY <= 0) {
        els.ptr.classList.remove('settle');
        set(Math.min(d * 0.6, 100));
      } else {
        y0 = null;
        set(0);
      }
    },
    { passive: true },
  );
  addEventListener('touchend', () => {
    if (y0 === null) return;
    y0 = null;
    const go = dy >= 70;
    els.ptr.classList.add('settle');
    set(0);
    if (go) {
      state.cache.clear();
      search();
    }
  });
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---- Start: zuletzt gespeicherten Stand sofort zeigen, dann aktualisieren -------------------
renderControls();
{
  const last = read(LAST_KEY);
  if (last && last.fuel === settings.fuel && hasSource() && Date.now() - last.at < LAST_MAX_AGE_MS && Array.isArray(last.stations)) {
    state.result = { stations: last.stations, radiusKm: last.radiusKm, at: new Date(last.at) };
    renderList({ stale: true });
  }
}
search();

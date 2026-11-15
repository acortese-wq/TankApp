import {
  FUELS,
  RADII,
  cheapest,
  formatDistance,
  formatPrice,
  mapsUrl,
  selectStations,
  sortStations,
} from './core.js';
import { fetchAll } from './providers.js';

const STORE_KEY = 'spritfinder.v1';
const STALE_MS = 5 * 60 * 1000;

const defaults = { fuel: 'e10', sort: 'dist', tankerkoenigKey: '', econtrol: true, demo: false };

function loadSettings() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}
function saveSettings() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    /* privater Modus o.ä. – Einstellungen gelten dann nur für diese Sitzung */
  }
}

const settings = loadSettings();
if (new URLSearchParams(location.search).has('demo')) settings.demo = true;

const $ = (id) => document.getElementById(id);
const els = {
  status: $('status'),
  actions: $('actions'),
  list: $('list'),
  foot: $('foot'),
  refresh: $('btn-refresh'),
  settingsBtn: $('btn-settings'),
  dialog: $('settings'),
  setTk: $('set-tk'),
  setEc: $('set-ec'),
  setDemo: $('set-demo'),
  fuelBtns: [...document.querySelectorAll('#fuel-group button')],
  sortBtns: [...document.querySelectorAll('#sort-group button')],
};

const state = {
  origin: null,
  result: null, // { stations (ausgewählt), radiusKm, at: Date }
  cache: new Map(),
  run: 0,
  ctrl: null,
  lastRunAt: 0,
};

// ---- Rendering ---------------------------------------------------------------
function setStatus(text, { busy = false, error = false } = {}) {
  els.status.textContent = text;
  els.status.classList.toggle('busy', busy);
  els.status.classList.toggle('error', error);
  els.status.hidden = !text;
}

function setActions(buttons) {
  els.actions.replaceChildren(
    ...buttons.map(({ label, onClick }) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn primary';
      b.textContent = label;
      b.addEventListener('click', onClick);
      return b;
    }),
  );
  els.actions.hidden = buttons.length === 0;
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

function renderControls() {
  els.fuelBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.fuel === settings.fuel)));
  els.sortBtns.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.sort === settings.sort)));
}

function renderList() {
  const r = state.result;
  if (!r) {
    els.list.replaceChildren();
    els.foot.textContent = '';
    return;
  }
  const best = cheapest(r.stations);
  const sorted = sortStations(r.stations, settings.sort);

  els.list.replaceChildren(
    ...sorted.map((s) => {
      const isBest = best && s.id === best.id;
      const a = el('a', `card${isBest ? ' best' : ''}`);
      a.href = mapsUrl(s);
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', `${s.brand}, ${formatPrice(s.price)} Euro pro Liter, ${formatDistance(s.distKm)} – Route in Google Maps starten`);

      const main = el('div', 'main');
      const head = el('div', 'brand', s.brand);
      if (isBest) head.append(el('span', 'badge', 'Günstigste'));
      main.append(head);
      const addr = [s.street, s.place].filter(Boolean).join(', ');
      if (addr) main.append(el('div', 'addr', addr));
      const meta = [formatDistance(s.distKm)];
      if (s.fuelLabel && s.fuelLabel !== FUELS[settings.fuel]) meta.push(s.fuelLabel);
      main.append(el('div', 'meta', meta.join(' · ')));

      const priceBox = el('div', 'price');
      priceBox.append(el('strong', '', formatPrice(s.price)), el('small', '', '€/l'));

      a.append(main, priceBox);
      const li = el('li');
      li.append(a);
      return li;
    }),
  );

  const n = r.stations.length;
  const time = r.at.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  els.foot.textContent = `${n} geöffnete ${n === 1 ? 'Tankstelle' : 'Tankstellen'} mit ${FUELS[settings.fuel]} im Umkreis von ${r.radiusKm} km · Stand ${time}`;
}

// ---- Standort ------------------------------------------------------------------
function locate() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(new Error('Dieses Gerät unterstützt keine Standortbestimmung.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round(p.coords.latitude), lng: round(p.coords.longitude) }),
      (e) => {
        const msg =
          e.code === 1
            ? 'Standortzugriff abgelehnt. Bitte in den iPhone-Einstellungen für Safari/Spritfinder erlauben.'
            : e.code === 3
              ? 'Standort nicht rechtzeitig gefunden.'
              : 'Standort nicht verfügbar.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  });
}
const round = (n) => Math.round(n * 1e4) / 1e4; // ~11 m – gute Cache-Treffer, genug Präzision

// ---- Suche ---------------------------------------------------------------------
async function search({ relocate = true } = {}) {
  const run = ++state.run;
  state.ctrl?.abort();
  const ctrl = (state.ctrl = new AbortController());
  const stale = () => run !== state.run;

  setActions([]);
  els.refresh.disabled = true;
  els.refresh.classList.add('spin');

  try {
    if (relocate || !state.origin) {
      setStatus('Standort wird bestimmt …', { busy: true });
      const origin = await locate();
      if (stale()) return;
      if (!state.origin || state.origin.lat !== origin.lat || state.origin.lng !== origin.lng) state.cache.clear();
      state.origin = origin;
    }

    const errors = new Map();
    let noSource = false;
    for (const radiusKm of RADII) {
      setStatus(`Suche offene Tankstellen mit ${FUELS[settings.fuel]} im Umkreis von ${radiusKm} km …`, { busy: true });
      const { stations, errors: errs, activeCount } = await fetchAll({
        origin: state.origin,
        radiusKm,
        fuel: settings.fuel,
        settings,
        signal: ctrl.signal,
        cache: state.cache,
      });
      if (stale()) return;
      if (activeCount === 0) {
        noSource = true;
        break;
      }
      errs.forEach((e) => errors.set(e.source, e.message));
      const picked = selectStations(stations, radiusKm);
      if (picked.length) {
        state.result = { stations: picked, radiusKm, at: new Date() };
        state.lastRunAt = Date.now();
        setStatus('');
        renderList();
        if (errors.size) {
          els.foot.textContent += ` · Quelle nicht erreichbar: ${[...errors.keys()].join(', ')}`;
        }
        return;
      }
    }

    state.result = null;
    renderList();
    if (noSource) {
      setStatus('Keine Datenquelle aktiv. Hinterlege einen Tankerkönig-Key (DE) oder aktiviere E-Control (AT).', { error: true });
      setActions([{ label: 'Einstellungen öffnen', onClick: openSettings }]);
    } else if (errors.size) {
      setStatus(`Preise konnten nicht geladen werden (${[...errors].map(([s, m]) => `${s}: ${m}`).join('; ')}).`, { error: true });
      setActions([{ label: 'Erneut versuchen', onClick: () => search({ relocate: false }) }]);
    } else {
      setStatus(
        `Keine geöffnete Tankstelle mit ${FUELS[settings.fuel]} im Umkreis von ${RADII.at(-1)} km gefunden. Aktuell sind Deutschland (Tankerkönig) und Österreich (E-Control) angebunden.`,
        { error: true },
      );
      setActions([{ label: 'Erneut versuchen', onClick: () => search() }]);
    }
  } catch (err) {
    if (stale()) return;
    state.result = null;
    renderList();
    setStatus(err.message || 'Unbekannter Fehler.', { error: true });
    setActions([{ label: 'Erneut versuchen', onClick: () => search() }]);
  } finally {
    if (!stale()) {
      els.refresh.disabled = false;
      els.refresh.classList.remove('spin');
    }
  }
}

// ---- Einstellungen / Events ----------------------------------------------------
function openSettings() {
  els.setTk.value = settings.tankerkoenigKey;
  els.setEc.checked = settings.econtrol !== false;
  els.setDemo.checked = settings.demo;
  els.dialog.showModal();
}

els.settingsBtn.addEventListener('click', openSettings);
els.dialog.addEventListener('close', () => {
  if (els.dialog.returnValue !== 'save') return;
  settings.tankerkoenigKey = els.setTk.value.trim();
  settings.econtrol = els.setEc.checked;
  settings.demo = els.setDemo.checked;
  saveSettings();
  state.cache.clear();
  search({ relocate: false });
});

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
    renderList();
  }),
);

// Beim Zurückkehren in die App: nach 5 Minuten Preise/Standort neu holen.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.lastRunAt && Date.now() - state.lastRunAt > STALE_MS) {
    state.cache.clear();
    search();
  }
});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderControls();
search();

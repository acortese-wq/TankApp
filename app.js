import {
  ALERT_URL,
  CATEGORIES,
  NEARBY_URL,
  VENDORS,
  WATCHLIST_URL,
  addSearch,
  categoryUrl,
  cleanTerm,
  removeSearch,
  sanitizeSearches,
  searchUrl,
  vendorUrl,
} from './core.js';

const STORE_KEY = 'aktionen.v1';

// ---- Speicher (Fehler abfangen: privater Modus, blockierte Website-Daten) --------
function load() {
  try {
    return sanitizeSearches(JSON.parse(localStorage.getItem(STORE_KEY) || '{}').searches);
  } catch {
    return [];
  }
}
function save(list) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ searches: list }));
  } catch {
    /* gilt dann nur für diese Sitzung */
  }
}

let searches = load();
let editing = false;

const $ = (id) => document.getElementById(id);
const els = {
  nav: $('nav'),
  title: $('title'),
  q: $('q'),
  save: $('save'),
  nearby: $('nearby'),
  mine: $('mine'),
  mineList: $('mine-list'),
  edit: $('edit'),
  vendors: $('vendors'),
  cats: $('cats'),
  account: $('account'),
};

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined) n.textContent = text;
  return n;
}

const CHEVRON =
  '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>';

function link(href, label, ariaLabel) {
  const a = el('a', 'row');
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener';
  if (ariaLabel) a.setAttribute('aria-label', ariaLabel);
  const span = el('span', 'row-label', label);
  const chev = el('span', 'chev');
  chev.innerHTML = CHEVRON;
  a.append(span, chev);
  return a;
}

function renderStatic() {
  els.nearby.href = NEARBY_URL;
  els.vendors.replaceChildren(
    ...VENDORS.map((v) => {
      const a = el('a', 'tile', v.name);
      a.href = vendorUrl(v.slug);
      a.target = '_blank';
      a.rel = 'noopener';
      a.setAttribute('aria-label', `Aktionen bei ${v.name}`);
      return a;
    }),
  );
  els.cats.replaceChildren(
    ...CATEGORIES.map((c) => {
      const li = el('li');
      li.append(link(categoryUrl(c.slug), c.name, `Aktionen in der Kategorie ${c.name}`));
      return li;
    }),
  );
  els.account.replaceChildren(
    ...[
      ['Merkliste', WATCHLIST_URL],
      ['Aktionis Alarm', ALERT_URL],
    ].map(([label, href]) => {
      const li = el('li');
      li.append(link(href, label));
      return li;
    }),
  );
}

function renderSearches() {
  els.mine.hidden = searches.length === 0;
  if (!searches.length) editing = false;
  els.edit.textContent = editing ? 'Fertig' : 'Bearbeiten';
  els.mineList.replaceChildren(
    ...searches.map((term) => {
      const li = el('li', 'mine-row');
      if (editing) {
        const del = el('button', 'del');
        del.type = 'button';
        del.setAttribute('aria-label', `${term} entfernen`);
        del.innerHTML =
          '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor"/><path d="M7 12h10" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
        del.addEventListener('click', () => {
          searches = removeSearch(searches, term);
          save(searches);
          renderSearches();
        });
        li.append(del);
      }
      li.append(link(searchUrl(term), term, `Aktionen für ${term}`));
      return li;
    }),
  );
}

// ---- Interaktion -------------------------------------------------------------------
function updateSaveButton() {
  els.save.disabled = !cleanTerm(els.q.value);
}
els.q.addEventListener('input', updateSaveButton);
els.save.addEventListener('click', () => {
  const t = cleanTerm(els.q.value);
  if (!t) return;
  searches = addSearch(searches, t);
  save(searches);
  els.q.value = '';
  updateSaveButton();
  renderSearches();
  els.mine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
// Leeres Suchfeld: nicht absenden (aktionis.ch bekäme sonst eine leere Suche)
$('search').addEventListener('submit', (e) => {
  if (!cleanTerm(els.q.value)) e.preventDefault();
});
els.edit.addEventListener('click', () => {
  editing = !editing;
  renderSearches();
});

// Kompakter Titel in der Navigationsleiste, sobald der grosse Titel wegscrollt
if ('IntersectionObserver' in window) {
  new IntersectionObserver(
    ([e]) => els.nav.classList.toggle('scrolled', !e.isIntersecting && e.boundingClientRect.top < 0),
    { rootMargin: '-52px 0px 0px 0px' },
  ).observe(els.title);
}

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

renderStatic();
renderSearches();
updateSaveButton();

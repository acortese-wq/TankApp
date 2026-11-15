import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BASE, CATEGORIES, MAX_SEARCHES, NEARBY_URL, VENDORS,
  addSearch, categoryUrl, cleanTerm, removeSearch, sanitizeSearches, searchUrl, vendorUrl,
} from '../core.js';

test('URLs zeigen auf aktionis.ch', () => {
  assert.equal(BASE, 'https://www.aktionis.ch');
  assert.equal(NEARBY_URL, 'https://www.aktionis.ch/deals?around_me=on');
  assert.equal(vendorUrl('aldi-suisse'), 'https://www.aktionis.ch/vendors/aldi-suisse');
  assert.equal(categoryUrl('Kaffee-Tee'), 'https://www.aktionis.ch/q/Kaffee-Tee');
  assert.equal(categoryUrl('Vorräte'), 'https://www.aktionis.ch/q/Vorr%C3%A4te');
  assert.equal(searchUrl('  Rivella & Co  '), 'https://www.aktionis.ch/deals?q=Rivella%20%26%20Co');
});

test('Anbieter und Kategorien: eindeutig, vollständig befüllt', () => {
  for (const list of [VENDORS, CATEGORIES]) {
    assert.ok(list.length > 5);
    assert.equal(new Set(list.map((x) => x.slug)).size, list.length);
    for (const x of list) assert.ok(x.name && x.slug);
  }
});

test('cleanTerm: Leerraum, Länge, Nicht-Strings', () => {
  assert.equal(cleanTerm('  Kaffee   Crema '), 'Kaffee Crema');
  assert.equal(cleanTerm('x'.repeat(100)).length, 40);
  assert.equal(cleanTerm(null), '');
  assert.equal(cleanTerm(42), '42');
});

test('addSearch: neuester zuerst, Duplikate ohne Gross-/Kleinschreibung, Obergrenze', () => {
  let l = [];
  l = addSearch(l, 'Kaffee');
  l = addSearch(l, 'Bier');
  l = addSearch(l, 'kaffee');
  assert.deepEqual(l, ['kaffee', 'Bier']);
  assert.deepEqual(addSearch(l, '   '), l, 'leere Eingabe ändert nichts');
  let many = [];
  for (let i = 0; i < MAX_SEARCHES + 5; i++) many = addSearch(many, `Begriff ${i}`);
  assert.equal(many.length, MAX_SEARCHES);
  assert.equal(many[0], `Begriff ${MAX_SEARCHES + 4}`);
});

test('removeSearch ohne Gross-/Kleinschreibung', () => {
  assert.deepEqual(removeSearch(['Kaffee', 'Bier'], 'KAFFEE'), ['Bier']);
  assert.deepEqual(removeSearch(['Bier'], 'Wein'), ['Bier']);
});

test('sanitizeSearches: kaputter Speicher wird zu sauberer Liste, Reihenfolge bleibt', () => {
  assert.deepEqual(sanitizeSearches(undefined), []);
  assert.deepEqual(sanitizeSearches('x'), []);
  assert.deepEqual(sanitizeSearches(['Bier', 5, null, 'Kaffee', 'bier', '  ']), ['Bier', 'Kaffee'], 'neuester Eintrag gewinnt bei Duplikaten');
  assert.deepEqual(sanitizeSearches(['Bier', 'Kaffee']), ['Bier', 'Kaffee']);
});

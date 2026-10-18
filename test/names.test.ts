import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nameKey, cleanName, validateName, foldKey, levenshtein, similarPlayer, findPlayer, initials, adminKeys, NAME_INVALID_MESSAGE,
} from '../shared/names.ts';

test('nameKey: trim, Kleinschreibung de-DE, Whitespace', () => {
  assert.equal(nameKey('  NÖL '), 'nöl');
  assert.equal(nameKey('Nöl'), nameKey('NÖL'));
  assert.equal(nameKey('Big   Dick\t69'), 'big dick 69');
  assert.notEqual(nameKey('Noel'), nameKey('Nöl'));
});

test('nameKey: NFC und NFD ergeben denselben Schlüssel', () => {
  const nfd = 'Nöl';
  const nfc = 'Nöl';
  assert.notEqual(nfd, nfc);
  assert.equal(nameKey(nfd), nameKey(nfc));
  assert.equal(cleanName(nfd), nfc);
});

test('cleanName fasst Whitespace zusammen, behält Schreibweise', () => {
  assert.equal(cleanName('  Logge  L. '), 'Logge L.');
});

test('validateName: gültige Namen', () => {
  assert.deepEqual(validateName('  Nöl '), { ok: true, name: 'Nöl', key: 'nöl' });
  assert.equal(validateName('7').ok, true);
  assert.equal(validateName('a'.repeat(40)).ok, true);
  assert.equal(validateName('😀'.repeat(39) + 'a').ok, true, 'Länge in Code Points');
});

test('validateName: ungültige Namen', () => {
  for (const bad of ['', '   ', '---', '😀', 'a'.repeat(41), 'Lo\u0000gge', 42, null, undefined]) {
    const r = validateName(bad);
    assert.equal(r.ok, false, `sollte ungültig sein: ${JSON.stringify(bad)}`);
    if (!r.ok) assert.equal(r.message, NAME_INVALID_MESSAGE);
  }
});

test('foldKey faltet Umlaute, ß und Diakritika', () => {
  assert.equal(foldKey('Nöl'), 'noel');
  assert.equal(foldKey('Noel'), 'noel');
  assert.equal(foldKey('Straße'), 'strasse');
  assert.equal(foldKey('Ärger Über'), 'aergerueber');
  assert.equal(foldKey('José'), 'jose');
  assert.equal(foldKey('Lo-gge!'), 'logge');
});

test('levenshtein', () => {
  assert.equal(levenshtein('logge', 'loge'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
});

test('similarPlayer: Faltschlüssel und Levenshtein ≤ 1', () => {
  const players = ['Logge', 'Nöl', 'Nikjay', 'LZH', 'BigDick69'];
  assert.equal(similarPlayer('Noel', players), 'Nöl');
  assert.equal(similarPlayer('Loge', players), 'Logge');
  assert.equal(similarPlayer('logge', players), null, 'exakt gleicher Schlüssel → keine Rückfrage');
  assert.equal(similarPlayer('NÖL', players), null);
  assert.equal(similarPlayer('LZX', players), null, 'unter 4 Zeichen kein Levenshtein');
  assert.equal(similarPlayer('Fritz', players), null);
  assert.equal(similarPlayer('Nik-jay', players), 'Nikjay');
  assert.equal(similarPlayer('Noel', [{ name: 'Nöl', key: 'nöl' }]), 'Nöl');
});

test('findPlayer: exakter Treffer über Normalschlüssel', () => {
  assert.equal(findPlayer(' nöl ', ['Logge', 'Nöl']), 'Nöl');
  assert.equal(findPlayer('Noel', ['Nöl']), null);
});

test('initials und adminKeys', () => {
  assert.equal(initials('Nöl'), 'NÖ');
  assert.equal(initials('LZH'), 'LZ');
  assert.equal(initials('Big Dick'), 'BD');
  assert.equal(initials('   '), '?');
  assert.deepEqual([...adminKeys('Logge, NÖL ,,')], ['logge', 'nöl']);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNumber, onStep, snapToStep, validateTip, validateResult, validateGameInput, validateGamePatch, validateField,
  normalizeUrl, validateClosesAt, MSG,
} from '../shared/parse.ts';
import type { Field } from '../shared/types.ts';

const score: Field = { label: 'Score', unit: 'points', min: 0, max: 100, step: 0.1 };
const numGame = { answerType: 'number' as const, fields: [score] };
const textGame = { answerType: 'text' as const, fields: [] };
const NOW = Date.parse('2026-10-20T12:00:00.000Z');

test('parseNumber: Komma, Punkt, Kurzformen', () => {
  assert.equal(parseNumber('0,3'), 0.3);
  assert.equal(parseNumber('.5'), 0.5);
  assert.equal(parseNumber(',5'), 0.5);
  assert.equal(parseNumber('1.'), 1);
  assert.equal(parseNumber(' -2,25 '), -2.25);
  assert.equal(parseNumber('+7'), 7);
  assert.equal(parseNumber(61.5), 61.5);
});

test('parseNumber: ungültig → NaN', () => {
  for (const v of ['1e3', '1,2,3', '', ' ', 'abc', '1.2.3', '--1', '١', Infinity, NaN, null, undefined, {}, []]) {
    assert.ok(Number.isNaN(parseNumber(v)), `NaN erwartet für ${String(v)}`);
  }
});

test('onStep: Raster inkl. Float-Rauschen', () => {
  assert.equal(onStep(0.3, 0, 0.1), true);
  assert.equal(onStep(61.5, 0, 0.1), true);
  assert.equal(onStep(61.55, 0, 0.1), false);
  assert.equal(onStep(1.25, 0, 0.01), true);
  assert.equal(onStep(5, 1, 2), true);
  assert.equal(onStep(4, 1, 2), false);
  assert.equal(snapToStep(61.56, score), 61.6);
  assert.equal(snapToStep(120, score), 100);
});

test('validateTip: Zahl im Bereich und auf dem Raster', () => {
  assert.deepEqual(validateTip(numGame, [61.5]), { ok: true, value: [61.5] });
  assert.deepEqual(validateTip(numGame, [0.30000000000000004]), { ok: true, value: [0.3] }, 'auf 10 Stellen gerundet');
  assert.deepEqual(validateTip(numGame, [100]), { ok: true, value: [100] });
});

test('validateTip: Fehlertexte', () => {
  const r1 = validateTip(numGame, [100.1]);
  assert.equal(r1.ok, false);
  if (!r1.ok) { assert.equal(r1.message, 'Score: pick a number between 0 and 100.'); assert.equal(r1.field, 'values'); }
  const r2 = validateTip(numGame, [61.55]);
  assert.equal(!r2.ok && r2.message, 'Score: use steps of 0.1.');
  for (const bad of [[], [1, 2], ['61,5'], [NaN], null, 5, 'x']) {
    const r = validateTip(numGame, bad);
    assert.equal(!r.ok && r.message, 'Fill in every field of your bet.', JSON.stringify(bad));
  }
  const de = validateTip({ answerType: 'number', fields: [{ label: 'Price', unit: '$', min: 0.5, max: 10000, step: 0.01 }] }, [0.1]);
  assert.equal(!de.ok && de.message, 'Price: pick a number between 0.5 and 10,000.');
});

test('validateResult: Bereich ja, Raster nein', () => {
  assert.deepEqual(validateResult(numGame, [57.63]), { ok: true, value: [57.63] });
  const r = validateResult(numGame, [-1]);
  assert.equal(!r.ok && r.message, 'Score: pick a number between 0 and 100.');
  assert.equal(!r.ok && r.field, 'result');
});

test('Text: 0/1/160/161 Zeichen, getrimmt gespeichert', () => {
  assert.equal(validateTip(textGame, '').ok, false);
  assert.equal(validateTip(textGame, '   ').ok, false);
  assert.deepEqual(validateTip(textGame, '  a '), { ok: true, value: 'a' });
  assert.equal(validateTip(textGame, 'x'.repeat(160)).ok, true);
  const r = validateTip(textGame, 'x'.repeat(161));
  assert.equal(!r.ok && r.message, 'Answers need 1 to 160 characters.');
  assert.equal(validateTip(textGame, ['a']).ok, false);
  assert.equal(validateResult(textGame, 'Nova-2').ok, true);
});

const base = {
  template: 'aa', prompt: 'Kimi K4 – AA-Index', description: 'Regeln', infoUrl: 'https://artificialanalysis.ai/leaderboards/models',
  benchmark: 'AA-Index', answerType: 'number', fields: [score], closesAt: '2026-10-23T18:00:00.000Z',
};

test('validateGameInput: gültige Eingabe wird normalisiert', () => {
  const r = validateGameInput({ ...base, prompt: '  Kimi K4 – AA-Index ', closesAt: '2026-10-23T20:00:00+02:00' }, { now: NOW });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.prompt, 'Kimi K4 – AA-Index');
    assert.equal(r.value.closesAt, '2026-10-23T18:00:00.000Z');
  }
  const t = validateGameInput({ template: 'text', prompt: 'Was kommt?', answerType: 'text', fields: [], closesAt: null }, { now: NOW });
  assert.deepEqual(t.ok && t.value, { template: 'text', prompt: 'Was kommt?', answerType: 'text', fields: [], closesAt: null, description: '', infoUrl: null, benchmark: '' });
});

const firstError = (input: object) => {
  const r = validateGameInput({ ...base, ...input }, { now: NOW });
  return r.ok ? null : r.message;
};

test('validateGameInput: exakte Fehlertexte', () => {
  assert.equal(firstError({ prompt: '   ' }), MSG.promptEmpty);
  assert.equal(firstError({ prompt: 'No question, no bet.' }), null);
  assert.equal(MSG.promptEmpty, 'No question, no bet.');
  assert.equal(firstError({ prompt: 'x'.repeat(161) }), 'Keep the question to 160 characters.');
  assert.equal(firstError({ prompt: 'x'.repeat(160) }), null);
  assert.equal(firstError({ description: 'x'.repeat(2001) }), 'Keep the rules to 2,000 characters.');
  assert.equal(firstError({ infoUrl: 'javascript:alert(1)' }), 'That doesn’t look like a link.');
  assert.equal(firstError({ infoUrl: 'kein link' }), 'That doesn’t look like a link.');
  assert.equal(firstError({ infoUrl: 'https://x.de/' + 'a'.repeat(2000) }), 'That doesn’t look like a link.');
  assert.equal(firstError({ infoUrl: '' }), null);
  assert.equal(firstError({ benchmark: 'x'.repeat(81) }), 'Keep the topic to 80 characters.');
  assert.equal(firstError({ template: 'legacy' }), MSG.template);
  assert.equal(firstError({ fields: [] }), 'Add one to four number fields.');
  assert.equal(firstError({ fields: [score, score, score, score, score] }), 'Add one to four number fields.');
  const fieldMsg = 'Every number field needs a label, a valid range and a positive step.';
  assert.equal(firstError({ fields: [{ ...score, label: ' ' }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, min: 100, max: 0 }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, min: 5, max: 5 }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, step: 0 }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, step: 101 }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, max: '100' }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, label: 'x'.repeat(61) }] }), fieldMsg);
  assert.equal(firstError({ fields: [{ ...score, unit: 'x'.repeat(31) }] }), fieldMsg);
  assert.equal(firstError({ fields: [score, { ...score, unit: '%' }] }), 'All values need the same unit so they can be scored together.');
  assert.equal(firstError({ answerType: 'text', fields: [score] }), MSG.textFields);
  assert.equal(firstError({ closesAt: '2026-10-20T12:05:00.000Z' }), 'The deadline has to be at least 10 minutes from now.');
  assert.equal(firstError({ closesAt: '2026-10-20T12:09:00.000Z' }), null, '60 s Toleranz');
  assert.equal(firstError({ closesAt: '2026-10-20T12:08:59.000Z' }), 'The deadline has to be at least 10 minutes from now.');
  assert.equal(firstError({ closesAt: 'morgen' }), 'The deadline has to be at least 10 minutes from now.');
  assert.equal(firstError({ closesAt: null }), null);
});

test('validateGameInput: alle Fehler mit Feldnamen', () => {
  const r = validateGameInput({ ...base, prompt: '', fields: [score, { ...score, step: -1 }] }, { now: NOW });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.deepEqual(r.errors.map((e) => e.field), ['prompt', 'fields.1']);
    assert.equal(r.field, 'prompt');
  }
});

test('validateGamePatch: nur mitgeschickte Schlüssel', () => {
  const b = { answerType: 'number' as const, fields: [score], template: 'legacy' };
  assert.deepEqual(validateGamePatch({ prompt: 'Neu' }, { now: NOW, base: b }), { ok: true, value: { prompt: 'Neu' }, errors: [] });
  assert.deepEqual(validateGamePatch({ template: 'legacy' }, { now: NOW, base: b }).ok, true);
  const r = validateGamePatch({ answerType: 'text' }, { now: NOW, base: b });
  assert.equal(!r.ok && r.message, MSG.textFields, 'Typwechsel ohne neue Felder');
  assert.deepEqual(validateGamePatch({ answerType: 'text', fields: [] }, { now: NOW, base: b }).ok, true);
  assert.equal(validateGamePatch({ closesAt: '2026-10-20T12:00:00.000Z' }, { now: NOW, base: b }).ok, false);
});

test('Helfer: validateField, normalizeUrl, validateClosesAt', () => {
  assert.deepEqual(validateField({ label: ' Wert ', min: 0, max: 10, step: 1 }), { ok: true, value: { label: 'Wert', unit: '', min: 0, max: 10, step: 1 } });
  assert.equal(normalizeUrl('  https://example.org/x '), 'https://example.org/x');
  assert.equal(normalizeUrl('ftp://example.org'), undefined);
  assert.equal(normalizeUrl(null), null);
  assert.deepEqual(validateClosesAt(null, NOW), { ok: true, value: null });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEMPLATES, TEMPLATE_KEYS, getTemplate, buildPrompt, nextMultiField, SOUNDS_NUMERIC } from '../shared/templates.ts';
import { validateGameInput } from '../shared/parse.ts';

test('Vorlagen §1.4.4: 8 Stück, Reihenfolge, Freie Antwort zuletzt', () => {
  assert.deepEqual(TEMPLATES.map((t) => t.key), TEMPLATE_KEYS);
  assert.equal(TEMPLATES.length, 8);
  assert.equal(TEMPLATES[TEMPLATES.length - 1]!.key, 'text');
});

test('jede Vorlage ergibt eine gültige Wette', () => {
  for (const t of TEMPLATES) {
    const r = validateGameInput({
      template: t.key, prompt: buildPrompt(t, 'GLM 6') || 'Frage?', description: t.description, infoUrl: t.infoUrl,
      benchmark: t.benchmark, answerType: t.answerType, fields: t.fields, closesAt: null,
    }, { now: Date.now() });
    assert.equal(r.ok, true, `${t.key}: ${r.ok ? '' : r.message}`);
  }
});

test('Hilfsfeld baut die Frage', () => {
  assert.equal(buildPrompt(getTemplate('aa')!, ' Kimi K4 '), 'Kimi K4 – AA Index');
  assert.equal(buildPrompt(getTemplate('api')!, 'GLM 6'), 'GLM 6 – API price (input/output)');
  assert.equal(buildPrompt(getTemplate('codename')!, 'Omen Beta'), 'Which model is behind Omen Beta?');
  assert.equal(buildPrompt(getTemplate('aa')!, '  '), '');
  assert.equal(nextMultiField(getTemplate('multi')!.fields).label, 'Model 3');
  assert.ok(SOUNDS_NUMERIC.test('How much will the plan cost?'));
  assert.ok(SOUNDS_NUMERIC.test('Wie viel kostet das Abo?'), 'deutsche Fragen weiterhin erkannt');
  assert.ok(!SOUNDS_NUMERIC.test('Which model is behind it?'));
});

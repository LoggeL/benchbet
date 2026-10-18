// Vorlagen für „New bet“ (SPEC §1.4.4).
import type { AnswerType, Field, TemplateKey } from './types.ts';

export type Template = {
  key: TemplateKey;
  /** Kachel-Titel */
  title: string;
  /** Kurzes Kürzel für die Kachel (ersetzt ein Icon) */
  badge: string;
  /** Beispielzeile unter dem Titel */
  example: string;
  answerType: AnswerType;
  fields: Field[];
  benchmark: string;
  /** Pflicht-Hilfsfeld, aus dem die Frage gebaut wird */
  helper: { label: string; placeholder: string; build: (x: string) => string } | null;
  description: string;
  infoUrl: string | null;
  /** Feinjustierung beim Öffnen aufgeklappt */
  fineTuneOpen: boolean;
  /** Mehrere Felder (bis MAX_FIELDS) erlaubt */
  multi: boolean;
};

const AA_DESCRIPTION =
  'Counts the first Intelligence Index score Artificial Analysis publishes for exactly this model, ' +
  'at its highest tested reasoning setting. Estimates, leaks and later re-runs don’t count.';

const score = (label: string): Field => ({ label, unit: 'points', min: 0, max: 100, step: 0.1 });

export const TEMPLATES: readonly Template[] = [
  {
    key: 'aa', title: 'AA Index', badge: 'AA', example: 'e.g. GLM 6 – AA Index',
    answerType: 'number', fields: [score('Score')], benchmark: 'AA Index',
    helper: { label: 'Which model?', placeholder: 'e.g. GLM 6', build: (x) => `${x} – AA Index` },
    description: AA_DESCRIPTION, infoUrl: 'https://artificialanalysis.ai/leaderboards/models',
    fineTuneOpen: false, multi: false,
  },
  {
    key: 'api', title: 'API price', badge: '$/M', example: 'Input and output per 1M tokens',
    answerType: 'number',
    fields: [
      { label: 'Input', unit: '$ / 1M tokens', min: 0, max: 1000, step: 0.01 },
      { label: 'Output', unit: '$ / 1M tokens', min: 0, max: 1000, step: 0.01 },
    ],
    benchmark: 'API price',
    helper: { label: 'Which model?', placeholder: 'e.g. GLM 6', build: (x) => `${x} – API price (input/output)` },
    description: 'Official list price at launch, standard tier, no discounts.', infoUrl: null,
    fineTuneOpen: false, multi: false,
  },
  {
    key: 'codename', title: 'Codename riddle', badge: '?', example: 'Which model is behind it?',
    answerType: 'text', fields: [], benchmark: 'Codename',
    helper: { label: 'Which codename?', placeholder: 'e.g. Omen Beta', build: (x) => `Which model is behind ${x}?` },
    description: 'The official model name counts. When resolving, the creator decides which spellings count.',
    infoUrl: null, fineTuneOpen: false, multi: false,
  },
  {
    key: 'price', title: 'Price / plan', badge: '$', example: 'What will the new Pro plan cost?',
    answerType: 'number', fields: [{ label: 'Price', unit: '$', min: 0, max: 10000, step: 0.01 }], benchmark: 'Price',
    helper: null, description: '', infoUrl: null, fineTuneOpen: false, multi: false,
  },
  {
    key: 'percent', title: 'Probability', badge: '%', example: 'How likely is it to ship this year?',
    answerType: 'number', fields: [{ label: 'Probability', unit: '%', min: 0, max: 100, step: 1 }],
    benchmark: 'Probability', helper: null, description: '', infoUrl: null, fineTuneOpen: false, multi: false,
  },
  {
    key: 'multi', title: 'Multiple scores', badge: '1+2', example: 'Two models, one bet',
    answerType: 'number', fields: [score('Model 1'), score('Model 2')], benchmark: 'AA Index',
    helper: null, description: 'The smallest sum of misses wins.', infoUrl: null,
    fineTuneOpen: false, multi: true,
  },
  {
    key: 'number', title: 'Custom number', badge: '#', example: 'Anything you can count',
    answerType: 'number', fields: [{ label: 'Value', unit: '', min: 0, max: 100, step: 1 }], benchmark: '',
    helper: null, description: '', infoUrl: null, fineTuneOpen: true, multi: false,
  },
  {
    key: 'text', title: 'Free answer', badge: 'Aa', example: 'Answer in words',
    answerType: 'text', fields: [], benchmark: '',
    helper: null, description: '', infoUrl: null, fineTuneOpen: false, multi: false,
  },
];

export const TEMPLATE_KEYS: readonly TemplateKey[] = ['aa', 'api', 'codename', 'price', 'percent', 'multi', 'number', 'text'];

/** Alte Vorlagen (L§5) → neue Keys. */
export const LEGACY_TEMPLATE_MAP: Readonly<Record<string, TemplateKey>> = {
  score: 'aa', price: 'price', api: 'api', text: 'text', multi: 'multi',
};

export const getTemplate = (key: string): Template | undefined => TEMPLATES.find((t) => t.key === key);

/** Neues Feld für „+ Add value“ bei `multi`: übernimmt Einheit/Bereich des letzten Felds. */
export function nextMultiField(fields: readonly Field[]): Field {
  const last = fields[fields.length - 1] ?? score('Model 1');
  return { ...last, label: `Model ${fields.length + 1}` };
}

/** Frage aus dem Hilfsfeld bauen (leeres Hilfsfeld → leere Frage). */
export function buildPrompt(t: Template, helperValue: string): string {
  const x = helperValue.trim();
  return t.helper && x ? t.helper.build(x) : '';
}

/** Matcht eine Freitext-Frage, die eigentlich eine Zahl ist (Hinweis „Sounds like a number“). Deutsche Begriffe bleiben für Freunde, die deutsch fragen. */
export const SOUNDS_NUMERIC = /price|cost|\$|€|percent|%|how much|how many|how high|preis|kosten|prozent|wie hoch|wie viel/i;

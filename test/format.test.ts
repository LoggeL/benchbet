import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatNumber, formatPlain, formatValue, formatAnswer, formatDistance, formatDate, formatDay, formatTime, formatMonth, relTime,
  joinNames, ruleSummary, ruleSentence, fieldRule, formatPercent, stepDecimals, formatTipLabel, countdown, formatDuration, topicLabel,
} from '../shared/format.ts';
import type { Field } from '../shared/types.ts';

const TZ = 'Europe/Berlin';
const score: Field = { label: 'Score', unit: 'points', min: 0, max: 100, step: 0.1 };
const api: Field[] = [
  { label: 'Input', unit: '$ / 1M tokens', min: 0, max: 1000, step: 0.01 },
  { label: 'Output', unit: '$ / 1M tokens', min: 0, max: 1000, step: 0.01 },
];

test('formatNumber: en-GB, bis 6 Nachkommastellen', () => {
  assert.equal(formatNumber(61.5), '61.5');
  assert.equal(formatNumber(10000), '10,000');
  assert.equal(formatNumber(2.6), '2.6');
  assert.equal(formatNumber(0.1234567), '0.123457');
  assert.equal(formatNumber(-0.0000001), '0');
  assert.equal(formatNumber(-0), '0');
  assert.equal(formatNumber(NaN), '–');
});

test('formatNumber mit fester Nachkommazahl (Eingabe-Kontext)', () => {
  assert.equal(formatNumber(61, 1), '61.0');
  assert.equal(formatNumber(1.5, 2), '1.50');
  assert.equal(formatPlain(10000.5, 2), '10000.50', 'ohne Tausendertrennzeichen für Eingabefelder');
  assert.equal(formatPlain(1234567), '1234567');
  assert.equal(stepDecimals(0.1), 1);
  assert.equal(stepDecimals(0.01), 2);
  assert.equal(stepDecimals(0.25), 2);
  assert.equal(stepDecimals(1), 0);
  assert.equal(stepDecimals(1e-7), 7);
});

test('formatValue und formatAnswer', () => {
  assert.equal(formatValue(38, 'points'), '38 points');
  assert.equal(formatValue(5, ''), '5');
  assert.equal(formatAnswer({ fields: [score] }, [38]), '38 points');
  assert.equal(formatAnswer({ fields: [] }, '0.1 / 0.5'), '0.1 / 0.5');
  assert.equal(formatAnswer({ fields: [score] }, null), '–');
  assert.equal(formatAnswer({ fields: api }, [1.25, 10]), 'Input: 1.25 $ / 1M tokens · Output: 10 $ / 1M tokens');
});

test('formatTipLabel für den Tipp-Button', () => {
  assert.equal(formatTipLabel([score], [61.5]), '61.5 points');
  assert.equal(formatTipLabel([score], [61]), '61.0 points');
  assert.equal(formatTipLabel(api, [1.25, 10]), '1.25 / 10.00 $ / 1M tokens');
});

test('formatDistance: Bullseye und Einheit', () => {
  assert.equal(formatDistance(0, 'points'), 'Bullseye');
  assert.equal(formatDistance(3, 'points'), '3 points off');
  assert.equal(formatDistance(2.6, ''), '2.6 off');
  assert.equal(formatDistance(200, '$'), '200 $ off');
});

test('formatPercent', () => {
  assert.equal(formatPercent(3 / 7), '42.9%');
  assert.equal(formatPercent(2 / 7), '28.6%');
  assert.equal(formatPercent(0.5), '50%');
  assert.equal(formatPercent(0), '0%');
  assert.equal(formatPercent(null), '–');
});

test('formatDate: ohne Jahr mit Wochentag, sonst mit Jahr', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  assert.equal(formatDate('2026-10-23T16:00:00.000Z', { now, timeZone: TZ }), 'Fri 23 Oct, 18:00');
  assert.equal(formatDate('2026-10-24T18:00:00.000Z', { now, timeZone: TZ }), 'Sat 24 Oct, 20:00');
  assert.equal(formatDate('2025-10-07T19:39:00.000Z', { now, timeZone: TZ }), '7 Oct 2025, 21:39');
  assert.equal(formatDate('2026-10-07T19:39:54.000Z', { now, timeZone: TZ, year: 'always' }), '7 Oct 2026, 21:39');
  assert.equal(formatDate('2026-12-31T23:30:00.000Z', { now, timeZone: TZ }), '1 Jan 2027, 00:30', 'Jahr in Zielzone');
  assert.equal(formatDate('kaputt', { now }), '–');
});

test('formatDay, formatTime, formatMonth', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  assert.equal(formatDay('2026-10-08T10:00:00.000Z', { now, timeZone: TZ }), '8 Oct');
  assert.equal(formatDay('2026-10-17T11:40:57.000Z', { now, timeZone: TZ, year: 'always' }), '17 Oct 2026');
  assert.equal(formatTime('2026-10-23T16:00:00.000Z', { timeZone: TZ }), '18:00');
  assert.equal(formatMonth('2026-10-06T13:34:27.000Z', { timeZone: TZ }), 'October 2026');
  assert.equal(formatMonth('2026-03-01T12:00:00.000Z', { timeZone: TZ }), 'March 2026');
});

test('relTime', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const o = { now, timeZone: TZ };
  const ago = (ms: number) => new Date(now - ms).toISOString();
  assert.equal(relTime(ago(30_000), o), 'just now');
  assert.equal(relTime(ago(5 * 60_000), o), '5 min ago');
  assert.equal(relTime(ago(3 * 3600_000), o), '3 h ago');
  assert.equal(relTime(ago(26 * 3600_000), o), 'yesterday');
  assert.equal(relTime(ago(4 * 86400_000), o), '4 days ago');
  assert.equal(relTime(ago(14 * 86400_000), o), '14 days ago');
  assert.equal(relTime(ago(20 * 86400_000), o), 'Wed 30 Sep, 14:00');
});

test('countdown (§1.7.1)', () => {
  const now = 0;
  const h = 3600_000;
  assert.equal(countdown(50 * h, now), '2 days left');
  assert.equal(countdown(30 * h, now), '1 day 6 h left');
  assert.equal(countdown(5 * h + 7 * 60_000, now), '5 h 7 min left');
  assert.equal(countdown(40 * 60_000, now), '40 min left');
  assert.equal(countdown(4 * 60_000 + 5_000, now), '4:05 left');
  assert.equal(countdown(0, now), 'Bets closed');
  assert.equal(formatDuration(2 * h), '2 h');
  assert.equal(formatDuration(40 * 60_000), '40 min');
});

test('joinNames', () => {
  assert.equal(joinNames([]), '');
  assert.equal(joinNames(['Nöl']), 'Nöl');
  assert.equal(joinNames(['Nöl', 'LZH']), 'Nöl and LZH');
  assert.equal(joinNames(['Nöl', 'LZH', 'Logge']), 'Nöl, LZH and Logge');
});

test('ruleSummary, ruleSentence, fieldRule, topicLabel', () => {
  assert.equal(ruleSummary({ answerType: 'number', fields: [score], createdBy: 'Logge' }), 'Closest wins · 0–100 points · steps of 0.1');
  assert.equal(ruleSummary({ answerType: 'number', fields: api, createdBy: 'Logge' }), 'Smallest total miss wins · 2 values · 0–1,000 $ / 1M tokens');
  assert.equal(ruleSummary({ answerType: 'text', fields: [], createdBy: 'Logge', template: 'codename' }), 'Right answer wins · Logge decides what counts');
  assert.equal(ruleSummary({ answerType: 'text', fields: [], createdBy: 'Logge', template: 'legacy', winnerTipIds: null }), 'Right answer wins · same spelling counts');
  assert.equal(ruleSummary({ answerType: 'text', fields: [], createdBy: 'Logge', template: 'legacy', winnerTipIds: [3] }), 'Right answer wins · Logge decides what counts');
  assert.equal(fieldRule({ label: 'Value', unit: '', min: 0, max: 100, step: 1 }), '0–100 · steps of 1');
  assert.match(ruleSentence({ answerType: 'number', fields: api, createdBy: 'L' }), /smallest sum/);
  assert.equal(topicLabel({ benchmark: '', answerType: 'text', fields: [] }), 'Free answer');
  assert.equal(topicLabel({ benchmark: '', answerType: 'number', fields: api }), 'Multiple values');
  assert.equal(topicLabel({ benchmark: '', answerType: 'number', fields: [score] }), 'Number');
  assert.equal(topicLabel({ benchmark: 'AA Index', answerType: 'number', fields: [score] }), 'AA Index');
});

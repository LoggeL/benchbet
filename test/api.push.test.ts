import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, deviceFor } from './helpers.ts';
import { applyVapidKey } from '../server/services/push.ts';
import { resultBody } from '../server/services/pushTexts.ts';

const HOUR = 3600 * 1000;
const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
const EP = (n: string) => `https://push.example/${n}`;

test('Subscribe/Lookup/Patch/Delete/Resubscribe + Opt-in-Test-Push', async () => {
  const t = await makeApp();
  try {
    const sub = await t.post('/api/push/subscribe', { name: 'Nöl', subscription: { endpoint: EP('a'), keys: KEYS } }, { 'x-device-id': deviceFor('Nöl') });
    assert.equal(sub.status, 201, sub.text);
    assert.deepEqual(sub.body.prefs, { newGame: true, result: true, reminder: true, reminderHours: 2, creator: true });
    assert.ok(t.ctx.repo.getPlayer('nöl'), 'Push-Abo legt den Spieler an');
    await t.ctx.push.idle();
    assert.equal(t.sent.length, 1);
    assert.equal(t.sent[0]!.payload.kind, 'test');
    assert.equal(t.sent[0]!.payload.title, 'Push works.');
    assert.equal(t.sent[0]!.payload.body, 'You won’t miss a bet from now on.');
    // Upsert: kein zweiter Test-Push, Prefs bleiben
    const up = await t.post('/api/push/subscribe', { name: 'Nöl', subscription: { endpoint: EP('a'), keys: KEYS } }, { 'x-device-id': deviceFor('Nöl') });
    assert.equal(up.body.subscriptionId, sub.body.subscriptionId);
    await t.ctx.push.idle();
    assert.equal(t.sent.length, 1);

    const noDev = await t.post('/api/push/subscribe', { name: 'Nöl', subscription: { endpoint: EP('b'), keys: KEYS } }, { 'x-device-id': '' });
    assert.equal(noDev.body.error.code, 'DEVICE_REQUIRED');
    const invalid = await t.post('/api/push/subscribe', { name: 'Nöl', subscription: { endpoint: 'nope', keys: KEYS } });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION');

    const look = await t.post('/api/push/lookup', { endpoint: EP('a') });
    assert.equal(look.status, 200);
    assert.equal(look.body.name, 'Nöl');
    const miss = await t.post('/api/push/lookup', { endpoint: EP('zzz') });
    assert.equal(miss.status, 404);
    assert.deepEqual(miss.body.error, { code: 'SUBSCRIPTION_NOT_FOUND', message: 'Push isn’t set up for this device.' });

    const p = await t.patch('/api/push/subscription', { endpoint: EP('a'), prefs: { reminderHours: 6, newGame: false } });
    assert.equal(p.status, 200);
    assert.deepEqual(p.body.prefs, { newGame: false, result: true, reminder: true, reminderHours: 6, creator: true });
    const badHours = await t.patch('/api/push/subscription', { endpoint: EP('a'), prefs: { reminderHours: 3 } });
    assert.equal(badHours.status, 400);
    const rename = await t.patch('/api/push/subscription', { endpoint: EP('a'), name: 'Nikjay' });
    assert.equal(rename.status, 200);
    assert.equal((await t.post('/api/push/lookup', { endpoint: EP('a') })).body.name, 'Nikjay');

    const re = await t.post('/api/push/resubscribe', { oldEndpoint: EP('a'), subscription: { endpoint: EP('a2'), keys: KEYS } }, { 'x-device-id': '' });
    assert.equal(re.status, 200, re.text);
    assert.equal(re.body.prefs.reminderHours, 6);
    assert.equal((await t.post('/api/push/lookup', { endpoint: EP('a2') })).body.name, 'Nikjay');
    assert.equal((await t.post('/api/push/lookup', { endpoint: EP('a') })).status, 404);
    assert.equal((await t.post('/api/push/resubscribe', { oldEndpoint: EP('gone'), subscription: { endpoint: EP('x'), keys: KEYS } })).status, 404);

    assert.equal((await t.del('/api/push/subscription', { endpoint: EP('a2') })).status, 204);
    assert.equal((await t.del('/api/push/subscription', { endpoint: EP('a2') })).status, 204, 'idempotent');
    assert.equal(t.ctx.repo.listSubs().length, 0);
  } finally {
    await t.close();
  }
});

test('config: audience = Abos mit newGame von anderen Namen', async () => {
  const t = await makeApp();
  try {
    await t.subscribe('Logge', EP('l'));
    await t.subscribe('Nöl', EP('n'));
    await t.subscribe('LZH', EP('z'), { newGame: false });
    const c = await t.get('/api/push/config?name=Logge');
    assert.equal(c.body.audience, 1);
    assert.equal(c.body.publicKey, t.ctx.push.publicKey);
    assert.equal((await t.get('/api/push/config')).body.audience, 2);
  } finally {
    await t.close();
  }
});

test('new_game: nach Verzögerung, nie an den Ersteller, Badge; Dedupe bei Doppel-Lauf', async () => {
  const t = await makeApp();
  try {
    await t.subscribe('Logge', EP('logge'));
    await t.subscribe('Nöl', EP('noel'));
    await t.subscribe('LZH', EP('lzh'));
    t.sent.length = 0;
    const g = await t.createGame({ closesAt: '2026-10-23T18:00:00.000Z' });
    await t.ctx.scheduler.tick();
    assert.equal(t.sent.length, 0, 'erst nach 60 s');
    t.clock.advance(60_000);
    await t.ctx.scheduler.tick();
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.deepEqual(t.sent.map((s) => s.endpoint).sort(), [EP('lzh'), EP('noel')]);
    const p = t.sent.find((s) => s.endpoint === EP('noel'))!;
    assert.equal(p.payload.kind, 'new_game');
    assert.equal(p.payload.title, 'New bet from Logge');
    assert.equal(p.payload.body, 'Test model – AA Index · closes Fri 23 Oct, 20:00');
    assert.equal(p.payload.url, `/bet/${g.id}?from=push`);
    assert.equal(p.payload.tag, `game-${g.id}`);
    assert.equal(p.payload.renotify, false);
    assert.equal(p.payload.badge, 1);
    assert.deepEqual(p.payload.actions, [{ action: 'tip', title: 'Place guess' }]);
    assert.equal(p.options.TTL, 24 * 3600);
    assert.equal(p.options.urgency, 'normal');
    assert.ok(Buffer.byteLength(JSON.stringify(p.payload)) <= 1024);
    assert.ok(t.ctx.repo.getGame(g.id)!.pushNewSentAt);
  } finally {
    await t.close();
  }
});

test('new_game gebündelt: zwei Wetten desselben Erstellers → ein Push', async () => {
  const t = await makeApp();
  try {
    await t.subscribe('Nöl', EP('noel'));
    t.sent.length = 0;
    await t.createGame({ prompt: 'Modell A – AA-Index' });
    t.clock.advance(20_000);
    await t.createGame({ prompt: 'Modell B – AA-Index' });
    t.clock.advance(60_000);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.equal(t.sent.length, 1);
    const p = t.sent[0]!.payload;
    assert.equal(p.title, 'Logge opened 2 new bets');
    assert.equal(p.body, 'Modell A – AA-Index, Modell B – AA-Index');
    assert.equal(p.url, '/?from=push');
    assert.equal(p.tag, 'new-games');
    assert.equal(p.gameId, null);
    assert.equal(p.badge, 2);
    assert.equal(t.ctx.repo.pushLogs().filter((l) => l.kind === 'new_game').length, 2, 'Dedupe je Wette');
  } finally {
    await t.close();
  }
});

test('reminder: nur Nicht-Tipper, nie der Ersteller, genau einmal, Zeitpunkt-Formel', async () => {
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 } });
  try {
    await t.subscribe('Logge', EP('logge'));
    await t.subscribe('Nöl', EP('noel'));
    await t.subscribe('LZH', EP('lzh'));
    await t.subscribe('Nikjay', EP('nik'), { reminderHours: 6 });
    const closes = t.clock.now() + 24 * HOUR;
    const g = await t.createGame({ closesAt: new Date(closes).toISOString() });
    await t.tip(g.id, 'LZH', [5]);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    t.sent.length = 0;

    assert.equal(t.ctx.push.remindAt({ createdAt: g.createdAt, closesAt: g.closesAt }, 2), closes - 2 * HOUR);
    assert.equal(t.ctx.push.remindAt({ createdAt: g.createdAt, closesAt: new Date(Date.parse(g.createdAt) + 2 * HOUR).toISOString() }, 2), Date.parse(g.createdAt) + HOUR, 'max mit Hälfte der Laufzeit');

    t.clock.set(closes - 6 * HOUR - 1000);
    await t.ctx.scheduler.tick();
    assert.equal(t.sent.length, 0);
    t.clock.set(closes - 6 * HOUR);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.deepEqual(t.sent.map((s) => s.endpoint), [EP('nik')]);
    t.clock.set(closes - 2 * HOUR);
    await t.ctx.scheduler.tick();
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.deepEqual(t.sent.map((s) => s.endpoint), [EP('nik'), EP('noel')]);
    const p = t.sent[1]!;
    assert.equal(p.payload.kind, 'reminder');
    assert.equal(p.payload.title, '2 h left: Test model – AA Index');
    assert.equal(p.payload.body, 'You haven’t placed a guess yet. 1 other has.');
    assert.equal(p.payload.renotify, true);
    assert.equal(p.options.urgency, 'high');
    assert.equal(p.options.TTL, 2 * 3600);
  } finally {
    await t.close();
  }
});

test('reminder: Tippschluss vorverlegt → Dedupe gelöscht, neu bewertet', async () => {
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 } });
  try {
    await t.subscribe('Nöl', EP('noel'));
    const g = await t.createGame({ closesAt: new Date(t.clock.now() + 48 * HOUR).toISOString() });
    await t.ctx.scheduler.tick();
    t.clock.advance(46 * HOUR);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    const before = t.sent.filter((s) => s.payload.kind === 'reminder').length;
    assert.equal(before, 1);
    const r = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: new Date(t.clock.now() + 30 * 60 * 1000).toISOString() } });
    assert.equal(r.status, 200, r.text);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    const after = t.sent.filter((s) => s.payload.kind === 'reminder');
    assert.equal(after.length, 2);
    assert.equal(after[1]!.payload.title, '30 min left: Test model – AA Index');
    assert.equal(after[1]!.payload.body, 'You haven’t placed a guess yet. Be the first.');
  } finally {
    await t.close();
  }
});

test('result: personalisiert, Auflöser bekommt keinen; correction nur an Tipper', async () => {
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 } });
  try {
    for (const n of ['Logge', 'Nöl', 'LZH', 'Nikjay', 'Zuschauer']) await t.subscribe(n, EP(n.toLowerCase()));
    const g = await t.createGame();
    await t.tip(g.id, 'LZH', [35]);
    await t.tip(g.id, 'Nöl', [45]);
    await t.tip(g.id, 'Nikjay', [35]);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    t.sent.length = 0;
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [38] });
    await t.ctx.push.idle();
    const by = (n: string) => t.sent.find((s) => s.endpoint === EP(n.toLowerCase()))?.payload;
    assert.equal(by('Logge'), undefined, 'Auflöser bekommt nichts');
    assert.equal(by('Nöl')!.title, 'Result: Test model – AA Index');
    assert.equal(by('Nöl')!.body, '38 points · LZH and Nikjay win · You: #3 (7 off)');
    assert.equal(by('LZH')!.body, '🏆 Shared win with Nikjay · 38 points');
    assert.equal(by('Zuschauer')!.body, '38 points · LZH and Nikjay win.');
    assert.equal(by('Nöl')!.renotify, true);
    assert.equal(t.sent.length, 4);

    t.sent.length = 0;
    await t.post(`/api/games/${g.id}/correct`, { name: 'Logge', result: [45] });
    await t.ctx.push.idle();
    assert.deepEqual(t.sent.map((s) => s.endpoint).sort(), [EP('lzh'), EP('nikjay'), EP('nöl')].sort());
    assert.equal(t.sent[0]!.payload.title, 'Correction: Test model – AA Index');
    assert.equal(t.sent[0]!.payload.body, 'New result 45 points (was 38 points). Nöl wins.');
  } finally {
    await t.close();
  }
});

test('resultBody: alle Fälle der Tabelle', () => {
  const g = { id: 1, prompt: 'X', closesAt: null, answerType: 'number' as const, fields: [{ label: 'S', unit: 'points', min: 0, max: 100, step: 0.1 }], result: [61.2] };
  assert.equal(resultBody(g, { own: { distance: 0.3, rank: 1, isWinner: true }, winners: ['Nöl'], ownName: 'Nöl' }), '🏆 You win! 61.2 points · 0.3 off');
  assert.equal(resultBody(g, { own: { distance: 0, rank: 1, isWinner: true }, winners: ['Nöl'], ownName: 'Nöl' }), '🏆 Bullseye! 61.2 points');
  assert.equal(resultBody(g, { own: { distance: 0.5, rank: 2, isWinner: false }, winners: ['LZH'], ownName: 'Nöl' }), '61.2 points · LZH wins · You: #2 (0.5 off)');
  assert.equal(resultBody(g, { own: null, winners: ['LZH'], ownName: null }), '61.2 points · LZH wins.');
  const tg = { ...g, answerType: 'text' as const, fields: [], result: 'Nova-2' };
  assert.equal(resultBody(tg, { own: { distance: null, rank: null, isWinner: false }, winners: ['LZH'], ownName: 'Nöl' }), 'Nova-2 · LZH wins · Your answer doesn’t count');
  assert.equal(resultBody(tg, { own: { distance: null, rank: null, isWinner: false }, winners: [], ownName: 'Nöl' }), 'Nova-2 · Nobody wins this time.');
  assert.equal(resultBody(tg, { own: { distance: null, rank: 1, isWinner: true }, winners: ['Nöl'], ownName: 'Nöl' }), '🏆 You win! Nova-2');
});

test('creator_due: automatischer Tippschluss mit Tipp → Push an Ersteller mit Aktion', async () => {
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 } });
  try {
    await t.subscribe('Logge', EP('logge'));
    const g = await t.createGame({ closesAt: new Date(t.clock.now() + HOUR).toISOString() });
    await t.tip(g.id, 'Nöl', [5]);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    t.sent.length = 0;
    t.clock.advance(HOUR);
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.equal(t.sent.length, 1);
    const p = t.sent[0]!.payload;
    assert.equal(p.kind, 'creator_due');
    assert.equal(p.title, 'Closed: Test model – AA Index');
    assert.equal(p.body, '1 guess in. Enter the result once it’s official.');
    assert.equal(p.url, `/bet/${g.id}/resolve`);
    assert.deepEqual(p.actions, [{ action: 'resolve', title: 'Enter result' }]);
    // manuelles Schließen durch den Ersteller selbst → kein creator_due
    const g2 = await t.createGame();
    await t.tip(g2.id, 'Nöl', [5]);
    await t.post(`/api/games/${g2.id}/close`, { name: 'Logge' });
    t.sent.length = 0;
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    assert.equal(t.sent.filter((s) => s.payload.kind === 'creator_due').length, 0);
    // 7 Tage später: creator_overdue (einmal)
    t.clock.advance(7 * 24 * HOUR);
    await t.ctx.scheduler.tick();
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    const overdue = t.sent.filter((s) => s.payload.kind === 'creator_overdue');
    assert.equal(overdue.length, 2);
    assert.equal(overdue[0]!.payload.body, 'Closed for 7 days. Everyone’s waiting for the reveal.');
  } finally {
    await t.close();
  }
});

test('Versand: 404/410 löscht Abo sofort, 5xx → fail_count, 413 → gekürzt erneut', async () => {
  const status: Record<string, number> = {};
  const t = await makeApp({ config: { newGamePushDelaySeconds: 0 }, pushStatus: (ep, p) => (ep === EP('big') && [...p.body].length > 80 ? 413 : status[ep] ?? 201) });
  try {
    await t.subscribe('A1', EP('gone404'));
    await t.subscribe('B2', EP('gone410'));
    await t.subscribe('C3', EP('flaky'));
    await t.subscribe('D4', EP('big'));
    status[EP('gone404')] = 404;
    status[EP('gone410')] = 410;
    status[EP('flaky')] = 503;
    t.sent.length = 0;
    await t.createGame({ prompt: 'Ein sehr langer Titel für eine Wette, damit der Body garantiert über achtzig Zeichen hinausgeht – AA-Index' });
    await t.ctx.scheduler.tick();
    await t.ctx.push.idle();
    const eps = t.ctx.repo.listSubs().map((s) => s.endpoint).sort();
    assert.deepEqual(eps, [EP('big'), EP('flaky')]);
    const flaky = t.ctx.repo.subByEndpoint(EP('flaky'))!;
    assert.equal(flaky.failCount, 1);
    assert.match(flaky.lastError ?? '', /503/);
    const big = t.sent.filter((s) => s.endpoint === EP('big'));
    assert.equal(big.length, 2, '413 → einmal gekürzt erneut');
    assert.ok([...big[1]!.payload.body].length <= 80);
    assert.ok(t.ctx.repo.subByEndpoint(EP('big'))!.lastSuccessAt);
  } finally {
    await t.close();
  }
});

test('Test-Push-Route: 202 ok, sonst 502 PUSH_FAILED ohne fremden Status', async () => {
  const t = await makeApp({ pushStatus: (ep) => (ep === EP('bad') ? 400 : 201) });
  try {
    await t.subscribe('Nöl', EP('ok'));
    await t.subscribe('LZH', EP('bad'));
    const ok = await t.post('/api/push/test', { endpoint: EP('ok') });
    assert.equal(ok.status, 202);
    assert.deepEqual(ok.body, { ok: true });
    const bad = await t.post('/api/push/test', { endpoint: EP('bad') });
    assert.equal(bad.status, 502);
    assert.deepEqual(bad.body.error, { code: 'PUSH_FAILED', message: 'The push service didn’t accept the test push.' });
    assert.equal((await t.post('/api/push/test', { endpoint: EP('none') })).status, 404);
  } finally {
    await t.close();
  }
});

test('VAPID-Schlüsselwechsel löscht alle Abos', async () => {
  const t = await makeApp();
  try {
    await t.subscribe('Nöl', EP('n'));
    applyVapidKey(t.ctx.repo, t.ctx.push.publicKey);
    assert.equal(t.ctx.repo.listSubs().length, 1, 'gleicher Schlüssel: nichts passiert');
    applyVapidKey(t.ctx.repo, 'BAnotherKey');
    assert.equal(t.ctx.repo.listSubs().length, 0);
    assert.equal(t.ctx.repo.getMeta('vapid_public_key'), 'BAnotherKey');
  } finally {
    await t.close();
  }
});

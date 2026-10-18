// Regressionstests für Review-Befunde: Anti-Peek-Lücken, Restore nach Feldänderung, Auflösen nach Tippschluss,
// Undo nach Auflösung, „edited“-Tag, Tippschluss-Obergrenze, OG-Injection, Import-URLs, Push-Allowlist, Punkt im Pfad.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ADMIN_TOKEN, makeApp, testConfig, toSnapshot } from './helpers.ts';
import { injectOg } from '../server/services/og.ts';
import { isAllowedEndpoint } from '../server/routes/push.ts';
import { DEFAULT_PUSH_HOSTS, loadConfig } from '../server/config.ts';
import { validateClosesAt } from '../shared/parse.ts';
import { APP_PATH_WITH_DOT } from '../shared/routes.ts';

const enc = encodeURIComponent;

test('dryRun ohne eigenen Tipp → protokolliert; nach Wieder öffnen kein Tipp des Verwalters (TIP_BLOCKED)', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Mallory');
    await t.tip(g.id, 'Alice', [73]);
    await t.tip(g.id, 'Bob', [41]);
    assert.equal((await t.post(`/api/games/${g.id}/close`, { name: 'Mallory' })).status, 200);
    const pre = await t.post(`/api/games/${g.id}/resolve`, { name: 'Mallory', result: [50], dryRun: true });
    assert.equal(pre.status, 200);
    // Live-Vorschau tippt mehrfach (debounce) → nur ein Eintrag
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Mallory', result: [51], dryRun: true });
    const events = t.ctx.repo.gameEvents(g.id).filter((e) => e.type === 'game.previewed');
    assert.equal(events.length, 1);
    const act = await t.get(`/api/games/${g.id}/activity`);
    assert.ok(act.body.events.some((e: any) => e.type === 'game.previewed' && /Mallory saw all guesses/.test(e.text)));

    assert.equal((await t.post(`/api/games/${g.id}/reopen`, { name: 'Mallory', closesAt: null })).status, 200);
    const late = await t.tip(g.id, 'Mallory', [72]);
    assert.equal(late.status, 409);
    assert.equal(late.body.error.code, 'TIP_BLOCKED');
    // andere Spieler dürfen weiter tippen
    assert.equal((await t.tip(g.id, 'Carol', [60])).status, 201);
  } finally {
    await t.close();
  }
});

test('dryRun mit eigenem Tipp wird nicht protokolliert', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    await t.tip(g.id, 'Nöl', [10]);
    await t.tip(g.id, 'LZH', [20]);
    await t.post(`/api/games/${g.id}/close`, { name: 'Nöl' });
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Nöl', result: [12], dryRun: true });
    assert.equal(t.ctx.repo.gameEvents(g.id).filter((e) => e.type === 'game.previewed').length, 0);
  } finally {
    await t.close();
  }
});

test('Eigenen Tipp moderieren → 403 (auch Admin); entfernter Tipp sperrt neues Tippen', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Mallory');
    const own = await t.tip(g.id, 'Mallory', [10]);
    t.clock.advance(6000);
    const self = await t.del(`/api/tips/${own.body.tip.id}`, { name: 'Mallory', reason: 'request' });
    assert.equal(self.status, 403);
    assert.equal(self.body.error.code, 'FORBIDDEN');
    const g2 = await t.createGame({}, 'Nöl');
    const adminOwn = await t.tip(g2.id, 'Logge', [10]);
    t.clock.advance(6000);
    assert.equal((await t.del(`/api/tips/${adminOwn.body.tip.id}`, { name: 'Logge', reason: 'duplicate' })).status, 403);

    // Verwalter entfernt fremden Tipp „auf Wunsch“ → der Spieler kann nicht neu tippen (hat schon gespickt)
    const lzh = await t.tip(g2.id, 'LZH', [30]);
    t.clock.advance(6000);
    assert.equal((await t.del(`/api/tips/${lzh.body.tip.id}`, { name: 'Nöl', reason: 'request' })).status, 200);
    const again = await t.tip(g2.id, 'LZH', [31], 'lzh-other-device-123');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'TIP_BLOCKED');
  } finally {
    await t.close();
  }
});

test('Undo nach der Auflösung → 409 GAME_RESOLVED', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'LZH');
    const n = await t.tip(g.id, 'Nöl', [40]);
    t.clock.advance(1000);
    assert.equal((await t.post(`/api/games/${g.id}/resolve`, { name: 'LZH', result: [42] })).status, 200);
    t.clock.advance(2000); // Undo-Fenster läuft noch
    const undo = await t.del(`/api/tips/${n.body.tip.id}`, { name: 'Nöl' });
    assert.equal(undo.status, 409);
    assert.equal(undo.body.error.code, 'GAME_RESOLVED');
    assert.ok(t.ctx.repo.getTip(n.body.tip.id), 'Tipp bleibt erhalten');
  } finally {
    await t.close();
  }
});

test('Restore nach Feldänderung → 409 TIP_STALE (keine NaN-Wertung)', async () => {
  const t = await makeApp();
  try {
    const fields = [
      { label: 'A', unit: 'pts', min: 0, max: 100, step: 1 },
      { label: 'B', unit: 'pts', min: 0, max: 100, step: 1 },
    ];
    const g = await t.createGame({ fields }, 'Logge');
    const n = await t.tip(g.id, 'Nöl', [10, 20]);
    t.clock.advance(6000);
    await t.del(`/api/tips/${n.body.tip.id}`, { name: 'Logge', reason: 'duplicate' });
    const p = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { fields: [fields[0]] } });
    assert.equal(p.status, 200, p.text);
    const back = await t.post(`/api/tips/${n.body.tip.id}/restore`, { name: 'Logge' });
    assert.equal(back.status, 409);
    assert.equal(back.body.error.code, 'TIP_STALE');
  } finally {
    await t.close();
  }
});

test('Auflösen nach abgelaufenem Tippschluss ohne Scheduler-Lauf: closedAt = closesAt, automatisch geschlossen', async () => {
  const t = await makeApp();
  try {
    const closesAt = new Date(t.clock.now() + 11 * 60_000).toISOString();
    const g = await t.createGame({ closesAt }, 'LZH');
    await t.tip(g.id, 'Nöl', [40]);
    t.clock.advance(12 * 60_000);
    const r = await t.post(`/api/games/${g.id}/resolve`, { name: 'LZH', result: [42] });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.game.closedAt, closesAt);
    const closed = t.ctx.repo.gameEvents(g.id).filter((e) => e.type === 'game.closed');
    assert.equal(closed.length, 1);
    assert.equal(closed[0]!.data.auto, true);
  } finally {
    await t.close();
  }
});

test('„edited“ am Titel nur, wenn sich die Frage nach fremden Tipps geändert hat', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Logge');
    await t.tip(g.id, 'Nöl', [10]);
    const later = new Date(t.clock.now() + 3 * 86_400_000).toISOString();
    const d = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: later, description: 'Neue Regeln' } });
    assert.equal(d.status, 200, d.text);
    assert.ok(d.body.game.editedAt, 'editedAt bleibt allgemein');
    assert.equal(d.body.game.promptEditedAt, null);
    const q = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { prompt: 'Andere Frage?' } });
    assert.equal(q.body.game.promptEditedAt, t.clock.iso());
  } finally {
    await t.close();
  }
});

test('Tippschluss: Obergrenze 2 Jahre (Jahr +010000 wäre als ISO-Text „früher“)', async () => {
  const now = Date.parse('2026-10-18T12:00:00Z');
  assert.equal(validateClosesAt('+010000-01-01T00:00:00.000Z', now).ok, false);
  assert.equal(validateClosesAt(new Date(now + 3 * 365 * 86_400_000).toISOString(), now).ok, false);
  assert.equal(validateClosesAt(new Date(now + 365 * 86_400_000).toISOString(), now).ok, true);
  const t = await makeApp();
  try {
    const r = await t.post('/api/games', {
      name: 'Logge', template: 'aa', prompt: 'Far future?', answerType: 'number',
      fields: [{ label: 'Score', unit: 'points', min: 0, max: 100, step: 1 }], closesAt: '+010000-01-01T00:00:00.000Z',
    });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.field, 'closesAt');
    const g = await t.createGame({}, 'Logge');
    const p = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: '+010000-01-01T00:00:00.000Z' } });
    assert.equal(p.status, 400, 'auch beim Verlängern');
  } finally {
    await t.close();
  }
});

test('OG-Injection: $&, $` und $\' im Prompt zerstören das HTML nicht', () => {
  const html = '<!doctype html><html><head><title>BenchBet</title></head><body></body></html>';
  const out = injectOg(html, { title: "Price $` or $' ok $&", description: 'd', url: 'u', image: 'i', pageTitle: "Price $` or $' ok $& – BenchBet" });
  assert.equal(out.split('<head>').length, 2, 'genau ein <head>');
  assert.equal(out.split('</head>').length, 2);
  assert.match(out, /<title>Price \$` or \$&#39; ok \$&amp; – BenchBet<\/title>/);
  assert.ok(!out.includes('<title><!doctype'));
});

test('Import: infoUrl nur http/https', async () => {
  const t = await makeApp();
  try {
    const snap = toSnapshot();
    (snap.games[0] as Record<string, unknown>).infoUrl = 'javascript:alert(document.domain)';
    const r = await t.post('/api/admin/import?mode=empty', snap, { 'x-admin-token': ADMIN_TOKEN });
    assert.equal(r.status, 422);
    assert.equal(r.body.error.code, 'IMPORT_INVALID');
    assert.ok(r.body.error.details.some((d: string) => /infoUrl/.test(d)));
  } finally {
    await t.close();
  }
});

test('Push: nur https-Endpoints bekannter Dienste (kein SSRF)', async () => {
  assert.equal(isAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc', DEFAULT_PUSH_HOSTS), true);
  assert.equal(isAllowedEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x', DEFAULT_PUSH_HOSTS), true);
  assert.equal(isAllowedEndpoint('https://web.push.apple.com/abc', DEFAULT_PUSH_HOSTS), true);
  assert.equal(isAllowedEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x', DEFAULT_PUSH_HOSTS), true);
  assert.equal(isAllowedEndpoint('http://fcm.googleapis.com/fcm/send/abc', DEFAULT_PUSH_HOSTS), false);
  assert.equal(isAllowedEndpoint('https://homebox.logge.top/x', DEFAULT_PUSH_HOSTS), false);
  assert.equal(isAllowedEndpoint('https://evilfcm.googleapis.com.attacker.net/x', DEFAULT_PUSH_HOSTS), false);
  assert.equal(isAllowedEndpoint('https://fcm.googleapis.com:8443/x', DEFAULT_PUSH_HOSTS), false);
  const t = await makeApp();
  try {
    const keys = { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' };
    const r = await t.post('/api/push/subscribe', { name: 'Nöl', subscription: { endpoint: 'https://127.0.0.1:3117/x', keys } });
    assert.equal(r.status, 400);
    assert.equal(r.body.error.field, 'endpoint');
    assert.equal(t.sent.length, 0, 'kein Versandversuch');
  } finally {
    await t.close();
  }
});

test('Config: TRUST_PROXY Default 1 Hop, PUSH_ENDPOINT_HOSTS überschreibbar', () => {
  assert.equal(loadConfig({ NODE_ENV: 'test' }).trustProxy, 1);
  assert.equal(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '2' }).trustProxy, 2);
  assert.equal(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: 'false' }).trustProxy, false);
  assert.equal(loadConfig({ NODE_ENV: 'test', TRUST_PROXY: '10.0.0.0/8' }).trustProxy, '10.0.0.0/8');
  assert.deepEqual(loadConfig({ NODE_ENV: 'test', PUSH_ENDPOINT_HOSTS: 'a.example, B.example' }).pushHosts, ['a.example', 'b.example']);
  assert.ok(testConfig().pushHosts.includes('fcm.googleapis.com'));
});

test('X-Forwarded-For: nur der letzte Hop zählt (Rate-Limit nicht per Header umgehbar)', async () => {
  const t = await makeApp({ config: { rateLimit: true } });
  try {
    const codes: number[] = [];
    for (let i = 0; i < 12; i++) {
      const r = await t.post('/api/tips', { name: 'Nöl', gameId: 999999, values: [1] }, { 'x-forwarded-for': `203.0.113.${i}, 198.51.100.1` });
      codes.push(r.status);
    }
    assert.ok(codes.includes(429), `erwartet 429, bekam ${codes.join(',')}`);
  } finally {
    await t.close();
  }
});

test('Spielerseiten mit Punkt im Namen liefern die SPA (Server + SW-Regel)', async () => {
  assert.ok(APP_PATH_WITH_DOT.test('/leaderboard/Max.B'));
  assert.ok(APP_PATH_WITH_DOT.test(`/leaderboard/${enc('GPT4.5')}`));
  assert.ok(!APP_PATH_WITH_DOT.test('/assets/index-abc.js'));
  assert.ok(!APP_PATH_WITH_DOT.test('/icons/icon-192.png'));
  const dir = mkdtempSync(join(tmpdir(), 'benchbet-dot-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><html><head><title>BenchBet</title></head><body></body></html>');
  const t = await makeApp({ config: { staticDir: dir } });
  try {
    const r = await t.get('/leaderboard/Max.B');
    assert.equal(r.status, 200);
    assert.match(String(r.headers['content-type']), /text\/html/);
    assert.equal((await t.get('/nope.js')).status, 404, 'echte Dateien bleiben 404');
  } finally {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

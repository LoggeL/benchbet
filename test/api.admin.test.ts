import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_TOKEN, makeApp, toSnapshot } from './helpers.ts';
import { tokenMatches } from '../server/routes/admin.ts';

test('Admin: ohne/falsches Token 401, ungültiger mode 400', async () => {
  const t = await makeApp();
  try {
    const none = await t.post('/api/admin/import', toSnapshot());
    assert.equal(none.status, 401);
    assert.deepEqual(none.body.error, { code: 'ADMIN_TOKEN', message: 'Admin token missing or wrong.' });
    const wrong = await t.post('/api/admin/import', toSnapshot(), { 'x-admin-token': ADMIN_TOKEN + 'x' });
    assert.equal(wrong.status, 401);
    const exp = await t.get('/api/admin/export', { 'x-admin-token': 'falsch' });
    assert.equal(exp.status, 401);
    const mode = await t.post('/api/admin/import?mode=alles', toSnapshot(), { 'x-admin-token': ADMIN_TOKEN });
    assert.equal(mode.status, 400);
    assert.equal(t.ctx.repo.countGames(), 0);
  } finally {
    await t.close();
  }
});

test('Admin: ohne ADMIN_TOKEN antworten die Routen mit 404', async () => {
  const t = await makeApp({ config: { adminToken: null } });
  try {
    const r = await t.post('/api/admin/import', toSnapshot(), { 'x-admin-token': ADMIN_TOKEN });
    assert.equal(r.status, 404);
    assert.equal(r.body.error.code, 'NOT_FOUND');
    assert.equal((await t.get('/api/admin/export', { 'x-admin-token': ADMIN_TOKEN })).status, 404);
  } finally {
    await t.close();
  }
});

test('Export: alle Tabellen, ohne Push-Keys', async () => {
  const t = await makeApp({ fixture: true });
  try {
    await t.subscribe('Nöl', 'https://push.example/n');
    const r = await t.get('/api/admin/export', { 'x-admin-token': ADMIN_TOKEN });
    assert.equal(r.status, 200);
    assert.equal(r.body.format, 'benchbet-export@1');
    assert.equal(r.body.tables.games.length, 14);
    assert.equal(r.body.tables.tips.length, 46);
    assert.equal(r.body.tables.players.length, 5);
    const sub = r.body.tables.push_subscriptions[0];
    assert.equal(sub.endpoint, 'https://push.example/n');
    assert.ok(!('p256dh' in sub) && !('auth' in sub));
    assert.ok(!r.text.includes('tBHItJI5svbpez7KI4CCXg'));
  } finally {
    await t.close();
  }
});

test('tokenMatches: zeitkonstant, Längen egal', () => {
  assert.equal(tokenMatches('a'.repeat(32), 'a'.repeat(32)), true);
  assert.equal(tokenMatches('a'.repeat(32), 'a'.repeat(31)), false);
  assert.equal(tokenMatches('a'.repeat(32), undefined), false);
});

test('Spieler (Admin): verstecken, Schreibweise ändern; Nicht-Admin 403', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const no = await t.patch('/api/players/big%20dick69', { name: 'Nöl', patch: { hidden: true } });
    assert.equal(no.status, 403);
    const key = encodeURIComponent('bigdick69');
    const h = await t.patch(`/api/players/${key}`, { name: 'Logge', patch: { hidden: true } });
    assert.equal(h.status, 200, h.text);
    assert.equal(h.body.player.hidden, true);
    assert.equal(h.body.player.tipCount, 1);
    const anon = await t.get('/api/state');
    assert.ok(!anon.body.players.some((p: any) => p.key === 'bigdick69'), 'versteckt im NamePicker');
    assert.ok(anon.body.stats.players.some((p: any) => p.key === 'bigdick69'), 'Ranglisten-Zeile bleibt');
    const admin = await t.get('/api/state?name=Logge');
    assert.equal(admin.body.players.find((p: any) => p.key === 'bigdick69').hidden, true);
    const rename = await t.patch(`/api/players/${encodeURIComponent('nöl')}`, { name: 'Logge', patch: { displayName: 'NÖL' } });
    assert.equal(rename.status, 200);
    assert.equal(rename.body.player.name, 'NÖL');
    const other = await t.patch(`/api/players/${encodeURIComponent('nöl')}`, { name: 'Logge', patch: { displayName: 'Noel' } });
    assert.equal(other.status, 400);
    const s = await t.get('/api/state');
    assert.ok(s.body.stats.players.some((p: any) => p.name === 'NÖL'));
  } finally {
    await t.close();
  }
});

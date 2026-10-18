import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeApp } from './helpers.ts';

const INDEX = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>BenchBet</title></head><body><div id="root"></div></body></html>';

function clientDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'benchbet-static-'));
  mkdirSync(join(dir, 'assets'));
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'index.html'), INDEX);
  writeFileSync(join(dir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{"name":"BenchBet"}');
  writeFileSync(join(dir, 'assets', 'index-abc123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png');
  return dir;
}

test('Static: Cache-Header, SPA-Fallback, OG-Tags, 404 für API und Dateien', async () => {
  const dir = clientDir();
  const t = await makeApp({ fixture: true, config: { staticDir: dir } });
  try {
    const asset = await t.get('/assets/index-abc123.js');
    assert.equal(asset.status, 200);
    assert.equal(asset.headers['cache-control'], 'public, max-age=31536000, immutable');
    const sw = await t.get('/sw.js');
    assert.equal(sw.status, 200);
    assert.equal(sw.headers['cache-control'], 'no-cache');
    assert.equal(sw.headers['service-worker-allowed'], '/');
    const man = await t.get('/manifest.webmanifest');
    assert.equal(man.headers['cache-control'], 'no-cache');
    assert.match(String(man.headers['content-type']), /manifest\+json/);
    assert.ok(man.headers['content-security-policy']);

    const root = await t.get('/');
    assert.equal(root.status, 200);
    assert.match(String(root.headers['content-type']), /text\/html/);
    assert.equal(root.headers['cache-control'], 'no-cache');
    assert.ok(root.text.includes('<meta property="og:title" content="BenchBet">'));

    const game = await t.get('/bet/1059');
    assert.equal(game.status, 200);
    assert.ok(game.text.includes('<meta property="og:title" content="Le Chaton Fat AA Index">'), game.text);
    assert.ok(game.text.includes('<meta property="og:description" content="Result: 38 points">'));
    assert.ok(game.text.includes('<meta property="og:image" content="https://benchbet.test/icons/og.png">'));
    assert.ok(game.text.includes('<meta property="og:url" content="https://benchbet.test/bet/1059">'));
    assert.ok(game.text.includes('<title>Le Chaton Fat AA Index – BenchBet</title>'));

    const g = await t.createGame({ prompt: 'Kimi <K4> – AA-Index', closesAt: '2026-10-24T16:00:00.000Z' });
    await t.tip(g.id, 'Nöl', [5]);
    const open = await t.get(`/bet/${g.id}`);
    assert.ok(open.text.includes('content="Kimi &lt;K4&gt; – AA-Index"'), 'escaped');
    assert.ok(open.text.includes('<meta property="og:description" content="1 guess · closes Sat 24 Oct, 18:00">'));
    const resolvePage = await t.get(`/bet/${g.id}/resolve`);
    assert.equal(resolvePage.status, 200);
    assert.ok(resolvePage.text.includes('<meta property="og:locale" content="en_GB">'));

    // Alte deutsche Pfade → 301 auf die englischen (Query bleibt, von=push → from=push)
    const redirects: [string, string][] = [
      ['/spiel/1059', '/bet/1059'],
      ['/spiel/1059?von=push', '/bet/1059?from=push'],
      [`/spiel/${g.id}/aufloesen`, `/bet/${g.id}/resolve`],
      [`/spiel/${g.id}/bearbeiten`, `/bet/${g.id}/edit`],
      ['/neu', '/new'],
      ['/ergebnisse', '/results'],
      ['/rangliste', '/leaderboard'],
      ['/rangliste/N%C3%B6l', '/leaderboard/N%C3%B6l'],
      ['/ich', '/me'],
      ['/so-gehts', '/how-it-works'],
    ];
    for (const [from, to] of redirects) {
      const r = await t.get(from);
      assert.equal(r.status, 301, from);
      assert.equal(r.headers.location, to, from);
    }

    const unknown = await t.get('/bet/999999');
    assert.equal(unknown.status, 200, 'unbekannte IDs: Standard-Tags, 200');
    assert.ok(unknown.text.includes('<meta property="og:description" content="Place your bet on AI models">'));

    const deep = await t.get('/leaderboard/N%C3%B6l');
    assert.equal(deep.status, 200);

    const api = await t.get('/api/gibtsnicht');
    assert.equal(api.status, 404);
    assert.deepEqual(api.body.error, { code: 'NOT_FOUND', message: 'Nothing here.' });
    const file = await t.get('/fehlt.js');
    assert.equal(file.status, 404);
  } finally {
    await t.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('healthz: ok, Version, DB', async () => {
  const t = await makeApp();
  try {
    const r = await t.get('/healthz');
    assert.equal(r.status, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.db, 'ok');
    assert.equal(r.body.version, '1.0.0+test');
    assert.equal(typeof r.body.uptimeS, 'number');
  } finally {
    await t.close();
  }
});

test('Rate-Limit: POST /api/tips 10/min → 429 mit Retry-After; neues Fenster nach 60 s', async () => {
  const t = await makeApp({ config: { rateLimit: true } });
  try {
    const g = await t.createGame();
    for (let i = 0; i < 10; i++) {
      const r = await t.post('/api/tips', { name: `Spieler${i}`, gameId: g.id, values: [i] }, { 'x-device-id': `device-rate-${i}-0000` });
      assert.equal(r.status, 201, r.text);
    }
    const over = await t.post('/api/tips', { name: 'Spieler10', gameId: g.id, values: [10] }, { 'x-device-id': 'device-rate-10-0000' });
    assert.equal(over.status, 429);
    assert.deepEqual(over.body.error, { code: 'RATE_LIMITED', message: 'Whoa, slow down. Take a breath and try again.' });
    assert.equal(over.headers['retry-after'], '60');
    assert.equal((await t.get('/healthz')).status, 200, 'healthz ohne Limit');
    t.clock.advance(60_000);
    const later = await t.post('/api/tips', { name: 'Spieler10', gameId: g.id, values: [10] }, { 'x-device-id': 'device-rate-10-0000' });
    assert.equal(later.status, 201);
  } finally {
    await t.close();
  }
});

test('Rate-Limit: CLIENT_IP_HEADER trennt Clients hinter demselben Proxy', async () => {
  const t = await makeApp({ config: { rateLimit: true, clientIpHeader: 'cf-connecting-ip' } });
  try {
    const g = await t.createGame();
    for (let i = 0; i < 10; i++) {
      const r = await t.post('/api/tips', { name: `Spieler${i}`, gameId: g.id, values: [i] }, { 'x-device-id': `device-cf-${i}-0000`, 'cf-connecting-ip': '203.0.113.1' });
      assert.equal(r.status, 201, r.text);
    }
    const sameIp = await t.post('/api/tips', { name: 'Spieler10', gameId: g.id, values: [10] }, { 'x-device-id': 'device-cf-10-0000', 'cf-connecting-ip': '203.0.113.1' });
    assert.equal(sameIp.status, 429);
    const otherIp = await t.post('/api/tips', { name: 'Spieler11', gameId: g.id, values: [11] }, { 'x-device-id': 'device-cf-11-0000', 'cf-connecting-ip': '203.0.113.2' });
    assert.equal(otherIp.status, 201, otherIp.text);
  } finally {
    await t.close();
  }
});

test('Body-Limit 64 KB → 413, kaputtes JSON → 400', async () => {
  const t = await makeApp();
  try {
    const big = await t.post('/api/games', { name: 'Logge', prompt: 'x', description: 'y'.repeat(70 * 1024) });
    assert.equal(big.status, 413);
    assert.deepEqual(big.body.error, { code: 'PAYLOAD_TOO_LARGE', message: 'That’s too much at once.' });
    const res = await t.app.inject({ method: 'POST', url: '/api/games', headers: { 'content-type': 'application/json' }, payload: '{kaputt' });
    assert.equal(res.statusCode, 400);
    assert.equal(JSON.parse(res.body).error.code, 'VALIDATION');
  } finally {
    await t.close();
  }
});

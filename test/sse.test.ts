import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { makeApp } from './helpers.ts';
import { createSse } from '../server/services/sse.ts';
import type { SseSink } from '../server/services/sse.ts';

/** Liest SSE-Blöcke von einer echten Verbindung, bis `until` erfüllt ist. */
function openStream(port: number, path: string): Promise<{ res: http.IncomingMessage; chunks: string[]; waitFor: (pred: (all: string) => boolean) => Promise<string>; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path, headers: { accept: 'text/event-stream' } }, (res) => {
      const chunks: string[] = [];
      const waiters: { pred: (s: string) => boolean; done: (s: string) => void }[] = [];
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        chunks.push(c);
        const all = chunks.join('');
        for (const w of [...waiters]) if (w.pred(all)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.done(all);
        }
      });
      resolve({
        res,
        chunks,
        waitFor: (pred) => new Promise((done, fail) => {
          const all = chunks.join('');
          if (pred(all)) return done(all);
          const timer = setTimeout(() => fail(new Error(`Timeout, bisher: ${chunks.join('')}`)), 3000);
          waiters.push({ pred, done: (s) => { clearTimeout(timer); done(s); } });
        }),
        close: () => req.destroy(),
      });
    });
    req.on('error', reject);
  });
}

test('SSE: Header, retry + hello mit serverTime; tip.created ohne Wert', async () => {
  const t = await makeApp();
  try {
    await t.app.listen({ port: 0, host: '127.0.0.1' });
    const port = (t.app.server.address() as AddressInfo).port;
    const g = await t.createGame();
    const s = await openStream(port, '/api/events?name=N%C3%B6l');
    assert.equal(s.res.statusCode, 200);
    assert.match(String(s.res.headers['content-type']), /^text\/event-stream/);
    assert.equal(s.res.headers['cache-control'], 'no-cache, no-transform');
    assert.equal(s.res.headers['x-accel-buffering'], 'no');
    assert.ok(s.res.headers['content-security-policy']);
    const hello = await s.waitFor((all) => all.includes('event: hello'));
    assert.ok(hello.startsWith('retry: 3000\n\n'));
    const data = JSON.parse(/event: hello\ndata: (.*)\n/.exec(hello)![1]!);
    assert.deepEqual(data, { serverTime: t.clock.iso(), version: t.config.version });
    assert.equal(t.ctx.sse.size, 1);

    const r = await t.tip(g.id, 'Nöl', [61.5]);
    assert.equal(r.status, 201);
    const all = await s.waitFor((x) => x.includes('event: change'));
    const block = all.slice(all.indexOf('id: '));
    const m = /^id: (\d+)\nevent: change\ndata: (.*)\n\n/.exec(block)!;
    assert.ok(Number(m[1]) > 0);
    const change = JSON.parse(m[2]!);
    assert.deepEqual(change, { type: 'tip.created', gameId: g.id, at: t.clock.iso(), actor: 'Nöl', tipCount: 1 });
    assert.ok(!block.includes('61.5') && !block.includes('61,5'), 'nie Tippwerte');

    // Ergebnis: nur Typ, kein Ergebniswert
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Logge', result: [77.7] });
    const all2 = await s.waitFor((x) => x.includes('game.resolved'));
    assert.ok(!all2.includes('77.7') && !all2.includes('77,7'));

    s.close();
    await new Promise((r2) => setTimeout(r2, 50));
    assert.equal(t.ctx.sse.size, 0, 'Verbindung entfernt');
  } finally {
    await t.close();
  }
});

test('SSE: Heartbeat alle 25 s (Fake-Timer), Backpressure schließt Verbindung', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const hub = createSse();
    const written: string[] = [];
    let destroyed = false;
    const sink = {
      write: (c: string) => { written.push(c); return true; },
      end: () => {},
      destroy: () => { destroyed = true; },
      writableNeedDrain: false,
      destroyed: false,
      writableEnded: false,
    } as unknown as SseSink;
    hub.add(sink, { serverTime: 'x', version: 'y' });
    assert.equal(written.length, 1);
    mock.timers.tick(24_999);
    assert.equal(written.length, 1);
    mock.timers.tick(1);
    assert.equal(written[1], ': ping\n\n');
    mock.timers.tick(25_000);
    assert.equal(written.filter((w) => w === ': ping\n\n').length, 2);

    (sink as { writableNeedDrain: boolean }).writableNeedDrain = true;
    hub.broadcast(1, { type: 'game.created', gameId: 1, at: 'x', actor: 'A' });
    assert.equal(destroyed, true);
    assert.equal(hub.size, 0);
    hub.closeAll();
  } finally {
    mock.timers.reset();
  }
});

test('SSE: höchstens 200 Verbindungen, darüber 503', async () => {
  const t = await makeApp();
  try {
    const hub = t.ctx.sse;
    const fake = () => ({ write: () => true, end: () => {}, destroy: () => {}, writableNeedDrain: false, destroyed: false, writableEnded: false }) as unknown as SseSink;
    for (let i = 0; i < 200; i++) hub.add(fake(), { serverTime: 'x', version: 'y' });
    const r = await t.get('/api/events');
    assert.equal(r.status, 503);
    assert.equal(r.body.error.code, 'UNAVAILABLE');
    hub.closeAll();
  } finally {
    await t.close();
  }
});

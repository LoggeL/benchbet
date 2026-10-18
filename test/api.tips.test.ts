import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.ts';

const enc = encodeURIComponent;

test('Tipp → 201 mit undoUntil; Werte anderer verdeckt bis undoUntil, danach sichtbar', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    assert.equal((await t.tip(g.id, 'LZH', [40])).status, 201);
    t.clock.advance(60_000);
    const r = await t.tip(g.id, 'Nöl', [61.5]);
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.undoUntil, new Date(t.clock.now() + 5000).toISOString());
    assert.equal(r.body.tip.isOwn, true);
    assert.deepEqual(r.body.tip.values, [61.5]);
    assert.equal(r.body.tip.isNew, true, 'erster Tipp eines neuen Spielers');
    assert.equal(r.body.game.answersRevealed, false);
    assert.equal(r.body.game.viewer.hasTipped, true);
    assert.equal(r.body.game.viewer.undoUntil, r.body.undoUntil);
    const lzh = r.body.game.tips.find((x: any) => x.playerName === 'LZH');
    assert.equal(lzh.values, null, 'im Undo-Fenster verdeckt');

    t.clock.advance(4999);
    let s = await t.get(`/api/games/${g.id}?name=${enc('Nöl')}`);
    assert.equal(s.body.game.tips.find((x: any) => x.playerName === 'LZH').values, null);
    t.clock.advance(1);
    s = await t.get(`/api/games/${g.id}?name=${enc('Nöl')}`);
    assert.equal(s.body.game.answersRevealed, true);
    assert.deepEqual(s.body.game.tips.find((x: any) => x.playerName === 'LZH').values, [40]);
    assert.equal(s.body.game.viewer.undoUntil, null);
    // Distanz/Rang gibt es erst nach der Auflösung
    assert.equal(s.body.game.tips[0].distance, null);
    assert.equal(s.body.game.tips[0].rank, null);

    // Anonym und Nicht-Tipper sehen nichts
    const anon = await t.get(`/api/games/${g.id}`);
    assert.ok(anon.body.game.tips.every((x: any) => x.values === null));
    const other = await t.get(`/api/games/${g.id}?name=Nikjay`);
    assert.ok(other.body.game.tips.every((x: any) => x.values === null));
    assert.deepEqual(other.body.game.tips.map((x: any) => x.playerName).sort(), ['LZH', 'Nöl'], 'Namen sind sichtbar');
  } finally {
    await t.close();
  }
});

test('Undo im Fenster 204, danach 409 UNDO_EXPIRED; fremder Tipp 403', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    const a = await t.tip(g.id, 'LZH', [10]);
    const del = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'lzh' });
    assert.equal(del.status, 204);
    assert.equal(t.ctx.repo.getTip(a.body.tip.id), null, 'hart gelöscht');
    const b = await t.tip(g.id, 'LZH', [11]);
    assert.equal(b.status, 201, 'nach Undo neu tippen geht');
    const foreign = await t.del(`/api/tips/${b.body.tip.id}`, { name: 'Nikjay' });
    assert.equal(foreign.status, 403);
    t.clock.advance(5000);
    const late = await t.del(`/api/tips/${b.body.tip.id}`, { name: 'LZH' });
    assert.equal(late.status, 409);
    assert.deepEqual(late.body.error, { code: 'UNDO_EXPIRED', message: 'Too late to undo – your guess is locked in.' });
  } finally {
    await t.close();
  }
});

test('TIP_EXISTS case-insensitiv, DEVICE_TIPPED, DEVICE_REQUIRED, VALIDATION mit field', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    assert.equal((await t.tip(g.id, 'Nöl', [1], 'device-x-000000001')).status, 201);
    const dup = await t.tip(g.id, ' NÖL ', [2], 'device-y-000000002');
    assert.equal(dup.status, 409);
    assert.deepEqual(dup.body.error, { code: 'TIP_EXISTS', message: 'You’ve already placed a guess on this one.' });
    const dev = await t.tip(g.id, 'Noel', [3], 'device-x-000000001');
    assert.equal(dev.status, 409);
    assert.equal(dev.body.error.code, 'DEVICE_TIPPED');
    const noDev = await t.post('/api/tips', { name: 'Nikjay', gameId: g.id, values: [1] }, { 'x-device-id': '' });
    assert.equal(noDev.body.error.code, 'DEVICE_REQUIRED');
    const step = await t.tip(g.id, 'Nikjay', [1.05]);
    assert.equal(step.status, 400);
    assert.deepEqual(step.body.error, { code: 'VALIDATION', message: 'Score: use steps of 0.1.', field: 'values' });
    const range = await t.tip(g.id, 'Nikjay', [101]);
    assert.equal(range.body.error.message, 'Score: pick a number between 0 and 100.');
    const str = await t.tip(g.id, 'Nikjay', ['50']);
    assert.equal(str.body.error.message, 'Fill in every field of your bet.', 'API nimmt nur echte JSON-Zahlen');
    const float = await t.tip(g.id, 'Nikjay', [0.3]);
    assert.equal(float.status, 201, 'Raster mit Float-Toleranz');
    assert.equal((await t.post('/api/tips', { name: 'X1', gameId: 424242, values: [1] })).body.error.code, 'GAME_NOT_FOUND');
  } finally {
    await t.close();
  }
});

test('ONE_TIP_PER_DEVICE=false: gleiches Gerät, zwei Namen erlaubt', async () => {
  const t = await makeApp({ config: { oneTipPerDevice: false } });
  try {
    const g = await t.createGame();
    assert.equal((await t.tip(g.id, 'A1', [1], 'device-same-00000')).status, 201);
    assert.equal((await t.tip(g.id, 'B2', [2], 'device-same-00000')).status, 201);
  } finally {
    await t.close();
  }
});

test('GAME_CLOSED nach automatischem Tippschluss, GAME_RESOLVED bei aufgelösten', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const g = await t.createGame({ closesAt: '2026-10-18T17:00:00.000Z' });
    t.clock.set('2026-10-18T17:00:00.000Z');
    const r = await t.tip(g.id, 'Nöl', [5]);
    assert.equal(r.status, 409);
    assert.deepEqual(r.body.error, { code: 'GAME_CLOSED', message: 'Too late – this bet is closed.' });
    const res = await t.tip(1059, 'Testi', [5]);
    assert.equal(res.body.error.code, 'GAME_RESOLVED');
  } finally {
    await t.close();
  }
});

test('Anonyme sehen nie Werte offener Wetten; geschlossen ohne eigenen Tipp bleibt verdeckt', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const s = await t.get('/api/state');
    for (const g of s.body.games) {
      if (g.phase === 'open' || g.phase === 'closed') {
        assert.ok(g.tips.every((x: any) => x.values === null), `Wette ${g.id} verdeckt`);
        assert.equal(g.result, null);
        assert.equal(g.answersRevealed, false);
      } else {
        assert.ok(g.tips.every((x: any) => x.values !== null), `Wette ${g.id} aufgedeckt`);
      }
    }
    assert.equal(s.body.me, null);

    const g = await t.createGame();
    await t.tip(g.id, 'Nöl', [10]);
    await t.tip(g.id, 'LZH', [20]);
    await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    t.clock.advance(60_000);
    const outsider = await t.get(`/api/games/${g.id}?name=Nikjay`);
    assert.equal(outsider.body.game.phase, 'closed');
    assert.ok(outsider.body.game.tips.every((x: any) => x.values === null));
    const insider = await t.get(`/api/games/${g.id}?name=LZH`);
    assert.ok(insider.body.game.tips.every((x: any) => x.values !== null));
    // Auch der Verwalter sieht in der normalen Ansicht nichts ohne eigenen Tipp
    const admin = await t.get(`/api/games/${g.id}?name=Logge`);
    assert.ok(admin.body.game.tips.every((x: any) => x.values === null));
  } finally {
    await t.close();
  }
});

test('notYetTipped: aktive Spieler ohne Tipp (Legacy-Tipps zählen über das Wett-Datum)', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const g = await t.createGame();
    await t.tip(g.id, 'Nöl', [10]);
    const r = await t.get(`/api/games/${g.id}?name=Logge`);
    const names = r.body.game.notYetTipped;
    assert.ok(names.includes('LZH') && names.includes('Nikjay'), JSON.stringify(names));
    assert.ok(!names.includes('Nöl') && !names.includes('Logge'));
  } finally {
    await t.close();
  }
});

test('Moderation: Entfernen mit Grund, Verlauf, Restore; nach Auflösung nur Admin', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    const a = await t.tip(g.id, 'Troll1', [99]);
    const noRight = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'LZH', reason: 'troll' });
    assert.equal(noRight.status, 403);
    const badReason = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'Nöl', reason: 'langweilig' });
    assert.equal(badReason.status, 400);
    const rm = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'Nöl', reason: 'troll' });
    assert.equal(rm.status, 200, rm.text);
    assert.equal(rm.body.tip.id, a.body.tip.id);
    assert.equal(rm.body.tip.removedAt, t.clock.iso());
    const after = await t.get(`/api/games/${g.id}`);
    assert.equal(after.body.game.tipCount, 0);
    const act = await t.get(`/api/games/${g.id}/activity`);
    assert.ok(act.body.events.some((e: any) => e.text === 'Nöl removed Troll1’s guess · troll.'));
    // Entfernt = gesperrt: kein neuer Tipp (hat die Werte ja schon gesehen), nur Restore durch den Verwalter
    const again = await t.tip(g.id, 'Troll1', [98], 'device-troll-second');
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'TIP_BLOCKED');
    t.clock.advance(10_000);
    const back = await t.post(`/api/tips/${a.body.tip.id}/restore`, { name: 'Nöl' });
    assert.equal(back.status, 200, back.text);
    assert.equal(back.body.tip.id, a.body.tip.id);

    // nach der Auflösung: Ersteller (kein Admin) darf nicht mehr, Admin schon
    await t.post(`/api/games/${g.id}/resolve`, { name: 'Nöl', result: [50] });
    const creatorLate = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'Nöl', reason: 'troll' });
    assert.equal(creatorLate.status, 403);
    assert.equal(creatorLate.body.error.message, 'Only an admin can do that.');
    const adminLate = await t.del(`/api/tips/${a.body.tip.id}`, { name: 'Logge', reason: 'troll' });
    assert.equal(adminLate.status, 200);
  } finally {
    await t.close();
  }
});

test('Text-Tipp: getrimmt gespeichert, 160 Zeichen', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({ template: 'text', answerType: 'text', fields: [], prompt: 'Welcher Codename?' });
    const r = await t.tip(g.id, 'Nöl', '  GLM-6  ');
    assert.equal(r.status, 201, r.text);
    assert.equal(r.body.tip.values, 'GLM-6');
    const long = await t.tip(g.id, 'LZH', 'x'.repeat(161));
    assert.equal(long.body.error.message, 'Answers need 1 to 160 characters.');
  } finally {
    await t.close();
  }
});

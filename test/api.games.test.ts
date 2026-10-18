import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp } from './helpers.ts';

const AA = { label: 'Score', unit: 'points', min: 0, max: 100, step: 0.1 };
const base = (over: Record<string, unknown> = {}) => ({
  name: 'Logge', template: 'aa', prompt: 'Kimi K4 – AA-Index', description: 'Regeltext', infoUrl: 'https://artificialanalysis.ai/leaderboards/models',
  benchmark: 'AA-Index', answerType: 'number', fields: [AA], closesAt: '2026-10-23T18:00:00.000Z', ...over,
});

test('Anlegen: 201, Phase open, Ersteller angelegt, Validierungstexte', async () => {
  const t = await makeApp();
  try {
    const r = await t.post('/api/games', base());
    assert.equal(r.status, 201, r.text);
    const g = r.body.game;
    assert.equal(g.phase, 'open');
    assert.equal(g.createdBy, 'Logge');
    assert.equal(g.canManage, true);
    assert.equal(g.ruleSummary, 'Closest wins · 0–100 points · steps of 0.1');
    assert.equal(g.closesAt, '2026-10-23T18:00:00.000Z');
    assert.deepEqual(g.tips, []);
    assert.ok(t.ctx.repo.getPlayer('logge'));

    const empty = await t.post('/api/games', base({ prompt: '   ' }));
    assert.equal(empty.status, 400);
    assert.deepEqual(empty.body.error, { code: 'VALIDATION', message: 'No question, no bet.', field: 'prompt' });

    const past = await t.post('/api/games', base({ closesAt: '2026-10-18T16:05:00.000Z' }));
    assert.equal(past.status, 400);
    assert.equal(past.body.error.message, 'The deadline has to be at least 10 minutes from now.');
    assert.equal(past.body.error.field, 'closesAt');

    const url = await t.post('/api/games', base({ infoUrl: 'javascript:alert(1)' }));
    assert.equal(url.body.error.message, 'That doesn’t look like a link.');

    const units = await t.post('/api/games', base({ fields: [AA, { ...AA, label: 'B', unit: '%' }] }));
    assert.equal(units.body.error.message, 'All values need the same unit so they can be scored together.');

    const noName = await t.post('/api/games', base({ name: undefined }));
    assert.equal(noName.status, 400);
    assert.equal(noName.body.error.code, 'NAME_REQUIRED');
    assert.equal(noName.body.error.message, 'Who are you? Pick a name first.');

    const badName = await t.post('/api/games', base({ name: '!!!' }));
    assert.equal(badName.body.error.code, 'NAME_INVALID');

    const text = await t.post('/api/games', base({ template: 'text', answerType: 'text', fields: [], prompt: 'Wie heißt das nächste Modell?' }));
    assert.equal(text.status, 201, text.text);
    assert.equal(text.body.game.ruleSummary, 'Right answer wins · Logge decides what counts');
  } finally {
    await t.close();
  }
});

test('Rechte: Fremde 403, Admin per ADMIN_NAMES (Groß-/Kleinschreibung egal)', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    const foreign = await t.post(`/api/games/${g.id}/close`, { name: 'LZH' });
    assert.equal(foreign.status, 403);
    assert.deepEqual(foreign.body.error, { code: 'FORBIDDEN', message: 'Only Nöl can do that.' });
    const creator = await t.patch(`/api/games/${g.id}`, { name: 'NÖL', patch: { description: 'neu' } });
    assert.equal(creator.status, 200, creator.text);
    const admin = await t.post(`/api/games/${g.id}/close`, { name: '  logge ' });
    assert.equal(admin.status, 200, admin.text);
    assert.equal(admin.body.game.phase, 'closed');
    assert.equal(admin.body.game.canManage, true);
    const missing = await t.post('/api/games/99999/close', { name: 'Logge' });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'GAME_NOT_FOUND');
  } finally {
    await t.close();
  }
});

test('Bearbeiten ohne fremde Tipps: Felder änderbar, eigener Tipp wird zurückgesetzt', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    assert.equal((await t.tip(g.id, 'Logge', [50])).status, 201);
    const r = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { fields: [{ ...AA, max: 200 }] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.game.fields[0].max, 200);
    assert.equal(r.body.game.tipCount, 0, 'Tipp des Erstellers gelöscht');
    assert.equal(r.body.game.editedAt, null, 'ohne fremde Tipps kein „bearbeitet“');
    const act = await t.get(`/api/games/${g.id}/activity`);
    assert.ok(act.body.events.some((e: any) => e.type === 'game.edited' && e.text.includes('the number fields') && e.text.includes('was reset')));
  } finally {
    await t.close();
  }
});

test('Bearbeiten mit fremden Tipps: FIELDS_LOCKED, Frage änderbar → editedAt', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({ closesAt: '2026-10-25T18:00:00.000Z' });
    assert.equal((await t.tip(g.id, 'Nöl', [50])).status, 201);
    assert.equal((await t.tip(g.id, 'LZH', [40])).status, 201);
    const locked = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { answerType: 'text', fields: [] } });
    assert.equal(locked.status, 409);
    assert.equal(locked.body.error.code, 'FIELDS_LOCKED');
    assert.equal(locked.body.error.message, 'Locked – 2 people have already placed a guess. Changing it now wouldn’t be fair.');
    // gleiche Felder mitschicken ist erlaubt
    const r = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { prompt: 'Kimi K4.1 – AA-Index', fields: [AA] } });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.game.prompt, 'Kimi K4.1 – AA-Index');
    assert.equal(r.body.game.editedAt, t.clock.iso());
    // Tippschluss verkürzen: mind. jetzt + 10 min
    const short = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: '2026-10-18T16:05:00.000Z' } });
    assert.equal(short.status, 400);
    assert.equal(short.body.error.field, 'closesAt');
    const ok = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: '2026-10-19T18:00:00.000Z' } });
    assert.equal(ok.status, 200);
    const none = await t.patch(`/api/games/${g.id}`, { name: 'Logge', patch: { closesAt: null } });
    assert.equal(none.body.game.closesAt, null);
  } finally {
    await t.close();
  }
});

test('Bearbeiten aufgelöster Wetten: nur Regeln, Quelle, Thema', async () => {
  const t = await makeApp({ fixture: true });
  try {
    const p = await t.patch('/api/games/1059', { name: 'Logge', patch: { prompt: 'Neu' } });
    assert.equal(p.status, 409);
    assert.equal(p.body.error.code, 'GAME_RESOLVED');
    const d = await t.patch('/api/games/1059', { name: 'Logge', patch: { description: 'Genauer erklärt', benchmark: 'AA', template: 'legacy' } });
    assert.equal(d.status, 200, d.text);
    assert.equal(d.body.game.description, 'Genauer erklärt');
    assert.equal(d.body.game.template, 'legacy');
  } finally {
    await t.close();
  }
});

test('Schließen und Wieder öffnen', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({ closesAt: '2026-10-23T18:00:00.000Z' });
    const c = await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    assert.equal(c.status, 200);
    assert.equal(c.body.game.phase, 'closed');
    assert.equal(c.body.game.closedAt, t.clock.iso());
    assert.equal(c.body.game.closedBy, 'Logge');
    assert.equal(c.body.game.closesAt, '2026-10-23T18:00:00.000Z', 'closesAt bleibt (geplant war …)');
    const again = await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'GAME_NOT_OPEN');

    const act = await t.get(`/api/games/${g.id}/activity`);
    const closed = act.body.events.find((e: any) => e.type === 'game.closed');
    assert.equal(closed.text, 'Logge closed the bet (planned for Fri 23 Oct, 20:00).');
    assert.equal(closed.deviceTag.length, 6);

    const bad = await t.post(`/api/games/${g.id}/reopen`, { name: 'Logge', closesAt: '2026-10-18T16:01:00.000Z' });
    assert.equal(bad.status, 400);
    // Undo des Schließens: bisheriger Tippschluss
    const undo = await t.post(`/api/games/${g.id}/reopen`, { name: 'Logge', closesAt: '2026-10-23T18:00:00.000Z' });
    assert.equal(undo.status, 200, undo.text);
    assert.equal(undo.body.game.phase, 'open');
    assert.equal(undo.body.game.closedAt, null);
    const notClosed = await t.post(`/api/games/${g.id}/reopen`, { name: 'Logge', closesAt: null });
    assert.equal(notClosed.status, 409);
    assert.equal(notClosed.body.error.code, 'GAME_NOT_CLOSED');
    await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    const open = await t.post(`/api/games/${g.id}/reopen`, { name: 'Logge', closesAt: null });
    assert.equal(open.body.game.closesAt, null);
    assert.equal(open.body.game.phase, 'open');
  } finally {
    await t.close();
  }
});

test('Löschen, Papierkorb, Wiederherstellen, endgültig nach 30 Tagen', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame({}, 'Nöl');
    await t.tip(g.id, 'LZH', [12]);
    const d = await t.del(`/api/games/${g.id}`, { name: 'Nöl' });
    assert.equal(d.status, 200, d.text);
    assert.equal(d.body.deletedAt, t.clock.iso());
    assert.equal(d.body.restoreUntil, '2026-11-17T16:00:00.000Z');
    assert.equal((await t.get(`/api/games/${g.id}`)).status, 404);
    assert.equal((await t.get('/api/state')).body.games.length, 0);
    assert.equal((await t.post('/api/tips', { name: 'Nikjay', gameId: g.id, values: [1] })).status, 404);

    const own = await t.get('/api/trash?name=N%C3%B6l');
    assert.equal(own.body.games.length, 1);
    assert.equal(own.body.games[0].deletedAt, d.body.deletedAt);
    assert.equal(own.body.games[0].restoreUntil, d.body.restoreUntil);
    assert.equal((await t.get('/api/trash?name=LZH')).body.games.length, 0);
    assert.equal((await t.get('/api/trash?name=Logge')).body.games.length, 1, 'Admin sieht alle');

    const notDel = await t.createGame();
    const nd = await t.post(`/api/games/${notDel.id}/restore`, { name: 'Logge' });
    assert.equal(nd.status, 409);
    assert.equal(nd.body.error.code, 'NOT_DELETED');

    const r = await t.post(`/api/games/${g.id}/restore`, { name: 'Nöl' });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.body.game.tipCount, 1);

    await t.del(`/api/games/${g.id}`, { name: 'Nöl' });
    t.clock.advance(31 * 24 * 3600 * 1000);
    const late = await t.post(`/api/games/${g.id}/restore`, { name: 'Nöl' });
    assert.equal(late.status, 404);
    await t.ctx.scheduler.tick();
    assert.equal(t.ctx.repo.getGame(g.id), null, 'endgültig gelöscht');
    assert.equal(t.ctx.repo.activeTips(g.id).length, 0, 'Tipps per Kaskade weg');
  } finally {
    await t.close();
  }
});

test('Verlauf: Texte, ohne tip.created', async () => {
  const t = await makeApp();
  try {
    const g = await t.createGame();
    await t.tip(g.id, 'Nöl', [5]);
    await t.post(`/api/games/${g.id}/close`, { name: 'Logge' });
    const a = await t.get(`/api/games/${g.id}/activity`);
    assert.equal(a.status, 200);
    const types = a.body.events.map((e: any) => e.type);
    assert.deepEqual(types, ['game.created', 'game.closed']);
    assert.equal(a.body.events[0].text, 'Logge created the bet.');
    assert.equal(a.body.events[0].actorName, 'Logge');
  } finally {
    await t.close();
  }
});

test('Lesen: ungültiger Name → 400 NAME_INVALID, X-Server-Time + Sicherheits-Header', async () => {
  const t = await makeApp();
  try {
    const r = await t.get('/api/state?name=%20%20%3F%3F');
    assert.equal(r.status, 400);
    assert.equal(r.body.error.code, 'NAME_INVALID');
    const ok = await t.get('/api/state?name=Neu');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body.me, { name: 'Neu', key: 'neu', isAdmin: false, known: false });
    assert.equal(t.ctx.repo.getPlayer('neu'), null, 'Lesen legt nichts an');
    assert.equal(ok.headers['x-server-time'], t.clock.iso());
    assert.equal(ok.headers['cache-control'], 'no-store');
    assert.match(String(ok.headers['content-security-policy']), /frame-ancestors 'none'/);
    assert.equal(ok.headers['x-content-type-options'], 'nosniff');
    assert.equal(ok.body.config.undoSeconds, 5);
    assert.ok(ok.body.config.vapidPublicKey.length > 40);
  } finally {
    await t.close();
  }
});

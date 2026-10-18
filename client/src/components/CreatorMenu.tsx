// Verwalter-Menü ⋯ (§1.4.2.3): Aktionen nach Risiko geordnet, Löschen ganz unten mit DangerSheet.
import { useState } from 'react';
import type { GameDTO, RemovedReason } from '../../../shared/types.ts';
import { joinNames } from '../../../shared/format.ts';
import { api, fail, load, loadGame } from '../api.ts';
import { C } from '../copy.ts';
import { navigate } from '../router.ts';
import * as st from '../store.ts';
import { isDone, ph, valueText } from '../util.ts';
import { DangerSheet } from './DangerSheet.tsx';
import { DeadlineChips, deadlineIso, type Deadline } from './DeadlineChips.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Sheet } from './Sheet.tsx';

type View = 'menu' | 'reopen' | 'tips' | 'delete' | { remove: number };

export function CreatorMenu({ game: g, open, onClose }: { game: GameDTO; open: boolean; onClose: () => void }) {
  const [view, setView] = useState<View>('menu');
  const [dl, setDl] = useState<{ c: Deadline; d: string }>({ c: 'd3', d: '' });
  const [reason, setReason] = useState<RemovedReason | null>(null);
  const [busy, setBusy] = useState(false);
  const me = st.useStore((s) => s.state?.me ?? null);
  const p = ph(g);
  const done = isDone(p);
  const isAdmin = !!me?.isAdmin;
  const isCreator = me?.key === g.createdByKey;
  const shut = () => {
    setView('menu');
    onClose();
  };

  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const closeNow = () => run(async () => {
    const prev = g.closesAt;
    const r = await api.close(g.id);
    st.upsertGame(r.game);
    shut();
    st.toast(C.manage.closed, {
      undo: () => {
        // Der Server nimmt den bisherigen Tippschluss zurück, solange er in der Zukunft liegt (keepPlanned).
        // Ist er schon vorbei, nicht still ohne Tippschluss öffnen – dann bitte über „Reopen“ neu wählen.
        if (prev && Date.parse(prev) <= st.now()) return st.toast(C.manage.deadlinePassed);
        api.reopen(g.id, prev ?? null).then((x) => st.upsertGame(x.game), fail);
      },
    });
  });

  const reopen = () => run(async () => {
    const r = await api.reopen(g.id, deadlineIso(dl.c, dl.d));
    st.upsertGame(r.game);
    shut();
    st.toast(C.manage.reopened);
  });

  const del = () => run(async () => {
    await api.remove(g.id);
    st.dropGame(g.id);
    shut();
    navigate('/', { replace: true });
    st.toast(C.manage.deleted, {
      undo: () => {
        api.restore(g.id).then((x) => { st.upsertGame(x.game); st.toast(C.manage.restored); }, fail);
      },
    });
  });

  const removeTip = (tipId: number, who: string) => run(async () => {
    await api.removeTip(tipId, reason!);
    await loadGame(g.id);
    setView('tips');
    setReason(null);
    st.toast(C.manage.removed(who), {
      undo: () => {
        api.restoreTip(tipId).then(() => loadGame(g.id), fail);
      },
    });
    void load();
  });

  const item = (icon: IconName, label: string, onClick: () => void, danger?: boolean) => (
    <li>
      <button type="button" className={danger ? 'menu-item danger' : 'menu-item'} onClick={onClick} disabled={busy}>
        <Icon n={icon} />
        {label}
      </button>
    </li>
  );

  const winners = g.tips.filter((t) => t.isWinner).map((t) => t.playerName);
  const canTips = g.tips.some((t) => !t.isOwn) && (!done || isAdmin);
  const canFix = p === 'resolved' || (p === 'archived' && isAdmin);

  if (view === 'delete') {
    return (
      <DangerSheet open={open} onClose={shut} title={C.manage.delTitle} confirm={C.manage.del} onConfirm={del}>
        <p>{C.manage.delBody(g.prompt, g.tipCount)}</p>
        {done && winners.length > 0 && <p>{C.manage.delBoard(C.manage.delLose(winners, joinNames))}</p>}
        <p className="muted">{C.manage.delRestore}</p>
      </DangerSheet>
    );
  }

  if (typeof view === 'object') {
    const t = g.tips.find((x) => x.id === view.remove);
    return (
      <Sheet open={open} onClose={() => setView('tips')} title={C.manage.removeTitle(t?.playerName ?? '')}>
        <div className="sheet-body">
          <p className="field-label">{C.manage.reasonLabel}</p>
          <div className="chips" role="radiogroup" aria-label={C.manage.reasonLabel}>
            {(['duplicate', 'troll', 'request'] as const).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} className="chip" onClick={() => setReason(r)}>
                {C.manage.reasons[r]}
              </button>
            ))}
          </div>
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-danger" disabled={!reason || busy} onClick={() => t && removeTip(t.id, t.playerName)}>
            {C.manage.remove}
          </button>
        </div>
      </Sheet>
    );
  }

  if (view === 'tips') {
    return (
      <Sheet open={open} onClose={() => setView('menu')} title={C.manage.tips}>
        <ul className="sheet-body tiplist">
          {g.tips.map((t) => (
            <li key={t.id}>
              <span>
                <b>{t.playerName}</b>
                {t.values != null && <span className="muted num"> · {valueText(g, t.values)}</span>}
              </span>
              {/* Eigener Tipp: nur über Undo direkt nach dem Tippen (sonst spicken und neu tippen) */}
              {!t.isOwn && (
                <button type="button" className="btn btn-small btn-ghost danger-text" onClick={() => { setReason(null); setView({ remove: t.id }); }}>
                  {C.manage.remove}
                </button>
              )}
            </li>
          ))}
        </ul>
      </Sheet>
    );
  }

  if (view === 'reopen') {
    return (
      <Sheet open={open} onClose={() => setView('menu')} title={C.manage.reopen}>
        <div className="sheet-body">
          <DeadlineChips value={dl.c} date={dl.d} label={C.manage.reopenTitle} onChange={(c, d) => setDl({ c, d })} />
        </div>
        <div className="sheet-actions">
          <button type="button" className="btn btn-primary" onClick={reopen} disabled={busy}>{C.manage.reopen}</button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet open={open} onClose={shut} title={isAdmin && !isCreator ? C.manage.headAdmin : C.manage.head(me?.name ?? '')}>
      <ul className="menu">
        {(!done || canFix) && item('check', done ? C.manage.correct : C.manage.resolve, () => { shut(); navigate(`/bet/${g.id}/resolve`); })}
        {p === 'open' && item('lock', C.manage.close, closeNow)}
        {p === 'closed' && item('undo', C.manage.reopen, () => setView('reopen'))}
        {item('edit', C.manage.edit, () => { shut(); navigate(`/bet/${g.id}/edit`); })}
        {canTips && item('user', C.manage.tips, () => setView('tips'))}
        <li className="menu-sep" role="separator" />
        {item('trash', C.manage.del, () => setView('delete'), true)}
      </ul>
    </Sheet>
  );
}

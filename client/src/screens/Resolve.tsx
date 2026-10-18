// Ergebnis eintragen / korrigieren (§1.4.3): erst schließen, dann Eingabe mit Live-Vorschau statt Bestätigungsdialog.
import { useEffect, useRef, useState } from 'react';
import type { GameDTO, ResolvePreview, TipValues } from '../../../shared/types.ts';
import { formatNumber, joinNames } from '../../../shared/format.ts';
import { textSuggestions } from '../../../shared/scoring.ts';
import { validateResult } from '../../../shared/parse.ts';
import { api, fail, load } from '../api.ts';
import { C } from '../copy.ts';
import { back, navigate } from '../router.ts';
import * as st from '../store.ts';
import { distText, isDone, ph, safeHref, useFullscreen } from '../util.ts';
import { FsHeader } from '../components/FsHeader.tsx';
import { MultiNumberTip } from '../components/MultiNumberTip.tsx';
import { NumberTip } from '../components/NumberTip.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { TextTip } from '../components/TextTip.tsx';
import { WinnerPicker } from '../components/WinnerPicker.tsx';
import { Gone } from './Bet.tsx';

function PreviewLine({ g, p }: { g: GameDTO; p: ResolvePreview }) {
  const ranked = p.tips.filter((t) => t.rank != null).sort((a, b) => a.rank! - b.rank!);
  const w = ranked.filter((t) => t.isWinner);
  if (!w.length) return <p className="pv">{C.resolve.sumNone}</p>;
  if (w.length > 1) return <p className="pv">{C.resolve.shared(joinNames(w.map((t) => t.playerName)))}</p>;
  const rest = ranked.filter((t) => !t.isWinner).slice(0, 4);
  return (
    <p className="pv">
      {C.resolve.wins} <b>{w[0]!.playerName}</b>
      {w[0]!.distance != null && C.resolve.winsD(distText(g, w[0]!.distance))}
      {rest.map((t) => <span key={t.id}> · #{t.rank} {t.playerName} ({formatNumber(t.distance ?? 0)})</span>)}
    </p>
  );
}

function ResolveForm({ g }: { g: GameDTO }) {
  const fix = isDone(ph(g));
  const [vals, setVals] = useState<(number | null)[]>(() =>
    Array.isArray(g.result) ? g.result : g.fields.map(() => null));
  const [answer, setAnswer] = useState(typeof g.result === 'string' ? g.result : '');
  const [checked, setChecked] = useState<Set<number>>(() => new Set(g.tips.filter((t) => t.isWinner).map((t) => t.id)));
  const [nobody, setNobody] = useState(fix && g.answerType === 'text' && !g.tips.some((t) => t.isWinner));
  const [manual, setManual] = useState(fix);
  const [preview, setPreview] = useState<ResolvePreview | null>(null);
  const [allTips, setAllTips] = useState<ResolvePreview['tips']>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const isText = g.answerType === 'text';
  const result: TipValues | null = isText ? (answer.trim() || null) : vals.every((v) => v != null) ? (vals as number[]) : null;
  const valid = result != null && validateResult(g, result).ok;
  const seq = useRef(0);

  // Vorschau (dryRun, Debounce 250 ms). Erster Lauf holt alle Tipps (für Punkte bzw. Antwort-Cluster).
  useEffect(() => {
    const n = ++seq.current;
    const probe = valid ? result : isText ? null : g.fields.map((f) => f.min);
    const winnerIds = isText && valid ? [...checked] : undefined;
    const t = setTimeout(() => {
      api.preview(g.id, probe, fix, winnerIds).then((r) => {
        if (n !== seq.current) return;
        setAllTips(r.preview.tips);
        setPreview(valid ? r.preview : null);
      }, (e) => n === seq.current && valid && fail(e));
    }, allTips.length ? 250 : 0);
    return () => clearTimeout(t);
  }, [JSON.stringify(result), isText ? [...checked].join() : '', valid]);

  // Text: Haken automatisch nach normalisierter Gleichheit, solange niemand selbst gewählt hat
  const sugg = textSuggestions(answer, allTips);
  useEffect(() => {
    if (!isText || manual) return;
    setChecked(new Set(sugg.checked));
    setNobody(false);
  }, [answer, allTips.length]);

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    const ids = isText ? (nobody ? [] : [...checked]) : undefined;
    try {
      const r = fix
        ? await api.correct(g.id, result!, reason.trim(), ids)
        : await api.resolve(g.id, result, ids);
      st.upsertGame(r.game);
      void load();
      navigate(`/bet/${g.id}`, { replace: true });
      st.toast(fix ? C.resolve.fixed : C.resolve.done);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  const marks = g.fields.map((_, i) => allTips.map((t) => (t.values as number[])[i]!).filter((v) => typeof v === 'number'));
  return (
    <form className="rform" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {!allTips.length && preview == null && g.tipCount === 0 && <p className="note">{C.resolve.noTips}</p>}
      {isText ? (
        <>
          <TextTip label={C.resolve.answer} value={answer} onChange={setAnswer} autoFocus />
          {allTips.length > 0 && (
            <WinnerPicker tips={allTips} checked={nobody ? new Set() : checked} similar={new Set(sugg.similar)} nobody={nobody}
              onChange={(c, nb) => { setChecked(c); setNobody(nb); setManual(true); }} />
          )}
        </>
      ) : g.fields.length > 1 ? (
        <MultiNumberTip fields={g.fields} values={vals} onChange={setVals} checkStep={false} marks={marks} hint={C.resolve.finer} />
      ) : (
        <NumberTip field={g.fields[0]!} value={vals[0] ?? null} onChange={(v) => setVals([v])} checkStep={false}
          marks={marks[0]} hint={C.resolve.finer} />
      )}

      {!isText && <div className="pv-wrap" aria-live="polite">{preview && <PreviewLine g={g} p={preview} />}</div>}

      {fix && (
        <label className="fld">
          <span className="field-label">{C.resolve.reason}</span>
          <input className="input" type="text" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
          <span className="chips">
            {C.resolve.reasonChips.map((r) => (
              <button key={r} type="button" className="chip" aria-pressed={reason === r} onClick={() => setReason(r)}>{r}</button>
            ))}
          </span>
        </label>
      )}

      <div className="formfoot">
        <p className="formfoot-note">{C.resolve.warn}</p>
        <button type="submit" className="btn btn-primary" disabled={!valid || busy}>
          {busy ? C.resolve.publishing : fix ? C.resolve.publishFix : C.resolve.publish}
        </button>
      </div>
    </form>
  );
}

export function Resolve({ id }: { id: number }) {
  const g = st.useGame(id);
  const loaded = st.useStore((s) => s.state != null);
  const isAdmin = st.useStore((s) => !!s.state?.me?.isAdmin);
  const [busy, setBusy] = useState(false);
  st.useTick();
  useFullscreen();

  useEffect(() => {
    if (!g) return;
    if (!g.canManage || (ph(g) === 'archived' && !isAdmin)) {
      navigate(`/bet/${id}`, { replace: true });
      st.toast(g.canManage ? C.resolve.archivedAdminOnly : C.manage.noRight(g.createdBy));
    }
  }, [g?.canManage, isAdmin]);

  if (!g) return loaded ? <Gone /> : <Skeleton rows={2} />;
  const p = ph(g);
  const fix = isDone(p);

  const closeFirst = async () => {
    setBusy(true);
    try {
      const r = await api.close(g.id);
      st.upsertGame(r.game);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="resolve fs">
      <FsHeader title={fix ? C.resolve.titleFix : C.resolve.title} sub={g.prompt} onBack={() => back(`/bet/${id}`)}
        right={safeHref(g.infoUrl) ? <a href={safeHref(g.infoUrl)!} target="_blank" rel="noopener noreferrer" className="ext small ext-hit">{C.rules.source}</a> : undefined} />
      {p === 'open' ? (
        <div className="card pad">
          <p>
            {C.resolve.stillOpen}
            {g.notYetTipped.length > 0 && <> {C.notYet(joinNames(g.notYetTipped))}.</>}
          </p>
          <button type="button" className="btn btn-primary" onClick={closeFirst} disabled={busy}>{C.resolve.closeAndGo}</button>
        </div>
      ) : (
        <ResolveForm g={g} />
      )}
    </div>
  );
}

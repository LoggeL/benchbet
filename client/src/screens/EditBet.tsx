// Wette bearbeiten (§1.4.5): gleiches Formular, Sperren nach fremden Tipps bzw. nach der Auflösung.
import { useEffect, useState } from 'react';
import type { GameDTO, GameInput } from '../../../shared/types.ts';
import { api, fail } from '../api.ts';
import { C } from '../copy.ts';
import { back, navigate } from '../router.ts';
import * as st from '../store.ts';
import { useFullscreen } from '../util.ts';
import { FsHeader } from '../components/FsHeader.tsx';
import { fromGame, GameForm, type FormState } from '../components/GameForm.tsx';
import { Skeleton } from '../components/Skeleton.tsx';
import { Gone } from './Bet.tsx';

function buildPatch(g: GameDTO, i: GameInput): Partial<GameInput> {
  const p: Partial<GameInput> = {};
  if (i.prompt !== g.prompt) p.prompt = i.prompt;
  if ((i.description ?? '') !== g.description) p.description = i.description;
  if ((i.infoUrl ?? null) !== g.infoUrl) p.infoUrl = i.infoUrl ?? null;
  if ((i.benchmark ?? '') !== g.benchmark) p.benchmark = i.benchmark;
  if (!g.resolvedAt) {
    const a = g.closesAt ? Date.parse(g.closesAt) : null;
    const b = i.closesAt ? Date.parse(i.closesAt) : null;
    if ((a == null) !== (b == null) || (a != null && b != null && Math.abs(a - b) >= 60_000)) p.closesAt = i.closesAt;
    if (i.answerType !== g.answerType) p.answerType = i.answerType;
    if (i.answerType !== g.answerType || JSON.stringify(i.fields) !== JSON.stringify(g.fields)) p.fields = i.fields;
  }
  return p;
}

export function EditBet({ id }: { id: number }) {
  const g = st.useGame(id);
  const loaded = st.useStore((s) => s.state != null);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  useFullscreen();

  useEffect(() => {
    if (g && !form) setForm(fromGame(g));
    if (g && !g.canManage) {
      navigate(`/bet/${id}`, { replace: true });
      st.toast(C.manage.noRight(g.createdBy));
    }
  }, [g]);

  if (!g) return loaded ? <Gone /> : <Skeleton rows={2} />;
  if (!form) return null;

  const submit = async (input: GameInput) => {
    const patch = buildPatch(g, input);
    if (!Object.keys(patch).length) return back(`/bet/${id}`);
    setBusy(true);
    try {
      const r = await api.patchGame(id, patch);
      st.upsertGame(r.game);
      st.toast(C.manage.saved);
      navigate(`/bet/${id}`, { replace: true });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="edit fs">
      <FsHeader title={C.create.editTitle} sub={g.prompt} onBack={() => back(`/bet/${id}`)} />
      <GameForm mode="edit" game={g} state={form} onChange={setForm} onSubmit={submit} tpl={null} busy={busy}
        submitLabel={C.create.save} busyLabel={C.create.saving} footNote={' '} />
    </div>
  );
}

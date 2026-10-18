// Ich: Name, Push, App, Darstellung, Papierkorb, Admin (§1.4.9).
import { useEffect, useState, type ReactNode } from 'react';
import type { GameDTO, PlayerDTO } from '../../../shared/types.ts';
import { api, fail, load } from '../api.ts';
import { C } from '../copy.ts';
import { deviceTag } from '../storage.ts';
import * as st from '../store.ts';
import { applyTheme, getTheme, type Theme } from '../theme.ts';
import { Avatar } from '../components/Avatar.tsx';
import { Icon } from '../components/Icon.tsx';
import { InstallSheet } from '../components/InstallSheet.tsx';
import { Link } from '../components/Link.tsx';
import { NamePicker } from '../components/NamePicker.tsx';
import { PushSettings } from '../components/PushSettings.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { useInstall } from '../pwa.ts';

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="grp">
      <h2 className="label">{title}{note && <span className="label-n"> · {note}</span>}</h2>
      <div className="card pad">{children}</div>
    </section>
  );
}

function Trash({ name }: { name: string }) {
  const [games, setGames] = useState<GameDTO[] | null>(null);
  const refresh = () => api.trash().then((r) => setGames(r.games), () => setGames([]));
  useEffect(() => void refresh(), [name]);
  if (!games?.length) return null;
  const days = (g: GameDTO) => Math.max(0, Math.ceil((Date.parse(g.restoreUntil ?? g.deletedAt!) - st.now()) / 86_400_000));
  return (
    <Group title={C.me.trash}>
      <ul className="trash">
        {games.map((g) => (
          <li key={g.id}>
            <span><b>{g.prompt}</b> <span className="muted">· {C.me.trashRow(days(g))}</span></span>
            <button type="button" className="btn btn-small btn-secondary" onClick={() =>
              api.restore(g.id).then((r) => { st.upsertGame(r.game); st.toast(C.manage.restored); void refresh(); void load(); }, fail)}>
              {C.me.restore}
            </button>
          </li>
        ))}
      </ul>
    </Group>
  );
}

function AdminRow({ p }: { p: PlayerDTO }) {
  const [dn, setDn] = useState(p.name);
  const save = (patch: { hidden?: boolean; displayName?: string }) =>
    api.patchPlayer(p.key, patch).then(() => { st.toast(C.manage.saved); void load(); }, fail);
  return (
    <li className="adm">
      <Avatar name={p.name} size="xs" />
      <input className="input input-s" value={dn} aria-label={`${C.me.displayName} ${p.name}`} maxLength={40}
        onChange={(e) => setDn(e.target.value)} onBlur={() => dn.trim() && dn !== p.name && save({ displayName: dn.trim() })} />
      <label className="switch">
        <input type="checkbox" role="switch" checked={!p.hidden} onChange={(e) => save({ hidden: !e.target.checked })} />
        <span>{C.me.showInPicker}</span>
      </label>
    </li>
  );
}

export function Me() {
  const name = st.useName();
  const me = st.useStore((s) => s.state?.me ?? null);
  const players = st.usePlayers();
  const version = st.useStore((s) => s.state?.version ?? __APP_VERSION__);
  const [tag, setTag] = useState('……');
  const [switching, setSwitching] = useState(false);
  const [theme, setTheme] = useState<Theme>(getTheme);
  const [iosSheet, setIosSheet] = useState(false);
  const inst = useInstall();
  useEffect(() => void deviceTag().then(setTag), []);
  const drafts = st.tipDraftKeys().length;

  return (
    <div className="me">
      <h1 className="h1 page-title">{C.me.title}</h1>
      <Group title={C.me.you}>
        {name ? (
          <div className="me-you">
            <Avatar name={name} size="l" />
            <div className="me-name">
              <b>{name}</b>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => setSwitching(true)}>{C.me.switch}</button>
            </div>
          </div>
        ) : (
          <>
            <p className="me-who">{C.whoAreYou}</p>
            <NamePicker />
          </>
        )}
        <p className="muted small">{C.me.about(tag)}</p>
      </Group>

      <Group title={C.me.push} note={C.me.pushNote}>
        <PushSettings />
      </Group>

      {!inst.isStandalone && (
        <Group title={C.me.app}>
          {inst.canPrompt || inst.isIOS ? (
            <button type="button" className="btn btn-secondary" onClick={() => (inst.canPrompt ? void inst.prompt() : setIosSheet(true))}>
              <Icon n="download" size={18} /> {C.me.install}
            </button>
          ) : (
            <p className="muted">{C.me.installHint}</p>
          )}
        </Group>
      )}

      <Group title={C.me.look}>
        <div className="seg-ctl" role="radiogroup" aria-label={C.me.look}>
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={theme === t} onClick={() => { setTheme(t); applyTheme(t); }}>
              {t !== 'system' && <Icon n={t === 'light' ? 'sun' : 'moon'} size={16} />}
              {C.me.themes[t]}
            </button>
          ))}
        </div>
      </Group>

      {name && <Trash name={name} />}

      {me?.isAdmin && (
        <Group title={C.me.admin}>
          <ul className="adm-list">{players.map((p) => <AdminRow key={p.key} p={p} />)}</ul>
        </Group>
      )}

      <p className="me-links"><Link to="/how-it-works">{C.me.howto} →</Link></p>
      <p className="muted small center num">{C.me.footer(version)}</p>

      <Sheet open={switching} onClose={() => setSwitching(false)} title={C.me.switch}>
        <div className="sheet-body">
          {name && <p className="muted small">{C.name.switchHint(name)}</p>}
          {drafts > 0 && <p className="note">{C.name.draftsLost(drafts)}</p>}
          <NamePicker onDone={() => setSwitching(false)} />
        </div>
      </Sheet>
      <InstallSheet open={iosSheet} onClose={() => setIosSheet(false)} />
    </div>
  );
}

import { TEXT_MAX } from '../../../shared/parse.ts';
import { C } from '../copy.ts';

const autoFocusOk = typeof navigator !== 'undefined' && !/iPad|iPhone|iPod/.test(navigator.userAgent)
  && !(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Freie Antwort: eine Zeile, keine Vorschläge (sonst würden andere Tipps verraten). */
export function TextTip({ value, onChange, onEnter, disabled, label = C.tip.textLabel, autoFocus = true }: {
  value: string; onChange: (v: string) => void; onEnter?: () => void; disabled?: boolean; label?: string; autoFocus?: boolean;
}) {
  const len = [...value].length;
  return (
    <div className="ttip">
      <label className="field-label" htmlFor="ttip">{label}</label>
      <input id="ttip" className="input input-l" type="text" value={value} maxLength={TEXT_MAX} disabled={disabled}
        placeholder={C.tip.textPlaceholder} enterKeyHint="send" autoComplete="off" autoCapitalize="off" autoCorrect="off"
        spellCheck={false} autoFocus={autoFocus && autoFocusOk}
        onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onEnter?.()} />
      {len >= 140 && <span className="counter num" aria-live="polite">{len}/{TEXT_MAX}</span>}
    </div>
  );
}

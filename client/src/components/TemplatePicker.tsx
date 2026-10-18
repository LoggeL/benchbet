import type { Template } from '../../../shared/templates.ts';
import { TEMPLATES } from '../../../shared/templates.ts';
import { C } from '../copy.ts';

/** Stufe 1: Vorlagen als Kacheln (2 Spalten, ≥ 96 px). */
export function TemplatePicker({ onPick }: { onPick: (t: Template) => void }) {
  return (
    <section className="tpl">
      <h1 className="h1">{C.create.pick}</h1>
      <ul className="tpl-grid">
        {TEMPLATES.map((t) => (
          <li key={t.key}>
            <button type="button" className={`tile-btn tpl-${t.key}`} onClick={() => onPick(t)}>
              <span className="tpl-badge num" aria-hidden="true">{t.badge}</span>
              <span className="tpl-title">{t.title}</span>
              <span className="tpl-ex">{t.example}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

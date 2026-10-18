import { C } from '../copy.ts';
import * as st from '../store.ts';
import { clip } from '../util.ts';
import { Avatar } from './Avatar.tsx';
import { Icon } from './Icon.tsx';
import { Link } from './Link.tsx';

/** Wer du bist, steht immer oben. Ohne Namen öffnet ein Tap den NamePicker. */
export function NameChip() {
  const name = st.useName();
  if (!name) {
    return (
      <button type="button" className="namechip anon" onClick={() => st.set({ namePicker: true })}>
        <Icon n="user" size={18} />
        {C.whoAreYou}
      </button>
    );
  }
  return (
    <Link to="/me" className="namechip" aria-label={C.chipLabel(name)}>
      <Avatar name={name} size="xs" />
      <span className="namechip-n">{clip(name, 12)}</span>
    </Link>
  );
}

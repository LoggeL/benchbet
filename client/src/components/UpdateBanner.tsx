// "New version – reload" (SPEC §1.5.9). The waiting SW only takes over after this tap (SKIP_WAITING).
import { useUpdate } from '../pwa.ts';
import { Icon } from './Icon.tsx';

export function UpdateBanner(_props: Record<string, never>) {
  const u = useUpdate();
  return (
    <div className="banner t-hi" role="status">
      <Icon n="bolt" size={18} />
      <p>
        Fresh version’s here.{' '}
        <button type="button" className="link-btn" onClick={u.reload}>Reload</button>
      </p>
    </div>
  );
}

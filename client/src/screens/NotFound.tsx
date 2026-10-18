import { C } from '../copy.ts';
import { EmptyState } from '../components/EmptyState.tsx';
import { Link } from '../components/Link.tsx';

export function NotFound() {
  return (
    <EmptyState big title={C.empty.notFound} text="">
      <Link to="/" className="btn btn-primary">{C.toOpen}</Link>
    </EmptyState>
  );
}

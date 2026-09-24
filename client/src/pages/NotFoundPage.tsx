import { Link } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';
import { Compass } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-slate-100 p-6">
      <div className="w-full">
        <EmptyState
          icon={<Compass className="h-6 w-6" aria-hidden="true" />}
          title="Page not found"
          description="The page you're looking for doesn't exist or has moved."
          action={
            <Link to="/">
              <Button>Go home</Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}

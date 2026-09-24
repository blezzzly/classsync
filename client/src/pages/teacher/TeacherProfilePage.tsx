import { MonitorSmartphone, MoonStar, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { Badge, Button, Card, PageHeader } from '../../components/ui';
import { SimulateOfflineCard } from '../../components/SimulateOfflineCard';

export function TeacherProfilePage() {
  const { user, signOut } = useAuth();
  const { isOnline } = useConnection();

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Profile" subtitle="Account & settings" />

      <Card className="mb-4 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-lg font-bold text-white">
          {user?.name?.charAt(0) ?? 'T'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{user?.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="brand">Teacher</Badge>
            <Badge tone={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
          </div>
        </div>
      </Card>

      <div className="space-y-4">
        <SimulateOfflineCard />

        <Card className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <MonitorSmartphone className="h-4 w-4 text-teal-700" aria-hidden="true" />
            About ClassSync
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Offline-first learning prototype. Student answers persist in IndexedDB on this device and
            sync to the SQLite-backed server automatically when connectivity returns.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              Scores are calculated server-side from answer keys
            </li>
            <li className="flex items-center gap-1.5">
              <MoonStar className="h-3.5 w-3.5 text-sky-600" aria-hidden="true" />
              Works as an installable PWA with an app-shell cache
            </li>
          </ul>
        </Card>

        <Button variant="secondary" block onClick={signOut}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

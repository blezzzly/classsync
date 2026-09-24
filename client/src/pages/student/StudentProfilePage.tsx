import { BookOpen, Database, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { useSync } from '../../context/SyncContext';
import { Badge, Button, Card, ConfirmDialog, PageHeader } from '../../components/ui';
import { SimulateOfflineCard } from '../../components/SimulateOfflineCard';
import { useToast } from '../../context/ToastContext';
import { clearDatabase } from '../../db/schema';
import { listCachedActivities, listDraftAnswers, listLocalSubmissions, listSyncQueueItems } from '../../db/repositories';
import { useEffect, useState } from 'react';

export function StudentProfilePage() {
  const { user, signOut } = useAuth();
  const { isOnline } = useConnection();
  const { pending, failed, lastSyncedAt, syncNow, syncing } = useSync();
  const toast = useToast();
  const [stats, setStats] = useState({ activities: 0, drafts: 0, submissions: 0, queued: 0 });
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    void (async () => {
      const [activities, drafts, submissions, queued] = await Promise.all([
        listCachedActivities(),
        listDraftAnswers(),
        user ? listLocalSubmissions({ studentId: user.id }) : Promise.resolve([]),
        listSyncQueueItems(),
      ]);
      setStats({
        activities: activities.length,
        drafts: drafts.length,
        submissions: submissions.length,
        queued: queued.length,
      });
    })();
  }, [user, pending, failed, lastSyncedAt]);

  const clearLocal = async () => {
    setClearing(true);
    try {
      await clearDatabase();
      setStats({ activities: 0, drafts: 0, submissions: 0, queued: 0 });
      toast.success('Local offline data cleared');
      setConfirmClear(false);
    } catch {
      toast.error('Could not clear local data');
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader title="Profile" subtitle="Account & offline storage" />

      <Card className="mb-4 flex items-center gap-4">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-600 text-lg font-bold text-white">
          {user?.name?.charAt(0) ?? 'S'}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{user?.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge tone="info">Student</Badge>
            <Badge tone={isOnline ? 'success' : 'warning'}>{isOnline ? 'Online' : 'Offline'}</Badge>
          </div>
        </div>
      </Card>

      <Card className="mb-4">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
          <Database className="h-4 w-4 text-teal-700" aria-hidden="true" />
          Stored on this device
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-left sm:grid-cols-4">
          {[
            { label: 'Cached activities', value: stats.activities },
            { label: 'Saved answers', value: stats.drafts },
            { label: 'Submissions', value: stats.submissions },
            { label: 'Sync queue', value: stats.queued },
          ].map((entry) => (
            <div key={entry.label} className="rounded-xl bg-slate-50 px-2 py-3">
              <dt className="text-[11px] font-medium text-slate-500">{entry.label}</dt>
              <dd className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{entry.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
          Data lives in IndexedDB (Dexie). It survives refreshes, browser restarts, and network
          loss until the server confirms each submission.
        </p>
        <div className="mt-3 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1 min-h-10 text-xs"
            onClick={() => void syncNow()}
            loading={syncing}
            disabled={!isOnline || (pending + failed === 0)}
          >
            Sync now
          </Button>
          <Button
            variant="ghost"
            className="flex-1 min-h-10 text-xs text-red-600 hover:bg-red-50"
            onClick={() => setConfirmClear(true)}
            disabled={stats.activities + stats.drafts + stats.submissions + stats.queued === 0}
          >
            Clear local data
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <SimulateOfflineCard />

        <Card className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <BookOpen className="h-4 w-4 text-teal-700" aria-hidden="true" />
            About ClassSync
          </p>
          <p className="text-xs leading-relaxed text-slate-500">
            Offline-first learning platform. Join with a code, answer with no internet, and your
            work syncs the moment you reconnect.
          </p>
          <ul className="space-y-1.5 text-xs text-slate-500">
            <li className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
              Scores are graded on the server — never trusted from the client
            </li>
          </ul>
        </Card>

        <Button variant="secondary" block onClick={signOut}>
          Sign out
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Clear local data?"
        description="This removes cached activities, saved answers, and pending submissions from this device. Anything already synced stays on the server. This cannot be undone."
        confirmLabel="Clear data"
        destructive
        loading={clearing}
        onConfirm={() => void clearLocal()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}

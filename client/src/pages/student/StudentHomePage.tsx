import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CloudUpload, QrCode, RefreshCw, Sparkles } from 'lucide-react';
import type { CachedActivity } from '../../db/schema';
import { listCachedActivities, listLocalSubmissions } from '../../db/repositories';
import { formatRelative } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { useSync } from '../../context/SyncContext';

export function StudentHomePage() {
  const { user } = useAuth();
  const { isOnline, simulatedOffline } = useConnection();
  const { pending, failed, syncing, syncNow, lastSyncedAt } = useSync();
  const [activities, setActivities] = useState<CachedActivity[]>([]);
  const [submissions, setSubmissions] = useState<Array<{ id: string; status: string; updatedAt: string; activityId: string }>>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cached, local] = await Promise.all([
        listCachedActivities(),
        user ? listLocalSubmissions({ studentId: user.id }) : Promise.resolve([]),
      ]);
      setActivities(cached);
      setSubmissions(
        local.map((item) => ({
          id: item.id,
          status: item.status,
          updatedAt: item.updatedAt,
          activityId: item.activityId,
        })),
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeActivities = activities.filter((activity) => activity.status === 'published');
  const recent = [...activities].sort((a, b) => b.cachedAt!.localeCompare(a.cachedAt!)).slice(0, 3);
  const pendingSubs = submissions.filter((s) => s.status !== 'SYNCED');

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title={`Hi, ${user?.name?.split(' ')[0] ?? 'there'}`}
        subtitle={isOnline ? 'Ready to learn' : 'Working offline — you can still answer'}
      />

      {!isOnline && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            You&apos;re offline
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-800">
            Your work is saved on this device{simulatedOffline ? ' (simulated offline)' : ''}.
            Open any cached activity below to keep answering. Submissions will sync automatically
            when you&apos;re back online.
          </p>
        </div>
      )}

      <Card className="mb-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Sync status
            </p>
            <p className="mt-1 text-sm font-bold text-slate-900">
              {syncing
                ? 'Syncing your work...'
                : failed > 0
                  ? `${failed} submission${failed === 1 ? '' : 's'} failed to sync`
                  : pending > 0
                    ? `${pending} waiting to sync`
                    : lastSyncedAt
                      ? 'Everything is synced'
                      : 'Nothing to sync right now'}
            </p>
            {lastSyncedAt && !syncing && pending === 0 && failed === 0 && (
              <p className="text-xs text-slate-500">Last sync {formatRelative(lastSyncedAt)}</p>
            )}
          </div>
          <Button
            variant="secondary"
            className="min-h-10 px-3 text-xs"
            loading={syncing}
            onClick={() => void syncNow()}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Sync now
          </Button>
        </div>
      </Card>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <Link to="/student/join" className="block">
          <Card className="flex h-full flex-col items-center justify-center gap-2 py-5 text-center transition hover:border-teal-300">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <QrCode className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold text-slate-900">Join with code</span>
          </Card>
        </Link>
        <Link to="/student/activities" className="block">
          <Card className="flex h-full flex-col items-center justify-center gap-2 py-5 text-center transition hover:border-teal-300">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-700">
              <BookOpen className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-sm font-bold text-slate-900">My activities</span>
          </Card>
        </Link>
      </div>

      <section aria-labelledby="active-heading" className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="active-heading" className="text-sm font-bold text-slate-800">
            Active activities
          </h2>
          <Link
            to="/student/activities"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700"
          >
            All <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>

        {loading ? (
          <Spinner label="Loading your activities..." />
        ) : activeActivities.length === 0 ? (
          <EmptyState
            icon={<Sparkles className="h-6 w-6" aria-hidden="true" />}
            title="No activities yet"
            description="Join an activity with a code from your teacher to download it for offline use."
            action={
              <Link to="/student/join">
                <Button>Enter activity code</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {recent.map((activity) => (
              <li key={activity.id}>
                <Link to={`/student/activities/${activity.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 transition hover:border-teal-300">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{activity.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {activity.questions.length} questions · cached {formatRelative(activity.cachedAt)}
                      </p>
                    </div>
                    <Badge tone="success">Saved</Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-subs-heading">
        <h2 id="recent-subs-heading" className="mb-3 text-sm font-bold text-slate-800">
          Recent activity
        </h2>
        {pendingSubs.length === 0 && submissions.length === 0 ? (
          <Card className="py-5 text-left text-sm text-slate-500">
            Submissions you send will show up here with their sync status.
          </Card>
        ) : (
          <ul className="space-y-2">
            {submissions.slice(0, 4).map((submission) => {
              const activityTitle =
                activities.find((activity) => activity.id === submission.activityId)?.title ??
                'Activity';
              const label =
                submission.status === 'SYNCED'
                  ? 'Synced'
                  : submission.status === 'SYNC_FAILED'
                    ? 'Failed'
                    : submission.status === 'SYNCING'
                      ? 'Syncing'
                      : 'Pending sync';
              const tone =
                submission.status === 'SYNCED'
                  ? 'success'
                  : submission.status === 'SYNC_FAILED'
                    ? 'danger'
                    : 'warning';
              return (
                <li key={submission.id}>
                  <Card className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{activityTitle}</p>
                      <p className="text-xs text-slate-500">{formatRelative(submission.updatedAt)}</p>
                    </div>
                    <Badge tone={tone as 'success' | 'danger' | 'warning'}>{label}</Badge>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

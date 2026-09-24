import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, RefreshCw, RotateCcw } from 'lucide-react';
import type { LocalSubmission } from '@shared/types';
import { listCachedActivities, listLocalSubmissions } from '../../db/repositories';
import { formatRelative } from '../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { useSync } from '../../context/SyncContext';
import { useToast } from '../../context/ToastContext';

function statusBadge(status: LocalSubmission['status']) {
  switch (status) {
    case 'SYNCED':
      return <Badge tone="success">Synced</Badge>;
    case 'SYNCING':
      return <Badge tone="info">Syncing...</Badge>;
    case 'SYNC_FAILED':
      return <Badge tone="danger">Sync failed</Badge>;
    case 'PENDING_SYNC':
      return <Badge tone="warning">Pending sync</Badge>;
    default:
      return <Badge tone="neutral">Draft</Badge>;
  }
}

export function StudentSubmissionsPage() {
  const { user } = useAuth();
  const { isOnline } = useConnection();
  const { syncNow, refreshCounts, syncing, pending, failed } = useSync();
  const toast = useToast();
  const [items, setItems] = useState<LocalSubmission[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const [subs, cached] = await Promise.all([
        listLocalSubmissions({ studentId: user.id }),
        listCachedActivities(),
      ]);
      subs.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      setItems(subs);
      const map: Record<string, string> = {};
      for (const activity of cached) map[activity.id] = activity.title;
      setTitles(map);
      await refreshCounts();
    } catch {
      setError('Could not load your submissions from this device.');
    } finally {
      setLoading(false);
    }
  }, [user, refreshCounts]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSync = async () => {
    await syncNow();
    await load();
  };

  const retryOne = async () => {
    if (!isOnline) {
      toast.info("You're offline. Your submission is safe — it will sync when you reconnect.");
      return;
    }
    await syncNow();
    await load();
  };

  if (loading) return <Spinner label="Loading submissions..." />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const waiting = items.filter((item) => item.status !== 'SYNCED');

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Submissions"
        subtitle={`${items.length} on this device`}
        action={
          <Button
            variant="secondary"
            className="min-h-10 px-3 text-xs"
            onClick={() => void handleSync()}
            loading={syncing}
            disabled={!isOnline || (pending + failed === 0)}
            title={isOnline ? 'Sync now' : 'Offline'}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Sync now
          </Button>
        }
      />

      {!isOnline && waiting.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs leading-relaxed text-amber-900">
          <p className="font-bold">You&apos;re offline. Your work is saved on this device.</p>
          <p className="mt-1 text-amber-800">
            {waiting.length} submission{waiting.length === 1 ? '' : 's'} waiting. Sync starts
            automatically when you&apos;re back online.
          </p>
        </div>
      )}

      {failed > 0 && isOnline && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs leading-relaxed text-red-800">
          <p className="font-bold">
            {failed} submission{failed === 1 ? '' : 's'} failed to sync.
          </p>
          <p className="mt-1">Your answers are still saved. Use Retry to try again.</p>
        </div>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" aria-hidden="true" />}
          title="No submissions yet"
          description="When you complete and submit an activity, it will appear here with its sync status."
          action={
            <Link to="/student/activities">
              <Button>Browse activities</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">
                      {titles[item.activityId] ?? 'Activity'}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {item.status === 'SYNCED' && item.score !== undefined
                        ? `Score ${item.score}/${item.maxScore} · `
                        : ''}
                      {item.answers.length} answer{item.answers.length === 1 ? '' : 's'} ·{' '}
                      {formatRelative(item.updatedAt)}
                    </p>
                    {item.status === 'SYNCED' && item.serverSubmissionId && (
                      <p className="mt-1 text-[11px] text-slate-400">
                        Confirmed by server · id {item.serverSubmissionId.slice(0, 12)}…
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    {statusBadge(item.status)}
                    {item.status === 'SYNCED' && item.score !== undefined && (
                      <span className="text-lg font-bold tabular-nums text-slate-900">
                        {item.score}
                        <span className="text-sm font-semibold text-slate-400">/{item.maxScore}</span>
                      </span>
                    )}
                  </div>
                </div>

                {item.status !== 'SYNCED' && (
                  <div className="mt-3 flex gap-2">
                    <Link
                      to={`/student/activities/${item.activityId}`}
                      className="flex-1"
                    >
                      <Button variant="secondary" block className="min-h-9 text-xs">
                        View activity
                      </Button>
                    </Link>
                    <Button
                      className="flex-1 min-h-9 text-xs"
                      loading={syncing}
                      disabled={!isOnline}
                      onClick={() => void retryOne()}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      {item.status === 'SYNC_FAILED' ? 'Retry' : 'Sync'}
                    </Button>
                  </div>
                )}
                {item.status !== 'SYNCED' && !isOnline && (
                  <p className="mt-2 text-[11px] font-medium text-amber-700">
                    Waiting for connection — will sync automatically.
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, RefreshCw } from 'lucide-react';
import type { Submission } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useConnection } from '../../context/ConnectionContext';

function syncBadge(submission: Submission) {
  if (submission.status === 'synced') {
    return <Badge tone="success">Synced</Badge>;
  }
  return <Badge tone="info">Received</Badge>;
}

export function TeacherSubmissionsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useConnection();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { submissions: list } = await api.listSubmissions();
      setSubmissions(list);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.kind === 'offline' || err.kind === 'network'
            ? "You're offline. Submissions will appear when you reconnect."
            : err.message
          : 'Could not load submissions',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, isOnline]);

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Submissions"
        subtitle={loading ? 'Loading...' : `${submissions.length} total`}
        action={
          <Button
            variant="secondary"
            className="min-h-10 px-3 text-xs"
            onClick={() => void load()}
            loading={loading}
            disabled={!isOnline}
            title={isOnline ? 'Refresh' : 'Offline — cannot refresh'}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        }
      />

      {!isOnline && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-medium leading-relaxed text-amber-800">
          You&apos;re offline. Students&apos; new submissions will arrive after they sync and you
          reconnect.
        </p>
      )}

      {loading ? (
        <Spinner label="Loading submissions..." />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : submissions.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6" aria-hidden="true" />}
          title="No submissions yet"
          description="When students complete an activity online or their offline work syncs, it will show up here with scores."
        />
      ) : (
        <ul className="space-y-3">
          {submissions.map((submission) => (
            <li key={submission.id}>
              <Link to={`/teacher/submissions/${submission.id}`} className="block">
                <Card className="transition hover:border-teal-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">
                        {submission.studentName ?? 'Student'}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {submission.activityTitle ?? 'Activity'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-400">
                        {formatDateTime(submission.submittedAt)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <span className="text-lg font-bold tabular-nums text-slate-900">
                        {submission.score}
                        <span className="text-sm font-semibold text-slate-400">
                          /{submission.maxScore}
                        </span>
                      </span>
                      <div className="flex gap-1.5">
                        <Badge tone="success">Submitted</Badge>
                        {syncBadge(submission)}
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] text-slate-400">
        Scores are calculated on the server from answer keys.
      </p>
    </div>
  );
}

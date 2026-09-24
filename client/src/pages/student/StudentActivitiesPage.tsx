import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, CloudDownload, QrCode } from 'lucide-react';
import type { CachedActivity } from '../../db/schema';
import { listCachedActivities } from '../../db/repositories';
import { listLocalSubmissions } from '../../db/repositories';
import { formatRelative } from '../../lib/format';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';

export function StudentActivitiesPage() {
  const { user } = useAuth();
  const [activities, setActivities] = useState<CachedActivity[]>([]);
  const [submissionByActivity, setSubmissionByActivity] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cached, subs] = await Promise.all([
        listCachedActivities(),
        user ? listLocalSubmissions({ studentId: user.id }) : Promise.resolve([]),
      ]);
      setActivities(cached);
      const map: Record<string, string> = {};
      const sorted = [...subs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      for (const sub of sorted) {
        if (!map[sub.activityId]) map[sub.activityId] = sub.status;
      }
      setSubmissionByActivity(map);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const statusLabel = (status: string | undefined) => {
    switch (status) {
      case 'SYNCED':
        return <Badge tone="success">Synced</Badge>;
      case 'SYNCING':
        return <Badge tone="info">Syncing</Badge>;
      case 'SYNC_FAILED':
        return <Badge tone="danger">Sync failed</Badge>;
      case 'PENDING_SYNC':
        return <Badge tone="warning">Pending sync</Badge>;
      default:
        return null;
    }
  };

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="My activities"
        subtitle={`${activities.length} saved on this device`}
        action={
          <Link to="/student/join">
            <Button className="min-h-10 px-3 py-2 text-xs">
              <QrCode className="h-4 w-4" aria-hidden="true" /> Join
            </Button>
          </Link>
        }
      />

      {loading ? (
        <Spinner label="Loading saved activities..." />
      ) : activities.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="h-6 w-6" aria-hidden="true" />}
          title="Nothing cached yet"
          description="Join an activity with a code and it will be downloaded to this device for offline use."
          action={
            <Link to="/student/join">
              <Button>Enter activity code</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Link to={`/student/activities/${activity.id}`} className="block">
                <Card className="transition hover:border-teal-300">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{activity.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {activity.description || activity.type}
                      </p>
                      <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                        <span>{activity.questions.length} questions</span>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <CloudDownload className="h-3 w-3" aria-hidden="true" />
                          cached {formatRelative(activity.cachedAt)}
                        </span>
                        {activity.code && (
                          <>
                            <span>·</span>
                            <span className="font-mono font-semibold">{activity.code}</span>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge tone="success">Offline ready</Badge>
                      {statusLabel(submissionByActivity[activity.id])}
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

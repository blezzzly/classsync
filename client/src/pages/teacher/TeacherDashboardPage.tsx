import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, ClipboardCheck, Clock, Layers, Users } from 'lucide-react';
import type { DashboardData } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, Spinner, StatCard } from '../../components/ui';
import { useConnection } from '../../context/ConnectionContext';

export function TeacherDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { isOnline } = useConnection();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { dashboard } = await api.dashboard();
      setData(dashboard);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.kind === 'offline' || err.kind === 'network'
            ? "You're offline. Dashboard data will refresh when you reconnect."
            : err.message
          : 'Could not load your dashboard';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, isOnline]);

  if (loading) return <Spinner label="Loading dashboard..." />;
  if (error || !data) {
    return (
      <ErrorState description={error ?? 'Dashboard unavailable'} onRetry={() => void load()} />
    );
  }

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Dashboard"
        subtitle="Your class at a glance"
        action={
          <Link to="/teacher/activities/new">
            <Button className="min-h-10 px-3 py-2 text-xs">New activity</Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Activities" value={data.totalActivities} icon={<Layers className="h-4 w-4" />} />
        <StatCard label="Active" value={data.activeActivities} tone="success" icon={<Activity className="h-4 w-4" />} />
        <StatCard label="Students" value={data.totalStudents} tone="info" icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="Pending"
          value={data.pendingSubmissions}
          tone="warning"
          icon={<ClipboardCheck className="h-4 w-4" />}
        />
      </div>

      <section className="mt-6" aria-labelledby="recent-activities">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-activities" className="text-sm font-bold text-slate-800">
            Recent activities
          </h2>
          <Link
            to="/teacher/activities"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {data.recentActivities.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-6 w-6" aria-hidden="true" />}
            title="No activities yet"
            description="Create your first activity, publish it, and share the code with students."
            action={
              <Link to="/teacher/activities/new">
                <Button>Create activity</Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {data.recentActivities.map((activity) => (
              <li key={activity.id}>
                <Link to={`/teacher/activities/${activity.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 transition hover:border-teal-300">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{activity.title}</p>
                      <p className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        {formatRelative(activity.updatedAt)}
                      </p>
                    </div>
                    <Badge tone={activity.status === 'published' ? 'success' : 'neutral'}>
                      {activity.status === 'published' ? (activity.code ?? 'Published') : 'Draft'}
                    </Badge>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-6" aria-labelledby="recent-submissions">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="recent-submissions" className="text-sm font-bold text-slate-800">
            Recent submissions
          </h2>
          <Link
            to="/teacher/submissions"
            className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            View all <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
        {data.recentSubmissions.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="h-6 w-6" aria-hidden="true" />}
            title="No submissions yet"
            description="Submissions appear here once students complete and sync an activity."
          />
        ) : (
          <ul className="space-y-3">
            {data.recentSubmissions.map((submission) => (
              <li key={submission.id}>
                <Link to={`/teacher/submissions/${submission.id}`} className="block">
                  <Card className="flex items-center justify-between gap-3 transition hover:border-teal-300">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {submission.studentName ?? 'Student'}
                      </p>
                      <p className="truncate text-xs text-slate-500">{submission.activityTitle}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">
                        {submission.score}/{submission.maxScore}
                      </p>
                      <Badge tone={submission.status === 'synced' ? 'success' : 'info'}>
                        {submission.status === 'synced' ? 'Synced' : 'Received'}
                      </Badge>
                    </div>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!isOnline && (
        <p className="mt-6 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
          You&apos;re offline. Cached data is shown above; live updates resume when you reconnect.
        </p>
      )}
    </div>
  );
}

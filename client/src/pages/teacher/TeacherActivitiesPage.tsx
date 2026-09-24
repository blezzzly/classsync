import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Layers, Plus } from 'lucide-react';
import type { Activity } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { formatRelative } from '../../lib/format';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

export function TeacherActivitiesPage() {
  const { user } = useAuth();
  const toast = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { activities: list } = await api.listActivities();
      setActivities(list);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.kind === 'offline' || err.kind === 'network'
            ? "You're offline. Activities can't be fetched right now."
            : err.message
          : 'Could not load activities',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async (activity: Activity) => {
    setPublishingId(activity.id);
    try {
      const { activity: published } = await api.publishActivity(activity.id);
      setActivities((current) =>
        current.map((item) => (item.id === published.id ? published : item)),
      );
      toast.success(`Published! Activity code: ${published.code}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not publish activity');
    } finally {
      setPublishingId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Copied ${code}`);
    } catch {
      toast.info(`Activity code: ${code}`);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteActivity(deleteTarget.id);
      setActivities((current) => current.filter((item) => item.id !== deleteTarget.id));
      toast.success('Activity deleted');
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not delete activity');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <Spinner label="Loading activities..." />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  return (
    <div className="animate-fade-in-up">
      <PageHeader
        title="Activities"
        subtitle={`${activities.length} total`}
        action={
          <Link to="/teacher/activities/new">
            <Button className="min-h-10 px-3 py-2 text-xs">
              <Plus className="h-4 w-4" aria-hidden="true" /> New
            </Button>
          </Link>
        }
      />

      {activities.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" aria-hidden="true" />}
          title="No activities yet"
          description="Create a quiz or short-answer activity, then publish it to generate a join code."
          action={
            <Link to="/teacher/activities/new">
              <Button>Create activity</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-3">
          {activities.map((activity) => (
            <li key={activity.id}>
              <Card className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      to={`/teacher/activities/${activity.id}`}
                      className="text-sm font-bold text-slate-900 hover:text-teal-700"
                    >
                      {activity.title}
                    </Link>
                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-slate-500">
                      {activity.description || 'No description'}
                    </p>
                    <p className="mt-1.5 text-[11px] text-slate-400">
                      {activity.questions.length} question{activity.questions.length === 1 ? '' : 's'}{' '}
                      · updated {formatRelative(activity.updatedAt)}
                    </p>
                  </div>
                  <Badge tone={activity.status === 'published' ? 'success' : 'neutral'}>
                    {activity.status === 'published' ? 'Published' : 'Draft'}
                  </Badge>
                </div>

                {activity.status === 'published' && activity.code && (
                  <button
                    type="button"
                    onClick={() => void copyCode(activity.code!)}
                    className="flex w-full items-center justify-between rounded-xl bg-teal-50 px-3 py-2 text-left ring-1 ring-inset ring-teal-100 transition hover:bg-teal-100 focus-visible:outline-2 focus-visible:outline-teal-700"
                  >
                    <span>
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-teal-600">
                        Activity code
                      </span>
                      <span className="font-mono text-sm font-bold tracking-widest text-teal-900">
                        {activity.code}
                      </span>
                    </span>
                    <Copy className="h-4 w-4 text-teal-600" aria-hidden="true" />
                  </button>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link to={`/teacher/activities/${activity.id}`} className="flex-1">
                    <Button variant="secondary" block className="min-h-10 text-xs">
                      View
                    </Button>
                  </Link>
                  <Link to={`/teacher/activities/${activity.id}/edit`} className="flex-1">
                    <Button variant="secondary" block className="min-h-10 text-xs">
                      Edit
                    </Button>
                  </Link>
                  {activity.status === 'draft' && (
                    <Button
                      className="flex-1 min-h-10 text-xs"
                      loading={publishingId === activity.id}
                      onClick={() => void publish(activity)}
                    >
                      Publish
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    className="min-h-10 px-3 text-xs text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(activity)}
                  >
                    Delete
                  </Button>
                </div>
                {user?.role !== 'teacher' && null}
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete activity?"
        description={`"${deleteTarget?.title}" and its questions will be permanently removed. Submissions keep their records.`}
        confirmLabel="Delete"
        destructive
        loading={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

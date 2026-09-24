import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, Clock, Copy, Pencil, Play, Timer } from 'lucide-react';
import type { Activity, ProgressEntry } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Badge, Button, Card, ErrorState, PageHeader, Spinner } from '../../components/ui';
import { useToast } from '../../context/ToastContext';

const statusLabels: Record<ProgressEntry['status'], { label: string; tone: 'neutral' | 'warning' | 'success' }> = {
  not_started: { label: 'Not Started', tone: 'neutral' },
  in_progress: { label: 'In Progress', tone: 'warning' },
  submitted: { label: 'Submitted', tone: 'success' },
};

export function TeacherActivityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [roster, setRoster] = useState<ProgressEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { activity: data } = await api.getActivity(id);
      setActivity(data);
      if (data.status === 'published') {
        try {
          const { roster: entries } = await api.progress(id);
          setRoster(entries);
        } catch {
          setRoster([]);
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load activity');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    if (!id) return;
    setPublishing(true);
    try {
      const { activity: published } = await api.publishActivity(id);
      setActivity(published);
      toast.success(`Published! Share code ${published.code} with students.`);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Could not publish');
    } finally {
      setPublishing(false);
    }
  };

  const copyCode = async () => {
    if (!activity?.code) return;
    try {
      await navigator.clipboard.writeText(activity.code);
      toast.success(`Copied ${activity.code}`);
    } catch {
      toast.info(`Activity code: ${activity.code}`);
    }
  };

  if (loading) return <Spinner label="Loading activity..." />;
  if (error || !activity) {
    return <ErrorState description={error ?? 'Activity not found'} onRetry={() => void load()} />;
  }

  const totalPoints = activity.questions.reduce((sum, question) => sum + question.points, 0);

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => navigate('/teacher/activities')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Activities
      </button>

      <PageHeader
        title={activity.title}
        subtitle={activity.type}
        action={
          <Badge tone={activity.status === 'published' ? 'success' : 'neutral'}>
            {activity.status === 'published' ? 'Published' : 'Draft'}
          </Badge>
        }
      />

      {activity.status === 'published' && activity.code && (
        <button
          type="button"
          onClick={() => void copyCode()}
          className="mb-4 flex w-full items-center justify-between rounded-2xl bg-teal-700 px-4 py-3.5 text-left text-white shadow-md transition hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <span>
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-teal-100">
              Student join code
            </span>
            <span className="font-mono text-xl font-bold tracking-[0.2em]">{activity.code}</span>
          </span>
          <Copy className="h-5 w-5" aria-hidden="true" />
        </button>
      )}

      <Card className="mb-4">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-600">
          {activity.description || 'No instructions provided.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            {activity.questions.length} questions · {totalPoints} pts
          </span>
          {activity.deadline && (
            <span className="inline-flex items-center gap-1">
              <Timer className="h-3.5 w-3.5" aria-hidden="true" />
              Due {formatDateTime(activity.deadline)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            {formatDateTime(activity.updatedAt)}
          </span>
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap gap-2">
        {activity.status === 'draft' && (
          <Button loading={publishing} onClick={() => void publish()}>
            <Play className="h-4 w-4" aria-hidden="true" /> Publish &amp; get code
          </Button>
        )}
        <Link to={`/teacher/activities/${activity.id}/edit`} className="flex-1">
          <Button variant="secondary" block>
            <Pencil className="h-4 w-4" aria-hidden="true" /> Edit
          </Button>
        </Link>
      </div>

      <section aria-labelledby="questions-heading" className="mb-6">
        <h2 id="questions-heading" className="mb-3 text-sm font-bold text-slate-800">
          Questions
        </h2>
        <ol className="space-y-3">
          {activity.questions.map((question, index) => (
            <li key={question.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {index + 1}. {question.prompt}
                  </p>
                  <Badge tone="brand">{question.points} pt</Badge>
                </div>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {question.type === 'multiple_choice' ? 'Multiple choice' : 'Short answer'}
                </p>
                {question.options && question.options.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {question.options.map((option) => (
                      <li
                        key={option.id}
                        className={
                          option.isCorrect
                            ? 'flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800'
                            : 'flex items-center gap-1.5 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600'
                        }
                      >
                        {option.isCorrect && (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {option.label}
                      </li>
                    ))}
                  </ul>
                )}
                {question.type === 'short_answer' && (
                  <p className="mt-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-800">
                    Answer: {question.correctAnswer}
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ol>
      </section>

      {activity.status === 'published' && (
        <section aria-labelledby="roster-heading">
          <h2 id="roster-heading" className="mb-3 text-sm font-bold text-slate-800">
            Student progress
          </h2>
          {roster.length === 0 ? (
            <Card className="text-left text-sm text-slate-500">
              No students enrolled in this demo yet.
            </Card>
          ) : (
            <ul className="space-y-2">
              {roster.map((entry) => {
                const meta = statusLabels[entry.status];
                return (
                  <li key={entry.student.id}>
                    <Card className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {entry.student.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {entry.submission
                            ? `Score ${entry.submission.score}/${entry.submission.maxScore} · ${formatDateTime(entry.submission.submittedAt)}`
                            : entry.startedAt
                              ? `Started ${formatDateTime(entry.startedAt)}`
                              : 'Not opened yet'}
                        </p>
                      </div>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

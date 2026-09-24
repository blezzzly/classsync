import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import type { Activity, Submission } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { Badge, Card, ErrorState, PageHeader, Spinner } from '../../components/ui';

export function TeacherSubmissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [activity, setActivity] = useState<Activity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const { submission: data } = await api.getSubmission(id);
      setSubmission(data);
      try {
        const { activity: act } = await api.getActivity(data.activityId);
        setActivity(act);
      } catch {
        setActivity(null);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load submission');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <Spinner label="Loading submission..." />;
  if (error || !submission) {
    return <ErrorState description={error ?? 'Submission not found'} onRetry={() => void load()} />;
  }

  const questionMap = new Map(activity?.questions.map((question) => [question.id, question]) ?? []);
  const answerMap = new Map(submission.answers.map((answer) => [answer.questionId, answer.answer]));

  const isCorrect = (questionId: string): boolean | null => {
    const question = questionMap.get(questionId);
    const answer = answerMap.get(questionId);
    if (!question || answer === undefined || !question.correctAnswer) return null;
    const normalize = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase();
    return normalize(answer) === normalize(question.correctAnswer);
  };

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => navigate('/teacher/submissions')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Submissions
      </button>

      <PageHeader
        title={submission.studentName ?? 'Submission'}
        subtitle={submission.activityTitle ?? 'Activity'}
        action={
          <span className="text-right">
            <span className="block text-2xl font-bold tabular-nums text-slate-900">
              {submission.score}
              <span className="text-base font-semibold text-slate-400">/{submission.maxScore}</span>
            </span>
          </span>
        }
      />

      <Card className="mb-4 space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Status</span>
          <Badge tone="success">Submitted</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Sync</span>
          <Badge tone={submission.status === 'synced' ? 'success' : 'info'}>
            {submission.status === 'synced' ? 'Synced' : 'Received'}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-slate-500">Submitted</span>
          <span className="font-medium text-slate-800">{formatDateTime(submission.submittedAt)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="shrink-0 text-slate-500">Activity</span>
          <Link
            to={`/teacher/activities/${submission.activityId}`}
            className="truncate font-medium text-teal-700 hover:underline"
          >
            {submission.activityTitle ?? 'Open activity'}
          </Link>
        </div>
      </Card>

      <h2 className="mb-3 text-sm font-bold text-slate-800">Answers</h2>
      {submission.answers.length === 0 ? (
        <Card className="text-left text-sm text-slate-500">No answers were submitted.</Card>
      ) : (
        <ol className="space-y-3">
          {submission.answers.map((answer, index) => {
            const question = questionMap.get(answer.questionId);
            const correct = isCorrect(answer.questionId);
            return (
              <li key={answer.questionId}>
                <Card>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900">
                      {index + 1}. {question?.prompt ?? 'Question'}
                    </p>
                    {correct !== null && (
                      <span
                        className={
                          correct
                            ? 'inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 ring-1 ring-inset ring-emerald-200'
                            : 'inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-600 ring-1 ring-inset ring-red-200'
                        }
                      >
                        {correct ? (
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        {correct ? 'Correct' : 'Incorrect'}
                      </span>
                    )}
                  </div>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Student answer
                      </dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-slate-800">
                        {answer.answer || <span className="text-slate-400">(empty)</span>}
                      </dd>
                    </div>
                    {question?.correctAnswer && (
                      <div className="rounded-xl bg-emerald-50 px-3 py-2">
                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">
                          Correct answer
                        </dt>
                        <dd className="mt-0.5 text-emerald-900">{question.correctAnswer}</dd>
                      </div>
                    )}
                    {question && (
                      <div className="flex justify-between px-1 text-xs text-slate-500">
                        <span>{question.type === 'multiple_choice' ? 'Multiple choice' : 'Short answer'}</span>
                        <span>{question.points} point{question.points === 1 ? '' : 's'}</span>
                      </div>
                    )}
                  </dl>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

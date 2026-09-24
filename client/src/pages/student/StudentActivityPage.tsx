import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  Loader2,
  Save,
  Send,
  WifiOff,
} from 'lucide-react';
import type { AnswerInput, LocalSubmission } from '@shared/types';
import type { CachedActivity } from '../../db/schema';
import {
  getCachedActivity,
  listDraftAnswers,
  saveDraftAnswer,
} from '../../db/repositories';
import { api } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { submitActivityLocally, getSubmissionState } from '../../services/submissions';
import { totalPoints } from '../../services/join';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  ErrorState,
  PageHeader,
  Spinner,
  Textarea,
} from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useConnection } from '../../context/ConnectionContext';
import { useSync } from '../../context/SyncContext';
import { useToast } from '../../context/ToastContext';

type SaveState = 'idle' | 'saving' | 'saved';

export function StudentActivityPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isOnline } = useConnection();
  const { syncNow, refreshCounts, syncing } = useSync();
  const toast = useToast();
  const navigate = useNavigate();

  const [activity, setActivity] = useState<CachedActivity | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submission, setSubmission] = useState<LocalSubmission | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const startedRef = useRef(false);

  const load = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const cached = await getCachedActivity(id);
      if (!cached) {
        setLoadError(
          "This activity isn't saved on this device yet. Join it with a code while online first.",
        );
        return;
      }
      setActivity(cached);

      const drafts = await listDraftAnswers(id);
      const map: Record<string, string> = {};
      for (const draft of drafts) map[draft.questionId] = draft.answer;
      setAnswers(map);
      if (drafts.length > 0) {
        setSavedAt(drafts.reduce((latest, d) => (d.updatedAt > latest ? d.updatedAt : latest), drafts[0]!.updatedAt));
        setSaveState('saved');
      }

      const local = await getSubmissionState(id, user.id);
      setSubmission(local);
    } catch {
      setLoadError('Could not open this activity from your device storage.');
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Best-effort "started" marker for the teacher roster (only when online).
  useEffect(() => {
    if (!id || startedRef.current || !isOnline || !user || user.role !== 'student') return;
    startedRef.current = true;
    void api.startActivity(id).catch(() => undefined);
  }, [id, isOnline, user]);

  const answeredCount = useMemo(
    () => (activity ? activity.questions.filter((q) => (answers[q.id] ?? '').trim() !== '').length : 0),
    [activity, answers],
  );

  const setAnswer = useCallback(
    async (questionId: string, value: string) => {
      if (!id) return;
      setAnswers((current) => ({ ...current, [questionId]: value }));
      setSaveState('saving');
      try {
        const record = await saveDraftAnswer({ activityId: id, questionId, answer: value });
        setSavedAt(record.updatedAt);
        setSaveState('saved');
      } catch {
        setSaveState('idle');
        toast.error('Could not save that answer locally');
      }
    },
    [id, toast],
  );

  const doSubmit = async () => {
    if (!activity || !user || !id) return;
    const payload: AnswerInput[] = activity.questions
      .map((question) => ({ questionId: question.id, answer: (answers[question.id] ?? '').trim() }))
      .filter((answer) => answer.answer !== '');

    if (payload.length === 0) {
      toast.error('Answer at least one question before submitting');
      setConfirmSubmit(false);
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitActivityLocally({
        activityId: id,
        studentId: user.id,
        answers: payload,
      });
      setSubmission(result.submission);
      await refreshCounts();

      if (isOnline) {
        toast.info('Submitting...');
        await syncNow({ silent: true });
        const refreshed = await getSubmissionState(id, user.id);
        setSubmission(refreshed);
        if (refreshed?.status === 'SYNCED') {
          toast.success(`Submitted & synced — scored ${refreshed.score}/${refreshed.maxScore}`);
        } else if (refreshed?.status === 'SYNC_FAILED') {
          toast.error('Saved on this device, but sync failed. Retry from Submissions.');
        } else {
          toast.success('Submitted — waiting to sync');
        }
      } else {
        toast.success('Saved offline — waiting to sync. Will sync automatically when you’re back online.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not submit');
    } finally {
      setSubmitting(false);
      setConfirmSubmit(false);
    }
  };

  const retrySync = async () => {
    await syncNow();
    if (id && user) {
      const refreshed = await getSubmissionState(id, user.id);
      setSubmission(refreshed);
    }
  };

  if (loading) return <Spinner label="Opening activity from this device..." />;

  if (loadError || !activity) {
    return (
      <div className="animate-fade-in-up">
        <ErrorState
          title="Activity unavailable"
          description={loadError ?? 'Activity not found on this device.'}
          onRetry={() => void load()}
        />
        <div className="mt-4">
          <Link to="/student/activities">
            <Button variant="secondary" block>
              Back to my activities
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const points = totalPoints(activity.questions);
  const isSubmitted = submission?.status === 'SYNCED';
  const isPending =
    submission &&
    (submission.status === 'PENDING_SYNC' ||
      submission.status === 'SYNCING' ||
      submission.status === 'SYNC_FAILED');
  const deadlinePassed = activity.deadline ? new Date(activity.deadline).getTime() < Date.now() : false;

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => navigate('/student/activities')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> My activities
      </button>

      <PageHeader
        title={activity.title}
        subtitle={`${activity.type} · ${activity.questions.length} questions · ${points} pts`}
        action={<Badge tone="success">Offline ready</Badge>}
      />

      {activity.description && (
        <Card className="mb-4 bg-slate-50 text-sm leading-relaxed text-slate-600">
          {activity.description}
        </Card>
      )}

      {deadlinePassed && !isSubmitted && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
          The deadline for this activity has passed.
        </div>
      )}

      {/* Saved indicator */}
      {!isSubmitted && (
        <div
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs"
        >
          <span className="flex items-center gap-2 font-medium text-slate-600">
            {saveState === 'saving' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700" aria-hidden="true" />
                Saving...
              </>
            ) : saveState === 'saved' && savedAt ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                Answers saved on this device
                <span className="font-normal text-slate-400">· {formatTime(savedAt)}</span>
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Answers save automatically
              </>
            )}
          </span>
          {!isOnline && (
            <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
              <WifiOff className="h-3.5 w-3.5" aria-hidden="true" /> Offline
            </span>
          )}
        </div>
      )}

      {/* Submission state banner */}
      {isPending && submission && (
        <div
          role="status"
          className={`mb-4 rounded-2xl border p-4 ${
            submission.status === 'SYNC_FAILED'
              ? 'border-red-200 bg-red-50'
              : submission.status === 'SYNCING' || syncing
                ? 'border-sky-200 bg-sky-50'
                : 'border-amber-200 bg-amber-50'
          }`}
        >
          <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
            {submission.status === 'SYNC_FAILED' ? (
              <>
                <CloudUpload className="h-4 w-4 text-red-500" aria-hidden="true" />
                Sync failed — work still saved
              </>
            ) : submission.status === 'SYNCING' || syncing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-sky-600" aria-hidden="true" />
                Syncing...
              </>
            ) : isOnline ? (
              <>
                <CloudUpload className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Saved — waiting to sync
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4 text-amber-600" aria-hidden="true" />
                Saved offline — waiting to sync
              </>
            )}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            {submission.status === 'SYNC_FAILED'
              ? submission.lastError ??
                'The server could not accept this yet. Your answers are safe on this device.'
              : isOnline
                ? 'Your submission is queued and will upload in a moment.'
                : 'Will sync automatically when you’re back online.'}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="min-h-9 px-3 text-xs"
              loading={syncing || submitting}
              disabled={!isOnline}
              onClick={() => void retrySync()}
            >
              {submission.status === 'SYNC_FAILED' ? 'Retry sync' : 'Sync now'}
            </Button>
            <Link to="/student/submissions" className="flex-1">
              <Button variant="secondary" block className="min-h-9 text-xs">
                View submissions
              </Button>
            </Link>
          </div>
        </div>
      )}

      {isSubmitted && submission && (
        <div
          role="status"
          className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-emerald-900">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Submitted &amp; synced
          </p>
          <p className="mt-1 text-xs text-emerald-800">
            Score:{' '}
            <span className="font-bold">
              {submission.score ?? 0}/{submission.maxScore ?? points}
            </span>{' '}
            · Your teacher can see this submission.
          </p>
        </div>
      )}

      {/* Questions */}
      <ol className="space-y-4">
        {activity.questions.map((question, index) => {
          const current = answers[question.id] ?? '';
          const disabled = Boolean(isSubmitted || (isPending && submission?.status !== 'SYNC_FAILED'));
          return (
            <li key={question.id}>
              <Card>
                <div className="flex items-start justify-between gap-2">
                  <label
                    htmlFor={`q-${question.id}`}
                    className="text-sm font-semibold leading-snug text-slate-900"
                  >
                    <span className="mr-1.5 text-slate-400">{index + 1}.</span>
                    {question.prompt}
                  </label>
                  <Badge tone="brand">{question.points} pt</Badge>
                </div>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {question.type === 'multiple_choice' ? 'Multiple choice' : 'Short answer'}
                </p>

                <div className="mt-3">
                  {question.type === 'multiple_choice' ? (
                    <fieldset className="space-y-2" disabled={disabled}>
                      <legend className="sr-only">{question.prompt}</legend>
                      {(question.options ?? []).map((option) => {
                        const selected = current === option.label;
                        return (
                          <label
                            key={option.id}
                            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition ${
                              selected
                                ? 'border-teal-600 bg-teal-50 font-semibold text-teal-900 ring-1 ring-teal-600'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                          >
                            <input
                              type="radio"
                              className="h-4 w-4 accent-teal-700"
                              name={`question-${question.id}`}
                              value={option.label}
                              checked={selected}
                              onChange={(event) => void setAnswer(question.id, event.target.value)}
                              aria-label={option.label}
                            />
                            {option.label}
                          </label>
                        );
                      })}
                    </fieldset>
                  ) : (
                    <Textarea
                      id={`q-${question.id}`}
                      disabled={disabled}
                      placeholder="Type your answer..."
                      value={current}
                      maxLength={2000}
                      onChange={(event) => void setAnswer(question.id, event.target.value)}
                      onBlur={(event) => void setAnswer(question.id, event.target.value)}
                    />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ol>

      {!isSubmitted && (!isPending || submission?.status === 'SYNC_FAILED') && (
        <div className="sticky bottom-20 mt-6 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
          <p className="mb-2 text-left text-xs text-slate-500">
            {answeredCount}/{activity.questions.length} answered
            {!isOnline && ' · works offline'}
          </p>
          <Button
            block
            onClick={() => setConfirmSubmit(true)}
            loading={submitting}
            disabled={submitting || answeredCount === 0}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {submission?.status === 'SYNC_FAILED'
              ? 'Re-submit answers'
              : isOnline
                ? 'Submit answers'
                : 'Submit offline'}
          </Button>
          {answeredCount < activity.questions.length && answeredCount > 0 && (
            <p className="mt-2 text-left text-[11px] text-amber-600">
              {activity.questions.length - answeredCount} question
              {activity.questions.length - answeredCount === 1 ? '' : 's'} still unanswered
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmSubmit}
        title={isOnline ? 'Submit your answers?' : 'Submit while offline?'}
        description={
          isOnline
            ? `You answered ${answeredCount} of ${activity.questions.length} questions. You can't change answers after submitting.`
            : `You answered ${answeredCount} of ${activity.questions.length} questions. Your submission will be saved on this device and synced automatically when you're back online.`
        }
        confirmLabel={isOnline ? 'Submit' : 'Save offline & submit'}
        loading={submitting}
        onConfirm={() => void doSubmit()}
        onCancel={() => setConfirmSubmit(false)}
      />
    </div>
  );
}

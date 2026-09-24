import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, GripVertical, Plus, Trash2 } from 'lucide-react';
import type { ActivityFormInput, QuestionFormInput, QuestionType } from '@shared/types';
import { api, ApiError } from '../../lib/api';
import {
  Badge,
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '../../components/ui';
import { useToast } from '../../context/ToastContext';

const ACTIVITY_TYPES = ['Quiz', 'Assignment', 'Reflection', 'Lesson Check', 'Practice'];

function emptyQuestion(): QuestionFormInput {
  return {
    type: 'multiple_choice',
    prompt: '',
    points: 1,
    correctAnswer: '',
    options: ['', ''],
  };
}

function toFormInput(activity: {
  title: string;
  description: string;
  type: string;
  deadline: string | null;
  questions: Array<{
    type: QuestionType;
    prompt: string;
    points: number;
    correctAnswer: string | null;
    options?: Array<{ label: string }>;
  }>;
}): ActivityFormInput {
  return {
    title: activity.title,
    description: activity.description,
    type: activity.type,
    deadline: activity.deadline ?? '',
    questions: activity.questions.map((question) => ({
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      correctAnswer: question.correctAnswer ?? '',
      options:
        question.type === 'multiple_choice'
          ? (question.options ?? []).map((option) => option.label)
          : [],
    })),
  };
}

function validate(input: ActivityFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.title.trim()) errors.title = 'Title is required';
  if (input.questions.length === 0) errors.questions = 'Add at least one question';

  input.questions.forEach((question, index) => {
    const prefix = `q${index}`;
    if (!question.prompt.trim()) errors[`${prefix}.prompt`] = 'Question text is required';
    if (question.points < 1) errors[`${prefix}.points`] = 'Points must be at least 1';
    if (question.type === 'multiple_choice') {
      const filled = question.options.filter((option) => option.trim());
      if (filled.length < 2) errors[`${prefix}.options`] = 'Add at least two answer options';
      if (!question.correctAnswer.trim()) {
        errors[`${prefix}.correct`] = 'Mark the correct answer';
      } else if (!question.options.some((option) => option.trim() === question.correctAnswer.trim())) {
        errors[`${prefix}.correct`] = 'Correct answer must match an option';
      }
    } else if (!question.correctAnswer.trim()) {
      errors[`${prefix}.correct`] = 'Correct answer is required';
    }
  });
  return errors;
}

export function ActivityFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();

  const [input, setInput] = useState<ActivityFormInput>({
    title: '',
    description: '',
    type: 'Quiz',
    deadline: '',
    questions: [emptyQuestion()],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void (async () => {
      try {
        const { activity } = await api.getActivity(id);
        if (!cancelled) setInput(toFormInput(activity));
      } catch (error) {
        if (!cancelled) {
          setFormError(error instanceof ApiError ? error.message : 'Could not load activity');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const updateQuestion = (index: number, patch: Partial<QuestionFormInput>) => {
    setInput((current) => ({
      ...current,
      questions: current.questions.map((question, i) =>
        i === index ? { ...question, ...patch } : question,
      ),
    }));
  };

  const setQuestionType = (index: number, type: QuestionType) => {
    setInput((current) => ({
      ...current,
      questions: current.questions.map((question, i) => {
        if (i !== index) return question;
        return {
          ...question,
          type,
          options: type === 'multiple_choice' ? (question.options.length >= 2 ? question.options : ['', '']) : [],
          correctAnswer: type === 'short_answer' ? question.correctAnswer : '',
        };
      }),
    }));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    setInput((current) => {
      const next = [...current.questions];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      const a = next[index]!;
      const b = next[target]!;
      next[index] = b;
      next[target] = a;
      return { ...current, questions: next };
    });
  };

  const submit = async (event: FormEvent, publishAfter: boolean) => {
    event.preventDefault();
    const clientErrors = validate(input);
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length > 0) {
      setFormError('Please fix the highlighted fields');
      return;
    }

    const sanitized: ActivityFormInput = {
      ...input,
      title: input.title.trim(),
      description: input.description.trim(),
      questions: input.questions.map((question) => ({
        ...question,
        prompt: question.prompt.trim(),
        points: Number(question.points),
        correctAnswer:
          question.type === 'multiple_choice'
            ? question.correctAnswer.trim()
            : question.correctAnswer.trim(),
        options:
          question.type === 'multiple_choice'
            ? question.options.map((option) => option.trim()).filter(Boolean)
            : [],
      })),
    };

    setSaving(true);
    try {
      const { activity } = isEdit
        ? await api.updateActivity(id!, sanitized)
        : await api.createActivity(sanitized);

      if (publishAfter && activity.status === 'draft') {
        const { activity: published } = await api.publishActivity(activity.id);
        toast.success(`Published! Activity code: ${published.code}`);
        navigate(`/teacher/activities/${published.id}`);
        return;
      }

      toast.success(isEdit ? 'Activity updated' : 'Activity saved as draft');
      navigate(`/teacher/activities/${activity.id}`);
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.message);
        const details = error.details as { form?: { fieldErrors?: Record<string, string[]> }; fieldErrors?: Record<string, string[]> } | undefined;
        const fieldErrors = details?.form?.fieldErrors ?? details?.fieldErrors;
        if (fieldErrors) {
          const mapped: Record<string, string> = {};
          for (const [key, messages] of Object.entries(fieldErrors)) {
            const first = messages[0];
            if (first) mapped[key] = first;
          }
          setErrors((current) => ({ ...mapped, ...current }));
        }
      } else {
        setFormError('Could not save the activity. Please try again.');
      }
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const questionCount = input.questions.length;
  const totalPoints = useMemo(
    () => input.questions.reduce((sum, question) => sum + (Number(question.points) || 0), 0),
    [input.questions],
  );

  if (loading) return <Spinner label="Loading activity..." />;

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => navigate(isEdit ? `/teacher/activities/${id}` : '/teacher/activities')}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
      </button>

      <PageHeader
        title={isEdit ? 'Edit activity' : 'Create activity'}
        subtitle="Build questions students can answer offline"
        action={<Badge tone="brand">{totalPoints} pts</Badge>}
      />

      {formError && (
        <div
          role="alert"
          className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700"
        >
          {formError}
        </div>
      )}

      <form onSubmit={(event) => void submit(event, false)} className="space-y-5">
        <Card className="space-y-4">
          <Field label="Title" htmlFor="activity-title" required error={errors.title}>
            <Input
              id="activity-title"
              placeholder="e.g. Basic C++ Variables Quiz"
              value={input.title}
              onChange={(event) => setInput({ ...input, title: event.target.value })}
              maxLength={120}
            />
          </Field>

          <Field
            label="Description / instructions"
            htmlFor="activity-description"
            hint="Shown to students before they start"
          >
            <Textarea
              id="activity-description"
              placeholder="Answer all questions. You can do this offline once the activity is downloaded."
              value={input.description}
              onChange={(event) => setInput({ ...input, description: event.target.value })}
              maxLength={2000}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Activity type" htmlFor="activity-type">
              <Select
                id="activity-type"
                value={input.type}
                onChange={(event) => setInput({ ...input, type: event.target.value })}
              >
                {ACTIVITY_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Deadline (optional)" htmlFor="activity-deadline">
              <Input
                id="activity-deadline"
                type="datetime-local"
                value={input.deadline}
                onChange={(event) => setInput({ ...input, deadline: event.target.value })}
              />
            </Field>
          </div>
        </Card>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">
            Questions{' '}
            <span className="font-normal text-slate-400">({questionCount})</span>
          </h2>
          <Button
            variant="secondary"
            className="min-h-10 px-3 text-xs"
            onClick={(event) => {
              event.preventDefault();
              setInput((current) => ({ ...current, questions: [...current.questions, emptyQuestion()] }));
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" /> Add question
          </Button>
        </div>
        {errors.questions && (
          <p role="alert" className="text-xs font-medium text-red-600">
            {errors.questions}
          </p>
        )}

        <ol className="space-y-4">
          {input.questions.map((question, index) => {
            const prefix = `q${index}`;
            return (
              <li key={index}>
                <Card className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                      <GripVertical className="h-4 w-4" aria-hidden="true" />
                      Question {index + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Move question up"
                        disabled={index === 0}
                        onClick={() => moveQuestion(index, -1)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move question down"
                        disabled={index === input.questions.length - 1}
                        onClick={() => moveQuestion(index, 1)}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label="Delete question"
                        disabled={input.questions.length === 1}
                        onClick={() =>
                          setInput((current) => ({
                            ...current,
                            questions: current.questions.filter((_, i) => i !== index),
                          }))
                        }
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Type" htmlFor={`${prefix}-type`}>
                      <Select
                        id={`${prefix}-type`}
                        value={question.type}
                        onChange={(event) => setQuestionType(index, event.target.value as QuestionType)}
                      >
                        <option value="multiple_choice">Multiple choice</option>
                        <option value="short_answer">Short answer</option>
                      </Select>
                    </Field>
                    <Field
                      label="Points"
                      htmlFor={`${prefix}-points`}
                      error={errors[`${prefix}.points`]}
                    >
                      <Input
                        id={`${prefix}-points`}
                        type="number"
                        min={1}
                        max={100}
                        value={question.points}
                        onChange={(event) =>
                          updateQuestion(index, { points: Number(event.target.value) })
                        }
                      />
                    </Field>
                  </div>

                  <Field
                    label="Question"
                    htmlFor={`${prefix}-prompt`}
                    required
                    error={errors[`${prefix}.prompt`]}
                  >
                    <Textarea
                      id={`${prefix}-prompt`}
                      className="min-h-16"
                      placeholder="What is a variable in C++?"
                      value={question.prompt}
                      onChange={(event) => updateQuestion(index, { prompt: event.target.value })}
                      maxLength={500}
                    />
                  </Field>

                  {question.type === 'multiple_choice' ? (
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-800">
                        Answer choices
                        <span className="ml-1 text-xs font-normal text-slate-400">
                          — select the correct one
                        </span>
                      </p>
                      {question.options.map((option, optionIndex) => (
                        <div key={optionIndex} className="flex items-center gap-2">
                          <input
                            type="radio"
                            id={`${prefix}-correct-${optionIndex}`}
                            name={`${prefix}-correct`}
                            className="h-4 w-4 shrink-0 accent-teal-700"
                            checked={question.correctAnswer === option && option.trim() !== ''}
                            onChange={() => updateQuestion(index, { correctAnswer: option })}
                            aria-label={`Mark option ${optionIndex + 1} correct`}
                          />
                          <Input
                            aria-label={`Option ${optionIndex + 1}`}
                            placeholder={`Option ${optionIndex + 1}`}
                            value={option}
                            onChange={(event) => {
                              const value = event.target.value;
                              const previous = option;
                              setInput((current) => ({
                                ...current,
                                questions: current.questions.map((q, i) => {
                                  if (i !== index) return q;
                                  const options = q.options.map((o, oi) =>
                                    oi === optionIndex ? value : o,
                                  );
                                  const correctAnswer =
                                    q.correctAnswer === previous ? value : q.correctAnswer;
                                  return { ...q, options, correctAnswer };
                                }),
                              }));
                            }}
                            maxLength={200}
                          />
                          <button
                            type="button"
                            aria-label={`Remove option ${optionIndex + 1}`}
                            disabled={question.options.length <= 2}
                            onClick={() =>
                              setInput((current) => ({
                                ...current,
                                questions: current.questions.map((q, i) => {
                                  if (i !== index) return q;
                                  const removed = q.options[optionIndex];
                                  const options = q.options.filter((_, oi) => oi !== optionIndex);
                                  const correctAnswer =
                                    q.correctAnswer === removed ? '' : q.correctAnswer;
                                  return { ...q, options, correctAnswer };
                                }),
                              }))
                            }
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-500 disabled:opacity-30"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        className="min-h-9 px-2 text-xs"
                        onClick={(event) => {
                          event.preventDefault();
                          updateQuestion(index, { options: [...question.options, ''] });
                        }}
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add option
                      </Button>
                      {errors[`${prefix}.options`] && (
                        <p role="alert" className="text-xs font-medium text-red-600">
                          {errors[`${prefix}.options`]}
                        </p>
                      )}
                    </div>
                  ) : (
                    <Field
                      label="Correct answer"
                      htmlFor={`${prefix}-correct`}
                      hint="Students' answers are matched ignoring case and extra spaces"
                      required
                      error={errors[`${prefix}.correct`]}
                    >
                      <Input
                        id={`${prefix}-correct`}
                        placeholder="e.g. variable"
                        value={question.correctAnswer}
                        onChange={(event) => updateQuestion(index, { correctAnswer: event.target.value })}
                        maxLength={300}
                      />
                    </Field>
                  )}

                  {question.type === 'multiple_choice' && errors[`${prefix}.correct`] && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {errors[`${prefix}.correct`]}
                    </p>
                  )}
                </Card>
              </li>
            );
          })}
        </ol>

        <div className="sticky bottom-20 space-y-2 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur">
          <Button type="submit" block loading={saving} disabled={saving}>
            {isEdit ? 'Save changes' : 'Save as draft'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            block
            loading={saving}
            disabled={saving}
            onClick={(event) => void submit(event, true)}
          >
            {isEdit ? 'Save & publish' : 'Save & publish now'}
          </Button>
        </div>
      </form>
    </div>
  );
}

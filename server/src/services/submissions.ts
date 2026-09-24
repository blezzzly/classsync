import { getDb } from '../db/database.js';
import { getActivityById, getSubmissionById, getSubmissionsWithAnswers } from '../db/queries.js';
import { submitSchema } from '../services/validation.js';
import { calculateScore, newId } from '../services/helpers.js';
import type { AnswerInput, SubmitRequest, Submission } from '../../../shared/src/types/index.js';

export class ValidationError extends Error {
  constructor(message = 'Please check your answers and try again') {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'This submission already exists') {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface SubmissionResult {
  submission: Submission;
  duplicate: boolean;
}

export interface CreateSubmissionOptions {
  viaSync?: boolean;
}

export function createSubmission(
  studentId: string,
  input: SubmitRequest,
  options: CreateSubmissionOptions = {},
): SubmissionResult {
  const parsed = submitSchema.parse(input);
  const db = getDb();
  const targetStatus = options.viaSync ? 'synced' : 'received';
  const existingByClient = db.prepare('SELECT id FROM submissions WHERE client_submission_id = ?').get(parsed.clientSubmissionId) as { id: string } | undefined;
  if (existingByClient) {
    const existing = getSubmissionById(db, existingByClient.id);
    if (!existing) throw new Error('Submission record is incomplete');
    if (existing.studentId !== studentId) throw new ValidationError('This submission belongs to another student');
    if (options.viaSync && existing.status !== 'synced') {
      db.prepare("UPDATE submissions SET status = 'synced' WHERE id = ?").run(existing.id);
      existing.status = 'synced';
    }
    return { submission: existing, duplicate: true };
  }

  const activity = getActivityById(db, parsed.activityId);
  if (!activity) throw new ValidationError('This activity is no longer available');
  if (activity.status !== 'published') throw new ValidationError('This activity is not available to join');
  const questionIds = new Set(activity.questions.map((question) => question.id));
  if (parsed.answers.some((answer) => !questionIds.has(answer.questionId))) {
    throw new ValidationError('One or more answers do not belong to this activity');
  }
  if (new Set(parsed.answers.map((answer) => answer.questionId)).size !== parsed.answers.length) {
    throw new ValidationError('Each question can only be answered once');
  }
  for (const answer of parsed.answers) {
    const question = activity.questions.find((item) => item.id === answer.questionId);
    if (question?.type === 'multiple_choice' && !question.options?.some((option) => option.label === answer.answer)) {
      throw new ValidationError('Select an answer option provided for each question');
    }
  }
  const score = calculateScore(activity.questions, parsed.answers);
  const maxScore = activity.questions.reduce((sum, question) => sum + question.points, 0);
  const id = newId('submission');
  const submittedAt = new Date().toISOString();
  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO submissions (id, client_submission_id, activity_id, student_id, score, max_score, status, submitted_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, parsed.clientSubmissionId, activity.id, studentId, score, maxScore, targetStatus, submittedAt);
    parsed.answers.forEach((answer) => {
      db.prepare(`
        INSERT INTO submission_answers (id, submission_id, question_id, answer)
        VALUES (?, ?, ?, ?)
      `).run(newId('answer'), id, answer.questionId, answer.answer);
    });
  });
  try {
    create();
  } catch (error) {
    if ((error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const existing = getSubmissionsWithAnswers(db).find((submission) => submission.activityId === activity.id && submission.studentId === studentId);
      if (existing) return { submission: existing, duplicate: true };
    }
    throw error;
  }
  const submission = getSubmissionById(db, id);
  if (!submission) throw new Error('Submission could not be loaded');
  return { submission, duplicate: false };
}

export function listSubmissions(studentId?: string): Submission[] {
  const submissions = getSubmissionsWithAnswers(getDb());
  return studentId ? submissions.filter((submission) => submission.studentId === studentId) : submissions;
}

export function findSubmission(submissionId: string): Submission {
  const submission = getSubmissionById(getDb(), submissionId);
  if (!submission) throw new Error('Submission not found');
  return submission;
}

export function normalizeAnswers(questions: Array<{ id: string }>, answers: AnswerInput[]): AnswerInput[] {
  const seen = new Set<string>();
  return answers.filter((answer) => {
    if (seen.has(answer.questionId)) return false;
    seen.add(answer.questionId);
    return questions.some((question) => question.id === answer.questionId);
  });
}

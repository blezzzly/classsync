import type { Activity, Question, QuestionOption, Submission, User } from '../../../shared/src/types/index.js';
import type Database from 'better-sqlite3';

interface ActivityRow {
  id: string;
  title: string;
  description: string;
  type: string;
  teacher_id: string;
  teacher_name: string;
  status: 'draft' | 'published';
  code: string | null;
  deadline: string | null;
  created_at: string;
  updated_at: string;
}

interface QuestionRow {
  id: string;
  activity_id: string;
  type: 'multiple_choice' | 'short_answer';
  prompt: string;
  points: number;
  correct_answer: string | null;
  position: number;
}

interface OptionRow {
  id: string;
  question_id: string;
  label: string;
  is_correct: number;
  position: number;
}

interface SubmissionRow {
  id: string;
  client_submission_id: string;
  activity_id: string;
  activity_title: string;
  student_id: string;
  student_name: string;
  score: number;
  max_score: number;
  status: 'received' | 'synced';
  submitted_at: string;
}

interface AnswerRow {
  question_id: string;
  answer: string;
}

export function rowsToActivity(row: ActivityRow, questions: Question[]): Activity {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    type: row.type,
    teacherId: row.teacher_id,
    teacherName: row.teacher_name,
    status: row.status,
    code: row.code,
    deadline: row.deadline,
    questions,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function getActivityRows(db: Database.Database): ActivityRow[] {
  return db.prepare(`
    SELECT a.*, u.name AS teacher_name
    FROM activities a
    JOIN users u ON u.id = a.teacher_id
    ORDER BY a.created_at DESC
  `).all() as ActivityRow[];
}

export function getQuestionsForActivity(db: Database.Database, activityId: string): Question[] {
  const questionRows = db.prepare(`
    SELECT id, activity_id, type, prompt, points, correct_answer, position
    FROM questions
    WHERE activity_id = ?
    ORDER BY position ASC
  `).all(activityId) as QuestionRow[];

  return questionRows.map((question) => {
    const optionRows = db.prepare(`
      SELECT id, question_id, label, is_correct, position
      FROM question_options
      WHERE question_id = ?
      ORDER BY position ASC
    `).all(question.id) as OptionRow[];
    const options: QuestionOption[] = optionRows.map((option) => ({
      id: option.id,
      label: option.label,
      isCorrect: Boolean(option.is_correct),
      position: option.position,
    }));
    return {
      id: question.id,
      activityId: question.activity_id,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      correctAnswer: question.correct_answer,
      position: question.position,
      options: question.type === 'multiple_choice' ? options : undefined,
    };
  });
}

export function getActivitiesWithQuestions(db: Database.Database): Activity[] {
  return getActivityRows(db).map((row) => rowsToActivity(row, getQuestionsForActivity(db, row.id)));
}

export function getActivityById(db: Database.Database, activityId: string): Activity | undefined {
  const row = db.prepare(`
    SELECT a.*, u.name AS teacher_name
    FROM activities a
    JOIN users u ON u.id = a.teacher_id
    WHERE a.id = ?
  `).get(activityId) as ActivityRow | undefined;
  return row ? rowsToActivity(row, getQuestionsForActivity(db, activityId)) : undefined;
}

export function getActivityByCode(db: Database.Database, code: string): Activity | undefined {
  const row = db.prepare(`
    SELECT a.*, u.name AS teacher_name
    FROM activities a
    JOIN users u ON u.id = a.teacher_id
    WHERE a.code = ? AND a.status = 'published'
  `).get(code.toUpperCase()) as ActivityRow | undefined;
  return row ? rowsToActivity(row, getQuestionsForActivity(db, row.id)) : undefined;
}

export function rowsToSubmission(row: SubmissionRow, answers: AnswerRow[]): Submission {
  return {
    id: row.id,
    clientSubmissionId: row.client_submission_id,
    activityId: row.activity_id,
    activityTitle: row.activity_title,
    studentId: row.student_id,
    studentName: row.student_name,
    status: row.status,
    score: row.score,
    maxScore: row.max_score,
    submittedAt: row.submitted_at,
    answers: answers.map((answer) => ({
      questionId: answer.question_id,
      answer: answer.answer,
    })),
  };
}

export function getSubmissionsWithAnswers(db: Database.Database): Submission[] {
  const rows = db.prepare(`
    SELECT s.id, s.client_submission_id, s.activity_id, a.title AS activity_title,
      s.student_id, u.name AS student_name, s.score, s.max_score, s.status, s.submitted_at
    FROM submissions s
    JOIN activities a ON a.id = s.activity_id
    JOIN users u ON u.id = s.student_id
    ORDER BY s.submitted_at DESC
  `).all() as SubmissionRow[];
  return rows.map((row) => {
    const answers = db.prepare(`
      SELECT sa.question_id, sa.answer
      FROM submission_answers sa
      JOIN questions q ON q.id = sa.question_id
      WHERE sa.submission_id = ?
      ORDER BY q.position ASC
    `).all(row.id) as AnswerRow[];
    return rowsToSubmission(row, answers);
  });
}

export function getSubmissionById(db: Database.Database, submissionId: string): Submission | undefined {
  return getSubmissionsWithAnswers(db).find((submission) => submission.id === submissionId);
}

export function getUserById(db: Database.Database, userId: string): User | undefined {
  return db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(userId) as User | undefined;
}

export function getUserByName(db: Database.Database, name: string, role: User['role']): User | undefined {
  return db.prepare('SELECT id, name, role FROM users WHERE name = ? AND role = ?').get(name, role) as User | undefined;
}

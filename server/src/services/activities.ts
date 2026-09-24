import { getDb } from '../db/database.js';
import { getActivityById, getActivityByCode, getActivitiesWithQuestions } from '../db/queries.js';
import { activityFormSchema } from '../services/validation.js';
import { generateActivityCode, newId } from '../services/helpers.js';
import type { Activity, ActivityFormInput } from '../../../shared/src/types/index.js';

export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = 'You do not have permission to do that') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class ConflictError extends Error {
  constructor(message = 'That resource already exists') {
    super(message);
    this.name = 'ConflictError';
  }
}

function toInput(input: ActivityFormInput): ActivityFormInput {
  return input;
}

export function listActivities(teacherId: string): Activity[] {
  return getActivitiesWithQuestions(getDb()).filter((activity) => activity.teacherId === teacherId);
}

export function findActivity(activityId: string): Activity {
  const activity = getActivityById(getDb(), activityId);
  if (!activity) throw new NotFoundError('Activity not found');
  return activity;
}

export function findActivityByCode(code: string): Activity {
  const normalized = code.trim().toUpperCase();
  if (!/^CS-[A-Z0-9]{4}$/.test(normalized)) throw new NotFoundError('Enter a valid activity code');
  const activity = getActivityByCode(getDb(), normalized);
  if (!activity) throw new NotFoundError('We could not find an activity with that code');
  return activity;
}

export function createActivity(teacherId: string, input: ActivityFormInput): Activity {
  const parsed = activityFormSchema.parse(input);
  const db = getDb();
  const id = newId('activity');
  const now = new Date().toISOString();
  const create = db.transaction(() => {
    db.prepare(`
      INSERT INTO activities (id, title, description, type, teacher_id, status, code, deadline, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'draft', NULL, ?, ?, ?)
    `).run(id, parsed.title, parsed.description, parsed.type, teacherId, parsed.deadline || null, now, now);

    parsed.questions.forEach((question, position) => {
      const questionId = newId('question');
      db.prepare(`
        INSERT INTO questions (id, activity_id, type, prompt, points, correct_answer, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(questionId, id, question.type, question.prompt, question.points, question.correctAnswer, position + 1);
      if (question.type === 'multiple_choice') {
        question.options.forEach((label, optionPosition) => {
          db.prepare(`
            INSERT INTO question_options (id, question_id, label, is_correct, position)
            VALUES (?, ?, ?, ?, ?)
          `).run(newId('option'), questionId, label, label === question.correctAnswer ? 1 : 0, optionPosition + 1);
        });
      }
    });
  });
  create();
  return findActivity(id);
}

export function updateActivity(activityId: string, teacherId: string, input: ActivityFormInput): Activity {
  const parsed = activityFormSchema.parse(toInput(input));
  const activity = findActivity(activityId);
  if (activity.teacherId !== teacherId) throw new ForbiddenError();
  const db = getDb();
  const update = db.transaction(() => {
    db.prepare(`
      UPDATE activities
      SET title = ?, description = ?, type = ?, deadline = ?, updated_at = ?
      WHERE id = ?
    `).run(parsed.title, parsed.description, parsed.type, parsed.deadline || null, new Date().toISOString(), activityId);
    db.prepare('DELETE FROM questions WHERE activity_id = ?').run(activityId);
    parsed.questions.forEach((question, position) => {
      const questionId = newId('question');
      db.prepare(`
        INSERT INTO questions (id, activity_id, type, prompt, points, correct_answer, position)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(questionId, activityId, question.type, question.prompt, question.points, question.correctAnswer, position + 1);
      if (question.type === 'multiple_choice') {
        question.options.forEach((label, optionPosition) => {
          db.prepare(`
            INSERT INTO question_options (id, question_id, label, is_correct, position)
            VALUES (?, ?, ?, ?, ?)
          `).run(newId('option'), questionId, label, label === question.correctAnswer ? 1 : 0, optionPosition + 1);
        });
      }
    });
  });
  update();
  return findActivity(activityId);
}

export function deleteActivity(activityId: string, teacherId: string): void {
  const activity = findActivity(activityId);
  if (activity.teacherId !== teacherId) throw new ForbiddenError();
  getDb().prepare('DELETE FROM activities WHERE id = ?').run(activityId);
}

function generateUniqueActivityCode(db: ReturnType<typeof getDb>): string {
  const firstChoice = 'CS-7K4P';
  if (!db.prepare('SELECT 1 FROM activities WHERE code = ?').get(firstChoice)) return firstChoice;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = generateActivityCode();
    if (!db.prepare('SELECT 1 FROM activities WHERE code = ?').get(code)) return code;
  }
  throw new ConflictError('Unable to generate an activity code. Please try again.');
}

export function publishActivity(activityId: string, teacherId: string): Activity {
  const activity = findActivity(activityId);
  if (activity.teacherId !== teacherId) throw new ForbiddenError();
  const db = getDb();
  const publish = db.transaction(() => {
    const code = activity.code ?? generateUniqueActivityCode(db);
    db.prepare(`
      UPDATE activities
      SET status = 'published', code = ?, updated_at = ?
      WHERE id = ?
    `).run(code, new Date().toISOString(), activityId);
  });
  publish();
  return findActivity(activityId);
}

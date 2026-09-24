import { getDb } from '../db/database.js';
import { getActivityById, getSubmissionsWithAnswers } from '../db/queries.js';
import { ForbiddenError, NotFoundError } from './activities.js';
import type { ProgressEntry, User } from '../../../shared/src/types/index.js';

export function markActivityStarted(activityId: string, studentId: string): void {
  const db = getDb();
  const activity = getActivityById(db, activityId);
  if (!activity) throw new NotFoundError('Activity not found');
  if (activity.status !== 'published') throw new NotFoundError('This activity is not available');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO activity_progress (activity_id, student_id, started_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(activity_id, student_id) DO UPDATE SET updated_at = excluded.updated_at
  `).run(activityId, studentId, now, now);
}

export function getProgressRoster(activityId: string, teacherId: string): ProgressEntry[] {
  const db = getDb();
  const activity = getActivityById(db, activityId);
  if (!activity) throw new NotFoundError('Activity not found');
  if (activity.teacherId !== teacherId) throw new ForbiddenError();

  const students = db
    .prepare("SELECT id, name, role FROM users WHERE role = 'student' ORDER BY name ASC")
    .all() as User[];
  const progressRows = db
    .prepare('SELECT student_id, started_at FROM activity_progress WHERE activity_id = ?')
    .all(activityId) as Array<{ student_id: string; started_at: string }>;
  const startedAt = new Map(progressRows.map((row) => [row.student_id, row.started_at]));
  const submissions = getSubmissionsWithAnswers(db).filter(
    (submission) => submission.activityId === activityId,
  );
  const submissionByStudent = new Map(submissions.map((submission) => [submission.studentId, submission]));

  return students.map((student) => {
    const submission = submissionByStudent.get(student.id) ?? null;
    const started = startedAt.get(student.id) ?? null;
    const status = submission ? 'submitted' : started ? 'in_progress' : 'not_started';
    return { student, status, startedAt: started, submission };
  });
}

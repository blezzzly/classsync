import { getDb } from '../db/database';
import { getActivitiesWithQuestions, getSubmissionsWithAnswers } from '../db/queries';
import type { DashboardData, User } from '../../../shared/src/types';

export function getDashboardData(teacherId: string): DashboardData {
  const db = getDb();
  const allActivities = getActivitiesWithQuestions(db);
  const activities = allActivities.filter((activity) => activity.teacherId === teacherId);
  const activityIds = new Set(activities.map((activity) => activity.id));
  const submissions = getSubmissionsWithAnswers(db).filter((submission) =>
    activityIds.has(submission.activityId),
  );
  const students = db
    .prepare("SELECT id, name, role FROM users WHERE role = 'student' ORDER BY name ASC")
    .all() as User[];
  const activeActivities = activities.filter((activity) => activity.status === 'published').length;
  const pendingSubmissions = Math.max(0, activeActivities * students.length - submissions.length);
  return {
    totalActivities: activities.length,
    activeActivities,
    totalStudents: students.length,
    pendingSubmissions,
    students,
    recentActivities: activities.slice(0, 4),
    recentSubmissions: submissions.slice(0, 4),
  };
}

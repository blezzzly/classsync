import { describe, expect, test } from 'vitest';
import type { Activity, LoginInput, Role, Submission, User } from '../../shared/src/types';
import { findActivityByCode } from '../../server/src/services/activities';
import { calculateScore } from '../../server/src/services/helpers';
import { createSubmission, listSubmissions } from '../../server/src/services/submissions';
import {
  createPublishedActivity,
  getJson,
  makeSubmission,
  postJson,
  quizInput,
  secondStudentId,
  startTestServer,
  studentId,
  teacherId,
  type TestServer,
} from './helpers';

interface LoginResponse {
  session: {
    token: string;
    user: User;
  };
}

interface ActivityResponse {
  activity: Activity;
}

interface SyncResponse {
  results: Array<{
    clientSubmissionId: string;
    submission: Submission;
    duplicate: boolean;
  }>;
}

interface ErrorResponse {
  message: string;
  details?: unknown;
}

async function login(baseUrl: string, name: string, role: Role): Promise<string> {
  const result = await postJson<LoginResponse>(baseUrl, '/api/auth/login', { name, role } satisfies LoginInput);
  expect(result.response.status).toBe(200);
  expect(result.body.session.user).toMatchObject({ name, role });
  expect(result.body.session.token).toMatch(/^classsync\./);
  return result.body.session.token;
}

async function withServer(test: (server: TestServer) => Promise<void>): Promise<void> {
  const server = await startTestServer();
  try {
    await test(server);
  } finally {
    await server.close();
  }
}

describe('server backend', () => {
  test('creates, publishes, and finds an activity by code', async () => {
    await withServer(async (server) => {
      const teacherToken = await login(server.baseUrl, 'Teacher Demo', 'teacher');
      const studentToken = await login(server.baseUrl, 'Alex Santos', 'student');

      const created = await postJson<ActivityResponse>(server.baseUrl, '/api/activities', quizInput, teacherToken);
      expect(created.response.status).toBe(201);
      expect(created.body.activity).toMatchObject({
        title: quizInput.title,
        teacherId,
        status: 'draft',
        code: null,
      });

      const published = await postJson<ActivityResponse>(
        server.baseUrl,
        `/api/activities/${created.body.activity.id}/publish`,
        {},
        teacherToken,
      );
      expect(published.response.status).toBe(200);
      expect(published.body.activity.status).toBe('published');
      expect(published.body.activity.code).toMatch(/^CS-[A-Z0-9]{4}$/);

      const code = published.body.activity.code as string;
      const joined = await postJson<ActivityResponse>(
        server.baseUrl,
        `/api/join/${code.toLowerCase()}`,
        {},
        studentToken,
      );
      expect(joined.response.status).toBe(200);
      expect(joined.body.activity.id).toBe(created.body.activity.id);
      for (const question of joined.body.activity.questions) {
        expect(question.correctAnswer).toBeNull();
        for (const option of question.options ?? []) {
          expect(option.isCorrect).toBe(false);
        }
      }
      expect(findActivityByCode(`  ${code.toLowerCase()}  `).id).toBe(created.body.activity.id);

      const missing = await postJson<ErrorResponse>(
        server.baseUrl,
        '/api/join/CS-XXXX',
        {},
        studentToken,
      );
      expect(missing.response.status).toBe(404);
      expect(missing.body.message).toMatch(/could not find/i);
    });
  });

  test('calculates normalized scores across question types', () => {
    const activity = createPublishedActivity();
    const multipleChoice = activity.questions[0]!;
    const shortAnswer = activity.questions[1]!;

    expect(calculateScore(activity.questions, [
      { questionId: multipleChoice.id, answer: ' alpha ' },
      { questionId: shortAnswer.id, answer: 'BETA' },
    ])).toBe(5);
    expect(calculateScore(activity.questions, [
      { questionId: multipleChoice.id, answer: 'Beta' },
      { questionId: shortAnswer.id, answer: ' gamma ' },
    ])).toBe(0);
    expect(calculateScore(activity.questions, [
      { questionId: multipleChoice.id, answer: 'Alpha' },
    ])).toBe(2);
  });

  test('creates a submission with answers and a calculated score', () => {
    const activity = createPublishedActivity();
    const input = makeSubmission(activity, 'submission-1');

    const result = createSubmission(studentId, input);

    expect(result.duplicate).toBe(false);
    expect(result.submission).toMatchObject({
      activityId: activity.id,
      studentId,
      score: 5,
      maxScore: 5,
      status: 'received',
    });
    expect(result.submission.answers).toEqual(input.answers);
    expect(listSubmissions(studentId)).toHaveLength(1);
  });

  test('prevents duplicate submissions by client id and owner', () => {
    const activity = createPublishedActivity();
    const input = makeSubmission(activity, 'duplicate-submission');
    const first = createSubmission(studentId, input);
    const duplicate = createSubmission(studentId, input);

    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.submission.id).toBe(first.submission.id);
    expect(duplicate.submission.score).toBe(first.submission.score);
    expect(listSubmissions(studentId)).toHaveLength(1);
    expect(() => createSubmission(secondStudentId, input)).toThrow('belongs to another student');
  });

  test('sync endpoint is idempotent for a client submission id', async () => {
    await withServer(async (server) => {
      const studentToken = await login(server.baseUrl, 'Alex Santos', 'student');
      const activity = createPublishedActivity();
      const input = makeSubmission(activity, 'sync-submission');

      const first = await postJson<SyncResponse>(server.baseUrl, '/api/sync', {
        submissions: [input],
      }, studentToken);
      const second = await postJson<SyncResponse>(server.baseUrl, '/api/sync', {
        submissions: [input],
      }, studentToken);

      expect(first.response.status).toBe(200);
      expect(second.response.status).toBe(200);
      expect(first.body.results[0]).toMatchObject({
        clientSubmissionId: input.clientSubmissionId,
        duplicate: false,
      });
      expect(second.body.results[0]).toMatchObject({
        clientSubmissionId: input.clientSubmissionId,
        duplicate: true,
      });
      expect(second.body.results[0]?.submission.id).toBe(first.body.results[0]?.submission.id);

      const differentClientSubmission = makeSubmission(activity, 'sync-submission-2');
      const third = await postJson<SyncResponse>(server.baseUrl, '/api/sync', {
        submissions: [differentClientSubmission],
      }, studentToken);
      expect(third.body.results[0]?.duplicate).toBe(false);
      expect(listSubmissions(studentId)).toHaveLength(2);
    });
  });

  test('rejects invalid activity, submission, and login payloads', async () => {
    await withServer(async (server) => {
      const teacherToken = await login(server.baseUrl, 'Teacher Demo', 'teacher');
      const studentToken = await login(server.baseUrl, 'Alex Santos', 'student');
      const activity = createPublishedActivity();

      const invalidActivity = await postJson<ErrorResponse>(
        server.baseUrl,
        '/api/activities',
        { ...quizInput, questions: [] },
        teacherToken,
      );
      expect(invalidActivity.response.status).toBe(400);
      expect(invalidActivity.body.message).toBe('Add at least one question');

      const invalidSubmission = await postJson<ErrorResponse>(
        server.baseUrl,
        '/api/submissions',
        {
          clientSubmissionId: 'invalid-submission',
          activityId: activity.id,
          answers: [{ questionId: 'question-not-in-activity', answer: 'Alpha' }],
        },
        studentToken,
      );
      expect(invalidSubmission.response.status).toBe(400);
      expect(invalidSubmission.body.message).toMatch(/do not belong/i);

      const invalidLogin = await postJson<ErrorResponse>(server.baseUrl, '/api/auth/login', {
        name: '',
        role: 'student',
      });
      expect(invalidLogin.response.status).toBe(400);
      expect(invalidLogin.body.message).toMatch(/too small/i);
    });
  });

  test('authenticates API users and protects authenticated routes', async () => {
    await withServer(async (server) => {
      const unauthenticated = await getJson<ErrorResponse>(server.baseUrl, '/api/activities');
      expect(unauthenticated.response.status).toBe(401);
      expect(unauthenticated.body.message).toMatch(/sign in/i);

      const teacherToken = await login(server.baseUrl, 'Teacher Demo', 'teacher');
      const studentToken = await login(server.baseUrl, 'Alex Santos', 'student');
      const teacherActivities = await getJson<{ activities: Activity[] }>(
        server.baseUrl,
        '/api/activities',
        teacherToken,
      );
      expect(teacherActivities.response.status).toBe(200);
      expect(teacherActivities.body.activities.every((activity) => activity.teacherId === teacherId)).toBe(true);

      const studentActivities = await getJson<{ activities: Activity[] }>(
        server.baseUrl,
        '/api/activities',
        studentToken,
      );
      expect(studentActivities.response.status).toBe(200);
      expect(studentActivities.body.activities).toEqual([]);
    });
  });
});

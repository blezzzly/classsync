import type { AddressInfo } from 'node:net';
import type { Activity, ActivityFormInput, SubmitRequest } from '../../shared/src/types';
import { createApp } from '../../server/src/app';
import { createActivity, publishActivity } from '../../server/src/services/activities';

export const teacherId = 'user-teacher-demo';
export const studentId = 'user-alex-santos';
export const secondStudentId = 'user-jamie-cruz';

export const quizInput: ActivityFormInput = {
  title: 'Backend test quiz',
  description: 'Created by the server test suite',
  type: 'Quiz',
  deadline: '',
  questions: [
    {
      type: 'multiple_choice',
      prompt: 'Which value is correct?',
      points: 2,
      correctAnswer: 'Alpha',
      options: ['Alpha', 'Beta', 'Gamma'],
    },
    {
      type: 'short_answer',
      prompt: 'Name the second value.',
      points: 3,
      correctAnswer: 'Beta',
      options: [],
    },
  ],
};

export function createPublishedActivity(input: ActivityFormInput = quizInput): Activity {
  const activity = createActivity(teacherId, input);
  return publishActivity(activity.id, teacherId);
}

export function makeSubmission(activity: Activity, clientSubmissionId: string): SubmitRequest;
export function makeSubmission(activityId: string, questionIds: string[], clientSubmissionId: string): SubmitRequest;
export function makeSubmission(
  activityOrId: Activity | string,
  questionIdsOrClientId: string[] | string,
  maybeClientId?: string,
): SubmitRequest {
  const activity = typeof activityOrId === 'string' ? undefined : activityOrId;
  const activityId = typeof activityOrId === 'string' ? activityOrId : activityOrId.id;
  const clientSubmissionId = Array.isArray(questionIdsOrClientId) ? maybeClientId : questionIdsOrClientId;
  const questionIds = Array.isArray(questionIdsOrClientId)
    ? questionIdsOrClientId
    : activity?.questions.map((question) => question.id) ?? [];

  if (!clientSubmissionId) throw new Error('clientSubmissionId is required');

  return {
    clientSubmissionId,
    activityId,
    answers: questionIds.map((questionId, index) => ({
      questionId,
      answer: index === 0 ? 'Alpha' : 'Beta',
    })),
  };
}

export interface TestServer {
  baseUrl: string;
  close: () => Promise<void>;
}

export async function startTestServer(): Promise<TestServer> {
  const server = createApp().listen(0);
  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

export async function postJson<T>(
  baseUrl: string,
  path: string,
  body: unknown,
  token?: string,
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() as T };
}

export async function getJson<T>(
  baseUrl: string,
  path: string,
  token?: string,
): Promise<{ response: Response; body: T }> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { response, body: await response.json() as T };
}

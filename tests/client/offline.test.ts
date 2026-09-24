import { beforeEach, describe, expect, test } from 'vitest';
import type { Activity, Submission } from '../../shared/src/types';
import {
  clearDatabase,
  createClientSubmissionId,
  db,
} from '../../client/src/db/schema';
import {
  clearDraftAnswers,
  enqueueSubmission,
  getLocalSubmissionByClientSubmissionId,
  listDraftAnswers,
  listLocalSubmissions,
  listPendingJoins,
  listSyncQueueItems,
  saveCachedActivity,
  saveDraftAnswer,
  listCachedActivities,
} from '../../client/src/db/repositories';
import {
  joinActivity,
  findCachedByCode,
  isValidCodeFormat,
  processPendingJoins,
} from '../../client/src/services/join';
import { runSyncQueue, type SyncTransport } from '../../client/src/services/sync';
import { submitActivityLocally, getSubmissionState } from '../../client/src/services/submissions';
import { setOfflineSimulation, ApiError } from '../../client/src/lib/api';

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: 'activity-test',
    title: 'Test Activity',
    description: 'For tests',
    type: 'Quiz',
    teacherId: 'user-teacher-demo',
    teacherName: 'Teacher Demo',
    status: 'published',
    code: 'CS-7K4P',
    deadline: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    questions: [
      {
        id: 'q1',
        activityId: 'activity-test',
        type: 'multiple_choice',
        prompt: 'Pick one?',
        points: 2,
        correctAnswer: null,
        position: 1,
        options: [
          { id: 'o1', label: 'Alpha', isCorrect: false, position: 1 },
          { id: 'o2', label: 'Beta', isCorrect: false, position: 2 },
        ],
      },
      {
        id: 'q2',
        activityId: 'activity-test',
        type: 'short_answer',
        prompt: 'Type answer',
        points: 3,
        correctAnswer: null,
        position: 2,
      },
    ],
    ...overrides,
  };
}

function makeServerSubmission(clientSubmissionId: string, score = 5): Submission {
  return {
    id: 'server-sub-1',
    clientSubmissionId,
    activityId: 'activity-test',
    studentId: 'user-alex-santos',
    status: 'synced',
    score,
    maxScore: 5,
    submittedAt: new Date().toISOString(),
    answers: [],
  };
}

beforeEach(async () => {
  setOfflineSimulation(false);
  await clearDatabase();
});

describe('local answer persistence (IndexedDB)', () => {
  test('saves draft answers and reloads them after a simulated refresh', async () => {
    await saveDraftAnswer({ activityId: 'activity-test', questionId: 'q1', answer: 'Alpha' });
    await saveDraftAnswer({ activityId: 'activity-test', questionId: 'q2', answer: 'variables' });

    // Simulate refresh: read straight from the database, not from memory.
    const drafts = await listDraftAnswers('activity-test');
    expect(drafts).toHaveLength(2);
    expect(drafts.find((d) => d.questionId === 'q1')?.answer).toBe('Alpha');
    expect(drafts.find((d) => d.questionId === 'q2')?.answer).toBe('variables');
  });

  test('overwrites a draft answer for the same question', async () => {
    await saveDraftAnswer({ activityId: 'activity-test', questionId: 'q1', answer: 'Alpha' });
    await saveDraftAnswer({ activityId: 'activity-test', questionId: 'q1', answer: 'Beta' });

    const drafts = await listDraftAnswers('activity-test');
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.answer).toBe('Beta');
  });

  test('clears drafts for one activity only', async () => {
    await saveDraftAnswer({ activityId: 'activity-test', questionId: 'q1', answer: 'Alpha' });
    await saveDraftAnswer({ activityId: 'other', questionId: 'q9', answer: 'keep' });
    await clearDraftAnswers('activity-test');

    expect(await listDraftAnswers('activity-test')).toHaveLength(0);
    expect(await listDraftAnswers('other')).toHaveLength(1);
  });
});

describe('activity caching and offline code lookup', () => {
  test('caches an activity and finds it by code without the network', async () => {
    const activity = makeActivity();
    await saveCachedActivity(activity, { source: 'join' });

    const cached = await findCachedByCode('CS-7K4P');
    expect(cached?.id).toBe('activity-test');
    expect(await listCachedActivities()).toHaveLength(1);
  });

  test('validates activity code format', () => {
    expect(isValidCodeFormat('CS-7K4P')).toBe(true);
    expect(isValidCodeFormat('cs-7k4p')).toBe(true);
    expect(isValidCodeFormat('BAD')).toBe(false);
    expect(isValidCodeFormat('CS-7K')).toBe(false);
  });

  test('join falls back to cache when offline', async () => {
    await saveCachedActivity(makeActivity(), { source: 'join' });
    setOfflineSimulation(true);

    const result = await joinActivity('cs-7k4p');
    expect(result.status).toBe('joined');
    expect(result).toMatchObject({ fromCache: true, activity: { id: 'activity-test' } });
    expect(await listPendingJoins()).toHaveLength(0);
  });

  test('join queues a pending join when offline and not cached', async () => {
    setOfflineSimulation(true);

    const result = await joinActivity('CS-XXXX');
    expect(result.status).toBe('queued');
    expect(result).toMatchObject({ code: 'CS-XXXX' });

    const pending = await listPendingJoins();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.code).toBe('CS-XXXX');
    expect(pending[0]?.status).toBe('PENDING');
  });

  test('offline join is idempotent for the same code', async () => {
    setOfflineSimulation(true);
    await joinActivity('CS-XXXX');
    await joinActivity('cs-xxxx');

    const pending = await listPendingJoins();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.code).toBe('CS-XXXX');
  });

  test('processPendingJoins downloads queued codes and caches them', async () => {
    setOfflineSimulation(true);
    await joinActivity('CS-7K4P');
    expect(await listPendingJoins()).toHaveLength(1);
    setOfflineSimulation(false);

    const result = await processPendingJoins({
      transport: async (code) => makeActivity({ code }),
    });

    expect(result.joined).toHaveLength(1);
    expect(result.remaining).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(await listPendingJoins()).toHaveLength(0);
    expect(await findCachedByCode('CS-7K4P')).toMatchObject({ id: 'activity-test' });
  });

  test('processPendingJoins keeps the queue while still offline', async () => {
    setOfflineSimulation(true);
    await joinActivity('CS-7K4P');

    const result = await processPendingJoins();
    expect(result.joined).toHaveLength(0);
    expect(result.remaining).toBe(1);
    expect(await listPendingJoins()).toHaveLength(1);

    const pending = await listPendingJoins();
    expect(pending[0]?.attempts).toBe(1);
  });

  test('processPendingJoins drops codes the server rejects', async () => {
    setOfflineSimulation(true);
    await joinActivity('CS-404X');
    setOfflineSimulation(false);

    const result = await processPendingJoins({
      transport: async () => {
        throw new ApiError('Activity not found', { status: 404, kind: 'http' });
      },
    });

    expect(result.joined).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.code).toBe('CS-404X');
    expect(await listPendingJoins()).toHaveLength(0);
  });
});

describe('sync queue lifecycle', () => {
  test('enqueueSubmission creates a local submission and queue item', async () => {
    const { localSubmission: submission, queueItem, created } = await enqueueSubmission({
      clientSubmissionId: 'client-1',
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [{ questionId: 'q1', answer: 'Alpha' }],
    });

    expect(created).toBe(true);
    expect(submission.status).toBe('PENDING_SYNC');
    expect(queueItem?.status).toBe('PENDING');
    expect(await listSyncQueueItems({ studentId: 'user-alex-santos' })).toHaveLength(1);
  });

  test('duplicate clientSubmissionId does not create a second queue entry', async () => {
    const first = await enqueueSubmission({
      clientSubmissionId: 'client-dup',
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [{ questionId: 'q1', answer: 'Alpha' }],
    });
    const second = await enqueueSubmission({
      clientSubmissionId: 'client-dup',
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [{ questionId: 'q1', answer: 'Beta' }],
    });

    expect(second.created).toBe(false);
    expect(second.localSubmission.id).toBe(first.localSubmission.id);
    expect(await listSyncQueueItems()).toHaveLength(1);
    expect(await listLocalSubmissions()).toHaveLength(1);
  });

  test('submitActivityLocally reuses the same clientSubmissionId for retries', async () => {
    const first = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [{ questionId: 'q1', answer: 'Alpha' }],
    });
    const second = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [
        { questionId: 'q1', answer: 'Alpha' },
        { questionId: 'q2', answer: 'Beta' },
      ],
    });

    expect(second.clientSubmissionId).toBe(first.clientSubmissionId);
    expect(await listLocalSubmissions()).toHaveLength(1);
    const queue = await listSyncQueueItems();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.answers).toHaveLength(2);
  });
});

describe('sync engine', () => {
  const answers = [{ questionId: 'q1', answer: 'Alpha' }];

  test('successful sync marks submission SYNCED and clears the queue', async () => {
    const { clientSubmissionId } = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers,
    });

    const transport: SyncTransport = async (submissions) => {
      expect(submissions).toHaveLength(1);
      expect(submissions[0]?.clientSubmissionId).toBe(clientSubmissionId);
      return {
        results: [
          {
            clientSubmissionId,
            submission: makeServerSubmission(clientSubmissionId, 5),
            duplicate: false,
          },
        ],
      };
    };

    const result = await runSyncQueue(transport, { studentId: 'user-alex-santos' });
    expect(result.synced).toEqual([clientSubmissionId]);
    expect(result.failed).toHaveLength(0);

    expect(await listSyncQueueItems()).toHaveLength(0);
    const local = await getLocalSubmissionByClientSubmissionId(clientSubmissionId);
    expect(local?.status).toBe('SYNCED');
    expect(local?.score).toBe(5);
    expect(local?.serverSubmissionId).toBe('server-sub-1');
  });

  test('failed sync keeps the queue and local submission for retry', async () => {
    const { clientSubmissionId } = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers,
    });

    const failing: SyncTransport = async () => {
      throw new Error('Cannot reach the server');
    };

    const result = await runSyncQueue(failing, { studentId: 'user-alex-santos' });
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.clientSubmissionId).toBe(clientSubmissionId);

    // Data must never be lost on failure.
    const queue = await listSyncQueueItems();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.status).toBe('SYNC_FAILED');
    const local = await getLocalSubmissionByClientSubmissionId(clientSubmissionId);
    expect(local?.status).toBe('SYNC_FAILED');
    expect(local?.answers).toEqual(answers);
  });

  test('retry after failure succeeds without duplicating the record', async () => {
    const { clientSubmissionId } = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers,
    });

    await runSyncQueue(async () => {
      throw new Error('network down');
    }, { studentId: 'user-alex-santos' });

    let serverCalls = 0;
    const retrying: SyncTransport = async () => {
      serverCalls += 1;
      return {
        results: [
          {
            clientSubmissionId,
            submission: makeServerSubmission(clientSubmissionId),
            duplicate: true,
          },
        ],
      };
    };

    const result = await runSyncQueue(retrying, { studentId: 'user-alex-santos' });
    expect(result.synced).toEqual([clientSubmissionId]);
    expect(serverCalls).toBe(1);

    const local = await getLocalSubmissionByClientSubmissionId(clientSubmissionId);
    expect(local?.status).toBe('SYNCED');
    expect(await listSyncQueueItems()).toHaveLength(0);
    expect(await listLocalSubmissions()).toHaveLength(1);
  });

  test('sync queue only processes items for the given student', async () => {
    await enqueueSubmission({
      clientSubmissionId: createClientSubmissionId(),
      activityId: 'activity-test',
      studentId: 'user-jamie-cruz',
      answers,
    });
    const mine = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers,
    });

    const seen: string[] = [];
    await runSyncQueue(
      async (submissions) => {
        seen.push(...submissions.map((s) => s.clientSubmissionId));
        return {
          results: submissions.map((s) => ({
            clientSubmissionId: s.clientSubmissionId,
            submission: makeServerSubmission(s.clientSubmissionId),
            duplicate: false,
          })),
        };
      },
      { studentId: 'user-alex-santos' },
    );

    expect(seen).toEqual([mine.clientSubmissionId]);
    const otherQueue = await listSyncQueueItems({ studentId: 'user-jamie-cruz' });
    expect(otherQueue).toHaveLength(1);
  });

  test('empty queue is a no-op', async () => {
    const result = await runSyncQueue(async () => ({ results: [] }), {
      studentId: 'user-alex-santos',
    });
    expect(result.synced).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
  });
});

describe('submission state helpers', () => {
  test('getSubmissionState returns the latest local submission', async () => {
    const { submission } = await submitActivityLocally({
      activityId: 'activity-test',
      studentId: 'user-alex-santos',
      answers: [{ questionId: 'q1', answer: 'Alpha' }],
    });
    const state = await getSubmissionState('activity-test', 'user-alex-santos');
    expect(state?.id).toBe(submission.id);
    expect(state?.status).toBe('PENDING_SYNC');
  });

  test('database instance is available', () => {
    expect(db.name).toBe('classsync-client');
  });
});

import type { Submission, SubmitRequest } from '@shared/types';
import {
  clearDraftAnswers,
  deleteSyncQueueItem,
  getLocalSubmissionByClientSubmissionId,
  listSyncQueueItems,
  updateLocalSubmission,
  updateSyncQueueItem,
} from '../db/repositories';
import { ApiError } from '../lib/api';

export interface SyncTransportResult {
  results: Array<{
    clientSubmissionId: string;
    submission: Submission;
    duplicate: boolean;
  }>;
}

export type SyncTransport = (submissions: SubmitRequest[]) => Promise<SyncTransportResult>;

export interface SyncRunResult {
  synced: string[];
  failed: Array<{ clientSubmissionId: string; error: string }>;
}

export interface SyncRunOptions {
  studentId: string;
}

function friendlyError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Sync failed unexpectedly. Your work is still saved on this device.';
}

/**
 * Drains the local sync queue.
 * - Never deletes a local record until the server confirms success.
 * - Uses clientSubmissionId as the idempotency key (server dedupes too).
 * - On failure, keeps queue items and local submissions intact for retry.
 */
export async function runSyncQueue(
  transport: SyncTransport,
  options: SyncRunOptions,
): Promise<SyncRunResult> {
  const items = (await listSyncQueueItems({ studentId: options.studentId })).filter(
    (item) => item.status === 'PENDING' || item.status === 'SYNC_FAILED',
  );

  const result: SyncRunResult = { synced: [], failed: [] };
  if (items.length === 0) return result;

  const now = new Date().toISOString();

  for (const item of items) {
    await updateSyncQueueItem(item.id, {
      status: 'SYNCING',
      attempts: item.attempts + 1,
      lastAttemptAt: now,
      updatedAt: now,
    });
    const local = await getLocalSubmissionByClientSubmissionId(item.clientSubmissionId);
    if (local && local.status !== 'SYNCED') {
      await updateLocalSubmission(local.id, { status: 'SYNCING', updatedAt: now });
    }
  }

  try {
    const response = await transport(
      items.map((item) => ({
        clientSubmissionId: item.clientSubmissionId,
        activityId: item.activityId,
        answers: item.answers,
      })),
    );

    const byClientId = new Map(response.results.map((entry) => [entry.clientSubmissionId, entry]));
    const syncedActivities = new Set<string>();

    for (const item of items) {
      const entry = byClientId.get(item.clientSubmissionId);
      if (!entry) {
        const failure = {
          clientSubmissionId: item.clientSubmissionId,
          error: 'The server did not confirm this submission',
        };
        result.failed.push(failure);
        await markFailed(item.id, item.clientSubmissionId, failure.error);
        continue;
      }

      const syncedAt = new Date().toISOString();
      const local = await getLocalSubmissionByClientSubmissionId(item.clientSubmissionId);
      if (local) {
        await updateLocalSubmission(local.id, {
          status: 'SYNCED',
          score: entry.submission.score,
          maxScore: entry.submission.maxScore,
          serverSubmissionId: entry.submission.id,
          attempts: item.attempts,
          lastError: undefined,
          updatedAt: syncedAt,
        });
      }
      await deleteSyncQueueItem(item.id);
      syncedActivities.add(item.activityId);
      result.synced.push(item.clientSubmissionId);
    }

    for (const activityId of syncedActivities) {
      await clearDraftAnswers(activityId);
    }
  } catch (error) {
    const message = friendlyError(error);
    for (const item of items) {
      if (result.synced.includes(item.clientSubmissionId)) continue;
      result.failed.push({ clientSubmissionId: item.clientSubmissionId, error: message });
      await markFailed(item.id, item.clientSubmissionId, message);
    }
  }

  return result;
}

async function markFailed(
  queueItemId: string,
  clientSubmissionId: string,
  error: string,
): Promise<void> {
  const now = new Date().toISOString();
  await updateSyncQueueItem(queueItemId, {
    status: 'SYNC_FAILED',
    lastError: error,
    updatedAt: now,
  });
  const local = await getLocalSubmissionByClientSubmissionId(clientSubmissionId);
  if (local && local.status !== 'SYNCED') {
    await updateLocalSubmission(local.id, {
      status: 'SYNC_FAILED',
      lastError: error,
      updatedAt: now,
    });
  }
}

export async function countPendingSync(studentId: string): Promise<{
  pending: number;
  failed: number;
  syncing: number;
}> {
  const items = await listSyncQueueItems({ studentId });
  return {
    pending: items.filter((item) => item.status === 'PENDING').length,
    failed: items.filter((item) => item.status === 'SYNC_FAILED').length,
    syncing: items.filter((item) => item.status === 'SYNCING').length,
  };
}

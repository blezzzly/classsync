import type {
  Activity,
  AnswerInput,
  DraftAnswer,
  LocalSubmission,
  SyncMetadata,
} from '@shared/types';
import type { PendingJoin, SyncMetadataInput } from './schema';
import {
  db,
  toTimestamp,
  type CachedActivity,
  type ClassSyncDB,
  type DraftAnswerInput,
  type LocalSubmissionInput,
  type OfflineSyncQueueItem,
  type SyncQueueInput,
  type WriteOptions,
  normalizeDraftAnswer,
  normalizeLocalSubmission,
  normalizePendingJoin,
  normalizeSyncQueueItem,
  normalizeActivityCode,
} from './schema';

export interface ActivityCacheOptions extends WriteOptions {
  source?: 'server' | 'join' | 'manual';
}

export interface LocalSubmissionFilters {
  activityId?: string;
  studentId?: string;
  status?: LocalSubmission['status'] | LocalSubmission['status'][];
}

export interface QueueFilters {
  status?: OfflineSyncQueueItem['status'] | OfflineSyncQueueItem['status'][];
  activityId?: string;
  studentId?: string;
}

export interface EnqueueOptions extends WriteOptions {
  /** Replace an existing unsynced payload with this input. */
  force?: boolean;
}

export interface EnqueueResult {
  localSubmission: LocalSubmission;
  queueItem?: OfflineSyncQueueItem;
  created: boolean;
}

function nowOr(options?: WriteOptions): string {
  return toTimestamp(options?.now);
}

function includesStatus<T extends string>(
  actual: T,
  expected?: T | T[],
): boolean {
  if (!expected) return true;
  return Array.isArray(expected) ? expected.includes(actual) : expected === actual;
}

export async function saveCachedActivity(
  activity: Activity | CachedActivity,
  options: ActivityCacheOptions = {},
): Promise<CachedActivity> {
  const timestamp = nowOr(options);
  const existing = await (options.database?.cachedActivities.get(activity.id) ??
    db.cachedActivities.get(activity.id));
  const database = options.database ?? db;
  const record: CachedActivity = {
    ...activity,
    cachedAt: existing?.cachedAt ?? timestamp,
    cacheSource: options.source ?? existing?.cacheSource ?? 'server',
  };
  await database.cachedActivities.put(record);
  return record;
}

export async function getCachedActivity(
  id: string,
  database: ClassSyncDB = db,
): Promise<CachedActivity | undefined> {
  return database.cachedActivities.get(id);
}

export async function listCachedActivities(database: ClassSyncDB = db): Promise<CachedActivity[]> {
  return database.cachedActivities.orderBy('updatedAt').reverse().toArray();
}

export async function updateCachedActivity(
  id: string,
  changes: Partial<Activity> & Pick<CachedActivity, 'cachedAt' | 'cacheSource'>,
  options: WriteOptions = {},
): Promise<CachedActivity | undefined> {
  const database = options.database ?? db;
  const existing = await database.cachedActivities.get(id);
  if (!existing) return undefined;

  const record: CachedActivity = {
    ...existing,
    ...changes,
    id,
    cachedAt: changes.cachedAt ? toTimestamp(changes.cachedAt) : existing.cachedAt,
    cacheSource: changes.cacheSource ?? existing.cacheSource,
  };
  await database.cachedActivities.put(record);
  return record;
}

export async function deleteCachedActivity(
  id: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.cachedActivities.delete(id);
  return true;
}

export async function replaceCachedActivities(
  activities: Array<Activity | CachedActivity>,
  options: ActivityCacheOptions = {},
): Promise<CachedActivity[]> {
  const database = options.database ?? db;
  const timestamp = nowOr(options);
  const records = await Promise.all(
    activities.map(async (activity) => {
      const existing = await database.cachedActivities.get(activity.id);
      return {
        ...activity,
        cachedAt: existing?.cachedAt ?? timestamp,
        cacheSource: options.source ?? existing?.cacheSource ?? 'server',
      } satisfies CachedActivity;
    }),
  );

  await database.transaction(
    'rw',
    database.cachedActivities,
    async () => {
      await database.cachedActivities.clear();
      await database.cachedActivities.bulkPut(records);
    },
  );
  return records;
}

export async function saveDraftAnswer(
  input: DraftAnswerInput,
  options: WriteOptions = {},
): Promise<DraftAnswer> {
  const database = options.database ?? db;
  const record = normalizeDraftAnswer(input, options.now);
  const existing = await database.draftAnswers.get(record.id);
  if (
    existing &&
    (existing.activityId !== record.activityId || existing.questionId !== record.questionId)
  ) {
    await database.draftAnswers.delete(existing.id);
  }
  await database.draftAnswers.put(record);
  return record;
}

export async function saveDraftAnswers(
  inputs: DraftAnswerInput[],
  options: WriteOptions = {},
): Promise<DraftAnswer[]> {
  const database = options.database ?? db;
  const records = inputs.map((input) => normalizeDraftAnswer(input, options.now));
  await database.transaction('rw', database.draftAnswers, async () => {
    await database.draftAnswers.bulkPut(records);
  });
  return records;
}

export async function getDraftAnswer(
  activityId: string,
  questionId: string,
  database: ClassSyncDB = db,
): Promise<DraftAnswer | undefined> {
  return database.draftAnswers.get([activityId, questionId]);
}

export async function getDraftAnswerById(
  id: string,
  database: ClassSyncDB = db,
): Promise<DraftAnswer | undefined> {
  return database.draftAnswers.get(id);
}

export async function listDraftAnswers(
  activityId?: string,
  database: ClassSyncDB = db,
): Promise<DraftAnswer[]> {
  if (activityId) {
    return database.draftAnswers.where('activityId').equals(activityId).sortBy('updatedAt');
  }
  return database.draftAnswers.orderBy('updatedAt').toArray();
}

export async function updateDraftAnswer(
  id: string,
  changes: Partial<Omit<DraftAnswer, 'id' | 'activityId' | 'questionId'>> &
    Partial<Pick<DraftAnswer, 'activityId' | 'questionId'>>,
  options: WriteOptions = {},
): Promise<DraftAnswer | undefined> {
  const database = options.database ?? db;
  const existing = await database.draftAnswers.get(id);
  if (!existing) return undefined;

  const nextActivityId = changes.activityId ?? existing.activityId;
  const nextQuestionId = changes.questionId ?? existing.questionId;
  const nextId = changes.activityId || changes.questionId
    ? `${nextActivityId}::${nextQuestionId}`
    : id;
  if (nextId !== id) {
    await database.draftAnswers.delete(id);
  }

  const record: DraftAnswer = {
    ...existing,
    ...changes,
    id: nextId,
    activityId: nextActivityId,
    questionId: nextQuestionId,
    updatedAt: changes.updatedAt ? toTimestamp(changes.updatedAt) : nowOr(options),
  };
  await database.draftAnswers.put(record);
  return record;
}

export async function deleteDraftAnswer(
  activityId: string,
  questionId: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  const record = await database.draftAnswers.get([activityId, questionId]);
  if (!record) return false;
  await database.draftAnswers.delete(record.id);
  return true;
}

export async function deleteDraftAnswerById(
  id: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.draftAnswers.delete(id);
  return true;
}

export async function clearDraftAnswers(
  activityId?: string,
  database: ClassSyncDB = db,
): Promise<void> {
  if (activityId) {
    const records = await database.draftAnswers.where('activityId').equals(activityId).toArray();
    await database.draftAnswers.bulkDelete(records.map((record) => record.id));
    return;
  }
  await database.draftAnswers.clear();
}

export async function saveLocalSubmission(
  input: LocalSubmissionInput,
  options: WriteOptions = {},
): Promise<LocalSubmission> {
  const database = options.database ?? db;
  const record = normalizeLocalSubmission(input, options.now);
  await database.localSubmissions.put(record);
  return record;
}

export async function saveLocalSubmissions(
  inputs: LocalSubmissionInput[],
  options: WriteOptions = {},
): Promise<LocalSubmission[]> {
  const database = options.database ?? db;
  const records = inputs.map((input) => normalizeLocalSubmission(input, options.now));
  await database.transaction('rw', database.localSubmissions, async () => {
    await database.localSubmissions.bulkPut(records);
  });
  return records;
}

export async function getLocalSubmission(
  id: string,
  database: ClassSyncDB = db,
): Promise<LocalSubmission | undefined> {
  return database.localSubmissions.get(id);
}

export async function getLocalSubmissionByClientSubmissionId(
  clientSubmissionId: string,
  database: ClassSyncDB = db,
): Promise<LocalSubmission | undefined> {
  return database.localSubmissions.where('clientSubmissionId').equals(clientSubmissionId).first();
}

export async function listLocalSubmissions(
  filters: LocalSubmissionFilters = {},
  database: ClassSyncDB = db,
): Promise<LocalSubmission[]> {
  let records = await database.localSubmissions.orderBy('createdAt').toArray();
  if (filters.activityId) {
    records = records.filter((record) => record.activityId === filters.activityId);
  }
  if (filters.studentId) {
    records = records.filter((record) => record.studentId === filters.studentId);
  }
  if (filters.status) {
    records = records.filter((record) => includesStatus(record.status, filters.status));
  }
  return records;
}

export async function updateLocalSubmission(
  id: string,
  changes: Partial<Omit<LocalSubmission, 'id' | 'createdAt'>>,
  options: WriteOptions = {},
): Promise<LocalSubmission | undefined> {
  const database = options.database ?? db;
  const existing = await database.localSubmissions.get(id);
  if (!existing) return undefined;

  const nextClientSubmissionId = changes.clientSubmissionId ?? existing.clientSubmissionId;
  const collision = await database.localSubmissions
    .where('clientSubmissionId')
    .equals(nextClientSubmissionId)
    .first();
  if (collision && collision.id !== id) {
    throw new Error('A local submission with this clientSubmissionId already exists');
  }

  const record: LocalSubmission = {
    ...existing,
    ...changes,
    id: existing.id,
    clientSubmissionId: nextClientSubmissionId,
    answers: changes.answers ? changes.answers.map((answer: AnswerInput) => ({
      questionId: answer.questionId.trim(),
      answer: answer.answer,
    })) : existing.answers,
    createdAt: existing.createdAt,
    updatedAt: changes.updatedAt ? toTimestamp(changes.updatedAt) : nowOr(options),
  };
  await database.localSubmissions.put(record);
  return record;
}

export async function deleteLocalSubmission(
  id: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.localSubmissions.delete(id);
  return true;
}

export async function saveSyncQueueItem(
  input: SyncQueueInput,
  options: WriteOptions = {},
): Promise<OfflineSyncQueueItem> {
  const database = options.database ?? db;
  const record = normalizeSyncQueueItem(input, options.now);
  await database.syncQueue.put(record);
  return record;
}

export async function getSyncQueueItem(
  id: string,
  database: ClassSyncDB = db,
): Promise<OfflineSyncQueueItem | undefined> {
  return database.syncQueue.get(id);
}

export async function getSyncQueueItemByClientSubmissionId(
  clientSubmissionId: string,
  database: ClassSyncDB = db,
): Promise<OfflineSyncQueueItem | undefined> {
  return database.syncQueue.where('clientSubmissionId').equals(clientSubmissionId).first();
}

export async function listSyncQueueItems(
  filters: QueueFilters = {},
  database: ClassSyncDB = db,
): Promise<OfflineSyncQueueItem[]> {
  let records = await database.syncQueue.orderBy('createdAt').toArray();
  if (filters.activityId) {
    records = records.filter((record) => record.activityId === filters.activityId);
  }
  if (filters.studentId) {
    records = records.filter((record) => record.studentId === filters.studentId);
  }
  if (filters.status) {
    records = records.filter((record) => includesStatus(record.status, filters.status));
  }
  return records;
}

export async function updateSyncQueueItem(
  id: string,
  changes: Partial<Omit<OfflineSyncQueueItem, 'id' | 'createdAt'>>,
  options: WriteOptions = {},
): Promise<OfflineSyncQueueItem | undefined> {
  const database = options.database ?? db;
  const existing = await database.syncQueue.get(id);
  if (!existing) return undefined;

  const nextClientSubmissionId = changes.clientSubmissionId ?? existing.clientSubmissionId;
  const collision = await database.syncQueue
    .where('clientSubmissionId')
    .equals(nextClientSubmissionId)
    .first();
  if (collision && collision.id !== id) {
    throw new Error('A queue item with this clientSubmissionId already exists');
  }

  const record: OfflineSyncQueueItem = {
    ...existing,
    ...changes,
    id: existing.id,
    clientSubmissionId: nextClientSubmissionId,
    answers: changes.answers ? changes.answers.map((answer: AnswerInput) => ({
      questionId: answer.questionId.trim(),
      answer: answer.answer,
    })) : existing.answers,
    createdAt: existing.createdAt,
    updatedAt: changes.updatedAt ? toTimestamp(changes.updatedAt) : nowOr(options),
    nextAttemptAt: changes.nextAttemptAt
      ? toTimestamp(changes.nextAttemptAt)
      : existing.nextAttemptAt,
    lastAttemptAt: changes.lastAttemptAt
      ? toTimestamp(changes.lastAttemptAt)
      : existing.lastAttemptAt,
    lockedUntil: changes.lockedUntil
      ? toTimestamp(changes.lockedUntil)
      : existing.lockedUntil,
  };
  await database.syncQueue.put(record);
  return record;
}

export async function deleteSyncQueueItem(
  id: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.syncQueue.delete(id);
  return true;
}

export async function clearSyncQueue(database: ClassSyncDB = db): Promise<void> {
  await database.syncQueue.clear();
}

export async function enqueueSubmission(
  input: LocalSubmissionInput,
  options: EnqueueOptions = {},
): Promise<EnqueueResult> {
  const database = options.database ?? db;
  const timestamp = toTimestamp(options.now);
  const proposedLocal = normalizeLocalSubmission(
    {
      ...input,
      status: 'PENDING_SYNC',
      attempts: 0,
      createdAt: input.createdAt ?? timestamp,
      updatedAt: timestamp,
    },
    timestamp,
  );

  return database.transaction(
    'rw',
    database.localSubmissions,
    database.syncQueue,
    async (): Promise<EnqueueResult> => {
      const existingLocal = await database.localSubmissions
        .where('clientSubmissionId')
        .equals(proposedLocal.clientSubmissionId)
        .first();

      let localSubmission: LocalSubmission;
      let created = false;
      if (existingLocal) {
        localSubmission = options.force
          ? {
              ...proposedLocal,
              id: existingLocal.id,
              attempts: 0,
              createdAt: existingLocal.createdAt,
              updatedAt: timestamp,
            }
          : {
              ...existingLocal,
              updatedAt: existingLocal.status === 'SYNCED'
                ? existingLocal.updatedAt
                : timestamp,
            };
        await database.localSubmissions.put(localSubmission);
      } else {
        localSubmission = proposedLocal;
        await database.localSubmissions.put(localSubmission);
        created = true;
      }

      if (localSubmission.status === 'SYNCED') {
        return { localSubmission, created };
      }

      const existingQueue = await database.syncQueue
        .where('clientSubmissionId')
        .equals(localSubmission.clientSubmissionId)
        .first();
      if (existingQueue && !options.force) {
        return { localSubmission, queueItem: existingQueue, created };
      }

      const queueItem = normalizeSyncQueueItem(
        {
          id: existingQueue?.id,
          clientSubmissionId: localSubmission.clientSubmissionId,
          activityId: localSubmission.activityId,
          studentId: localSubmission.studentId,
          answers: localSubmission.answers,
          status: 'PENDING',
          attempts: existingQueue?.attempts ?? localSubmission.attempts,
          lastError: undefined,
          createdAt: existingQueue?.createdAt ?? localSubmission.createdAt,
          updatedAt: timestamp,
          nextAttemptAt: undefined,
          lastAttemptAt: undefined,
          lockedUntil: undefined,
        },
        timestamp,
      );
      await database.syncQueue.put(queueItem);
      return { localSubmission, queueItem, created };
    },
  );
}

export const createSubmissionForSync = enqueueSubmission;
export const saveSubmissionForSync = enqueueSubmission;

export async function rebuildPendingQueue(options: WriteOptions = {}): Promise<OfflineSyncQueueItem[]> {
  const database = options.database ?? db;
  const localSubmissions = await database.localSubmissions.toArray();
  const queueItems: OfflineSyncQueueItem[] = [];

  await database.transaction(
    'rw',
    database.localSubmissions,
    database.syncQueue,
    async () => {
      for (const localSubmission of localSubmissions) {
        if (localSubmission.status === 'SYNCED') continue;
        const existing = await database.syncQueue
          .where('clientSubmissionId')
          .equals(localSubmission.clientSubmissionId)
          .first();
        if (existing) {
          queueItems.push(existing);
          continue;
        }

        const item = normalizeSyncQueueItem(
          {
            clientSubmissionId: localSubmission.clientSubmissionId,
            activityId: localSubmission.activityId,
            studentId: localSubmission.studentId,
            answers: localSubmission.answers,
            status: localSubmission.status === 'SYNC_FAILED' ? 'SYNC_FAILED' : 'PENDING',
            attempts: localSubmission.attempts,
            lastError: localSubmission.lastError,
            createdAt: localSubmission.createdAt,
            updatedAt: toTimestamp(options.now),
          },
          options.now,
        );
        await database.syncQueue.put(item);
        queueItems.push(item);
      }
    },
  );

  return queueItems;
}

export async function getMetadata(
  key: string,
  database: ClassSyncDB = db,
): Promise<string | undefined> {
  const record = await database.syncMetadata.get(key);
  return record?.value;
}

export async function setMetadata(
  input: SyncMetadataInput,
  options: WriteOptions = {},
): Promise<SyncMetadata> {
  const database = options.database ?? db;
  if (!input.key.trim()) throw new TypeError('Metadata key is required');
  const record: SyncMetadata = {
    key: input.key.trim(),
    value: input.value,
    updatedAt: toTimestamp(input.updatedAt ?? options.now),
  };
  await database.syncMetadata.put(record);
  return record;
}

export async function deleteMetadata(
  key: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.syncMetadata.delete(key);
  return true;
}

export async function listMetadata(database: ClassSyncDB = db): Promise<SyncMetadata[]> {
  return database.syncMetadata.orderBy('key').toArray();
}

export async function savePendingJoin(
  code: string,
  options: WriteOptions & { lastError?: string; incrementAttempts?: boolean } = {},
): Promise<PendingJoin> {
  const database = options.database ?? db;
  const normalized = normalizeActivityCode(code);
  const existing = await database.pendingJoins.get(normalized);
  const record = normalizePendingJoin(
    {
      code: normalized,
      attempts: (existing?.attempts ?? 0) + (options.incrementAttempts ? 1 : 0),
      lastError: 'lastError' in options ? options.lastError : existing?.lastError,
      createdAt: existing?.createdAt,
      updatedAt: options.now,
    },
    options.now,
  );
  await database.pendingJoins.put(record);
  return record;
}

export async function getPendingJoin(
  code: string,
  database: ClassSyncDB = db,
): Promise<PendingJoin | undefined> {
  return database.pendingJoins.get(normalizeActivityCode(code));
}

export async function listPendingJoins(database: ClassSyncDB = db): Promise<PendingJoin[]> {
  return database.pendingJoins.orderBy('createdAt').toArray();
}

export async function deletePendingJoin(
  code: string,
  database: ClassSyncDB = db,
): Promise<boolean> {
  await database.pendingJoins.delete(normalizeActivityCode(code));
  return true;
}

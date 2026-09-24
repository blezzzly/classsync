import Dexie, { type Table } from 'dexie';
import type {
  AnswerInput,
  CachedActivity as SharedCachedActivity,
  DraftAnswer,
  LocalSubmission,
  LocalSyncStatus,
  SyncMetadata,
  SyncQueueItem,
} from '@shared/types';

export const CLASSSYNC_DB_NAME = 'classsync-client';
export const CLASSSYNC_DB_VERSION = 2;
export const DB_NAME = CLASSSYNC_DB_NAME;
export const DB_VERSION = CLASSSYNC_DB_VERSION;

export type TimeInput = string | Date | number;

export interface WriteOptions {
  now?: TimeInput;
  database?: ClassSyncDB;
}

export interface CachedActivity extends SharedCachedActivity {
  cachedAt?: string;
  cacheSource?: 'server' | 'join' | 'manual';
}

export type DraftAnswerInput = Omit<DraftAnswer, 'id' | 'updatedAt'> &
  Partial<Pick<DraftAnswer, 'id' | 'updatedAt'>>;

export type LocalSubmissionInput = Omit<
  LocalSubmission,
  'id' | 'clientSubmissionId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
> &
  Partial<
    Pick<
      LocalSubmission,
      'id' | 'clientSubmissionId' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
    >
  > & {
    activityId: string;
    studentId: string;
    answers: AnswerInput[];
  };

export interface SubmissionQueueInput {
  id?: string;
  clientSubmissionId?: string;
  activityId: string;
  studentId: string;
  answers: AnswerInput[];
  status?: LocalSyncStatus;
  attempts?: number;
}

export type SyncQueueStatus = 'PENDING' | 'SYNCING' | 'SYNC_FAILED';

export interface OfflineSyncQueueItem extends SyncQueueItem {
  status: SyncQueueStatus;
  nextAttemptAt?: string;
  lastAttemptAt?: string;
  lockedUntil?: string;
}

export type SyncQueueInput = Omit<
  OfflineSyncQueueItem,
  'id' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
> &
  Partial<
    Pick<
      OfflineSyncQueueItem,
      'id' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'
    >
  > & {
    clientSubmissionId: string;
    activityId: string;
    studentId: string;
    answers: AnswerInput[];
  };

export interface SyncMetadataInput {
  key: string;
  value: string;
  updatedAt?: TimeInput;
}

export type PendingJoinStatus = 'PENDING';

export interface PendingJoin {
  code: string;
  status: PendingJoinStatus;
  attempts: number;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export type PendingJoinInput = {
  code: string;
  attempts?: number;
  lastError?: string;
  createdAt?: TimeInput;
  updatedAt?: TimeInput;
};

export class ClassSyncDB extends Dexie {
  cachedActivities!: Table<CachedActivity, string>;
  draftAnswers!: Table<DraftAnswer, string>;
  localSubmissions!: Table<LocalSubmission, string>;
  syncQueue!: Table<OfflineSyncQueueItem, string>;
  syncMetadata!: Table<SyncMetadata, string>;
  pendingJoins!: Table<PendingJoin, string>;

  constructor() {
    super(CLASSSYNC_DB_NAME);

    const baseStores = {
      cachedActivities: '&id, updatedAt, cachedAt',
      draftAnswers: '&id, [activityId+questionId], activityId, questionId, updatedAt',
      localSubmissions: '&id, &clientSubmissionId, activityId, studentId, status, createdAt, updatedAt',
      syncQueue: '&id, &clientSubmissionId, activityId, studentId, status, nextAttemptAt, createdAt, updatedAt',
      syncMetadata: '&key, updatedAt',
    };

    this.version(1).stores(baseStores);
    this.version(CLASSSYNC_DB_VERSION).stores({
      ...baseStores,
      pendingJoins: '&code, status, createdAt, updatedAt',
    });
  }
}

export const db = new ClassSyncDB();
export const classSyncDb = db;
export const offlineDb = db;

let fallbackIdCounter = 0;

export function createId(prefix = 'id'): string {
  const cryptoObject = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObject?.randomUUID) {
    return `${prefix}-${cryptoObject.randomUUID()}`;
  }
  if (cryptoObject?.getRandomValues) {
    const bytes = new Uint8Array(16);
    cryptoObject.getRandomValues(bytes);
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}-${hex}`;
  }

  fallbackIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackIdCounter.toString(36)}`;
}

export function createClientSubmissionId(): string {
  return createId('submission');
}

export function createDraftAnswerId(activityId: string, questionId: string): string {
  return `${activityId}::${questionId}`;
}

export function toTimestamp(value?: TimeInput): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'number') {
    return new Date(value).toISOString();
  }
  return value ?? new Date().toISOString();
}

export function normalizeAnswerInput(answer: AnswerInput): AnswerInput {
  return {
    questionId: answer.questionId.trim(),
    answer: answer.answer,
  };
}

export function normalizeAnswers(answers: AnswerInput[]): AnswerInput[] {
  return answers.map(normalizeAnswerInput);
}

export function normalizeDraftAnswer(input: DraftAnswerInput, now?: TimeInput): DraftAnswer {
  const timestamp = toTimestamp(now);
  const activityId = input.activityId.trim();
  const questionId = input.questionId.trim();
  if (!activityId || !questionId) {
    throw new TypeError('Draft answers require activityId and questionId');
  }

  return {
    id: input.id ?? createDraftAnswerId(activityId, questionId),
    activityId,
    questionId,
    answer: input.answer,
    updatedAt: toTimestamp(input.updatedAt ?? timestamp),
  };
}

export function normalizeLocalSubmission(
  input: LocalSubmissionInput,
  now?: TimeInput,
): LocalSubmission {
  const timestamp = toTimestamp(now);
  const activityId = input.activityId.trim();
  const studentId = input.studentId.trim();
  if (!activityId || !studentId) {
    throw new TypeError('Local submissions require activityId and studentId');
  }

  const clientSubmissionId = input.clientSubmissionId?.trim() || createClientSubmissionId();
  return {
    id: input.id ?? createId('local-submission'),
    clientSubmissionId,
    activityId,
    studentId,
    answers: normalizeAnswers(input.answers),
    status: input.status ?? 'PENDING_SYNC',
    score: input.score,
    maxScore: input.maxScore,
    serverSubmissionId: input.serverSubmissionId,
    attempts: input.attempts ?? 0,
    lastError: input.lastError,
    createdAt: toTimestamp(input.createdAt ?? timestamp),
    updatedAt: toTimestamp(input.updatedAt ?? timestamp),
  };
}

export function normalizeSyncQueueItem(
  input: SyncQueueInput,
  now?: TimeInput,
): OfflineSyncQueueItem {
  const timestamp = toTimestamp(now);
  const activityId = input.activityId.trim();
  const studentId = input.studentId.trim();
  if (!activityId || !studentId) {
    throw new TypeError('Sync queue items require activityId and studentId');
  }

  return {
    id: input.id ?? createId('sync'),
    clientSubmissionId: input.clientSubmissionId.trim(),
    activityId,
    studentId,
    answers: normalizeAnswers(input.answers),
    attempts: input.attempts ?? 0,
    lastError: input.lastError,
    createdAt: toTimestamp(input.createdAt ?? timestamp),
    updatedAt: toTimestamp(input.updatedAt ?? timestamp),
    status: input.status ?? 'PENDING',
    nextAttemptAt: input.nextAttemptAt ? toTimestamp(input.nextAttemptAt) : undefined,
    lastAttemptAt: input.lastAttemptAt ? toTimestamp(input.lastAttemptAt) : undefined,
    lockedUntil: input.lockedUntil ? toTimestamp(input.lockedUntil) : undefined,
  };
}

export function normalizeActivityCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function normalizePendingJoin(input: PendingJoinInput, now?: TimeInput): PendingJoin {
  const timestamp = toTimestamp(now);
  const code = normalizeActivityCode(input.code);
  if (!code) {
    throw new TypeError('Pending joins require an activity code');
  }

  return {
    code,
    status: 'PENDING',
    attempts: input.attempts ?? 0,
    lastError: input.lastError,
    createdAt: toTimestamp(input.createdAt ?? timestamp),
    updatedAt: toTimestamp(input.updatedAt ?? timestamp),
  };
}

export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function openDatabase(database: ClassSyncDB = db): Promise<ClassSyncDB> {
  if (!isIndexedDBAvailable()) {
    throw new Error('IndexedDB is not available in this environment');
  }
  if (!database.isOpen()) {
    await database.open();
  }
  return database;
}

export async function clearDatabase(database: ClassSyncDB = db): Promise<void> {
  const tables = [
    database.cachedActivities,
    database.draftAnswers,
    database.localSubmissions,
    database.syncQueue,
    database.syncMetadata,
    database.pendingJoins,
  ];
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((table) => table.clear()));
  });
}

export async function deleteDatabase(database: ClassSyncDB = db): Promise<void> {
  database.close();
  await Dexie.delete(database.name);
}

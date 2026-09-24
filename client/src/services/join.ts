import type { Activity, Question } from '@shared/types';
import { api, ApiError } from '../lib/api';
import {
  deletePendingJoin,
  getCachedActivity,
  listCachedActivities,
  listPendingJoins,
  saveCachedActivity,
  savePendingJoin,
} from '../db/repositories';

export type JoinResult =
  | { status: 'joined'; code: string; activity: Activity; fromCache: boolean }
  | { status: 'queued'; code: string };

export type JoinTransport = (code: string) => Promise<Activity>;

export interface ProcessPendingJoinsResult {
  joined: Activity[];
  remaining: number;
  errors: Array<{ code: string; message: string }>;
}

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

export function isValidCodeFormat(code: string): boolean {
  return /^CS-[A-Z0-9]{4,8}$/.test(normalizeCode(code));
}

export async function findCachedByCode(code: string): Promise<Activity | undefined> {
  const normalized = normalizeCode(code);
  const cached = await listCachedActivities();
  return cached.find((activity) => activity.code === normalized);
}

const defaultJoinTransport: JoinTransport = async (code) => {
  const { activity } = await api.join(code);
  return activity;
};

function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === 'offline' || error.kind === 'network');
}

/**
 * Join flow (offline-first):
 * - Online: fetch from server, cache in IndexedDB, return fresh copy.
 * - Offline + code already cached: joins instantly from the device cache.
 * - Offline + not cached yet: queues a pending join that downloads automatically
 *   when the connection comes back (see processPendingJoins).
 */
export async function joinActivity(rawCode: string): Promise<JoinResult> {
  const code = normalizeCode(rawCode);
  if (!isValidCodeFormat(code)) {
    throw new ApiError('Enter a valid activity code like CS-7K4P', { status: 400, kind: 'http' });
  }

  try {
    const activity = await defaultJoinTransport(code);
    await saveCachedActivity(activity, { source: 'join' });
    await deletePendingJoin(code);
    return { status: 'joined', code, activity, fromCache: false };
  } catch (error) {
    if (isOfflineError(error)) {
      const cached = await findCachedByCode(code);
      if (cached) {
        await deletePendingJoin(code);
        return { status: 'joined', code, activity: cached, fromCache: true };
      }
      await savePendingJoin(code, { lastError: undefined });
      return { status: 'queued', code };
    }
    await deletePendingJoin(code);
    throw error;
  }
}

let pendingJoinsInFlight: Promise<ProcessPendingJoinsResult> | null = null;

/**
 * Downloads every queued offline join. Safe to call often (reconnect, sync,
 * page load) — concurrent calls share one run. Offline/network failures keep
 * the queue intact; bad codes (4xx) are dropped so they don't retry forever.
 */
export function processPendingJoins(
  options: { transport?: JoinTransport } = {},
): Promise<ProcessPendingJoinsResult> {
  if (pendingJoinsInFlight) return pendingJoinsInFlight;
  pendingJoinsInFlight = runPendingJoins(options.transport ?? defaultJoinTransport).finally(
    () => {
      pendingJoinsInFlight = null;
    },
  );
  return pendingJoinsInFlight;
}

async function runPendingJoins(transport: JoinTransport): Promise<ProcessPendingJoinsResult> {
  const pending = await listPendingJoins();
  const joined: Activity[] = [];
  const errors: Array<{ code: string; message: string }> = [];

  for (const item of pending) {
    try {
      const activity = await transport(item.code);
      await saveCachedActivity(activity, { source: 'join' });
      await deletePendingJoin(item.code);
      joined.push(activity);
    } catch (error) {
      if (isOfflineError(error)) {
        await savePendingJoin(item.code, {
          incrementAttempts: true,
          lastError: 'Waiting for connection',
        });
        continue;
      }

      const message =
        error instanceof ApiError ? error.message : 'Could not download this activity';
      const retryable = error instanceof ApiError && error.kind === 'http' && error.status >= 500;
      if (retryable) {
        await savePendingJoin(item.code, { incrementAttempts: true, lastError: message });
      } else {
        await deletePendingJoin(item.code);
        errors.push({ code: item.code, message });
      }
    }
  }

  return { joined, remaining: (await listPendingJoins()).length, errors };
}

export async function refreshCachedActivity(activityId: string): Promise<Activity | undefined> {
  try {
    const { activity } = await api.getActivity(activityId);
    await saveCachedActivity(activity, { source: 'server' });
    return activity;
  } catch {
    return getCachedActivity(activityId);
  }
}

export function questionCount(activity: Activity): number {
  return activity.questions?.length ?? 0;
}

export function totalPoints(questions: Question[]): number {
  return questions.reduce((sum, question) => sum + question.points, 0);
}

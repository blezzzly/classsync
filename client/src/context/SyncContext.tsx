import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '../lib/api';
import { useAuth } from './AuthContext';
import { useConnection } from './ConnectionContext';
import { useToast } from './ToastContext';
import { countPendingSync, runSyncQueue } from '../services/sync';
import { processPendingJoins } from '../services/join';
import { rebuildPendingQueue } from '../db/repositories';
import { setMetadata, getMetadata } from '../db/repositories';

export type SyncPhase = 'idle' | 'syncing' | 'synced' | 'failed';

interface SyncContextValue {
  phase: SyncPhase;
  pending: number;
  failed: number;
  syncing: boolean;
  lastSyncedAt: string | null;
  syncNow: (options?: { silent?: boolean }) => Promise<void>;
  refreshCounts: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

const LAST_SYNC_KEY = 'lastSyncedAt';

export function SyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { isOnline } = useConnection();
  const toast = useToast();
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const runningRef = useRef(false);
  const wasOnlineRef = useRef(isOnline);
  const isStudent = user?.role === 'student';

  const refreshCounts = useCallback(async () => {
    if (!user || user.role !== 'student') {
      setCounts({ pending: 0, failed: 0 });
      return;
    }
    const next = await countPendingSync(user.id);
    setCounts({ pending: next.pending, failed: next.failed });
    if (next.failed > 0) setPhase('failed');
    else if (next.pending > 0 && phase !== 'syncing') setPhase('idle');
    const stored = await getMetadata(LAST_SYNC_KEY);
    if (stored) setLastSyncedAt(stored);
  }, [user, phase]);

  const syncNow = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!user || user.role !== 'student') return;
      if (runningRef.current) return;

      if (!isOnline) {
        await refreshCounts();
        if (!options?.silent) {
          toast.info('You are offline. Your work is saved on this device.');
        }
        return;
      }

      runningRef.current = true;
      setPhase('syncing');
      if (!options?.silent) toast.info('Syncing your work...');

      try {
        const joins = await processPendingJoins();
        if (joins.joined.length === 1) {
          toast.success(`Joined “${joins.joined[0]?.title}” — saved for offline use`);
        } else if (joins.joined.length > 1) {
          toast.success(`Joined ${joins.joined.length} activities — saved for offline use`);
        }
        if (joins.errors.length > 0) {
          const first = joins.errors[0];
          toast.error(`Couldn't join ${first?.code}: ${first?.message}`);
        }

        await rebuildPendingQueue();
        const result = await runSyncQueue((submissions) => api.sync(submissions), {
          studentId: user.id,
        });

        if (result.synced.length > 0) {
          const now = new Date().toISOString();
          setLastSyncedAt(now);
          await setMetadata({ key: LAST_SYNC_KEY, value: now });
          toast.success('Everything is synced.');
          setPhase('synced');
        } else if (result.failed.length > 0) {
          toast.error(result.failed[0]?.error ?? 'Sync failed. Your work is still saved.');
          setPhase('failed');
        } else {
          setPhase('idle');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Sync failed';
        if (!options?.silent) toast.error(message);
        setPhase('failed');
      } finally {
        runningRef.current = false;
        await refreshCounts();
      }
    },
    [user, isOnline, toast, refreshCounts],
  );

  useEffect(() => {
    void refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    const cameOnline = !wasOnlineRef.current && isOnline;
    const wasOffline = wasOnlineRef.current && !isOnline;
    wasOnlineRef.current = isOnline;

    if (cameOnline && isStudent) {
      toast.info('Connection restored');
      void syncNow({ silent: true }).then(() => undefined);
    } else if (wasOffline && isStudent) {
      toast.info("You're offline. Your work is saved on this device.");
    }
  }, [isOnline, isStudent, syncNow, toast]);

  useEffect(() => {
    if (isOnline && isStudent) {
      void syncNow({ silent: true }).then(() => undefined);
    }
    // Run once on mount for the signed-in student.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStudent]);

  const value = useMemo<SyncContextValue>(
    () => ({
      phase,
      pending: counts.pending,
      failed: counts.failed,
      syncing: phase === 'syncing',
      lastSyncedAt,
      syncNow,
      refreshCounts,
    }),
    [phase, counts, lastSyncedAt, syncNow, refreshCounts],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const context = useContext(SyncContext);
  if (!context) {
    throw new Error('useSync must be used inside SyncProvider');
  }
  return context;
}

import { useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useConnection } from '../context/ConnectionContext';
import { useSync } from '../context/SyncContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, ConfirmDialog } from './ui';

export function SimulateOfflineCard() {
  const { simulatedOffline, toggleSimulateOffline } = useConnection();
  const { failed, pending, syncNow, syncing, lastSyncedAt } = useSync();
  const toast = useToast();
  const [confirmResync, setConfirmResync] = useState(false);
  const [syncingManual, setSyncingManual] = useState(false);

  const onToggle = () => {
    const next = !simulatedOffline;
    toggleSimulateOffline();
    if (next) {
      toast.info(
        "Simulating offline — network requests are paused. Saved work stays on this device.",
      );
    } else {
      toast.success('Back online — syncing pending work...');
    }
  };

  const runSync = async () => {
    setSyncingManual(true);
    try {
      await syncNow();
    } finally {
      setSyncingManual(false);
    }
  };

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
            <WifiOff className="h-4 w-4 text-amber-600" aria-hidden="true" />
            Simulate offline
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            Demo the offline workflow without unplugging. Cached activities open, answers save to
            this device, submissions queue for sync, and everything uploads when you switch back.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={simulatedOffline}
          aria-label="Simulate offline mode"
          onClick={onToggle}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
            simulatedOffline ? 'bg-amber-500' : 'bg-slate-300'
          }`}
        >
          <span
            className="absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform"
            style={{ transform: simulatedOffline ? 'translateX(20px)' : 'translateX(0)' }}
          />
        </button>
      </div>

      <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
        <span className="text-xs font-medium text-slate-600">
          {pending + failed > 0
            ? `${pending} pending · ${failed} failed`
            : lastSyncedAt
              ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}`
              : 'Nothing waiting to sync'}
        </span>
        <Button
          variant="secondary"
          className="min-h-9 px-3 text-xs"
          disabled={syncing || (pending + failed === 0 && !lastSyncedAt)}
          loading={syncing || syncingManual}
          onClick={() => setConfirmResync(true)}
        >
          Sync now
        </Button>
      </div>

      <ConfirmDialog
        open={confirmResync}
        title="Sync now?"
        description="Push all pending offline submissions to the server. Nothing is deleted locally until the server confirms."
        confirmLabel="Sync"
        loading={syncingManual}
        onConfirm={() => {
          setConfirmResync(false);
          void runSync();
        }}
        onCancel={() => setConfirmResync(false)}
      />
    </Card>
  );
}

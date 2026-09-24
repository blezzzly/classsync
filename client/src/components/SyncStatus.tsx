import { CloudOff, CloudUpload, RefreshCw, ShieldCheck } from 'lucide-react';
import { useConnection } from '../context/ConnectionContext';
import { useSync } from '../context/SyncContext';
import { cn, statusPillClass } from './ui';

export function OfflineBanner() {
  const { isOnline } = useConnection();
  if (isOnline) return null;

  return (
    <div
      role="status"
      className="animate-fade-in-up flex items-start gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium leading-snug text-amber-900"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        You&apos;re offline. Your work is saved on this device.
        <span className="mt-0.5 block text-amber-700">
          Cached activities stay open and submissions will sync automatically when you&apos;re back
          online.
        </span>
      </p>
    </div>
  );
}

export function SyncStatusPill({ className }: { className?: string }) {
  const { pending, failed, syncing, phase, lastSyncedAt } = useSync();
  const { isOnline } = useConnection();

  let icon = <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />;
  let label = 'All synced';
  let tone = 'bg-emerald-50 text-emerald-800 ring-emerald-200';

  if (syncing || phase === 'syncing') {
    icon = <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
    label = 'Syncing...';
    tone = 'bg-sky-50 text-sky-800 ring-sky-200';
  } else if (!isOnline && (pending > 0 || failed > 0)) {
    icon = <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />;
    label = `${pending + failed} waiting`;
    tone = 'bg-amber-50 text-amber-900 ring-amber-200';
  } else if (failed > 0) {
    icon = <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />;
    label = `${failed} failed`;
    tone = 'bg-red-50 text-red-700 ring-red-200';
  } else if (pending > 0) {
    icon = <CloudUpload className="h-3.5 w-3.5" aria-hidden="true" />;
    label = `${pending} pending`;
    tone = 'bg-amber-50 text-amber-900 ring-amber-200';
  } else if (phase === 'synced' || lastSyncedAt) {
    label = 'Synced';
  }

  return (
    <span
      className={cn(
        statusPillClass,
        tone,
        className,
      )}
      role="status"
      aria-live="polite"
      title={lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleTimeString()}` : undefined}
    >
      {icon}
      {label}
    </span>
  );
}

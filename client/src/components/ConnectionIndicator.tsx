import { Wifi, WifiOff } from 'lucide-react';
import { useConnection } from '../context/ConnectionContext';
import { cn, statusPillClass } from './ui';

export function ConnectionIndicator({ className }: { className?: string }) {
  const { isOnline, simulatedOffline } = useConnection();

  return (
    <span
      className={cn(
        statusPillClass,
        isOnline
          ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
          : 'bg-amber-50 text-amber-900 ring-amber-200',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <span
        className={cn(
          'h-2 w-2 rounded-full',
          isOnline ? 'bg-emerald-500' : 'animate-pulse-soft bg-amber-500',
        )}
        aria-hidden="true"
      />
      {isOnline ? 'Online' : simulatedOffline ? 'Offline (simulated)' : 'Offline'}
      {isOnline ? (
        <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
      )}
    </span>
  );
}

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setOfflineSimulation } from '../lib/api';

const SIMULATE_KEY = 'classsync:simulate-offline';

interface ConnectionContextValue {
  browserOnline: boolean;
  simulatedOffline: boolean;
  isOnline: boolean;
  toggleSimulateOffline: () => void;
}

const ConnectionContext = createContext<ConnectionContextValue | undefined>(undefined);

function readSimulated(): boolean {
  try {
    return localStorage.getItem(SIMULATE_KEY) === '1';
  } catch {
    return false;
  }
}

export function ConnectionProvider({ children }: { children: ReactNode }) {
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [simulatedOffline, setSimulatedOffline] = useState(readSimulated);

  useEffect(() => {
    setOfflineSimulation(simulatedOffline);
  }, [simulatedOffline]);

  useEffect(() => {
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const toggleSimulateOffline = useCallback(() => {
    setSimulatedOffline((current) => {
      const next = !current;
      try {
        if (next) localStorage.setItem(SIMULATE_KEY, '1');
        else localStorage.removeItem(SIMULATE_KEY);
      } catch {
        // Ignore storage failures; state still flips for this session.
      }
      return next;
    });
  }, []);

  const value = useMemo<ConnectionContextValue>(
    () => ({
      browserOnline,
      simulatedOffline,
      isOnline: browserOnline && !simulatedOffline,
      toggleSimulateOffline,
    }),
    [browserOnline, simulatedOffline, toggleSimulateOffline],
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection(): ConnectionContextValue {
  const context = useContext(ConnectionContext);
  if (!context) {
    throw new Error('useConnection must be used inside ConnectionProvider');
  }
  return context;
}

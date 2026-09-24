import { Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { GraduationCap } from 'lucide-react';
import { ConnectionIndicator } from './ConnectionIndicator';
import { OfflineBanner, SyncStatusPill } from './SyncStatus';
import { BottomNav } from './BottomNav';
import { useAuth } from '../context/AuthContext';

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <div className="min-h-dvh bg-white">
      <div className="relative flex min-h-dvh w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-[max(env(safe-area-inset-top),0.75rem)] backdrop-blur sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-700 text-white">
                <GraduationCap className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-bold leading-none text-slate-900">ClassSync</p>
                <p className="mt-0.5 text-[11px] font-medium text-slate-500">
                  {user?.role === 'teacher' ? 'Teacher workspace' : 'Student workspace'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {user?.role === 'student' && <SyncStatusPill />}
              <ConnectionIndicator />
            </div>
          </div>
        </header>

        <OfflineBanner />

        <main className="flex-1 px-4 pb-28 pt-5 sm:px-6">
          <Outlet />
        </main>

        <BottomNav />
      </div>
    </div>
  );
}

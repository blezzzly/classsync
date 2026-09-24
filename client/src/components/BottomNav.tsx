import { NavLink } from 'react-router-dom';
import {
  ClipboardCheck,
  Home,
  PlusCircle,
  QrCode,
  User,
  BookOpen,
  Layers,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from './ui';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  end?: boolean;
}

const studentItems: NavItem[] = [
  { to: '/student', label: 'Home', icon: Home, end: true },
  { to: '/student/join', label: 'Join', icon: QrCode },
  { to: '/student/activities', label: 'Activities', icon: BookOpen },
  { to: '/student/submissions', label: 'Submissions', icon: ClipboardCheck },
  { to: '/student/profile', label: 'Profile', icon: User },
];

const teacherItems: NavItem[] = [
  { to: '/teacher', label: 'Home', icon: Home, end: true },
  { to: '/teacher/activities', label: 'Activities', icon: Layers },
  { to: '/teacher/activities/new', label: 'Create', icon: PlusCircle },
  { to: '/teacher/submissions', label: 'Submissions', icon: ClipboardCheck },
  { to: '/teacher/profile', label: 'Profile', icon: User },
];

export function BottomNav() {
  const { user } = useAuth();
  const items = user?.role === 'teacher' ? teacherItems : studentItems;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 w-full border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[11px] font-semibold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-700',
                  isActive
                    ? 'text-teal-700'
                    : 'text-slate-500 hover:text-slate-800',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                      isActive && 'bg-teal-50',
                    )}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  {item.label}
                  <span className="sr-only">{isActive ? '(current page)' : ''}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

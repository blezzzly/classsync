import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { GraduationCap, Sparkles, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Button, Card, Field, Input, Select, Spinner } from '../components/ui';
import { ApiError } from '../lib/api';
import type { Role } from '@shared/types';

export function LoginPage() {
  const { user, ready, signIn } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [loading, setLoading] = useState<'teacher' | 'student' | 'form' | null>(null);

  if (ready && user) {
    return <Navigate to={user.role === 'teacher' ? '/teacher' : '/student'} replace />;
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100">
        <Spinner label="Loading ClassSync..." />
      </div>
    );
  }

  const handleDemo = async (demoRole: Role) => {
    const demoName = demoRole === 'teacher' ? 'Teacher Demo' : 'Alex Santos';
    setLoading(demoRole);
    try {
      const signedIn = await signIn(demoName, demoRole);
      toast.success(`Welcome, ${signedIn.name}`);
      navigate(demoRole === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sign in');
    } finally {
      setLoading(null);
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      toast.error('Enter your name to sign in');
      return;
    }
    setLoading('form');
    try {
      const signedIn = await signIn(name.trim(), role);
      toast.success(`Welcome, ${signedIn.name}`);
      navigate(signedIn.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : 'Could not sign in');
    } finally {
      setLoading(null);
    }
  };

  const demoAccounts: Array<{
    role: Role;
    name: string;
    detail: string;
    icon: typeof Sparkles;
    iconClass: string;
    variant: 'primary' | 'secondary';
  }> = [
    {
      role: 'teacher',
      name: 'Teacher Demo',
      detail: 'Create activities, publish codes',
      icon: Sparkles,
      iconClass: 'bg-teal-50 text-teal-700',
      variant: 'primary',
    },
    {
      role: 'student',
      name: 'Student Demo',
      detail: 'Alex Santos · join & answer offline',
      icon: UserRound,
      iconClass: 'bg-sky-50 text-sky-700',
      variant: 'secondary',
    },
  ];

  return (
    <div className="min-h-dvh bg-white">
      <div className="flex w-full flex-col px-5 pb-10 pt-[max(env(safe-area-inset-top),2.5rem)] sm:px-8">
        <div className="mb-8">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-md">
            <GraduationCap className="h-8 w-8" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">ClassSync</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            Offline-first learning. Keep answering when the internet drops — everything syncs when
            you&apos;re back online.
          </p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Demo access
          </p>
          {demoAccounts.map((account) => {
            const Icon = account.icon;
            return (
              <Card key={account.role} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${account.iconClass}`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{account.name}</p>
                    <p className="truncate text-xs text-slate-500">{account.detail}</p>
                  </div>
                </div>
                <Button
                  variant={account.variant}
                  onClick={() => void handleDemo(account.role)}
                  loading={loading === account.role}
                  disabled={loading !== null}
                >
                  Enter
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="my-6 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium text-slate-400">or sign in manually</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Your name" htmlFor="login-name" required>
            <Input
              id="login-name"
              name="name"
              autoComplete="name"
              placeholder="e.g. Jamie Cruz"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Role" htmlFor="login-role">
            <Select
              id="login-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
            >
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </Select>
          </Field>
          <Button type="submit" block loading={loading === 'form'} disabled={loading !== null}>
            Sign in
          </Button>
          <p className="text-xs text-slate-400">
            Demo accounts: Teacher Demo, Alex Santos, Jamie Cruz, Sam Reyes
          </p>
        </form>
      </div>
    </div>
  );
}

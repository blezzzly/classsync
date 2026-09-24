import { useEffect } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function HomeRedirect() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && user) {
      navigate(user.role === 'teacher' ? '/teacher' : '/student', { replace: true });
    } else if (ready && !user) {
      navigate('/login', { replace: true });
    }
  }, [ready, user, navigate]);

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-slate-100 text-slate-500">
        Loading...
      </div>
    );
  }

  return <Navigate to="/login" replace />;
}

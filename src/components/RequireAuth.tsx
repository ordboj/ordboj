import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { AccountBar } from '@/components/AccountBar';
import { OfflineSignIn } from '@/components/AuthScreen';
import { AUTH_COPY } from '@/lib/auth/copy';
import { safeNextPath } from '@/lib/auth/origin';
import { useAuthSession } from '@/lib/auth/session';

function SessionLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground"
    >
      <p className="text-muted-foreground">{AUTH_COPY.loading}</p>
    </div>
  );
}

/**
 * App screens (home, practice, review, progress, settings) require a session.
 * The static shell can load without one. A missing session sends the learner
 * to sign-in. Offline with no session shows a connect message and does not
 * render the screen. Offline with a confirmed session stays open.
 */
export function RequireAuth() {
  const session = useAuthSession();
  const location = useLocation();

  if (session.status === 'loading') return <SessionLoading />;
  if (session.status === 'offline-anonymous') return <OfflineSignIn />;
  if (session.status === 'anonymous') {
    const next = safeNextPath(`${location.pathname}${location.search}`);
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      <AccountBar user={session.user} />
      <Outlet />
    </>
  );
}

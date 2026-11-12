import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AUTH_COPY } from '@/lib/auth/copy';
import { signOut, type AuthUser } from '@/lib/auth/session';

export function AccountBar({ user }: { user: AuthUser }) {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSignOut() {
    setMessage(null);
    setPending(true);
    const result = await signOut();
    setPending(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    // py-1, not py-2: this row sits above every practice screen. At 360x640
    // the particle prompt has to keep Check Answer on screen (ORD-128).
    <div className="border-b bg-card px-4 py-1">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="truncate text-sm">
          {AUTH_COPY.signedInAs} {user.email}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => void onSignOut()}
        >
          {AUTH_COPY.signOut}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="mx-auto mt-2 max-w-2xl text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

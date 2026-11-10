import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { AUTH_COPY } from '@/lib/auth/copy';
import { registerPasskey } from '@/lib/auth/passkey';
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

  async function onAddPasskey() {
    setMessage(null);
    setPending(true);
    const result = await registerPasskey();
    setPending(false);
    if (!result.ok) setMessage(result.message);
  }

  return (
    <div className="border-b bg-card px-4 py-2">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <p className="truncate text-sm">
          {AUTH_COPY.signedInAs} {user.email}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {user.emailVerified ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => void onAddPasskey()}
            >
              {AUTH_COPY.addPasskey}
            </Button>
          ) : null}
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
      </div>
      {message ? (
        <p role="alert" className="mx-auto mt-2 max-w-2xl text-sm text-destructive">
          {message}
        </p>
      ) : null}
    </div>
  );
}

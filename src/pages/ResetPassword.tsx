import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AuthError, AuthScreen, AuthStatus, TextLink } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  requestPasswordReset,
  setNewPassword,
  validateEmail,
  validatePassword,
} from '@/lib/auth/actions';
import { loadAuthConfig } from '@/lib/auth/config';
import { AUTH_COPY } from '@/lib/auth/copy';

export default function ResetPassword() {
  const [search] = useSearchParams();
  const token = search.get('token');
  const linkError = search.get('error');
  const [mail, setMail] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    void loadAuthConfig().then((value) => {
      if (live) setMail(value.mail);
    });
    return () => {
      live = false;
    };
  }, []);

  async function onRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    const result = await requestPasswordReset(email);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSent(true);
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const invalid = validatePassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (password !== confirm) {
      setError(AUTH_COPY.passwordMismatch);
      return;
    }
    setPending(true);
    setError(null);
    const result = await setNewPassword(token, password);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setSaved(true);
  }

  if (token && !linkError) {
    return (
      <AuthScreen title={AUTH_COPY.resetTitle}>
        {error ? <AuthError>{error}</AuthError> : null}
        {saved ? <p>{AUTH_COPY.passwordSaved}</p> : null}
        {saved ? null : (
          <form className="space-y-3" onSubmit={(event) => void onSave(event)}>
            <div className="space-y-2">
              <Label htmlFor="new-password">{AUTH_COPY.newPasswordLabel}</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">{AUTH_COPY.confirmPasswordLabel}</Label>
              <Input
                id="confirm-password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {AUTH_COPY.savePassword}
            </Button>
          </form>
        )}
        <TextLink to="/sign-in">{AUTH_COPY.passwordSignIn}</TextLink>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={AUTH_COPY.resetTitle} intro={AUTH_COPY.resetRequestBody}>
      {linkError ? <AuthError>{AUTH_COPY.resetError}</AuthError> : null}
      {error ? <AuthError>{error}</AuthError> : null}
      {mail === null ? <AuthStatus>{AUTH_COPY.loading}</AuthStatus> : null}
      {mail === false ? <p>{AUTH_COPY.emailUnavailable}</p> : null}
      {sent ? <p>{AUTH_COPY.resetSent}</p> : null}
      {mail && !sent ? (
        <form className="space-y-3" onSubmit={(event) => void onRequest(event)}>
          <div className="space-y-2">
            <Label htmlFor="reset-email">{AUTH_COPY.passwordEmailLabel}</Label>
            <Input id="reset-email" name="email" type="email" autoComplete="email" required />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {AUTH_COPY.resetSubmit}
          </Button>
        </form>
      ) : null}
      <TextLink to="/sign-in">{AUTH_COPY.passwordSignIn}</TextLink>
    </AuthScreen>
  );
}

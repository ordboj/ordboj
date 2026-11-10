import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthError, AuthScreen, AuthStatus, TextLink } from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signUpWithPassword, validateEmail, validatePassword } from '@/lib/auth/actions';
import { loadAuthConfig } from '@/lib/auth/config';
import { AUTH_COPY } from '@/lib/auth/copy';

export default function SignUp() {
  const navigate = useNavigate();
  const [mail, setMail] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    const invalid = validateEmail(email) ?? validatePassword(password);
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
    const result = await signUpWithPassword(email, password);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate('/verify-email', { state: { email: email.trim() } });
  }

  return (
    <AuthScreen title={AUTH_COPY.signUpTitle} intro={AUTH_COPY.signUpIntro}>
      {error ? <AuthError>{error}</AuthError> : null}
      {mail === null ? <AuthStatus>{AUTH_COPY.loading}</AuthStatus> : null}
      {mail === false ? <p>{AUTH_COPY.emailUnavailable}</p> : null}
      {mail ? (
        <form className="space-y-3" onSubmit={(event) => void onSubmit(event)}>
          <div className="space-y-2">
            <Label htmlFor="sign-up-email">{AUTH_COPY.passwordEmailLabel}</Label>
            <Input id="sign-up-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sign-up-password">{AUTH_COPY.passwordLabel}</Label>
            <Input
              id="sign-up-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sign-up-confirm">{AUTH_COPY.confirmPasswordLabel}</Label>
            <Input
              id="sign-up-confirm"
              name="confirm"
              type="password"
              autoComplete="new-password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {AUTH_COPY.createAccountSubmit}
          </Button>
        </form>
      ) : null}
      <TextLink to="/sign-in">
        {AUTH_COPY.haveAccount} {AUTH_COPY.passwordSignIn}
      </TextLink>
    </AuthScreen>
  );
}

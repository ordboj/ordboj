import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AuthError,
  AuthScreen,
  AuthStatus,
  OfflineSignIn,
  TextLink,
} from '@/components/AuthScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  requestMagicLink,
  signInWithPassword,
  startOAuth,
  validateEmail,
  validatePassword,
  type OAuthProvider,
} from '@/lib/auth/actions';
import { loadAuthConfig, type AuthConfig } from '@/lib/auth/config';
import { AUTH_COPY } from '@/lib/auth/copy';
import { safeNextPath } from '@/lib/auth/origin';
import { useAuthSession } from '@/lib/auth/session';

const PROVIDERS: { id: OAuthProvider; label: string }[] = [
  { id: 'google', label: AUTH_COPY.google },
  { id: 'github', label: AUTH_COPY.github },
  { id: 'microsoft', label: AUTH_COPY.microsoft },
];

// Official multi-color G (standard color), not a redraw:
// https://www.gstatic.com/images/branding/googleg/2x/googleg_standard_color_128dp.png
const GOOGLE_G_SRC = '/brand/google-g.png';
const COOKIE_NOTICE_KEY = 'ordboj-necessary-cookie-notice';

function cookieNoticeOpen(): boolean {
  try {
    return localStorage.getItem(COOKIE_NOTICE_KEY) !== '1';
  } catch {
    return true;
  }
}

function CookieNotice() {
  const [open, setOpen] = useState(cookieNoticeOpen);
  if (!open) return null;

  function dismiss() {
    try {
      localStorage.setItem(COOKIE_NOTICE_KEY, '1');
    } catch {
      // Storage can be blocked. Closing the line still leaves every other key alone.
    }
    setOpen(false);
  }

  return (
    <div className="space-y-1 text-center">
      <p className="text-sm text-muted-foreground">
        {AUTH_COPY.cookieNotice}{' '}
        <a href="/privacy" className="text-primary underline underline-offset-4">
          {AUTH_COPY.privacyPolicy}
        </a>
        {'.'}
      </p>
      <button
        type="button"
        className="text-sm font-medium text-primary underline underline-offset-4"
        onClick={dismiss}
      >
        {AUTH_COPY.cookieNoticeOk}
      </button>
    </div>
  );
}

function GoogleSignInButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="inline-flex h-12 w-full items-center justify-center gap-3 rounded-full bg-[#5D83E5] px-5 text-base font-medium text-white transition-colors hover:bg-[#4F74D4] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-white"
        aria-hidden="true"
      >
        <img src={GOOGLE_G_SRC} alt="" width={22} height={22} className="size-[22px]" />
      </span>
      {AUTH_COPY.google}
    </button>
  );
}

function useAuthConfig(): AuthConfig | null {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    let live = true;
    void loadAuthConfig().then((value) => {
      if (live) setConfig(value);
    });
    return () => {
      live = false;
    };
  }, []);
  return config;
}

export default function SignIn() {
  const session = useAuthSession();
  const config = useAuthConfig();
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = safeNextPath(search.get('next'));
  const [error, setError] = useState<string | null>(
    search.get('error') ? AUTH_COPY.genericError : null,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (session.status === 'authenticated') navigate(next, { replace: true });
  }, [session.status, navigate, next]);

  if (
    session.status === 'offline-anonymous' ||
    (typeof navigator !== 'undefined' &&
      navigator.onLine === false &&
      session.status !== 'authenticated')
  ) {
    return <OfflineSignIn />;
  }

  async function onMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get('email') ?? '');
    const invalid = validateEmail(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    const result = await requestMagicLink(email);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    navigate('/magic-link');
  }

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const invalid = validateEmail(email) ?? validatePassword(password);
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setError(null);
    const result = await signInWithPassword(email, password);
    setPending(false);
    if (!result.ok) setError(result.message);
  }

  async function onProvider(provider: OAuthProvider) {
    setPending(true);
    setError(null);
    const result = await startOAuth(provider);
    setPending(false);
    if (!result.ok) setError(result.message);
  }

  const ready = config ?? null;
  const mail = ready?.mail === true;
  const providers = PROVIDERS.filter((provider) => ready?.oauth[provider.id] === true);

  return (
    <AuthScreen title={AUTH_COPY.signInTitle} intro={AUTH_COPY.signInIntro} showLosev>
      {error ? <AuthError>{error}</AuthError> : null}
      {ready === null ? <AuthStatus>{AUTH_COPY.loading}</AuthStatus> : null}
      {providers.map((provider) =>
        provider.id === 'google' ? (
          <div key={provider.id} className="space-y-2">
            <GoogleSignInButton disabled={pending} onClick={() => void onProvider(provider.id)} />
            {/* Plain <a>, not a router link: a full load stays on this origin. */}
            <p className="text-center text-sm text-muted-foreground">
              {AUTH_COPY.signInConsentBefore}{' '}
              <a href="/privacy" className="text-primary underline underline-offset-4">
                {AUTH_COPY.privacyPolicy}
              </a>
              {' and '}
              <a href="/terms" className="text-primary underline underline-offset-4">
                {AUTH_COPY.termsOfUse}
              </a>
            </p>
          </div>
        ) : (
          <Button
            key={provider.id}
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => void onProvider(provider.id)}
          >
            {provider.label}
          </Button>
        ),
      )}
      {mail ? (
        <>
          <form className="space-y-3" onSubmit={(event) => void onMagicLink(event)}>
            <div className="space-y-2">
              <Label htmlFor="magic-link-email">{AUTH_COPY.magicLinkLabel}</Label>
              <Input
                id="magic-link-email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {AUTH_COPY.magicLinkSubmit}
            </Button>
          </form>
          <form className="space-y-3" onSubmit={(event) => void onPassword(event)}>
            <div className="space-y-2">
              <Label htmlFor="sign-in-email">{AUTH_COPY.passwordEmailLabel}</Label>
              <Input
                id="sign-in-email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sign-in-password">{AUTH_COPY.passwordLabel}</Label>
              <Input
                id="sign-in-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={pending}>
              {AUTH_COPY.passwordSignIn}
            </Button>
          </form>
          <div className="flex flex-col gap-2">
            <TextLink to="/sign-up">{AUTH_COPY.createAccount}</TextLink>
            <TextLink to="/reset-password">{AUTH_COPY.forgotPassword}</TextLink>
          </div>
        </>
      ) : ready ? (
        <p>{AUTH_COPY.emailUnavailable}</p>
      ) : null}
      <TextLink to="/privacy">{AUTH_COPY.privacyLink}</TextLink>
      <CookieNotice />
    </AuthScreen>
  );
}

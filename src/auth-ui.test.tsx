import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '@/App';
import { callbackURL } from '@/lib/auth/origin';
import { registerBeforeSignOut, reportUnauthorized, resetAuthForTests } from '@/lib/auth/session';

const SRS_KEY = 'swedish-verbs-srs-progress';
const SETTINGS_KEY = 'swedish-verbs-settings';
const BACKUP_KEY = 'swedish-verbs-srs-progress-backup-pre-v3';
const LOG_KEY = 'swedish-verbs-answer-log';

function paragraphText(expected: string) {
  return (_: unknown, node: Element | null) =>
    node?.tagName === 'P' && (node.textContent ?? '').replace(/\s+/g, ' ').trim() === expected;
}

// WCAG 2 relative luminance. White on #5D83E5 is 3.59:1, under the 4.5:1
// needed for this 16px medium label. The sign-in pill must clear 4.5:1.
function contrastRatio(foreground: string, background: string): number {
  const channel = (hex: string, shift: number) => {
    const s = ((parseInt(hex.slice(1), 16) >> shift) & 255) / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (hex: string) =>
    0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0);
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const preserved = {
  [SRS_KEY]: JSON.stringify({
    version: 3,
    items: { 'vara-presens': { repetitions: 2, intervalDays: 3, easeFactor: 2.5, dueAt: 10 } },
  }),
  [SETTINGS_KEY]: JSON.stringify({ practiceMode: 'typing', showExamples: false }),
  [BACKUP_KEY]: '{"legacy":true}',
  [LOG_KEY]: '{"entries":[]}',
} as const;

vi.mock('@/pages/Home', () => ({
  default: function MockHome() {
    return <h1>Home screen</h1>;
  },
}));

vi.mock('@/pages/Practice', () => ({
  default: function MockPractice() {
    return <h1>Practice screen</h1>;
  },
}));

vi.mock('@/pages/PracticeParticles', () => ({
  default: function MockPracticeParticles() {
    return <h1>Particle screen</h1>;
  },
}));

vi.mock('@/pages/Progress', () => ({
  default: function MockProgress() {
    return <h1>Progress screen</h1>;
  },
}));

vi.mock('@/pages/Settings', () => ({
  default: function MockSettings() {
    return <h1>Settings screen</h1>;
  },
}));

type AuthUser = { id: string; email: string; emailVerified: boolean };

const box = {
  user: null as AuthUser | null,
  config: {
    oauth: { google: false, github: false, microsoft: false },
    mail: false,
  },
  requests: [] as { url: string; body: string }[],
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body = typeof init?.body === 'string' ? init.body : '';
      box.requests.push({ url, body });
      if (url.includes('/api/auth-config')) return json(box.config);
      if (url.includes('/api/auth/get-session')) {
        if (!box.user) return json(null);
        return json({ user: box.user, session: { id: 'sess' } });
      }
      if (url.includes('/api/auth/sign-in/email')) {
        box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
        return json({ token: 't', user: box.user, redirect: false });
      }
      if (url.includes('/api/auth/sign-out')) {
        box.user = null;
        return json({ success: true });
      }
      if (url.includes('/api/auth/sign-in/social')) {
        return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth', redirect: false });
      }
      if (url.includes('/api/auth/sign-in/magic-link')) return json({ status: true });
      if (url.includes('/api/auth/sign-up/email'))
        return json({ token: null, user: { email: 'learner@example.com' } });
      if (url.includes('/api/auth/request-password-reset')) return json({ status: true });
      if (url.includes('/api/auth/reset-password')) return json({ status: true });
      return json({ message: 'missing' }, 404);
    }),
  );
}

function seedPreserved() {
  for (const [key, value] of Object.entries(preserved)) localStorage.setItem(key, value);
}

function expectPreserved() {
  for (const [key, value] of Object.entries(preserved)) {
    expect(localStorage.getItem(key)).toBe(value);
  }
}

function mount(path: string) {
  window.history.pushState({}, '', path);
  return render(<App />);
}

describe('client auth UI', () => {
  beforeEach(() => {
    localStorage.clear();
    resetAuthForTests();
    box.user = null;
    box.config = { oauth: { google: false, github: false, microsoft: false }, mail: false };
    box.requests = [];
    window.history.pushState({}, '', '/');
    installFetch();
  });

  it('keeps STORAGE_VERSION at 3', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/hooks/useSrsProgress.ts'), 'utf8');
    expect(source).toMatch(/export const STORAGE_VERSION = 3;/);
  });

  it('redirects an empty session away from practice and review', async () => {
    mount('/practice');
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Practice screen' })).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/sign-in');

    window.history.pushState({}, '', '/review');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Progress screen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Practice screen' })).not.toBeInTheDocument();
  });

  it('renders public routes without a session', async () => {
    const routes: [string, string][] = [
      ['/sign-in', 'Sign in'],
      ['/sign-up', 'Create an account'],
      ['/verify-email', 'Check your email'],
      ['/reset-password', 'Reset your password'],
      ['/magic-link', 'Sign-in link'],
    ];
    mount('/sign-in');
    for (const [path, heading] of routes) {
      window.history.pushState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
      expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Practice screen' })).not.toBeInTheDocument();
    }
  });

  it('opens the privacy policy through a plain anchor, not a client route', async () => {
    mount('/sign-in');
    const privacy = await screen.findByRole('link', { name: /^Privacy$/ });
    expect(privacy.tagName).toBe('A');
    expect(privacy).toHaveAttribute('href', '/privacy');
    expect(privacy.parentElement).toHaveClass('text-center');
    expect(privacy.parentElement?.tagName).toBe('P');
    expect(privacy).not.toHaveAttribute('data-discover');
    expect(privacy.getAttribute('href')).not.toMatch(/^https?:/);

    const signIn = readFileSync(resolve(process.cwd(), 'src/pages/SignIn.tsx'), 'utf8');
    expect(signIn).not.toMatch(/to=["']\/privacy["']/);
    expect(signIn).not.toMatch(/to=["']\/terms["']/);
    const app = readFileSync(resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    expect(app).not.toContain("import('./pages/Privacy')");
    expect(app).not.toMatch(/routed\('\/privacy'/);
  });

  it('shows the LÖSEV link on the signed-out sign-in page', async () => {
    mount('/sign-in');
    const link = await screen.findByRole('link', { name: /support lösev/i });
    expect(link).toHaveAttribute('href', 'https://www.losev.org.tr/international-donations');
  });

  it('has no Apple sign-in control', async () => {
    box.config = { oauth: { google: true, github: true, microsoft: true }, mail: true };
    mount('/sign-in');
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /apple/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/apple/i)).not.toBeInTheDocument();
  });

  it('shows magic-link and email+password controls when mail is configured', async () => {
    box.config.mail = true;
    mount('/sign-in');
    expect(await screen.findByLabelText('Email for a sign-in link')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Email me a sign-in link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create an account' })).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email for a sign-in link'), 'learner@example.com');
    await user.click(screen.getByRole('button', { name: 'Email me a sign-in link' }));
    expect(await screen.findByRole('heading', { name: 'Sign-in link' })).toBeInTheDocument();
    const magic = box.requests.find((call) => call.url.includes('/api/auth/sign-in/magic-link'));
    expect(magic?.body).toContain(callbackURL('/'));
    expect(magic?.body).not.toContain('pages.dev');
  });

  it('shows a check-your-email state and a verified state', async () => {
    mount('/verify-email');
    expect(await screen.findByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
    expect(screen.getByText(/Open the message and confirm your address/)).toBeInTheDocument();

    window.history.pushState({}, '', '/verify-email?verified=1');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('heading', { name: 'Email verified' })).toBeInTheDocument();
  });

  it('shows reset request and set-new-password controls when mail is configured', async () => {
    box.config.mail = true;
    mount('/reset-password');
    expect(await screen.findByRole('heading', { name: 'Reset your password' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();

    window.history.pushState({}, '', '/reset-password?token=reset-token');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save new password' })).toBeInTheDocument();
  });

  it('shows Google as a full-width blue pill with the official G, and a click still starts Google sign-in', async () => {
    box.config = { oauth: { google: true, github: false, microsoft: false }, mail: false };
    mount('/sign-in');
    const button = await screen.findByRole('button', { name: 'Sign in with Google' });
    expect(button).toHaveClass(
      'h-12',
      'w-full',
      'rounded-full',
      'bg-[#4F6FC3]',
      'text-white',
      'text-base',
      'font-medium',
      'hover:bg-[#4A69B7]',
    );
    const fill = button.className.match(/(?:^|\s)bg-\[(#[0-9A-Fa-f]{6})\]/)?.[1] ?? '';
    const hover = button.className.match(/hover:bg-\[(#[0-9A-Fa-f]{6})\]/)?.[1] ?? '';
    expect(contrastRatio('#FFFFFF', fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio('#FFFFFF', hover)).toBeGreaterThanOrEqual(4.5);
    expect(screen.getAllByRole('button', { name: 'Sign in with Google' })).toHaveLength(1);
    const logo = button.querySelector('img');
    expect(logo).toHaveAttribute('src', '/brand/google-g.png');
    expect(logo).toHaveAttribute('alt', '');
    // Published standard-color G, not a redraw:
    // https://www.gstatic.com/images/branding/googleg/2x/googleg_standard_color_128dp.png
    const mark = readFileSync(resolve(process.cwd(), 'public/brand/google-g.png'));
    expect(createHash('sha256').update(mark).digest('hex')).toBe(
      '6fae509b81bc94fef1b4ac2cdae8f1889df2da9f736f050cd32e337517494084',
    );

    const user = userEvent.setup();
    await user.click(button);
    await waitFor(() => {
      expect(box.requests.some((call) => call.url.includes('/api/auth/sign-in/social'))).toBe(true);
    });
    const social = box.requests.find((call) => call.url.includes('/api/auth/sign-in/social'));
    expect(social?.body).toContain('"provider":"google"');
    expect(social?.body).toContain(callbackURL('/'));
    expect(social?.body).toContain(callbackURL('/sign-in'));
    expect(social?.body).not.toContain('pages.dev');
  });

  it('states that signing in agrees to the privacy policy and the terms of use', async () => {
    box.config = { oauth: { google: true, github: false, microsoft: false }, mail: false };
    mount('/sign-in');
    const button = await screen.findByRole('button', { name: 'Sign in with Google' });
    const consent = screen.getByText(
      paragraphText('By signing in, you agree to the Privacy Policy and Terms of Use'),
    );
    const policy = within(consent).getByRole('link', { name: 'Privacy Policy' });
    const terms = within(consent).getByRole('link', { name: 'Terms of Use' });
    expect(policy).toHaveAttribute('href', '/privacy');
    expect(terms).toHaveAttribute('href', '/terms');
    expect(policy).toHaveClass('whitespace-nowrap');
    expect(terms).toHaveClass('whitespace-nowrap');
    expect(policy.tagName).toBe('A');
    expect(terms.tagName).toBe('A');
    expect(policy).not.toHaveAttribute('data-discover');
    expect(terms).not.toHaveAttribute('data-discover');
    expect(policy.getAttribute('href')).not.toMatch(/^https?:/);
    expect(terms.getAttribute('href')).not.toMatch(/^https?:/);
    expect(button.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('explains the necessary cookie and dismisses it without touching stored practice', async () => {
    seedPreserved();
    box.config = { oauth: { google: true, github: false, microsoft: false }, mail: false };
    const first = mount('/sign-in');
    const notice = await screen.findByText(
      paragraphText(
        'Ordböj uses a necessary cookie to keep you signed in, and stores practice progress in this browser. See the Privacy Policy.',
      ),
    );
    const policy = within(notice).getByRole('link', { name: 'Privacy Policy' });
    expect(policy).toHaveAttribute('href', '/privacy');
    expect(policy.parentElement).toHaveClass('whitespace-nowrap');
    expect(policy.parentElement?.textContent).toMatch(/Privacy Policy\./);
    const ok = screen.getByRole('button', { name: 'OK' });
    expect(ok).toHaveClass('min-h-11', 'min-w-11');
    expect(policy).not.toHaveAttribute('data-discover');
    expect(policy.getAttribute('href')).not.toMatch(/^https?:/);
    expect(screen.queryByRole('button', { name: /reject/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /accept/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(
      screen.queryByText(/uses a necessary cookie to keep you signed in/i),
    ).not.toBeInTheDocument();
    expect(localStorage.getItem('ordboj-necessary-cookie-notice')).toBe('1');
    expectPreserved();

    first.unmount();
    resetAuthForTests();
    mount('/sign-in');
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(
      screen.queryByText(/uses a necessary cookie to keep you signed in/i),
    ).not.toBeInTheDocument();
    expectPreserved();
  });

  it('shows Google, GitHub, and Microsoft only when that provider is configured', async () => {
    box.config = { oauth: { google: true, github: true, microsoft: true }, mail: false };
    mount('/sign-in');
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with Microsoft' })).toBeInTheDocument();
    expect(screen.getByText('Email sign-in is not available yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign in with Google' }));
    await waitFor(() => {
      expect(box.requests.some((call) => call.url.includes('/api/auth/sign-in/social'))).toBe(true);
    });
    const social = box.requests.find((call) => call.url.includes('/api/auth/sign-in/social'));
    expect(social?.body).toContain('"provider":"google"');
    expect(social?.body).toContain(callbackURL('/'));
    expect(social?.body).toContain(callbackURL('/sign-in'));
    expect(social?.body).not.toContain('pages.dev');
    expect(social?.body).not.toContain('apple');
  });

  it('hides every provider button and the email form when nothing is configured', async () => {
    mount('/sign-in');
    expect(await screen.findByText('Email sign-in is not available yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with Microsoft' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Email me a sign-in link' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /support lösev/i })).toBeInTheDocument();
  });

  it('hides a single provider whose keys are missing', async () => {
    box.config = { oauth: { google: false, github: true, microsoft: false }, mail: false };
    mount('/sign-in');
    expect(await screen.findByRole('button', { name: 'Sign in with GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in with Google' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with Microsoft' }),
    ).not.toBeInTheDocument();
  });

  it('never offers a passkey, before or after sign-in', async () => {
    localStorage.setItem('ordboj-passkey-on-device', '1');
    box.config = { oauth: { google: true, github: false, microsoft: false }, mail: false };
    const signedOut = mount('/sign-in');
    expect(await screen.findByRole('button', { name: 'Sign in with Google' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with a passkey' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/passkey/i)).not.toBeInTheDocument();
    signedOut.unmount();

    resetAuthForTests();
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: false };
    const unverified = mount('/');
    expect(await screen.findByText(/learner@example.com/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
    expect(screen.queryByText(/passkey/i)).not.toBeInTheDocument();
    unverified.unmount();

    resetAuthForTests();
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    mount('/');
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add a passkey' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Sign in with a passkey' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/passkey/i)).not.toBeInTheDocument();
  });

  it('tells an offline learner with no session to connect, and does not open practice', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    mount('/practice');
    expect(await screen.findByRole('heading', { name: 'Connect to sign in' })).toBeInTheDocument();
    expect(screen.getByText(/Connect to the internet to sign in/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Practice screen' })).not.toBeInTheDocument();
  });

  it('keeps app screens open when a signed-in learner is offline', async () => {
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    mount('/');
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    expect(await screen.findByRole('heading', { name: 'Home screen' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Connect to sign in' })).not.toBeInTheDocument();
  });

  it('shows the account email and a sign-out control after sign-in', async () => {
    box.config.mail = true;
    seedPreserved();
    mount('/sign-in');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Email'), 'learner@example.com');
    await user.type(screen.getByLabelText('Password'), 'correct-horse');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Signed in as learner@example.com')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Home screen' })).toBeInTheDocument();
    expectPreserved();
  });

  it('stays signed in and shows a message when the beforeSignOut hook fails', async () => {
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    seedPreserved();
    registerBeforeSignOut(() => {
      throw new Error('sync failed');
    });
    mount('/');
    expect(await screen.findByText('Signed in as learner@example.com')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/still signed in/i);
    expect(screen.getByText('Signed in as learner@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Sign in' })).not.toBeInTheDocument();
    expectPreserved();
  });

  it('shows the hook message and keeps the session when the hook returns ok: false', async () => {
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    seedPreserved();
    registerBeforeSignOut(() => ({ ok: false, message: 'Save did not finish.' }));
    mount('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save did not finish.');
    expect(screen.getByText('Signed in as learner@example.com')).toBeInTheDocument();
    expectPreserved();
  });

  it('locks app routes on 401 without changing the old local stores', async () => {
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    seedPreserved();
    mount('/practice');
    expect(await screen.findByRole('heading', { name: 'Practice screen' })).toBeInTheDocument();
    reportUnauthorized();
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Practice screen' })).not.toBeInTheDocument();
    expectPreserved();
  });

  it('leaves the old local stores unchanged after sign-out', async () => {
    box.user = { id: 'user-1', email: 'learner@example.com', emailVerified: true };
    seedPreserved();
    mount('/');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
    expectPreserved();
  });
});

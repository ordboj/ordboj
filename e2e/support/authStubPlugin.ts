import type { Connect, Plugin } from 'vite';

/**
 * Playwright-only stand-in for Pages Functions. It answers session and
 * auth-config requests when ORDBOJ_E2E_SESSION=1, so the existing practice
 * journeys keep a signed-in learner. Production builds do not run this
 * middleware. A cookie `ordboj-e2e-auth=anonymous` makes get-session empty
 * so the auth specs can test the guard.
 */
export function e2eAuthStubPlugin(): Plugin {
  const attach = (middlewares: Connect.Server) => {
    middlewares.use((req, res, next) => {
      if (process.env.ORDBOJ_E2E_SESSION !== '1') {
        next();
        return;
      }
      const path = (req.url ?? '').split('?')[0];
      const cookie = req.headers.cookie ?? '';
      const anonymous = cookie.includes('ordboj-e2e-auth=anonymous');
      if (path === '/api/auth/get-session') {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(
          anonymous
            ? 'null'
            : JSON.stringify({
                session: {
                  id: 'e2e-session',
                  userId: 'e2e-user',
                  expiresAt: '2099-01-01T00:00:00.000Z',
                  token: 'e2e',
                },
                user: {
                  id: 'e2e-user',
                  email: 'learner@example.com',
                  emailVerified: true,
                  name: '',
                  image: null,
                },
              }),
        );
        return;
      }
      if (path === '/api/auth-config') {
        const configured = cookie.includes('ordboj-e2e-auth-config=on');
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        res.end(
          JSON.stringify({
            oauth: { google: configured, github: configured, microsoft: configured },
            mail: configured,
          }),
        );
        return;
      }
      next();
    });
  };

  return {
    name: 'ordboj-e2e-auth-stub',
    configureServer(server) {
      attach(server.middlewares);
    },
    configurePreviewServer(server) {
      attach(server.middlewares);
    },
  };
}

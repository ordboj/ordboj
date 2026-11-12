// /privacy is a Pages Function so the SPA rewrite in public/_redirects does
// not apply. A 200 rewrite to privacy.html loops: Pages strips ".html" and
// requests /privacy again. Functions are not passed through _redirects.
// The body is plain HTML. It does not load the trainer.

export const PRIVACY_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Privacy — Ordböj</title>
    <meta
      name="description"
      content="What Ordböj stores when you practice Swedish verbs and when you sign in with Google."
    />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="theme-color" content="#006AA7" />
    <style>
      body {
        margin: 0;
        color: #1a1a1a;
        background: #fff;
        font-family: system-ui, sans-serif;
        line-height: 1.5;
      }

      main {
        max-width: 40rem;
        margin: 0 auto;
        padding: 2rem 1rem 3rem;
      }

      h1 {
        margin: 0 0 1rem;
        color: #006aa7;
        font-size: 2rem;
      }

      p {
        margin: 0 0 1rem;
      }

      a {
        color: #006aa7;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Privacy</h1>
      <p>Ordböj is a site for practicing Swedish verbs.</p>
      <p>
        When you sign in with Google, Google shares your email address and basic profile with
        Ordböj (Google profile, openid, and email). Ordböj stores the email address so it can sign
        you in.
      </p>
      <p>A sign-in cookie is stored in your browser when you sign in.</p>
      <p>Practice progress is stored in this browser.</p>
      <p>Ordböj does not sell this data.</p>
      <p><a href="/">Back to Ordböj</a></p>
    </main>
  </body>
</html>
`;

export function privacyResponse(): Response {
  return new Response(PRIVACY_HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

export const onRequest = () => privacyResponse();

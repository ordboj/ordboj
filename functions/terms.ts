// /terms is a Pages Function so the SPA rewrite in public/_redirects does
// not apply. A 200 rewrite to terms.html loops: Pages strips ".html" and
// requests /terms again. Functions are not passed through _redirects.
// The body is plain HTML. It does not load the trainer.

export const TERMS_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Terms of Use — Ordböj</title>
    <meta name="description" content="Ordböj is a free site for practicing Swedish verbs." />
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
      <h1>Terms of Use</h1>
      <p>Ordböj is a free site for practicing Swedish verbs.</p>
      <p>To use the site, you must sign in. We currently offer sign-in with Google.</p>
      <p>You may use Ordböj for your own learning. Do not misuse the service, try to break it, or harm other users.</p>
      <p>How we handle your data is described in the <a href="/privacy">Privacy Policy</a>.</p>
      <p>The service is provided as is. We may change or stop it.</p>
      <p>These terms are governed by the laws of Sweden.</p>
      <p>If we change these terms, we will update this page.</p>
      <p><a href="/">Back to Ordböj</a></p>
      <p><a href="/privacy">Privacy</a></p>
    </main>
  </body>
</html>
`;

export function termsResponse(): Response {
  return new Response(TERMS_HTML, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  });
}

export const onRequest = () => termsResponse();

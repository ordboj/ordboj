# Set up auth on Cloudflare Pages

This page tells you how to create the D1 databases and how to set the auth secrets.
The commands do not put secrets in git.

## Create the D1 databases

Create one database for production.
Create a second database for preview.
Both databases use `jurisdiction=eu`.

1. Run `npx wrangler d1 create ordboj-auth --jurisdiction=eu`.
2. Copy the database id from the command output.
3. Put that id in `database_id` in `wrangler.jsonc`.
4. Run `npx wrangler d1 create ordboj-auth-preview --jurisdiction=eu`.
5. Copy the preview database id from the command output.
6. Put that id in `preview_database_id` in `wrangler.jsonc`.

Preview deployments use `preview_database_id`.
Production uses `database_id`.
The binding name in the Functions code is `DB` for both databases.
Preview does not read the production database.
Preview does not write the production database.

Do not commit a placeholder `database_id`.
Pages looks up that id during the deploy.
A missing id fails the deploy.
Then the SPA on `ordboj.com` does not update.
The committed `wrangler.jsonc` omits the D1 binding until both ids exist.
Until the binding exists, `/api/auth` and `/api/progress` return 503.
The static site in `dist` still deploys.

After both databases exist, add this block to `wrangler.jsonc`:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "ordboj-auth",
    "database_id": "PASTE_PRODUCTION_D1_ID",
    "preview_database_id": "PASTE_PREVIEW_D1_ID",
    "migrations_dir": "migrations"
  }
]
```

Replace `PASTE_PRODUCTION_D1_ID` with the production database id.
Replace `PASTE_PREVIEW_D1_ID` with the preview database id.
The two ids are different.

## Set the secrets

Set these secrets in the Cloudflare Pages project.
Do not write the secret values in git.

- `BETTER_AUTH_SECRET`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `MICROSOFT_CLIENT_ID`
- `MICROSOFT_CLIENT_SECRET`
- `RESEND_API_KEY`

1. Open the Pages project in the Cloudflare dashboard.
2. Open Settings.
3. Open Variables and secrets.
4. Add each secret for Production.
5. If you want sign-in on preview, add the same names for Preview.

`BETTER_AUTH_SECRET` must contain at least 32 characters.
Use a different value for production and for preview.

Google, GitHub, and Microsoft sign-in need the client id and the client secret.
OAuth, sessions, passkeys, and the progress API work when `RESEND_API_KEY` is absent.
Magic-link, password sign-up, and password reset stay off until you set `RESEND_API_KEY`.

## OAuth redirect URLs

Register these redirect URLs on `https://ordboj.com`.

- `https://ordboj.com/api/auth/callback/google`
- `https://ordboj.com/api/auth/callback/github`
- `https://ordboj.com/api/auth/callback/microsoft`

Do not add an Apple provider.

## Run the migrations

If the database ids are still placeholders, replace them first.
Then run the migrations.

1. Run `npx wrangler d1 migrations apply ordboj-auth --remote`.
2. Run `npx wrangler d1 migrations apply ordboj-auth-preview --remote`.
3. If you need a local database, run `npx wrangler d1 migrations apply ordboj-auth --local`.

The migration files are in `migrations/`.
They create the Better Auth tables and the `user_progress` table.

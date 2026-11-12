# Set up auth on Cloudflare Pages

This page tells you how to create the D1 databases and how to set the auth secrets.
The commands do not put secrets in git.

## Create the D1 databases

Create one database for production.
Create a second database for preview.
Both databases use `jurisdiction=eu`.

1. Run `npx wrangler d1 create ordboj-auth --jurisdiction=eu`.
2. Copy the database id from the command output.
3. Run `npx wrangler d1 create ordboj-auth-preview --jurisdiction=eu`.
4. Copy the preview database id from the command output.
5. Put each id in `wrangler.jsonc`, in the block for that database.

The production database name is `ordboj-auth`.
The production database id is `ebdb1667-044a-430b-8412-c8b03da1f229`.
The preview database name is `ordboj-auth-preview`.
The preview database id is `ba9a4066-b4e4-4058-885d-a20fae74d05d`.

A production Pages deploy reads `env.production`.
A preview Pages deploy reads `env.preview`.
Pages does not read `preview_database_id` for a preview deploy.
`preview_database_id` applies only to `wrangler dev`.
Wrangler does not copy `d1_databases` into a named environment.
Put `d1_databases` in `env.production` and in `env.preview`.
The binding name is `DB` for both databases.
Set `migrations_dir` to `migrations` on each binding.

The top-level `d1_databases` block binds the production database.
Local `wrangler pages dev` reads that top-level block.
`env.production` repeats the production database.
`env.preview` contains only the preview database.
Do not put the production id in `env.preview`.
If the production id is in `env.preview`, a preview deploy uses the production database.

Do not commit a placeholder `database_id`.
Pages looks up that id during the deploy.
A missing id fails the deploy.
Then the SPA on `ordboj.com` does not update.
If the `DB` binding is missing, `/api/auth` and `/api/progress` return 503.
The static site in `dist` still deploys.

Read the Pages rule for environment overrides at <https://developers.cloudflare.com/pages/functions/wrangler-configuration/#environment-specific-overrides>.
`d1_databases` is a non-inheritable key on that page.
Read the `preview_database_id` rule at <https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases>.

`wrangler.jsonc` contains this binding:

```jsonc
"d1_databases": [
  {
    "binding": "DB",
    "database_name": "ordboj-auth",
    "database_id": "ebdb1667-044a-430b-8412-c8b03da1f229",
    "migrations_dir": "migrations"
  }
],
"env": {
  "production": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "ordboj-auth",
        "database_id": "ebdb1667-044a-430b-8412-c8b03da1f229",
        "migrations_dir": "migrations"
      }
    ]
  },
  "preview": {
    "d1_databases": [
      {
        "binding": "DB",
        "database_name": "ordboj-auth-preview",
        "database_id": "ba9a4066-b4e4-4058-885d-a20fae74d05d",
        "migrations_dir": "migrations"
      }
    ]
  }
}
```

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

Migrations `0001` to `0003` are already applied on both remote databases.
Run these commands again after you add a migration file.

1. Run `npx wrangler d1 migrations apply ordboj-auth --remote`.
2. Run `npx wrangler d1 migrations apply ordboj-auth-preview --remote --env preview`.
3. If you need a local database, run `npx wrangler d1 migrations apply ordboj-auth --local`.

The migration files are in `migrations/`.
They create the Better Auth tables and the `user_progress` table.
The preview command uses `--env preview`.
The preview database is only in `env.preview`.

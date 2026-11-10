import { mkdirSync, writeFileSync } from 'node:fs';
import { getMigrations } from 'better-auth/db/migration';
import { buildAuthOptions } from '../functions/auth/create-auth';
import { createSqliteD1 } from '../functions/test/sqlite-d1';

const db = createSqliteD1();
const options = buildAuthOptions(
  {
    DB: db,
    BETTER_AUTH_SECRET: 'test-only-better-auth-secret-32',
    GOOGLE_CLIENT_ID: 'test-google-client',
    GOOGLE_CLIENT_SECRET: 'test-google-secret',
    GITHUB_CLIENT_ID: 'test-github-client',
    GITHUB_CLIENT_SECRET: 'test-github-secret',
    MICROSOFT_CLIENT_ID: 'test-microsoft-client',
    MICROSOFT_CLIENT_SECRET: 'test-microsoft-secret',
  },
  { mailer: { async send() {} } },
);
const plan = await getMigrations(options);
const sql = await plan.compileMigrations();
mkdirSync('migrations', { recursive: true });
writeFileSync('migrations/0001_better_auth.sql', `${sql}\n`);
console.log(sql);

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TestD1 } from './sqlite-d1';

export async function applyMigrations(db: TestD1): Promise<void> {
  const directory = resolve('migrations');
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(resolve(directory, file), 'utf8'));
  }
}

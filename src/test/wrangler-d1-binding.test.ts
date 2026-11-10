import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// ORD-108. Pages preview deployments do not read preview_database_id.
// `wrangler pages deploy` loads env.production or env.preview, and
// getBindings() sends database_id with usePreviewIds false. d1_databases
// is non-inheritable, so a preview block that omits it does not receive
// the top-level database. This file only reads wrangler.jsonc.
//
// JSONC comments are stripped before JSON.parse. The file is not imported:
// Wrangler's loader is not what this guard is checking.

const PRODUCTION_ID = 'ebdb1667-044a-430b-8412-c8b03da1f229';
const PREVIEW_ID = 'ba9a4066-b4e4-4058-885d-a20fae74d05d';

const wranglerPath = resolve(__dirname, '../../wrangler.jsonc');
const source = readFileSync(wranglerPath, 'utf-8');

type D1Binding = {
  binding?: string;
  database_name?: string;
  database_id?: string;
  preview_database_id?: string;
  migrations_dir?: string;
};

type EnvBlock = {
  d1_databases?: D1Binding[];
};

type WranglerConfig = {
  d1_databases?: D1Binding[];
  env?: {
    production?: EnvBlock;
    preview?: EnvBlock;
  };
};

function stripJsonc(text: string): string {
  let out = '';
  let i = 0;
  let inString = false;
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === '"') inString = false;
      i += 1;
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out.replace(/,(\s*[}\]])/g, '$1');
}

function parseWrangler(text: string): WranglerConfig {
  return JSON.parse(stripJsonc(text)) as WranglerConfig;
}

function dbBinding(databases: D1Binding[] | undefined, label: string): D1Binding {
  const matches = (databases ?? []).filter((entry) => entry.binding === 'DB');
  expect(matches, `${label} must bind DB once`).toHaveLength(1);
  return matches[0] as D1Binding;
}

describe('wrangler.jsonc D1 bindings (ORD-108)', () => {
  const config = parseWrangler(source);

  it('binds production DB to ordboj-auth', () => {
    const production = dbBinding(config.env?.production?.d1_databases, 'env.production');
    expect(production.database_name).toBe('ordboj-auth');
    expect(production.database_id).toBe(PRODUCTION_ID);
    expect(production.migrations_dir).toBe('migrations');
    expect(production.preview_database_id).toBeUndefined();
    expect(JSON.stringify(config.env?.production)).not.toContain(PREVIEW_ID);
  });

  it('binds preview DB to ordboj-auth-preview and never the production id', () => {
    const previewBlock = config.env?.preview;
    expect(previewBlock, 'env.preview is required').toBeDefined();
    const preview = dbBinding(previewBlock?.d1_databases, 'env.preview');
    expect(preview.database_name).toBe('ordboj-auth-preview');
    expect(preview.database_id).toBe(PREVIEW_ID);
    expect(preview.migrations_dir).toBe('migrations');
    expect(JSON.stringify(previewBlock)).not.toContain(PRODUCTION_ID);
  });

  it('keeps the top-level DB binding on the production database', () => {
    const top = dbBinding(config.d1_databases, 'top-level');
    expect(top.database_name).toBe('ordboj-auth');
    expect(top.database_id).toBe(PRODUCTION_ID);
    expect(top.migrations_dir).toBe('migrations');
    expect(top.preview_database_id).toBeUndefined();
  });
});

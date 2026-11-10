import { DatabaseSync } from 'node:sqlite';

type Row = Record<string, unknown>;

interface D1ResultLike<T = Row> {
  success: true;
  results: T[];
  meta: {
    changes: number;
    last_row_id: number;
    duration: number;
    size_after: number;
    rows_read: number;
    rows_written: number;
  };
}

class SqliteStatement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly params: unknown[] = [],
  ) {}

  bind(...params: unknown[]): SqliteStatement {
    return new SqliteStatement(this.database, this.sql, params);
  }

  async all<T = Row>(): Promise<D1ResultLike<T>> {
    const statement = this.database.prepare(this.sql);
    const args = this.params as never[];
    const query =
      /^(select|pragma|with)\b/i.test(this.sql.trim()) || /\breturning\b/i.test(this.sql);
    if (query) {
      const rows = (statement.all(...args) as Row[]).map((row) => ({ ...row }));
      return {
        success: true,
        results: rows as T[],
        meta: {
          changes: rows.length,
          last_row_id: 0,
          duration: 0,
          size_after: 0,
          rows_read: rows.length,
          rows_written: /\breturning\b/i.test(this.sql) ? rows.length : 0,
        },
      };
    }
    const info = statement.run(...args);
    return {
      success: true,
      results: [],
      meta: {
        changes: Number(info.changes),
        last_row_id: Number(info.lastInsertRowid),
        duration: 0,
        size_after: 0,
        rows_read: 0,
        rows_written: Number(info.changes),
      },
    };
  }

  async first<T = Row>(column?: string): Promise<T | null> {
    const result = await this.all<Row>();
    const row = result.results[0];
    if (!row) return null;
    if (column) return (row[column] as T) ?? null;
    return row as T;
  }

  async run(): Promise<D1ResultLike> {
    return this.all();
  }
}

export class SqliteD1 {
  private readonly database = new DatabaseSync(':memory:');

  constructor() {
    this.database.exec('PRAGMA foreign_keys = ON');
  }

  prepare(sql: string): SqliteStatement {
    return new SqliteStatement(this.database, sql);
  }

  async batch<T = Row>(statements: SqliteStatement[]): Promise<D1ResultLike<T>[]> {
    this.database.exec('BEGIN');
    try {
      const results: D1ResultLike<T>[] = [];
      for (const statement of statements) results.push(await statement.all<T>());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }

  async exec(sql: string): Promise<{ count: number; duration: number }> {
    this.database.exec(sql);
    return { count: 0, duration: 0 };
  }
}

export type TestD1 = D1Database;

export function createSqliteD1(): TestD1 {
  return new SqliteD1() as unknown as TestD1;
}

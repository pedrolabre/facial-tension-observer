import { DatabaseSync } from 'node:sqlite';
import { PRAGMA_FOREIGN_KEYS, SCHEMA_MIGRATIONS } from './schema';

export type DatabaseParam = null | number | bigint | string | Uint8Array | boolean | undefined;

type SQLiteBindingValue = null | number | bigint | string | Uint8Array;

export interface DatabaseRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number | bigint;
}

export interface DatabaseClient {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly unknown[]): Promise<DatabaseRunResult>;
  get<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | undefined>;
  all<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  transaction<T>(action: (client: DatabaseClient) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export interface DatabaseClientOptions {
  readonly filename?: string;
  readonly enableForeignKeyConstraints?: boolean;
}

function sanitizeParameters(params?: readonly unknown[]): SQLiteBindingValue[] {
  if (!params) {
    return [];
  }
  return params.map((param): SQLiteBindingValue => {
    if (param === undefined || param === null) {
      return null;
    }
    if (typeof param === 'boolean') {
      return param ? 1 : 0;
    }
    if (
      typeof param === 'number' ||
      typeof param === 'string' ||
      typeof param === 'bigint' ||
      param instanceof Uint8Array
    ) {
      return param;
    }
    return String(param);
  });
}

export class NodeSQLiteClient implements DatabaseClient {
  private readonly db: DatabaseSync;
  private inTransaction: boolean = false;

  constructor(options?: DatabaseClientOptions) {
    const filename = options?.filename ?? ':memory:';
    this.db = new DatabaseSync(filename, {
      open: true,
      enableForeignKeyConstraints: options?.enableForeignKeyConstraints ?? true,
    });
    this.db.exec(PRAGMA_FOREIGN_KEYS);
  }

  public async exec(sql: string): Promise<void> {
    this.db.exec(sql);
  }

  public async run(sql: string, params?: readonly unknown[]): Promise<DatabaseRunResult> {
    const sanitized = sanitizeParameters(params);
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...sanitized);
    return {
      changes: Number(result.changes),
      lastInsertRowId: result.lastInsertRowid,
    };
  }

  public async get<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | undefined> {
    const sanitized = sanitizeParameters(params);
    const stmt = this.db.prepare(sql);
    const row = stmt.get(...sanitized);
    if (row === undefined || row === null) {
      return undefined;
    }
    return row as T;
  }

  public async all<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    const sanitized = sanitizeParameters(params);
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...sanitized);
    return rows as T[];
  }

  public async transaction<T>(action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return action(this);
    }
    this.inTransaction = true;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = await action(this);
      this.db.exec('COMMIT');
      this.inTransaction = false;
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      this.inTransaction = false;
      throw error;
    }
  }

  public async close(): Promise<void> {
    this.db.close();
  }
}

export function createDatabaseClient(options?: DatabaseClientOptions): DatabaseClient {
  return new NodeSQLiteClient(options);
}

export async function initDatabase(client?: DatabaseClient): Promise<DatabaseClient> {
  const dbClient = client ?? createDatabaseClient();
  await dbClient.exec(PRAGMA_FOREIGN_KEYS);
  for (const migration of SCHEMA_MIGRATIONS) {
    await dbClient.exec(migration);
  }
  return dbClient;
}

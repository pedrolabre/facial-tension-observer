import {
  initDatabase,
  createDatabaseClient,
  DatabaseClient,
} from '../../src/services/db/client';
import {
  PRAGMA_FOREIGN_KEYS,
  CREATE_TABLE_SESSIONS,
  CREATE_TABLE_TENSION_CAPTURES,
  CREATE_TABLE_QUOTE_LIBRARY,
  CREATE_INDEX_SESSIONS_STARTED_AT,
  CREATE_INDEX_CAPTURES_SESSION,
  CREATE_INDEX_CAPTURES_DECISION,
  CREATE_INDEX_CAPTURES_IS_REVEALED,
  SCHEMA_MIGRATIONS,
  DEFAULT_QUOTES,
  SessionRecord,
  TensionCaptureRecord,
} from '../../src/services/db/schema';

describe('SQLite Database Layer', () => {
  let client: DatabaseClient;

  beforeEach(async () => {
    client = await initDatabase(createDatabaseClient({ filename: ':memory:' }));
  });

  afterEach(async () => {
    await client.close();
  });

  describe('Schema and Migrations', () => {
    it('exports all expected DDL queries and migration arrays', () => {
      expect(PRAGMA_FOREIGN_KEYS).toBe('PRAGMA foreign_keys = ON;');
      expect(CREATE_TABLE_SESSIONS).toContain('CREATE TABLE IF NOT EXISTS sessions');
      expect(CREATE_TABLE_TENSION_CAPTURES).toContain('CREATE TABLE IF NOT EXISTS tension_captures');
      expect(CREATE_TABLE_QUOTE_LIBRARY).toContain('CREATE TABLE IF NOT EXISTS quote_library');
      expect(CREATE_INDEX_SESSIONS_STARTED_AT).toContain('idx_sessions_started_at');
      expect(CREATE_INDEX_CAPTURES_SESSION).toContain('idx_captures_session');
      expect(CREATE_INDEX_CAPTURES_DECISION).toContain('idx_captures_decision');
      expect(CREATE_INDEX_CAPTURES_IS_REVEALED).toContain('idx_captures_is_revealed');
      expect(SCHEMA_MIGRATIONS.length).toBe(7);
      expect(DEFAULT_QUOTES.length).toBe(7);
    });

    it('creates all tables and indexes upon initialization', async () => {
      interface MasterRow {
        readonly type: string;
        readonly name: string;
      }

      const tables = await client.all<MasterRow>(
        "SELECT type, name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
      );
      const tableNames = tables.map((t) => t.name);

      expect(tableNames).toContain('quote_library');
      expect(tableNames).toContain('sessions');
      expect(tableNames).toContain('tension_captures');

      const indexes = await client.all<MasterRow>(
        "SELECT type, name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
      );
      const indexNames = indexes.map((idx) => idx.name);

      expect(indexNames).toContain('idx_captures_decision');
      expect(indexNames).toContain('idx_captures_is_revealed');
      expect(indexNames).toContain('idx_captures_session');
      expect(indexNames).toContain('idx_sessions_started_at');
    });

    it('ensures repeated initialization is strictly idempotent', async () => {
      await expect(initDatabase(client)).resolves.toBe(client);
      await expect(initDatabase(client)).resolves.toBe(client);

      const tables = await client.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
      );
      expect(tables.length).toBe(3);
    });

    it('initializes default client when called with no arguments', async () => {
      const defaultClient = await initDatabase();
      const tables = await defaultClient.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
      );
      expect(tables.length).toBe(3);
      await defaultClient.close();
    });
  });

  describe('CRUD Operations and Parameterized Queries', () => {
    it('inserts and retrieves a session record', async () => {
      const sessionId = 'session-uuid-1';
      const runResult = await client.run(
        'INSERT INTO sessions (id, duration_seconds, triggers_count, kept_count, deleted_blind_count) VALUES (?, ?, ?, ?, ?);',
        [sessionId, 120, 3, 2, 1]
      );

      expect(runResult.changes).toBe(1);

      const session = await client.get<SessionRecord>(
        'SELECT * FROM sessions WHERE id = ?;',
        [sessionId]
      );

      expect(session).toBeDefined();
      expect(session?.id).toBe(sessionId);
      expect(session?.duration_seconds).toBe(120);
      expect(session?.triggers_count).toBe(3);
      expect(session?.kept_count).toBe(2);
      expect(session?.deleted_blind_count).toBe(1);
      expect(session?.started_at).toBeDefined();
      expect(session?.ended_at).toBeNull();
    });

    it('inserts and retrieves a tension capture record with optional fields', async () => {
      const sessionId = 'session-uuid-2';
      await client.run('INSERT INTO sessions (id) VALUES (?);', [sessionId]);

      const captureId = 'capture-uuid-1';
      await client.run(
        `INSERT INTO tension_captures (
          id, session_id, tension_score, brow_furrow_score, lip_compression_score, jaw_rigidity_score,
          held_duration_seconds, file_path, user_decision, is_revealed, revealed_at, applied_quote
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          captureId,
          sessionId,
          0.88,
          0.92,
          0.85,
          0.80,
          3.2,
          'vault/capture-1.jpg',
          'kept',
          0,
          undefined,
          'Registramos um momento delicado.',
        ]
      );

      const capture = await client.get<TensionCaptureRecord>(
        'SELECT * FROM tension_captures WHERE id = ?;',
        [captureId]
      );

      expect(capture).toBeDefined();
      expect(capture?.id).toBe(captureId);
      expect(capture?.session_id).toBe(sessionId);
      expect(capture?.tension_score).toBe(0.88);
      expect(capture?.brow_furrow_score).toBe(0.92);
      expect(capture?.lip_compression_score).toBe(0.85);
      expect(capture?.jaw_rigidity_score).toBe(0.80);
      expect(capture?.held_duration_seconds).toBe(3.2);
      expect(capture?.file_path).toBe('vault/capture-1.jpg');
      expect(capture?.user_decision).toBe('kept');
      expect(capture?.is_revealed).toBe(0);
      expect(capture?.revealed_at).toBeNull();
      expect(capture?.applied_quote).toBe('Registramos um momento delicado.');
    });

    it('returns undefined when querying a non-existent record', async () => {
      const result = await client.get('SELECT * FROM sessions WHERE id = ?;', ['non-existent']);
      expect(result).toBeUndefined();
    });

    it('returns all matching records with all()', async () => {
      await client.run('INSERT INTO sessions (id) VALUES (?);', ['s-1']);
      await client.run('INSERT INTO sessions (id) VALUES (?);', ['s-2']);
      await client.run('INSERT INTO sessions (id) VALUES (?);', ['s-3']);

      const sessions = await client.all<SessionRecord>('SELECT * FROM sessions ORDER BY id ASC;');
      expect(sessions.length).toBe(3);
      expect(sessions.map((s) => s.id)).toEqual(['s-1', 's-2', 's-3']);
    });

    it('safely handles malicious inputs through parameterized binding', async () => {
      const injectionAttempt = "'; DROP TABLE sessions; --";
      await client.run('INSERT INTO sessions (id) VALUES (?);', [injectionAttempt]);

      const retrieved = await client.get<SessionRecord>(
        'SELECT * FROM sessions WHERE id = ?;',
        [injectionAttempt]
      );
      expect(retrieved?.id).toBe(injectionAttempt);

      const tables = await client.all(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions';"
      );
      expect(tables.length).toBe(1);
    });

    it('sanitizes boolean parameters to SQLite integer representation', async () => {
      const sessionId = 'session-bool';
      await client.run('INSERT INTO sessions (id) VALUES (?);', [sessionId]);

      await client.run(
        `INSERT INTO tension_captures (
          id, session_id, tension_score, held_duration_seconds, user_decision, is_revealed
        ) VALUES (?, ?, ?, ?, ?, ?);`,
        ['cap-bool-true', sessionId, 0.8, 3.0, 'kept', true]
      );

      await client.run(
        `INSERT INTO tension_captures (
          id, session_id, tension_score, held_duration_seconds, user_decision, is_revealed
        ) VALUES (?, ?, ?, ?, ?, ?);`,
        ['cap-bool-false', sessionId, 0.8, 3.0, 'kept', false]
      );

      const capTrue = await client.get<TensionCaptureRecord>(
        'SELECT * FROM tension_captures WHERE id = ?;',
        ['cap-bool-true']
      );
      const capFalse = await client.get<TensionCaptureRecord>(
        'SELECT * FROM tension_captures WHERE id = ?;',
        ['cap-bool-false']
      );

      expect(capTrue?.is_revealed).toBe(1);
      expect(capFalse?.is_revealed).toBe(0);
    });
  });

  describe('Transactional Execution', () => {
    it('commits all operations within a successful transaction', async () => {
      await client.transaction(async (tx) => {
        await tx.run('INSERT INTO sessions (id) VALUES (?);', ['tx-session-1']);
        await tx.run('INSERT INTO sessions (id) VALUES (?);', ['tx-session-2']);
      });

      const sessions = await client.all<SessionRecord>(
        "SELECT * FROM sessions WHERE id LIKE 'tx-session-%';"
      );
      expect(sessions.length).toBe(2);
    });

    it('rolls back all operations when a transaction throws', async () => {
      await expect(
        client.transaction(async (tx) => {
          await tx.run('INSERT INTO sessions (id) VALUES (?);', ['rollback-1']);
          await tx.run('INSERT INTO sessions (id) VALUES (?);', ['rollback-2']);
          throw new Error('Transaction failure simulation');
        })
      ).rejects.toThrow('Transaction failure simulation');

      const sessions = await client.all<SessionRecord>(
        "SELECT * FROM sessions WHERE id LIKE 'rollback-%';"
      );
      expect(sessions.length).toBe(0);
    });

    it('transparently executes nested transaction calls', async () => {
      const result = await client.transaction(async (tx) => {
        await tx.run('INSERT INTO sessions (id) VALUES (?);', ['nested-parent']);
        return tx.transaction(async (innerTx) => {
          await innerTx.run('INSERT INTO sessions (id) VALUES (?);', ['nested-child']);
          return 'nested-success';
        });
      });

      expect(result).toBe('nested-success');

      const sessions = await client.all<SessionRecord>(
        "SELECT * FROM sessions WHERE id LIKE 'nested-%';"
      );
      expect(sessions.length).toBe(2);
    });
  });

  describe('Referential Integrity (FOREIGN KEY)', () => {
    it('rejects insertion into tension_captures when session_id does not exist', async () => {
      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['orphan-cap', 'nonexistent-session', 0.8, 3.0, 'kept']
        )
      ).rejects.toThrow(/FOREIGN KEY/i);
    });

    it('cascades deletion to tension_captures when session is deleted', async () => {
      const sessionId = 'parent-session';
      await client.run('INSERT INTO sessions (id) VALUES (?);', [sessionId]);

      await client.run(
        `INSERT INTO tension_captures (
          id, session_id, tension_score, held_duration_seconds, user_decision
        ) VALUES (?, ?, ?, ?, ?);`,
        ['child-cap-1', sessionId, 0.8, 3.0, 'kept']
      );
      await client.run(
        `INSERT INTO tension_captures (
          id, session_id, tension_score, held_duration_seconds, user_decision
        ) VALUES (?, ?, ?, ?, ?);`,
        ['child-cap-2', sessionId, 0.85, 3.2, 'deleted_blind']
      );

      const capturesBefore = await client.all(
        'SELECT * FROM tension_captures WHERE session_id = ?;',
        [sessionId]
      );
      expect(capturesBefore.length).toBe(2);

      await client.run('DELETE FROM sessions WHERE id = ?;', [sessionId]);

      const capturesAfter = await client.all(
        'SELECT * FROM tension_captures WHERE session_id = ?;',
        [sessionId]
      );
      expect(capturesAfter.length).toBe(0);
    });
  });

  describe('Domain Constraints (CHECK Constraints)', () => {
    const validSessionId = 'check-session';

    beforeEach(async () => {
      await client.run('INSERT INTO sessions (id) VALUES (?);', [validSessionId]);
    });

    it('enforces tension_score limits between 0.0 and 1.0', async () => {
      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['score-low', validSessionId, -0.01, 3.0, 'kept']
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['score-high', validSessionId, 1.01, 3.0, 'kept']
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['score-min', validSessionId, 0.0, 3.0, 'kept']
        )
      ).resolves.toBeDefined();

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['score-max', validSessionId, 1.0, 3.0, 'kept']
        )
      ).resolves.toBeDefined();
    });

    it('enforces user_decision restriction to kept or deleted_blind', async () => {
      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['dec-pending', validSessionId, 0.8, 3.0, 'pending']
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['dec-discarded', validSessionId, 0.8, 3.0, 'discarded']
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['dec-kept', validSessionId, 0.8, 3.0, 'kept']
        )
      ).resolves.toBeDefined();

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision
          ) VALUES (?, ?, ?, ?, ?);`,
          ['dec-deleted', validSessionId, 0.8, 3.0, 'deleted_blind']
        )
      ).resolves.toBeDefined();
    });

    it('enforces is_revealed restriction to 0 or 1', async () => {
      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision, is_revealed
          ) VALUES (?, ?, ?, ?, ?, ?);`,
          ['rev-invalid-2', validSessionId, 0.8, 3.0, 'kept', 2]
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          `INSERT INTO tension_captures (
            id, session_id, tension_score, held_duration_seconds, user_decision, is_revealed
          ) VALUES (?, ?, ?, ?, ?, ?);`,
          ['rev-invalid-neg', validSessionId, 0.8, 3.0, 'kept', -1]
        )
      ).rejects.toThrow(/CHECK/i);
    });

    it('enforces tone_category restriction on quote_library', async () => {
      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase invalida', 'humorous']
        )
      ).rejects.toThrow(/CHECK/i);

      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase dry', 'dry']
        )
      ).resolves.toBeDefined();

      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase formal', 'formal']
        )
      ).resolves.toBeDefined();

      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase shock', 'shock']
        )
      ).resolves.toBeDefined();

      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase ironic', 'ironic']
        )
      ).resolves.toBeDefined();
    });

    it('enforces UNIQUE constraint on quote_library quote_text', async () => {
      await client.run(
        'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
        ['Frase repetida', 'dry']
      );

      await expect(
        client.run(
          'INSERT INTO quote_library (quote_text, tone_category) VALUES (?, ?);',
          ['Frase repetida', 'ironic']
        )
      ).rejects.toThrow(/UNIQUE/i);
    });
  });
});

import { randomUUID } from 'node:crypto';
import { DatabaseClient } from './client';
import { SessionRecord } from './schema';
import { MonitoringSession, SessionStatus } from '../../core/types';

export interface GlobalStats {
  readonly totalSessions: number;
  readonly totalDurationSeconds: number;
  readonly totalTriggers: number;
  readonly totalKept: number;
  readonly totalDeletedBlind: number;
}

export interface ISessionRepository {
  createSession(id?: string): Promise<MonitoringSession>;
  incrementTriggerCount(id: string): Promise<void>;
  incrementKeptCount(id: string): Promise<void>;
  incrementDeletedCount(id: string): Promise<void>;
  endSession(id: string, durationSeconds: number): Promise<void>;
  getSessionById(id: string): Promise<MonitoringSession | null>;
  getGlobalStats(): Promise<GlobalStats>;
  getSessionStats(): Promise<GlobalStats>;
}

function parseSqliteDate(val: string | null | undefined): number | null {
  if (!val) {
    return null;
  }
  const iso = val.includes('T') ? val : `${val.replace(' ', 'T')}Z`;
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

function mapSessionRecord(record: SessionRecord): MonitoringSession {
  const startedAt = parseSqliteDate(record.started_at) ?? Date.now();
  const endedAt = parseSqliteDate(record.ended_at);
  const status: SessionStatus = record.ended_at ? 'idle' : 'monitoring';

  return {
    id: record.id,
    startedAt,
    endedAt,
    durationSeconds: Number(record.duration_seconds),
    triggersCount: Number(record.triggers_count),
    keptCount: Number(record.kept_count),
    deletedCount: Number(record.deleted_blind_count),
    status,
  };
}

export class SessionRepository implements ISessionRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async createSession(id?: string): Promise<MonitoringSession> {
    const sessionId = id ?? randomUUID();
    await this.client.run(
      'INSERT INTO sessions (id, duration_seconds, triggers_count, kept_count, deleted_blind_count) VALUES (?, 0, 0, 0, 0);',
      [sessionId]
    );
    const session = await this.getSessionById(sessionId);
    if (!session) {
      throw new Error(`Failed to retrieve newly created session: ${sessionId}`);
    }
    return session;
  }

  public async incrementTriggerCount(id: string): Promise<void> {
    const result = await this.client.run(
      'UPDATE sessions SET triggers_count = triggers_count + 1 WHERE id = ?;',
      [id]
    );
    if (result.changes === 0) {
      throw new Error(`Session not found: ${id}`);
    }
  }

  public async incrementKeptCount(id: string): Promise<void> {
    const result = await this.client.run(
      'UPDATE sessions SET kept_count = kept_count + 1 WHERE id = ?;',
      [id]
    );
    if (result.changes === 0) {
      throw new Error(`Session not found: ${id}`);
    }
  }

  public async incrementDeletedCount(id: string): Promise<void> {
    const result = await this.client.run(
      'UPDATE sessions SET deleted_blind_count = deleted_blind_count + 1 WHERE id = ?;',
      [id]
    );
    if (result.changes === 0) {
      throw new Error(`Session not found: ${id}`);
    }
  }

  public async endSession(id: string, durationSeconds: number): Promise<void> {
    const result = await this.client.run(
      'UPDATE sessions SET ended_at = CURRENT_TIMESTAMP, duration_seconds = ? WHERE id = ?;',
      [Math.max(0, Math.round(durationSeconds)), id]
    );
    if (result.changes === 0) {
      throw new Error(`Session not found: ${id}`);
    }
  }

  public async getSessionById(id: string): Promise<MonitoringSession | null> {
    const record = await this.client.get<SessionRecord>(
      'SELECT id, started_at, ended_at, duration_seconds, triggers_count, kept_count, deleted_blind_count FROM sessions WHERE id = ?;',
      [id]
    );
    if (!record) {
      return null;
    }
    return mapSessionRecord(record);
  }

  public async getGlobalStats(): Promise<GlobalStats> {
    interface StatsRow {
      total_sessions: number;
      total_duration_seconds: number;
      total_triggers: number;
      total_kept: number;
      total_deleted_blind: number;
    }
    const row = await this.client.get<StatsRow>(
      `SELECT
        COUNT(*) AS total_sessions,
        COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
        COALESCE(SUM(triggers_count), 0) AS total_triggers,
        COALESCE(SUM(kept_count), 0) AS total_kept,
        COALESCE(SUM(deleted_blind_count), 0) AS total_deleted_blind
      FROM sessions;`
    );
    return {
      totalSessions: Number(row?.total_sessions ?? 0),
      totalDurationSeconds: Number(row?.total_duration_seconds ?? 0),
      totalTriggers: Number(row?.total_triggers ?? 0),
      totalKept: Number(row?.total_kept ?? 0),
      totalDeletedBlind: Number(row?.total_deleted_blind ?? 0),
    };
  }

  public async getSessionStats(): Promise<GlobalStats> {
    return this.getGlobalStats();
  }
}

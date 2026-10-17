export interface SessionRecord {
  readonly id: string;
  readonly started_at: string;
  readonly ended_at: string | null;
  readonly duration_seconds: number;
  readonly triggers_count: number;
  readonly kept_count: number;
  readonly deleted_blind_count: number;
}

export interface TensionCaptureRecord {
  readonly id: string;
  readonly session_id: string;
  readonly created_at: string;
  readonly tension_score: number;
  readonly brow_furrow_score: number;
  readonly lip_compression_score: number;
  readonly jaw_rigidity_score: number;
  readonly held_duration_seconds: number;
  readonly file_path: string | null;
  readonly user_decision: 'kept' | 'deleted_blind';
  readonly is_revealed: 0 | 1;
  readonly revealed_at: string | null;
  readonly applied_quote: string | null;
}

export interface QuoteLibraryRecord {
  readonly id: number;
  readonly quote_text: string;
  readonly tone_category: 'dry' | 'formal' | 'shock' | 'ironic';
}

export interface DefaultQuoteItem {
  readonly quoteText: string;
  readonly toneCategory: 'dry' | 'formal' | 'shock' | 'ironic';
}

export const PRAGMA_FOREIGN_KEYS = 'PRAGMA foreign_keys = ON;';

export const CREATE_TABLE_SESSIONS = `
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at DATETIME,
    duration_seconds INTEGER DEFAULT 0,
    triggers_count INTEGER DEFAULT 0,
    kept_count INTEGER DEFAULT 0,
    deleted_blind_count INTEGER DEFAULT 0
);
`.trim();

export const CREATE_TABLE_TENSION_CAPTURES = `
CREATE TABLE IF NOT EXISTS tension_captures (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    tension_score REAL CHECK(tension_score BETWEEN 0.0 AND 1.0) NOT NULL,
    brow_furrow_score REAL DEFAULT 0.0,
    lip_compression_score REAL DEFAULT 0.0,
    jaw_rigidity_score REAL DEFAULT 0.0,
    held_duration_seconds REAL NOT NULL,
    file_path TEXT,
    user_decision TEXT CHECK(user_decision IN ('kept', 'deleted_blind')) NOT NULL,
    is_revealed INTEGER CHECK(is_revealed IN (0, 1)) DEFAULT 0,
    revealed_at DATETIME,
    applied_quote TEXT,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
`.trim();

export const CREATE_TABLE_QUOTE_LIBRARY = `
CREATE TABLE IF NOT EXISTS quote_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_text TEXT UNIQUE NOT NULL,
    tone_category TEXT CHECK(tone_category IN ('dry', 'formal', 'shock', 'ironic')) DEFAULT 'dry'
);
`.trim();

export const CREATE_INDEX_SESSIONS_STARTED_AT =
  'CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);';

export const CREATE_INDEX_CAPTURES_SESSION =
  'CREATE INDEX IF NOT EXISTS idx_captures_session ON tension_captures(session_id);';

export const CREATE_INDEX_CAPTURES_DECISION =
  'CREATE INDEX IF NOT EXISTS idx_captures_decision ON tension_captures(user_decision);';

export const CREATE_INDEX_CAPTURES_IS_REVEALED =
  'CREATE INDEX IF NOT EXISTS idx_captures_is_revealed ON tension_captures(is_revealed);';

export const SCHEMA_MIGRATIONS: readonly string[] = [
  CREATE_TABLE_SESSIONS,
  CREATE_TABLE_TENSION_CAPTURES,
  CREATE_TABLE_QUOTE_LIBRARY,
  CREATE_INDEX_SESSIONS_STARTED_AT,
  CREATE_INDEX_CAPTURES_SESSION,
  CREATE_INDEX_CAPTURES_DECISION,
  CREATE_INDEX_CAPTURES_IS_REVEALED,
];

export const DEFAULT_QUOTES: readonly DefaultQuoteItem[] = [
  { quoteText: 'Registramos um momento delicado.', toneCategory: 'dry' },
  { quoteText: 'Às vezes a sua cara fala por você.', toneCategory: 'ironic' },
  { quoteText: 'Você jurava que estava calmo.', toneCategory: 'ironic' },
  { quoteText: 'Rigidez facial confirmada por telemetria.', toneCategory: 'formal' },
  { quoteText: 'Ninguém disse nada, mas a expressão disse tudo.', toneCategory: 'dry' },
  { quoteText: 'Tensão acumulada com sucesso.', toneCategory: 'shock' },
  { quoteText: 'A glabela não mente.', toneCategory: 'formal' },
];

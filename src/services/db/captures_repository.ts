import { DatabaseClient } from './client';
import { TensionCaptureRecord } from './schema';

export interface ICapturesRepository {
  markAsRevealed(id: string): Promise<void>;
  deleteCapture(id: string): Promise<void>;
  getCaptureById(id: string): Promise<TensionCaptureRecord | undefined>;
  listKeptCaptures(): Promise<readonly TensionCaptureRecord[]>;
  saveCapture(capture: TensionCaptureRecord): Promise<void>;
}

const SELECT_CAPTURE_BY_ID_QUERY =
  'SELECT id, session_id, created_at, tension_score, brow_furrow_score, lip_compression_score, jaw_rigidity_score, held_duration_seconds, file_path, user_decision, is_revealed, revealed_at, applied_quote FROM tension_captures WHERE id = ?;';

const SELECT_KEPT_CAPTURES_QUERY =
  "SELECT id, session_id, created_at, tension_score, brow_furrow_score, lip_compression_score, jaw_rigidity_score, held_duration_seconds, file_path, user_decision, is_revealed, revealed_at, applied_quote FROM tension_captures WHERE user_decision = 'kept' ORDER BY created_at DESC;";

const UPDATE_MARK_REVEALED_QUERY =
  'UPDATE tension_captures SET is_revealed = 1, revealed_at = CURRENT_TIMESTAMP WHERE id = ?;';

const DELETE_CAPTURE_QUERY = 'DELETE FROM tension_captures WHERE id = ?;';

const INSERT_CAPTURE_QUERY = `
INSERT INTO tension_captures (
  id, session_id, created_at, tension_score, brow_furrow_score,
  lip_compression_score, jaw_rigidity_score, held_duration_seconds,
  file_path, user_decision, is_revealed, revealed_at, applied_quote
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`.trim();

export class CapturesRepository implements ICapturesRepository {
  constructor(private readonly client: DatabaseClient) {}

  public async markAsRevealed(id: string): Promise<void> {
    const result = await this.client.run(UPDATE_MARK_REVEALED_QUERY, [id]);
    if (result.changes === 0) {
      throw new Error(`Capture not found: ${id}`);
    }
  }

  public async deleteCapture(id: string): Promise<void> {
    const result = await this.client.run(DELETE_CAPTURE_QUERY, [id]);
    if (result.changes === 0) {
      throw new Error(`Capture not found: ${id}`);
    }
  }

  public async getCaptureById(id: string): Promise<TensionCaptureRecord | undefined> {
    return this.client.get<TensionCaptureRecord>(SELECT_CAPTURE_BY_ID_QUERY, [id]);
  }

  public async listKeptCaptures(): Promise<readonly TensionCaptureRecord[]> {
    return this.client.all<TensionCaptureRecord>(SELECT_KEPT_CAPTURES_QUERY);
  }

  public async saveCapture(capture: TensionCaptureRecord): Promise<void> {
    await this.client.run(INSERT_CAPTURE_QUERY, [
      capture.id,
      capture.session_id,
      capture.created_at,
      capture.tension_score,
      capture.brow_furrow_score,
      capture.lip_compression_score,
      capture.jaw_rigidity_score,
      capture.held_duration_seconds,
      capture.file_path,
      capture.user_decision,
      capture.is_revealed,
      capture.revealed_at,
      capture.applied_quote,
    ]);
  }
}

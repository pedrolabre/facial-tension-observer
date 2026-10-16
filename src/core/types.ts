export interface Point3D {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export type FaceMesh = readonly Point3D[];

export interface TensionComponents {
  readonly browFurrowScore: number;
  readonly lipCompressionScore: number;
  readonly jawRigidityScore: number;
  readonly smileProbability: number;
}

export interface InstantTensionResult {
  readonly instantScore: number;
  readonly components: TensionComponents;
  readonly isSmileSuppressed: boolean;
}

export interface TrackerSample {
  readonly timestampMs: number;
  readonly score: number;
}

export interface TrackerEvaluation {
  readonly isTriggered: boolean;
  readonly currentMeanScore: number;
  readonly currentStdDev: number;
  readonly heldDurationSeconds: number;
  readonly activeCooldownMsRemaining: number;
}

export type SessionStatus = 'idle' | 'monitoring' | 'trigger_cooldown' | 'blind_modal';

export interface MonitoringSession {
  readonly id: string;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly durationSeconds: number;
  readonly triggersCount: number;
  readonly keptCount: number;
  readonly deletedCount: number;
  readonly status: SessionStatus;
}

export type CaptureDecision = 'pending' | 'kept' | 'deleted_blind';

export interface TensionCapture {
  readonly id: string;
  readonly sessionId: string;
  readonly createdAt: number;
  readonly tensionScore: number;
  readonly heldDurationSeconds: number;
  readonly filePath: string;
  readonly decision: CaptureDecision;
  readonly isRevealed: boolean;
  readonly quoteText: string | null;
}

export type ToneCategory = 'dry' | 'ironic' | 'absurd';

export interface QuoteItem {
  readonly id: string;
  readonly quoteText: string;
  readonly toneCategory: ToneCategory;
}

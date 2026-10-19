import { randomUUID } from 'node:crypto';
import { TensionComponents, MonitoringSession, TrackerEvaluation } from '../../core/types';
import { TensionTracker } from '../../core/tracker';
import { VisionService, ProcessedVisionFrame } from '../camera/vision_service';
import { VaultStorageService } from '../storage/vault_storage';
import { ISessionRepository } from '../db/session_repository';
import { DatabaseClient } from '../db/client';
import { IQuoteRepository } from '../db/quote_repository';

export type SessionState = 'IDLE' | 'STARTING' | 'MONITORING' | 'TRIGGERED' | 'AWAITING_DECISION' | 'COOLDOWN' | 'STOPPING';

export interface TensionTriggerEvent {
  readonly sessionId: string;
  readonly tempFilePath: string;
  readonly tensionScore: number;
  readonly heldDurationSeconds: number;
  readonly components: TensionComponents;
  readonly timestampMs: number;
}

export interface DecisionResolvedEvent {
  readonly sessionId: string;
  readonly decision: 'kept' | 'deleted_blind';
  readonly filePath: string | null;
  readonly captureId?: string | undefined;
  readonly quoteText?: string | null | undefined;
}

export interface SessionManagerOptions {
  readonly sessionRepository: ISessionRepository;
  readonly visionService?: VisionService;
  readonly tracker?: TensionTracker;
  readonly vaultStorage?: VaultStorageService;
  readonly dbClient?: DatabaseClient;
  readonly quoteRepository?: IQuoteRepository;
  readonly takePhoto?: () => Promise<Uint8Array>;
  readonly timeProvider?: () => number;
}

type StateChangeListener = (state: SessionState, previousState: SessionState) => void;
type FrameProcessedListener = (frame: ProcessedVisionFrame, evaluation: TrackerEvaluation) => void;
type TriggerListener = (event: TensionTriggerEvent) => void;
type DecisionResolvedListener = (event: DecisionResolvedEvent) => void;
type ErrorListener = (error: Error) => void;

const INSERT_CAPTURE_SQL =
  'INSERT INTO tension_captures (id, session_id, tension_score, brow_furrow_score, lip_compression_score, jaw_rigidity_score, held_duration_seconds, file_path, user_decision, is_revealed, applied_quote) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?);';

export class SessionManager {
  private readonly sessionRepo: ISessionRepository;
  private readonly vision: VisionService;
  private readonly tracker: TensionTracker;
  private readonly storage: VaultStorageService;
  private readonly dbClient: DatabaseClient | undefined;
  private readonly quoteRepo: IQuoteRepository | undefined;
  private readonly photoCapturer: (() => Promise<Uint8Array>) | undefined;
  private readonly getTime: () => number;

  private currentState: SessionState = 'IDLE';
  private currentSessionId: string | null = null;
  private sessionStartedAtMs: number | null = null;
  private pendingTempPath: string | null = null;
  private pendingTriggerEvent: TensionTriggerEvent | null = null;
  private frameUnsubscribe: (() => void) | null = null;

  private readonly listeners = {
    state: new Set<StateChangeListener>(),
    frame: new Set<FrameProcessedListener>(),
    trigger: new Set<TriggerListener>(),
    decision: new Set<DecisionResolvedListener>(),
    error: new Set<ErrorListener>(),
  };

  constructor(options: SessionManagerOptions) {
    this.sessionRepo = options.sessionRepository;
    this.vision = options.visionService ?? new VisionService();
    this.tracker = options.tracker ?? new TensionTracker();
    this.storage = options.vaultStorage ?? new VaultStorageService();
    this.dbClient = options.dbClient;
    this.quoteRepo = options.quoteRepository;
    this.photoCapturer = options.takePhoto;
    this.getTime = options.timeProvider ?? (() => Date.now());
  }

  get state(): SessionState { return this.currentState; }
  get sessionId(): string | null { return this.currentSessionId; }
  get pendingTrigger(): TensionTriggerEvent | null { return this.pendingTriggerEvent; }
  get visionService(): VisionService { return this.vision; }
  get tensionTracker(): TensionTracker { return this.tracker; }
  get vaultStorage(): VaultStorageService { return this.storage; }
  get sessionRepository(): ISessionRepository { return this.sessionRepo; }

  onStateChange(l: StateChangeListener): () => void {
    this.listeners.state.add(l);
    return () => this.listeners.state.delete(l);
  }

  onFrameProcessed(l: FrameProcessedListener): () => void {
    this.listeners.frame.add(l);
    return () => this.listeners.frame.delete(l);
  }

  onTrigger(l: TriggerListener): () => void {
    this.listeners.trigger.add(l);
    return () => this.listeners.trigger.delete(l);
  }

  onDecisionResolved(l: DecisionResolvedListener): () => void {
    this.listeners.decision.add(l);
    return () => this.listeners.decision.delete(l);
  }

  onError(l: ErrorListener): () => void {
    this.listeners.error.add(l);
    return () => this.listeners.error.delete(l);
  }

  private transitionTo(newState: SessionState): void {
    const previous = this.currentState;
    this.currentState = newState;
    for (const listener of this.listeners.state) listener(newState, previous);
  }

  private notifyError(error: Error): void {
    for (const listener of this.listeners.error) listener(error);
  }

  getElapsedDurationSeconds(): number {
    if (this.sessionStartedAtMs === null) return 0;
    return Math.max(0, Math.round((this.getTime() - this.sessionStartedAtMs) / 1000));
  }

  getCooldownRemainingMs(nowMs?: number): number {
    return this.tracker.getActiveCooldownRemaining(nowMs ?? this.getTime());
  }

  async startSession(customSessionId?: string): Promise<string> {
    if (this.currentState !== 'IDLE') {
      throw new Error(`Cannot start session from state: ${this.currentState}`);
    }
    this.transitionTo('STARTING');
    try {
      const session = await this.sessionRepo.createSession(customSessionId);
      this.currentSessionId = session.id;
      this.sessionStartedAtMs = this.getTime();
      this.tracker.reset();
      this.frameUnsubscribe = this.vision.onFrame((frame) => {
        void this.handleFrame(frame);
      });
      await this.vision.start();
      this.transitionTo('MONITORING');
      return session.id;
    } catch (err: unknown) {
      this.transitionTo('IDLE');
      const error = err instanceof Error ? err : new Error(String(err));
      this.notifyError(error);
      throw error;
    }
  }

  async handleFrame(frame: ProcessedVisionFrame): Promise<void> {
    if (this.currentState !== 'MONITORING' && this.currentState !== 'COOLDOWN') return;
    const nowMs = frame.timestampMs;
    if (this.currentState === 'COOLDOWN') {
      if (this.tracker.getActiveCooldownRemaining(nowMs) === 0) {
        this.transitionTo('MONITORING');
      } else {
        return;
      }
    }
    this.tracker.addSample(frame.tensionResult.instantScore, nowMs);
    const evaluation = this.tracker.evaluate(nowMs);
    for (const listener of this.listeners.frame) listener(frame, evaluation);
    if (evaluation.isTriggered) {
      await this.executeTrigger(frame, evaluation);
    }
  }

  private async executeTrigger(frame: ProcessedVisionFrame, evaluation: TrackerEvaluation): Promise<void> {
    this.transitionTo('TRIGGERED');
    try {
      const photoBytes = await this.capturePhotoBytes();
      const tempPath = await this.storage.saveTempCapture(photoBytes);
      this.pendingTempPath = tempPath;
      if (!this.currentSessionId) throw new Error('Active session identifier is missing');
      await this.sessionRepo.incrementTriggerCount(this.currentSessionId);
      const triggerEvent: TensionTriggerEvent = {
        sessionId: this.currentSessionId,
        tempFilePath: tempPath,
        tensionScore: evaluation.currentMeanScore,
        heldDurationSeconds: evaluation.heldDurationSeconds,
        components: frame.tensionResult.components,
        timestampMs: frame.timestampMs,
      };
      this.pendingTriggerEvent = triggerEvent;
      this.transitionTo('AWAITING_DECISION');
      for (const listener of this.listeners.trigger) listener(triggerEvent);
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.notifyError(error);
      this.transitionTo('MONITORING');
    }
  }

  private async capturePhotoBytes(): Promise<Uint8Array> {
    if (this.photoCapturer) return await this.photoCapturer();
    if (this.vision.cameraAdapter.takePhoto) return await this.vision.cameraAdapter.takePhoto();
    return new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
  }

  async resolveDecision(decision: 'kept' | 'deleted_blind'): Promise<void> {
    if (this.currentState !== 'AWAITING_DECISION') {
      throw new Error(`Cannot resolve decision in state: ${this.currentState}`);
    }
    if (!this.pendingTempPath || !this.currentSessionId) {
      throw new Error('No pending capture or session to resolve');
    }
    const tempPath = this.pendingTempPath;
    const triggerData = this.pendingTriggerEvent;
    const sessionId = this.currentSessionId;
    let finalVaultPath: string | null = null;
    let captureId: string | undefined;
    let quoteText: string | null = null;

    try {
      if (decision === 'deleted_blind') {
        await this.storage.deleteTempCaptureImmediately(tempPath);
        await this.sessionRepo.incrementDeletedCount(sessionId);
      } else {
        finalVaultPath = await this.storage.moveToVault(tempPath);
        await this.sessionRepo.incrementKeptCount(sessionId);
      }

      if (this.dbClient && triggerData) {
        captureId = randomUUID();
        if (this.quoteRepo) {
          const q = await this.quoteRepo.getRandomQuote();
          quoteText = q.quoteText;
        }
        await this.dbClient.run(INSERT_CAPTURE_SQL, [
          captureId,
          sessionId,
          triggerData.tensionScore,
          triggerData.components.browFurrowScore,
          triggerData.components.lipCompressionScore,
          triggerData.components.jawRigidityScore,
          triggerData.heldDurationSeconds,
          finalVaultPath,
          decision,
          quoteText,
        ]);
      }

      this.pendingTempPath = null;
      this.pendingTriggerEvent = null;
      const event: DecisionResolvedEvent = {
        sessionId,
        decision,
        filePath: finalVaultPath,
        captureId,
        quoteText,
      };
      for (const listener of this.listeners.decision) listener(event);
      this.transitionTo('COOLDOWN');
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.notifyError(error);
      throw error;
    }
  }

  async stopSession(): Promise<MonitoringSession> {
    if (this.currentState === 'IDLE' || this.currentState === 'STOPPING') {
      throw new Error(`Cannot stop session in state: ${this.currentState}`);
    }
    const sessionId = this.currentSessionId;
    if (!sessionId) throw new Error('No active session identifier found');

    this.transitionTo('STOPPING');
    try {
      if (this.pendingTempPath) {
        try {
          await this.storage.deleteTempCaptureImmediately(this.pendingTempPath);
          await this.sessionRepo.incrementDeletedCount(sessionId);
        } catch {}
        this.pendingTempPath = null;
        this.pendingTriggerEvent = null;
      }
      if (this.frameUnsubscribe) {
        this.frameUnsubscribe();
        this.frameUnsubscribe = null;
      }
      await this.vision.stop();
      this.tracker.reset();
      const durationSeconds = this.getElapsedDurationSeconds();
      await this.sessionRepo.endSession(sessionId, durationSeconds);
      const finalSession = await this.sessionRepo.getSessionById(sessionId);
      if (!finalSession) throw new Error(`Failed to retrieve stopped session: ${sessionId}`);
      this.currentSessionId = null;
      this.sessionStartedAtMs = null;
      this.transitionTo('IDLE');
      return finalSession;
    } catch (err: unknown) {
      this.transitionTo('IDLE');
      const error = err instanceof Error ? err : new Error(String(err));
      this.notifyError(error);
      throw error;
    }
  }

  reset(): void {
    if (this.frameUnsubscribe) {
      this.frameUnsubscribe();
      this.frameUnsubscribe = null;
    }
    this.tracker.reset();
    this.currentState = 'IDLE';
    this.currentSessionId = null;
    this.sessionStartedAtMs = null;
    this.pendingTempPath = null;
    this.pendingTriggerEvent = null;
    this.listeners.state.clear();
    this.listeners.frame.clear();
    this.listeners.trigger.clear();
    this.listeners.decision.clear();
    this.listeners.error.clear();
  }
}

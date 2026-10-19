import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseClient, createDatabaseClient, initDatabase } from '../../src/services/db/client';
import { SessionRepository } from '../../src/services/db/session_repository';
import { QuoteRepository } from '../../src/services/db/quote_repository';
import { VaultStorageService } from '../../src/services/storage/vault_storage';
import { VisionService, SimulatedCameraAdapter, ProcessedVisionFrame } from '../../src/services/camera/vision_service';
import { TensionTracker } from '../../src/core/tracker';
import {
  SessionManager,
  SessionState,
  TensionTriggerEvent,
  DecisionResolvedEvent,
} from '../../src/services/session/session_manager';
import { TensionCaptureRecord } from '../../src/services/db/schema';

describe('SessionManager', () => {
  let tempBaseDir: string;
  let dbClient: DatabaseClient;
  let sessionRepo: SessionRepository;
  let quoteRepo: QuoteRepository;
  let vaultStorage: VaultStorageService;
  let cameraAdapter: SimulatedCameraAdapter;
  let visionService: VisionService;
  let tracker: TensionTracker;
  let mockTimeMs: number;
  let sessionManager: SessionManager;

  const createMockFrame = (timestampMs: number, instantScore = 0.85): ProcessedVisionFrame => ({
    timestampMs,
    mesh: [],
    tensionResult: {
      instantScore,
      components: {
        browFurrowScore: instantScore,
        lipCompressionScore: instantScore,
        jawRigidityScore: instantScore,
        smileProbability: 0.0,
      },
      isSmileSuppressed: false,
    },
  });

  beforeEach(async () => {
    tempBaseDir = path.join(
      os.tmpdir(),
      `session_mgr_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    );
    vaultStorage = new VaultStorageService({ baseDirectory: tempBaseDir });
    await vaultStorage.initStorageDirectories();

    dbClient = createDatabaseClient({ filename: ':memory:' });
    await initDatabase(dbClient);
    sessionRepo = new SessionRepository(dbClient);
    quoteRepo = new QuoteRepository(dbClient);
    await quoteRepo.seedInitialQuotes();

    cameraAdapter = new SimulatedCameraAdapter();
    visionService = new VisionService({ adapter: cameraAdapter });
    tracker = new TensionTracker();

    mockTimeMs = 1_000_000;
    sessionManager = new SessionManager({
      sessionRepository: sessionRepo,
      visionService,
      tracker,
      vaultStorage,
      dbClient,
      quoteRepository: quoteRepo,
      timeProvider: () => mockTimeMs,
    });
  });

  afterEach(async () => {
    sessionManager.reset();
    await dbClient.close();
    try {
      await fs.promises.rm(tempBaseDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  });

  describe('Lifecycle and State Transitions', () => {
    it('starts in IDLE state with no active session', () => {
      expect(sessionManager.state).toBe('IDLE');
      expect(sessionManager.sessionId).toBeNull();
      expect(sessionManager.pendingTrigger).toBeNull();
      expect(sessionManager.getElapsedDurationSeconds()).toBe(0);
      expect(sessionManager.getCooldownRemainingMs(mockTimeMs)).toBe(0);
    });

    it('transitions IDLE -> STARTING -> MONITORING on startSession', async () => {
      const stateHistory: SessionState[] = [];
      sessionManager.onStateChange((state) => {
        stateHistory.push(state);
      });

      const sessionId = await sessionManager.startSession();

      expect(typeof sessionId).toBe('string');
      expect(sessionId.length).toBeGreaterThan(0);
      expect(sessionManager.state).toBe('MONITORING');
      expect(sessionManager.sessionId).toBe(sessionId);
      expect(stateHistory).toEqual(['STARTING', 'MONITORING']);

      const session = await sessionRepo.getSessionById(sessionId);
      expect(session).not.toBeNull();
      expect(session?.status).toBe('monitoring');
    });

    it('accepts custom session identifier on startSession', async () => {
      const customId = 'sess-custom-orch-001';
      const returnedId = await sessionManager.startSession(customId);

      expect(returnedId).toBe(customId);
      expect(sessionManager.sessionId).toBe(customId);

      const retrieved = await sessionRepo.getSessionById(customId);
      expect(retrieved?.id).toBe(customId);
    });

    it('rejects starting a session if already active', async () => {
      await sessionManager.startSession();

      await expect(sessionManager.startSession()).rejects.toThrow(
        'Cannot start session from state: MONITORING'
      );
    });

    it('transitions to IDLE and emits error if session repository fails', async () => {
      jest.spyOn(sessionRepo, 'createSession').mockRejectedValueOnce(new Error('Database unavailable'));

      const failingManager = new SessionManager({
        sessionRepository: sessionRepo,
        visionService,
        tracker,
        vaultStorage,
      });

      const errors: Error[] = [];
      failingManager.onError((err) => errors.push(err));

      await expect(failingManager.startSession()).rejects.toThrow('Database unavailable');
      expect(failingManager.state).toBe('IDLE');
      expect(errors.length).toBe(1);
      expect(errors[0]?.message).toBe('Database unavailable');
    });

    it('transitions MONITORING -> STOPPING -> IDLE on stopSession and returns session summary', async () => {
      const stateHistory: SessionState[] = [];
      sessionManager.onStateChange((state) => {
        stateHistory.push(state);
      });

      const sessionId = await sessionManager.startSession();
      mockTimeMs += 42_000;

      const stopped = await sessionManager.stopSession();

      expect(sessionManager.state).toBe('IDLE');
      expect(sessionManager.sessionId).toBeNull();
      expect(stateHistory).toEqual(['STARTING', 'MONITORING', 'STOPPING', 'IDLE']);
      expect(stopped.id).toBe(sessionId);
      expect(stopped.durationSeconds).toBe(42);
      expect(stopped.status).toBe('idle');
    });

    it('rejects stopSession when no session is active in IDLE', async () => {
      await expect(sessionManager.stopSession()).rejects.toThrow(
        'Cannot stop session in state: IDLE'
      );
    });
  });

  describe('Frame Streaming and Telemetry', () => {
    it('dispatches onFrameProcessed during MONITORING with neutral frames', async () => {
      await sessionManager.startSession();

      const processedFrames: ProcessedVisionFrame[] = [];
      sessionManager.onFrameProcessed((frame) => {
        processedFrames.push(frame);
      });

      const frame1 = createMockFrame(1_000_125, 0.1);
      const frame2 = createMockFrame(1_000_250, 0.15);

      await sessionManager.handleFrame(frame1);
      await sessionManager.handleFrame(frame2);

      expect(processedFrames.length).toBe(2);
      expect(sessionManager.state).toBe('MONITORING');
    });

    it('ignores frames when in IDLE state', async () => {
      const processed: ProcessedVisionFrame[] = [];
      sessionManager.onFrameProcessed((frame) => processed.push(frame));

      await sessionManager.handleFrame(createMockFrame(1_000_125, 0.9));

      expect(processed.length).toBe(0);
      expect(tracker.getSamplesCount()).toBe(0);
    });

    it('calculates elapsed session duration accurately via timeProvider', async () => {
      await sessionManager.startSession();
      expect(sessionManager.getElapsedDurationSeconds()).toBe(0);

      mockTimeMs += 15_600;
      expect(sessionManager.getElapsedDurationSeconds()).toBe(16);

      mockTimeMs += 10_000;
      expect(sessionManager.getElapsedDurationSeconds()).toBe(26);
    });
  });

  describe('Tension Trigger and Silent Background Capture', () => {
    it('triggers silent capture on sustained peak of 24 frames and transitions to AWAITING_DECISION', async () => {
      await sessionManager.startSession();

      const triggers: TensionTriggerEvent[] = [];
      sessionManager.onTrigger((evt) => triggers.push(evt));

      const states: SessionState[] = [];
      sessionManager.onStateChange((st) => states.push(st));

      for (let i = 0; i < 24; i++) {
        const frameTime = mockTimeMs + i * 125;
        await sessionManager.handleFrame(createMockFrame(frameTime, 0.85));
      }

      expect(sessionManager.state).toBe('AWAITING_DECISION');
      expect(states).toContain('TRIGGERED');
      expect(states).toContain('AWAITING_DECISION');
      expect(triggers.length).toBe(1);

      const triggerEvent = triggers[0]!;
      expect(triggerEvent.sessionId).toBe(sessionManager.sessionId);
      expect(triggerEvent.tensionScore).toBeCloseTo(0.85, 2);
      expect(triggerEvent.heldDurationSeconds).toBeGreaterThan(0);
      expect(triggerEvent.tempFilePath).toMatch(/temp_[0-9a-f-]+\.jpg$/);
      expect(fs.existsSync(triggerEvent.tempFilePath)).toBe(true);

      const session = await sessionRepo.getSessionById(sessionManager.sessionId!);
      expect(session?.triggersCount).toBe(1);
    });

    it('uses custom photo capturer when injected in options', async () => {
      const customBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const customManager = new SessionManager({
        sessionRepository: sessionRepo,
        visionService,
        tracker: new TensionTracker(),
        vaultStorage,
        takePhoto: async () => customBytes,
        timeProvider: () => mockTimeMs,
      });

      await customManager.startSession();

      let capturedPath = '';
      customManager.onTrigger((evt) => {
        capturedPath = evt.tempFilePath;
      });

      for (let i = 0; i < 24; i++) {
        await customManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.9));
      }

      expect(customManager.state).toBe('AWAITING_DECISION');
      expect(capturedPath.length).toBeGreaterThan(0);

      const written = await fs.promises.readFile(capturedPath);
      expect(new Uint8Array(written)).toEqual(customBytes);
      customManager.reset();
    });

    it('freezes frame processing during AWAITING_DECISION', async () => {
      await sessionManager.startSession();

      for (let i = 0; i < 24; i++) {
        await sessionManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.85));
      }
      expect(sessionManager.state).toBe('AWAITING_DECISION');

      const extraFrameProcessed = jest.fn();
      sessionManager.onFrameProcessed(extraFrameProcessed);

      await sessionManager.handleFrame(createMockFrame(mockTimeMs + 25 * 125, 0.85));
      await sessionManager.handleFrame(createMockFrame(mockTimeMs + 26 * 125, 0.85));

      expect(extraFrameProcessed).not.toHaveBeenCalled();
    });
  });

  describe('Blind Decision Resolution - deleted_blind', () => {
    beforeEach(async () => {
      await sessionManager.startSession();
      for (let i = 0; i < 24; i++) {
        await sessionManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.85));
      }
    });

    it('immediately destroys temp file and increments deleted count', async () => {
      const pending = sessionManager.pendingTrigger;
      expect(pending).not.toBeNull();
      const tempPath = pending!.tempFilePath;
      expect(fs.existsSync(tempPath)).toBe(true);

      const decisions: DecisionResolvedEvent[] = [];
      sessionManager.onDecisionResolved((evt) => decisions.push(evt));

      await sessionManager.resolveDecision('deleted_blind');

      expect(fs.existsSync(tempPath)).toBe(false);

      expect(sessionManager.state).toBe('COOLDOWN');
      expect(sessionManager.pendingTrigger).toBeNull();
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.decision).toBe('deleted_blind');
      expect(decisions[0]?.filePath).toBeNull();

      const session = await sessionRepo.getSessionById(sessionManager.sessionId!);
      expect(session?.deletedCount).toBe(1);
      expect(session?.keptCount).toBe(0);

      const captureRecords = await dbClient.all<TensionCaptureRecord>(
        'SELECT * FROM tension_captures WHERE session_id = ?;',
        [sessionManager.sessionId!]
      );
      expect(captureRecords.length).toBe(1);
      expect(captureRecords[0]?.user_decision).toBe('deleted_blind');
      expect(captureRecords[0]?.file_path).toBeNull();
    });
  });

  describe('Blind Decision Resolution - kept', () => {
    beforeEach(async () => {
      await sessionManager.startSession();
      for (let i = 0; i < 24; i++) {
        await sessionManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.85));
      }
    });

    it('migrates temp file to vault, increments kept count and records capture', async () => {
      const pending = sessionManager.pendingTrigger;
      expect(pending).not.toBeNull();
      const tempPath = pending!.tempFilePath;
      expect(fs.existsSync(tempPath)).toBe(true);

      const decisions: DecisionResolvedEvent[] = [];
      sessionManager.onDecisionResolved((evt) => decisions.push(evt));

      await sessionManager.resolveDecision('kept');

      expect(fs.existsSync(tempPath)).toBe(false);

      expect(sessionManager.state).toBe('COOLDOWN');
      expect(sessionManager.pendingTrigger).toBeNull();
      expect(decisions.length).toBe(1);
      expect(decisions[0]?.decision).toBe('kept');

      const vaultPath = decisions[0]?.filePath;
      expect(vaultPath).not.toBeNull();
      expect(fs.existsSync(vaultPath!)).toBe(true);
      expect(vaultPath).toContain(path.join('documents', 'vault'));

      const session = await sessionRepo.getSessionById(sessionManager.sessionId!);
      expect(session?.keptCount).toBe(1);
      expect(session?.deletedCount).toBe(0);

      const captureRecords = await dbClient.all<TensionCaptureRecord>(
        'SELECT * FROM tension_captures WHERE session_id = ?;',
        [sessionManager.sessionId!]
      );
      expect(captureRecords.length).toBe(1);
      expect(captureRecords[0]?.user_decision).toBe('kept');
      expect(captureRecords[0]?.file_path).toBe(vaultPath);
      expect(captureRecords[0]?.is_revealed).toBe(0);
      expect(captureRecords[0]?.applied_quote).not.toBeNull();
    });
  });

  describe('Cooldown and Auto-Rearmament', () => {
    beforeEach(async () => {
      await sessionManager.startSession();
      for (let i = 0; i < 24; i++) {
        await sessionManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.85));
      }
      await sessionManager.resolveDecision('deleted_blind');
    });

    it('enters COOLDOWN and blocks triggers while cooldown is active', async () => {
      expect(sessionManager.state).toBe('COOLDOWN');

      const triggerTime = mockTimeMs + 23 * 125;
      const cooldownRemaining = sessionManager.getCooldownRemainingMs(triggerTime + 10_000);
      expect(cooldownRemaining).toBeGreaterThan(0);

      const triggers: TensionTriggerEvent[] = [];
      sessionManager.onTrigger((evt) => triggers.push(evt));

      await sessionManager.handleFrame(createMockFrame(triggerTime + 10_000, 0.95));
      expect(sessionManager.state).toBe('COOLDOWN');
      expect(triggers.length).toBe(0);
    });

    it('automatically transitions from COOLDOWN to MONITORING once 60s cooldown expires', async () => {
      expect(sessionManager.state).toBe('COOLDOWN');
      const triggerTime = mockTimeMs + 23 * 125;
      const afterCooldownTime = triggerTime + 61_000;

      const stateChanges: SessionState[] = [];
      sessionManager.onStateChange((st) => stateChanges.push(st));

      await sessionManager.handleFrame(createMockFrame(afterCooldownTime, 0.2));

      expect(sessionManager.state).toBe('MONITORING');
      expect(stateChanges).toContain('MONITORING');
    });
  });

  describe('Edge Cases and Safety Invariants', () => {
    it('throws error when resolveDecision is invoked outside of AWAITING_DECISION', async () => {
      await sessionManager.startSession();
      expect(sessionManager.state).toBe('MONITORING');

      await expect(sessionManager.resolveDecision('deleted_blind')).rejects.toThrow(
        'Cannot resolve decision in state: MONITORING'
      );
    });

    it('purges volatile temp capture if session is stopped while in AWAITING_DECISION', async () => {
      await sessionManager.startSession();
      for (let i = 0; i < 24; i++) {
        await sessionManager.handleFrame(createMockFrame(mockTimeMs + i * 125, 0.85));
      }
      expect(sessionManager.state).toBe('AWAITING_DECISION');

      const tempPath = sessionManager.pendingTrigger!.tempFilePath;
      expect(fs.existsSync(tempPath)).toBe(true);

      const stopped = await sessionManager.stopSession();
      expect(fs.existsSync(tempPath)).toBe(false);
      expect(sessionManager.state).toBe('IDLE');
      expect(stopped.deletedCount).toBe(1);
    });

    it('allows unsubscribing from event listeners', async () => {
      const stateListener = jest.fn();
      const unsub = sessionManager.onStateChange(stateListener);

      await sessionManager.startSession();
      expect(stateListener).toHaveBeenCalled();

      stateListener.mockClear();
      unsub();

      await sessionManager.stopSession();
      expect(stateListener).not.toHaveBeenCalled();
    });

    it('resets all internal state and listeners on reset()', async () => {
      await sessionManager.startSession();
      sessionManager.reset();

      expect(sessionManager.state).toBe('IDLE');
      expect(sessionManager.sessionId).toBeNull();
      expect(sessionManager.pendingTrigger).toBeNull();
    });

    it('provides access to injected services via getters', () => {
      expect(sessionManager.visionService).toBe(visionService);
      expect(sessionManager.tensionTracker).toBe(tracker);
      expect(sessionManager.vaultStorage).toBe(vaultStorage);
      expect(sessionManager.sessionRepository).toBe(sessionRepo);
    });
  });
});

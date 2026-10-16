import {
  Point3D,
  FaceMesh,
  TensionComponents,
  InstantTensionResult,
  TrackerSample,
  TrackerEvaluation,
  SessionStatus,
  MonitoringSession,
  CaptureDecision,
  TensionCapture,
  ToneCategory,
  QuoteItem
} from '../../src/core/types';

describe('Domain Types and Contracts', () => {
  describe('Point3D and FaceMesh', () => {
    it('creates a valid Point3D coordinate', () => {
      const point: Point3D = {
        x: 0.5,
        y: 0.25,
        z: -0.1
      };

      expect(point.x).toBe(0.5);
      expect(point.y).toBe(0.25);
      expect(point.z).toBe(-0.1);
    });

    it('creates a FaceMesh containing 468 landmarks', () => {
      const landmarks: Point3D[] = Array.from({ length: 468 }, (_, index) => ({
        x: index / 468,
        y: (index * 2) / 468,
        z: 0.0
      }));

      const mesh: FaceMesh = landmarks;

      expect(mesh).toHaveLength(468);
      expect(mesh[0]).toEqual({ x: 0, y: 0, z: 0 });
      expect(mesh[467]?.x).toBeCloseTo(467 / 468);
    });
  });

  describe('TensionComponents and InstantTensionResult', () => {
    it('creates valid TensionComponents', () => {
      const components: TensionComponents = {
        browFurrowScore: 0.85,
        lipCompressionScore: 0.72,
        jawRigidityScore: 0.65,
        smileProbability: 0.02
      };

      expect(components.browFurrowScore).toBe(0.85);
      expect(components.lipCompressionScore).toBe(0.72);
      expect(components.jawRigidityScore).toBe(0.65);
      expect(components.smileProbability).toBe(0.02);
    });

    it('creates an InstantTensionResult with smile suppressed true', () => {
      const components: TensionComponents = {
        browFurrowScore: 0.9,
        lipCompressionScore: 0.8,
        jawRigidityScore: 0.7,
        smileProbability: 0.45
      };

      const result: InstantTensionResult = {
        instantScore: 0.0,
        components,
        isSmileSuppressed: true
      };

      expect(result.instantScore).toBe(0.0);
      expect(result.isSmileSuppressed).toBe(true);
      expect(result.components.smileProbability).toBe(0.45);
    });

    it('creates an InstantTensionResult with active tension', () => {
      const components: TensionComponents = {
        browFurrowScore: 0.8,
        lipCompressionScore: 0.7,
        jawRigidityScore: 0.9,
        smileProbability: 0.01
      };

      const result: InstantTensionResult = {
        instantScore: 0.79,
        components,
        isSmileSuppressed: false
      };

      expect(result.instantScore).toBe(0.79);
      expect(result.isSmileSuppressed).toBe(false);
    });
  });

  describe('TrackerSample and TrackerEvaluation', () => {
    it('creates a TrackerSample with timestamp and score', () => {
      const sample: TrackerSample = {
        timestampMs: 1700000000000,
        score: 0.82
      };

      expect(sample.timestampMs).toBe(1700000000000);
      expect(sample.score).toBe(0.82);
    });

    it('creates a TrackerEvaluation with trigger active', () => {
      const evaluation: TrackerEvaluation = {
        isTriggered: true,
        currentMeanScore: 0.81,
        currentStdDev: 0.04,
        heldDurationSeconds: 3.2,
        activeCooldownMsRemaining: 0
      };

      expect(evaluation.isTriggered).toBe(true);
      expect(evaluation.currentMeanScore).toBe(0.81);
      expect(evaluation.currentStdDev).toBe(0.04);
      expect(evaluation.heldDurationSeconds).toBe(3.2);
      expect(evaluation.activeCooldownMsRemaining).toBe(0);
    });

    it('creates a TrackerEvaluation with active cooldown', () => {
      const evaluation: TrackerEvaluation = {
        isTriggered: false,
        currentMeanScore: 0.25,
        currentStdDev: 0.01,
        heldDurationSeconds: 0.0,
        activeCooldownMsRemaining: 45000
      };

      expect(evaluation.isTriggered).toBe(false);
      expect(evaluation.activeCooldownMsRemaining).toBe(45000);
    });
  });

  describe('MonitoringSession and SessionStatus', () => {
    it('creates an ongoing MonitoringSession', () => {
      const session: MonitoringSession = {
        id: 'sess-1234',
        startedAt: 1700000000000,
        endedAt: null,
        durationSeconds: 120,
        triggersCount: 2,
        keptCount: 1,
        deletedCount: 1,
        status: 'monitoring'
      };

      expect(session.id).toBe('sess-1234');
      expect(session.endedAt).toBeNull();
      expect(session.status).toBe('monitoring');
    });

    it('validates all valid SessionStatus variants', () => {
      const statuses: SessionStatus[] = [
        'idle',
        'monitoring',
        'trigger_cooldown',
        'blind_modal'
      ];

      expect(statuses).toHaveLength(4);
      expect(statuses).toContain('idle');
      expect(statuses).toContain('monitoring');
      expect(statuses).toContain('trigger_cooldown');
      expect(statuses).toContain('blind_modal');
    });
  });

  describe('TensionCapture and CaptureDecision', () => {
    it('creates a TensionCapture with kept decision and quote', () => {
      const capture: TensionCapture = {
        id: 'cap-9876',
        sessionId: 'sess-1234',
        createdAt: 1700000050000,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        filePath: '/vault/cap-9876.jpg',
        decision: 'kept',
        isRevealed: false,
        quoteText: 'Tensão documentada com sucesso.'
      };

      expect(capture.decision).toBe('kept');
      expect(capture.isRevealed).toBe(false);
      expect(capture.quoteText).toBe('Tensão documentada com sucesso.');
    });

    it('validates all CaptureDecision variants', () => {
      const decisions: CaptureDecision[] = ['pending', 'kept', 'deleted_blind'];

      expect(decisions).toHaveLength(3);
      expect(decisions).toContain('pending');
      expect(decisions).toContain('kept');
      expect(decisions).toContain('deleted_blind');
    });
  });

  describe('QuoteItem and ToneCategory', () => {
    it('creates QuoteItem with different tone categories', () => {
      const dryQuote: QuoteItem = {
        id: 'q-1',
        quoteText: 'Rosto neutro não identificado.',
        toneCategory: 'dry'
      };

      const ironicQuote: QuoteItem = {
        id: 'q-2',
        quoteText: 'O mundo não está tão difícil assim.',
        toneCategory: 'ironic'
      };

      const absurdQuote: QuoteItem = {
        id: 'q-3',
        quoteText: 'Sua mandíbula foi promovida a britadeira.',
        toneCategory: 'absurd'
      };

      expect(dryQuote.toneCategory).toBe('dry');
      expect(ironicQuote.toneCategory).toBe('ironic');
      expect(absurdQuote.toneCategory).toBe('absurd');
    });

    it('validates ToneCategory variants', () => {
      const categories: ToneCategory[] = ['dry', 'ironic', 'absurd'];

      expect(categories).toHaveLength(3);
      expect(categories).toContain('dry');
      expect(categories).toContain('ironic');
      expect(categories).toContain('absurd');
    });
  });
});

import {
  TensionTracker,
  BUFFER_CAPACITY,
  TRIGGER_SCORE_THRESHOLD,
  TRIGGER_STD_DEV_THRESHOLD,
  COOLDOWN_DURATION_MS,
  MAX_WINDOW_SPAN_MS,
} from '../../src/core/tracker';

describe('TensionTracker', () => {
  describe('Constants and Initialization', () => {
    it('exports expected domain constants', () => {
      expect(BUFFER_CAPACITY).toBe(24);
      expect(TRIGGER_SCORE_THRESHOLD).toBe(0.75);
      expect(TRIGGER_STD_DEV_THRESHOLD).toBe(0.12);
      expect(COOLDOWN_DURATION_MS).toBe(60000);
      expect(MAX_WINDOW_SPAN_MS).toBe(3500);
    });

    it('initializes with empty buffer and zero cooldown', () => {
      const tracker = new TensionTracker();

      expect(tracker.getSamplesCount()).toBe(0);
      expect(tracker.getActiveCooldownRemaining(1000)).toBe(0);

      const evaluation = tracker.evaluate(1000);
      expect(evaluation.isTriggered).toBe(false);
      expect(evaluation.currentMeanScore).toBe(0.0);
      expect(evaluation.currentStdDev).toBe(0.0);
      expect(evaluation.heldDurationSeconds).toBe(0.0);
      expect(evaluation.activeCooldownMsRemaining).toBe(0);
    });
  });

  describe('Sample Feeding and FIFO Buffer Management', () => {
    it('accumulates samples incrementally up to BUFFER_CAPACITY', () => {
      const tracker = new TensionTracker();

      for (let i = 1; i <= 10; i++) {
        tracker.addSample(0.5, i * 125);
        expect(tracker.getSamplesCount()).toBe(i);
      }
    });

    it('evicts oldest samples when capacity of 24 is exceeded', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.1, i * 100);
      }
      expect(tracker.getSamplesCount()).toBe(BUFFER_CAPACITY);

      tracker.addSample(0.9, BUFFER_CAPACITY * 100);
      expect(tracker.getSamplesCount()).toBe(BUFFER_CAPACITY);

      const evaluation = tracker.evaluate(BUFFER_CAPACITY * 100);
      const expectedMean = (0.1 * 23 + 0.9) / 24;
      expect(evaluation.currentMeanScore).toBeCloseTo(expectedMean, 5);
    });
  });

  describe('Statistical Computations', () => {
    it('computes mean and population standard deviation for identical scores', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < 10; i++) {
        tracker.addSample(0.8, i * 100);
      }

      const evaluation = tracker.evaluate(900);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.8, 5);
      expect(evaluation.currentStdDev).toBeCloseTo(0.0, 5);
      expect(evaluation.heldDurationSeconds).toBeCloseTo(0.9, 5);
    });

    it('computes exact population standard deviation for known distribution', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < 12; i++) {
        tracker.addSample(0.7, i * 100);
      }
      for (let i = 12; i < 24; i++) {
        tracker.addSample(0.9, i * 100);
      }

      const evaluation = tracker.evaluate(2300);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.8, 5);
      expect(evaluation.currentStdDev).toBeCloseTo(0.1, 5);
    });

    it('handles single sample statistics safely', () => {
      const tracker = new TensionTracker();
      tracker.addSample(0.65, 500);

      const evaluation = tracker.evaluate(500);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.65, 5);
      expect(evaluation.currentStdDev).toBeCloseTo(0.0, 5);
      expect(evaluation.heldDurationSeconds).toBeCloseTo(0.0, 5);
    });
  });

  describe('Trigger Prevention and Noise Rejection', () => {
    it('does not trigger when buffer is incomplete even with high tension', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < 23; i++) {
        tracker.addSample(0.95, i * 125);
      }

      const evaluation = tracker.evaluate(22 * 125);
      expect(tracker.getSamplesCount()).toBe(23);
      expect(evaluation.isTriggered).toBe(false);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.95, 5);
    });

    it('does not trigger when mean score is below threshold of 0.75', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.74, i * 125);
      }

      const evaluation = tracker.evaluate((BUFFER_CAPACITY - 1) * 125);
      expect(evaluation.isTriggered).toBe(false);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.74, 5);
    });

    it('rejects spasms and unstable expressions with standard deviation above 0.12', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        const score = i % 2 === 0 ? 1.0 : 0.5;
        tracker.addSample(score, i * 125);
      }

      const evaluation = tracker.evaluate((BUFFER_CAPACITY - 1) * 125);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.75, 5);
      expect(evaluation.currentStdDev).toBeCloseTo(0.25, 5);
      expect(evaluation.isTriggered).toBe(false);
    });

    it('does not trigger on transition of 2s high tension followed by 1s relaxation', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < 16; i++) {
        tracker.addSample(0.85, i * 125);
      }
      for (let i = 16; i < 24; i++) {
        tracker.addSample(0.15, i * 125);
      }

      const evaluation = tracker.evaluate(23 * 125);
      const expectedMean = (16 * 0.85 + 8 * 0.15) / 24;
      expect(evaluation.currentMeanScore).toBeCloseTo(expectedMean, 5);
      expect(evaluation.currentMeanScore).toBeLessThan(TRIGGER_SCORE_THRESHOLD);
      expect(evaluation.isTriggered).toBe(false);
    });

    it('rejects samples where temporal window span exceeds MAX_WINDOW_SPAN_MS', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.85, i * 200);
      }

      const evaluation = tracker.evaluate((BUFFER_CAPACITY - 1) * 200);
      expect(evaluation.heldDurationSeconds).toBeCloseTo(4.6, 5);
      expect(evaluation.isTriggered).toBe(false);
    });

    it('rejects stale buffer evaluated long after the last sample', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.85, i * 125);
      }

      const evaluation = tracker.evaluate(10000);
      expect(evaluation.isTriggered).toBe(false);
    });

    it('handles negative or retrograde time differences safely', () => {
      const tracker = new TensionTracker();
      tracker.addSample(0.85, 5000);

      const evaluation = tracker.evaluate(4000);
      expect(evaluation.heldDurationSeconds).toBe(0.0);
      expect(evaluation.isTriggered).toBe(false);
    });
  });

  describe('Successful Trigger and Cooldown Management', () => {
    it('triggers successfully under 3 seconds of stable high tension', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.82, 1000 + i * 125);
      }

      const nowMs = 1000 + (BUFFER_CAPACITY - 1) * 125;
      const evaluation = tracker.evaluate(nowMs);

      expect(evaluation.isTriggered).toBe(true);
      expect(evaluation.currentMeanScore).toBeCloseTo(0.82, 5);
      expect(evaluation.currentStdDev).toBeCloseTo(0.0, 5);
      expect(evaluation.heldDurationSeconds).toBeCloseTo(2.875, 3);
      expect(evaluation.activeCooldownMsRemaining).toBe(0);

      expect(tracker.getSamplesCount()).toBe(0);
      expect(tracker.getActiveCooldownRemaining(nowMs)).toBe(COOLDOWN_DURATION_MS);
    });

    it('enforces 60-second cooldown blocking re-trigger during subsequent 59 seconds', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.9, i * 125);
      }

      const triggerTimeMs = (BUFFER_CAPACITY - 1) * 125;
      const firstEval = tracker.evaluate(triggerTimeMs);
      expect(firstEval.isTriggered).toBe(true);

      const checkTimeMs = triggerTimeMs + 10000;
      expect(tracker.getActiveCooldownRemaining(checkTimeMs)).toBe(50000);

      const midCooldownEval = tracker.evaluate(checkTimeMs);
      expect(midCooldownEval.isTriggered).toBe(false);
      expect(midCooldownEval.activeCooldownMsRemaining).toBe(50000);

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.95, checkTimeMs + i * 125);
      }

      const feedEvalTime = checkTimeMs + (BUFFER_CAPACITY - 1) * 125;
      const blockedEval = tracker.evaluate(feedEvalTime);
      expect(blockedEval.isTriggered).toBe(false);
      expect(blockedEval.activeCooldownMsRemaining).toBeGreaterThan(0);

      const at59Seconds = triggerTimeMs + 59000;
      expect(tracker.getActiveCooldownRemaining(at59Seconds)).toBe(1000);
      const evalAt59 = tracker.evaluate(at59Seconds);
      expect(evalAt59.isTriggered).toBe(false);
      expect(evalAt59.activeCooldownMsRemaining).toBe(1000);
    });

    it('allows re-triggering after cooldown duration has fully elapsed', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.85, i * 125);
      }

      const t1 = (BUFFER_CAPACITY - 1) * 125;
      const eval1 = tracker.evaluate(t1);
      expect(eval1.isTriggered).toBe(true);

      const cooldownOverTime = t1 + COOLDOWN_DURATION_MS + 100;
      expect(tracker.getActiveCooldownRemaining(cooldownOverTime)).toBe(0);

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.88, cooldownOverTime + i * 125);
      }

      const t2 = cooldownOverTime + (BUFFER_CAPACITY - 1) * 125;
      const eval2 = tracker.evaluate(t2);
      expect(eval2.isTriggered).toBe(true);
      expect(eval2.currentMeanScore).toBeCloseTo(0.88, 5);
      expect(tracker.getActiveCooldownRemaining(t2)).toBe(COOLDOWN_DURATION_MS);
    });
  });

  describe('Reset and Custom Configuration', () => {
    it('resets buffer and cancels active cooldown completely', () => {
      const tracker = new TensionTracker();

      for (let i = 0; i < BUFFER_CAPACITY; i++) {
        tracker.addSample(0.9, i * 125);
      }
      const triggerTime = (BUFFER_CAPACITY - 1) * 125;
      tracker.evaluate(triggerTime);

      expect(tracker.getActiveCooldownRemaining(triggerTime + 1000)).toBe(59000);

      tracker.reset();

      expect(tracker.getSamplesCount()).toBe(0);
      expect(tracker.getActiveCooldownRemaining(triggerTime + 1000)).toBe(0);

      const postResetEval = tracker.evaluate(triggerTime + 1000);
      expect(postResetEval.isTriggered).toBe(false);
      expect(postResetEval.currentMeanScore).toBe(0.0);
      expect(postResetEval.activeCooldownMsRemaining).toBe(0);
    });

    it('supports custom constructor configuration parameters', () => {
      const customCapacity = 4;
      const customScoreThreshold = 0.6;
      const customStdDevThreshold = 0.05;
      const customCooldownMs = 5000;
      const customMaxWindowSpanMs = 1000;

      const tracker = new TensionTracker(
        customCapacity,
        customScoreThreshold,
        customStdDevThreshold,
        customCooldownMs,
        customMaxWindowSpanMs
      );

      for (let i = 0; i < 4; i++) {
        tracker.addSample(0.65, i * 100);
      }

      const evaluation = tracker.evaluate(300);
      expect(evaluation.isTriggered).toBe(true);
      expect(tracker.getActiveCooldownRemaining(300)).toBe(5000);
    });
  });
});

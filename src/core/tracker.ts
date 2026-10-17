import { TrackerSample, TrackerEvaluation } from './types';

export const BUFFER_CAPACITY = 24;
export const TRIGGER_SCORE_THRESHOLD = 0.75;
export const TRIGGER_STD_DEV_THRESHOLD = 0.12;
export const COOLDOWN_DURATION_MS = 60000;
export const MAX_WINDOW_SPAN_MS = 3500;

export class TensionTracker {
  private samples: TrackerSample[] = [];
  private cooldownUntilMs = 0;

  constructor(
    private readonly bufferCapacity: number = BUFFER_CAPACITY,
    private readonly scoreThreshold: number = TRIGGER_SCORE_THRESHOLD,
    private readonly stdDevThreshold: number = TRIGGER_STD_DEV_THRESHOLD,
    private readonly cooldownDurationMs: number = COOLDOWN_DURATION_MS,
    private readonly maxWindowSpanMs: number = MAX_WINDOW_SPAN_MS
  ) {}

  public addSample(score: number, timestampMs: number): void {
    if (this.samples.length >= this.bufferCapacity) {
      this.samples.shift();
    }
    this.samples.push({ score, timestampMs });
  }

  public getSamplesCount(): number {
    return this.samples.length;
  }

  public getActiveCooldownRemaining(nowMs: number): number {
    if (nowMs >= this.cooldownUntilMs) {
      return 0;
    }
    return this.cooldownUntilMs - nowMs;
  }

  public reset(): void {
    this.samples = [];
    this.cooldownUntilMs = 0;
  }

  public evaluate(nowMs: number): TrackerEvaluation {
    const activeCooldownMsRemaining = this.getActiveCooldownRemaining(nowMs);
    const count = this.samples.length;

    if (count === 0) {
      return {
        isTriggered: false,
        currentMeanScore: 0.0,
        currentStdDev: 0.0,
        heldDurationSeconds: 0.0,
        activeCooldownMsRemaining,
      };
    }

    const oldestSample = this.samples[0];
    const windowSpanMs = oldestSample !== undefined ? Math.max(0, nowMs - oldestSample.timestampMs) : 0;
    const isWindowRecent = oldestSample !== undefined && windowSpanMs <= this.maxWindowSpanMs && nowMs >= oldestSample.timestampMs;
    const heldDurationSeconds = windowSpanMs / 1000;

    let sum = 0;
    for (const sample of this.samples) {
      sum += sample.score;
    }
    const currentMeanScore = sum / count;

    let varianceSum = 0;
    for (const sample of this.samples) {
      const diff = sample.score - currentMeanScore;
      varianceSum += diff * diff;
    }
    const currentStdDev = Math.sqrt(varianceSum / count);

    const isBufferFull = count >= this.bufferCapacity;
    const isScoreAboveThreshold = currentMeanScore >= this.scoreThreshold;
    const isStdDevBelowThreshold = currentStdDev <= this.stdDevThreshold;
    const isCooldownZero = activeCooldownMsRemaining === 0;

    const shouldTrigger =
      isBufferFull &&
      isWindowRecent &&
      isScoreAboveThreshold &&
      isStdDevBelowThreshold &&
      isCooldownZero;

    if (shouldTrigger) {
      this.cooldownUntilMs = nowMs + this.cooldownDurationMs;
      this.samples = [];

      return {
        isTriggered: true,
        currentMeanScore,
        currentStdDev,
        heldDurationSeconds,
        activeCooldownMsRemaining: 0,
      };
    }

    return {
      isTriggered: false,
      currentMeanScore,
      currentStdDev,
      heldDurationSeconds,
      activeCooldownMsRemaining,
    };
  }
}

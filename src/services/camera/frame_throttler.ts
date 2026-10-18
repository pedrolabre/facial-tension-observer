export const DEFAULT_TARGET_FPS = 8;
export const DEFAULT_TARGET_INTERVAL_MS = 125;

export interface FrameThrottlerConfig {
  readonly targetFps?: number;
  readonly minIntervalMs?: number;
  readonly jitterToleranceMs?: number;
}

export class FrameThrottler {
  private readonly targetFps: number;
  private readonly targetIntervalMs: number;
  private readonly jitterToleranceMs: number;
  private readonly minIntervalMs: number;

  private lastProcessedTimestampMs: number | null = null;
  private totalReceivedFrames = 0;
  private totalProcessedFrames = 0;
  private totalDroppedFrames = 0;

  constructor(config?: FrameThrottlerConfig) {
    this.targetFps = config?.targetFps ?? DEFAULT_TARGET_FPS;
    if (this.targetFps <= 0 || !Number.isFinite(this.targetFps)) {
      throw new Error('targetFps must be a positive finite number');
    }

    this.targetIntervalMs = config?.minIntervalMs ?? Math.round(1000 / this.targetFps);
    this.jitterToleranceMs = Math.max(0, config?.jitterToleranceMs ?? 0);
    this.minIntervalMs = Math.max(0, this.targetIntervalMs - this.jitterToleranceMs);
  }

  get fps(): number {
    return this.targetFps;
  }

  get intervalMs(): number {
    return this.targetIntervalMs;
  }

  get effectiveMinIntervalMs(): number {
    return this.minIntervalMs;
  }

  get lastTimestampMs(): number | null {
    return this.lastProcessedTimestampMs;
  }

  get receivedCount(): number {
    return this.totalReceivedFrames;
  }

  get processedCount(): number {
    return this.totalProcessedFrames;
  }

  get droppedCount(): number {
    return this.totalDroppedFrames;
  }

  get dropRate(): number {
    if (this.totalReceivedFrames === 0) {
      return 0;
    }
    return this.totalDroppedFrames / this.totalReceivedFrames;
  }

  canProcess(timestampMs: number): boolean {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) {
      return false;
    }

    if (this.lastProcessedTimestampMs === null) {
      return true;
    }

    if (timestampMs < this.lastProcessedTimestampMs) {
      return false;
    }

    return (timestampMs - this.lastProcessedTimestampMs) >= this.minIntervalMs;
  }

  shouldProcess(timestampMs: number): boolean {
    if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs) || timestampMs < 0) {
      this.totalReceivedFrames++;
      this.totalDroppedFrames++;
      return false;
    }

    this.totalReceivedFrames++;

    if (this.lastProcessedTimestampMs === null) {
      this.lastProcessedTimestampMs = timestampMs;
      this.totalProcessedFrames++;
      return true;
    }

    if (timestampMs < this.lastProcessedTimestampMs) {
      this.totalDroppedFrames++;
      return false;
    }

    const elapsed = timestampMs - this.lastProcessedTimestampMs;
    if (elapsed >= this.minIntervalMs) {
      this.lastProcessedTimestampMs = timestampMs;
      this.totalProcessedFrames++;
      return true;
    }

    this.totalDroppedFrames++;
    return false;
  }

  processFrame<T>(frame: T, timestampMs: number, onProcess: (frame: T) => void): boolean {
    if (this.shouldProcess(timestampMs)) {
      onProcess(frame);
      return true;
    }
    return false;
  }

  getEffectiveFps(elapsedMs: number): number {
    if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs <= 0) {
      return 0;
    }
    return (this.totalProcessedFrames / elapsedMs) * 1000;
  }

  reset(): void {
    this.lastProcessedTimestampMs = null;
    this.totalReceivedFrames = 0;
    this.totalProcessedFrames = 0;
    this.totalDroppedFrames = 0;
  }
}

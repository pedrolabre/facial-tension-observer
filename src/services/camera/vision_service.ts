import { FaceMesh, InstantTensionResult } from '../../core/types';
import { computeInstantTension } from '../../core/heuristics';
import { FrameThrottler } from './frame_throttler';

export interface NativeLandmark {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

export interface NativeFaceFrame {
  readonly timestampMs: number;
  readonly landmarks: readonly NativeLandmark[];
  readonly smilingProbability?: number;
}

export type CameraPermissionStatus = 'granted' | 'denied' | 'not-determined' | 'restricted';

export interface CameraAdapter {
  checkPermission(): Promise<CameraPermissionStatus>;
  requestPermission(): Promise<CameraPermissionStatus>;
  isAvailable(): Promise<boolean>;
  startCapture(onFrame: (frame: NativeFaceFrame) => void): Promise<void>;
  stopCapture(): Promise<void>;
  takePhoto?(): Promise<Uint8Array>;
}

export class SimulatedCameraAdapter implements CameraAdapter {
  private status: CameraPermissionStatus = 'granted';
  private active = false;
  private frameCallback: ((frame: NativeFaceFrame) => void) | null = null;

  async checkPermission(): Promise<CameraPermissionStatus> {
    return this.status;
  }

  async requestPermission(): Promise<CameraPermissionStatus> {
    return this.status;
  }

  setPermission(status: CameraPermissionStatus): void {
    this.status = status;
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async startCapture(onFrame: (frame: NativeFaceFrame) => void): Promise<void> {
    this.active = true;
    this.frameCallback = onFrame;
  }

  async stopCapture(): Promise<void> {
    this.active = false;
    this.frameCallback = null;
  }

  emitFrame(frame: NativeFaceFrame): void {
    if (this.active && this.frameCallback) {
      this.frameCallback(frame);
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

export function convertNativeLandmarksToFaceMesh(
  landmarks: readonly NativeLandmark[]
): FaceMesh {
  if (!landmarks || !Array.isArray(landmarks)) {
    return [];
  }
  return landmarks.map((l) => ({
    x: typeof l.x === 'number' && Number.isFinite(l.x) ? l.x : 0.0,
    y: typeof l.y === 'number' && Number.isFinite(l.y) ? l.y : 0.0,
    z: typeof l.z === 'number' && Number.isFinite(l.z) ? l.z : 0.0,
  }));
}

export interface ProcessedVisionFrame {
  readonly timestampMs: number;
  readonly mesh: FaceMesh;
  readonly tensionResult: InstantTensionResult;
}

export interface VisionServiceOptions {
  readonly adapter?: CameraAdapter;
  readonly throttler?: FrameThrottler;
}

export class VisionService {
  private readonly adapter: CameraAdapter;
  private readonly throttler: FrameThrottler;
  private readonly listeners: Set<(frame: ProcessedVisionFrame) => void> = new Set();
  private running = false;

  constructor(options?: VisionServiceOptions) {
    this.adapter = options?.adapter ?? new SimulatedCameraAdapter();
    this.throttler = options?.throttler ?? new FrameThrottler();
  }

  get isStreaming(): boolean {
    return this.running;
  }

  get cameraAdapter(): CameraAdapter {
    return this.adapter;
  }

  get frameThrottler(): FrameThrottler {
    return this.throttler;
  }

  async checkPermission(): Promise<CameraPermissionStatus> {
    return await this.adapter.checkPermission();
  }

  async requestPermission(): Promise<CameraPermissionStatus> {
    return await this.adapter.requestPermission();
  }

  onFrame(listener: (frame: ProcessedVisionFrame) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  processNativeFrame(rawFrame: NativeFaceFrame): ProcessedVisionFrame | null {
    if (!this.throttler.shouldProcess(rawFrame.timestampMs)) {
      return null;
    }

    const mesh = convertNativeLandmarksToFaceMesh(rawFrame.landmarks);
    const tensionResult = computeInstantTension(
      mesh,
      rawFrame.smilingProbability ?? 0.0
    );

    const processed: ProcessedVisionFrame = {
      timestampMs: rawFrame.timestampMs,
      mesh,
      tensionResult,
    };

    for (const listener of this.listeners) {
      listener(processed);
    }

    return processed;
  }

  async start(onFrameListener?: (frame: ProcessedVisionFrame) => void): Promise<void> {
    if (this.running) {
      return;
    }

    const permission = await this.adapter.checkPermission();
    if (permission !== 'granted') {
      const requested = await this.adapter.requestPermission();
      if (requested !== 'granted') {
        throw new Error(`Camera permission not granted: ${requested}`);
      }
    }

    if (onFrameListener) {
      this.onFrame(onFrameListener);
    }

    await this.adapter.startCapture((rawFrame) => {
      this.processNativeFrame(rawFrame);
    });

    this.running = true;
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    await this.adapter.stopCapture();
    this.running = false;
  }

  reset(): void {
    this.throttler.reset();
    this.listeners.clear();
  }
}

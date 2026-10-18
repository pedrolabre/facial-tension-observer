import {
  FrameThrottler,
  DEFAULT_TARGET_FPS,
  DEFAULT_TARGET_INTERVAL_MS,
} from '../../src/services/camera/frame_throttler';
import {
  VisionService,
  SimulatedCameraAdapter,
  convertNativeLandmarksToFaceMesh,
  NativeFaceFrame,
  NativeLandmark,
} from '../../src/services/camera/vision_service';
import { createNeutralMesh, createHighTensionMesh } from '../fixtures/mock_meshes';

describe('FrameThrottler', () => {
  it('instantiates with default 8 FPS and 125ms interval', () => {
    const throttler = new FrameThrottler();

    expect(throttler.fps).toBe(DEFAULT_TARGET_FPS);
    expect(throttler.intervalMs).toBe(DEFAULT_TARGET_INTERVAL_MS);
    expect(throttler.effectiveMinIntervalMs).toBe(125);
    expect(throttler.lastTimestampMs).toBeNull();
    expect(throttler.receivedCount).toBe(0);
    expect(throttler.processedCount).toBe(0);
    expect(throttler.droppedCount).toBe(0);
    expect(throttler.dropRate).toBe(0);
  });

  it('accepts custom configuration for targetFps and minIntervalMs', () => {
    const throttler1 = new FrameThrottler({ targetFps: 10 });
    expect(throttler1.fps).toBe(10);
    expect(throttler1.intervalMs).toBe(100);
    expect(throttler1.effectiveMinIntervalMs).toBe(100);

    const throttler2 = new FrameThrottler({ targetFps: 8, minIntervalMs: 200 });
    expect(throttler2.intervalMs).toBe(200);
    expect(throttler2.effectiveMinIntervalMs).toBe(200);

    const throttler3 = new FrameThrottler({ targetFps: 8, jitterToleranceMs: 15 });
    expect(throttler3.intervalMs).toBe(125);
    expect(throttler3.effectiveMinIntervalMs).toBe(110);
  });

  it('throws on invalid targetFps configuration', () => {
    expect(() => new FrameThrottler({ targetFps: 0 })).toThrow(
      'targetFps must be a positive finite number'
    );
    expect(() => new FrameThrottler({ targetFps: -5 })).toThrow(
      'targetFps must be a positive finite number'
    );
    expect(() => new FrameThrottler({ targetFps: NaN })).toThrow(
      'targetFps must be a positive finite number'
    );
    expect(() => new FrameThrottler({ targetFps: Infinity })).toThrow(
      'targetFps must be a positive finite number'
    );
  });

  it('processes the first frame regardless of initial timestamp', () => {
    const throttler = new FrameThrottler();

    const accepted = throttler.shouldProcess(15000);

    expect(accepted).toBe(true);
    expect(throttler.lastTimestampMs).toBe(15000);
    expect(throttler.receivedCount).toBe(1);
    expect(throttler.processedCount).toBe(1);
    expect(throttler.droppedCount).toBe(0);
    expect(throttler.dropRate).toBe(0);
  });

  it('processes 100% of frames on a nominal 8 FPS stream', () => {
    const throttler = new FrameThrottler();
    const timestamps = [0, 125, 250, 375, 500, 625, 750, 875, 1000];

    for (const ts of timestamps) {
      const accepted = throttler.shouldProcess(ts);
      expect(accepted).toBe(true);
    }

    expect(throttler.receivedCount).toBe(9);
    expect(throttler.processedCount).toBe(9);
    expect(throttler.droppedCount).toBe(0);
    expect(throttler.dropRate).toBe(0);
    expect(throttler.getEffectiveFps(1000)).toBe(9);
  });

  it('throttles a 30 FPS stream strictly to 8 FPS without exceeding 8.5 FPS', () => {
    const throttler = new FrameThrottler();
    const durationMs = 1000;
    const interval30Fps = 1000 / 30;

    let received = 0;
    for (let ts = 0; ts <= durationMs; ts += interval30Fps) {
      throttler.shouldProcess(Math.round(ts));
      received++;
    }

    expect(throttler.receivedCount).toBe(received);
    expect(throttler.processedCount).toBe(8);
    expect(throttler.droppedCount).toBe(received - 8);

    const effectiveFps = throttler.getEffectiveFps(durationMs);
    expect(effectiveFps).toBe(8.0);
    expect(effectiveFps).toBeLessThanOrEqual(8.5);
    expect(throttler.dropRate).toBeGreaterThan(0.70);
  });

  it('throttles a 60 FPS stream deterministically without exceeding 8.5 FPS', () => {
    const throttler = new FrameThrottler();
    const durationMs = 1000;
    const interval60Fps = 1000 / 60;

    let received = 0;
    for (let ts = 0; ts <= durationMs; ts += interval60Fps) {
      throttler.shouldProcess(Math.round(ts));
      received++;
    }

    expect(throttler.receivedCount).toBe(received);
    expect(throttler.processedCount).toBe(8);
    expect(throttler.droppedCount).toBe(received - 8);

    const effectiveFps = throttler.getEffectiveFps(durationMs);
    expect(effectiveFps).toBe(8.0);
    expect(effectiveFps).toBeLessThanOrEqual(8.5);
    expect(throttler.dropRate).toBeGreaterThan(0.80);
  });

  it('handles jittered timestamps with calibrated tolerance', () => {
    const strictThrottler = new FrameThrottler();
    expect(strictThrottler.shouldProcess(0)).toBe(true);
    expect(strictThrottler.shouldProcess(124)).toBe(false);
    expect(strictThrottler.shouldProcess(250)).toBe(true);

    const jitterThrottler = new FrameThrottler({ jitterToleranceMs: 5 });
    expect(jitterThrottler.shouldProcess(0)).toBe(true);
    expect(jitterThrottler.shouldProcess(120)).toBe(true);
    expect(jitterThrottler.shouldProcess(243)).toBe(true);
    expect(jitterThrottler.shouldProcess(365)).toBe(true);
    expect(jitterThrottler.droppedCount).toBe(0);
  });

  it('rejects out-of-order and retro-active timestamps', () => {
    const throttler = new FrameThrottler();

    expect(throttler.shouldProcess(500)).toBe(true);
    expect(throttler.shouldProcess(400)).toBe(false);
    expect(throttler.shouldProcess(499)).toBe(false);
    expect(throttler.droppedCount).toBe(2);

    expect(throttler.shouldProcess(625)).toBe(true);
    expect(throttler.processedCount).toBe(2);
  });

  it('rejects invalid or non-numeric timestamps safely', () => {
    const throttler = new FrameThrottler();

    expect(throttler.shouldProcess(-10)).toBe(false);
    expect(throttler.shouldProcess(NaN)).toBe(false);
    expect(throttler.shouldProcess(Infinity)).toBe(false);
    expect(throttler.shouldProcess('100' as unknown as number)).toBe(false);

    expect(throttler.receivedCount).toBe(4);
    expect(throttler.droppedCount).toBe(4);
    expect(throttler.processedCount).toBe(0);
  });

  it('inspects readiness with canProcess without mutating state', () => {
    const throttler = new FrameThrottler();

    expect(throttler.canProcess(0)).toBe(true);
    expect(throttler.receivedCount).toBe(0);

    throttler.shouldProcess(0);
    expect(throttler.receivedCount).toBe(1);

    expect(throttler.canProcess(50)).toBe(false);
    expect(throttler.canProcess(124)).toBe(false);
    expect(throttler.canProcess(125)).toBe(true);
    expect(throttler.canProcess(150)).toBe(true);
    expect(throttler.canProcess(-5)).toBe(false);
    expect(throttler.canProcess(NaN)).toBe(false);

    expect(throttler.receivedCount).toBe(1);
    expect(throttler.processedCount).toBe(1);
    expect(throttler.droppedCount).toBe(0);
  });

  it('executes processFrame callback only when accepted', () => {
    const throttler = new FrameThrottler();
    const calls: string[] = [];

    const res1 = throttler.processFrame('frame-1', 0, (f) => calls.push(f));
    const res2 = throttler.processFrame('frame-2', 50, (f) => calls.push(f));
    const res3 = throttler.processFrame('frame-3', 130, (f) => calls.push(f));

    expect(res1).toBe(true);
    expect(res2).toBe(false);
    expect(res3).toBe(true);
    expect(calls).toEqual(['frame-1', 'frame-3']);
  });

  it('resets state completely on reset()', () => {
    const throttler = new FrameThrottler();
    throttler.shouldProcess(0);
    throttler.shouldProcess(50);
    throttler.shouldProcess(130);

    expect(throttler.receivedCount).toBe(3);
    expect(throttler.processedCount).toBe(2);

    throttler.reset();

    expect(throttler.lastTimestampMs).toBeNull();
    expect(throttler.receivedCount).toBe(0);
    expect(throttler.processedCount).toBe(0);
    expect(throttler.droppedCount).toBe(0);
    expect(throttler.dropRate).toBe(0);

    expect(throttler.shouldProcess(50)).toBe(true);
    expect(throttler.lastTimestampMs).toBe(50);
  });

  it('returns zero for invalid duration in getEffectiveFps', () => {
    const throttler = new FrameThrottler();
    throttler.shouldProcess(0);

    expect(throttler.getEffectiveFps(0)).toBe(0);
    expect(throttler.getEffectiveFps(-100)).toBe(0);
    expect(throttler.getEffectiveFps(NaN)).toBe(0);
  });
});

describe('VisionService and CameraAdapter', () => {
  it('converts native landmarks to FaceMesh with fallback z coordinates', () => {
    const rawLandmarks: NativeLandmark[] = [
      { x: 0.1, y: 0.2, z: 0.3 },
      { x: 0.4, y: 0.5 },
      { x: NaN, y: 0.7, z: 0.8 },
    ];

    const mesh = convertNativeLandmarksToFaceMesh(rawLandmarks);

    expect(mesh).toHaveLength(3);
    expect(mesh[0]).toEqual({ x: 0.1, y: 0.2, z: 0.3 });
    expect(mesh[1]).toEqual({ x: 0.4, y: 0.5, z: 0.0 });
    expect(mesh[2]).toEqual({ x: 0.0, y: 0.7, z: 0.8 });

    expect(convertNativeLandmarksToFaceMesh([] as unknown as NativeLandmark[])).toEqual([]);
    expect(convertNativeLandmarksToFaceMesh(null as unknown as NativeLandmark[])).toEqual([]);
  });

  it('operates SimulatedCameraAdapter permissions and capture states', async () => {
    const adapter = new SimulatedCameraAdapter();

    expect(await adapter.checkPermission()).toBe('granted');
    expect(await adapter.isAvailable()).toBe(true);
    expect(adapter.isActive()).toBe(false);

    adapter.setPermission('denied');
    expect(await adapter.checkPermission()).toBe('denied');
    expect(await adapter.requestPermission()).toBe('denied');

    adapter.setPermission('granted');

    const received: NativeFaceFrame[] = [];
    await adapter.startCapture((frame) => received.push(frame));
    expect(adapter.isActive()).toBe(true);

    const testFrame: NativeFaceFrame = {
      timestampMs: 100,
      landmarks: [{ x: 0, y: 0, z: 0 }],
      smilingProbability: 0.05,
    };

    adapter.emitFrame(testFrame);
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(testFrame);

    await adapter.stopCapture();
    expect(adapter.isActive()).toBe(false);

    adapter.emitFrame(testFrame);
    expect(received).toHaveLength(1);
  });

  it('manages VisionService lifecycle and permission gates', async () => {
    const adapter = new SimulatedCameraAdapter();
    const service = new VisionService({ adapter });

    expect(service.isStreaming).toBe(false);
    expect(service.cameraAdapter).toBe(adapter);
    expect(service.frameThrottler).toBeInstanceOf(FrameThrottler);

    expect(await service.checkPermission()).toBe('granted');

    adapter.setPermission('denied');
    await expect(service.start()).rejects.toThrow('Camera permission not granted: denied');

    adapter.setPermission('granted');
    await service.start();
    expect(service.isStreaming).toBe(true);

    await service.start();
    expect(service.isStreaming).toBe(true);

    await service.stop();
    expect(service.isStreaming).toBe(false);

    await service.stop();
    expect(service.isStreaming).toBe(false);
  });

  it('processes frames through FrameThrottler and emits ProcessedVisionFrame', async () => {
    const adapter = new SimulatedCameraAdapter();
    const throttler = new FrameThrottler({ targetFps: 8 });
    const service = new VisionService({ adapter, throttler });

    const neutralMesh = createNeutralMesh();
    const nativeLandmarks: NativeLandmark[] = neutralMesh.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
    }));

    const events: Array<{ timestampMs: number; score: number }> = [];
    const unsubscribe = service.onFrame((frame) => {
      events.push({
        timestampMs: frame.timestampMs,
        score: frame.tensionResult.instantScore,
      });
    });

    await service.start();

    adapter.emitFrame({
      timestampMs: 0,
      landmarks: nativeLandmarks,
      smilingProbability: 0.0,
    });

    adapter.emitFrame({
      timestampMs: 50,
      landmarks: nativeLandmarks,
      smilingProbability: 0.0,
    });

    adapter.emitFrame({
      timestampMs: 130,
      landmarks: nativeLandmarks,
      smilingProbability: 0.0,
    });

    expect(events).toHaveLength(2);
    expect(events[0]?.timestampMs).toBe(0);
    expect(events[1]?.timestampMs).toBe(130);

    unsubscribe();

    adapter.emitFrame({
      timestampMs: 260,
      landmarks: nativeLandmarks,
      smilingProbability: 0.0,
    });

    expect(events).toHaveLength(2);

    await service.stop();
  });

  it('suppresses tension score to 0 when smiling is detected in native frame', () => {
    const service = new VisionService();
    const highTensionMesh = createHighTensionMesh();
    const nativeLandmarks: NativeLandmark[] = highTensionMesh.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
    }));

    const tenseFrame = service.processNativeFrame({
      timestampMs: 0,
      landmarks: nativeLandmarks,
      smilingProbability: 0.0,
    });

    expect(tenseFrame).not.toBeNull();
    expect(tenseFrame?.tensionResult.instantScore).toBeGreaterThan(0.5);
    expect(tenseFrame?.tensionResult.isSmileSuppressed).toBe(false);

    const smilingFrame = service.processNativeFrame({
      timestampMs: 130,
      landmarks: nativeLandmarks,
      smilingProbability: 0.6,
    });

    expect(smilingFrame).not.toBeNull();
    expect(smilingFrame?.tensionResult.instantScore).toBe(0.0);
    expect(smilingFrame?.tensionResult.isSmileSuppressed).toBe(true);
  });

  it('returns null and drops frame when throttled', () => {
    const service = new VisionService();
    const neutralMesh = createNeutralMesh();
    const nativeLandmarks: NativeLandmark[] = neutralMesh.map((p) => ({
      x: p.x,
      y: p.y,
      z: p.z,
    }));

    const frame1 = service.processNativeFrame({
      timestampMs: 0,
      landmarks: nativeLandmarks,
    });
    expect(frame1).not.toBeNull();

    const frame2 = service.processNativeFrame({
      timestampMs: 40,
      landmarks: nativeLandmarks,
    });
    expect(frame2).toBeNull();
  });

  it('resets internal throttler and clears listeners on reset()', () => {
    const service = new VisionService();
    let count = 0;
    service.onFrame(() => {
      count++;
    });

    service.processNativeFrame({
      timestampMs: 0,
      landmarks: [],
    });
    expect(count).toBe(1);

    service.reset();

    service.processNativeFrame({
      timestampMs: 0,
      landmarks: [],
    });
    expect(count).toBe(1);
    expect(service.frameThrottler.processedCount).toBe(1);
  });
});

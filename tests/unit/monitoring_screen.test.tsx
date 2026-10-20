import { PulseIndicator } from '../../src/ui/components/PulseIndicator';
import {
  MonitoringScreen,
  formatElapsedDuration,
} from '../../src/ui/screens/MonitoringScreen';
import { findUIElementByTestId, extractUIElementText } from '../../src/ui/screens/HomeScreen';
import { UIElement } from '../../src/ui/components/MetricCard';
import {
  SessionManager,
  SessionState,
  TensionTriggerEvent,
} from '../../src/services/session/session_manager';
import { MonitoringSession, TrackerEvaluation } from '../../src/core/types';
import { ProcessedVisionFrame } from '../../src/services/camera/vision_service';

class FakeSessionManager {
  public state: SessionState = 'IDLE';
  public sessionId: string | null = null;
  public elapsedSeconds = 0;
  public cooldownRemaining = 0;
  public shouldFailStart = false;
  public shouldFailStop = false;

  private readonly stateListeners = new Set<(state: SessionState, prev: SessionState) => void>();
  private readonly frameListeners = new Set<(frame: ProcessedVisionFrame, evalResult: TrackerEvaluation) => void>();
  private readonly triggerListeners = new Set<(event: TensionTriggerEvent) => void>();
  private readonly errorListeners = new Set<(err: Error) => void>();

  onStateChange(l: (state: SessionState, prev: SessionState) => void): () => void {
    this.stateListeners.add(l);
    return () => this.stateListeners.delete(l);
  }

  onFrameProcessed(l: (frame: ProcessedVisionFrame, evalResult: TrackerEvaluation) => void): () => void {
    this.frameListeners.add(l);
    return () => this.frameListeners.delete(l);
  }

  onTrigger(l: (event: TensionTriggerEvent) => void): () => void {
    this.triggerListeners.add(l);
    return () => this.triggerListeners.delete(l);
  }

  onError(l: (err: Error) => void): () => void {
    this.errorListeners.add(l);
    return () => this.errorListeners.delete(l);
  }

  getElapsedDurationSeconds(): number {
    return this.elapsedSeconds;
  }

  getCooldownRemainingMs(): number {
    return this.cooldownRemaining;
  }

  async startSession(): Promise<string> {
    if (this.shouldFailStart) {
      throw new Error('Failed to start camera feed');
    }
    const prev = this.state;
    this.state = 'MONITORING';
    this.sessionId = 'test-session-123';
    for (const l of this.stateListeners) l('MONITORING', prev);
    return this.sessionId;
  }

  async stopSession(): Promise<MonitoringSession> {
    if (this.shouldFailStop) {
      throw new Error('Failed to stop session gracefully');
    }
    const prev = this.state;
    this.state = 'IDLE';
    const finalSession: MonitoringSession = {
      id: this.sessionId ?? 'test-session-123',
      startedAt: 1700000000000,
      endedAt: 1700000090000,
      durationSeconds: this.elapsedSeconds,
      triggersCount: 1,
      keptCount: 1,
      deletedCount: 0,
      status: 'idle',
    };
    for (const l of this.stateListeners) l('IDLE', prev);
    this.sessionId = null;
    return finalSession;
  }

  emitFrame(instantScore: number, cooldownRemaining = 0): void {
    const frame: ProcessedVisionFrame = {
      timestampMs: Date.now(),
      mesh: [],
      tensionResult: {
        instantScore,
        components: {
          browFurrowScore: instantScore,
          lipCompressionScore: instantScore,
          jawRigidityScore: instantScore,
          smileProbability: 0,
        },
        isSmileSuppressed: false,
      },
    };
    const evalResult: TrackerEvaluation = {
      isTriggered: instantScore >= 0.75,
      currentMeanScore: instantScore,
      currentStdDev: 0.05,
      heldDurationSeconds: 3.1,
      activeCooldownMsRemaining: cooldownRemaining,
    };
    for (const l of this.frameListeners) l(frame, evalResult);
  }

  emitTrigger(event: TensionTriggerEvent): void {
    const prev = this.state;
    this.state = 'AWAITING_DECISION';
    for (const l of this.stateListeners) l('AWAITING_DECISION', prev);
    for (const l of this.triggerListeners) l(event);
  }

  emitError(err: Error): void {
    for (const l of this.errorListeners) l(err);
  }

  emitStateChange(newState: SessionState): void {
    const prev = this.state;
    this.state = newState;
    for (const l of this.stateListeners) l(newState, prev);
  }
}

describe('PulseIndicator Component', () => {
  it('renders default active tone with nested rings and core', () => {
    const indicator = PulseIndicator({});
    expect(indicator.type).toBe('View');
    expect(indicator.props.testID).toBe('pulse-indicator');

    const outerRing = findUIElementByTestId(indicator, 'pulse-indicator-outer-ring');
    expect(outerRing).not.toBeNull();
    const middleRing = findUIElementByTestId(indicator, 'pulse-indicator-middle-ring');
    expect(middleRing).not.toBeNull();
    const core = findUIElementByTestId(indicator, 'pulse-indicator-core');
    expect(core).not.toBeNull();
  });

  it('renders distinct tone variations accurately', () => {
    const active = PulseIndicator({ tone: 'active' });
    const idle = PulseIndicator({ tone: 'idle' });
    const warning = PulseIndicator({ tone: 'warning' });
    const cooldown = PulseIndicator({ tone: 'cooldown' });

    const activeCore = findUIElementByTestId(active, 'pulse-indicator-core');
    const idleCore = findUIElementByTestId(idle, 'pulse-indicator-core');
    const warningCore = findUIElementByTestId(warning, 'pulse-indicator-core');
    const cooldownCore = findUIElementByTestId(cooldown, 'pulse-indicator-core');

    expect((activeCore?.props.style as Record<string, unknown>).backgroundColor).toBe('#2DD4BF');
    expect((idleCore?.props.style as Record<string, unknown>).backgroundColor).toBe('#71717A');
    expect((warningCore?.props.style as Record<string, unknown>).backgroundColor).toBe('#FBBF24');
    expect((cooldownCore?.props.style as Record<string, unknown>).backgroundColor).toBe('#60A5FA');
  });

  it('renders size variations (small, medium, large)', () => {
    const small = PulseIndicator({ size: 'small' });
    const medium = PulseIndicator({ size: 'medium' });
    const large = PulseIndicator({ size: 'large' });

    const smallOuter = findUIElementByTestId(small, 'pulse-indicator-outer-ring');
    const mediumOuter = findUIElementByTestId(medium, 'pulse-indicator-outer-ring');
    const largeOuter = findUIElementByTestId(large, 'pulse-indicator-outer-ring');

    expect((smallOuter?.props.style as Record<string, unknown>).width).toBe(28);
    expect((mediumOuter?.props.style as Record<string, unknown>).width).toBe(56);
    expect((largeOuter?.props.style as Record<string, unknown>).width).toBe(96);
  });

  it('renders textual label when specified and clamps pulseLevel', () => {
    const indicatorWithLabel = PulseIndicator({
      tone: 'active',
      label: 'Telemetria OK',
      pulseLevel: 0.9,
    });
    const labelEl = findUIElementByTestId(indicatorWithLabel, 'pulse-indicator-label');
    expect(labelEl).not.toBeNull();
    expect(extractUIElementText(labelEl!)).toBe('Telemetria OK');

    const clamped = PulseIndicator({ pulseLevel: 1.5 });
    const core = findUIElementByTestId(clamped, 'pulse-indicator-core');
    expect((core?.props.style as Record<string, unknown>).opacity).toBeCloseTo(1.0);
  });

  it('defaults to idle tone if active is false', () => {
    const indicator = PulseIndicator({ active: false });
    const core = findUIElementByTestId(indicator, 'pulse-indicator-core');
    expect((core?.props.style as Record<string, unknown>).backgroundColor).toBe('#71717A');
  });
});

describe('formatElapsedDuration utility', () => {
  it('formats zero seconds as 00:00', () => {
    expect(formatElapsedDuration(0)).toBe('00:00');
  });

  it('formats negative values safely as 00:00', () => {
    expect(formatElapsedDuration(-10)).toBe('00:00');
  });

  it('formats seconds and minutes correctly', () => {
    expect(formatElapsedDuration(45)).toBe('00:45');
    expect(formatElapsedDuration(60)).toBe('01:00');
    expect(formatElapsedDuration(125)).toBe('02:05');
    expect(formatElapsedDuration(3665)).toBe('61:05');
  });
});

describe('MonitoringScreen Component & Controller', () => {
  let fakeSm: FakeSessionManager;

  beforeEach(() => {
    fakeSm = new FakeSessionManager();
  });

  function hasForbiddenCameraNode(element: UIElement): boolean {
    const type = element.type.toLowerCase();
    const testId = (element.props.testID ?? '').toLowerCase();
    if (type.includes('camera') || type.includes('video') || type.includes('surfaceview')) {
      return true;
    }
    if (testId.includes('camera-feed') || testId.includes('mirror') || testId.includes('live-video')) {
      return true;
    }
    const children = element.props.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        if (child && typeof child === 'object' && 'type' in child) {
          if (hasForbiddenCameraNode(child as UIElement)) return true;
        }
      }
    }
    return false;
  }

  it('strictly adheres to the No Mirror Policy with zero camera or live video elements', () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
    });
    const tree = controller.render();
    expect(hasForbiddenCameraNode(tree)).toBe(false);
    controller.dispose();
  });

  it('initializes and automatically starts session by default', async () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(controller.getState().sessionState).toBe('MONITORING');
    const tree = controller.render();
    const statusText = findUIElementByTestId(tree, 'monitoring-screen-status-text');
    expect(statusText).not.toBeNull();
    expect(extractUIElementText(statusText!)).toBe('MONITORANDO');

    const appTitle = findUIElementByTestId(tree, 'monitoring-screen-header-app-name');
    expect(extractUIElementText(appTitle!)).toBe('facial-tension-observer • caradecu');

    controller.dispose();
  });

  it('respects autoStart=false and remains in IDLE state until manual start', async () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
    });

    expect(controller.getState().sessionState).toBe('IDLE');
    const tree = controller.render();
    const statusText = findUIElementByTestId(tree, 'monitoring-screen-status-text');
    expect(extractUIElementText(statusText!)).toBe('OCIOSO');

    await controller.start();
    expect(controller.getState().sessionState).toBe('MONITORING');
    controller.dispose();
  });

  it('updates state dynamically upon frame processed and cooldown', () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
    });

    fakeSm.elapsedSeconds = 72;
    fakeSm.emitFrame(0.68, 15000);

    expect(controller.getState().currentInstantScore).toBe(0.68);
    expect(controller.getState().cooldownRemainingMs).toBe(15000);
    expect(controller.getState().elapsedSeconds).toBe(72);

    const tree = controller.render();
    const timer = findUIElementByTestId(tree, 'monitoring-screen-timer');
    expect(extractUIElementText(timer!)).toBe('01:12');

    controller.dispose();
  });

  it('handles state transition to COOLDOWN and displays appropriate status', () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
    });

    fakeSm.emitStateChange('COOLDOWN');
    expect(controller.getState().sessionState).toBe('COOLDOWN');

    const tree = controller.render();
    const statusText = findUIElementByTestId(tree, 'monitoring-screen-status-text');
    expect(extractUIElementText(statusText!)).toBe('COOLDOWN');

    controller.dispose();
  });

  it('handles trigger events and dispatches onTrigger callback', () => {
    let receivedTrigger: TensionTriggerEvent | null = null;
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
      onTrigger: (evt) => {
        receivedTrigger = evt;
      },
    });

    const triggerEvent: TensionTriggerEvent = {
      sessionId: 'sess-1',
      tempFilePath: '/cache/captures/temp_1.jpg',
      tensionScore: 0.88,
      heldDurationSeconds: 3.2,
      components: {
        browFurrowScore: 0.9,
        lipCompressionScore: 0.85,
        jawRigidityScore: 0.88,
        smileProbability: 0,
      },
      timestampMs: 123456,
    };

    fakeSm.emitTrigger(triggerEvent);

    expect(controller.getState().triggersCount).toBe(1);
    expect(receivedTrigger).toEqual(triggerEvent);

    const tree = controller.render();
    const statusText = findUIElementByTestId(tree, 'monitoring-screen-status-text');
    expect(extractUIElementText(statusText!)).toBe('FLAGRA DETECTADO');

    controller.dispose();
  });

  it('handles stop button press and triggers onSessionStopped', async () => {
    let stoppedSession: MonitoringSession | null = null;
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
      onSessionStopped: (session) => {
        stoppedSession = session;
      },
    });

    await controller.start();
    fakeSm.elapsedSeconds = 90;

    const tree = controller.render();
    const stopButton = findUIElementByTestId(tree, 'monitoring-screen-stop-button');
    expect(stopButton).not.toBeNull();

    stopButton?.props.onPress?.();
    await new Promise((r) => setTimeout(r, 20));

    expect(stoppedSession).not.toBeNull();
    const resolvedSession = stoppedSession as MonitoringSession | null;
    expect(resolvedSession?.durationSeconds).toBe(90);
    expect(controller.getState().sessionState).toBe('IDLE');

    controller.dispose();
  });

  it('captures errors during start or from SessionManager and invokes onError', async () => {
    let capturedError: Error | null = null;
    fakeSm.shouldFailStart = true;

    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
      onError: (err) => {
        capturedError = err;
      },
    });

    await expect(controller.start()).rejects.toThrow('Failed to start camera feed');
    expect(controller.getState().error).toBe('Failed to start camera feed');

    fakeSm.emitError(new Error('Dropped frame error'));
    expect(controller.getState().error).toBe('Dropped frame error');
    const resolvedError = capturedError as Error | null;
    expect(resolvedError?.message).toBe('Dropped frame error');

    controller.dispose();
  });

  it('notifies subscribers upon state changes and allows unsubscribe', () => {
    const controller = MonitoringScreen({
      sessionManager: fakeSm as unknown as SessionManager,
      autoStart: false,
    });

    let notificationCount = 0;
    const unsubscribe = controller.subscribe(() => {
      notificationCount++;
    });

    fakeSm.emitStateChange('MONITORING');
    expect(notificationCount).toBe(1);

    unsubscribe();
    fakeSm.emitStateChange('IDLE');
    expect(notificationCount).toBe(1);

    controller.dispose();
  });
});

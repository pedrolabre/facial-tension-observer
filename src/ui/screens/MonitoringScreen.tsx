import { SessionManager, SessionState, TensionTriggerEvent } from '../../services/session/session_manager';
import { MonitoringSession } from '../../core/types';
import { UIElement, createUIElement } from '../components/MetricCard';
import { PulseIndicator, PulseIndicatorTone } from '../components/PulseIndicator';

export interface MonitoringScreenProps {
  readonly sessionManager: SessionManager;
  readonly onSessionStopped?: (session: MonitoringSession) => void;
  readonly onTrigger?: (event: TensionTriggerEvent) => void;
  readonly onError?: (error: Error) => void;
  readonly autoStart?: boolean;
  readonly testID?: string;
  readonly timeProvider?: () => number;
}

export interface MonitoringScreenState {
  readonly sessionState: SessionState;
  readonly elapsedSeconds: number;
  readonly currentInstantScore: number;
  readonly triggersCount: number;
  readonly cooldownRemainingMs: number;
  readonly error: string | null;
}

export function formatElapsedDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export class MonitoringScreenController {
  private state: MonitoringScreenState;
  private readonly listeners = new Set<(state: MonitoringScreenState) => void>();
  private readonly unbinders: Array<() => void> = [];
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private isDisposed = false;

  constructor(private readonly props: MonitoringScreenProps) {
    this.state = {
      sessionState: props.sessionManager.state,
      elapsedSeconds: props.sessionManager.getElapsedDurationSeconds(),
      currentInstantScore: 0,
      triggersCount: 0,
      cooldownRemainingMs: props.sessionManager.getCooldownRemainingMs(),
      error: null,
    };
    this.bindSessionManager();
    if (props.autoStart !== false && props.sessionManager.state === 'IDLE') {
      void this.start();
    }
  }

  public getState(): MonitoringScreenState {
    return this.state;
  }

  public subscribe(listener: (state: MonitoringScreenState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<MonitoringScreenState>): void {
    if (this.isDisposed) return;
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  private bindSessionManager(): void {
    const sm = this.props.sessionManager;
    this.unbinders.push(
      sm.onStateChange((newState) => {
        this.updateState({
          sessionState: newState,
          cooldownRemainingMs: sm.getCooldownRemainingMs(),
          elapsedSeconds: sm.getElapsedDurationSeconds(),
        });
      }),
      sm.onFrameProcessed((frame, evaluation) => {
        this.updateState({
          currentInstantScore: frame.tensionResult.instantScore,
          cooldownRemainingMs: evaluation.activeCooldownMsRemaining,
          elapsedSeconds: sm.getElapsedDurationSeconds(),
        });
      }),
      sm.onTrigger((event) => {
        this.updateState({
          triggersCount: this.state.triggersCount + 1,
          elapsedSeconds: sm.getElapsedDurationSeconds(),
        });
        if (this.props.onTrigger) this.props.onTrigger(event);
      }),
      sm.onError((err) => {
        this.updateState({ error: err.message });
        if (this.props.onError) this.props.onError(err);
      })
    );
    this.timerInterval = setInterval(() => {
      if (this.isDisposed) return;
      if (sm.state !== 'IDLE' && sm.state !== 'STOPPING') {
        this.updateState({
          elapsedSeconds: sm.getElapsedDurationSeconds(),
          cooldownRemainingMs: sm.getCooldownRemainingMs(),
        });
      }
    }, 1000);
  }

  public async start(): Promise<string> {
    try {
      this.updateState({ error: null });
      return await this.props.sessionManager.startSession();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateState({ error: msg });
      throw err;
    }
  }

  public async stop(): Promise<MonitoringSession> {
    try {
      const session = await this.props.sessionManager.stopSession();
      if (this.props.onSessionStopped) this.props.onSessionStopped(session);
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.updateState({ error: msg });
      throw err;
    }
  }

  public async handleStopMonitoring(): Promise<MonitoringSession> {
    return this.stop();
  }

  public dispose(): void {
    this.isDisposed = true;
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    while (this.unbinders.length > 0) {
      const unbind = this.unbinders.pop();
      if (unbind) unbind();
    }
    this.listeners.clear();
  }

  public render(): UIElement {
    const testId = this.props.testID ?? 'monitoring-screen';
    const state = this.state.sessionState;
    const isCooldown = state === 'COOLDOWN';
    const isAlert = state === 'TRIGGERED' || state === 'AWAITING_DECISION';
    const isMonitoring = state === 'MONITORING';

    const statusTone: PulseIndicatorTone = isCooldown
      ? 'cooldown'
      : isAlert
      ? 'warning'
      : isMonitoring
      ? 'active'
      : 'idle';

    const statusLabel = isMonitoring
      ? 'MONITORANDO'
      : isCooldown
      ? 'COOLDOWN'
      : state === 'STARTING'
      ? 'INICIANDO'
      : state === 'AWAITING_DECISION'
      ? 'FLAGRA DETECTADO'
      : state === 'STOPPING'
      ? 'ENCERRANDO'
      : 'OCIOSO';

    const badgeBorder = statusTone === 'active' ? '#14B8A6' : isCooldown ? '#3B82F6' : '#27272A';
    const badgeColor = statusTone === 'active' ? '#2DD4BF' : isCooldown ? '#93C5FD' : '#A1A1AA';

    const header = createUIElement(
      'View',
      { testID: `${testId}-header`, style: { paddingHorizontal: 24, paddingTop: 36, paddingBottom: 16, alignItems: 'center' } },
      createUIElement(
        'Text',
        { testID: `${testId}-header-app-name`, style: { color: '#52525B', fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' } },
        'facial-tension-observer • caradecu'
      ),
      createUIElement(
        'View',
        { testID: `${testId}-status-badge`, style: { marginTop: 10, paddingVertical: 5, paddingHorizontal: 14, borderRadius: 999, backgroundColor: 'rgba(24, 24, 27, 0.85)', borderWidth: 1, borderColor: badgeBorder } },
        createUIElement(
          'Text',
          { testID: `${testId}-status-text`, style: { color: badgeColor, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 } },
          statusLabel
        )
      )
    );

    const pulse = PulseIndicator({
      testID: `${testId}-pulse-indicator`,
      tone: statusTone,
      size: 'large',
      pulseLevel: this.state.currentInstantScore,
      label: statusLabel,
    });

    const timer = createUIElement(
      'Text',
      {
        testID: `${testId}-timer`,
        accessibilityLabel: `Duração da sessão: ${this.state.elapsedSeconds} segundos`,
        style: { color: '#FFFFFF', fontSize: 54, fontWeight: '900', letterSpacing: 3, marginTop: 20, fontVariant: ['tabular-nums'] },
      },
      formatElapsedDuration(this.state.elapsedSeconds)
    );

    const reassuranceText = createUIElement(
      'Text',
      {
        testID: `${testId}-reassurance-text`,
        style: { color: '#71717A', fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 12, paddingHorizontal: 32 },
      },
      'Câmera ativa sem espelho ao vivo. Inferência on-device e privada.'
    );

    const centerContainer = createUIElement(
      'View',
      { testID: `${testId}-center-container`, style: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24 } },
      pulse,
      timer,
      reassuranceText
    );

    const stopButton = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-stop-button`,
        accessibilityLabel: 'Parar Monitoramento',
        onPress: () => { void this.handleStopMonitoring(); },
        style: {
          backgroundColor: '#18181B',
          borderColor: '#EF4444',
          borderWidth: 1.5,
          borderRadius: 16,
          paddingVertical: 18,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: 24,
          marginBottom: 32,
        },
      },
      createUIElement(
        'Text',
        { style: { color: '#F87171', fontSize: 15, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' } },
        'Parar Monitoramento'
      )
    );

    return createUIElement(
      'View',
      { testID: testId, style: { flex: 1, backgroundColor: '#000000', justifyContent: 'space-between' } },
      header,
      centerContainer,
      createUIElement('View', { testID: `${testId}-footer` }, stopButton)
    );
  }
}

export function MonitoringScreen(props: MonitoringScreenProps): MonitoringScreenController {
  return new MonitoringScreenController(props);
}

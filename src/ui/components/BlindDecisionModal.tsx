import { UIElement, createUIElement } from './MetricCard';
import { HapticsService } from '../../services/feedback/haptics_service';
import { SessionManager } from '../../services/session/session_manager';

export interface BlindDecisionModalProps {
  readonly visible: boolean;
  readonly tensionScore: number;
  readonly heldDurationSeconds: number;
  readonly sessionManager?: SessionManager;
  readonly hapticsService?: HapticsService;
  readonly onDecision?: (decision: 'kept' | 'deleted_blind') => void | Promise<void>;
  readonly onDismiss?: () => void;
  readonly onError?: (error: Error) => void;
  readonly autoTriggerHaptics?: boolean;
  readonly testID?: string;
}

export interface BlindDecisionModalState {
  readonly isResolving: boolean;
  readonly selectedDecision: 'kept' | 'deleted_blind' | null;
  readonly error: string | null;
}

export function formatRigidityPercentage(score: number): string {
  const clamped = Math.max(0, Math.min(1, score));
  return `${Math.round(clamped * 100)}%`;
}

export function formatHeldDuration(seconds: number): string {
  const safe = Math.max(0, seconds);
  return `${safe.toFixed(1)} segundos`;
}

export class BlindDecisionModalController {
  private state: BlindDecisionModalState = {
    isResolving: false,
    selectedDecision: null,
    error: null,
  };

  private readonly listeners = new Set<(state: BlindDecisionModalState) => void>();

  constructor(private readonly props: BlindDecisionModalProps) {
    if (props.visible && props.autoTriggerHaptics !== false) {
      void this.triggerHaptics();
    }
  }

  public getState(): BlindDecisionModalState {
    return this.state;
  }

  public subscribe(listener: (state: BlindDecisionModalState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<BlindDecisionModalState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  public async triggerHaptics(): Promise<void> {
    if (this.props.hapticsService) {
      try {
        await this.props.hapticsService.triggerHeavyImpact();
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        if (this.props.onError) this.props.onError(error);
      }
    }
  }

  public async handleDecision(decision: 'kept' | 'deleted_blind'): Promise<void> {
    if (this.state.isResolving) return;
    this.updateState({ isResolving: true, selectedDecision: decision, error: null });

    try {
      if (this.props.sessionManager) {
        await this.props.sessionManager.resolveDecision(decision);
      }
      if (this.props.onDecision) {
        await this.props.onDecision(decision);
      }
      this.updateState({ isResolving: false });
      if (this.props.onDismiss) {
        this.props.onDismiss();
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.updateState({ isResolving: false, error: error.message });
      if (this.props.onError) this.props.onError(error);
      throw error;
    }
  }

  public render(): UIElement | null {
    if (!this.props.visible) return null;

    const testId = this.props.testID ?? 'blind-decision-modal';
    const rigidity = `Nível de rigidez facial: ${formatRigidityPercentage(this.props.tensionScore)}`;
    const duration = `Expressão mantida por ${formatHeldDuration(this.props.heldDurationSeconds)}`;
    const resolving = this.state.isResolving;

    const badge = createUIElement(
      'View',
      {
        testID: `${testId}-badge`,
        style: {
          paddingVertical: 4,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: '#27272A',
          borderWidth: 1,
          borderColor: '#F59E0B',
          marginBottom: 16,
        },
      },
      createUIElement(
        'Text',
        { style: { color: '#FBBF24', fontSize: 12, fontWeight: '800', letterSpacing: 1.5 } },
        '⚠️ AVISO'
      )
    );

    const title = createUIElement(
      'Text',
      {
        testID: `${testId}-title`,
        style: {
          color: '#FFFFFF',
          fontSize: 22,
          fontWeight: '900',
          textAlign: 'center',
          lineHeight: 28,
          marginBottom: 24,
        },
      },
      '⚠️ Registramos um momento delicado.'
    );

    const telemetryBox = createUIElement(
      'View',
      {
        testID: `${testId}-telemetry-box`,
        style: {
          backgroundColor: '#121214',
          borderColor: '#27272A',
          borderWidth: 1,
          borderRadius: 16,
          paddingVertical: 18,
          paddingHorizontal: 24,
          width: '100%',
          maxWidth: 380,
          marginBottom: 32,
          alignItems: 'center',
        },
      },
      createUIElement(
        'Text',
        { testID: `${testId}-rigidity-score`, style: { color: '#FBBF24', fontSize: 16, fontWeight: '700', marginBottom: 8 } },
        rigidity
      ),
      createUIElement(
        'Text',
        { testID: `${testId}-held-duration`, style: { color: '#A1A1AA', fontSize: 14, fontWeight: '600' } },
        duration
      )
    );

    const deleteBtn = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-delete-button`,
        accessibilityLabel: 'Apagar sem ver',
        onPress: () => { void this.handleDecision('deleted_blind'); },
        style: {
          backgroundColor: '#1C1917',
          borderColor: '#EF4444',
          borderWidth: 1.5,
          borderRadius: 14,
          paddingVertical: 18,
          width: '100%',
          maxWidth: 380,
          alignItems: 'center',
          marginBottom: 14,
          opacity: resolving ? 0.6 : 1,
        },
      },
      createUIElement(
        'Text',
        { style: { color: '#F87171', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 } },
        '[ 🗑️ Apagar sem ver ]'
      )
    );

    const keepBtn = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-keep-button`,
        accessibilityLabel: 'Manter',
        onPress: () => { void this.handleDecision('kept'); },
        style: {
          backgroundColor: '#064E3B',
          borderColor: '#10B981',
          borderWidth: 1.5,
          borderRadius: 14,
          paddingVertical: 18,
          width: '100%',
          maxWidth: 380,
          alignItems: 'center',
          marginBottom: 20,
          opacity: resolving ? 0.6 : 1,
        },
      },
      createUIElement(
        'Text',
        { style: { color: '#34D399', fontSize: 16, fontWeight: '800', letterSpacing: 0.8 } },
        '[ 💾 Manter ]'
      )
    );

    const consequence = createUIElement(
      'Text',
      {
        testID: `${testId}-consequence-notice`,
        style: { color: '#71717A', fontSize: 13, fontStyle: 'italic', textAlign: 'center', lineHeight: 18 },
      },
      '(Se apagar agora, a imagem nunca existirá)'
    );

    const content = createUIElement(
      'View',
      {
        testID: `${testId}-content-container`,
        style: { alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: 420, paddingHorizontal: 16 },
      },
      badge,
      title,
      telemetryBox,
      deleteBtn,
      keepBtn,
      consequence
    );

    return createUIElement(
      'View',
      {
        testID: testId,
        accessibilityRole: 'alert',
        accessibilityLabel: '⚠️ Registramos um momento delicado.',
        style: {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          backgroundColor: '#000000',
          opacity: 1,
          zIndex: 9999,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
        },
      },
      content
    );
  }
}

export function BlindDecisionModal(props: BlindDecisionModalProps): UIElement | null {
  const controller = new BlindDecisionModalController(props);
  return controller.render();
}

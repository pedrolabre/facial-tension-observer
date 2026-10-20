import {
  BlindDecisionModal,
  BlindDecisionModalController,
  BlindDecisionModalProps,
  formatHeldDuration,
  formatRigidityPercentage,
} from '../../src/ui/components/BlindDecisionModal';
import {
  HapticsService,
  MockHapticsAdapter,
} from '../../src/services/feedback/haptics_service';
import { UIElement } from '../../src/ui/components/MetricCard';
import { findUIElementByTestId, extractUIElementText } from '../../src/ui/screens/HomeScreen';
import { SessionManager } from '../../src/services/session/session_manager';

class FakeSessionManagerForModal {
  public resolvedDecisions: Array<'kept' | 'deleted_blind'> = [];
  public shouldFailResolve = false;

  async resolveDecision(decision: 'kept' | 'deleted_blind'): Promise<void> {
    if (this.shouldFailResolve) {
      throw new Error('Database transaction failed on decision resolution');
    }
    this.resolvedDecisions.push(decision);
  }
}

function auditTreeNoMirrorNoPreview(element: UIElement): void {
  const forbiddenTypes = ['image', 'fastimage', 'video', 'camera', 'preview', 'canvas'];
  const lowerType = element.type.toLowerCase();

  expect(forbiddenTypes).not.toContain(lowerType);

  const forbiddenPropKeys = ['uri', 'source', 'src', 'bitmap', 'base64', 'photobytes'];
  for (const key of Object.keys(element.props)) {
    expect(forbiddenPropKeys).not.toContain(key.toLowerCase());
  }

  const children = element.props.children;
  if (children && Array.isArray(children)) {
    for (const child of children) {
      if (child && typeof child === 'object' && 'type' in child) {
        auditTreeNoMirrorNoPreview(child as UIElement);
      }
    }
  }
}

describe('BlindDecisionModal and HapticsService (Stage 4 - Block 4.3)', () => {
  describe('HapticsService and MockHapticsAdapter', () => {
    it('uses MockHapticsAdapter by default and records calls', async () => {
      const service = new HapticsService();
      expect(service.getAdapter()).toBeInstanceOf(MockHapticsAdapter);

      await service.triggerHeavyImpact();
      await service.triggerWarning();
      await service.triggerPattern('light');

      const mock = service.getAdapter() as MockHapticsAdapter;
      expect(mock.callHistory).toEqual(['heavy', 'warning', 'light']);

      mock.clear();
      expect(mock.callHistory).toEqual([]);
    });

    it('accepts a custom adapter implementation', async () => {
      const customHistory: string[] = [];
      const customAdapter = {
        vibrateImpact: (p = 'heavy') => {
          customHistory.push(p);
        },
      };

      const service = new HapticsService(customAdapter);
      await service.triggerHeavyImpact();
      expect(customHistory).toEqual(['heavy']);
    });
  });

  describe('Telemetry formatting helpers', () => {
    it('formats rigidity percentages properly and clamps bounds', () => {
      expect(formatRigidityPercentage(0.88)).toBe('88%');
      expect(formatRigidityPercentage(0.856)).toBe('86%');
      expect(formatRigidityPercentage(0)).toBe('0%');
      expect(formatRigidityPercentage(1)).toBe('100%');
      expect(formatRigidityPercentage(-0.2)).toBe('0%');
      expect(formatRigidityPercentage(1.5)).toBe('100%');
    });

    it('formats held duration in seconds with 1 decimal place', () => {
      expect(formatHeldDuration(3.4)).toBe('3.4 segundos');
      expect(formatHeldDuration(3)).toBe('3.0 segundos');
      expect(formatHeldDuration(0)).toBe('0.0 segundos');
      expect(formatHeldDuration(-1.5)).toBe('0.0 segundos');
    });
  });

  describe('BlindDecisionModal rendering', () => {
    it('returns null when visible is false', () => {
      const tree = BlindDecisionModal({
        visible: false,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
      });

      expect(tree).toBeNull();
    });

    it('renders modal blocking overlay with solid black background (#000000)', () => {
      const tree = BlindDecisionModal({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
      });

      expect(tree).not.toBeNull();
      expect(tree?.props.style?.backgroundColor).toBe('#000000');
      expect(tree?.props.style?.opacity).toBe(1);
      expect(tree?.props.style?.position).toBe('absolute');
      expect(tree?.props.testID).toBe('blind-decision-modal');
    });

    it('displays warning badge, impact title, and confrontational telemetry', () => {
      const tree = BlindDecisionModal({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
      })!;

      const badge = findUIElementByTestId(tree, 'blind-decision-modal-badge');
      expect(badge).not.toBeNull();
      expect(extractUIElementText(badge!)).toContain('⚠️ AVISO');

      const title = findUIElementByTestId(tree, 'blind-decision-modal-title');
      expect(title).not.toBeNull();
      expect(extractUIElementText(title!)).toBe('⚠️ Registramos um momento delicado.');

      const rigidity = findUIElementByTestId(tree, 'blind-decision-modal-rigidity-score');
      expect(rigidity).not.toBeNull();
      expect(extractUIElementText(rigidity!)).toBe('Nível de rigidez facial: 88%');

      const held = findUIElementByTestId(tree, 'blind-decision-modal-held-duration');
      expect(held).not.toBeNull();
      expect(extractUIElementText(held!)).toBe('Expressão mantida por 3.4 segundos');
    });

    it('renders both binary decision buttons and consequence notice', () => {
      const tree = BlindDecisionModal({
        visible: true,
        tensionScore: 0.85,
        heldDurationSeconds: 3.2,
      })!;

      const deleteBtn = findUIElementByTestId(tree, 'blind-decision-modal-delete-button');
      expect(deleteBtn).not.toBeNull();
      expect(extractUIElementText(deleteBtn!)).toBe('[ 🗑️ Apagar sem ver ]');

      const keepBtn = findUIElementByTestId(tree, 'blind-decision-modal-keep-button');
      expect(keepBtn).not.toBeNull();
      expect(extractUIElementText(keepBtn!)).toBe('[ 💾 Manter ]');

      const notice = findUIElementByTestId(tree, 'blind-decision-modal-consequence-notice');
      expect(notice).not.toBeNull();
      expect(extractUIElementText(notice!)).toBe('(Se apagar agora, a imagem nunca existirá)');
    });

    it('strictly satisfies No Mirror & No Preview Policy by having zero image or preview elements in tree', () => {
      const tree = BlindDecisionModal({
        visible: true,
        tensionScore: 0.92,
        heldDurationSeconds: 4.1,
      })!;

      auditTreeNoMirrorNoPreview(tree);
    });
  });

  describe('Haptic feedback triggering', () => {
    it('triggers heavy impact haptics automatically on display when service is provided', async () => {
      const mockAdapter = new MockHapticsAdapter();
      const hapticsService = new HapticsService(mockAdapter);

      BlindDecisionModal({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        hapticsService,
        autoTriggerHaptics: true,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockAdapter.callHistory).toContain('heavy');
    });

    it('does not trigger haptics automatically if autoTriggerHaptics is false', async () => {
      const mockAdapter = new MockHapticsAdapter();
      const hapticsService = new HapticsService(mockAdapter);

      BlindDecisionModal({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        hapticsService,
        autoTriggerHaptics: false,
      });

      await new Promise((r) => setTimeout(r, 10));
      expect(mockAdapter.callHistory).toEqual([]);
    });

    it('forwards haptic failures to onError without crashing', async () => {
      const failingAdapter = {
        vibrateImpact: () => {
          throw new Error('Hardware vibrator unavailable');
        },
      };
      const hapticsService = new HapticsService(failingAdapter);
      const errors: Error[] = [];

      const controller = new BlindDecisionModalController({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        hapticsService,
        autoTriggerHaptics: false,
        onError: (err) => errors.push(err),
      });

      await controller.triggerHaptics();
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain('Hardware vibrator unavailable');
    });
  });

  describe('Decision interactions and SessionManager integration', () => {
    it('handles "deleted_blind" action through button click and SessionManager', async () => {
      const fakeSessionManager = new FakeSessionManagerForModal();
      let dismissed = false;
      let recordedDecision: string | null = null;

      const props: BlindDecisionModalProps = {
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        sessionManager: fakeSessionManager as unknown as SessionManager,
        onDecision: (d) => {
          recordedDecision = d;
        },
        onDismiss: () => {
          dismissed = true;
        },
      };

      const controller = new BlindDecisionModalController(props);
      const tree = controller.render()!;

      const deleteBtn = findUIElementByTestId(tree, 'blind-decision-modal-delete-button')!;
      expect(deleteBtn.props.onPress).toBeDefined();

      await controller.handleDecision('deleted_blind');

      expect(fakeSessionManager.resolvedDecisions).toEqual(['deleted_blind']);
      expect(recordedDecision).toBe('deleted_blind');
      expect(dismissed).toBe(true);
      expect(controller.getState().selectedDecision).toBe('deleted_blind');
      expect(controller.getState().isResolving).toBe(false);
    });

    it('handles "kept" action through button click and SessionManager', async () => {
      const fakeSessionManager = new FakeSessionManagerForModal();
      let dismissed = false;
      let recordedDecision: string | null = null;

      const props: BlindDecisionModalProps = {
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        sessionManager: fakeSessionManager as unknown as SessionManager,
        onDecision: (d) => {
          recordedDecision = d;
        },
        onDismiss: () => {
          dismissed = true;
        },
      };

      const controller = new BlindDecisionModalController(props);
      await controller.handleDecision('kept');

      expect(fakeSessionManager.resolvedDecisions).toEqual(['kept']);
      expect(recordedDecision).toBe('kept');
      expect(dismissed).toBe(true);
      expect(controller.getState().selectedDecision).toBe('kept');
      expect(controller.getState().isResolving).toBe(false);
    });

    it('prevents multiple concurrent clicks while resolving', async () => {
      let resolveCallCount = 0;
      const slowSessionManager = {
        resolveDecision: async () => {
          resolveCallCount++;
          await new Promise((r) => setTimeout(r, 50));
        },
      };

      const controller = new BlindDecisionModalController({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        sessionManager: slowSessionManager as unknown as SessionManager,
      });

      const p1 = controller.handleDecision('deleted_blind');
      const p2 = controller.handleDecision('kept');

      await Promise.all([p1, p2]);
      expect(resolveCallCount).toBe(1);
    });

    it('captures errors during decision resolution and notifies onError', async () => {
      const fakeSessionManager = new FakeSessionManagerForModal();
      fakeSessionManager.shouldFailResolve = true;

      const errors: Error[] = [];
      const controller = new BlindDecisionModalController({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
        sessionManager: fakeSessionManager as unknown as SessionManager,
        onError: (err) => errors.push(err),
      });

      await expect(controller.handleDecision('deleted_blind')).rejects.toThrow(
        'Database transaction failed on decision resolution'
      );

      expect(errors).toHaveLength(1);
      expect(controller.getState().error).toContain('Database transaction failed');
      expect(controller.getState().isResolving).toBe(false);
    });

    it('supports subscription listeners for state changes', async () => {
      const controller = new BlindDecisionModalController({
        visible: true,
        tensionScore: 0.88,
        heldDurationSeconds: 3.4,
      });

      const stateHistory: boolean[] = [];
      const unsubscribe = controller.subscribe((s) => {
        stateHistory.push(s.isResolving);
      });

      await controller.handleDecision('kept');
      unsubscribe();

      await controller.handleDecision('deleted_blind');

      expect(stateHistory).toContain(true);
      expect(stateHistory).toContain(false);
    });
  });
});

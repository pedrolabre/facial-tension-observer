import { DatabaseClient } from '../../services/db/client';
import { TensionCaptureRecord } from '../../services/db/schema';
import { UIElement, createUIElement } from '../components/MetricCard';
import { VaultCard } from '../components/VaultCard';

export interface VaultScreenProps {
  readonly dbClient?: DatabaseClient;
  readonly fetchCaptures?: () => Promise<readonly TensionCaptureRecord[]>;
  readonly onBack?: () => void;
  readonly onSelectCapture?: (capture: TensionCaptureRecord) => void;
  readonly testID?: string;
  readonly autoLoad?: boolean;
}

export interface VaultScreenState {
  readonly isLoading: boolean;
  readonly captures: readonly TensionCaptureRecord[];
  readonly error: string | null;
}

export const VAULT_EMPTY_MESSAGE =
  'Nenhuma cara feia guardada até o momento. Ou você apagou tudo ou tem um autocontrole de ferro.';

const SELECT_KEPT_CAPTURES_QUERY =
  "SELECT id, session_id, created_at, tension_score, brow_furrow_score, lip_compression_score, jaw_rigidity_score, held_duration_seconds, file_path, user_decision, is_revealed, revealed_at, applied_quote FROM tension_captures WHERE user_decision = 'kept' ORDER BY created_at DESC;";

export class VaultScreenController {
  private state: VaultScreenState = {
    isLoading: true,
    captures: [],
    error: null,
  };

  private readonly listeners = new Set<(state: VaultScreenState) => void>();

  constructor(private readonly props: VaultScreenProps) {
    if (props.autoLoad !== false) {
      void this.loadCaptures();
    }
  }

  public getState(): VaultScreenState {
    return this.state;
  }

  public subscribe(listener: (state: VaultScreenState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<VaultScreenState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public async loadCaptures(): Promise<readonly TensionCaptureRecord[]> {
    this.updateState({ isLoading: true, error: null });
    try {
      let captures: readonly TensionCaptureRecord[] = [];
      if (this.props.fetchCaptures) {
        captures = await this.props.fetchCaptures();
      } else if (this.props.dbClient) {
        captures = await this.props.dbClient.all<TensionCaptureRecord>(SELECT_KEPT_CAPTURES_QUERY);
      }
      this.updateState({ isLoading: false, captures, error: null });
      return captures;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.updateState({ isLoading: false, error: errorMessage });
      throw err;
    }
  }

  public async refresh(): Promise<readonly TensionCaptureRecord[]> {
    return this.loadCaptures();
  }

  public handleBack(): void {
    if (this.props.onBack) {
      this.props.onBack();
    }
  }

  public handleSelectCapture(capture: TensionCaptureRecord): void {
    if (this.props.onSelectCapture) {
      this.props.onSelectCapture(capture);
    }
  }

  public render(): UIElement {
    const testId = this.props.testID ?? 'vault-screen';
    const totalCount = this.state.captures.length;
    const countLabel =
      totalCount === 1 ? '1 flagra guardado' : `${totalCount} flagras guardados`;

    const backButton = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-back-button`,
        accessibilityLabel: 'Voltar para a tela inicial',
        onPress: () => this.handleBack(),
        style: {
          paddingVertical: 8,
          paddingHorizontal: 4,
          alignSelf: 'flex-start',
        },
      },
      createUIElement(
        'Text',
        {
          style: {
            color: '#A1A1AA',
            fontSize: 14,
            fontWeight: '600',
          },
        },
        '← Voltar'
      )
    );

    const vaultTitle = createUIElement(
      'Text',
      {
        testID: `${testId}-title`,
        style: {
          color: '#FFFFFF',
          fontSize: 28,
          fontWeight: '900',
          letterSpacing: -0.5,
          marginTop: 8,
        },
      },
      'Cofre Privado'
    );

    const counterSubtitle = createUIElement(
      'Text',
      {
        testID: `${testId}-counter`,
        style: {
          color: '#71717A',
          fontSize: 13,
          fontWeight: '500',
          marginTop: 2,
        },
      },
      countLabel
    );

    const headerContainer = createUIElement(
      'View',
      {
        testID: `${testId}-header`,
        style: {
          paddingHorizontal: 20,
          paddingTop: 24,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: '#18181B',
        },
      },
      backButton,
      vaultTitle,
      counterSubtitle
    );

    let bodyContent: UIElement;

    if (this.state.isLoading) {
      bodyContent = createUIElement(
        'View',
        {
          testID: `${testId}-loading-indicator`,
          style: {
            padding: 40,
            alignItems: 'center',
            justifyContent: 'center',
          },
        },
        createUIElement(
          'Text',
          {
            testID: `${testId}-loading-text`,
            style: { color: '#71717A', fontSize: 13 },
          },
          'Abrindo cofre de flagras...'
        )
      );
    } else if (this.state.error) {
      bodyContent = createUIElement(
        'View',
        {
          testID: `${testId}-error-container`,
          style: {
            padding: 24,
            backgroundColor: '#1C1917',
            borderColor: '#EF4444',
            borderWidth: 1,
            borderRadius: 12,
            margin: 20,
          },
        },
        createUIElement(
          'Text',
          {
            testID: `${testId}-error-message`,
            style: { color: '#F87171', fontSize: 13, fontWeight: '600' },
          },
          `Falha ao acessar registros do cofre: ${this.state.error}`
        )
      );
    } else if (totalCount === 0) {
      bodyContent = createUIElement(
        'View',
        {
          testID: `${testId}-empty-state`,
          style: {
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 32,
            paddingVertical: 64,
          },
        },
        createUIElement(
          'Text',
          {
            testID: `${testId}-empty-icon`,
            style: {
              fontSize: 48,
              marginBottom: 16,
              textAlign: 'center',
            },
          },
          '🛡️'
        ),
        createUIElement(
          'Text',
          {
            testID: `${testId}-empty-message`,
            style: {
              color: '#A1A1AA',
              fontSize: 14,
              fontStyle: 'italic',
              textAlign: 'center',
              lineHeight: 22,
            },
          },
          VAULT_EMPTY_MESSAGE
        )
      );
    } else {
      const cardElements = this.state.captures.map((capture) =>
        VaultCard({
          capture,
          testID: `${testId}-card-${capture.id}`,
          onPress: (c) => this.handleSelectCapture(c),
        })
      );

      bodyContent = createUIElement(
        'ScrollView',
        {
          testID: `${testId}-grid`,
          style: {
            flex: 1,
            paddingHorizontal: 20,
            paddingVertical: 12,
          },
        },
        ...cardElements
      );
    }

    return createUIElement(
      'View',
      {
        testID: testId,
        style: {
          flex: 1,
          backgroundColor: '#000000',
        },
      },
      headerContainer,
      bodyContent
    );
  }
}

export function VaultScreen(props: VaultScreenProps): VaultScreenController {
  return new VaultScreenController(props);
}

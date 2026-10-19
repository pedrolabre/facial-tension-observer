import { ISessionRepository, GlobalStats } from '../../services/db/session_repository';
import { MetricCard, UIElement, createUIElement } from '../components/MetricCard';

export interface HomeScreenProps {
  readonly sessionRepository: ISessionRepository;
  readonly onStartMonitoring?: () => void;
  readonly onOpenVault?: () => void;
  readonly testID?: string;
  readonly autoLoad?: boolean;
}

export interface HomeScreenState {
  readonly isLoading: boolean;
  readonly stats: GlobalStats;
  readonly error: string | null;
}

const INITIAL_STATS: GlobalStats = {
  totalSessions: 0,
  totalDurationSeconds: 0,
  totalTriggers: 0,
  totalKept: 0,
  totalDeletedBlind: 0,
};

export class HomeScreenController {
  private state: HomeScreenState = {
    isLoading: true,
    stats: INITIAL_STATS,
    error: null,
  };

  private readonly listeners = new Set<(state: HomeScreenState) => void>();

  constructor(private readonly props: HomeScreenProps) {
    if (props.autoLoad !== false) {
      void this.loadStats();
    }
  }

  public getState(): HomeScreenState {
    return this.state;
  }

  public subscribe(listener: (state: HomeScreenState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<HomeScreenState>): void {
    this.state = {
      ...this.state,
      ...partial,
    };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  public async loadStats(): Promise<GlobalStats> {
    this.updateState({ isLoading: true, error: null });
    try {
      const stats = await this.props.sessionRepository.getGlobalStats();
      this.updateState({ isLoading: false, stats, error: null });
      return stats;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.updateState({ isLoading: false, error: errorMessage });
      throw err;
    }
  }

  public async refresh(): Promise<GlobalStats> {
    return this.loadStats();
  }

  public handleStartMonitoring(): void {
    if (this.props.onStartMonitoring) {
      this.props.onStartMonitoring();
    }
  }

  public handleOpenVault(): void {
    if (this.props.onOpenVault) {
      this.props.onOpenVault();
    }
  }

  public render(): UIElement {
    const testId = this.props.testID ?? 'home-screen';

    const headerProductTitle = createUIElement(
      'Text',
      {
        testID: `${testId}-header-app-name`,
        style: {
          color: '#71717A',
          fontSize: 12,
          fontWeight: '700',
          letterSpacing: 2,
          textTransform: 'uppercase',
        },
      },
      'facial-tension-observer'
    );

    const headerCodename = createUIElement(
      'Text',
      {
        testID: `${testId}-header-codename`,
        style: {
          color: '#FFFFFF',
          fontSize: 32,
          fontWeight: '900',
          letterSpacing: -0.5,
          marginVertical: 2,
        },
      },
      'caradecu'
    );

    const headerTagline = createUIElement(
      'Text',
      {
        testID: `${testId}-header-tagline`,
        style: {
          color: '#A1A1AA',
          fontSize: 13,
          fontStyle: 'italic',
          lineHeight: 18,
        },
      },
      'Registros involuntários de momentos delicados.'
    );

    const headerContainer = createUIElement(
      'View',
      {
        testID: `${testId}-header`,
        style: {
          paddingHorizontal: 20,
          paddingTop: 32,
          paddingBottom: 24,
          borderBottomWidth: 1,
          borderBottomColor: '#18181B',
        },
      },
      headerProductTitle,
      headerCodename,
      headerTagline
    );

    let metricsContent: UIElement;

    if (this.state.isLoading) {
      metricsContent = createUIElement(
        'View',
        {
          testID: `${testId}-loading-indicator`,
          style: {
            padding: 32,
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
          'Carregando telemetria...'
        )
      );
    } else if (this.state.error) {
      metricsContent = createUIElement(
        'View',
        {
          testID: `${testId}-error-container`,
          style: {
            padding: 24,
            backgroundColor: '#1C1917',
            borderColor: '#EF4444',
            borderWidth: 1,
            borderRadius: 12,
            marginVertical: 12,
          },
        },
        createUIElement(
          'Text',
          {
            testID: `${testId}-error-message`,
            style: { color: '#F87171', fontSize: 13, fontWeight: '600' },
          },
          `Falha ao sincronizar estatísticas: ${this.state.error}`
        )
      );
    } else {
      const sessionsCard = MetricCard({
        id: 'sessions',
        title: 'Sessões Monitoradas',
        value: this.state.stats.totalSessions,
        subtitle: 'Momentos em que você jurava que estava calmo.',
        tone: 'neutral',
        testID: `${testId}-card-sessions`,
      });

      const keptCard = MetricCard({
        id: 'kept',
        title: 'Flagras Mantidos',
        value: this.state.stats.totalKept,
        subtitle: 'Guardados para a posteridade no cofre privado.',
        tone: 'accent',
        testID: `${testId}-card-kept`,
      });

      const deletedCard = MetricCard({
        id: 'deleted',
        title: 'Destruídos no Escuro',
        value: this.state.stats.totalDeletedBlind,
        subtitle: 'Pulverizados sem deixar rastro nem testemunha.',
        tone: 'destructive',
        testID: `${testId}-card-deleted`,
      });

      metricsContent = createUIElement(
        'View',
        {
          testID: `${testId}-metrics-grid`,
          style: {
            paddingHorizontal: 20,
            paddingVertical: 12,
          },
        },
        sessionsCard,
        keptCard,
        deletedCard
      );
    }

    const actionButton = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-start-monitoring-button`,
        accessibilityLabel: 'Monitorar Minha Cara',
        onPress: () => this.handleStartMonitoring(),
        style: {
          backgroundColor: '#FAFAFA',
          borderRadius: 16,
          paddingVertical: 18,
          paddingHorizontal: 24,
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: 20,
          marginTop: 16,
          shadowColor: '#FFFFFF',
          shadowOpacity: 0.1,
          shadowRadius: 10,
        },
      },
      createUIElement(
        'Text',
        {
          style: {
            color: '#09090B',
            fontSize: 16,
            fontWeight: '800',
            letterSpacing: 0.5,
            textTransform: 'uppercase',
          },
        },
        'Monitorar Minha Cara'
      )
    );

    const vaultShortcut = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-open-vault-shortcut`,
        accessibilityLabel: 'Acessar Cofre Privado',
        onPress: () => this.handleOpenVault(),
        style: {
          paddingVertical: 14,
          alignItems: 'center',
          justifyContent: 'center',
          marginHorizontal: 20,
          marginTop: 8,
          marginBottom: 24,
        },
      },
      createUIElement(
        'Text',
        {
          style: {
            color: '#A1A1AA',
            fontSize: 13,
            fontWeight: '600',
            textDecorationLine: 'underline',
          },
        },
        'Acessar Cofre Privado'
      )
    );

    return createUIElement(
      'View',
      {
        testID: testId,
        style: {
          flex: 1,
          backgroundColor: '#000000',
          justifyContent: 'space-between',
        },
      },
      headerContainer,
      metricsContent,
      createUIElement('View', { testID: `${testId}-footer-actions` }, actionButton, vaultShortcut)
    );
  }
}

export function HomeScreen(props: HomeScreenProps): HomeScreenController {
  return new HomeScreenController(props);
}

export function findUIElementByTestId(root: UIElement, testId: string): UIElement | null {
  if (root.props.testID === testId) {
    return root;
  }
  const children = root.props.children;
  if (!children || !Array.isArray(children)) {
    return null;
  }
  for (const child of children) {
    if (child && typeof child === 'object' && 'type' in child) {
      const match = findUIElementByTestId(child as UIElement, testId);
      if (match) {
        return match;
      }
    }
  }
  return null;
}

export function extractUIElementText(element: UIElement): string {
  const children = element.props.children;
  if (!children || !Array.isArray(children)) {
    return '';
  }
  return children
    .map((child) => {
      if (child === null || child === undefined) {
        return '';
      }
      if (typeof child === 'string' || typeof child === 'number') {
        return String(child);
      }
      return extractUIElementText(child as UIElement);
    })
    .join('');
}

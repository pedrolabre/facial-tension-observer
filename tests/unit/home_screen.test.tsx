import { ISessionRepository, GlobalStats } from '../../src/services/db/session_repository';
import { MetricCard } from '../../src/ui/components/MetricCard';
import {
  HomeScreen,
  HomeScreenController,
  findUIElementByTestId,
  extractUIElementText,
} from '../../src/ui/screens/HomeScreen';

class MockSessionRepository implements ISessionRepository {
  public stats: GlobalStats = {
    totalSessions: 0,
    totalDurationSeconds: 0,
    totalTriggers: 0,
    totalKept: 0,
    totalDeletedBlind: 0,
  };

  public shouldFail = false;
  public failureMessage = 'Database connection lost';

  async createSession(): Promise<never> {
    throw new Error('Not implemented in mock');
  }

  async incrementTriggerCount(): Promise<void> {}
  async incrementKeptCount(): Promise<void> {}
  async incrementDeletedCount(): Promise<void> {}
  async endSession(): Promise<void> {}
  async getSessionById(): Promise<null> {
    return null;
  }

  async getGlobalStats(): Promise<GlobalStats> {
    if (this.shouldFail) {
      throw new Error(this.failureMessage);
    }
    return { ...this.stats };
  }

  async getSessionStats(): Promise<GlobalStats> {
    return this.getGlobalStats();
  }
}

describe('MetricCard Component', () => {
  it('renders title, value and subtitle accurately', () => {
    const card = MetricCard({
      id: 'test',
      title: 'Sessões Monitoradas',
      value: 42,
      subtitle: 'Momentos em que você jurava que estava calmo.',
    });

    expect(card.type).toBe('View');
    expect(card.props.testID).toBe('metric-card-test');

    const titleEl = findUIElementByTestId(card, 'metric-card-test-title');
    expect(titleEl).not.toBeNull();
    expect(extractUIElementText(titleEl!)).toBe('Sessões Monitoradas');

    const valueEl = findUIElementByTestId(card, 'metric-card-test-value');
    expect(valueEl).not.toBeNull();
    expect(extractUIElementText(valueEl!)).toBe('42');

    const subtitleEl = findUIElementByTestId(card, 'metric-card-test-subtitle');
    expect(subtitleEl).not.toBeNull();
    expect(extractUIElementText(subtitleEl!)).toBe('Momentos em que você jurava que estava calmo.');
  });

  it('supports string values, zero values, and custom testID', () => {
    const card = MetricCard({
      title: 'Taxa de Retenção',
      value: '0%',
      subtitle: 'Nenhum flagra foi digno de preservação.',
      testID: 'custom-card-testid',
    });

    expect(card.props.testID).toBe('custom-card-testid');
    const valueEl = findUIElementByTestId(card, 'custom-card-testid-value');
    expect(extractUIElementText(valueEl!)).toBe('0%');
  });

  it('applies distinct visual tone variations', () => {
    const neutralCard = MetricCard({ title: 'A', value: 1, subtitle: 'S', tone: 'neutral' });
    const accentCard = MetricCard({ title: 'B', value: 2, subtitle: 'S', tone: 'accent' });
    const warningCard = MetricCard({ title: 'C', value: 3, subtitle: 'S', tone: 'warning' });
    const destructiveCard = MetricCard({ title: 'D', value: 4, subtitle: 'S', tone: 'destructive' });

    expect((neutralCard.props.style as Record<string, unknown>).borderColor).toBe('#27272A');
    expect((accentCard.props.style as Record<string, unknown>).borderColor).toBe('#3B82F6');
    expect((warningCard.props.style as Record<string, unknown>).borderColor).toBe('#F59E0B');
    expect((destructiveCard.props.style as Record<string, unknown>).borderColor).toBe('#EF4444');
  });

  it('handles onPress callback and accessibility label', () => {
    let pressed = false;
    const card = MetricCard({
      title: 'Flagras',
      value: 10,
      subtitle: 'Toque para detalhes',
      onPress: () => {
        pressed = true;
      },
    });

    expect(card.props.accessibilityLabel).toBe('Flagras: 10. Toque para detalhes');
    card.props.onPress?.();
    expect(pressed).toBe(true);
  });
});

describe('HomeScreen & HomeScreenController', () => {
  let mockRepo: MockSessionRepository;

  beforeEach(() => {
    mockRepo = new MockSessionRepository();
  });

  it('renders header elements with product title, codename and tagline', async () => {
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
    });

    const ui = controller.render();
    const appNameEl = findUIElementByTestId(ui, 'home-screen-header-app-name');
    expect(appNameEl).not.toBeNull();
    expect(extractUIElementText(appNameEl!)).toBe('facial-tension-observer');

    const codenameEl = findUIElementByTestId(ui, 'home-screen-header-codename');
    expect(codenameEl).not.toBeNull();
    expect(extractUIElementText(codenameEl!)).toBe('caradecu');

    const taglineEl = findUIElementByTestId(ui, 'home-screen-header-tagline');
    expect(taglineEl).not.toBeNull();
    expect(extractUIElementText(taglineEl!)).toBe('Registros involuntários de momentos delicados.');
  });

  it('displays loading state prior to stats resolution', () => {
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
    });

    const ui = controller.render();
    const loadingEl = findUIElementByTestId(ui, 'home-screen-loading-indicator');
    expect(loadingEl).not.toBeNull();
    const loadingText = findUIElementByTestId(ui, 'home-screen-loading-text');
    expect(extractUIElementText(loadingText!)).toBe('Carregando telemetria...');
  });

  it('loads and renders empty stats (zeros) on fresh database', async () => {
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
    });

    await controller.loadStats();
    const ui = controller.render();

    const sessionsValue = findUIElementByTestId(ui, 'home-screen-card-sessions-value');
    expect(sessionsValue).not.toBeNull();
    expect(extractUIElementText(sessionsValue!)).toBe('0');

    const keptValue = findUIElementByTestId(ui, 'home-screen-card-kept-value');
    expect(keptValue).not.toBeNull();
    expect(extractUIElementText(keptValue!)).toBe('0');

    const deletedValue = findUIElementByTestId(ui, 'home-screen-card-deleted-value');
    expect(deletedValue).not.toBeNull();
    expect(extractUIElementText(deletedValue!)).toBe('0');
  });

  it('loads and renders populated metrics with ironic subtitles', async () => {
    mockRepo.stats = {
      totalSessions: 18,
      totalDurationSeconds: 4320,
      totalTriggers: 25,
      totalKept: 6,
      totalDeletedBlind: 19,
    };

    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: true,
    });

    await controller.loadStats();
    const ui = controller.render();

    const sessionsSubtitle = findUIElementByTestId(ui, 'home-screen-card-sessions-subtitle');
    expect(extractUIElementText(sessionsSubtitle!)).toBe('Momentos em que você jurava que estava calmo.');

    const keptSubtitle = findUIElementByTestId(ui, 'home-screen-card-kept-subtitle');
    expect(extractUIElementText(keptSubtitle!)).toBe('Guardados para a posteridade no cofre privado.');

    const deletedSubtitle = findUIElementByTestId(ui, 'home-screen-card-deleted-subtitle');
    expect(extractUIElementText(deletedSubtitle!)).toBe('Pulverizados sem deixar rastro nem testemunha.');

    expect(extractUIElementText(findUIElementByTestId(ui, 'home-screen-card-sessions-value')!)).toBe('18');
    expect(extractUIElementText(findUIElementByTestId(ui, 'home-screen-card-kept-value')!)).toBe('6');
    expect(extractUIElementText(findUIElementByTestId(ui, 'home-screen-card-deleted-value')!)).toBe('19');
  });

  it('triggers onStartMonitoring callback on action button press', async () => {
    let monitoringTriggered = false;
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
      onStartMonitoring: () => {
        monitoringTriggered = true;
      },
    });

    await controller.loadStats();
    const ui = controller.render();

    const startButton = findUIElementByTestId(ui, 'home-screen-start-monitoring-button');
    expect(startButton).not.toBeNull();
    expect(startButton?.props.accessibilityLabel).toBe('Monitorar Minha Cara');

    startButton?.props.onPress?.();
    expect(monitoringTriggered).toBe(true);
  });

  it('triggers onOpenVault callback on footer shortcut press', async () => {
    let vaultOpened = false;
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
      onOpenVault: () => {
        vaultOpened = true;
      },
    });

    await controller.loadStats();
    const ui = controller.render();

    const vaultShortcut = findUIElementByTestId(ui, 'home-screen-open-vault-shortcut');
    expect(vaultShortcut).not.toBeNull();
    expect(vaultShortcut?.props.accessibilityLabel).toBe('Acessar Cofre Privado');

    vaultShortcut?.props.onPress?.();
    expect(vaultOpened).toBe(true);
  });

  it('handles error state gracefully when repository fails', async () => {
    mockRepo.shouldFail = true;
    mockRepo.failureMessage = 'Disk I/O error';

    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
    });

    await expect(controller.loadStats()).rejects.toThrow('Disk I/O error');

    const ui = controller.render();
    const errorEl = findUIElementByTestId(ui, 'home-screen-error-message');
    expect(errorEl).not.toBeNull();
    expect(extractUIElementText(errorEl!)).toContain('Falha ao sincronizar estatísticas: Disk I/O error');
  });

  it('allows reloading stats via refresh and notifying subscribers', async () => {
    const states: string[] = [];
    const controller = new HomeScreenController({
      sessionRepository: mockRepo,
      autoLoad: false,
    });

    const unsubscribe = controller.subscribe((state) => {
      states.push(state.isLoading ? 'loading' : `done-${state.stats.totalSessions}`);
    });

    await controller.refresh();
    expect(controller.getState().isLoading).toBe(false);

    mockRepo.stats = { ...mockRepo.stats, totalSessions: 5 };
    await controller.refresh();
    expect(controller.getState().stats.totalSessions).toBe(5);

    unsubscribe();
    await controller.refresh();
    expect(states).toEqual(['loading', 'done-0', 'loading', 'done-5']);
  });

  it('functional HomeScreen wrapper instantiates controller accurately', () => {
    const screen = HomeScreen({
      sessionRepository: mockRepo,
      autoLoad: false,
      testID: 'custom-home-screen',
    });

    expect(screen).toBeInstanceOf(HomeScreenController);
    const ui = screen.render();
    expect(ui.props.testID).toBe('custom-home-screen');
  });

  it('findUIElementByTestId and extractUIElementText safely handle missing or empty nodes', () => {
    expect(findUIElementByTestId({ type: 'View', props: {} }, 'nonexistent')).toBeNull();
    expect(extractUIElementText({ type: 'View', props: {} })).toBe('');
  });
});

import { TensionCaptureRecord } from '../../src/services/db/schema';
import { DatabaseClient, DatabaseRunResult } from '../../src/services/db/client';
import {
  VaultCard,
  formatCaptureDate,
  formatRigidityScore,
} from '../../src/ui/components/VaultCard';
import {
  VaultScreen,
  VaultScreenController,
  VAULT_EMPTY_MESSAGE,
} from '../../src/ui/screens/VaultScreen';
import {
  findUIElementByTestId,
  extractUIElementText,
} from '../../src/ui/screens/HomeScreen';
import { UIElement } from '../../src/ui/components/MetricCard';

function containsElementType(root: UIElement, targetType: string): boolean {
  if (root.type.toLowerCase() === targetType.toLowerCase()) {
    return true;
  }
  const children = root.props.children;
  if (!children || !Array.isArray(children)) {
    return false;
  }
  for (const child of children) {
    if (child && typeof child === 'object' && 'type' in child) {
      if (containsElementType(child as UIElement, targetType)) {
        return true;
      }
    }
  }
  return false;
}

const MOCK_VEILED_CAPTURE: TensionCaptureRecord = {
  id: 'cap-1111-2222-3333',
  session_id: 'sess-001',
  created_at: '2026-10-20 14:30:00',
  tension_score: 0.88,
  brow_furrow_score: 0.9,
  lip_compression_score: 0.8,
  jaw_rigidity_score: 0.85,
  held_duration_seconds: 3.4,
  file_path: '/documents/vault/cap-1111.jpg',
  user_decision: 'kept',
  is_revealed: 0,
  revealed_at: null,
  applied_quote: 'Registramos um momento delicado.',
};

const MOCK_REVEALED_CAPTURE: TensionCaptureRecord = {
  id: 'cap-4444-5555-6666',
  session_id: 'sess-002',
  created_at: '2026-10-21 16:45:00',
  tension_score: 0.76,
  brow_furrow_score: 0.8,
  lip_compression_score: 0.7,
  jaw_rigidity_score: 0.75,
  held_duration_seconds: 3.1,
  file_path: '/documents/vault/cap-4444.jpg',
  user_decision: 'kept',
  is_revealed: 1,
  revealed_at: '2026-10-21 17:00:00',
  applied_quote: 'A glabela não mente.',
};

interface ExecutedQuery {
  readonly sql: string;
  readonly params?: readonly unknown[] | undefined;
}

class MockDatabaseClient implements DatabaseClient {
  public executedQueries: ExecutedQuery[] = [];
  public mockCaptures: TensionCaptureRecord[] = [];
  public shouldFail = false;
  public failureError = new Error('Database disk I/O failure');

  async run(sql: string, params?: readonly unknown[]): Promise<DatabaseRunResult> {
    this.executedQueries.push({ sql, params });
    return { changes: 1, lastInsertRowId: 1 };
  }

  async get<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T | undefined> {
    this.executedQueries.push({ sql, params });
    return undefined;
  }

  async all<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]> {
    this.executedQueries.push({ sql, params });
    if (this.shouldFail) {
      throw this.failureError;
    }
    return [...this.mockCaptures] as unknown as T[];
  }

  async exec(sql: string): Promise<void> {
    this.executedQueries.push({ sql });
  }

  async transaction<T>(action: (client: DatabaseClient) => Promise<T>): Promise<T> {
    return action(this);
  }

  async close(): Promise<void> {}
}

describe('VaultCard Component', () => {
  describe('formatCaptureDate helper', () => {
    it('formats SQLite date string with spaces into DD/MM/YYYY HH:mm', () => {
      const formatted = formatCaptureDate('2026-10-20 14:30:00');
      expect(formatted).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
    });

    it('formats ISO 8601 date string with T into DD/MM/YYYY HH:mm', () => {
      const formatted = formatCaptureDate('2026-10-20T14:30:00Z');
      expect(formatted).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
    });

    it('formats numeric timestamp into DD/MM/YYYY HH:mm', () => {
      const ts = new Date('2026-10-20T14:30:00Z').getTime();
      const formatted = formatCaptureDate(ts);
      expect(formatted).toMatch(/\d{2}\/\d{2}\/2026 \d{2}:\d{2}/);
    });

    it('returns raw string fallback when input is invalid date', () => {
      expect(formatCaptureDate('not-a-valid-date')).toBe('not-a-valid-date');
    });
  });

  describe('formatRigidityScore helper', () => {
    it('clamps and formats normal fraction into percentage', () => {
      expect(formatRigidityScore(0.88)).toBe('88%');
      expect(formatRigidityScore(0.754)).toBe('75%');
      expect(formatRigidityScore(0.756)).toBe('76%');
    });

    it('clamps negative numbers to 0% and numbers above 1 to 100%', () => {
      expect(formatRigidityScore(-0.5)).toBe('0%');
      expect(formatRigidityScore(1.5)).toBe('100%');
    });
  });

  describe('Veiled rendering (is_revealed = 0)', () => {
    it('renders mystery marker, date, score and badge [Não revelado]', () => {
      const card = VaultCard({
        capture: MOCK_VEILED_CAPTURE,
        testID: 'test-veiled-card',
      });

      expect(card.type).toBe('TouchableOpacity');
      expect(card.props.testID).toBe('test-veiled-card');

      const badgeEl = findUIElementByTestId(card, 'test-veiled-card-badge-text');
      expect(badgeEl).not.toBeNull();
      expect(extractUIElementText(badgeEl!)).toBe('[Não revelado]');

      const mysteryIcon = findUIElementByTestId(card, 'test-veiled-card-mystery-icon');
      expect(mysteryIcon).not.toBeNull();
      expect(extractUIElementText(mysteryIcon!)).toBe('🔒');

      const scoreEl = findUIElementByTestId(card, 'test-veiled-card-score');
      expect(scoreEl).not.toBeNull();
      expect(extractUIElementText(scoreEl!)).toContain('88%');

      const hintEl = findUIElementByTestId(card, 'test-veiled-card-hint');
      expect(hintEl).not.toBeNull();
      expect(extractUIElementText(hintEl!)).toBe('Toque para revelar o flagra');
    });

    it('strictly satisfies Veiled Card Policy by not rendering any Image or Video component', () => {
      const card = VaultCard({ capture: MOCK_VEILED_CAPTURE });

      expect(containsElementType(card, 'Image')).toBe(false);
      expect(containsElementType(card, 'Video')).toBe(false);
      expect(containsElementType(card, 'Canvas')).toBe(false);
    });

    it('triggers onPress callback when touched', () => {
      let selectedCapture: TensionCaptureRecord | null = null;
      const card = VaultCard({
        capture: MOCK_VEILED_CAPTURE,
        onPress: (c) => {
          selectedCapture = c;
        },
      });

      expect(card.props.onPress).toBeDefined();
      card.props.onPress!();
      expect(selectedCapture).toEqual(MOCK_VEILED_CAPTURE);
    });
  });

  describe('Revealed rendering (is_revealed = 1)', () => {
    it('renders badge [Revelado], identifier, date, score and applied quote', () => {
      const card = VaultCard({
        capture: MOCK_REVEALED_CAPTURE,
        testID: 'test-revealed-card',
      });

      const badgeEl = findUIElementByTestId(card, 'test-revealed-card-badge-text');
      expect(badgeEl).not.toBeNull();
      expect(extractUIElementText(badgeEl!)).toBe('[Revelado]');

      const idEl = findUIElementByTestId(card, 'test-revealed-card-identifier');
      expect(idEl).not.toBeNull();
      expect(extractUIElementText(idEl!)).toBe('FLAGRA #cap-4444');

      const scoreEl = findUIElementByTestId(card, 'test-revealed-card-score');
      expect(scoreEl).not.toBeNull();
      expect(extractUIElementText(scoreEl!)).toContain('76%');

      const quoteEl = findUIElementByTestId(card, 'test-revealed-card-quote');
      expect(quoteEl).not.toBeNull();
      expect(extractUIElementText(quoteEl!)).toBe('"A glabela não mente."');

      const viewedEl = findUIElementByTestId(card, 'test-revealed-card-viewed-indicator');
      expect(viewedEl).not.toBeNull();
      expect(extractUIElementText(viewedEl!)).toContain('Visualizado');
    });

    it('renders gracefully without quote element if applied_quote is null', () => {
      const captureWithoutQuote: TensionCaptureRecord = {
        ...MOCK_REVEALED_CAPTURE,
        id: 'cap-no-quote',
        applied_quote: null,
      };

      const card = VaultCard({
        capture: captureWithoutQuote,
        testID: 'card-no-quote',
      });

      const quoteEl = findUIElementByTestId(card, 'card-no-quote-quote');
      expect(quoteEl).toBeNull();
    });

    it('triggers onPress callback on revealed card', () => {
      let selectedCapture: TensionCaptureRecord | null = null;
      const card = VaultCard({
        capture: MOCK_REVEALED_CAPTURE,
        onPress: (c) => {
          selectedCapture = c;
        },
      });

      card.props.onPress!();
      expect(selectedCapture).toEqual(MOCK_REVEALED_CAPTURE);
    });
  });
});

describe('VaultScreen Component and Controller', () => {
  it('renders loading state initially while queries are in-flight', () => {
    const controller = VaultScreen({
      autoLoad: false,
      testID: 'vault-loading',
    });

    expect(controller.getState().isLoading).toBe(true);

    const root = controller.render();
    const loadingEl = findUIElementByTestId(root, 'vault-loading-loading-text');
    expect(loadingEl).not.toBeNull();
    expect(extractUIElementText(loadingEl!)).toBe('Abrindo cofre de flagras...');
  });

  it('renders ironic empty state when vault has no captures', async () => {
    const controller = VaultScreen({
      fetchCaptures: async () => [],
      testID: 'vault-empty',
      autoLoad: false,
    });

    await controller.loadCaptures();

    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().captures.length).toBe(0);

    const root = controller.render();

    const titleEl = findUIElementByTestId(root, 'vault-empty-title');
    expect(extractUIElementText(titleEl!)).toBe('Cofre Privado');

    const counterEl = findUIElementByTestId(root, 'vault-empty-counter');
    expect(extractUIElementText(counterEl!)).toBe('0 flagras guardados');

    const emptyMsgEl = findUIElementByTestId(root, 'vault-empty-empty-message');
    expect(emptyMsgEl).not.toBeNull();
    expect(extractUIElementText(emptyMsgEl!)).toBe(VAULT_EMPTY_MESSAGE);
  });

  it('renders single-item counter format and multiple-items counter format accurately', async () => {
    const singleCapture = [MOCK_VEILED_CAPTURE];
    const singleController = VaultScreen({
      fetchCaptures: async () => singleCapture,
      testID: 'vault-single',
      autoLoad: false,
    });
    await singleController.loadCaptures();
    const singleRoot = singleController.render();
    const singleCounter = findUIElementByTestId(singleRoot, 'vault-single-counter');
    expect(extractUIElementText(singleCounter!)).toBe('1 flagra guardado');

    const multiCaptures = [MOCK_VEILED_CAPTURE, MOCK_REVEALED_CAPTURE];
    const multiController = VaultScreen({
      fetchCaptures: async () => multiCaptures,
      testID: 'vault-multi',
      autoLoad: false,
    });
    await multiController.loadCaptures();
    const multiRoot = multiController.render();
    const multiCounter = findUIElementByTestId(multiRoot, 'vault-multi-counter');
    expect(extractUIElementText(multiCounter!)).toBe('2 flagras guardados');
  });

  it('queries DatabaseClient for kept captures ordered by created_at DESC', async () => {
    const dbClient = new MockDatabaseClient();
    dbClient.mockCaptures = [MOCK_REVEALED_CAPTURE, MOCK_VEILED_CAPTURE];

    const controller = VaultScreen({
      dbClient,
      testID: 'vault-db',
      autoLoad: false,
    });

    await controller.loadCaptures();

    expect(dbClient.executedQueries.length).toBe(1);
    expect(dbClient.executedQueries[0]?.sql).toContain("WHERE user_decision = 'kept'");
    expect(dbClient.executedQueries[0]?.sql).toContain('ORDER BY created_at DESC');

    const root = controller.render();
    const grid = findUIElementByTestId(root, 'vault-db-grid');
    expect(grid).not.toBeNull();
    expect(grid!.props.children?.length).toBe(2);
  });

  it('handles database error gracefully by rendering error notification', async () => {
    const dbClient = new MockDatabaseClient();
    dbClient.shouldFail = true;

    const controller = VaultScreen({
      dbClient,
      testID: 'vault-err',
      autoLoad: false,
    });

    await expect(controller.loadCaptures()).rejects.toThrow('Database disk I/O failure');

    expect(controller.getState().isLoading).toBe(false);
    expect(controller.getState().error).toBe('Database disk I/O failure');

    const root = controller.render();
    const errorEl = findUIElementByTestId(root, 'vault-err-error-message');
    expect(errorEl).not.toBeNull();
    expect(extractUIElementText(errorEl!)).toContain('Falha ao acessar registros do cofre');
  });

  it('invokes onBack callback when back button is pressed', () => {
    let backPressed = false;
    const controller = VaultScreen({
      onBack: () => {
        backPressed = true;
      },
      testID: 'vault-nav',
    });

    const root = controller.render();
    const backBtn = findUIElementByTestId(root, 'vault-nav-back-button');
    expect(backBtn).not.toBeNull();
    expect(backBtn!.props.onPress).toBeDefined();

    backBtn!.props.onPress!();
    expect(backPressed).toBe(true);
  });

  it('invokes onSelectCapture when a vault card is tapped', async () => {
    let selectedCapture: TensionCaptureRecord | null = null;
    const controller = VaultScreen({
      fetchCaptures: async () => [MOCK_VEILED_CAPTURE],
      onSelectCapture: (c) => {
        selectedCapture = c;
      },
      testID: 'vault-select',
      autoLoad: false,
    });

    await controller.loadCaptures();
    const root = controller.render();

    const card = findUIElementByTestId(root, `vault-select-card-${MOCK_VEILED_CAPTURE.id}`);
    expect(card).not.toBeNull();
    expect(card!.props.onPress).toBeDefined();

    card!.props.onPress!();
    expect(selectedCapture).toEqual(MOCK_VEILED_CAPTURE);
  });

  it('supports listener subscription and manual refresh', async () => {
    const items = [MOCK_VEILED_CAPTURE];
    const controller = new VaultScreenController({
      fetchCaptures: async () => items,
      autoLoad: false,
    });

    const states: Array<boolean> = [];
    const unsubscribe = controller.subscribe((state) => {
      states.push(state.isLoading);
    });

    await controller.refresh();

    expect(states).toContain(true);
    expect(states[states.length - 1]).toBe(false);
    expect(controller.getState().captures.length).toBe(1);

    unsubscribe();
    await controller.refresh();
  });
});

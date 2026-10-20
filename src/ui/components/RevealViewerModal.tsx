import { TensionCaptureRecord } from '../../services/db/schema';
import { ICapturesRepository } from '../../services/db/captures_repository';
import { VaultStorageService } from '../../services/storage/vault_storage';
import { UIElement, createUIElement } from './MetricCard';
import { formatCaptureDate, formatRigidityScore } from './VaultCard';

export interface RevealViewerModalProps {
  readonly visible: boolean;
  readonly capture: TensionCaptureRecord | null;
  readonly capturesRepository?: ICapturesRepository;
  readonly vaultStorage?: VaultStorageService;
  readonly onShare?: (capture: TensionCaptureRecord) => void | Promise<void>;
  readonly onExport?: (capture: TensionCaptureRecord) => void | Promise<void>;
  readonly onDeleted?: (captureId: string) => void | Promise<void>;
  readonly onClose?: () => void;
  readonly onRevealed?: (capture: TensionCaptureRecord) => void;
  readonly onError?: (error: Error) => void;
  readonly testID?: string;
}

export interface RevealViewerModalState {
  readonly isRevealed: boolean;
  readonly isRevealing: boolean;
  readonly isDeleting: boolean;
  readonly showDeleteConfirm: boolean;
  readonly error: string | null;
}

export class RevealViewerModalController {
  private state: RevealViewerModalState;
  private readonly listeners = new Set<(state: RevealViewerModalState) => void>();

  constructor(private readonly props: RevealViewerModalProps) {
    this.state = {
      isRevealed: props.capture?.is_revealed === 1,
      isRevealing: false,
      isDeleting: false,
      showDeleteConfirm: false,
      error: null,
    };
  }

  public getState(): RevealViewerModalState {
    return this.state;
  }

  public subscribe(listener: (state: RevealViewerModalState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private updateState(partial: Partial<RevealViewerModalState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener(this.state);
  }

  public async handleReveal(): Promise<void> {
    if (this.state.isRevealed || this.state.isRevealing || !this.props.capture) return;
    this.updateState({ isRevealing: true, error: null });
    try {
      if (this.props.capturesRepository) {
        await this.props.capturesRepository.markAsRevealed(this.props.capture.id);
      }
      this.updateState({ isRevealed: true, isRevealing: false });
      if (this.props.onRevealed) {
        this.props.onRevealed({
          ...this.props.capture,
          is_revealed: 1,
          revealed_at: new Date().toISOString(),
        });
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.updateState({ isRevealing: false, error: error.message });
      if (this.props.onError) this.props.onError(error);
      throw error;
    }
  }

  public async handleShare(): Promise<void> {
    if (!this.props.capture || this.state.isDeleting) return;
    if (this.props.onShare) await this.props.onShare(this.props.capture);
  }

  public async handleExport(): Promise<void> {
    if (!this.props.capture || this.state.isDeleting) return;
    if (this.props.onExport) await this.props.onExport(this.props.capture);
  }

  public handleDeleteRequest(): void {
    this.updateState({ showDeleteConfirm: true });
  }

  public handleCancelDelete(): void {
    this.updateState({ showDeleteConfirm: false });
  }

  public async handleConfirmDelete(): Promise<void> {
    if (!this.props.capture || this.state.isDeleting) return;
    this.updateState({ isDeleting: true, error: null });
    try {
      if (this.props.vaultStorage && this.props.capture.file_path) {
        await this.props.vaultStorage.deleteVaultItem(this.props.capture.file_path);
      }
      if (this.props.capturesRepository) {
        await this.props.capturesRepository.deleteCapture(this.props.capture.id);
      }
      const deletedId = this.props.capture.id;
      this.updateState({ isDeleting: false, showDeleteConfirm: false });
      if (this.props.onDeleted) await this.props.onDeleted(deletedId);
      if (this.props.onClose) this.props.onClose();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.updateState({ isDeleting: false, error: error.message });
      if (this.props.onError) this.props.onError(error);
      throw error;
    }
  }

  public handleClose(): void {
    if (this.props.onClose) this.props.onClose();
  }

  public render(): UIElement | null {
    if (!this.props.visible || !this.props.capture) return null;

    const capture = this.props.capture;
    const testId = this.props.testID ?? 'reveal-viewer-modal';
    const isRevealed = this.state.isRevealed;
    const formattedDate = formatCaptureDate(capture.created_at);
    const formattedRigidity = formatRigidityScore(capture.tension_score);

    const closeButton = createUIElement(
      'TouchableOpacity',
      {
        testID: `${testId}-btn-close`,
        accessibilityLabel: 'Fechar visualizador',
        onPress: () => this.handleClose(),
        style: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#27272A' },
      },
      createUIElement('Text', { style: { color: '#E4E4E7', fontSize: 13, fontWeight: '700' } }, '✕ Fechar')
    );

    const header = createUIElement(
      'View',
      {
        testID: `${testId}-header`,
        style: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', paddingHorizontal: 20, paddingTop: 48, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#18181B' },
      },
      createUIElement('Text', { testID: `${testId}-header-title`, style: { color: '#A1A1AA', fontSize: 13, fontWeight: '800', letterSpacing: 1.2 } }, 'COFRE PRIVADO - VISUALIZADOR SEGURO'),
      closeButton
    );

    const visualSection = !isRevealed
      ? createUIElement(
          'View',
          {
            testID: `${testId}-veiled-layer`,
            style: { width: '100%', maxWidth: 360, aspectRatio: 3 / 4, backgroundColor: '#121214', borderRadius: 16, borderWidth: 1, borderColor: '#27272A', justifyContent: 'center', alignItems: 'center', padding: 24, marginVertical: 20 },
          },
          createUIElement('Text', { testID: `${testId}-veiled-badge`, style: { color: '#F59E0B', fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 12 } }, '[FOTO VELADA]'),
          createUIElement('Text', { testID: `${testId}-veiled-icon`, style: { fontSize: 44, marginBottom: 16 } }, '🔒'),
          createUIElement(
            'TouchableOpacity',
            {
              testID: `${testId}-btn-reveal`,
              accessibilityLabel: 'Toque para revelar o flagra',
              onPress: () => { void this.handleReveal(); },
              style: { backgroundColor: '#F59E0B', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, marginTop: 8 },
            },
            createUIElement('Text', { style: { color: '#000000', fontSize: 15, fontWeight: '900', letterSpacing: 0.5 } }, 'Toque para revelar')
          )
        )
      : createUIElement(
          'View',
          {
            testID: `${testId}-image-container`,
            style: { width: '100%', maxWidth: 360, aspectRatio: 3 / 4, backgroundColor: '#09090B', borderRadius: 16, overflow: 'hidden', marginVertical: 20, borderWidth: 1, borderColor: '#27272A' },
          },
          createUIElement('Image', {
            testID: `${testId}-image`,
            source: { uri: capture.file_path ?? '' },
            style: { width: '100%', height: '100%' },
            accessibilityLabel: 'Foto do flagra de tensão revelada',
          })
        );

    const quoteElement = capture.applied_quote
      ? createUIElement(
          'View',
          {
            testID: `${testId}-quote-container`,
            style: { backgroundColor: '#18181B', borderLeftWidth: 3, borderLeftColor: '#F59E0B', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, marginBottom: 16, width: '100%', maxWidth: 360 },
          },
          createUIElement('Text', { testID: `${testId}-quote-text`, style: { color: '#F4F4F5', fontSize: 14, fontStyle: 'italic', fontWeight: '600' } }, `"${capture.applied_quote}"`)
        )
      : null;

    const metadataSection = createUIElement(
      'View',
      { testID: `${testId}-metadata`, style: { width: '100%', maxWidth: 360, alignItems: 'center', marginBottom: 20 } },
      createUIElement('Text', { testID: `${testId}-date`, style: { color: '#71717A', fontSize: 13, marginBottom: 4 } }, formattedDate),
      createUIElement('Text', { testID: `${testId}-score`, style: { color: '#FBBF24', fontSize: 16, fontWeight: '800', marginBottom: 12 } }, `Rigidez Muscular: ${formattedRigidity}`),
      quoteElement
    );

    const deleteDialog = this.state.showDeleteConfirm
      ? createUIElement(
          'View',
          {
            testID: `${testId}-delete-dialog`,
            style: { width: '100%', maxWidth: 360, backgroundColor: '#1C1917', borderColor: '#DC2626', borderWidth: 1.5, borderRadius: 14, padding: 16, alignItems: 'center', marginBottom: 16 },
          },
          createUIElement('Text', { testID: `${testId}-delete-dialog-notice`, style: { color: '#FCA5A5', fontSize: 13, textAlign: 'center', marginBottom: 14, fontWeight: '600' } }, 'Tem certeza que deseja apagar definitivamente este flagra? Esta ação não pode ser desfeita.'),
          createUIElement(
            'View',
            { style: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' } },
            createUIElement('TouchableOpacity', { testID: `${testId}-btn-cancel-delete`, onPress: () => this.handleCancelDelete(), style: { backgroundColor: '#27272A', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, flex: 1, marginRight: 8, alignItems: 'center' } }, createUIElement('Text', { style: { color: '#D4D4D8', fontSize: 13, fontWeight: '700' } }, 'Cancelar')),
            createUIElement('TouchableOpacity', { testID: `${testId}-btn-confirm-delete`, onPress: () => { void this.handleConfirmDelete(); }, style: { backgroundColor: '#DC2626', paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, flex: 1, marginLeft: 8, alignItems: 'center' } }, createUIElement('Text', { style: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' } }, 'Confirmar'))
          )
        )
      : null;

    const actionButtons = !this.state.showDeleteConfirm
      ? createUIElement(
          'View',
          { testID: `${testId}-actions`, style: { width: '100%', maxWidth: 360, flexDirection: 'row', justifyContent: 'space-between' } },
          createUIElement('TouchableOpacity', { testID: `${testId}-btn-share`, onPress: () => { void this.handleShare(); }, style: { backgroundColor: '#27272A', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, flex: 1, marginRight: 6, alignItems: 'center' } }, createUIElement('Text', { style: { color: '#E4E4E7', fontSize: 13, fontWeight: '700' } }, '📤 Compartilhar')),
          createUIElement('TouchableOpacity', { testID: `${testId}-btn-export`, onPress: () => { void this.handleExport(); }, style: { backgroundColor: '#27272A', paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, flex: 1, marginHorizontal: 6, alignItems: 'center' } }, createUIElement('Text', { style: { color: '#E4E4E7', fontSize: 13, fontWeight: '700' } }, '💾 Salvar no Rolo')),
          createUIElement('TouchableOpacity', { testID: `${testId}-btn-delete`, onPress: () => this.handleDeleteRequest(), style: { backgroundColor: '#3F1212', borderColor: '#7F1D1D', borderWidth: 1, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 10, flex: 1, marginLeft: 6, alignItems: 'center' } }, createUIElement('Text', { style: { color: '#F87171', fontSize: 13, fontWeight: '700' } }, '🗑️ Excluir'))
        )
      : null;

    return createUIElement(
      'View',
      {
        testID: testId,
        style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000', zIndex: 9999, justifyContent: 'space-between', alignItems: 'center', paddingBottom: 36 },
      },
      header,
      visualSection,
      createUIElement('View', { style: { width: '100%', alignItems: 'center', paddingHorizontal: 16 } }, metadataSection, deleteDialog, actionButtons)
    );
  }
}

export function RevealViewerModal(props: RevealViewerModalProps): UIElement | null {
  const controller = new RevealViewerModalController(props);
  return controller.render();
}

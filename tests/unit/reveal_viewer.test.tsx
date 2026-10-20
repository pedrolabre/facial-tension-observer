import * as path from 'node:path';
import { TensionCaptureRecord } from '../../src/services/db/schema';
import { DatabaseClient, initDatabase } from '../../src/services/db/client';
import {
  CapturesRepository,
  ICapturesRepository,
} from '../../src/services/db/captures_repository';
import {
  RevealViewerModal,
  RevealViewerModalController,
} from '../../src/ui/components/RevealViewerModal';
import {
  findUIElementByTestId,
  extractUIElementText,
} from '../../src/ui/screens/HomeScreen';
import { VaultStorageService, FileSystemAdapter } from '../../src/services/storage/vault_storage';

class InMemoryFileSystemAdapter implements FileSystemAdapter {
  private files = new Map<string, Uint8Array>();
  private dirs = new Set<string>();

  private normalize(p: string): string {
    return path.resolve(p);
  }

  async mkdir(dirPath: string): Promise<void> {
    this.dirs.add(this.normalize(dirPath));
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    this.files.set(this.normalize(filePath), data);
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const data = this.files.get(this.normalize(filePath));
    if (!data) throw new Error(`File not found: ${filePath}`);
    return data;
  }

  async unlink(filePath: string): Promise<void> {
    const key = this.normalize(filePath);
    if (!this.files.has(key)) throw new Error(`File not found: ${filePath}`);
    this.files.delete(key);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldKey = this.normalize(oldPath);
    const data = this.files.get(oldKey);
    if (!data) throw new Error(`File not found: ${oldPath}`);
    this.files.delete(oldKey);
    this.files.set(this.normalize(newPath), data);
  }

  async exists(targetPath: string): Promise<boolean> {
    const key = this.normalize(targetPath);
    return this.files.has(key) || this.dirs.has(key);
  }
}

describe('Etapa 5 - Bloco 5.2: Modal de revelação gradativa e visualização segura', () => {
  let db: DatabaseClient;
  let capturesRepo: CapturesRepository;
  const mockSessionId = 'sess-test-502';

  const sampleVeiledCapture: TensionCaptureRecord = {
    id: 'cap-veiled-001',
    session_id: mockSessionId,
    created_at: '2026-10-22 10:15:00',
    tension_score: 0.85,
    brow_furrow_score: 0.9,
    lip_compression_score: 0.8,
    jaw_rigidity_score: 0.85,
    held_duration_seconds: 3.2,
    file_path: '/documents/vault/cap-veiled-001.jpg',
    user_decision: 'kept',
    is_revealed: 0,
    revealed_at: null,
    applied_quote: 'Registramos um momento delicado.',
  };

  const sampleRevealedCapture: TensionCaptureRecord = {
    id: 'cap-revealed-002',
    session_id: mockSessionId,
    created_at: '2026-10-22 11:30:00',
    tension_score: 0.78,
    brow_furrow_score: 0.8,
    lip_compression_score: 0.75,
    jaw_rigidity_score: 0.8,
    held_duration_seconds: 3.5,
    file_path: '/documents/vault/cap-revealed-002.jpg',
    user_decision: 'kept',
    is_revealed: 1,
    revealed_at: '2026-10-22 11:32:00',
    applied_quote: 'A glabela não mente.',
  };

  beforeEach(async () => {
    db = await initDatabase();
    capturesRepo = new CapturesRepository(db);

    await db.run(
      'INSERT INTO sessions (id, duration_seconds, triggers_count, kept_count, deleted_blind_count) VALUES (?, 120, 2, 2, 0);',
      [mockSessionId]
    );
  });

  afterEach(async () => {
    await db.close();
  });

  describe('CapturesRepository', () => {
    it('deve salvar e recuperar captura por ID', async () => {
      await capturesRepo.saveCapture(sampleVeiledCapture);
      const retrieved = await capturesRepo.getCaptureById(sampleVeiledCapture.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(sampleVeiledCapture.id);
      expect(retrieved?.is_revealed).toBe(0);
      expect(retrieved?.revealed_at).toBeNull();
      expect(retrieved?.applied_quote).toBe('Registramos um momento delicado.');
    });

    it('deve listar apenas capturas mantidas ordenadas por created_at decrescente', async () => {
      await capturesRepo.saveCapture(sampleVeiledCapture);
      await capturesRepo.saveCapture(sampleRevealedCapture);
      await capturesRepo.saveCapture({
        ...sampleVeiledCapture,
        id: 'cap-deleted-003',
        user_decision: 'deleted_blind',
      });

      const list = await capturesRepo.listKeptCaptures();
      expect(list.length).toBe(2);
      expect(list[0]?.id).toBe(sampleRevealedCapture.id);
      expect(list[1]?.id).toBe(sampleVeiledCapture.id);
    });

    it('deve marcar captura como revelada e preencher revealed_at atomicamente no SQLite', async () => {
      await capturesRepo.saveCapture(sampleVeiledCapture);
      await capturesRepo.markAsRevealed(sampleVeiledCapture.id);

      const updated = await capturesRepo.getCaptureById(sampleVeiledCapture.id);
      expect(updated?.is_revealed).toBe(1);
      expect(updated?.revealed_at).toBeTruthy();
    });

    it('deve lançar erro ao tentar marcar captura inexistente como revelada', async () => {
      await expect(capturesRepo.markAsRevealed('non-existent-id')).rejects.toThrow(
        'Capture not found: non-existent-id'
      );
    });

    it('deve deletar captura atomicamente do SQLite', async () => {
      await capturesRepo.saveCapture(sampleVeiledCapture);
      await capturesRepo.deleteCapture(sampleVeiledCapture.id);

      const retrieved = await capturesRepo.getCaptureById(sampleVeiledCapture.id);
      expect(retrieved).toBeUndefined();
    });

    it('deve lançar erro ao tentar deletar captura inexistente', async () => {
      await expect(capturesRepo.deleteCapture('non-existent-id')).rejects.toThrow(
        'Capture not found: non-existent-id'
      );
    });
  });

  describe('RevealViewerModal & RevealViewerModalController', () => {
    it('deve retornar null quando visible for false ou capture for null', () => {
      const hiddenModal = RevealViewerModal({
        visible: false,
        capture: sampleVeiledCapture,
      });
      expect(hiddenModal).toBeNull();

      const nullCaptureModal = RevealViewerModal({
        visible: true,
        capture: null,
      });
      expect(nullCaptureModal).toBeNull();
    });

    it('deve renderizar estado velado inicial com camada de desfoque/obscurecimento e badge [FOTO VELADA]', () => {
      const modal = RevealViewerModal({
        visible: true,
        capture: sampleVeiledCapture,
      });
      expect(modal).not.toBeNull();

      const veiledLayer = findUIElementByTestId(modal!, 'reveal-viewer-modal-veiled-layer');
      expect(veiledLayer).toBeDefined();

      const veiledBadge = findUIElementByTestId(modal!, 'reveal-viewer-modal-veiled-badge');
      expect(veiledBadge).toBeDefined();
      expect(extractUIElementText(veiledBadge!)).toBe('[FOTO VELADA]');

      const revealBtn = findUIElementByTestId(modal!, 'reveal-viewer-modal-btn-reveal');
      expect(revealBtn).toBeDefined();
      expect(extractUIElementText(revealBtn!)).toBe('Toque para revelar');

      const imageElement = findUIElementByTestId(modal!, 'reveal-viewer-modal-image');
      expect(imageElement).toBeNull();
    });

    it('deve renderizar metadados formatados e frase irônica', () => {
      const modal = RevealViewerModal({
        visible: true,
        capture: sampleVeiledCapture,
      });
      expect(modal).not.toBeNull();

      const scoreElement = findUIElementByTestId(modal!, 'reveal-viewer-modal-score');
      expect(scoreElement).toBeDefined();
      expect(extractUIElementText(scoreElement!)).toContain('85%');

      const quoteElement = findUIElementByTestId(modal!, 'reveal-viewer-modal-quote-text');
      expect(quoteElement).toBeDefined();
      expect(extractUIElementText(quoteElement!)).toBe('"Registramos um momento delicado."');
    });

    it('deve omitir bloco de frase quando applied_quote for null', () => {
      const captureWithoutQuote: TensionCaptureRecord = {
        ...sampleVeiledCapture,
        applied_quote: null,
      };

      const modal = RevealViewerModal({
        visible: true,
        capture: captureWithoutQuote,
      });
      expect(modal).not.toBeNull();

      const quoteContainer = findUIElementByTestId(modal!, 'reveal-viewer-modal-quote-container');
      expect(quoteContainer).toBeNull();
    });

    it('deve executar revelação ao acionar handleReveal persistindo no banco e exibindo a imagem', async () => {
      await capturesRepo.saveCapture(sampleVeiledCapture);

      let revealedCaptureArg: TensionCaptureRecord | null = null;
      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleVeiledCapture,
        capturesRepository: capturesRepo,
        onRevealed: (cap) => {
          revealedCaptureArg = cap;
        },
      });

      expect(controller.getState().isRevealed).toBe(false);

      await controller.handleReveal();

      expect(controller.getState().isRevealed).toBe(true);
      expect(revealedCaptureArg).not.toBeNull();
      expect(revealedCaptureArg!.is_revealed).toBe(1);

      const dbRecord = await capturesRepo.getCaptureById(sampleVeiledCapture.id);
      expect(dbRecord?.is_revealed).toBe(1);
      expect(dbRecord?.revealed_at).toBeTruthy();

      const renderedTree = controller.render();
      expect(renderedTree).not.toBeNull();

      const imageElement = findUIElementByTestId(renderedTree!, 'reveal-viewer-modal-image');
      expect(imageElement).toBeDefined();
      expect(imageElement?.props.source).toEqual({ uri: sampleVeiledCapture.file_path });

      const veiledLayer = findUIElementByTestId(renderedTree!, 'reveal-viewer-modal-veiled-layer');
      expect(veiledLayer).toBeNull();
    });

    it('não deve disparar persistência repetida se já estiver revelado', async () => {
      const mockRepo: ICapturesRepository = {
        markAsRevealed: jest.fn().mockResolvedValue(undefined),
        deleteCapture: jest.fn().mockResolvedValue(undefined),
        getCaptureById: jest.fn().mockResolvedValue(sampleRevealedCapture),
        listKeptCaptures: jest.fn().mockResolvedValue([]),
        saveCapture: jest.fn().mockResolvedValue(undefined),
      };

      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleRevealedCapture,
        capturesRepository: mockRepo,
      });

      expect(controller.getState().isRevealed).toBe(true);

      await controller.handleReveal();
      expect(mockRepo.markAsRevealed).not.toHaveBeenCalled();
    });

    it('deve abrir diretamente revelado quando capture.is_revealed for 1', () => {
      const modal = RevealViewerModal({
        visible: true,
        capture: sampleRevealedCapture,
      });
      expect(modal).not.toBeNull();

      const imageElement = findUIElementByTestId(modal!, 'reveal-viewer-modal-image');
      expect(imageElement).toBeDefined();
      expect(imageElement?.props.source).toEqual({ uri: sampleRevealedCapture.file_path });

      const veiledLayer = findUIElementByTestId(modal!, 'reveal-viewer-modal-veiled-layer');
      expect(veiledLayer).toBeNull();
    });

    it('deve acionar callbacks de compartilhar e salvar no rolo', async () => {
      let sharedCapture: TensionCaptureRecord | null = null;
      let exportedCapture: TensionCaptureRecord | null = null;

      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleRevealedCapture,
        onShare: (cap) => {
          sharedCapture = cap;
        },
        onExport: (cap) => {
          exportedCapture = cap;
        },
      });

      await controller.handleShare();
      expect(sharedCapture).toBe(sampleRevealedCapture);

      await controller.handleExport();
      expect(exportedCapture).toBe(sampleRevealedCapture);
    });

    it('deve abrir diálogo de confirmação ao pedir exclusão e cancelar adequadamente', () => {
      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleRevealedCapture,
      });

      expect(controller.getState().showDeleteConfirm).toBe(false);

      controller.handleDeleteRequest();
      expect(controller.getState().showDeleteConfirm).toBe(true);

      let tree = controller.render();
      const deleteDialog = findUIElementByTestId(tree!, 'reveal-viewer-modal-delete-dialog');
      expect(deleteDialog).toBeDefined();
      expect(extractUIElementText(deleteDialog!)).toContain('Tem certeza que deseja apagar definitivamente');

      controller.handleCancelDelete();
      expect(controller.getState().showDeleteConfirm).toBe(false);

      tree = controller.render();
      expect(findUIElementByTestId(tree!, 'reveal-viewer-modal-delete-dialog')).toBeNull();
    });

    it('deve executar exclusão atômica no repositório e storage ao confirmar', async () => {
      await capturesRepo.saveCapture(sampleRevealedCapture);

      const memFs = new InMemoryFileSystemAdapter();
      const storage = new VaultStorageService({
        baseDirectory: '/app/storage',
        fileSystem: memFs,
      });
      await storage.initStorageDirectories();
      const vaultPath = path.join(storage.vaultDirectoryPath, 'cap-revealed-002.jpg');
      await memFs.writeFile(vaultPath, new Uint8Array([1, 2, 3, 4]));

      const captureWithRealVaultPath: TensionCaptureRecord = {
        ...sampleRevealedCapture,
        file_path: vaultPath,
      };

      let deletedId: string | null = null;
      let closed = false;

      const controller = new RevealViewerModalController({
        visible: true,
        capture: captureWithRealVaultPath,
        capturesRepository: capturesRepo,
        vaultStorage: storage,
        onDeleted: (id) => {
          deletedId = id;
        },
        onClose: () => {
          closed = true;
        },
      });

      controller.handleDeleteRequest();
      await controller.handleConfirmDelete();

      expect(deletedId).toBe(sampleRevealedCapture.id);
      expect(closed).toBe(true);
      expect(await memFs.exists(vaultPath)).toBe(false);

      const inDb = await capturesRepo.getCaptureById(sampleRevealedCapture.id);
      expect(inDb).toBeUndefined();
    });

    it('deve acionar callback onClose ao chamar handleClose', () => {
      let closed = false;
      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleRevealedCapture,
        onClose: () => {
          closed = true;
        },
      });

      controller.handleClose();
      expect(closed).toBe(true);
    });

    it('deve tratar e emitir erros em handleReveal e handleConfirmDelete', async () => {
      const failingRepo: ICapturesRepository = {
        markAsRevealed: jest.fn().mockRejectedValue(new Error('Falha I/O banco')),
        deleteCapture: jest.fn().mockRejectedValue(new Error('Falha ao deletar')),
        getCaptureById: jest.fn().mockResolvedValue(undefined),
        listKeptCaptures: jest.fn().mockResolvedValue([]),
        saveCapture: jest.fn().mockResolvedValue(undefined),
      };

      const emittedErrors: Error[] = [];
      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleVeiledCapture,
        capturesRepository: failingRepo,
        onError: (err) => {
          emittedErrors.push(err);
        },
      });

      await expect(controller.handleReveal()).rejects.toThrow('Falha I/O banco');
      expect(controller.getState().error).toBe('Falha I/O banco');
      expect(emittedErrors.length).toBe(1);

      await expect(controller.handleConfirmDelete()).rejects.toThrow('Falha ao deletar');
      expect(controller.getState().error).toBe('Falha ao deletar');
      expect(emittedErrors.length).toBe(2);
    });

    it('deve permitir subscrição e cancelamento no ciclo de listeners do controller', async () => {
      const controller = new RevealViewerModalController({
        visible: true,
        capture: sampleVeiledCapture,
        capturesRepository: capturesRepo,
      });

      let notifiedCount = 0;
      const unsubscribe = controller.subscribe(() => {
        notifiedCount++;
      });

      controller.handleDeleteRequest();
      expect(notifiedCount).toBe(1);

      controller.handleCancelDelete();
      expect(notifiedCount).toBe(2);

      unsubscribe();
      controller.handleDeleteRequest();
      expect(notifiedCount).toBe(2);
    });
  });
});

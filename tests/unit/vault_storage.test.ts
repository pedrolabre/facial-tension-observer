import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  FileSystemAdapter,
  NodeFileSystemAdapter,
  VaultStorageService,
} from '../../src/services/storage/vault_storage';

describe('VaultStorageService', () => {
  let tempBaseDir: string;
  let storage: VaultStorageService;

  beforeEach(async () => {
    tempBaseDir = path.join(
      os.tmpdir(),
      `vault_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    );
    storage = new VaultStorageService({ baseDirectory: tempBaseDir });
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tempBaseDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  describe('directory initialization', () => {
    it('initializes cache and vault directories idempotently', async () => {
      await storage.initStorageDirectories();

      expect(fs.existsSync(storage.cacheDirectoryPath)).toBe(true);
      expect(fs.existsSync(storage.vaultDirectoryPath)).toBe(true);

      await expect(storage.initStorageDirectories()).resolves.not.toThrow();
    });

    it('falls back to default baseDirectory when options are omitted', () => {
      const defaultStorage = new VaultStorageService();
      expect(defaultStorage.baseDirectoryPath).toContain('.vault_storage');
      expect(defaultStorage.cacheDirectoryPath).toContain(
        path.join('cache', 'captures'),
      );
      expect(defaultStorage.vaultDirectoryPath).toContain(
        path.join('documents', 'vault'),
      );
    });
  });

  describe('saveTempCapture', () => {
    it('saves image bytes with temp_ prefix and valid UUID format', async () => {
      const sampleBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x10, 0x20]);
      const savedPath = await storage.saveTempCapture(sampleBytes);

      expect(fs.existsSync(savedPath)).toBe(true);
      expect(path.basename(savedPath)).toMatch(
        /^temp_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/,
      );

      const writtenBytes = await fs.promises.readFile(savedPath);
      expect(new Uint8Array(writtenBytes)).toEqual(sampleBytes);
    });

    it('rejects empty, null or invalid payload', async () => {
      await expect(storage.saveTempCapture(new Uint8Array([]))).rejects.toThrow(
        'Image bytes cannot be empty',
      );
      await expect(
        storage.saveTempCapture(null as unknown as Uint8Array),
      ).rejects.toThrow('Image bytes cannot be empty');
      await expect(
        storage.saveTempCapture(undefined as unknown as Uint8Array),
      ).rejects.toThrow('Image bytes cannot be empty');
    });
  });

  describe('deleteTempCaptureImmediately', () => {
    it('physically and immediately deletes temporary capture from disk', async () => {
      const sampleBytes = new Uint8Array([1, 2, 3, 4]);
      const tempPath = await storage.saveTempCapture(sampleBytes);

      expect(fs.existsSync(tempPath)).toBe(true);

      const deleted = await storage.deleteTempCaptureImmediately(tempPath);
      expect(deleted).toBe(true);
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('returns false when deleting a non-existent temporary file within cache', async () => {
      await storage.initStorageDirectories();
      const fakeTempName = 'temp_00000000-0000-0000-0000-000000000000.jpg';
      const fakePath = path.join(storage.cacheDirectoryPath, fakeTempName);

      const deleted = await storage.deleteTempCaptureImmediately(fakePath);
      expect(deleted).toBe(false);
    });

    it('accepts relative path or filename within cache directory', async () => {
      const sampleBytes = new Uint8Array([9, 8, 7]);
      const tempPath = await storage.saveTempCapture(sampleBytes);
      const filename = path.basename(tempPath);

      const deleted = await storage.deleteTempCaptureImmediately(filename);
      expect(deleted).toBe(true);
      expect(fs.existsSync(tempPath)).toBe(false);
    });

    it('rejects deleting files without temp_ prefix in cache', async () => {
      await storage.initStorageDirectories();
      const illegalName = 'normal_file.jpg';
      const illegalPath = path.join(storage.cacheDirectoryPath, illegalName);
      await fs.promises.writeFile(illegalPath, new Uint8Array([1]));

      await expect(
        storage.deleteTempCaptureImmediately(illegalPath),
      ).rejects.toThrow(
        'Security violation: Not a valid temporary capture file',
      );
    });
  });

  describe('moveToVault', () => {
    it('moves capture to vault, changes UUID, and removes it from cache', async () => {
      const originalBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
      const tempPath = await storage.saveTempCapture(originalBytes);
      const oldId = path.basename(tempPath).replace(/^temp_|\.jpg$/g, '');

      const vaultPath = await storage.moveToVault(tempPath);

      expect(fs.existsSync(tempPath)).toBe(false);
      expect(fs.existsSync(vaultPath)).toBe(true);

      const newId = path.basename(vaultPath).replace(/\.jpg$/, '');
      expect(newId).not.toBe(oldId);
      expect(newId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      const vaultBytes = await fs.promises.readFile(vaultPath);
      expect(new Uint8Array(vaultBytes)).toEqual(originalBytes);
    });

    it('throws error if temporary file does not exist', async () => {
      await storage.initStorageDirectories();
      const fakeTempName = 'temp_00000000-0000-0000-0000-000000000000.jpg';

      await expect(storage.moveToVault(fakeTempName)).rejects.toThrow(
        'Temporary capture file does not exist',
      );
    });

    it('rejects files without temp_ prefix', async () => {
      await storage.initStorageDirectories();
      const nonTempFile = path.join(
        storage.cacheDirectoryPath,
        'other_photo.jpg',
      );
      await fs.promises.writeFile(nonTempFile, new Uint8Array([5, 6]));

      await expect(storage.moveToVault(nonTempFile)).rejects.toThrow(
        'Security violation: Not a valid temporary capture file',
      );
    });
  });

  describe('deleteVaultItem', () => {
    it('permanently deletes an item from the vault', async () => {
      const bytes = new Uint8Array([42, 43, 44]);
      const tempPath = await storage.saveTempCapture(bytes);
      const vaultPath = await storage.moveToVault(tempPath);

      expect(fs.existsSync(vaultPath)).toBe(true);

      const deleted = await storage.deleteVaultItem(vaultPath);
      expect(deleted).toBe(true);
      expect(fs.existsSync(vaultPath)).toBe(false);
    });

    it('returns false when vault item does not exist', async () => {
      await storage.initStorageDirectories();
      const fakeVaultName = '00000000-0000-0000-0000-000000000000.jpg';

      const deleted = await storage.deleteVaultItem(fakeVaultName);
      expect(deleted).toBe(false);
    });
  });

  describe('getVaultItemBytes', () => {
    it('reads and returns the exact bytes of a vault item', async () => {
      const bytes = new Uint8Array([11, 22, 33, 44, 55]);
      const tempPath = await storage.saveTempCapture(bytes);
      const vaultPath = await storage.moveToVault(tempPath);

      const readBytes = await storage.getVaultItemBytes(vaultPath);
      expect(readBytes).toEqual(bytes);
    });

    it('reads via relative path within vault', async () => {
      const bytes = new Uint8Array([100, 200]);
      const tempPath = await storage.saveTempCapture(bytes);
      const vaultPath = await storage.moveToVault(tempPath);
      const filename = path.basename(vaultPath);

      const readBytes = await storage.getVaultItemBytes(filename);
      expect(readBytes).toEqual(bytes);
    });

    it('throws error when file is not found in vault', async () => {
      await storage.initStorageDirectories();
      const fakeVaultName = 'non_existent.jpg';

      await expect(storage.getVaultItemBytes(fakeVaultName)).rejects.toThrow(
        'Vault file not found',
      );
    });
  });

  describe('path traversal and security boundaries', () => {
    it('blocks directory traversal using .. in temp capture deletion', async () => {
      await expect(
        storage.deleteTempCaptureImmediately('../../outside.jpg'),
      ).rejects.toThrow('Security violation: Path traversal detected');
    });

    it('blocks directory traversal in vault retrieval', async () => {
      await expect(
        storage.getVaultItemBytes('../../../etc/passwd'),
      ).rejects.toThrow('Security violation: Path traversal detected');
    });

    it('blocks directory traversal in vault deletion', async () => {
      await expect(
        storage.deleteVaultItem('temp/../../outside.jpg'),
      ).rejects.toThrow('Security violation: Path traversal detected');
    });

    it('blocks absolute paths outside the allowed sandbox directory', async () => {
      const outsidePath = path.resolve(os.tmpdir(), 'outside_file.jpg');
      await expect(
        storage.deleteTempCaptureImmediately(outsidePath),
      ).rejects.toThrow('Security violation: Path traversal detected');
      await expect(storage.getVaultItemBytes(outsidePath)).rejects.toThrow(
        'Security violation: Path traversal detected',
      );
    });

    it('blocks cross-boundary attacks between cache and vault', async () => {
      const bytes = new Uint8Array([7, 7, 7]);
      const tempPath = await storage.saveTempCapture(bytes);
      const vaultPath = await storage.moveToVault(tempPath);

      // Attempting to delete a vault file through the temp deletion method must be rejected
      await expect(
        storage.deleteTempCaptureImmediately(vaultPath),
      ).rejects.toThrow('Security violation: Path traversal detected');

      // Attempting to read a cache file through the vault reader must be rejected
      const newTemp = await storage.saveTempCapture(bytes);
      await expect(storage.getVaultItemBytes(newTemp)).rejects.toThrow(
        'Security violation: Path traversal detected',
      );
    });

    it('rejects null byte injection in paths', async () => {
      await expect(
        storage.deleteTempCaptureImmediately('temp_\0malicious.jpg'),
      ).rejects.toThrow('Security violation: Null byte detected in path');
    });

    it('rejects empty or whitespace paths', async () => {
      await expect(storage.deleteTempCaptureImmediately('')).rejects.toThrow(
        'Security violation: Empty path provided',
      );
      await expect(storage.getVaultItemBytes('   ')).rejects.toThrow(
        'Security violation: Empty path provided',
      );
    });
  });

  describe('NodeFileSystemAdapter edge cases', () => {
    it('falls back to copy and unlink when rename throws EXDEV', async () => {
      const customAdapter = new NodeFileSystemAdapter();
      const spyRename = jest
        .spyOn(fs.promises, 'rename')
        .mockImplementation(async () => {
          const exdevError = new Error('Cross-device link error') as Error & {
            code?: string;
          };
          exdevError.code = 'EXDEV';
          throw exdevError;
        });

      const exdevStorage = new VaultStorageService({
        baseDirectory: tempBaseDir,
        fileSystem: customAdapter,
      });

      const tempPath = await exdevStorage.saveTempCapture(
        new Uint8Array([1, 2, 3]),
      );
      const vaultPath = await exdevStorage.moveToVault(tempPath);

      expect(fs.existsSync(tempPath)).toBe(false);
      expect(fs.existsSync(vaultPath)).toBe(true);

      spyRename.mockRestore();
    });

    it('re-throws non-EXDEV errors from rename', async () => {
      const customAdapter = new NodeFileSystemAdapter();
      const spyRename = jest
        .spyOn(fs.promises, 'rename')
        .mockImplementation(async () => {
          const err = new Error('Permission denied') as Error & {
            code?: string;
          };
          err.code = 'EACCES';
          throw err;
        });

      const failingStorage = new VaultStorageService({
        baseDirectory: tempBaseDir,
        fileSystem: customAdapter,
      });

      const tempPath = await failingStorage.saveTempCapture(
        new Uint8Array([1, 2, 3]),
      );
      await expect(failingStorage.moveToVault(tempPath)).rejects.toThrow(
        'Permission denied',
      );

      spyRename.mockRestore();
    });
  });

  describe('custom FileSystemAdapter injection', () => {
    it('works with a fully custom in-memory adapter', async () => {
      const memoryFiles = new Map<string, Uint8Array>();

      const inMemoryAdapter: FileSystemAdapter = {
        async mkdir(): Promise<void> {},
        async writeFile(p: string, data: Uint8Array): Promise<void> {
          memoryFiles.set(p, data);
        },
        async readFile(p: string): Promise<Uint8Array> {
          const content = memoryFiles.get(p);
          if (!content) throw new Error('File not found in memory');
          return content;
        },
        async unlink(p: string): Promise<void> {
          memoryFiles.delete(p);
        },
        async rename(oldP: string, newP: string): Promise<void> {
          const content = memoryFiles.get(oldP);
          if (!content) throw new Error('Old path not found in memory');
          memoryFiles.set(newP, content);
          memoryFiles.delete(oldP);
        },
        async exists(p: string): Promise<boolean> {
          return memoryFiles.has(p);
        },
      };

      const memStorage = new VaultStorageService({
        baseDirectory: '/mock/sandbox',
        fileSystem: inMemoryAdapter,
      });

      const bytes = new Uint8Array([99, 100]);
      const tempPath = await memStorage.saveTempCapture(bytes);
      expect(memoryFiles.has(tempPath)).toBe(true);

      const vaultPath = await memStorage.moveToVault(tempPath);
      expect(memoryFiles.has(tempPath)).toBe(false);
      expect(memoryFiles.has(vaultPath)).toBe(true);

      const readBytes = await memStorage.getVaultItemBytes(vaultPath);
      expect(readBytes).toEqual(bytes);

      const deleted = await memStorage.deleteVaultItem(vaultPath);
      expect(deleted).toBe(true);
      expect(memoryFiles.has(vaultPath)).toBe(false);
    });
  });
});

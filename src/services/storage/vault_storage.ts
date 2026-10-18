import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FileSystemAdapter {
  mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void>;
  writeFile(filePath: string, data: Uint8Array): Promise<void>;
  readFile(filePath: string): Promise<Uint8Array>;
  unlink(filePath: string): Promise<void>;
  rename(oldPath: string, newPath: string): Promise<void>;
  exists(targetPath: string): Promise<boolean>;
}

export class NodeFileSystemAdapter implements FileSystemAdapter {
  async mkdir(dirPath: string, options?: { recursive?: boolean }): Promise<void> {
    await fs.promises.mkdir(dirPath, options);
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    await fs.promises.writeFile(filePath, data);
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const buffer = await fs.promises.readFile(filePath);
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }

  async unlink(filePath: string): Promise<void> {
    await fs.promises.unlink(filePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    try {
      await fs.promises.rename(oldPath, newPath);
    } catch (err: unknown) {
      if ((err as { code?: string })?.code === 'EXDEV') {
        await fs.promises.copyFile(oldPath, newPath);
        await fs.promises.unlink(oldPath);
      } else {
        throw err;
      }
    }
  }

  async exists(targetPath: string): Promise<boolean> {
    try {
      await fs.promises.access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

export interface VaultStorageOptions {
  readonly baseDirectory?: string;
  readonly fileSystem?: FileSystemAdapter;
}

export class VaultStorageService {
  private readonly baseDirectory: string;
  private readonly cacheDirectory: string;
  private readonly vaultDirectory: string;
  private readonly fileSystem: FileSystemAdapter;

  constructor(options?: VaultStorageOptions) {
    this.baseDirectory = path.resolve(options?.baseDirectory ?? path.join(process.cwd(), '.vault_storage'));
    this.cacheDirectory = path.join(this.baseDirectory, 'cache', 'captures');
    this.vaultDirectory = path.join(this.baseDirectory, 'documents', 'vault');
    this.fileSystem = options?.fileSystem ?? new NodeFileSystemAdapter();
  }

  get baseDirectoryPath(): string {
    return this.baseDirectory;
  }

  get cacheDirectoryPath(): string {
    return this.cacheDirectory;
  }

  get vaultDirectoryPath(): string {
    return this.vaultDirectory;
  }

  async initStorageDirectories(): Promise<void> {
    await this.fileSystem.mkdir(this.cacheDirectory, { recursive: true });
    await this.fileSystem.mkdir(this.vaultDirectory, { recursive: true });
  }

  async saveTempCapture(imageBytes: Uint8Array): Promise<string> {
    if (!imageBytes || !(imageBytes instanceof Uint8Array) || imageBytes.length === 0) {
      throw new Error('Image bytes cannot be empty');
    }

    await this.initStorageDirectories();

    const id = randomUUID();
    const fileName = `temp_${id}.jpg`;
    const targetPath = path.resolve(this.cacheDirectory, fileName);

    await this.fileSystem.writeFile(targetPath, imageBytes);
    return targetPath;
  }

  async deleteTempCaptureImmediately(tempUri: string): Promise<boolean> {
    const safePath = this.resolveSafeTarget(this.cacheDirectory, tempUri);
    const fileName = path.basename(safePath);

    if (!fileName.startsWith('temp_')) {
      throw new Error('Security violation: Not a valid temporary capture file');
    }

    const exists = await this.fileSystem.exists(safePath);
    if (!exists) {
      return false;
    }

    await this.fileSystem.unlink(safePath);
    return true;
  }

  async moveToVault(tempUri: string): Promise<string> {
    const safeTempPath = this.resolveSafeTarget(this.cacheDirectory, tempUri);
    const fileName = path.basename(safeTempPath);

    if (!fileName.startsWith('temp_')) {
      throw new Error('Security violation: Not a valid temporary capture file');
    }

    const exists = await this.fileSystem.exists(safeTempPath);
    if (!exists) {
      throw new Error('Temporary capture file does not exist');
    }

    await this.initStorageDirectories();

    const vaultId = randomUUID();
    const vaultFileName = `${vaultId}.jpg`;
    const vaultPath = path.resolve(this.vaultDirectory, vaultFileName);

    await this.fileSystem.rename(safeTempPath, vaultPath);
    return vaultPath;
  }

  async deleteVaultItem(vaultUri: string): Promise<boolean> {
    const safeVaultPath = this.resolveSafeTarget(this.vaultDirectory, vaultUri);
    const exists = await this.fileSystem.exists(safeVaultPath);
    if (!exists) {
      return false;
    }

    await this.fileSystem.unlink(safeVaultPath);
    return true;
  }

  async getVaultItemBytes(vaultUri: string): Promise<Uint8Array> {
    const safeVaultPath = this.resolveSafeTarget(this.vaultDirectory, vaultUri);
    const exists = await this.fileSystem.exists(safeVaultPath);
    if (!exists) {
      throw new Error('Vault file not found');
    }

    return await this.fileSystem.readFile(safeVaultPath);
  }

  private resolveSafeTarget(targetDir: string, inputPath: string): string {
    if (!inputPath || typeof inputPath !== 'string' || inputPath.trim() === '') {
      throw new Error('Security violation: Empty path provided');
    }

    if (inputPath.includes('\0')) {
      throw new Error('Security violation: Null byte detected in path');
    }

    const resolvedTargetDir = path.resolve(targetDir);
    const resolvedBaseDir = path.resolve(this.baseDirectory);

    let candidate: string;
    if (path.isAbsolute(inputPath)) {
      candidate = path.resolve(inputPath);
    } else {
      const fromBase = path.resolve(resolvedBaseDir, inputPath);
      const fromTarget = path.resolve(resolvedTargetDir, inputPath);
      if (this.isStrictlyContained(resolvedTargetDir, fromBase)) {
        candidate = fromBase;
      } else {
        candidate = fromTarget;
      }
    }

    if (!this.isStrictlyContained(resolvedTargetDir, candidate)) {
      throw new Error('Security violation: Path traversal detected');
    }

    return candidate;
  }

  private isStrictlyContained(parentDir: string, candidatePath: string): boolean {
    const rel = path.relative(parentDir, candidatePath);
    return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
  }
}

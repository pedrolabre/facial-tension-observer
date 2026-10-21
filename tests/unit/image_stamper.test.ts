import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  APP_WATERMARK,
  calculateStampLayout,
  DEFAULT_FALLBACK_QUOTE,
  DefaultImageCompositor,
  formatCaptureDate,
  formatRigidityScore,
  ImageCompositorAdapter,
  ImageStamper,
  isStampResult,
  MockMediaLibraryAdapter,
  MockSharingAdapter,
  StampPayload,
  StampResult,
} from '../../src/services/stamper/image_stamper';
import { FileSystemAdapter } from '../../src/services/storage/vault_storage';

class InMemoryFileSystem implements FileSystemAdapter {
  private files = new Map<string, Uint8Array>();
  private dirs = new Set<string>();

  async mkdir(dirPath: string): Promise<void> {
    this.dirs.add(path.resolve(dirPath));
  }

  async writeFile(filePath: string, data: Uint8Array): Promise<void> {
    this.files.set(path.resolve(filePath), new Uint8Array(data));
  }

  async readFile(filePath: string): Promise<Uint8Array> {
    const data = this.files.get(path.resolve(filePath));
    if (!data) throw new Error(`File not found: ${filePath}`);
    return new Uint8Array(data);
  }

  async unlink(filePath: string): Promise<void> {
    this.files.delete(path.resolve(filePath));
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const data = await this.readFile(oldPath);
    await this.writeFile(newPath, data);
    await this.unlink(oldPath);
  }

  async exists(targetPath: string): Promise<boolean> {
    return this.files.has(path.resolve(targetPath));
  }
}

describe('image_stamper', () => {
  describe('calculateStampLayout', () => {
    it('calculates layout metrics preserving original dimensions and aspect ratio', () => {
      const layout = calculateStampLayout(1080, 1440);

      expect(layout.originalWidth).toBe(1080);
      expect(layout.originalHeight).toBe(1440);
      expect(layout.totalWidth).toBe(1080);
      expect(layout.bannerHeight).toBe(216);
      expect(layout.bannerY).toBe(1440);
      expect(layout.totalHeight).toBe(1656);
      expect(layout.backgroundColor).toBe('#000000');
      expect(layout.paddingX).toBe(54);
      expect(layout.quoteFontSize).toBe(60);
      expect(layout.telemetryFontSize).toBe(39);
      expect(layout.quoteY).toBeGreaterThan(layout.bannerY);
      expect(layout.telemetryY).toBeGreaterThan(layout.quoteY);
      expect(layout.totalWidth / layout.originalWidth).toBe(1);
    });

    it('enforces minimum banner height floor for small images', () => {
      const layout = calculateStampLayout(300, 200);

      expect(layout.originalWidth).toBe(300);
      expect(layout.originalHeight).toBe(200);
      expect(layout.bannerHeight).toBe(80);
      expect(layout.totalHeight).toBe(280);
      expect(layout.paddingX).toBe(16);
      expect(layout.quoteFontSize).toBeGreaterThanOrEqual(14);
      expect(layout.telemetryFontSize).toBeGreaterThanOrEqual(10);
    });

    it('rejects invalid or non-positive dimensions', () => {
      expect(() => calculateStampLayout(0, 1000)).toThrow('Invalid dimensions');
      expect(() => calculateStampLayout(1000, -50)).toThrow('Invalid dimensions');
      expect(() => calculateStampLayout(NaN, 1000)).toThrow('Invalid dimensions');
      expect(() => calculateStampLayout(1000, Infinity)).toThrow('Invalid dimensions');
    });
  });

  describe('helper functions', () => {
    it('formats date correctly for Date instances, numeric timestamps and ISO strings', () => {
      const fixedDate = new Date('2026-10-28T14:32:00Z');
      const formatted = formatCaptureDate(fixedDate);
      expect(formatted).toMatch(/28\/10\/2026 \d{2}:\d{2}/);

      const fromString = formatCaptureDate('2026-10-28T14:32:00.000Z');
      expect(fromString).toMatch(/28\/10\/2026 \d{2}:\d{2}/);

      const fromNumber = formatCaptureDate(fixedDate.getTime());
      expect(fromNumber).toMatch(/28\/10\/2026 \d{2}:\d{2}/);

      expect(formatCaptureDate('invalid-date')).toBe('invalid-date');
    });

    it('formats rigidity score with clamping', () => {
      expect(formatRigidityScore(0.88)).toBe('88%');
      expect(formatRigidityScore(0)).toBe('0%');
      expect(formatRigidityScore(1)).toBe('100%');
      expect(formatRigidityScore(-0.2)).toBe('0%');
      expect(formatRigidityScore(1.4)).toBe('100%');
    });

    it('discriminates StampResult from StampPayload via isStampResult', () => {
      const payload: StampPayload = {
        tensionScore: 0.85,
        imageBytes: new Uint8Array([1, 2, 3]),
      };
      const result: StampResult = {
        uri: '/tmp/stamp_1.jpg',
        bytes: new Uint8Array([1, 2, 3]),
        width: 1080,
        height: 1656,
        quote: '"Registramos um momento delicado."',
        telemetryText: 'Tensão: 88% | 28/10/2026 14:32 | facial-tension-observer',
      };

      expect(isStampResult(payload)).toBe(false);
      expect(isStampResult(result)).toBe(true);
    });
  });

  describe('adapters', () => {
    it('records share calls and respects availability flag in MockSharingAdapter', async () => {
      const adapter = new MockSharingAdapter();
      expect(await adapter.isAvailable()).toBe(true);

      await adapter.share({ uri: '/path/stamp_1.jpg', dialogTitle: 'Test' });
      expect(adapter.sharedCalls).toHaveLength(1);
      expect(adapter.sharedCalls[0]?.uri).toBe('/path/stamp_1.jpg');

      adapter.available = false;
      expect(await adapter.isAvailable()).toBe(false);
    });

    it('records saved URIs and respects permissions in MockMediaLibraryAdapter', async () => {
      const adapter = new MockMediaLibraryAdapter();
      expect(await adapter.requestPermissions()).toBe(true);

      await adapter.saveToLibrary('/path/stamp_2.jpg');
      expect(adapter.savedUris).toEqual(['/path/stamp_2.jpg']);

      adapter.permissionGranted = false;
      expect(await adapter.requestPermissions()).toBe(false);
    });

    it('appends metadata and returns dimensions in DefaultImageCompositor', async () => {
      const compositor = new DefaultImageCompositor();
      const layout = calculateStampLayout(1080, 1440);
      const source = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

      const composited = await compositor.composite({
        sourceBytes: source,
        layout,
        quote: '"Teste"',
        telemetry: 'Tensão: 90%',
      });

      expect(composited.length).toBeGreaterThan(source.length);
      const text = new TextDecoder().decode(composited);
      expect(text).toContain('[STAMP:1080x1656|QUOTE:"Teste"|TELEMETRY:Tensão: 90%]');

      const dims = await compositor.getImageDimensions(source);
      expect(dims).toEqual({ width: 1080, height: 1440 });
    });
  });

  describe('ImageStamper', () => {
    let mockFs: InMemoryFileSystem;
    let mockSharing: MockSharingAdapter;
    let mockMedia: MockMediaLibraryAdapter;
    let stamper: ImageStamper;

    beforeEach(() => {
      mockFs = new InMemoryFileSystem();
      mockSharing = new MockSharingAdapter();
      mockMedia = new MockMediaLibraryAdapter();
      stamper = new ImageStamper({
        fileSystem: mockFs,
        sharingAdapter: mockSharing,
        mediaLibraryAdapter: mockMedia,
        stampsDirectory: '/test/stamps',
      });
    });

    it('initializes with default options when none are passed', () => {
      const defaultStamper = new ImageStamper();
      expect(defaultStamper.targetDirectory).toContain(path.join('.vault_storage', 'cache', 'stamps'));
    });

    it('stamps an image from imageBytes with full banner layout and fallback quote', async () => {
      const sampleBytes = new Uint8Array([0xff, 0xd8, 0x01, 0x02, 0x03]);
      const result = await stamper.stampImage({
        imageBytes: sampleBytes,
        tensionScore: 0.88,
        quote: null,
        timestamp: new Date('2026-10-28T14:32:00Z'),
      });

      expect(path.basename(result.uri)).toMatch(/^stamp_[0-9a-f-]+\.jpg$/);
      expect(result.uri).toContain('stamps');
      expect(result.width).toBe(1080);
      expect(result.height).toBe(1656);
      expect(result.quote).toBe(`"${DEFAULT_FALLBACK_QUOTE}"`);
      expect(result.telemetryText).toContain('Tensão: 88%');
      expect(result.telemetryText).toContain(APP_WATERMARK);
      expect(await mockFs.exists(result.uri)).toBe(true);

      const savedBytes = await mockFs.readFile(result.uri);
      expect(savedBytes.length).toBe(result.bytes.length);
    });

    it('stamps an image with custom quote and custom dimensions', async () => {
      const sampleBytes = new Uint8Array([0x01, 0x02, 0x03]);
      const result = await stamper.stampImage({
        imageBytes: sampleBytes,
        tensionScore: 0.76,
        quote: 'Você jurava que estava calmo.',
        originalWidth: 800,
        originalHeight: 1200,
        timestamp: '2026-10-20T10:00:00Z',
      });

      expect(result.width).toBe(800);
      expect(result.height).toBe(1380);
      expect(result.quote).toBe('"Você jurava que estava calmo."');
      expect(result.telemetryText).toContain('Tensão: 76%');
    });

    it('avoids duplicate double quotes if the quote already contains them', async () => {
      const sampleBytes = new Uint8Array([0x01, 0x02]);
      const result = await stamper.stampImage({
        imageBytes: sampleBytes,
        tensionScore: 0.95,
        quote: '"A glabela não mente."',
      });

      expect(result.quote).toBe('"A glabela não mente."');
    });

    it('stamps an image loaded via imageUri', async () => {
      const sourcePath = '/test/source/capture.jpg';
      const sampleBytes = new Uint8Array([0xaa, 0xbb, 0xcc]);
      await mockFs.writeFile(sourcePath, sampleBytes);

      const result = await stamper.stampImage({
        imageUri: sourcePath,
        tensionScore: 0.82,
        quote: 'Tensão acumulada com sucesso.',
      });

      expect(result.quote).toBe('"Tensão acumulada com sucesso."');
      expect(await mockFs.exists(result.uri)).toBe(true);
    });

    it('throws error if neither imageBytes nor imageUri is provided', async () => {
      await expect(
        stamper.stampImage({
          tensionScore: 0.8,
        })
      ).rejects.toThrow('Image data or URI is required for stamping');
    });

    it('throws error if imageBytes is empty', async () => {
      await expect(
        stamper.stampImage({
          imageBytes: new Uint8Array([]),
          tensionScore: 0.8,
        })
      ).rejects.toThrow('Image data or URI is required for stamping');
    });

    it('invokes custom compositor adapter correctly', async () => {
      let capturedPayload: unknown = null;
      const customCompositor: ImageCompositorAdapter = {
        async composite(options) {
          capturedPayload = options;
          return new Uint8Array([0x09, 0x08]);
        },
      };

      const customStamper = new ImageStamper({
        fileSystem: mockFs,
        compositor: customCompositor,
        stampsDirectory: '/test/custom',
      });

      const res = await customStamper.stampImage({
        imageBytes: new Uint8Array([1, 2, 3]),
        tensionScore: 0.9,
        quote: 'Teste custom',
        originalWidth: 600,
        originalHeight: 800,
      });

      expect(capturedPayload).not.toBeNull();
      expect(res.bytes).toEqual(new Uint8Array([0x09, 0x08]));
    });

    it('shares a previously stamped StampResult via shareStampedImage', async () => {
      const stamped: StampResult = {
        uri: '/test/stamps/stamp_abc.jpg',
        bytes: new Uint8Array([1]),
        width: 1080,
        height: 1656,
        quote: '"Frase"',
        telemetryText: 'Tensão: 88%',
      };

      await stamper.shareStampedImage(stamped, { dialogTitle: 'Compartilhe' });

      expect(mockSharing.sharedCalls).toHaveLength(1);
      const call = mockSharing.sharedCalls[0];
      expect(call).toBeDefined();
      expect(call?.uri).toBe('/test/stamps/stamp_abc.jpg');
      expect(call?.dialogTitle).toBe('Compartilhe');
      expect(call?.mimeType).toBe('image/jpeg');
    });

    it('stamps on-the-fly and shares when passing StampPayload directly to shareStampedImage', async () => {
      const payload: StampPayload = {
        imageBytes: new Uint8Array([1, 2, 3]),
        tensionScore: 0.84,
        quote: 'Direto do payload',
      };

      await stamper.shareStampedImage(payload);

      expect(mockSharing.sharedCalls).toHaveLength(1);
      const call = mockSharing.sharedCalls[0];
      expect(call).toBeDefined();
      expect(path.basename(call?.uri ?? '')).toMatch(/^stamp_[0-9a-f-]+\.jpg$/);
    });

    it('throws error in shareStampedImage when sharing is unavailable', async () => {
      mockSharing.available = false;

      await expect(
        stamper.shareStampedImage({
          uri: '/test/stamps/stamp_test.jpg',
          bytes: new Uint8Array([1]),
          width: 100,
          height: 100,
          quote: 'Q',
          telemetryText: 'T',
        })
      ).rejects.toThrow('Sharing is not available on this platform');
    });

    it('saves a StampResult to media library via saveToMediaLibrary', async () => {
      const stamped: StampResult = {
        uri: '/test/stamps/stamp_save.jpg',
        bytes: new Uint8Array([1]),
        width: 1080,
        height: 1656,
        quote: '"Frase"',
        telemetryText: 'Tensão: 88%',
      };

      await stamper.saveToMediaLibrary(stamped);

      expect(mockMedia.savedUris).toEqual(['/test/stamps/stamp_save.jpg']);
    });

    it('stamps on-the-fly and saves to media library when passing StampPayload', async () => {
      const payload: StampPayload = {
        imageBytes: new Uint8Array([1, 2, 3]),
        tensionScore: 0.77,
        quote: 'Salvar no rolo',
      };

      await stamper.saveToMediaLibrary(payload);

      expect(mockMedia.savedUris).toHaveLength(1);
      const saved = mockMedia.savedUris[0];
      expect(saved).toBeDefined();
      expect(path.basename(saved ?? '')).toMatch(/^stamp_[0-9a-f-]+\.jpg$/);
    });

    it('throws error in saveToMediaLibrary when permission is denied', async () => {
      mockMedia.permissionGranted = false;

      await expect(
        stamper.saveToMediaLibrary({
          uri: '/test/stamps/stamp_denied.jpg',
          bytes: new Uint8Array([1]),
          width: 100,
          height: 100,
          quote: 'Q',
          telemetryText: 'T',
        })
      ).rejects.toThrow('Permission to save to media library was denied');
    });

    it('deletes a stamped file with prefix stamp_', async () => {
      const stamped = await stamper.stampImage({
        imageBytes: new Uint8Array([1, 2, 3]),
        tensionScore: 0.8,
      });

      expect(await mockFs.exists(stamped.uri)).toBe(true);

      const deleted = await stamper.deleteStampedFile(stamped.uri);
      expect(deleted).toBe(true);
      expect(await mockFs.exists(stamped.uri)).toBe(false);

      const deletedAgain = await stamper.deleteStampedFile(stamped.uri);
      expect(deletedAgain).toBe(false);
    });

    it('rejects deletion of files not starting with stamp_', async () => {
      await expect(stamper.deleteStampedFile('/test/stamps/regular_photo.jpg')).rejects.toThrow(
        'Security violation: Not a valid stamped image file'
      );
    });
  });

  describe('Node integration with actual file system', () => {
    let tempDir: string;
    let stamper: ImageStamper;

    beforeEach(async () => {
      tempDir = path.join(os.tmpdir(), `stamper_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      stamper = new ImageStamper({ stampsDirectory: tempDir });
    });

    afterEach(async () => {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // cleanup best effort
      }
    });

    it('writes and deletes physical file on disk', async () => {
      const sample = new Uint8Array([0xff, 0xd8, 0x11, 0x22]);
      const res = await stamper.stampImage({
        imageBytes: sample,
        tensionScore: 0.88,
        quote: 'Disco real',
      });

      expect(fs.existsSync(res.uri)).toBe(true);
      const readBack = await fs.promises.readFile(res.uri);
      expect(readBack.length).toBe(res.bytes.length);

      const removed = await stamper.deleteStampedFile(res.uri);
      expect(removed).toBe(true);
      expect(fs.existsSync(res.uri)).toBe(false);
    });
  });
});

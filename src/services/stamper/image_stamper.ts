import { randomUUID } from 'node:crypto';
import * as path from 'node:path';
import { FileSystemAdapter, NodeFileSystemAdapter } from '../storage/vault_storage';

export const DEFAULT_FALLBACK_QUOTE = 'Registramos um momento delicado.';
export const APP_WATERMARK = 'facial-tension-observer';

export interface StampLayoutMetrics {
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly bannerHeight: number;
  readonly bannerY: number;
  readonly totalWidth: number;
  readonly totalHeight: number;
  readonly quoteFontSize: number;
  readonly telemetryFontSize: number;
  readonly quoteY: number;
  readonly telemetryY: number;
  readonly paddingX: number;
  readonly backgroundColor: string;
}

export interface StampPayload {
  readonly imageBytes?: Uint8Array;
  readonly imageUri?: string;
  readonly quote?: string | null;
  readonly tensionScore: number;
  readonly timestamp?: string | number | Date;
  readonly originalWidth?: number;
  readonly originalHeight?: number;
}

export interface StampResult {
  readonly uri: string;
  readonly bytes: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly quote: string;
  readonly telemetryText: string;
}

export interface ShareOptions {
  readonly uri: string;
  readonly mimeType?: string;
  readonly dialogTitle?: string;
}

export interface SharingAdapter {
  share(options: ShareOptions): Promise<void>;
  isAvailable?(): Promise<boolean>;
}

export interface MediaLibraryAdapter {
  saveToLibrary(uri: string): Promise<void>;
  requestPermissions?(): Promise<boolean>;
}

export interface ImageCompositorAdapter {
  composite(options: {
    sourceBytes: Uint8Array;
    layout: StampLayoutMetrics;
    quote: string;
    telemetry: string;
  }): Promise<Uint8Array>;
  getImageDimensions?(sourceBytes: Uint8Array): Promise<{ width: number; height: number }>;
}

export interface ImageStamperOptions {
  readonly sharingAdapter?: SharingAdapter;
  readonly mediaLibraryAdapter?: MediaLibraryAdapter;
  readonly fileSystem?: FileSystemAdapter;
  readonly compositor?: ImageCompositorAdapter;
  readonly stampsDirectory?: string;
}

export interface IImageStamper {
  calculateLayout(width: number, height: number): StampLayoutMetrics;
  stampImage(payload: StampPayload): Promise<StampResult>;
  shareStampedImage(target: StampResult | StampPayload, options?: Partial<ShareOptions>): Promise<void>;
  saveToMediaLibrary(target: StampResult | StampPayload): Promise<void>;
  deleteStampedFile?(uri: string): Promise<boolean>;
}

export class MockSharingAdapter implements SharingAdapter {
  public sharedCalls: ShareOptions[] = [];
  public available = true;
  async isAvailable(): Promise<boolean> { return this.available; }
  async share(options: ShareOptions): Promise<void> { this.sharedCalls.push(options); }
}

export class MockMediaLibraryAdapter implements MediaLibraryAdapter {
  public savedUris: string[] = [];
  public permissionGranted = true;
  async requestPermissions(): Promise<boolean> { return this.permissionGranted; }
  async saveToLibrary(uri: string): Promise<void> { this.savedUris.push(uri); }
}

export class DefaultImageCompositor implements ImageCompositorAdapter {
  async composite(options: {
    sourceBytes: Uint8Array;
    layout: StampLayoutMetrics;
    quote: string;
    telemetry: string;
  }): Promise<Uint8Array> {
    const metaString = `[STAMP:${options.layout.totalWidth}x${options.layout.totalHeight}|QUOTE:${options.quote}|TELEMETRY:${options.telemetry}]`;
    const metaBytes = new TextEncoder().encode(metaString);
    const combined = new Uint8Array(options.sourceBytes.length + metaBytes.length);
    combined.set(options.sourceBytes, 0);
    combined.set(metaBytes, options.sourceBytes.length);
    return combined;
  }

  async getImageDimensions(sourceBytes: Uint8Array): Promise<{ width: number; height: number }> {
    if (sourceBytes.length >= 8 && sourceBytes[0] === 0xff && sourceBytes[1] === 0xd8) {
      return { width: 1080, height: 1440 };
    }
    return { width: 1080, height: 1440 };
  }
}

export function formatCaptureDate(val: string | number | Date): string {
  const num = val instanceof Date ? val.getTime() : typeof val === 'number' ? val : Date.parse(val.includes('T') ? val : `${val.replace(' ', 'T')}Z`);
  if (Number.isNaN(num)) return String(val);
  const d = new Date(num);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatRigidityScore(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export function isStampResult(target: StampResult | StampPayload): target is StampResult {
  return 'bytes' in target && 'telemetryText' in target;
}

export function calculateStampLayout(width: number, height: number): StampLayoutMetrics {
  if (width <= 0 || height <= 0 || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error('Invalid dimensions for layout calculation');
  }
  const originalWidth = Math.round(width);
  const originalHeight = Math.round(height);
  const bannerHeight = Math.max(80, Math.round(originalHeight * 0.15));
  const bannerY = originalHeight;
  return {
    originalWidth,
    originalHeight,
    bannerHeight,
    bannerY,
    totalWidth: originalWidth,
    totalHeight: originalHeight + bannerHeight,
    quoteFontSize: Math.max(14, Math.round(bannerHeight * 0.28)),
    telemetryFontSize: Math.max(10, Math.round(bannerHeight * 0.18)),
    quoteY: bannerY + Math.round(bannerHeight * 0.42),
    telemetryY: bannerY + Math.round(bannerHeight * 0.78),
    paddingX: Math.max(16, Math.round(originalWidth * 0.05)),
    backgroundColor: '#000000',
  };
}

export class ImageStamper implements IImageStamper {
  private readonly sharingAdapter: SharingAdapter;
  private readonly mediaLibraryAdapter: MediaLibraryAdapter;
  private readonly fileSystem: FileSystemAdapter;
  private readonly compositor: ImageCompositorAdapter;
  private readonly stampsDirectory: string;

  constructor(options?: ImageStamperOptions) {
    this.sharingAdapter = options?.sharingAdapter ?? new MockSharingAdapter();
    this.mediaLibraryAdapter = options?.mediaLibraryAdapter ?? new MockMediaLibraryAdapter();
    this.fileSystem = options?.fileSystem ?? new NodeFileSystemAdapter();
    this.compositor = options?.compositor ?? new DefaultImageCompositor();
    this.stampsDirectory = path.resolve(
      options?.stampsDirectory ?? path.join(process.cwd(), '.vault_storage', 'cache', 'stamps')
    );
  }

  get targetDirectory(): string {
    return this.stampsDirectory;
  }

  public calculateLayout(width: number, height: number): StampLayoutMetrics {
    return calculateStampLayout(width, height);
  }

  public async stampImage(payload: StampPayload): Promise<StampResult> {
    let sourceBytes = payload.imageBytes;
    if (!sourceBytes && payload.imageUri) {
      sourceBytes = await this.fileSystem.readFile(payload.imageUri);
    }
    if (!sourceBytes || sourceBytes.length === 0) {
      throw new Error('Image data or URI is required for stamping');
    }

    const rawQuote = payload.quote?.trim();
    const finalQuoteText = rawQuote && rawQuote.length > 0 ? rawQuote : DEFAULT_FALLBACK_QUOTE;
    const cleanQuote = finalQuoteText.replace(/^["']|["']$/g, '');
    const formattedQuote = `"${cleanQuote}"`;

    const formattedRigidity = formatRigidityScore(payload.tensionScore);
    const formattedDate = formatCaptureDate(payload.timestamp ?? new Date());
    const telemetryText = `Tensão: ${formattedRigidity} | ${formattedDate} | ${APP_WATERMARK}`;

    let width = payload.originalWidth ?? 0;
    let height = payload.originalHeight ?? 0;
    if (width <= 0 || height <= 0) {
      if (this.compositor.getImageDimensions) {
        const dims = await this.compositor.getImageDimensions(sourceBytes);
        width = dims.width;
        height = dims.height;
      } else {
        width = 1080;
        height = 1440;
      }
    }

    const layout = this.calculateLayout(width, height);
    const compositeBytes = await this.compositor.composite({
      sourceBytes,
      layout,
      quote: formattedQuote,
      telemetry: telemetryText,
    });

    await this.fileSystem.mkdir(this.stampsDirectory, { recursive: true });

    const id = randomUUID();
    const fileName = `stamp_${id}.jpg`;
    const targetPath = path.resolve(this.stampsDirectory, fileName);

    await this.fileSystem.writeFile(targetPath, compositeBytes);

    return {
      uri: targetPath,
      bytes: compositeBytes,
      width: layout.totalWidth,
      height: layout.totalHeight,
      quote: formattedQuote,
      telemetryText,
    };
  }

  public async shareStampedImage(
    target: StampResult | StampPayload,
    options?: Partial<ShareOptions>
  ): Promise<void> {
    const isAvailable = this.sharingAdapter.isAvailable ? await this.sharingAdapter.isAvailable() : true;
    if (!isAvailable) {
      throw new Error('Sharing is not available on this platform');
    }

    const uri = isStampResult(target) ? target.uri : (await this.stampImage(target)).uri;

    await this.sharingAdapter.share({
      uri,
      mimeType: 'image/jpeg',
      dialogTitle: 'Compartilhar flagra de tensão',
      ...options,
    });
  }

  public async saveToMediaLibrary(target: StampResult | StampPayload): Promise<void> {
    const hasPermission = this.mediaLibraryAdapter.requestPermissions ? await this.mediaLibraryAdapter.requestPermissions() : true;
    if (!hasPermission) {
      throw new Error('Permission to save to media library was denied');
    }

    const uri = isStampResult(target) ? target.uri : (await this.stampImage(target)).uri;

    await this.mediaLibraryAdapter.saveToLibrary(uri);
  }

  public async deleteStampedFile(uri: string): Promise<boolean> {
    const fileName = path.basename(uri);
    if (!fileName.startsWith('stamp_')) {
      throw new Error('Security violation: Not a valid stamped image file');
    }
    const exists = await this.fileSystem.exists(uri);
    if (!exists) {
      return false;
    }
    await this.fileSystem.unlink(uri);
    return true;
  }
}

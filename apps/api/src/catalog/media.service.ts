import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { MediaUploadDto } from './dto/inventory.dto';

// The API container is capped at 512 MB: one libvips thread and no operation cache keep
// memory flat; uploads are small and already resized in the browser.
sharp.concurrency(1);
sharp.cache(false);

const INPUT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const MAX_BYTES = 750_000;
const GENERATED_MAX_BYTES = 8_000_000;
export const MEDIA_MAX_EDGE_PX = 1600;
export const MEDIA_WEBP_QUALITY = 82;
const MESSAGING_MAX_EDGE_PX = 1200;
const MESSAGING_JPEG_QUALITY = 82;
const MESSAGING_MAX_SOURCE_BYTES = 5_000_000;
/** Rejects decompression bombs (tiny files declaring huge dimensions). */
const MAX_INPUT_PIXELS = 40_000_000;
/** Names are random and never reused, so caches (browser, CloudFront) may keep them forever. */
export const MEDIA_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Random names only: the public route never touches paths chosen by a client. Older uploads may be jpg/png. */
export const MEDIA_FILE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

function sniff(bytes: Buffer): (typeof INPUT_TYPES)[number] | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

type S3Target = { client: S3Client; bucket: string; cdnBase: string };

/**
 * Product photos, always stored as WebP (EXIF orientation applied, metadata stripped, sRGB,
 * longest side ≤ 1600 px). `MEDIA_STORAGE=s3` writes to a private bucket served through
 * CloudFront (Origin Access Control); `local` (default) writes to `UPLOADS_DIR`. The local
 * route keeps serving files uploaded before switching to S3.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly dir: string;
  private readonly publicBase: string;
  private readonly s3: S3Target | null;

  constructor(config: ConfigService) {
    this.dir = resolve(config.get<string>('UPLOADS_DIR') ?? 'uploads');
    this.publicBase = (config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
    this.s3 =
      config.get<string>('MEDIA_STORAGE') === 's3'
        ? {
            client: new S3Client({
              region: config.getOrThrow<string>('AWS_REGION'),
              maxAttempts: 3,
              requestHandler: { connectionTimeout: 3_000, requestTimeout: 15_000 },
            }),
            bucket: config.getOrThrow<string>('MEDIA_S3_BUCKET'),
            cdnBase: config.getOrThrow<string>('MEDIA_CDN_URL').replace(/\/$/, ''),
          }
        : null;
  }

  async upload(tenantId: string, dto: MediaUploadDto): Promise<{ url: string }> {
    const bytes = Buffer.from(dto.data, 'base64');
    const type = sniff(bytes);
    if (!type || type !== dto.contentType || bytes.length > MAX_BYTES) {
      throw new BadRequestException('Sube una imagen JPG, PNG o WebP de hasta 750 KB.');
    }
    return this.save(tenantId, await this.toWebp(bytes));
  }

  /** Stores an image made on the server (not a client upload), such as a generated store photo. */
  async storeGenerated(tenantId: string, bytes: Buffer): Promise<{ url: string }> {
    if (!sniff(bytes) || bytes.length > GENERATED_MAX_BYTES) {
      throw new ServiceUnavailableException('No pudimos guardar la imagen. Intenta de nuevo en unos segundos.');
    }
    return this.save(tenantId, await this.toWebp(bytes));
  }

  private async save(tenantId: string, webp: Buffer): Promise<{ url: string }> {
    const file = `${randomBytes(16).toString('hex')}.webp`;
    if (this.s3) return { url: await this.putObject(this.s3, `media/${tenantId}/${file}`, webp) };

    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, file), webp, { flag: 'wx' });
    return { url: `${this.publicBase}/media/${file}` };
  }

  /** True for URLs this service returned to the tenant (its S3 prefix, or a local upload). */
  isOwnUpload(tenantId: string, url: string): boolean {
    const prefix = this.s3 ? `${this.s3.cdnBase}/media/${tenantId}/` : `${this.publicBase}/media/`;
    return url.startsWith(prefix) && MEDIA_FILE.test(url.slice(prefix.length));
  }

  async read(file: string): Promise<{ bytes: Buffer; contentType: string }> {
    if (!MEDIA_FILE.test(file)) throw new NotFoundException();
    try {
      const bytes = await readFile(join(this.dir, file));
      return { bytes, contentType: CONTENT_TYPES[file.split('.')[1]] };
    } catch {
      throw new NotFoundException();
    }
  }

  /**
   * JPEG copy of a stored product photo for channels that reject WebP (WhatsApp accepts
   * only JPEG/PNG images). Only URLs from this service's own storage are read, so a
   * product URL can never make the API fetch arbitrary hosts. Null when unavailable.
   */
  async jpegForMessaging(url: string): Promise<Buffer | null> {
    try {
      const bytes = await this.readOwned(url);
      if (!bytes) return null;
      return await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false })
        .rotate()
        .resize({ width: MESSAGING_MAX_EDGE_PX, height: MESSAGING_MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: MESSAGING_JPEG_QUALITY, mozjpeg: true })
        .toBuffer();
    } catch (error) {
      this.logger.warn(`Messaging image conversion failed: ${(error as Error).name}`);
      return null;
    }
  }

  private async readOwned(url: string): Promise<Buffer | null> {
    const localPrefix = `${this.publicBase}/media/`;
    if (url.startsWith(localPrefix)) {
      return (await this.read(url.slice(localPrefix.length))).bytes;
    }
    const target = this.s3;
    if (!target || !url.startsWith(`${target.cdnBase}/media/`)) return null;
    const response = await fetch(url, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
    const length = Number(response.headers.get('content-length') ?? 0);
    if (!response.ok || length > MESSAGING_MAX_SOURCE_BYTES) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > MESSAGING_MAX_SOURCE_BYTES ? null : bytes;
  }

  /**
   * Best-effort delete of photos the caller no longer references. Only S3 objects under this
   * tenant's prefix are touched; foreign URLs and local files (no owner in their name) are kept.
   */
  async remove(tenantId: string, urls: Iterable<string>): Promise<void> {
    const target = this.s3;
    if (!target) return;
    const prefix = `${target.cdnBase}/media/${tenantId}/`;
    const keys = [...new Set(urls)]
      .filter((url) => url.startsWith(prefix) && MEDIA_FILE.test(url.slice(prefix.length)))
      .map((url) => url.slice(target.cdnBase.length + 1));
    for (let i = 0; i < keys.length; i += 1000) {
      try {
        const { Errors } = await target.client.send(
          new DeleteObjectsCommand({
            Bucket: target.bucket,
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }),
        );
        if (Errors?.length) this.logger.warn(`S3 delete skipped ${Errors.length} object(s): ${Errors[0].Code}`);
      } catch (error) {
        this.logger.warn(`S3 delete failed: ${(error as Error).name}`);
      }
    }
  }

  private async toWebp(bytes: Buffer): Promise<Buffer> {
    try {
      return await sharp(bytes, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false })
        .rotate()
        .resize({ width: MEDIA_MAX_EDGE_PX, height: MEDIA_MAX_EDGE_PX, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: MEDIA_WEBP_QUALITY, smartSubsample: true })
        .toBuffer();
    } catch {
      throw new BadRequestException('No pudimos procesar la imagen. Prueba con otro archivo.');
    }
  }

  private async putObject(target: S3Target, key: string, bytes: Buffer): Promise<string> {
    try {
      await target.client.send(
        new PutObjectCommand({
          Bucket: target.bucket,
          Key: key,
          Body: bytes,
          ContentType: 'image/webp',
          ContentLength: bytes.length,
          CacheControl: MEDIA_CACHE_CONTROL,
          IfNoneMatch: '*',
        }),
      );
    } catch (error) {
      this.logger.error(`S3 upload failed: ${(error as Error).name}`);
      throw new ServiceUnavailableException('No pudimos guardar la imagen. Intenta de nuevo en unos segundos.');
    }
    return `${target.cdnBase}/${key}`;
  }
}

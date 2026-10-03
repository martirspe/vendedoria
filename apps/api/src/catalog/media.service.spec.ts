import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DeleteObjectsCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadRequestException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { MEDIA_CACHE_CONTROL, MEDIA_MAX_EDGE_PX, MediaService } from './media.service';

const CDN = 'https://cdn.example.pe';
const solid = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: '#c8f542' } });
const asUpload = (contentType: 'image/jpeg' | 'image/png' | 'image/webp', bytes: Buffer) => ({
  contentType,
  data: bytes.toString('base64'),
});

describe('MediaService', () => {
  let png: Buffer;
  beforeAll(async () => {
    png = await solid(2400, 1200).png().toBuffer();
  });
  afterEach(() => jest.restoreAllMocks());

  describe('s3 storage', () => {
    const service = () =>
      new MediaService(
        new ConfigService({
          MEDIA_STORAGE: 's3',
          AWS_REGION: 'us-east-1',
          MEDIA_S3_BUCKET: 'vendedoria-media',
          MEDIA_CDN_URL: `${CDN}/`,
        }),
      );

    it('stores a resized WebP as a private, immutable object under the tenant prefix', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
      const { url } = await service().upload('tenant-a', asUpload('image/png', png));

      expect(url).toMatch(/^https:\/\/cdn\.example\.pe\/media\/tenant-a\/[a-f0-9]{32}\.webp$/);
      const command = send.mock.calls[0][0] as PutObjectCommand;
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket: 'vendedoria-media',
        Key: url.replace(`${CDN}/`, ''),
        ContentType: 'image/webp',
        CacheControl: MEDIA_CACHE_CONTROL,
        IfNoneMatch: '*',
      });
      expect(command.input).not.toHaveProperty('ACL');
      const stored = await sharp(command.input.Body as Buffer).metadata();
      expect(stored).toMatchObject({ format: 'webp', width: MEDIA_MAX_EDGE_PX, height: MEDIA_MAX_EDGE_PX / 2 });
    });

    it('applies the EXIF orientation and strips metadata', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
      const rotated = await solid(400, 200).jpeg().withMetadata({ orientation: 6 }).toBuffer();
      await service().upload('tenant-a', asUpload('image/jpeg', rotated));

      const stored = await sharp((send.mock.calls[0][0] as PutObjectCommand).input.Body as Buffer).metadata();
      expect(stored).toMatchObject({ width: 200, height: 400 });
      expect(stored.orientation).toBeUndefined();
      expect(stored.exif).toBeUndefined();
    });

    it('rejects undecodable files and mismatched types before calling S3', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send');
      const corrupt = Buffer.concat([png.subarray(0, 16), Buffer.alloc(64)]);
      await expect(service().upload('tenant-a', asUpload('image/png', corrupt))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service().upload('tenant-a', asUpload('image/jpeg', png))).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(send).not.toHaveBeenCalled();
    });

    it('hides provider errors behind a retryable message', async () => {
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('AccessDenied') as never);
      await expect(service().upload('tenant-a', asUpload('image/png', png))).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('deletes only objects under the tenant prefix', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({} as never);
      const own = `${CDN}/media/tenant-a/${'a'.repeat(32)}.webp`;
      await service().remove('tenant-a', [
        own,
        own,
        `${CDN}/media/tenant-b/${'b'.repeat(32)}.webp`,
        `${CDN}/media/tenant-a/../tenant-b/${'c'.repeat(32)}.webp`,
        `https://app.example.pe/api/v1/media/${'d'.repeat(32)}.webp`,
        'https://other.example.com/photo.webp',
      ]);

      expect(send).toHaveBeenCalledTimes(1);
      const command = send.mock.calls[0][0] as DeleteObjectsCommand;
      expect(command).toBeInstanceOf(DeleteObjectsCommand);
      expect(command.input.Delete?.Objects).toEqual([{ Key: `media/tenant-a/${'a'.repeat(32)}.webp` }]);
    });

    it('never fails the caller when a delete fails', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(new Error('AccessDenied') as never);
      await expect(
        service().remove('tenant-a', [`${CDN}/media/tenant-a/${'a'.repeat(32)}.webp`]),
      ).resolves.toBeUndefined();
    });
  });

  describe('local storage', () => {
    let dir: string;
    beforeEach(async () => {
      dir = await mkdtemp(join(tmpdir(), 'media-'));
    });
    afterEach(() => rm(dir, { recursive: true, force: true }));

    it('stores a WebP file, serves it back and never deletes local files', async () => {
      const send = jest.spyOn(S3Client.prototype, 'send');
      const media = new MediaService(
        new ConfigService({ UPLOADS_DIR: dir, PUBLIC_API_BASE_URL: 'https://app.example.pe/api/v1' }),
      );
      const { url } = await media.upload('tenant-a', asUpload('image/png', png));
      expect(url).toMatch(/^https:\/\/app\.example\.pe\/api\/v1\/media\/[a-f0-9]{32}\.webp$/);

      const file = url.split('/').pop()!;
      const served = await media.read(file);
      expect(served.contentType).toBe('image/webp');
      await expect(media.read('../secret.png')).rejects.toThrow();

      await media.remove('tenant-a', [url]);
      await expect(media.read(file)).resolves.toBeDefined();
      expect(send).not.toHaveBeenCalled();
    });

    it('converts its own photos to JPEG for WhatsApp and never fetches foreign URLs', async () => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const fetchSpy = jest.spyOn(global, 'fetch');
      const media = new MediaService(
        new ConfigService({ UPLOADS_DIR: dir, PUBLIC_API_BASE_URL: 'https://app.example.pe/api/v1' }),
      );
      const { url } = await media.upload('tenant-a', asUpload('image/png', png));

      const jpeg = await media.jpegForMessaging(url);
      expect(await sharp(jpeg!).metadata()).toMatchObject({ format: 'jpeg', width: 1200, height: 600 });
      await expect(media.jpegForMessaging('http://169.254.169.254/latest/meta-data')).resolves.toBeNull();
      await expect(
        media.jpegForMessaging('https://app.example.pe/api/v1/media/../../etc/passwd'),
      ).resolves.toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });
});

import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MediaUploadDto } from './dto/inventory.dto';

const EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const CONTENT_TYPES: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
/** Random names only: the public route never touches paths chosen by a client. */
export const MEDIA_FILE = /^[a-f0-9]{32}\.(jpg|png|webp)$/;

function sniff(bytes: Buffer): keyof typeof EXTENSIONS | null {
  if (bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Product photos on a local volume (`UPLOADS_DIR`), served publicly by file name. */
@Injectable()
export class MediaService {
  private readonly dir: string;
  private readonly publicBase: string;

  constructor(config: ConfigService) {
    this.dir = resolve(config.get<string>('UPLOADS_DIR') ?? 'uploads');
    this.publicBase = (config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1').replace(/\/$/, '');
  }

  async upload(dto: MediaUploadDto): Promise<{ url: string }> {
    const bytes = Buffer.from(dto.data, 'base64');
    const type = sniff(bytes);
    if (!type || type !== dto.contentType || bytes.length > 750_000) {
      throw new BadRequestException('Sube una imagen JPG, PNG o WebP de hasta 750 KB.');
    }
    const file = `${randomBytes(16).toString('hex')}.${EXTENSIONS[type]}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, file), bytes, { flag: 'wx' });
    return { url: `${this.publicBase}/media/${file}` };
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
}

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decryptSecret, encryptSecret, parseCredentialsKey } from '../payments/credentials-cipher';

@Injectable()
export class ChannelCredentialsService {
  constructor(private readonly config: ConfigService) {}

  get configured(): boolean {
    return Boolean(parseCredentialsKey(this.config.get<string>('CHANNEL_CREDENTIALS_KEY')));
  }

  seal(value: string): string {
    return `enc:${encryptSecret(this.key(), value)}`;
  }

  open(value: string): string {
    // Existing installations keep working until their next authorized reconnection.
    if (!value.startsWith('enc:')) return value;
    try {
      return decryptSecret(this.key(), value.slice(4));
    } catch {
      throw new ServiceUnavailableException('No pudimos recuperar la conexión. Contacta con soporte.');
    }
  }

  private key(): Buffer {
    const key = parseCredentialsKey(this.config.get<string>('CHANNEL_CREDENTIALS_KEY'));
    if (!key) throw new ServiceUnavailableException('La conexión de WhatsApp no está disponible. Contacta con soporte.');
    return key;
  }
}

import { createHmac } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ConversationsService } from '../conversations/conversations.service';
import type { PrismaService } from '../prisma/prisma.service';
import { ChannelsService } from './channels.service';
import type { MetaWhatsAppClient } from './meta-whatsapp.client';

function service(env: Record<string, string>) {
  // A plain lookup: ConfigService would let the real process.env (NODE_ENV=test) win.
  const config = { get: (key: string) => env[key] } as unknown as ConfigService;
  return new ChannelsService(
    {} as PrismaService,
    config,
    {} as ConversationsService,
    {} as MetaWhatsAppClient,
  );
}

const sign = (secret: string, body: Buffer) =>
  `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

describe('ChannelsService.assertMetaSignature', () => {
  const body = Buffer.from('{"entry":[{"changes":[{"value":{"text":"\\u00bfHola?"}}]}]}');

  it('accepts a signature computed over the exact raw bytes', () => {
    const channels = service({ META_APP_SECRET: 'app-secret', NODE_ENV: 'production' });
    expect(() => channels.assertMetaSignature(body, sign('app-secret', body))).not.toThrow();
  });

  it('rejects a wrong, missing or re-serialized signature', () => {
    const channels = service({ META_APP_SECRET: 'app-secret', NODE_ENV: 'production' });
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(body.toString())));
    expect(() => channels.assertMetaSignature(body, sign('other', body))).toThrow(UnauthorizedException);
    expect(() => channels.assertMetaSignature(body, undefined)).toThrow(UnauthorizedException);
    expect(() => channels.assertMetaSignature(undefined, sign('app-secret', body))).toThrow(
      UnauthorizedException,
    );
    expect(() => channels.assertMetaSignature(body, sign('app-secret', reserialized))).toThrow(
      UnauthorizedException,
    );
  });

  it('fails closed in production when the app secret is missing', () => {
    expect(() => service({ NODE_ENV: 'production' }).assertMetaSignature(body)).toThrow(
      UnauthorizedException,
    );
    expect(() => service({ NODE_ENV: 'development' }).assertMetaSignature(body)).not.toThrow();
  });
});

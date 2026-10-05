import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

export type TikTokTokens = {
  access_token: string;
  refresh_token: string;
  open_id: string;
  scope: string;
  expires_in: number;
  refresh_expires_in: number;
};

export function verifyTikTokSignature(
  secret: string,
  signature: string | undefined,
  body: Buffer,
  now = Date.now(),
): boolean {
  if (!secret || !signature) return false;
  const parts = signature.split(',').map((part) => part.trim().split('='));
  const timestamp = parts.find(([key]) => key === 't')?.[1];
  const signatures = parts
    .filter(([key]) => key === 's')
    .map(([, value]) => value);
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.`)
    .update(body)
    .digest();
  return signatures.some((value) => {
    if (!/^[a-f0-9]{64}$/i.test(value ?? '')) return false;
    const supplied = Buffer.from(value, 'hex');
    return (
      supplied.length === expected.length && timingSafeEqual(supplied, expected)
    );
  });
}

@Injectable()
export class TikTokClient {
  constructor(private readonly config: ConfigService) {}
  get available(): boolean {
    return Boolean(
      this.config.get<string>('TIKTOK_CLIENT_KEY') &&
      this.config.get<string>('TIKTOK_CLIENT_SECRET') &&
      this.config.get<string>('TIKTOK_REDIRECT_URI') &&
      this.config.get<string>('PAYMENT_CREDENTIALS_KEY'),
    );
  }
  authorizationUrl(state: string): string {
    this.assertConfigured();
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.search = new URLSearchParams({
      client_key: this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY'),
      redirect_uri: this.config.getOrThrow<string>('TIKTOK_REDIRECT_URI'),
      response_type: 'code',
      scope: 'user.info.basic',
      state,
      disable_auto_auth: '1',
    }).toString();
    return url.toString();
  }
  async exchange(code: string): Promise<TikTokTokens> {
    return this.tokens({
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.config.getOrThrow<string>('TIKTOK_REDIRECT_URI'),
    });
  }
  async refresh(refreshToken: string): Promise<TikTokTokens> {
    return this.tokens({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    });
  }
  async verifyAccount(accessToken: string, accountId: string): Promise<void> {
    const response = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id',
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      },
    );
    const payload = (await response.json()) as {
      data?: { user?: { open_id?: string } };
      error?: { code?: string };
    };
    if (
      !response.ok ||
      payload.error?.code !== 'ok' ||
      payload.data?.user?.open_id !== accountId
    )
      throw new UnauthorizedException(
        'TikTok requiere que vuelvas a conectar tu cuenta.',
      );
  }
  async revoke(accessToken: string): Promise<void> {
    await this.request('revoke', { token: accessToken });
  }
  private assertConfigured(): void {
    if (!this.available)
      throw new ServiceUnavailableException(
        'La conexión de cuentas TikTok aún no está habilitada. Puedes gestionar tus ventas LIVE manualmente.',
      );
  }
  private async tokens(fields: Record<string, string>): Promise<TikTokTokens> {
    const data = (await this.request('token', fields)) as Partial<TikTokTokens>;
    if (
      !data.access_token ||
      !data.refresh_token ||
      !data.open_id ||
      typeof data.scope !== 'string' ||
      !Number.isFinite(data.expires_in) ||
      !Number.isFinite(data.refresh_expires_in) ||
      (data.expires_in ?? 0) <= 0 ||
      (data.refresh_expires_in ?? 0) <= 0
    )
      throw new BadGatewayException(
        'TikTok no devolvió una autorización válida. Vuelve a conectar tu cuenta.',
      );
    return data as TikTokTokens;
  }
  private async request(
    action: 'token' | 'revoke',
    fields: Record<string, string>,
  ): Promise<unknown> {
    this.assertConfigured();
    try {
      const response = await fetch(
        `https://open.tiktokapis.com/v2/oauth/${action}/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_key: this.config.getOrThrow<string>('TIKTOK_CLIENT_KEY'),
            client_secret: this.config.getOrThrow<string>(
              'TIKTOK_CLIENT_SECRET',
            ),
            ...fields,
          }),
          signal: AbortSignal.timeout(8000),
        },
      );
      const data: unknown = await response.json();
      if (!response.ok || !data || typeof data !== 'object' || 'error' in data)
        throw new Error('Authorization failed');
      return data;
    } catch {
      // Do not expose provider bodies, tokens or fetch errors.
      throw new BadGatewayException(
        'No pudimos completar la conexión con TikTok. Vuelve a intentarlo.',
      );
    }
  }
}

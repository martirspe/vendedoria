import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUserPayload } from '../common/types/auth-user';
import { decryptSecret, encryptSecret, parseCredentialsKey } from './credentials-cipher';
import { MercadoPagoError, mercadoPago } from './mercadopago.client';
import { ConnectPaymentAccountDto } from './dto/payment-account.dto';

const PROVIDER = 'mercadopago';
const MANAGER_ROLES = ['OWNER', 'ADMIN'];

export type MerchantCredentials = {
  accessToken: string;
  webhookSecret: string | null;
  publicKey: string;
  liveMode: boolean;
};

export type PaymentAccountView = {
  provider: 'mercadopago';
  connected: boolean;
  publicKey: string | null;
  liveMode: boolean;
  externalUserId: string | null;
  verifiedAt: Date | null;
  hasWebhookSecret: boolean;
  webhookUrl: string;
  /** Local development without credentials: payment links use the simulator. */
  simulatorAvailable: boolean;
  encryptionConfigured: boolean;
};

@Injectable()
export class MerchantAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Production never falls back to the simulator. */
  simulatorAllowed(): boolean {
    return this.config.get<string>('NODE_ENV') !== 'production';
  }

  webhookUrl(tenantId: string): string {
    const base = (
      this.config.get<string>('PUBLIC_API_BASE_URL') ?? 'http://localhost:3000/api/v1'
    ).replace(/\/$/, '');
    return `${base}/webhooks/mercadopago/${tenantId}`;
  }

  async view(tenantId: string): Promise<PaymentAccountView> {
    const account = await this.prisma.merchantPaymentAccount.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
    });
    return {
      provider: PROVIDER,
      connected: Boolean(account?.verifiedAt),
      publicKey: account?.publicKey ?? null,
      liveMode: account?.liveMode ?? false,
      externalUserId: account?.externalUserId ?? null,
      verifiedAt: account?.verifiedAt ?? null,
      hasWebhookSecret: Boolean(account?.webhookSecretEnc),
      webhookUrl: this.webhookUrl(tenantId),
      simulatorAvailable: this.simulatorAllowed(),
      encryptionConfigured: Boolean(this.key(false)),
    };
  }

  async connect(
    user: AuthUserPayload,
    dto: ConnectPaymentAccountDto,
  ): Promise<PaymentAccountView> {
    this.assertManager(user);
    const key = this.key(true);
    const existing = await this.prisma.merchantPaymentAccount.findUnique({
      where: { tenantId_provider: { tenantId: user.tenantId, provider: PROVIDER } },
    });
    const accessToken =
      dto.accessToken?.trim() ||
      (existing ? decryptSecret(key, existing.accessTokenEnc) : null);
    if (!accessToken) {
      throw new BadRequestException('Pega el Access Token de tu cuenta de Mercado Pago.');
    }

    let externalUserId: string;
    try {
      const me = await mercadoPago.me(accessToken);
      if (me.site_id && me.site_id !== 'MPE') {
        throw new BadRequestException(
          'La cuenta de Mercado Pago debe ser de Perú para cobrar en soles.',
        );
      }
      externalUserId = String(me.id);
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      if (error instanceof MercadoPagoError && (error.status === 401 || error.status === 403)) {
        throw new BadRequestException(
          'Mercado Pago rechazó el Access Token. Cópialo de nuevo desde Tus integraciones > Credenciales.',
        );
      }
      throw new ServiceUnavailableException(
        'No pudimos verificar la cuenta con Mercado Pago. Intenta de nuevo en unos minutos.',
      );
    }

    const webhookSecret = dto.webhookSecret?.trim();
    const data = {
      accessTokenEnc: encryptSecret(key, accessToken),
      webhookSecretEnc: webhookSecret
        ? encryptSecret(key, webhookSecret)
        : (existing?.webhookSecretEnc ?? null),
      publicKey: dto.publicKey.trim(),
      liveMode: dto.liveMode,
      externalUserId,
      verifiedAt: new Date(),
    };
    await this.prisma.merchantPaymentAccount.upsert({
      where: { tenantId_provider: { tenantId: user.tenantId, provider: PROVIDER } },
      create: { tenantId: user.tenantId, provider: PROVIDER, ...data },
      update: data,
    });
    return this.view(user.tenantId);
  }

  async disconnect(user: AuthUserPayload): Promise<PaymentAccountView> {
    this.assertManager(user);
    await this.prisma.merchantPaymentAccount.deleteMany({
      where: { tenantId: user.tenantId, provider: PROVIDER },
    });
    return this.view(user.tenantId);
  }

  /** Decrypted credentials of a verified account, or null. Server-side only. */
  async credentials(tenantId: string): Promise<MerchantCredentials | null> {
    const account = await this.prisma.merchantPaymentAccount.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
    });
    if (!account?.verifiedAt) {
      return null;
    }
    const key = this.key(true);
    return {
      accessToken: decryptSecret(key, account.accessTokenEnc),
      webhookSecret: account.webhookSecretEnc
        ? decryptSecret(key, account.webhookSecretEnc)
        : null,
      publicKey: account.publicKey,
      liveMode: account.liveMode,
    };
  }

  /** Public key for the browser, only when online payments can be taken. */
  async publicCheckout(tenantId: string): Promise<{ publicKey: string; liveMode: boolean } | null> {
    const account = await this.prisma.merchantPaymentAccount.findUnique({
      where: { tenantId_provider: { tenantId, provider: PROVIDER } },
      select: { publicKey: true, liveMode: true, verifiedAt: true, webhookSecretEnc: true },
    });
    if (!account?.verifiedAt || !account.webhookSecretEnc) {
      return null;
    }
    return { publicKey: account.publicKey, liveMode: account.liveMode };
  }

  private assertManager(user: AuthUserPayload): void {
    if (!MANAGER_ROLES.includes(user.membershipRole)) {
      throw new ForbiddenException('Solo el dueño o un administrador puede cambiar los cobros.');
    }
  }

  private key(required: true): Buffer;
  private key(required: false): Buffer | null;
  private key(required: boolean): Buffer | null {
    const key = parseCredentialsKey(this.config.get<string>('PAYMENT_CREDENTIALS_KEY'));
    if (!key && required) {
      throw new ServiceUnavailableException(
        'Los cobros online no están configurados en el servidor (PAYMENT_CREDENTIALS_KEY).',
      );
    }
    return key;
  }
}

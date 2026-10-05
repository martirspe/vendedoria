import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { asWhatsAppMetadata } from '../channels/whatsapp-metadata';
import type { RecoveryCartLine } from '@vendedoria/contracts';

export class RecoveryTransportError extends Error {
  constructor(readonly outcome: 'retry' | 'failed' | 'uncertain') {
    super(`Recovery delivery ${outcome}`);
  }
}
const esc = (value: string) =>
  value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Recovery has explicit opt-in and its own verified marketing sender, separate from receipts. */
@Injectable()
export class RecoveryMessagingService {
  private readonly ses: SESv2Client;
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.ses = new SESv2Client({
      region:
        config.get<string>('SES_REGION') ||
        config.get<string>('AWS_REGION') ||
        'us-east-1',
      maxAttempts: 1,
      requestHandler: { connectionTimeout: 3000, requestTimeout: 10_000 },
    });
  }
  async email(
    to: string,
    name: string,
    url: string,
    optOutUrl: string,
    key: string,
    facts?: {
      lines: RecoveryCartLine[];
      expiresAt: Date;
      recentOrders: number;
      step: number;
    },
  ): Promise<'sent' | 'preview'> {
    if (this.config.get<string>('EMAIL_MODE') !== 'live') return 'preview';
    const from = this.config.get<string>('RECOVERY_EMAIL_FROM');
    if (!from) throw new RecoveryTransportError('failed');
    const intro =
      facts?.step === 1
        ? '¿Quieres retomar tu selección?'
        : facts?.step === 2
          ? 'Todavía puedes retomar tu compra.'
          : 'Tu selección sigue guardada.';
    const selection =
      facts?.lines.map(
        (line) =>
          `${line.quantity} × ${line.name}${line.variantLabel ? ` (${line.variantLabel})` : ''}: ${new Intl.NumberFormat('es-PE', { style: 'currency', currency: line.currency }).format(line.unitCents / 100)} por unidad${line.stockLeft !== null && line.stockLeft <= 5 ? ` · Quedan ${line.stockLeft} unidades` : ''}`,
      ) ?? [];
    const proof = facts?.recentOrders
      ? `Estos productos aparecen en ${facts.recentOrders} pedidos pagados de esta tienda en los últimos 30 días.`
      : '';
    const expiry = facts
      ? `El enlace de esta selección vence el ${facts.expiresAt.toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}.`
      : '';
    const text = [
      name,
      intro,
      ...selection,
      proof,
      expiry,
      'Revisa los precios y la disponibilidad actuales antes de pagar.',
      `Retomar compra: ${url}`,
      `Dejar de recibir recordatorios: ${optOutUrl}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const html = `<h1>${esc(name)}</h1><p>${esc(intro)}</p>${selection.map((item) => `<p>${esc(item)}</p>`).join('')}${proof ? `<p>${esc(proof)}</p>` : ''}${expiry ? `<p>${esc(expiry)}</p>` : ''}<p>Revisa los precios y la disponibilidad actuales antes de pagar.</p><p><a href="${esc(url)}">Retomar mi compra</a></p><p><a href="${esc(optOutUrl)}">Dejar de recibir recordatorios</a></p>`;
    if (this.config.get<string>('EMAIL_PROVIDER') === 'resend') {
      await this.http(
        'https://api.resend.com/emails',
        {
          Authorization: `Bearer ${this.config.getOrThrow<string>('RESEND_API_KEY')}`,
          'Idempotency-Key': key,
        },
        { from, to: [to], subject: `Retoma tu compra en ${name}`, html, text },
      );
      return 'sent';
    }
    try {
      await this.ses.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          ConfigurationSetName:
            this.config.get<string>('SES_CONFIGURATION_SET') || undefined,
          EmailTags: [{ Name: 'kind', Value: 'cart-recovery' }],
          Content: {
            Simple: {
              Subject: {
                Data: `Retoma tu compra en ${name}`,
                Charset: 'UTF-8',
              },
              Body: {
                Html: { Data: html, Charset: 'UTF-8' },
                Text: { Data: text, Charset: 'UTF-8' },
              },
            },
          },
        }),
      );
      return 'sent';
    } catch (error) {
      const name = (error as Error).name;
      throw new RecoveryTransportError(
        /Throttling|TooManyRequests/.test(name)
          ? 'retry'
          : /MessageRejected|MailFromDomainNotVerified|NotFound|BadRequest|AccessDenied/.test(
                name,
              )
            ? 'failed'
            : 'uncertain',
      );
    }
  }
  async whatsapp(
    tenantId: string,
    to: string,
    name: string,
    template: string,
    language: string,
    url: string,
    optOutUrl: string,
  ): Promise<'sent' | 'preview'> {
    const channel = await this.prisma.channel.findFirst({
      where: { tenantId, type: 'WHATSAPP', healthStatus: 'CONNECTED' },
    });
    const metadata = channel ? asWhatsAppMetadata(channel.metadata) : null;
    if (!metadata) throw new RecoveryTransportError('failed');
    if (this.config.get<string>('EMAIL_MODE') !== 'live') return 'preview';
    // Always an approved marketing template: exit-intent is not a WhatsApp service window.
    await this.http(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(metadata.phoneNumberId)}/messages`,
      { Authorization: `Bearer ${metadata.accessToken}` },
      {
        messaging_product: 'whatsapp',
        to: to.replace(/\D/g, ''),
        type: 'template',
        template: {
          name: template,
          language: { code: language },
          components: [
            {
              type: 'body',
              parameters: [name, url, optOutUrl].map((text) => ({
                type: 'text',
                text,
              })),
            },
          ],
        },
      },
    );
    return 'sent';
  }
  private async http(
    url: string,
    headers: Record<string, string>,
    body: unknown,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new RecoveryTransportError('uncertain');
    }
    if (!response.ok)
      throw new RecoveryTransportError(
        response.status === 429
          ? 'retry'
          : response.status >= 500
            ? 'uncertain'
            : 'failed',
      );
  }
}

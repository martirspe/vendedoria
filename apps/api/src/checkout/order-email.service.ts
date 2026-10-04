import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Order, OrderItem, Storefront } from '@prisma/client';
import { DigitalAccess, digitalAccessOf } from '../orders/digital-access';
import { PrismaService } from '../prisma/prisma.service';
import { publicSellerIdentity } from '../storefront/seller-identity';

const CLAIM_TTL_MS = 60_000;

const esc = (value: string | null | undefined) =>
  (value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

/** Plain-text part for the HTML built by this service (better deliverability, text-only clients). */
export function htmlToText(html: string): string {
  return html
    .replace(/<\/(p|h1|h2|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCharCode(Number(code)),
    )
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n\n');
}

type EmailKind = 'confirmation' | 'merchant' | 'logistics' | 'handoff';
const MAX_HANDOFF_RECIPIENTS = 10;
const CHANNEL_LABELS: Record<string, string> = { WHATSAPP: 'WhatsApp', INSTAGRAM: 'Instagram' };
type OutgoingEmail = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string | null;
};
type Transport =
  | {
      provider: 'ses';
      client: SESv2Client;
      from: string;
      configurationSet?: string;
    }
  | { provider: 'resend'; apiKey: string; from: string };

type EmailOrder = Order & { items: OrderItem[] };
type Delivery = {
  mode?: string;
  label?: string;
  address?: string | null;
  district?: string | null;
  province?: string | null;
  department?: string | null;
  eta?: string | null;
  free?: boolean;
};

export type RenderedEmail = { subject: string; html: string };

/**
 * Purchase confirmation and shipping notices. `EMAIL_MODE=preview` (default) only records
 * the state so test purchases never send real mail; `live` sends once per order through
 * Amazon SES (`EMAIL_PROVIDER=ses`, default) or Resend.
 */
@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);
  private readonly transport: Transport | null;

  private readonly consoleOrigin: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.transport = OrderEmailService.createTransport(config);
    this.consoleOrigin =
      config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() || 'http://localhost:4200';
  }

  /**
   * Tells the business team a buyer asked for a person. Carries no buyer data (name, phone or
   * messages): only the channel and a link to the conversation in the console.
   */
  async sendHandoffAlert(tenantId: string, conversationId: string, agentPaused: boolean): Promise<void> {
    if (!this.transport) return;
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
      select: {
        channel: { select: { type: true } },
        tenant: {
          select: {
            name: true,
            memberships: {
              select: { user: { select: { email: true } } },
              orderBy: { createdAt: 'asc' },
              take: MAX_HANDOFF_RECIPIENTS,
            },
          },
        },
      },
    });
    if (!conversation) return;
    const channel = CHANNEL_LABELS[conversation.channel.type] ?? 'tu canal';
    const link = `${this.consoleOrigin}/app/messages?conversation=${encodeURIComponent(conversationId)}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0b0d12">
<p style="font-weight:700">${esc(conversation.tenant.name)}</p>
<h1 style="font-size:20px">Un cliente quiere hablar con una persona</h1>
<p>Un cliente pidió atención de tu equipo por ${channel}.</p>
<p>${agentPaused ? 'Tu vendedor IA se pausó en esa conversación y no responderá hasta que lo reactives.' : 'Tu vendedor IA sigue respondiendo en esa conversación.'}</p>
<p><a href="${esc(link)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:#0b0d12;color:#fff;text-decoration:none;font-weight:700">Responder ahora</a></p>
<p style="font-size:12px;color:#667">Recibes este aviso porque eres parte del equipo de ${esc(conversation.tenant.name)} en VendedorIA.</p>
</div>`;
    const subject = `Un cliente quiere hablar con una persona · ${channel}`;
    await Promise.all(
      conversation.tenant.memberships.map(({ user }, index) =>
        this.send('handoff', `handoff/${conversationId}/${Date.now()}/${index}`, {
          to: user.email,
          subject,
          html,
        }).catch((error: unknown) =>
          // Provider messages can quote the recipient address: log only the error name.
          this.logger.warn(`Handoff email failed for ${conversationId}: ${(error as Error).name}`),
        ),
      ),
    );
  }

  /** What the buyer receives (or would receive in preview mode), for the console. */
  async preview(
    tenantId: string,
    orderId: string,
  ): Promise<RenderedEmail & { status: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, tenant: { include: { storefront: true } } },
    });
    if (!order || !order.tenant.storefront)
      throw new NotFoundException('Pedido no encontrado.');
    return {
      ...this.confirmation(
        order,
        order.tenant.storefront,
        await digitalAccessOf(this.prisma, tenantId, order),
      ),
      status: order.emailStatus,
    };
  }

  async sendConfirmation(orderId: string): Promise<void> {
    if (!this.transport) {
      await this.prisma.order.updateMany({
        where: { id: orderId, status: 'PAID', emailStatus: { not: 'sent' } },
        data: { emailStatus: 'preview' },
      });
      return;
    }
    const claim = await this.prisma.order.updateMany({
      where: {
        id: orderId,
        status: 'PAID',
        emailStatus: { not: 'sent' },
        OR: [
          { emailClaimedAt: null },
          { emailClaimedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } },
        ],
      },
      data: { emailClaimedAt: new Date() },
    });
    if (!claim.count) return;

    const order = await this.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true, tenant: { include: { storefront: true } } },
    });
    const store = order.tenant.storefront;
    if (!order.customerEmail || !store) return;
    const access = await digitalAccessOf(this.prisma, order.tenantId, order);
    const email = this.confirmation(order, store, access);
    try {
      await this.send('confirmation', `confirmation/${order.id}`, {
        to: order.customerEmail,
        ...email,
        replyTo: store.contactEmail,
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { emailStatus: 'sent', emailClaimedAt: null },
      });
    } catch (error) {
      this.logger.warn(
        `Confirmation email failed for ${order.id}: ${(error as Error).message}`,
      );
      await this.prisma.order.update({
        where: { id: order.id },
        data: { emailStatus: 'failed', emailClaimedAt: null },
      });
      return;
    }
    if (store.contactEmail) {
      await this.send('merchant', `merchant/${order.id}`, {
        to: store.contactEmail,
        subject: `Nuevo pedido pagado · ${order.code} · ${soles(order.totalCents)}`,
        html: email.html,
      }).catch((error: unknown) =>
        this.logger.warn(
          `Merchant email failed for ${order.id}: ${(error as Error).message}`,
        ),
      );
    }
  }

  /** Shipped / ready for pickup / delivered notice, sent on each status transition. */
  async sendLogistics(orderId: string): Promise<void> {
    if (!this.transport) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: { include: { product: { select: { kind: true } } } },
        tenant: { include: { storefront: true } },
      },
    });
    const store = order?.tenant.storefront;
    if (
      !order?.customerEmail ||
      !store ||
      !['SHIPPED', 'COMPLETED'].includes(order.status)
    )
      return;
    const servicesOnly =
      order.items.length > 0 &&
      order.items.every((item) => item.product?.kind !== 'PRODUCT');
    const email = this.logistics(order, store, servicesOnly);
    await this.send('logistics', `logistics/${order.id}/${order.status}`, {
      to: order.customerEmail,
      ...email,
      replyTo: store.contactEmail,
    }).catch((error: unknown) =>
      this.logger.warn(
        `Logistics email failed for ${order.id}: ${(error as Error).message}`,
      ),
    );
  }

  private confirmation(
    order: EmailOrder,
    store: Storefront,
    access: DigitalAccess[],
  ): RenderedEmail {
    const delivery = order.delivery ? (order.delivery as Delivery) : null;
    const place = delivery
      ? [
          delivery.address,
          delivery.district,
          delivery.province,
          delivery.department,
        ]
          .filter(Boolean)
          .join(', ')
      : '';
    const html = this.layout(
      store,
      `<h1 style="font-size:22px">Gracias, ${esc(order.customerName)}. Tu pago está confirmado.</h1>
<p>Pedido <strong>${esc(order.code)}</strong></p>
${order.items.map((i) => `<p>${esc(i.title)} · ${i.quantity} × ${soles(i.unitCents)}</p>`).join('')}
<p>Subtotal: ${soles(order.subtotalCents)}</p>
${order.discountCents > 0 ? `<p>Descuento${order.couponCode ? ` (cupón ${esc(order.couponCode)})` : ''}: −${soles(order.discountCents)}</p>` : ''}
${delivery ? `<p>Envío: ${order.shippingCents === 0 ? 'Gratis' : soles(order.shippingCents)}</p>` : ''}
<h2 style="font-size:18px">Total: ${soles(order.totalCents)}</h2>
${delivery ? `<p><strong>${esc(delivery.label)}</strong>${place ? ` · ${esc(place)}` : ''}${delivery.eta ? ` · ${esc(delivery.eta)}` : ''}</p>` : ''}
${order.serviceNote ? `<p>Fecha preferida: ${esc(order.serviceNote)}. Te escribiremos para confirmar el horario.</p>` : ''}
${access.length ? `<h2 style="font-size:18px">Tus productos digitales</h2>${access.map((item) => `<p><strong>${esc(item.title)}</strong><br>${item.url ? `Acceso: <a href="${esc(item.url)}">${esc(item.url)}</a>` : 'Te enviaremos el acceso por este medio.'}${item.instructions ? `<br>${esc(item.instructions)}` : ''}</p>`).join('')}` : ''}`,
    );
    return {
      subject: `Compra confirmada · ${store.displayName} · ${order.code}`,
      html,
    };
  }

  private logistics(
    order: EmailOrder,
    store: Storefront,
    servicesOnly: boolean,
  ): RenderedEmail {
    const delivery = (order.delivery ?? {}) as Delivery;
    const pickup = delivery.mode === 'PICKUP';
    const delivered = order.status === 'COMPLETED';
    const title = delivered
      ? servicesOnly
        ? 'Tu servicio fue realizado.'
        : 'Tu pedido fue entregado.'
      : pickup
        ? 'Tu pedido está listo para recoger.'
        : 'Tu pedido está en camino.';
    const body = delivered
      ? '<p>Gracias por tu compra. Esperamos que lo disfrutes.</p>'
      : pickup
        ? `<p>Recógelo en: <strong>${esc(store.pickupAddress)}</strong>. Lleva tu código de pedido.</p>`
        : `<p>${esc(delivery.label)}${order.trackingCode ? ` · Código de seguimiento: <strong>${esc(order.trackingCode)}</strong>` : ''}</p>`;
    return {
      subject: `${title.replace(/\.$/, '')} · ${store.displayName} · ${order.code}`,
      html: this.layout(
        store,
        `<h1 style="font-size:22px">${esc(order.customerName)}, ${title.charAt(0).toLowerCase()}${title.slice(1)}</h1>
<p>Pedido <strong>${esc(order.code)}</strong></p>${body}`,
      ),
    };
  }

  private layout(store: Storefront, content: string): string {
    const seller = publicSellerIdentity(store);
    return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0b0d12">
<p style="font-weight:700">${esc(store.displayName)}</p>
${content}
<p>Si tienes dudas responde este correo${store.whatsappPhone ? ` o escríbenos al WhatsApp +${esc(store.whatsappPhone)}` : ''}.</p>
<p style="font-size:11px;color:#667;border-top:1px solid #dde;padding-top:12px">${esc(seller.legalName)}${seller.ruc ? ` · RUC ${esc(seller.ruc)}` : ''}${seller.legalAddress ? ` · ${esc(seller.legalAddress)}` : ''}${store.complaintsBookUrl ? ` · Libro de Reclamaciones: ${esc(store.complaintsBookUrl)}` : ''}</p>
</div>`;
  }

  /** Env validation guarantees the provider settings exist whenever `EMAIL_MODE=live`. */
  private static createTransport(config: ConfigService): Transport | null {
    if (config.get<string>('EMAIL_MODE') !== 'live') return null;
    const from = config.getOrThrow<string>('EMAIL_FROM');
    if (config.get<string>('EMAIL_PROVIDER') === 'resend') {
      return {
        provider: 'resend',
        apiKey: config.getOrThrow<string>('RESEND_API_KEY'),
        from,
      };
    }
    return {
      provider: 'ses',
      client: new SESv2Client({
        region:
          config.get<string>('SES_REGION') ||
          config.getOrThrow<string>('AWS_REGION'),
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 3_000, requestTimeout: 10_000 },
      }),
      from,
      configurationSet:
        config.get<string>('SES_CONFIGURATION_SET') || undefined,
    };
  }

  /** `dedupeKey` is honoured by Resend; with SES the order claim and status guards prevent repeats. */
  private async send(
    kind: EmailKind,
    dedupeKey: string,
    email: OutgoingEmail,
  ): Promise<void> {
    const transport = this.transport;
    if (!transport) return;
    const text = htmlToText(email.html);
    if (transport.provider === 'ses') {
      await transport.client.send(
        new SendEmailCommand({
          FromEmailAddress: transport.from,
          Destination: { ToAddresses: [email.to] },
          ...(email.replyTo ? { ReplyToAddresses: [email.replyTo] } : {}),
          Content: {
            Simple: {
              Subject: { Data: email.subject, Charset: 'UTF-8' },
              Body: {
                Html: { Data: email.html, Charset: 'UTF-8' },
                Text: { Data: text, Charset: 'UTF-8' },
              },
            },
          },
          ConfigurationSetName: transport.configurationSet,
          EmailTags: [{ Name: 'kind', Value: kind }],
        }),
      );
      return;
    }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${transport.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': dedupeKey,
      },
      body: JSON.stringify({
        from: transport.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text,
        ...(email.replyTo ? { reply_to: email.replyTo } : {}),
        tags: [{ name: 'kind', value: kind }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  }
}

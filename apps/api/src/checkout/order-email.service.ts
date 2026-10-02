import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Order, OrderItem, Storefront } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_TTL_MS = 60_000;

const esc = (value: string | null | undefined) =>
  (value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

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
 * the state so test purchases never send real mail; `live` sends through Resend once per order.
 */
@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** What the buyer receives (or would receive in preview mode), for the console. */
  async preview(tenantId: string, orderId: string): Promise<RenderedEmail & { status: string }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true, tenant: { include: { storefront: true } } },
    });
    if (!order || !order.tenant.storefront) throw new NotFoundException('Pedido no encontrado.');
    return { ...this.confirmation(order, order.tenant.storefront), status: order.emailStatus };
  }

  async sendConfirmation(orderId: string): Promise<void> {
    const sender = this.sender();
    if (!sender) {
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
        OR: [{ emailClaimedAt: null }, { emailClaimedAt: { lt: new Date(Date.now() - CLAIM_TTL_MS) } }],
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
    const email = this.confirmation(order, store);
    try {
      await this.send(sender, `confirmation/${order.id}`, {
        to: [order.customerEmail],
        ...email,
        ...(store.contactEmail ? { reply_to: store.contactEmail } : {}),
      });
      await this.prisma.order.update({
        where: { id: order.id },
        data: { emailStatus: 'sent', emailClaimedAt: null },
      });
    } catch (error) {
      this.logger.warn(`Confirmation email failed for ${order.id}: ${(error as Error).message}`);
      await this.prisma.order.update({
        where: { id: order.id },
        data: { emailStatus: 'failed', emailClaimedAt: null },
      });
      return;
    }
    if (store.contactEmail) {
      await this.send(sender, `merchant/${order.id}`, {
        to: [store.contactEmail],
        subject: `Nuevo pedido pagado · ${order.code} · ${soles(order.totalCents)}`,
        html: email.html,
      }).catch((error: unknown) =>
        this.logger.warn(`Merchant email failed for ${order.id}: ${(error as Error).message}`),
      );
    }
  }

  /** Shipped / ready for pickup / delivered notice; Resend deduplicates per status. */
  async sendLogistics(orderId: string): Promise<void> {
    const sender = this.sender();
    if (!sender) return;
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, tenant: { include: { storefront: true } } },
    });
    const store = order?.tenant.storefront;
    if (!order?.customerEmail || !store || !['SHIPPED', 'COMPLETED'].includes(order.status)) return;
    const email = this.logistics(order, store);
    await this.send(sender, `logistics/${order.id}/${order.status}`, {
      to: [order.customerEmail],
      ...email,
      ...(store.contactEmail ? { reply_to: store.contactEmail } : {}),
    }).catch((error: unknown) =>
      this.logger.warn(`Logistics email failed for ${order.id}: ${(error as Error).message}`),
    );
  }

  private confirmation(order: EmailOrder, store: Storefront): RenderedEmail {
    const delivery = (order.delivery ?? {}) as Delivery;
    const place = [delivery.address, delivery.district, delivery.province, delivery.department]
      .filter(Boolean)
      .join(', ');
    const html = this.layout(
      store,
      `<h1 style="font-size:22px">Gracias, ${esc(order.customerName)}. Tu pago está confirmado.</h1>
<p>Pedido <strong>${esc(order.code)}</strong></p>
${order.items.map((i) => `<p>${esc(i.title)} · ${i.quantity} × ${soles(i.unitCents)}</p>`).join('')}
<p>Subtotal: ${soles(order.subtotalCents)}</p>
${order.discountCents > 0 ? `<p>Descuento${order.couponCode ? ` (cupón ${esc(order.couponCode)})` : ''}: −${soles(order.discountCents)}</p>` : ''}
<p>Envío: ${order.shippingCents === 0 ? 'Gratis' : soles(order.shippingCents)}</p>
<h2 style="font-size:18px">Total: ${soles(order.totalCents)}</h2>
<p><strong>${esc(delivery.label)}</strong>${place ? ` · ${esc(place)}` : ''}${delivery.eta ? ` · ${esc(delivery.eta)}` : ''}</p>`,
    );
    return { subject: `Compra confirmada · ${store.displayName} · ${order.code}`, html };
  }

  private logistics(order: EmailOrder, store: Storefront): RenderedEmail {
    const delivery = (order.delivery ?? {}) as Delivery;
    const pickup = delivery.mode === 'PICKUP';
    const delivered = order.status === 'COMPLETED';
    const title = delivered
      ? 'Tu pedido fue entregado.'
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
    return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0b0d12">
<p style="font-weight:700">${esc(store.displayName)}</p>
${content}
<p>Si tienes dudas responde este correo${store.whatsappPhone ? ` o escríbenos al WhatsApp +${esc(store.whatsappPhone)}` : ''}.</p>
<p style="font-size:11px;color:#667;border-top:1px solid #dde;padding-top:12px">${esc(store.legalName)}${store.ruc ? ` · RUC ${esc(store.ruc)}` : ''}${store.legalAddress ? ` · ${esc(store.legalAddress)}` : ''}${store.complaintsBookUrl ? ` · Libro de Reclamaciones: ${esc(store.complaintsBookUrl)}` : ''}</p>
</div>`;
  }

  private sender(): { apiKey: string; from: string } | null {
    const live = this.config.get<string>('EMAIL_MODE') === 'live';
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');
    return live && apiKey && from ? { apiKey, from } : null;
  }

  private async send(
    sender: { apiKey: string; from: string },
    idempotencyKey: string,
    body: Record<string, unknown>,
  ) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${sender.apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ from: sender.from, ...body }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  }
}

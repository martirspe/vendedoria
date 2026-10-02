import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

const CLAIM_TTL_MS = 60_000;

const esc = (value: string | null | undefined) =>
  (value ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const soles = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;

/**
 * Purchase confirmation. `EMAIL_MODE=preview` (default) only records the state so test
 * purchases never send real mail; `live` sends through Resend once per order.
 */
@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async sendConfirmation(orderId: string): Promise<void> {
    const live = this.config.get<string>('EMAIL_MODE') === 'live';
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    const from = this.config.get<string>('EMAIL_FROM');
    if (!live || !apiKey || !from) {
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
    const delivery = (order.delivery ?? {}) as {
      label?: string;
      address?: string | null;
      district?: string | null;
      city?: string | null;
      eta?: string | null;
      free?: boolean;
    };
    const place = [delivery.address, delivery.district, delivery.city].filter(Boolean).join(', ');
    const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0b0d12">
<p style="font-weight:700">${esc(store.displayName)}</p>
<h1 style="font-size:22px">Gracias, ${esc(order.customerName)}. Tu pago está confirmado.</h1>
<p>Pedido <strong>${esc(order.code)}</strong></p>
${order.items.map((i) => `<p>${esc(i.title)} · ${i.quantity} × ${soles(i.unitCents)}</p>`).join('')}
<p>Subtotal: ${soles(order.subtotalCents)}</p>
${order.discountCents > 0 ? `<p>Descuento${order.couponCode ? ` (cupón ${esc(order.couponCode)})` : ''}: −${soles(order.discountCents)}</p>` : ''}
<p>Envío: ${order.shippingCents === 0 ? 'Gratis' : soles(order.shippingCents)}</p>
<h2 style="font-size:18px">Total: ${soles(order.totalCents)}</h2>
<p><strong>${esc(delivery.label)}</strong>${place ? ` · ${esc(place)}` : ''}${delivery.eta ? ` · ${esc(delivery.eta)}` : ''}</p>
<p>Si tienes dudas responde este correo${store.whatsappPhone ? ` o escríbenos al WhatsApp +${esc(store.whatsappPhone)}` : ''}.</p>
<p style="font-size:11px;color:#667;border-top:1px solid #dde;padding-top:12px">${esc(store.legalName)}${store.ruc ? ` · RUC ${esc(store.ruc)}` : ''}${store.legalAddress ? ` · ${esc(store.legalAddress)}` : ''}${store.complaintsBookUrl ? ` · Libro de Reclamaciones: ${esc(store.complaintsBookUrl)}` : ''}</p>
</div>`;
    try {
      await this.send(apiKey, `confirmation/${order.id}`, {
        from,
        to: [order.customerEmail],
        subject: `Compra confirmada · ${store.displayName} · ${order.code}`,
        html,
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
      await this.send(apiKey, `merchant/${order.id}`, {
        from,
        to: [store.contactEmail],
        subject: `Nuevo pedido pagado · ${order.code} · ${soles(order.totalCents)}`,
        html,
      }).catch((error: unknown) =>
        this.logger.warn(`Merchant email failed for ${order.id}: ${(error as Error).message}`),
      );
    }
  }

  private async send(apiKey: string, idempotencyKey: string, body: Record<string, unknown>) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  }
}

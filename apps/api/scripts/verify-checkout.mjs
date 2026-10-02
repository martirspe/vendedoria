// Development-only checks for the web checkout: run inside the api container.
// node scripts/verify-checkout.mjs <store-slug> <product-handle>
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const [slug, handle] = process.argv.slice(2);
if (!slug || !handle) throw new Error('Usage: node scripts/verify-checkout.mjs <slug> <handle>');
if (process.env.NODE_ENV === 'production') throw new Error('Development only');

const prisma = new PrismaClient();
const API = `http://localhost:${process.env.PORT ?? 3000}/api/v1/storefront`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`);
};

async function post(path, body, store = slug) {
  const res = await fetch(`${API}/${store}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const checkout = (n, extra = {}) =>
  post('checkout', {
    checkoutKey: randomUUID(),
    items: [{ handle, quantity: 1 }],
    customer: { name: 'Prueba Concurrencia', email: `buyer${n}@verify.test`, phone: '987654321' },
    delivery: { mode: 'PICKUP' },
    acceptTerms: true,
    ...extra,
  });

const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug } });
const product = await prisma.product.findFirstOrThrow({ where: { tenantId: tenant.id, handle } });
const original = { stockUnlimited: product.stockUnlimited, stockQty: product.stockQty };
const couponCode = `VERIFY${Date.now().toString(36).toUpperCase()}`;

try {
  // 1. Last unit: six buyers at once, exactly one reservation.
  await prisma.product.update({ where: { id: product.id }, data: { stockUnlimited: false, stockQty: 1 } });
  const race = await Promise.all([1, 2, 3, 4, 5, 6].map((n) => checkout(n)));
  const won = race.filter((r) => r.status === 201);
  const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty;
  check('Última unidad: un solo pedido reservado', won.length === 1, `${won.length} de 6, otros: ${race.filter((r) => r.status !== 201).map((r) => r.status).join(',')}`);
  check('Stock queda en 0 tras la reserva', stockAfter === 0, `stockQty=${stockAfter}`);

  // 2. Cancelling releases the unit.
  const order = won[0]?.body;
  if (order) {
    const cancelled = await post(`orders/${order.id}/cancel`, { token: order.token });
    const restored = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stockQty;
    check('Cancelar libera el stock', cancelled.body?.status === 'CANCELLED' && restored === 1, `stockQty=${restored}`);
  }

  // 3. Tenant isolation and capability token.
  const other = await prisma.storefront.findFirst({
    where: { status: 'PUBLISHED', tenantId: { not: tenant.id } },
    include: { tenant: { select: { slug: true } } },
  });
  if (order) {
    const wrongToken = await fetch(`${API}/${slug}/orders/${order.id}?token=${'x'.repeat(32)}`);
    check('Token incorrecto → 404', wrongToken.status === 404, `${wrongToken.status}`);
    if (other) {
      const cross = await fetch(`${API}/${other.tenant.slug}/orders/${order.id}?token=${order.token}`);
      check('Pedido no visible desde otra tienda', cross.status === 404, `${cross.status}`);
    } else {
      console.log('SKIP aislamiento: no hay otra tienda publicada');
    }
  }

  // 4. Idempotency: the same checkout key twice at once returns one order.
  await prisma.product.update({ where: { id: product.id }, data: { stockUnlimited: true, stockQty: null } });
  const key = randomUUID();
  const body = (n) => ({
    checkoutKey: key,
    items: [{ handle, quantity: 1 }],
    customer: { name: 'Prueba Idempotencia', email: `idem${n}@verify.test`.replace(/\d/, ''), phone: '987654321' },
    delivery: { mode: 'PICKUP' },
    acceptTerms: true,
  });
  const twins = await Promise.all([post('checkout', body(1)), post('checkout', body(1))]);
  const ids = new Set(twins.filter((r) => r.status === 201).map((r) => r.body.id));
  check('Misma llave de checkout → un solo pedido', ids.size === 1, `estados ${twins.map((r) => r.status).join(',')}`);
  for (const r of twins) if (r.status === 201) await post(`orders/${r.body.id}/cancel`, { token: r.body.token });

  // 5. Last coupon use: six buyers at once, one redemption.
  await prisma.coupon.create({
    data: { tenantId: tenant.id, code: couponCode, label: 'Prueba de concurrencia', kind: 'PERCENT', value: 10, usageLimit: 1 },
  });
  const couponRace = await Promise.all([11, 12, 13, 14, 15, 16].map((n) => checkout(n, { couponCode })));
  const couponWon = couponRace.filter((r) => r.status === 201);
  check('Último uso del cupón: un solo pedido con descuento', couponWon.length === 1, `${couponWon.length} de 6`);
  const held = await prisma.couponRedemption.count({ where: { coupon: { code: couponCode, tenantId: tenant.id }, status: 'HELD' } });
  check('Una sola redención reservada', held === 1, `HELD=${held}`);

  // 6. Cancelling releases the coupon use.
  if (couponWon[0]) {
    await post(`orders/${couponWon[0].body.id}/cancel`, { token: couponWon[0].body.token });
    const again = await checkout(17, { couponCode });
    check('Cupón liberado se puede volver a usar', again.status === 201, `${again.status}`);
    if (again.status === 201) await post(`orders/${again.body.id}/cancel`, { token: again.body.token });
  }
} finally {
  await prisma.product.update({ where: { id: product.id }, data: original });
  await prisma.couponRedemption.deleteMany({ where: { coupon: { code: couponCode, tenantId: tenant.id } } });
  await prisma.coupon.deleteMany({ where: { code: couponCode, tenantId: tenant.id } });
  await prisma.$disconnect();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
process.exit(failed ? 1 : 0);

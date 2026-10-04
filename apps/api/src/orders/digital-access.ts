import { OrderStatus, Prisma, PrismaClient, ProductKind } from '@prisma/client';

export function fulfillmentSnapshot(product: { kind: ProductKind; digitalAccessUrl: string | null; digitalInstructions: string | null }): Prisma.InputJsonObject {
  return { kind: product.kind, url: product.digitalAccessUrl, instructions: product.digitalInstructions };
}

export function readFulfillment(value: unknown): { kind: ProductKind; url: string | null; instructions: string | null } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (!['PRODUCT', 'SERVICE', 'DIGITAL'].includes(String(row.kind))) return null;
  return {
    kind: row.kind as ProductKind,
    url: typeof row.url === 'string' ? row.url : null,
    instructions: typeof row.instructions === 'string' ? row.instructions : null,
  };
}

export type DigitalAccess = {
  title: string;
  url: string | null;
  instructions: string | null;
};

export type OrderFulfillment = {
  /** Kinds of the products in the order, to explain what happens after the payment. */
  kinds: ProductKind[];
  /** Empty until the order is paid. */
  digitalAccess: DigitalAccess[];
};

const PAID_STATUSES: readonly OrderStatus[] = [
  'PAID',
  'FULFILLING',
  'SHIPPED',
  'COMPLETED',
];

/**
 * Preserve the delivery promised at purchase; only legacy lines read the live catalog.
 * Private URLs are revealed only after payment, never in unpaid/public product payloads.
 */
export async function orderFulfillment(
  db: Pick<PrismaClient, 'product'>,
  tenantId: string,
  order: {
    status: OrderStatus;
    items: { productId: string | null; title: string; fulfillment?: unknown }[];
  },
): Promise<OrderFulfillment> {
  const ids = [
    ...new Set(order.items.flatMap((item) => !readFulfillment(item.fulfillment) ? item.productId ?? [] : [])),
  ];
  const products = ids.length ? await db.product.findMany({
    where: { tenantId, id: { in: ids } },
    select: {
      id: true,
      kind: true,
      digitalAccessUrl: true,
      digitalInstructions: true,
    },
  }) : [];
  const live = new Map(products.map((product) => [product.id, fulfillmentSnapshot(product)]));
  const items = order.items.map((item) => ({
    ...item, access: readFulfillment(item.fulfillment) ?? readFulfillment(item.productId ? live.get(item.productId) : null),
  }));
  const kinds = [...new Set(items.flatMap((item) => item.access?.kind ?? []))];
  if (!PAID_STATUSES.includes(order.status)) return { kinds, digitalAccess: [] };
  const seen = new Set<string>();
  const digitalAccess = items.flatMap((item) => {
    const access = item.access;
    const key = `${item.title}:${access?.url ?? ''}`;
    if (access?.kind !== 'DIGITAL' || seen.has(key)) return [];
    seen.add(key);
    return [
      {
        title: item.title,
        url: access.url,
        instructions: access.instructions,
      },
    ];
  });
  return { kinds, digitalAccess };
}

export async function digitalAccessOf(
  db: Pick<PrismaClient, 'product'>,
  tenantId: string,
  order: Parameters<typeof orderFulfillment>[2],
): Promise<DigitalAccess[]> {
  return (await orderFulfillment(db, tenantId, order)).digitalAccess;
}

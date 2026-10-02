import { createHmac, timingSafeEqual } from 'node:crypto';

const API = 'https://api.mercadopago.com';
const TIMEOUT_MS = 12_000;

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export type MercadoPagoUser = {
  id: number;
  site_id?: string;
  nickname?: string;
};

/** Orders API (Checkout API with Card Payment Brick and Yape). */
export type MercadoPagoOrder = {
  id: string;
  external_reference: string;
  currency?: string;
  country_code?: string;
  total_amount: string;
  total_paid_amount?: string;
  status: string;
  status_detail?: string;
};

export type MercadoPagoPayment = {
  id: number | string;
  status?: string;
  external_reference?: string;
};

export type MercadoPagoPreference = {
  id?: string;
  init_point?: string;
  sandbox_init_point?: string;
};

async function request<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new MercadoPagoError(
      `Mercado Pago ${init.method ?? 'GET'} ${path.split('?')[0]} failed`,
      response.status,
    );
  }
  return (await response.json()) as T;
}

export const mercadoPago = {
  me: (accessToken: string) => request<MercadoPagoUser>(accessToken, '/users/me'),

  createPreference: (accessToken: string, body: unknown, idempotencyKey: string) =>
    request<MercadoPagoPreference>(accessToken, '/checkout/preferences', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),

  getPayment: (accessToken: string, id: string) => {
    if (!/^\d{1,20}$/.test(id)) {
      throw new MercadoPagoError('Invalid payment id', 400);
    }
    return request<MercadoPagoPayment>(accessToken, `/v1/payments/${id}`);
  },

  createOrder: (accessToken: string, body: unknown, idempotencyKey: string) =>
    request<MercadoPagoOrder>(accessToken, '/v1/orders', {
      method: 'POST',
      headers: { 'X-Idempotency-Key': idempotencyKey },
      body: JSON.stringify(body),
    }),

  getOrder: (accessToken: string, id: string) => {
    if (!isProviderOrderId(id)) {
      throw new MercadoPagoError('Invalid order id', 400);
    }
    return request<MercadoPagoOrder>(accessToken, `/v1/orders/${id}`);
  },
};

export function isProviderOrderId(id: string): boolean {
  return /^ORD[a-z0-9]{1,60}$/i.test(id);
}

/**
 * Validates `x-signature` (`ts=…,v1=…`): HMAC-SHA256 of
 * `id:{data.id lowercase};request-id:{x-request-id};ts:{ts};`.
 */
export function verifyMercadoPagoSignature(params: {
  dataId: string;
  requestId: string;
  header: string;
  secret: string;
}): boolean {
  const parts = Object.fromEntries(
    params.header.split(',').map((part) => {
      const [key, ...value] = part.trim().split('=');
      return [key, value.join('=')];
    }),
  );
  const ts = parts['ts'] ?? '';
  const v1 = parts['v1'] ?? '';
  if (
    !params.secret ||
    !params.dataId ||
    !params.requestId ||
    !/^\d+$/.test(ts) ||
    !/^[a-f0-9]{64}$/i.test(v1)
  ) {
    return false;
  }
  const expected = createHmac('sha256', params.secret)
    .update(`id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${ts};`)
    .digest();
  return timingSafeEqual(expected, Buffer.from(v1, 'hex'));
}

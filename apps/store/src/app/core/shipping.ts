import type { ShippingMode } from '@vendedoria/contracts';

/** Same rule as the API: Lima Metropolitana (1501) and Callao (07) use the Lima rate. */
export const shippingZone = (code: string): ShippingMode =>
  code.startsWith('1501') || code.startsWith('07') ? 'LIMA' : 'PROVINCE';

export const isCarrier = (mode: ShippingMode | null) => mode === 'OLVA' || mode === 'SHALOM';

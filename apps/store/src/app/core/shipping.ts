import type { ShippingMode } from '@vendedoria/contracts';

export const isCarrier = (mode: ShippingMode | null) => mode === 'OLVA' || mode === 'SHALOM';

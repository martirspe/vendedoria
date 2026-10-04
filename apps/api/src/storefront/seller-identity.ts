import type { Storefront } from '@prisma/client';
import { DNI, RUC } from './dto/update-storefront.dto';

type SellerFields = Pick<
  Storefront,
  'sellerType' | 'legalName' | 'ruc' | 'legalAddress' | 'dni' | 'legalDistrict'
>;

/** Seller identity that buyers may see: sellers without RUC never expose their DNI or home address. */
export function publicSellerIdentity(store: SellerFields): {
  legalName: string | null;
  ruc: string | null;
  legalAddress: string | null;
} {
  if (store.sellerType === 'INDIVIDUAL') {
    return { legalName: store.legalName, ruc: null, legalAddress: store.legalDistrict };
  }
  return { legalName: store.legalName, ruc: store.ruc, legalAddress: store.legalAddress };
}

export function sellerIdentityComplete(store: SellerFields): boolean {
  if (!store.legalName || !store.legalAddress) return false;
  if (store.sellerType === 'INDIVIDUAL') {
    return Boolean(store.dni && DNI.test(store.dni) && store.legalDistrict);
  }
  return Boolean(store.ruc && RUC.test(store.ruc));
}

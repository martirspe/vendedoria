const KEY = 'vendedoria-campaign-coupon';
const CODE = /^[A-Za-z0-9_-]{3,30}$/;

/** Keeps the `?cupon=` code of a campaign link for the checkout of this browser session. */
export function rememberCampaignCoupon(search: string): void {
  if (typeof sessionStorage === 'undefined') return;
  const code = new URLSearchParams(search).get('cupon')?.trim();
  if (code && CODE.test(code)) sessionStorage.setItem(KEY, code.toUpperCase());
}

export function campaignCoupon(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  return sessionStorage.getItem(KEY);
}

export function forgetCampaignCoupon(): void {
  if (typeof sessionStorage !== 'undefined') sessionStorage.removeItem(KEY);
}

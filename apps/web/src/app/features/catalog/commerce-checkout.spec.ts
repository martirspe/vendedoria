import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { CartService, type CartLine } from '../../../../../store/src/app/core/cart.service';
import { AnalyticsService } from '../../../../../store/src/app/core/analytics.service';
import { TemplateDemo } from '../../../../../store/src/app/core/template-demo';
import { checkoutStorageKey } from '../../../../../store/src/app/core/checkout-context';

const line: Omit<CartLine, 'key' | 'quantity'> = { handle: 'shoe', name: 'Calzado', variantId: 'black-38', variantLabel: 'Negro / 38', unitCents: 10000, currency: 'PEN', imageUrl: null };
describe('checkout cart isolation and persistence', () => {
  let cart: CartService;
  beforeEach(() => {
    const storage = (): Storage => {
      const entries = new Map<string, string>();
      return { get length() { return entries.size; }, clear: () => entries.clear(), getItem: (key) => entries.get(key) ?? null, setItem: (key, value) => { entries.set(key, value); }, removeItem: (key) => { entries.delete(key); }, key: (index) => [...entries.keys()][index] ?? null };
    };
    vi.stubGlobal('localStorage', storage()); vi.stubGlobal('sessionStorage', storage());
    localStorage.clear(); sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [CartService, { provide: AnalyticsService, useValue: { addToCart() {} } }, { provide: TemplateDemo, useValue: { active: false, template: null } }] });
    cart = TestBed.inject(CartService); cart.load('store-a');
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  it('keeps the saved cart intact for a direct purchase, cancellation and a foreign receipt', () => {
    cart.add(line, 2); cart.completeOrder('direct-order');
    expect(cart.count()).toBe(2);
    cart.restoreTransient([{ ...line, quantity: 1 }]);
    cart.clear(); cart.load('store-a');
    expect(cart.count()).toBe(2);
    cart.load('store-b'); expect(cart.count()).toBe(0);
  });
  it('consumes only purchased quantities once and keeps later additions across reload', () => {
    cart.add(line, 2); cart.rememberOrder('cart-order');
    cart.add(line, 1); cart.add({ ...line, handle: 'other' }, 1);
    cart.load('store-a'); cart.completeOrder('cart-order');
    expect(cart.count()).toBe(2);
    cart.completeOrder('cart-order'); cart.load('store-a');
    expect(cart.count()).toBe(2);
    expect(cart.lines().find((item) => item.handle === 'shoe')?.quantity).toBe(1);
  });
  it('reads existing array storage and discards corrupt records', () => {
    localStorage.setItem('vendedoria-cart:store-a', JSON.stringify([{ ...line, key: 'shoe::black-38', quantity: 2 }, { ...line, key: 'bad', quantity: -1 }]));
    cart.load('store-a'); expect(cart.count()).toBe(2);
    localStorage.setItem('vendedoria-cart:store-a', '{bad'); cart.load('store-a'); expect(cart.count()).toBe(0);
  });
  it('separates keys by tenant, intent, variant and quantity and reuses them for retry', () => {
    const items = [{ handle: 'shoe', variantId: 'v', quantity: 1 }];
    const key = checkoutStorageKey('a', 'cart', items);
    expect(checkoutStorageKey('a', 'cart', [...items])).toBe(key);
    expect(checkoutStorageKey('a', 'direct', items)).not.toBe(key);
    expect(checkoutStorageKey('b', 'cart', items)).not.toBe(key);
    expect(checkoutStorageKey('a', 'cart', [{ ...items[0], quantity: 2 }])).not.toBe(key);
    expect(checkoutStorageKey('a', 'cart', [{ ...items[0], variantId: 'other' }])).not.toBe(key);
  });
  it('serializes additions and duplicate settlement across tabs sharing storage', async () => {
    let queue = Promise.resolve();
    vi.stubGlobal('navigator', { locks: { request: (_key: string, callback: () => void) => { queue = queue.then(callback); return queue; } } });
    const other = TestBed.runInInjectionContext(() => new CartService()); other.load('store-a');
    cart.add(line, 1); other.add(line, 2); await queue;
    expect(cart.count()).toBe(3); expect(other.count()).toBe(3);
    cart.rememberOrder('same-order'); other.rememberOrder('same-order');
    cart.completeOrder('same-order'); other.completeOrder('same-order'); await queue;
    expect(cart.count()).toBe(0); expect(other.count()).toBe(0);
  });
});

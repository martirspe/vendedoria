import { TestBed } from '@angular/core/testing';
import { CartService, type CartLine } from './cart.service';
import { AnalyticsService } from './analytics.service';
import { TemplateDemo } from './template-demo';

describe('Cart purchase persistence', () => {
  const line = (handle: string): Omit<CartLine, 'key' | 'quantity'> => ({
    handle, name: handle, variantId: null, variantLabel: null,
    unitCents: 1000, currency: 'PEN', imageUrl: null,
  });
  let cart: CartService;
  beforeEach(() => {
    // Node 26 exposes an unavailable native storage global; use an isolated browser storage adapter.
    for (const name of ['localStorage', 'sessionStorage']) {
      const values = new Map<string, string>();
      vi.stubGlobal(name, {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => { values.set(key, value); },
        removeItem: (key: string) => { values.delete(key); },
      });
    }
    TestBed.configureTestingModule({ providers: [
      CartService,
      { provide: AnalyticsService, useValue: { addToCart: vi.fn() } },
      { provide: TemplateDemo, useValue: { active: false, template: null } },
    ] });
    cart = TestBed.inject(CartService);
    cart.load('test-shop');
  });
  afterEach(() => { vi.unstubAllGlobals(); TestBed.resetTestingModule(); });

  it('CART-001 preserves product A when product B is added before checkout', async () => {
    await cart.add(line('a'), 2);
    await cart.add(line('b'), 1);
    cart.load('test-shop');
    expect(cart.lines().map(({ handle, quantity }) => ({ handle, quantity }))).toEqual([
      { handle: 'a', quantity: 2 }, { handle: 'b', quantity: 1 },
    ]);
  });

  it('CART-002 does not resolve an add until the cross-tab lock persists it', async () => {
    let unlock!: () => void;
    const gate = new Promise<void>(resolve => { unlock = resolve; });
    vi.stubGlobal('navigator', { locks: { request: async (_key: string, change: () => void) => {
      await gate; change();
    } } });
    let completed = false;
    const pending = cart.add(line('b'), 1).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(cart.lines()).toEqual([]);
    unlock();
    await pending;
    cart.load('test-shop');
    expect(cart.lines()[0].handle).toBe('b');
  });

  it('CART-003 combines repeated variants and respects the stock cap', async () => {
    await cart.add({ ...line('a'), variantId: 'small' }, 2, 3);
    await cart.add({ ...line('a'), variantId: 'small' }, 2, 3);
    await cart.add({ ...line('a'), variantId: 'large' }, 1, 3);
    expect(cart.lines().map(({ variantId, quantity }) => ({ variantId, quantity }))).toEqual([
      { variantId: 'small', quantity: 3 }, { variantId: 'large', quantity: 1 },
    ]);
  });
});

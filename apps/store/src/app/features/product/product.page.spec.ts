import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { PublicProductDetail } from '@vendedoria/contracts';
import { CartService } from '../../core/cart.service';
import { AnalyticsService } from '../../core/analytics.service';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { StoreEditorBridge } from '../../core/store-editor';
import { demoResponse, demoStore } from '../../demos/template-demo-data';
import { ProductPage } from './product.page';

describe('Buy now', () => {
  it('CART-004 awaits cart persistence before navigation and ignores a duplicate click', async () => {
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const add = vi.fn(() => pending);
    const navigate = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [
      { provide: Router, useValue: { navigate } },
      { provide: CartService, useValue: { add } },
      { provide: AnalyticsService, useValue: { viewProduct: vi.fn() } },
      { provide: SeoService, useValue: { set: vi.fn(), absolute: (path: string) => path } },
      { provide: StoreStateService, useValue: { store: signal(demoStore('classic')) } },
      { provide: StoreEditorBridge, useValue: { active: signal(false) } },
    ] });
    const fixture = TestBed.createComponent(ProductPage);
    const product = demoResponse('classic', '/products/bolso-lona') as PublicProductDetail;
    fixture.componentRef.setInput('product', product);
    const first = fixture.componentInstance.buyNow();
    await fixture.componentInstance.buyNow();
    expect(add).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    release();
    await first;
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/checkout']);
    expect(fixture.componentInstance.buying()).toBe(false);
    TestBed.resetTestingModule();
  });
});

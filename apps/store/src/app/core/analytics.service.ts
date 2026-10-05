import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import type { PublicOrder, PublicProductCard, StoreTracking } from '@vendedoria/contracts';
import { filter } from 'rxjs';
import { StoreStateService } from './store-state.service';

export type AnalyticsItem = {
  id: string;
  name: string;
  priceCents: number;
  quantity: number;
  brand?: string | null;
  category?: string | null;
};

type Consent = 'granted' | 'denied';

type TrackingWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  fbq?: ((...args: unknown[]) => void) & { callMethod?: unknown; queue?: unknown[] };
  _fbq?: unknown;
};

const CONSENT_KEY = 'vendedoria-consent:';
const PURCHASE_KEY = 'vendedoria-purchase:';

/**
 * The store's only event layer: Meta Pixel and GA4 load after the buyer accepts cookies
 * (Ley 29733) and only when the merchant connected them and the plan includes analytics.
 */
@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly state = inject(StoreStateService);
  private readonly router = inject(Router);

  private readonly consent = signal<Consent | null>(null);
  private loaded: StoreTracking | null = null;
  private initialized = false;
  private routerBound = false;

  /** Tracking configured for this store (null on the server, in previews or without IDs). */
  readonly tracking = computed(() => (this.browser ? this.state.store()?.tracking ?? null : null));
  readonly askConsent = computed(() => Boolean(this.tracking()) && this.consent() === null);

  /** Call once the store view is known, in the browser; later calls do nothing. */
  init(): void {
    const tracking = this.tracking();
    if (!tracking || !this.browser || this.initialized) return;
    this.initialized = true;
    const stored = this.readConsent();
    this.consent.set(stored);
    if (stored === 'granted') this.load(tracking);
  }

  accept(): void {
    this.saveConsent('granted');
    const tracking = this.tracking();
    if (!tracking) return;
    if (this.loaded) {
      const win = this.window();
      win.gtag?.('consent', 'update', {
        analytics_storage: 'granted',
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted',
      });
      win.fbq?.('consent', 'grant');
      return;
    }
    this.load(tracking);
  }

  reject(): void {
    this.saveConsent('denied');
    if (!this.loaded) return;
    const win = this.window();
    win.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    win.fbq?.('consent', 'revoke');
  }

  /** Shows the banner again so the buyer can change a previous choice. */
  reopenConsent(): void {
    this.consent.set(null);
  }

  /** Pages may emit before the banner initialised the service on the first render. */
  private get active(): boolean {
    this.init();
    return Boolean(this.loaded) && this.consent() === 'granted';
  }

  viewProduct(product: PublicProductCard, priceCents = product.priceCents): void {
    this.viewItem(
      {
        id: product.handle,
        name: product.name,
        priceCents,
        quantity: 1,
        brand: product.brand,
        category: product.categories[0] ?? null,
      },
      product.currency,
    );
  }

  /** Checkout opened with the bag lines. */
  beginCheckoutFromCart(lines: { handle: string; name: string; unitCents: number; quantity: number }[], currency: string): void {
    if (!lines.length) return;
    const items = lines.map((line) => ({
      id: line.handle,
      name: line.name,
      priceCents: line.unitCents,
      quantity: line.quantity,
    }));
    this.beginCheckout(
      items,
      items.reduce((total, item) => total + item.priceCents * item.quantity, 0),
      currency,
    );
  }

  viewItem(item: AnalyticsItem, currency: string): void {
    this.event('view_item', 'ViewContent', item.priceCents, currency, [item]);
  }

  addToCart(item: AnalyticsItem, currency: string): void {
    this.event('add_to_cart', 'AddToCart', item.priceCents * item.quantity, currency, [item]);
  }

  beginCheckout(items: AnalyticsItem[], valueCents: number, currency: string): void {
    this.event('begin_checkout', 'InitiateCheckout', valueCents, currency, items);
  }

  /** Paid orders only, once per order and browser. */
  purchase(order: PublicOrder): void {
    if (!this.active || order.status === 'PENDING_PAYMENT' || order.status === 'CANCELLED') return;
    const key = `${PURCHASE_KEY}${order.id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      return;
    }
    const items = order.items.map((item) => ({
      id: item.handle ?? item.title,
      name: item.title,
      priceCents: item.unitCents,
      quantity: item.quantity,
    }));
    const win = this.window();
    win.gtag?.('event', 'purchase', {
      transaction_id: order.id,
      value: order.totalCents / 100,
      currency: order.currency,
      shipping: order.shippingCents / 100,
      ...(order.couponCode ? { coupon: order.couponCode } : {}),
      items: items.map(toGa4Item),
    });
    win.fbq?.(
      'track',
      'Purchase',
      {
        value: order.totalCents / 100,
        currency: order.currency,
        content_type: 'product',
        content_ids: items.map((item) => item.id),
        contents: items.map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.priceCents / 100 })),
        num_items: items.reduce((total, item) => total + item.quantity, 0),
      },
      { eventID: order.id },
    );
  }

  private event(ga4: string, meta: string, valueCents: number, currency: string, items: AnalyticsItem[]): void {
    if (!this.active) return;
    const win = this.window();
    win.gtag?.('event', ga4, { currency, value: valueCents / 100, items: items.map(toGa4Item) });
    win.fbq?.('track', meta, {
      currency,
      value: valueCents / 100,
      content_type: 'product',
      content_ids: items.map((item) => item.id),
      contents: items.map((item) => ({ id: item.id, quantity: item.quantity, item_price: item.priceCents / 100 })),
    });
  }

  private load(tracking: StoreTracking): void {
    if (this.loaded) return;
    this.loaded = tracking;
    const win = this.window();
    if (tracking.ga4MeasurementId) {
      win.dataLayer = win.dataLayer ?? [];
      if (typeof win.gtag !== 'function') {
        win.gtag = function gtag() {
          // eslint-disable-next-line prefer-rest-params -- gtag.js only reads Arguments objects
          win.dataLayer?.push(arguments);
        };
      }
      win.gtag('js', new Date());
      win.gtag('config', tracking.ga4MeasurementId, { send_page_view: false });
      this.script(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(tracking.ga4MeasurementId)}`);
    }
    if (tracking.metaPixelId && !win.fbq) {
      type MetaStub = ((...args: unknown[]) => void) & {
        callMethod?: (...args: unknown[]) => void;
        queue: unknown[];
        push?: unknown;
        loaded?: boolean;
        version?: string;
      };
      // Official Meta snippet: fbevents.js replays the queued Arguments objects.
      const fbq = function (this: unknown) {
        if (fbq.callMethod) {
          // eslint-disable-next-line prefer-rest-params
          fbq.callMethod.apply(fbq, arguments as unknown as unknown[]);
        } else {
          // eslint-disable-next-line prefer-rest-params
          fbq.queue.push(arguments);
        }
      } as MetaStub;
      fbq.queue = [];
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      win.fbq = fbq;
      win._fbq = win._fbq ?? fbq;
      this.script('https://connect.facebook.net/en_US/fbevents.js');
      win.fbq('init', tracking.metaPixelId);
    }
    this.pageView();
    if (!this.routerBound) {
      this.routerBound = true;
      this.router.events
        .pipe(filter((event) => event instanceof NavigationEnd))
        // Wait a tick so the page title is already updated by the SEO service.
        .subscribe(() => setTimeout(() => this.pageView()));
    }
  }

  private pageView(): void {
    if (!this.active) return;
    const win = this.window();
    if (new URL(win.location.href).searchParams.has('recover') || new URL(win.location.href).searchParams.has('stop')) return;
    win.gtag?.('event', 'page_view', {
      page_location: win.location.href,
      page_path: win.location.pathname,
      page_title: this.document.title,
    });
    win.fbq?.('track', 'PageView');
  }

  private script(src: string): void {
    const script = this.document.createElement('script');
    script.async = true;
    script.src = src;
    this.document.head.appendChild(script);
  }

  private window(): TrackingWindow {
    return this.document.defaultView as TrackingWindow;
  }

  private storageKey(): string {
    return `${CONSENT_KEY}${this.state.store()?.slug ?? ''}`;
  }

  private readConsent(): Consent | null {
    try {
      const value = localStorage.getItem(this.storageKey());
      return value === 'granted' || value === 'denied' ? value : null;
    } catch {
      return null;
    }
  }

  private saveConsent(value: Consent): void {
    this.consent.set(value);
    try {
      localStorage.setItem(this.storageKey(), value);
    } catch {
      // Blocked storage: the choice applies to this visit only.
    }
  }
}

function toGa4Item(item: AnalyticsItem) {
  return {
    item_id: item.id,
    item_name: item.name,
    price: item.priceCents / 100,
    quantity: item.quantity,
    ...(item.brand ? { item_brand: item.brand } : {}),
    ...(item.category ? { item_category: item.category } : {}),
  };
}

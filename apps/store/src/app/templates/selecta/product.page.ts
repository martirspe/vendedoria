import { RecommendationsComponent } from '../../components/recommendations.component';
import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { PublicVariant } from '@vendedoria/contracts';
import { ProductFactsComponent } from '../../components/product-facts.component';
import { AnalyticsService } from '../../core/analytics.service';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { markNotFound } from '../../core/not-found-status';
import { productCopy } from '../../core/page-copy';
import { SeoService } from '../../core/seo.service';
import { serviceSummary } from '../../core/service-info';
import { STORE_EDITOR, StoreEditorBridge } from '../../core/store-editor';
import { StoreStateService } from '../../core/store-state.service';
import { productReference, whatsappUrl } from '../../core/whatsapp';
import {
  Product,
  SelectaCatalog,
  bagLine,
  buyable,
  category,
  maxUnits,
  photos,
  piecesOf,
  scarcity,
  setSaving,
  setsWith,
  stockOf,
} from './selecta-catalog';
import { wholeMoney } from '../../core/store-faq';
import { SelectaIcon } from './selecta-icon';
import { SelectaPhoto, SelectaProductImage } from './selecta-photo';

@Component({
  selector: 'selecta-product',
  imports: [RecommendationsComponent, DsSelectComponent,
    RouterLink,
    MoneyPipe,
    SelectaIcon,
    SelectaPhoto,
    SelectaProductImage,
    ProductFactsComponent,
    STORE_EDITOR,
  ],
  templateUrl: './product.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaProductPage {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly state = inject(StoreStateService);
  private readonly catalog = inject(SelectaCatalog);
  private readonly analytics = inject(AnalyticsService);
  readonly cart = inject(CartService);
  readonly editor = inject(StoreEditorBridge);
  readonly store = this.state.store;
  readonly texts = computed(() => productCopy(this.store()?.templateContent));

  readonly handle = signal(this.route.snapshot.paramMap.get('handle'));
  readonly product = computed(() => this.catalog.find(this.handle()));
  readonly qty = signal(1);
  readonly selected = signal(0);
  readonly added = signal('');
  readonly variantId = signal<string | null>(null);

  readonly online = computed(() => this.store()?.checkout.mode === 'online');
  readonly freeLabel = computed(() => {
    const store = this.store();
    const free = store?.shipping.freeShippingFromCents;
    return store && free ? wholeMoney(store, free) : '';
  });
  readonly deliveryLabel = computed(() => {
    const modes = (this.store()?.shipping.options ?? []).map((o) => o.mode);
    const home = modes.some((m) => m !== 'PICKUP');
    const pickup = modes.includes('PICKUP');
    return home && pickup ? 'envío o recojo' : pickup ? 'recojo' : 'envío';
  });
  readonly photos = computed(() => {
    const p = this.product();
    return p ? photos(p) : [];
  });
  readonly relatedPhotos = computed(() => this.product()?.media.filter((m) => m.kind === 'related') ?? []);
  readonly montage = computed(() => Boolean(this.product()?.details.montage) && this.photos().length > 1);
  readonly totalPhotos = computed(() => this.photos().length + (this.montage() ? 1 : 0));
  readonly caption = computed(() => {
    if (this.selected() < 0) return 'Vista del set · fotografías individuales';
    const photo = this.photos()[this.selected()];
    return photo?.caption || photo?.alt || '';
  });
  readonly variant = computed<PublicVariant | null>(
    () => this.product()?.variants.find((v) => v.id === this.variantId()) ?? null,
  );
  readonly price = computed(() => this.variant()?.priceCents ?? this.product()?.priceCents ?? 0);
  readonly isService = computed(() => this.product()?.kind === 'SERVICE');
  readonly isDigital = computed(() => this.product()?.kind === 'DIGITAL');
  readonly serviceSummary = computed(() => serviceSummary(this.product()?.service));
  /** Ready to buy: in stock and, when it has variants, with an available one chosen. */
  readonly canBuy = computed(() => {
    const p = this.product();
    if (!p?.isAvailable) return false;
    return !p.hasVariants || Boolean(this.variant()?.isAvailable);
  });
  readonly upsell = computed(() => {
    const p = this.product();
    return p && p.format !== 'set' ? setsWith(p, this.catalog.products())[0] : undefined;
  });
  readonly pieces = computed(() => {
    const p = this.product();
    return p?.format === 'set' ? piecesOf(p, this.catalog.products()) : [];
  });
  readonly buyParams = computed(() => {
    const p = this.product();
    return p
      ? { producto: p.handle, cantidad: this.qty(), ...(this.variant() ? { variante: this.variant()!.id } : {}) }
      : {};
  });
  readonly whatsapp = computed(() => {
    const store = this.store();
    const p = this.product();
    if (!store?.whatsappPhone || !p) return null;
    const codes = p.includes.map((i) => i.code).filter(Boolean).join(', ');
    return whatsappUrl(
      store.whatsappPhone,
      [
        `Hola, me interesa ${p.name} (${this.state.formatMoney(this.price())}).`,
        codes ? `Códigos: ${codes}.` : '',
        this.seo.absolute(`/producto/${p.handle}`),
        productReference(p.handle),
      ]
        .filter(Boolean)
        .join(' '),
    );
  });

  readonly stockOf = stockOf;
  readonly scarcity = scarcity;
  readonly maxUnits = maxUnits;
  readonly categoryOf = category;

  constructor() {
    if (!this.product()) markNotFound();
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.select(params.get('handle')));
    afterNextRender(() => {
      void this.catalog.refresh();
    });
  }

  saving(set: Product): number {
    return setSaving(set, this.catalog.products());
  }

  step(n: number): void {
    const total = this.totalPhotos();
    const offset = this.montage() ? 1 : 0;
    if (total) this.selected.set(((this.selected() + offset + n + total) % total) - offset);
  }

  add(p: Product): void {
    if (!this.canBuy()) return;
    this.cart.add(bagLine(p, this.variant()), this.qty(), maxUnits(p));
    this.added.set('Añadido a tu bolsa.');
  }

  quickAdd(p: Product): void {
    if (!buyable(p)) return;
    this.cart.add(bagLine(p), 1, maxUnits(p));
    this.added.set(`${p.name} se añadió a tu bolsa.`);
  }

  pickVariant(id: string): void {
    this.variantId.set(id || null);
    this.qty.set(1);
  }

  private select(handle: string | null): void {
    this.handle.set(handle);
    const p = this.product();
    this.selected.set(p?.details.montage && photos(p).length > 1 ? -1 : 0);
    this.qty.set(1);
    this.added.set('');
    const variants = p?.variants ?? [];
    this.variantId.set((variants.find((v) => v.isAvailable) ?? variants[0])?.id ?? null);
    if (p) this.setSeo(p);
    if (p) this.analytics.viewProduct(p);
  }

  private setSeo(p: Product): void {
    const path = `/producto/${p.handle}`;
    this.seo.set({
      title: p.seoTitle || p.name,
      description: p.seoDescription || p.descriptionShort,
      path,
      image: p.imageUrl,
      type: 'product',
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: p.name,
        ...(p.descriptionFull || p.descriptionShort ? { description: p.descriptionFull || p.descriptionShort } : {}),
        ...(photos(p).length ? { image: photos(p).map((m) => m.url) } : {}),
        ...(p.brand ? { brand: { '@type': 'Brand', name: p.brand } } : {}),
        offers: {
          '@type': 'Offer',
          url: this.seo.absolute(path),
          priceCurrency: p.currency,
          price: (p.priceCents / 100).toFixed(2),
          availability: p.isAvailable ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        },
      },
    });
  }
}

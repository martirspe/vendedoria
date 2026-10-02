import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import type { PublicVariant } from '@vendedoria/contracts';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { markNotFound } from '../../core/not-found-status';
import { SeoService } from '../../core/seo.service';
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
import { wholeMoney } from './selecta-copy';
import { SelectaIcon } from './selecta-icon';
import { SelectaPhoto, SelectaProductImage } from './selecta-photo';

@Component({
  selector: 'selecta-product',
  imports: [RouterLink, MoneyPipe, SelectaIcon, SelectaPhoto, SelectaProductImage],
  templateUrl: './product.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaProductPage {
  private readonly route = inject(ActivatedRoute);
  private readonly seo = inject(SeoService);
  private readonly state = inject(StoreStateService);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);
  readonly store = this.state.store;

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
  readonly related = computed(() => {
    const p = this.product();
    return p?.lineKey
      ? this.catalog.products().filter((r) => r.handle !== p.handle && r.lineKey === p.lineKey).slice(0, 8)
      : [];
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

  readonly track = viewChild<ElementRef<HTMLElement>>('track');
  readonly hovering = signal(false);
  readonly userTook = signal(false);
  readonly canSlide = signal(false);

  readonly scarcity = scarcity;
  readonly stockOf = stockOf;
  readonly maxUnits = maxUnits;
  readonly categoryOf = category;

  constructor() {
    if (!this.product()) markNotFound();
    const destroy = inject(DestroyRef);
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => this.select(params.get('handle')));
    afterNextRender(() => {
      void this.catalog.refresh();
      const id = setInterval(() => this.autoplay(), 4000);
      const onResize = () => this.checkSlide();
      addEventListener('resize', onResize, { passive: true });
      this.checkSlide();
      destroy.onDestroy(() => {
        clearInterval(id);
        removeEventListener('resize', onResize);
      });
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

  manual(dir: number): void {
    this.userTook.set(true);
    this.slide(dir);
  }

  checkSlide(): void {
    const el = this.track()?.nativeElement;
    this.canSlide.set(!!el && el.scrollWidth > el.clientWidth + 4);
  }

  private slide(dir: number): void {
    const el = this.track()?.nativeElement;
    if (!el || !this.canSlide()) return;
    const card = el.querySelector<HTMLElement>('.slide');
    const stepPx = card ? card.offsetWidth + parseFloat(getComputedStyle(el).columnGap || '0') : el.clientWidth;
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
    const atStart = el.scrollLeft <= 4;
    el.scrollTo({
      left: dir > 0 && atEnd ? 0 : dir < 0 && atStart ? el.scrollWidth : el.scrollLeft + dir * stepPx,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
  }

  private autoplay(): void {
    const el = this.track()?.nativeElement;
    if (!el || this.hovering() || this.userTook() || document.hidden) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = el.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < innerHeight) this.slide(1);
  }

  private select(handle: string | null): void {
    this.handle.set(handle);
    const p = this.product();
    this.selected.set(p?.details.montage && photos(p).length > 1 ? -1 : 0);
    this.qty.set(1);
    this.added.set('');
    this.userTook.set(false);
    const variants = p?.variants ?? [];
    this.variantId.set((variants.find((v) => v.isAvailable) ?? variants[0])?.id ?? null);
    if (p) this.setSeo(p);
    if (typeof document !== 'undefined') {
      setTimeout(() => {
        this.track()?.nativeElement.scrollTo({ left: 0 });
        this.checkSlide();
      });
    }
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

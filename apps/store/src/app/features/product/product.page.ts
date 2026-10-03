import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicProductDetail, PublicVariant } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { ProductCardComponent } from '../../components/product-card.component';
import { AnalyticsService } from '../../core/analytics.service';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { productReference, whatsappUrl } from '../../core/whatsapp';
import { NotFoundPage } from '../not-found/not-found.page';

type OptionGroup = {
  name: string;
  values: Array<{ value: string; available: boolean }>;
};

@Component({
  selector: 'store-product-page',
  imports: [RouterLink, DsIconComponent, MoneyPipe, ProductCardComponent, NotFoundPage],
  templateUrl: './product.page.html',
  styleUrl: './product.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductPage {
  private readonly seo = inject(SeoService);
  private readonly cart = inject(CartService);
  private readonly analytics = inject(AnalyticsService);
  readonly store = inject(StoreStateService).store;

  readonly product = input.required<PublicProductDetail | null>();

  readonly optionGroups = computed<OptionGroup[]>(() => {
    const groups = new Map<string, Map<string, boolean>>();
    for (const variant of this.product()?.variants ?? []) {
      for (const option of variant.options) {
        const values = groups.get(option.name) ?? new Map<string, boolean>();
        values.set(option.value, (values.get(option.value) ?? false) || variant.isAvailable);
        groups.set(option.name, values);
      }
    }
    return [...groups].map(([name, values]) => ({
      name,
      values: [...values].map(([value, available]) => ({ value, available })),
    }));
  });

  /** Starts on the first available variant so the price and stock are concrete. */
  readonly selection = linkedSignal<Partial<Record<string, string>>>(() => {
    const variants = this.product()?.variants ?? [];
    const initial = variants.find((variant) => variant.isAvailable) ?? variants[0];
    return Object.fromEntries((initial?.options ?? []).map((o) => [o.name, o.value]));
  });

  readonly selectedVariant = computed<PublicVariant | null>(() => {
    const selection = this.selection();
    return (
      this.product()?.variants.find((variant) =>
        variant.options.every((option) => selection[option.name] === option.value),
      ) ?? null
    );
  });

  readonly gallery = computed(() => {
    const product = this.product();
    if (!product) return [];
    const images = [...product.media];
    const variantImage = this.selectedVariant()?.imageUrl;
    if (variantImage && !images.includes(variantImage)) images.unshift(variantImage);
    if (!images.length && product.imageUrl) images.push(product.imageUrl);
    return images;
  });

  readonly activeImage = linkedSignal(() => {
    const variantImage = this.selectedVariant()?.imageUrl;
    return variantImage ?? this.gallery()[0] ?? null;
  });

  readonly priceCents = computed(
    () => this.selectedVariant()?.priceCents ?? this.product()?.priceCents ?? 0,
  );

  readonly canAdd = computed(() => {
    const product = this.product();
    if (!product?.isAvailable) return false;
    return product.hasVariants ? Boolean(this.selectedVariant()?.isAvailable) : true;
  });

  readonly quantity = signal(1);
  readonly added = signal(false);

  readonly whatsappHref = computed(() => {
    const store = this.store();
    const product = this.product();
    if (!store?.whatsappPhone || !product) return null;
    const variant = this.selectedVariant();
    const text = [
      `Hola, me interesa "${product.name}"${variant ? ` (${variant.label})` : ''}. ¿Está disponible?`,
      productReference(product.handle),
      this.seo.absolute(`/producto/${product.handle}`),
    ].join('\n');
    return whatsappUrl(store.whatsappPhone, text);
  });

  constructor() {
    effect(() => {
      const product = this.product();
      if (!product) {
        return;
      }
      const path = `/producto/${product.handle}`;
      this.seo.set({
        title: product.seoTitle || product.name,
        description: product.seoDescription || product.descriptionShort,
        path,
        image: product.imageUrl,
        type: 'product',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          ...(product.descriptionShort ? { description: product.descriptionShort } : {}),
          ...(product.media.length ? { image: product.media } : {}),
          ...(product.brand ? { brand: { '@type': 'Brand', name: product.brand } } : {}),
          offers: {
            '@type': 'Offer',
            url: this.seo.absolute(path),
            priceCurrency: product.currency,
            price: (product.priceCents / 100).toFixed(2),
            availability: product.isAvailable
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
          },
        },
      });
      untracked(() => this.analytics.viewProduct(product));
    });
  }

  isSelected(group: string, value: string): boolean {
    return this.selection()[group] === value;
  }

  select(group: string, value: string): void {
    this.selection.update((current) => ({ ...current, [group]: value }));
    this.added.set(false);
  }

  changeQuantity(delta: number): void {
    this.quantity.update((value) => Math.min(Math.max(value + delta, 1), 99));
  }

  addToCart(): void {
    const product = this.product();
    if (!product || !this.canAdd()) return;
    const variant = this.selectedVariant();
    this.cart.add(
      {
        handle: product.handle,
        name: product.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        unitCents: this.priceCents(),
        currency: product.currency,
        imageUrl: variant?.imageUrl ?? product.imageUrl,
      },
      this.quantity(),
    );
    this.added.set(true);
  }
}

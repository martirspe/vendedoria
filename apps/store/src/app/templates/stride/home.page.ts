import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import {
  HomeBlockComponent,
  sharedBlockType,
} from '../../components/home-block.component';
import { ProductCardComponent } from '../../components/product-card.component';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreApiService } from '../../core/store-api.service';
import { STORE_EDITOR, StoreEditorBridge } from '../../core/store-editor';
import { defaultFaq } from '../../core/store-faq';
import { homeBlock, homeSections } from '../../core/store-layout';
import { StoreStateService } from '../../core/store-state.service';
import { whatsappUrl } from '../../core/whatsapp';
import { strideCopy } from './stride-copy';
import {
  loadStrideSelection,
  strideSpotlight,
  type StrideSelection,
} from './stride-selection';

const BUILTINS = [
  'hero',
  'featured',
  'editorial',
  'categories',
  'spotlight',
  'stories',
  'voices',
  'faq',
  'closing',
];

@Component({
  selector: 'stride-home',
  imports: [
    RouterLink,
    DsIconComponent,
    MoneyPipe,
    ProductCardComponent,
    HomeBlockComponent,
    STORE_EDITOR,
  ],
  templateUrl: './home.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrideHomePage {
  private readonly api = inject(StoreApiService);
  readonly store = inject(StoreStateService).store;
  readonly selection = input.required<StrideSelection>();
  private readonly refreshed = signal<StrideSelection | null>(null);
  readonly loading = signal(false);
  readonly products = computed(
    () => (this.refreshed() ?? this.selection()).list?.items ?? [],
  );
  readonly failed = computed(
    () => !(this.refreshed() ?? this.selection()).list,
  );
  readonly copy = computed(() => strideCopy(this.store()));
  readonly sections = computed(() =>
    homeSections(
      this.store()?.templateContent ?? { version: 1, sections: {} },
      'stride',
      BUILTINS,
    ),
  );
  readonly editing = inject(StoreEditorBridge).active;
  readonly sharedType = sharedBlockType;
  readonly spotlight = computed(() => strideSpotlight(this.products()));
  readonly scarcity = computed(() => {
    const stock = (this.refreshed() ?? this.selection()).stock;
    const left = stock?.stockLeft;
    return stock?.isAvailable &&
      stock.handle === this.spotlight()?.handle &&
      left != null &&
      Number.isInteger(left) &&
      left > 0 &&
      left <= 5
      ? left
      : null;
  });
  readonly categories = computed(() =>
    (this.store()?.categories ?? []).slice(0, 3).map((name) => ({
      name,
      image:
        this.products().find((p) => p.categories.includes(name) && p.imageUrl)
          ?.imageUrl ?? null,
    })),
  );
  readonly faq = computed(() => {
    const store = this.store();
    return store
      ? store.templateContent.faq?.length
        ? store.templateContent.faq
        : defaultFaq(store, {
            online:
              'No. Elige tus productos y completa tus datos, la entrega y el pago en una sola página, como invitado.',
            whatsapp:
              'No. Reúne tus favoritos en el carrito y envíanos el pedido por WhatsApp para confirmar disponibilidad, entrega y pago.',
          })
      : [];
  });
  readonly whatsappHref = computed(() => {
    const store = this.store();
    return store?.whatsappPhone
      ? whatsappUrl(
          store.whatsappPhone,
          `Hola ${store.displayName}, quiero consultar sobre una talla o un producto.`,
        )
      : null;
  });
  readonly heroImage = computed(() =>
    this.image(
      'hero',
      'image',
      this.store()?.heroImageUrl ??
        this.products().find((p) => p.imageUrl)?.imageUrl,
    ),
  );

  constructor() {
    const editor = inject(StoreEditorBridge);
    const seo = inject(SeoService);
    effect(() => editor.registerFaq(this.faq()));
    effect(() => {
      const store = this.store();
      if (store)
        seo.set({
          title: store.seoTitle || store.displayName,
          description:
            store.seoDescription || store.tagline || this.copy().hero.text,
          path: '/',
          image: this.heroImage(),
          jsonLd: {
            '@context': 'https://schema.org',
            '@type': 'Store',
            name: store.displayName,
            url: seo.absolute('/'),
          },
        });
    });
  }

  image(
    section: string,
    field: string,
    fallback?: string | null,
  ): string | null {
    const own = this.store()?.templateContent.sections[section]?.[field];
    return own !== undefined ? own || null : (fallback ?? null);
  }

  block(id: string) {
    return homeBlock(
      this.store()?.templateContent ?? { version: 1, sections: {} },
      id,
    );
  }

  async retry(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    try {
      this.refreshed.set(await loadStrideSelection(this.api));
    } finally {
      this.loading.set(false);
    }
  }
}

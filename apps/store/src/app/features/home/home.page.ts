import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicProductList } from '@vendedoria/contracts';
import { DsIconComponent, type DsIconName } from '@vendedoria/ui';
import { HomeBlockComponent, sharedBlockType } from '../../components/home-block.component';
import { ProductCardComponent } from '../../components/product-card.component';
import { SeoService } from '../../core/seo.service';
import { STORE_EDITOR, StoreEditorBridge } from '../../core/store-editor';
import { defaultFaq } from '../../core/store-faq';
import { HomeBlock, homeBlock, homeSections } from '../../core/store-layout';
import { StoreStateService } from '../../core/store-state.service';
import { storeBrand } from '../../core/theme';
import { whatsappUrl } from '../../core/whatsapp';

/** Home sections of the template in default order (API `TEMPLATE_SECTIONS.classic`). */
const BUILTINS = ['hero', 'featured', 'how'];

const STEPS: { icon: DsIconName; title: string; text: string }[] = [
  {
    icon: 'shoppingBag',
    title: 'Elige tus productos',
    text: 'Agrégalos al carrito con la talla o versión que prefieras.',
  },
  {
    icon: 'message',
    title: 'Envía tu pedido por WhatsApp',
    text: 'Te llega un mensaje listo con el detalle de tu compra.',
  },
  {
    icon: 'check',
    title: 'Confirmamos y coordinamos',
    text: 'Te confirmamos stock, costo de envío y forma de pago antes de cobrar.',
  },
];

const CLASSIC_CART = {
  online:
    'No. Agrega tus productos al carrito y completa tus datos, la entrega y el pago en una sola página, como invitado.',
  whatsapp:
    'No. Agrega tus productos al carrito y envíanos el pedido por WhatsApp. Te confirmamos el stock, la entrega y el pago antes de preparar tu pedido.',
};

@Component({
  selector: 'store-home-page',
  imports: [RouterLink, DsIconComponent, ProductCardComponent, HomeBlockComponent, STORE_EDITOR],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly seo = inject(SeoService);
  readonly store = inject(StoreStateService).store;

  readonly featured = input.required<PublicProductList>();

  /** Merchant texts over the defaults; '' hides a text. */
  readonly copy = computed(() => {
    const store = this.store();
    const sections = store?.templateContent.sections ?? {};
    const text = (section: string, field: string, fallback: string) => sections[section]?.[field] ?? fallback;
    return {
      title: text('hero', 'title', store?.displayName ?? ''),
      text: text('hero', 'text', store?.tagline ?? ''),
      cta: text('hero', 'cta', 'Ver productos'),
      featuredTitle: text('featured', 'title', 'Destacados'),
      howTitle: text('how', 'title', 'Cómo comprar'),
      steps: STEPS.map((step, i) => ({
        icon: step.icon,
        title: text('how', `step${i + 1}Title`, step.title),
        text: text('how', `step${i + 1}Text`, step.text),
      })),
    };
  });

  readonly sections = computed(() => {
    const store = this.store();
    return store ? homeSections(store.templateContent, 'classic', BUILTINS) : [];
  });
  readonly editing = inject(StoreEditorBridge).active;
  readonly sharedType = sharedBlockType;

  /** Answers of the questions block: the merchant's own list or the ones built from the settings. */
  readonly faq = computed(() => {
    const store = this.store();
    if (!store) return [];
    return store.templateContent.faq?.length ? store.templateContent.faq : defaultFaq(store, CLASSIC_CART);
  });

  block(id: string): HomeBlock {
    return homeBlock(this.store()?.templateContent ?? { version: 1, sections: {} }, id);
  }

  /** Merchant image, else the store cover; '' means no image. */
  readonly heroImage = computed(() => {
    const store = this.store();
    const own = store?.templateContent.sections['hero']?.['image'];
    return own !== undefined ? own || null : (store?.heroImageUrl ?? null);
  });

  readonly whatsappHref = computed(() => {
    const store = this.store();
    return store?.whatsappPhone
      ? whatsappUrl(store.whatsappPhone, `Hola ${store.displayName}, quiero hacer una consulta.`)
      : null;
  });

  constructor() {
    const editor = inject(StoreEditorBridge);
    effect(() => editor.registerFaq(this.faq()));
    effect(() => {
      const store = this.store();
      if (!store) {
        return;
      }
      const logo = storeBrand(store).logo;
      this.seo.set({
        title: store.seoTitle || store.displayName,
        description: store.seoDescription || store.tagline,
        path: '/',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: store.displayName,
          url: this.seo.absolute('/'),
          ...(logo ? { logo } : {}),
          ...(store.contactEmail ? { email: store.contactEmail } : {}),
          ...(store.whatsappPhone ? { telephone: `+${store.whatsappPhone}` } : {}),
        },
      });
    });
  }
}

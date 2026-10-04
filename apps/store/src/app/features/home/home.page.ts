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
import { MoneyPipe } from '../../core/money.pipe';
import { STORE_EDITOR, StoreEditorBridge } from '../../core/store-editor';
import { defaultFaq } from '../../core/store-faq';
import { HomeBlock, homeBlock, homeSections } from '../../core/store-layout';
import { StoreStateService } from '../../core/store-state.service';
import { storeBrand } from '../../core/theme';
import { whatsappUrl } from '../../core/whatsapp';

/** Home sections of the template in default order (API `TEMPLATE_SECTIONS.classic`). */
const BUILTINS = ['hero', 'featured', 'how', 'faq', 'closing'];

const STEPS: { icon: DsIconName; title: string; text: string }[] = [
  {
    icon: 'shoppingBag',
    title: 'Elige tus productos',
    text: 'Revisa los detalles y elige la opción que mejor va contigo.',
  },
  {
    icon: 'message',
    title: 'Compra a tu manera',
    text: 'Envía tu selección por WhatsApp para coordinar tu pedido.',
  },
  {
    icon: 'check',
    title: 'Todo claro antes de comprar',
    text: 'Confirma disponibilidad, entrega y forma de pago con la tienda.',
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
  imports: [RouterLink, DsIconComponent, ProductCardComponent, HomeBlockComponent, MoneyPipe, STORE_EDITOR],
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
    const online = store?.checkout.mode === 'online';
    return {
      eyebrow: text('hero', 'eyebrow', store?.displayName ?? ''),
      title: text('hero', 'title', 'Encuentra tu próximo favorito'),
      text: text('hero', 'text', store?.tagline || 'Descubre el catálogo, compara tus opciones y elige lo que va contigo.'),
      cta: text('hero', 'cta', 'Explorar catálogo'),
      featuredTitle: text('featured', 'title', 'Una selección para ti'),
      howTitle: text('how', 'title', 'Comprar aquí es fácil'),
      faqTitle: text('faq', 'title', 'Resuelve tus dudas antes de comprar'),
      closingTitle: text('closing', 'title', 'Tu próxima compra empieza aquí'),
      closingText: text('closing', 'text', 'Encuentra lo que buscas y elige con toda la información a la mano.'),
      closingCta: text('closing', 'cta', 'Ver catálogo'),
      steps: STEPS.map((step, i) => ({
        icon: step.icon,
        title: text('how', `step${i + 1}Title`, online && i === 1 ? 'Finaliza tu compra' : step.title),
        text: text('how', `step${i + 1}Text`, online && i === 1
          ? 'Completa tus datos, entrega y pago en una sola página, sin crear cuenta.'
          : online && i === 2 ? 'Revisa el resumen y paga con tarjeta o Yape. Guarda la confirmación de tu pedido.' : step.text),
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
    return own !== undefined ? own || null : (store?.heroImageUrl ?? this.featured().items.find((p) => p.imageUrl)?.imageUrl ?? null);
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

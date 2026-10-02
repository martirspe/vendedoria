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
import { DsIconComponent } from '@vendedoria/ui';
import { ProductCardComponent } from '../../components/product-card.component';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { whatsappUrl } from '../../core/whatsapp';

@Component({
  selector: 'store-home-page',
  imports: [RouterLink, DsIconComponent, ProductCardComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePage {
  private readonly seo = inject(SeoService);
  readonly store = inject(StoreStateService).store;

  readonly featured = input.required<PublicProductList>();

  readonly whatsappHref = computed(() => {
    const store = this.store();
    return store?.whatsappPhone
      ? whatsappUrl(store.whatsappPhone, `Hola ${store.displayName}, quiero hacer una consulta.`)
      : null;
  });

  constructor() {
    effect(() => {
      const store = this.store();
      if (!store) {
        return;
      }
      this.seo.set({
        title: store.seoTitle || store.displayName,
        description: store.seoDescription || store.tagline,
        path: '/',
        jsonLd: {
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: store.displayName,
          url: this.seo.absolute('/'),
          ...(store.logoUrl ? { logo: store.logoUrl } : {}),
          ...(store.contactEmail ? { email: store.contactEmail } : {}),
          ...(store.whatsappPhone ? { telephone: `+${store.whatsappPhone}` } : {}),
        },
      });
    });
  }
}

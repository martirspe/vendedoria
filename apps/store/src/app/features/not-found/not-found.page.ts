import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { markNotFound } from '../../core/not-found-status';
import { SeoService } from '../../core/seo.service';

@Component({
  selector: 'store-not-found-page',
  imports: [RouterLink, DsIconComponent],
  template: `
    <section class="store-container not-found">
      <ds-icon name="search" [size]="2.5" />
      <h1>No encontramos esta página</h1>
      <p>Es posible que el producto ya no esté disponible o que el enlace haya cambiado.</p>
      <div class="not-found__actions">
        <a class="store-btn store-btn--primary" routerLink="/productos">Ver productos</a>
        <a class="store-btn store-btn--secondary" routerLink="/">Ir al inicio</a>
      </div>
    </section>
  `,
  styles: `
    .not-found {
      display: grid;
      justify-items: center;
      gap: var(--ds-space-3);
      padding: var(--ds-space-12) 0;
      text-align: center;
      color: var(--store-muted);
    }

    .not-found h1 {
      color: var(--store-text);
      font-size: clamp(1.6rem, 4vw, 2.2rem);
    }

    .not-found__actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ds-space-3);
      margin-top: var(--ds-space-3);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {
  constructor() {
    markNotFound();
    inject(SeoService).set({ title: 'Página no encontrada', path: '/', noindex: true });
  }
}

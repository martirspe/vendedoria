import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { markNotFound } from '../../core/not-found-status';
import { SeoService } from '../../core/seo.service';

@Component({
  selector: 'selecta-not-found',
  imports: [RouterLink],
  template: `<section class="wrap not-found">
    <p class="eyebrow">ERROR 404</p>
    <h1>Esta página<br /><em>no existe.</em></h1>
    <p>Es posible que el enlace haya cambiado o que el producto ya no esté disponible.</p>
    <a class="button" routerLink="/">Ir al catálogo</a>
  </section>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaNotFoundPage {
  constructor() {
    markNotFound();
    inject(SeoService).set({ title: 'Página no encontrada', path: '/', noindex: true });
  }
}

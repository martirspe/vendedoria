import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { PublicProductCard } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { MoneyPipe } from '../core/money.pipe';
import { serviceSummary } from '../core/service-info';

@Component({
  selector: 'store-product-card',
  imports: [RouterLink, DsIconComponent, MoneyPipe],
  template: `
    @let p = product();
    <a class="card" [routerLink]="['/producto', p.handle]">
      <div class="card__media">
        @if (p.imageUrl) {
          <img
            [src]="p.imageUrl"
            [alt]="p.name"
            loading="lazy"
            decoding="async"
            width="400"
            height="400"
          />
        } @else {
          <span class="card__placeholder" aria-hidden="true">
            <ds-icon name="image" [size]="2" />
          </span>
        }
        @if (!p.isAvailable) {
          <span class="card__tag card__tag--muted">{{ p.kind === 'SERVICE' ? 'No disponible' : 'Agotado' }}</span>
        } @else if (discount()) {
          <span class="card__tag">-{{ discount() }}%</span>
        }
      </div>
      <div class="card__body">
        <div class="card__copy">
        @if (p.brand) {
          <span class="card__brand">{{ p.brand }}</span>
        }
        <h3 class="card__name">{{ p.name }}</h3>
        @if (p.descriptionShort) { <p class="card__description">{{ p.descriptionShort }}</p> }
        @if (service(); as summary) {
          <span class="card__service"><ds-icon name="clock" [size]="0.85" /> {{ summary }}</span>
        }
        </div>
        <p class="card__price">
          @if (p.priceVaries) {
            <span class="card__from">Desde</span>
          }
          <strong>{{ p.priceCents | money: p.currency }}</strong>
          @if (discount() > 0) {
            <s>{{ p.compareAtPriceCents | money: p.currency }}</s>
          }
        </p>
        <span class="card__action">{{ p.hasVariants ? 'Elegir opciones' : 'Ver detalle' }} <ds-icon name="arrowRight" [size]="1" /></span>
      </div>
    </a>
  `,
  styles: `
    .card {
      display: grid;
      gap: var(--ds-space-3);
      height: 100%;
    }

    .card__media {
      position: relative;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--store-radius-card);
      background: var(--store-surface);
    }

    .card__media img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      transition: transform var(--ds-motion-base) var(--ds-ease-out);
    }

    .card:hover .card__media img {
      transform: scale(1.04);
    }

    .card__placeholder {
      display: grid;
      place-items: center;
      height: 100%;
      color: var(--store-muted);
    }

    .card__tag {
      position: absolute;
      top: var(--ds-space-3);
      left: var(--ds-space-3);
      padding: var(--ds-space-1) var(--ds-space-2);
      border-radius: var(--store-radius-control);
      background: var(--store-brand);
      color: var(--store-on-brand);
      font-size: var(--store-type-caption);
      font-weight: 800;
    }

    .card__tag--muted {
      background: var(--store-overlay);
      color: var(--store-on-overlay);
    }

    .card__body {
      display: flex;
      flex-direction: column;
      gap: var(--ds-space-2);
    }

    .card__copy { display: grid; gap: var(--ds-space-2); }

    .card__brand {
      color: var(--store-muted);
      font-size: var(--store-type-caption);
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .card__name {
      font-family: var(--ds-font-ui);
      font-size: var(--store-type-product);
      font-weight: 600;
      letter-spacing: 0;
      line-height: 1.35;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .card__service {
      display: inline-flex;
      align-items: center;
      gap: var(--ds-space-1);
      color: var(--store-muted);
      font-size: var(--store-type-caption);
    }

    .card__price {
      display: flex;
      margin-top: auto;
      padding-top: var(--ds-space-2);
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ds-space-2);
    }

    .card__from {
      color: var(--store-muted);
      font-size: var(--store-type-caption);
    }

    .card__price s {
      color: var(--store-muted);
      font-size: var(--store-type-caption);
    }
    .card__description { color: var(--store-muted); font-size: var(--store-type-caption); line-height: var(--store-leading-body); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .card__action { display: flex; align-items: center; justify-content: space-between; gap: var(--ds-space-2); min-height: var(--ds-touch-target); margin-top: var(--ds-space-1); border-top: 1px solid var(--store-border); font-weight: 700; font-size: var(--store-type-caption); }
    .card__price strong { font-size: var(--store-type-product); font-variant-numeric: tabular-nums; }
    .card { grid-template-rows: auto 1fr; }
    @media (prefers-reduced-motion: reduce) { .card__media img { transition: none; } .card:hover .card__media img { transform: none; } }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<PublicProductCard>();

  readonly service = computed(() => serviceSummary(this.product().service));

  readonly discount = computed(() => {
    const p = this.product();
    return p.compareAtPriceCents && p.compareAtPriceCents > p.priceCents
      ? Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100)
      : 0;
  });
}

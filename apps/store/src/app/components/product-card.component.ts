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
        @if (p.brand) {
          <span class="card__brand">{{ p.brand }}</span>
        }
        <h3 class="card__name">{{ p.name }}</h3>
        @if (service(); as summary) {
          <span class="card__service"><ds-icon name="clock" [size]="0.85" /> {{ summary }}</span>
        }
        <p class="card__price">
          @if (p.priceVaries) {
            <span class="card__from">Desde</span>
          }
          <strong>{{ p.priceCents | money: p.currency }}</strong>
          @if (p.compareAtPriceCents) {
            <s>{{ p.compareAtPriceCents | money: p.currency }}</s>
          }
        </p>
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
      object-fit: cover;
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
      padding: 0.15rem 0.6rem;
      border-radius: 999px;
      background: var(--store-brand);
      color: var(--store-on-brand);
      font-size: 0.78rem;
      font-weight: 800;
    }

    .card__tag--muted {
      background: rgb(17 19 24 / 72%);
      color: #fff;
    }

    .card__body {
      display: grid;
      gap: 0.2rem;
    }

    .card__brand {
      color: var(--store-muted);
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .card__name {
      font-family: var(--ds-font-ui);
      font-size: 0.975rem;
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
      gap: 0.3rem;
      color: var(--store-muted);
      font-size: 0.82rem;
    }

    .card__price {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0.4rem;
    }

    .card__from {
      color: var(--store-muted);
      font-size: 0.8rem;
    }

    .card__price s {
      color: var(--store-muted);
      font-size: 0.85rem;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<PublicProductCard>();

  readonly service = computed(() => serviceSummary(this.product().service));

  readonly discount = computed(() => {
    const p = this.product();
    return p.compareAtPriceCents
      ? Math.round((1 - p.priceCents / p.compareAtPriceCents) * 100)
      : 0;
  });
}

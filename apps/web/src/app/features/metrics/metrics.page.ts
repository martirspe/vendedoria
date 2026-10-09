import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DsButtonComponent, DsActionBarComponent, DsFormSectionComponent, DsSelectComponent, DsDisclosureComponent } from '@vendedoria/ui';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, map } from 'rxjs';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  MetricsApiService,
  MetricsSummary,
} from '../../core/api/metrics-api.service';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

@Component({
  selector: 'app-metrics-page',
  standalone: true,
  imports: [
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
    RouterLink,
    DatePipe, DsActionBarComponent, DsFormSectionComponent, DsSelectComponent, DsDisclosureComponent,
  ],
  templateUrl: './metrics.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsPage {
  private readonly api = inject(MetricsApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private requestId = 0;

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly summary = signal<MetricsSummary | null>(null);
  readonly days = signal(7);

  constructor() {
    this.route.queryParamMap.pipe(
      map(params => params.get('days') === '30' ? 30 : 7),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(days => void this.load(days));
  }

  changePeriod(event: Event): void {
    if (!(event.target instanceof HTMLSelectElement)) return;
    const days = event.target.value === '30' ? 30 : 7;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { days: days === 7 ? null : days }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  async load(days = this.days()): Promise<void> {
    if (![7, 30].includes(days) || (this.requestId > 0 && this.loading() && days === this.days())) return;
    const requestId = ++this.requestId;
    this.loading.set(true);
    this.errorMessage.set(null);
    this.days.set(days);
    try {
      const summary = await this.api.summary(days);
      if (requestId === this.requestId) this.summary.set(summary);
    } catch {
      if (requestId === this.requestId) this.errorMessage.set('No pudimos actualizar las métricas. Inténtalo de nuevo.');
    } finally {
      if (requestId === this.requestId) this.loading.set(false);
    }
  }

  formatMoney(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  isEmpty(summary: MetricsSummary): boolean {
    return (
      summary.conversations === 0 &&
      summary.ordersCreated === 0 &&
      summary.inboundMessages === 0 &&
      summary.agentMessages === 0 &&
      summary.paidOrders === 0 &&
      summary.revenueCents === 0
    );
  }
}

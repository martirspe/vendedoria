import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  MetricsApiService,
  MetricsSummary,
} from '../../core/api/metrics-api.service';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-metrics-page',
  standalone: true,
  imports: [
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
    RouterLink,
  ],
  templateUrl: './metrics.page.html',
  styleUrl: './metrics.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MetricsPage {
  private readonly api = inject(MetricsApiService);

  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly summary = signal<MetricsSummary | null>(null);
  readonly days = signal(7);

  constructor() {
    void this.load();
  }

  async load(days = this.days()): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.days.set(days);
    try {
      this.summary.set(await this.api.summary(days));
    } catch {
      this.summary.set(null);
      this.errorMessage.set('No pudimos cargar las métricas.');
    } finally {
      this.loading.set(false);
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
      summary.inboundMessages === 0
    );
  }
}

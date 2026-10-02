import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  BillingApiService,
  BillingOverview,
  PlanDefinition,
} from '../../core/api/billing-api.service';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [DsButtonComponent, DsIconComponent],
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlansPage {
  private readonly api = inject(BillingApiService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly overview = signal<BillingOverview | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.overview.set(await this.api.getPlans());
    } catch {
      this.errorMessage.set('No pudimos cargar planes y cuotas.');
    } finally {
      this.loading.set(false);
    }
  }

  async selectPlan(plan: PlanDefinition): Promise<void> {
    const current = this.overview()?.currentPlan.id;
    if (plan.id === current) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.overview.set(await this.api.updatePlan(plan.id));
      this.successMessage.set(
        `Plan ${plan.name} activo. Las cuotas se muestran antes de cualquier bloqueo.`,
      );
    } catch {
      this.errorMessage.set('No se pudo cambiar el plan.');
    } finally {
      this.saving.set(false);
    }
  }

  quotaLabel(used: number, quota: number | null): string {
    if (quota == null) return `${used} · sin tope fijo`;
    return `${used} / ${quota}`;
  }
}

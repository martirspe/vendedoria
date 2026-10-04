import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { DsButtonComponent, DsEmptyStateComponent } from '@vendedoria/ui';
import type { IntegrationKey } from '../../core/api/billing-api.service';
import {
  IntegrationsStateService,
  integrationInfo,
} from '../../core/integrations/integrations-state.service';

/** Shown by an integration page when the integration is off or no longer in the plan. */
@Component({
  selector: 'app-integration-gate',
  standalone: true,
  imports: [DsButtonComponent, DsEmptyStateComponent],
  templateUrl: './integration-gate.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IntegrationGateComponent {
  private readonly integrations = inject(IntegrationsStateService);
  private readonly router = inject(Router);
  readonly key = input.required<IntegrationKey>();
  /** Without a loaded state (request failed) the gate says nothing; the page shows its load error. */
  readonly known = this.integrations.loaded;

  readonly info = computed(() => integrationInfo(this.key()));
  readonly state = computed(
    () => this.integrations.states().find((item) => item.key === this.key()) ?? null,
  );
  /** Required integration that is off right now. */
  readonly requirement = computed(() => {
    const requires = this.state()?.requires;
    return requires && !this.integrations.isActive(requires) ? integrationInfo(requires) : null;
  });
  readonly paused = computed(() => !!this.state()?.enabled && !!this.requirement());
  readonly title = computed(() => {
    if (this.locked()) return 'No incluida en tu plan';
    return this.paused() ? `${this.info().name} está en pausa` : `${this.info().name} está desactivada`;
  });
  readonly description = computed(() => {
    const state = this.state();
    if (state && !state.included) {
      return state.requiredPlan
        ? `${this.info().name} está disponible desde el plan ${state.requiredPlan.name}.`
        : `${this.info().name} no está incluida en tu plan.`;
    }
    const requirement = this.requirement();
    if (requirement) {
      return this.paused()
        ? `Funciona sobre ${requirement.name}. Activa ${requirement.name} en Integraciones y vuelve con tu configuración.`
        : `Activa primero ${requirement.name} y luego ${this.info().name} en Integraciones.`;
    }
    return `Activa ${this.info().name} en Integraciones para configurarla aquí.`;
  });
  readonly locked = computed(() => !!this.state() && !this.state()!.included);

  go(): void {
    void this.router.navigateByUrl(this.locked() ? '/app/plans' : '/app/integrations');
  }
}

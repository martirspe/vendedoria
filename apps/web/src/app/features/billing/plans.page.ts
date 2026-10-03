import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  BillingApiService,
  BillingOverview,
  PlanDefinition,
  PlanPaymentResult,
} from '../../core/api/billing-api.service';

const PROVIDER_PAYMENT_ID = /^\d{1,20}$/;

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [DsButtonComponent, DsIconComponent, RouterLink],
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlansPage {
  private readonly api = inject(BillingApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly overview = signal<BillingOverview | null>(null);
  /** Simulated checkout (development without platform credentials) waiting for confirmation. */
  readonly pendingSimulation = signal<string | null>(null);

  constructor() {
    void this.init();
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
    const data = this.overview();
    if (!data || !this.canSelect(plan, data)) return;
    if (plan.id === 'FREE') {
      await this.downgrade(plan);
      return;
    }
    this.saving.set(true);
    this.clearMessages();
    try {
      const checkout = await this.api.createCheckout(plan.id);
      if (checkout.simulated) {
        this.pendingSimulation.set(checkout.paymentId);
        this.infoMessage.set(
          `Pago de prueba del plan ${plan.name} listo. Confírmalo para activar el plan.`,
        );
        return;
      }
      this.document.defaultView?.location.assign(checkout.checkoutUrl);
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos iniciar el pago del plan.'));
    } finally {
      this.saving.set(false);
    }
  }

  async confirmSimulation(): Promise<void> {
    const paymentId = this.pendingSimulation();
    if (!paymentId || this.saving()) return;
    this.saving.set(true);
    this.clearMessages();
    try {
      this.showResult(await this.api.simulatePayment(paymentId));
      this.pendingSimulation.set(null);
      await this.load();
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos confirmar el pago de prueba.'));
    } finally {
      this.saving.set(false);
    }
  }

  canSelect(plan: PlanDefinition, data: BillingOverview): boolean {
    if (this.saving()) return false;
    if (plan.id === 'FREE') return data.currentPlan.id !== 'FREE';
    return plan.priceCents != null && data.checkoutEnabled;
  }

  buttonLabel(plan: PlanDefinition, data: BillingOverview): string {
    const isCurrent = plan.id === data.currentPlan.id;
    if (isCurrent && plan.id === 'FREE') return 'Plan actual';
    if (this.saving()) return 'Procesando…';
    if (plan.id === 'FREE') return 'Cambiar a Free';
    return isCurrent ? 'Renovar plan' : 'Elegir y pagar';
  }

  periodEndLabel(value: string | null): string | null {
    if (!value) return null;
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date(value));
  }

  quotaLabel(used: number, quota: number | null): string {
    if (quota == null) return `${used} · sin tope fijo`;
    return `${used} / ${quota}`;
  }

  private async init(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    const payment = params.get('payment');
    if (payment) {
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
      await this.handleReturn(payment, params.get('payment_id'), params.get('ref'));
    }
    await this.load();
  }

  private async handleReturn(
    payment: string,
    providerPaymentId: string | null,
    ref: string | null,
  ): Promise<void> {
    if (payment === 'simulated') {
      if (ref) {
        this.pendingSimulation.set(ref);
        this.infoMessage.set('Pago de prueba listo. Confírmalo para activar el plan.');
      }
      return;
    }
    if (!providerPaymentId || !PROVIDER_PAYMENT_ID.test(providerPaymentId)) {
      if (payment === 'failure') {
        this.errorMessage.set('El pago no se completó. Puedes intentarlo de nuevo.');
      }
      return;
    }
    try {
      this.showResult(await this.api.confirmPayment(providerPaymentId));
    } catch (error) {
      this.errorMessage.set(
        this.messageFrom(error, 'No pudimos confirmar tu pago. Si se descontó, escríbenos a soporte.'),
      );
    }
  }

  private async downgrade(plan: PlanDefinition): Promise<void> {
    const accepted = this.document.defaultView?.confirm(
      'Al cambiar a Free pierdes los días que te quedan del plan actual y se aplican sus límites. ¿Continuar?',
    );
    if (!accepted) return;
    this.saving.set(true);
    this.clearMessages();
    try {
      this.overview.set(await this.api.updatePlan(plan.id));
      this.successMessage.set(`Plan ${plan.name} activo.`);
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo cambiar el plan.'));
    } finally {
      this.saving.set(false);
    }
  }

  private showResult(result: PlanPaymentResult): void {
    switch (result.status) {
      case 'active':
        this.successMessage.set('Pago confirmado. Tu plan ya está activo.');
        break;
      case 'pending':
        this.infoMessage.set(
          'Tu pago está en proceso. Activaremos el plan en cuanto Mercado Pago lo confirme.',
        );
        break;
      case 'failed':
        this.errorMessage.set('El pago no se completó. Puedes intentarlo de nuevo.');
        break;
      case 'review':
        this.errorMessage.set(
          'Recibimos tu pago, pero necesitamos revisarlo. Escríbenos a soporte si el plan no se activa pronto.',
        );
        break;
    }
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.infoMessage.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 503].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

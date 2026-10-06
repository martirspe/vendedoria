import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  BillingApiService,
  BillingOverview,
  ChatPack,
  PlanCheckout,
  PlanDefinition,
  PlanPaymentResult,
  PlanPurchase,
  PrepayPrice,
} from '../../core/api/billing-api.service';
import { PlanCheckoutComponent } from './plan-checkout.component';
import { AuthApiService } from '../../core/auth/auth-api.service';

@Component({
  selector: 'app-plans-page',
  standalone: true,
  imports: [DsButtonComponent, DsIconComponent, RouterLink, PlanCheckoutComponent],
  templateUrl: './plans.page.html',
  styleUrl: './plans.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlansPage {
  private readonly api = inject(BillingApiService);
  private readonly auth = inject(AuthApiService);
  readonly canManage = () => this.auth.isManager();

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly infoMessage = signal<string | null>(null);
  readonly overview = signal<BillingOverview | null>(null);
  /** Simulated checkout (development without platform credentials) waiting for confirmation. */
  readonly pendingSimulation = signal<string | null>(null);
  /** Plan or chat pack being paid in place with Mercado Pago. */
  readonly activeCheckout = signal<{ checkout: PlanCheckout; purchase: PlanPurchase } | null>(null);
  /** Months paid at once: 1, 3, 6 or 12. */
  readonly months = signal(1);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.overview.set(await this.api.getPlans());
    } catch {
      this.overview.set(null);
      this.errorMessage.set('No pudimos cargar tus planes. Revisa tu conexión y vuelve a abrir esta página.');
    } finally {
      this.loading.set(false);
    }
  }

  setMonths(months: number): void {
    this.months.set(months);
  }

  /** Price of the plan for the chosen period; quoted plans have none. */
  priceFor(plan: PlanDefinition): PrepayPrice | null {
    return plan.prepay.find((option) => option.months === this.months()) ?? null;
  }

  /** Largest discount offered, for the period selector hint. */
  maxDiscount(data: BillingOverview): number {
    return Math.max(0, ...data.plans.flatMap((plan) => plan.prepay.map((option) => option.discountPercent)));
  }

  periodOptions(data: BillingOverview): PrepayPrice[] {
    return data.plans.find((plan) => plan.prepay.length)?.prepay ?? [];
  }

  money(cents: number): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency: 'PEN',
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  }

  async selectPlan(plan: PlanDefinition): Promise<void> {
    const data = this.overview();
    if (!data || !this.canSelect(plan, data)) return;
    const months = this.months();
    await this.startCheckout(
      { planTier: plan.id, months },
      months === 1
        ? `Pago de prueba del plan ${plan.name} listo. Confírmalo para activar el plan.`
        : `Pago de prueba del plan ${plan.name} por ${months} meses listo. Confírmalo para activar el plan.`,
      'No pudimos abrir el pago de tu plan. Inténtalo de nuevo en unos minutos.',
    );
  }

  async buyChatPack(pack: ChatPack): Promise<void> {
    const data = this.overview();
    if (!data || !this.canManage() || this.saving() || !data.chatPacksAvailable || !data.checkoutEnabled) return;
    await this.startCheckout(
      { chatPackSize: pack.chats },
      `Pago de prueba de ${pack.chats} chats extra listo. Confírmalo para sumarlos a este mes.`,
      'No pudimos abrir el pago de tus chats extra. Inténtalo de nuevo en unos minutos.',
    );
  }

  private async startCheckout(purchase: PlanPurchase, simulatedMessage: string, fallback: string): Promise<void> {
    if (!this.canManage() || this.saving()) return;
    this.saving.set(true);
    this.clearMessages();
    this.activeCheckout.set(null);
    try {
      const checkout = await this.api.createCheckout(purchase);
      if (checkout.simulated) {
        this.pendingSimulation.set(checkout.paymentId);
        this.infoMessage.set(simulatedMessage);
        return;
      }
      this.pendingSimulation.set(null);
      this.activeCheckout.set({ checkout, purchase });
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }

  async onCheckoutCompleted(result: PlanPaymentResult): Promise<void> {
    this.activeCheckout.set(null);
    this.clearMessages();
    this.showResult(result);
    await this.load();
  }

  closeCheckout(): void {
    this.activeCheckout.set(null);
  }

  async confirmSimulation(): Promise<void> {
    const paymentId = this.pendingSimulation();
    if (!paymentId || !this.canManage() || this.saving()) return;
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
    if (!this.canManage() || this.saving()) return false;
    return plan.priceCents != null && data.checkoutEnabled;
  }

  buttonLabel(plan: PlanDefinition, data: BillingOverview): string {
    if (this.saving()) return 'Procesando…';
    if (plan.id !== data.currentPlan.id) return `Elegir ${plan.name}`;
    return data.planStatus === 'TRIAL' ? `Pagar ${plan.name}` : `Renovar ${plan.name}`;
  }

  /** Plan name with its state, e.g. "Crece (prueba gratis)". */
  currentPlanLabel(data: BillingOverview): string {
    if (data.planStatus === 'TRIAL') return `${data.currentPlan.name} (prueba gratis)`;
    if (data.planStatus === 'EXPIRED') return `${data.currentPlan.name} (vencido)`;
    return data.currentPlan.name;
  }

  periodLabel(data: BillingOverview): string | null {
    const end = this.periodEndLabel(data.currentPeriodEnd);
    if (!end) return null;
    switch (data.planStatus) {
      case 'TRIAL':
        return `Tu prueba gratis termina el ${end}`;
      case 'EXPIRED':
        return `Venció el ${end}`;
      default:
        return `Pagado hasta el ${end}`;
    }
  }

  private periodEndLabel(value: string | null): string | null {
    if (!value) return null;
    return new Intl.DateTimeFormat('es-PE', { dateStyle: 'long' }).format(new Date(value));
  }

  /** "12 de 300"; without a limit (or with an expired plan) only the amount used. */
  usageLabel(data: BillingOverview, used: number, quota: number | null): string {
    if (quota == null) return `${used} · sin límite`;
    if (data.planStatus === 'EXPIRED' && quota === 0) return `${used}`;
    return `${used} de ${quota}`;
  }

  private showResult(result: PlanPaymentResult): void {
    switch (result.status) {
      case 'active':
        this.successMessage.set('¡Listo! Recibimos tu pago y ya está aplicado a tu cuenta.');
        break;
      case 'pending':
        this.infoMessage.set(
          'Tu pago está en proceso. Activaremos tu plan apenas Mercado Pago lo confirme; no necesitas hacer nada más.',
        );
        break;
      case 'failed':
        this.errorMessage.set('El pago no se completó. Puedes intentarlo de nuevo.');
        break;
      case 'review':
        this.errorMessage.set(
          'Recibimos tu pago, pero necesitamos revisarlo antes de activar tu plan. Si no se activa en unas horas, escríbenos desde Ayuda.',
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

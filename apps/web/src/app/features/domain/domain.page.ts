import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsConfirmService, DsIconComponent } from '@vendedoria/ui';
import { messageFrom } from '../../core/api/api-error';
import { CustomDomainView, IntegrationsApiService } from '../../core/api/integrations-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

const STATUS_LABELS: Record<CustomDomainView['status'], string> = {
  none: 'Sin dominio',
  pending: 'Esperando configuración',
  active: 'Activo',
  failed: 'Con problemas',
};

@Component({
  selector: 'app-domain-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent, IntegrationGateComponent],
  templateUrl: './domain.page.html',
  styleUrls: ['../store/store.page.scss', '../payments/payments.page.scss', './domain.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DomainPage {
  private readonly api = inject(IntegrationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly confirmDialog = inject(DsConfirmService);
  readonly canManage = inject(AuthApiService).isManager();

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly copied = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly view = signal<CustomDomainView | null>(null);
  readonly active = computed(() => this.integrations.isActive('custom_domain'));
  readonly statusLabel = computed(() => STATUS_LABELS[this.view()?.status ?? 'none']);

  readonly form = this.fb.nonNullable.group({
    domain: ['', [Validators.required, Validators.maxLength(253)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      if (this.active()) this.apply(await this.api.getCustomDomain());
    } catch {
      this.errorMessage.set('No pudimos cargar tu dominio. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Escribe tu dominio, por ejemplo www.mitienda.pe.');
      return;
    }
    await this.run(
      () => this.api.setCustomDomain(this.form.getRawValue().domain.trim()),
      'Dominio guardado. Ahora crea el registro en tu proveedor y pulsa «Comprobar».',
      'No pudimos guardar tu dominio.',
    );
  }

  async verify(): Promise<void> {
    await this.run(
      () => this.api.verifyCustomDomain(),
      null,
      'No pudimos comprobar tu dominio. Inténtalo en unos minutos.',
    );
    const view = this.view();
    if (!this.errorMessage() && view) {
      this.successMessage.set(
        view.status === 'active'
          ? `Listo: tu tienda ya abre en ${view.domain}.`
          : 'Aún no está listo. Los cambios de DNS pueden tardar hasta 24 horas; vuelve a comprobar más tarde.',
      );
    }
  }

  async remove(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Quitar tu dominio?',
      message: 'Tu tienda volverá a abrir solo en su dirección de VendedorIA.',
      confirmLabel: 'Quitar dominio',
      tone: 'danger',
    });
    if (!confirmed) return;
    await this.run(() => this.api.removeCustomDomain(), 'Dominio quitado.', 'No pudimos quitar tu dominio.');
  }

  async copy(value: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(value);
      this.copied.set(value);
      setTimeout(() => this.copied.set(null), 2000);
    } catch {
      this.errorMessage.set('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  private async run(
    action: () => Promise<CustomDomainView>,
    success: string | null,
    fallback: string,
  ): Promise<void> {
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.apply(await action());
      if (success) this.successMessage.set(success);
    } catch (error) {
      this.errorMessage.set(messageFrom(error, fallback));
    } finally {
      this.saving.set(false);
    }
  }

  private apply(view: CustomDomainView): void {
    this.view.set(view);
    this.form.reset({ domain: view.domain ?? '' });
  }
}

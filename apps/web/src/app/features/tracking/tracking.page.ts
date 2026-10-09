import { DsActionBarComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import { messageFrom } from '../../core/api/api-error';
import { IntegrationsApiService, TrackingSettings } from '../../core/api/integrations-api.service';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

const PIXEL_ID = /^\d{10,20}$/;
const GA4_ID = /^G-[A-Z0-9]{4,12}$/;

@Component({
  selector: 'app-tracking-page',
  standalone: true,
  imports: [DsActionBarComponent, DsEmptyStateComponent, ReactiveFormsModule, DsButtonComponent, DsIconComponent, IntegrationGateComponent],
  templateUrl: './tracking.page.html',
  styleUrls: ['../store/store.page.scss', '../payments/payments.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TrackingPage {
  private readonly api = inject(IntegrationsApiService);
  private readonly fb = inject(FormBuilder);
  private readonly integrations = inject(IntegrationsStateService);
  readonly canManage = inject(AuthApiService).isManager();

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly settings = signal<TrackingSettings | null>(null);
  readonly active = computed(() => this.integrations.isActive('tracking'));
  readonly connected = computed(() => {
    const settings = this.settings();
    return !!settings && !!(settings.metaPixelId || settings.ga4MeasurementId);
  });

  readonly form = this.fb.nonNullable.group({
    metaPixelId: ['', [Validators.pattern(PIXEL_ID)]],
    ga4MeasurementId: ['', [Validators.pattern(GA4_ID)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      if (this.active()) this.apply(await this.api.getTracking());
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar tu configuración de analítica. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const values = this.form.getRawValue();
    this.form.patchValue({
      metaPixelId: values.metaPixelId.trim(),
      ga4MeasurementId: values.ga4MeasurementId.trim().toUpperCase(),
    });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.apply(await this.api.updateTracking(this.form.getRawValue()));
      this.successMessage.set(
        this.connected()
          ? 'Guardado. Tu tienda empezará a medir a los visitantes que acepten las cookies.'
          : 'Guardado. Tu tienda no enviará datos a Meta ni a Google.',
      );
    } catch (error) {
      this.errorMessage.set(messageFrom(error, 'No pudimos guardar tus códigos.'));
    } finally {
      this.saving.set(false);
    }
  }

  private apply(settings: TrackingSettings): void {
    this.settings.set(settings);
    this.form.reset({
      metaPixelId: settings.metaPixelId ?? '',
      ga4MeasurementId: settings.ga4MeasurementId ?? '',
    });
  }
}

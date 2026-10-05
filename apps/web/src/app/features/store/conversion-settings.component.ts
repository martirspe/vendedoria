import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { ConversionApiService, ConversionSummary } from '../../core/api/conversion-api.service';

@Component({
  selector: 'app-conversion-settings',
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './conversion-settings.component.html',
  styleUrl: './conversion-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConversionSettingsComponent {
  private readonly api = inject(ConversionApiService);
  readonly auth = inject(AuthApiService);
  readonly loading = signal(true);
  readonly loaded = signal(false);
  readonly enabled = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly summary = signal<ConversionSummary | null>(null);
  readonly form = inject(FormBuilder).nonNullable.group({
    recoveryEnabled: [false],
    emailEnabled: [true],
    whatsappEnabled: [false],
    whatsappTemplate: ['', Validators.pattern(/^[a-z0-9_]*$/)],
    whatsappLanguage: ['es_PE', Validators.required],
    delays: ['15, 120, 1440', Validators.required],
  });
  constructor() {
    void this.load();
  }
  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const [settings, summary] = await Promise.all([this.api.get(), this.api.summary()]);
      this.form.patchValue({
        ...settings,
        whatsappTemplate: settings.whatsappTemplate ?? '',
        delays: settings.delaysMinutes.join(', '),
      });
      this.summary.set(summary);
      this.enabled.set(settings.recoveryEnabled);
      this.loaded.set(true);
      this.form.markAsPristine();
      if (!this.auth.isManager()) this.form.disable();
    } catch {
      this.error.set('No pudimos cargar los recordatorios. Vuelve a intentarlo.');
    } finally {
      this.loading.set(false);
    }
  }
  async save(): Promise<void> {
    if (this.saving() || this.form.invalid) return;
    const values = this.form.getRawValue();
    const delaysMinutes = values.delays.split(',').map((value) => Number(value.trim()));
    if (
      delaysMinutes.length > 3 ||
      delaysMinutes.some(
        (n, i) => !Number.isInteger(n) || n < 1 || n > 4320 || (i > 0 && n <= delaysMinutes[i - 1]),
      )
    ) {
      this.error.set('Indica entre 1 y 3 intervalos crecientes, de 1 a 4320 minutos.');
      return;
    }
    this.saving.set(true);
    this.error.set('');
    this.success.set('');
    try {
      const saved = await this.api.save({
        recoveryEnabled: values.recoveryEnabled,
        emailEnabled: values.emailEnabled,
        whatsappEnabled: values.whatsappEnabled,
        whatsappTemplate: values.whatsappTemplate || undefined,
        whatsappLanguage: values.whatsappLanguage,
        delaysMinutes,
      });
      this.enabled.set(saved.recoveryEnabled);
      this.form.markAsPristine();
      this.success.set('Guardamos la configuración de tus recordatorios.');
      this.summary.set(await this.api.summary().catch(() => this.summary()));
    } catch (error) {
      this.error.set(
        error instanceof HttpErrorResponse && typeof error.error?.message === 'string'
          ? error.error.message
          : 'No pudimos guardar los recordatorios. Inténtalo de nuevo.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { TenantsApiService } from '../../core/api/tenants-api.service';

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './settings.page.html',
  styleUrl: './settings.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly api = inject(TenantsApiService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    country: ['PE', [Validators.required, Validators.minLength(2), Validators.maxLength(2)]],
    currency: ['PEN', [Validators.required, Validators.minLength(3), Validators.maxLength(3)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const tenant = await this.api.getMe();
      this.form.reset({
        name: tenant.name,
        country: tenant.country,
        currency: tenant.currency,
      });
    } catch {
      this.errorMessage.set('No pudimos cargar los ajustes del negocio.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      const values = this.form.getRawValue();
      const updated = await this.api.updateMe({
        name: values.name.trim(),
        country: values.country.trim().toUpperCase(),
        currency: values.currency.trim().toUpperCase(),
      });
      this.form.reset({
        name: updated.name,
        country: updated.country,
        currency: updated.currency,
      });
      this.successMessage.set('Negocio actualizado.');
    } catch {
      this.errorMessage.set('No se pudo guardar. Revisa nombre, país y moneda.');
    } finally {
      this.saving.set(false);
    }
  }
}

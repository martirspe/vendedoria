import { DsSaveBarComponent, DsFormSectionComponent, DsDisclosureComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { TenantsApiService, type TenantDto } from '../../core/api/tenants-api.service';

type BusinessSettings = Pick<TenantDto, 'name' | 'country' | 'currency'>;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  imports: [DsSaveBarComponent, DsFormSectionComponent, DsDisclosureComponent, DsEmptyStateComponent, DsSelectComponent, ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './settings.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPage {
  private readonly api = inject(TenantsApiService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly savedSettings = signal<BusinessSettings | null>(null);
  readonly currencies = [
    { code: 'PEN', label: 'Sol peruano' }, { code: 'USD', label: 'Dólar estadounidense' },
    { code: 'MXN', label: 'Peso mexicano' }, { code: 'COP', label: 'Peso colombiano' },
    { code: 'CLP', label: 'Peso chileno' }, { code: 'ARS', label: 'Peso argentino' },
  ];
  private loadInFlight = false;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.pattern(/\S/)]],
    country: ['PE', [Validators.required, Validators.pattern(/^[A-Za-z]{2}$/)]],
    currency: ['PEN', [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.saving() || this.loadInFlight) return;
    this.loadInFlight = true;
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      const tenant = await this.api.getMe();
      this.apply(tenant);
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar los ajustes del negocio.');
    } finally {
      this.loading.set(false);
      this.loadInFlight = false;
    }
  }

  async save(): Promise<void> {
    if (this.loading() || this.loadFailed() || this.saving()) return;
    if (this.form.controls.name.value.trim().length < 2) this.form.controls.name.setErrors({ trimmedLength: true });
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.successMessage.set(null);
      this.errorMessage.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    if (!this.hasChanges()) return;
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
      this.apply(updated);
      this.successMessage.set('Negocio actualizado.');
    } catch {
      this.errorMessage.set('No pudimos guardar los ajustes. Tus cambios se conservan; vuelve a intentarlo.');
    } finally {
      this.saving.set(false);
    }
  }

  hasChanges(): boolean {
    const saved = this.savedSettings();
    const values = this.form.getRawValue();
    return !!saved && (values.name !== saved.name || values.country !== saved.country || values.currency !== saved.currency);
  }

  discard(): void {
    const saved = this.savedSettings();
    if (!saved || this.saving() || this.loading()) return;
    this.form.reset(saved);
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  fieldError(name: 'name' | 'country' | 'currency'): string | null {
    const control = this.form.controls[name];
    if (!control.touched || !control.invalid) return null;
    if (name === 'name') return 'Escribe el nombre del negocio con al menos 2 caracteres.';
    return name === 'country' ? 'Escribe un código de país de 2 letras.' : 'Selecciona una moneda con código de 3 letras.';
  }

  hasCurrency(code: string): boolean {
    return this.currencies.some(currency => currency.code === code);
  }

  currencyLabel(code: string): string {
    const currency = this.currencies.find(item => item.code === code);
    return currency ? `${currency.label} (${code})` : code;
  }

  private apply(settings: BusinessSettings): void {
    const saved = { name: settings.name, country: settings.country, currency: settings.currency };
    this.savedSettings.set(saved);
    this.form.reset(saved);
  }
}

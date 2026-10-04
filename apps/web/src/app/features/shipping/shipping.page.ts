import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ShippingOption, UbigeoDistrict } from '@vendedoria/contracts';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import { messageFrom } from '../../core/api/api-error';
import { CarrierRates, ShippingApiService, ShippingSettingsView } from '../../core/api/shipping-api.service';

const toCents = (soles: number | null) =>
  soles === null || Number.isNaN(soles) ? null : Math.round(soles * 100);
const toSoles = (cents: number | null) => (cents === null ? null : cents / 100);

const CARRIERS = [
  { key: 'olva', label: 'Olva Courier', defaults: [9, 12, 16, 22, 28] },
  { key: 'shalom', label: 'Shalom', defaults: [8, 10, 14, 18, 24] },
] as const;
const CARRIER_TIER_LABELS = ['Hasta 20 km', 'Hasta 100 km', 'Hasta 400 km', 'Hasta 900 km', 'Más lejos'];

/** Delivery modes and rates shared by the sales agent and the web store. */
@Component({
  selector: 'app-shipping-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './shipping.page.html',
  styleUrl: './shipping.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShippingPage {
  private readonly api = inject(ShippingApiService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly loadError = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly options = signal<ShippingOption[]>([]);

  readonly form = this.fb.nonNullable.group({
    deliveryEnabled: [true],
    freeShippingFrom: [null as number | null, [Validators.min(1)]],
    pickupEnabled: [false],
    pickupAddress: ['', [Validators.maxLength(240)]],
    shippingOriginUbigeo: [''],
    olvaEnabled: [false],
    olva: this.fb.array(this.rateControls([...CARRIERS[0].defaults])),
    shalomEnabled: [false],
    shalom: this.fb.array(this.rateControls([...CARRIERS[1].defaults])),
  });

  readonly carriers = CARRIERS;
  readonly tierLabels = CARRIER_TIER_LABELS;
  readonly districts = signal<UbigeoDistrict[]>([]);
  readonly originDepartment = signal('');
  readonly originProvince = signal('');
  readonly departments = computed(() => [...new Set(this.districts().map((d) => d.department))]);
  readonly provinces = computed(() => {
    const department = this.originDepartment();
    return [...new Set(this.districts().filter((d) => d.department === department).map((d) => d.province))];
  });
  readonly originDistricts = computed(() => {
    const department = this.originDepartment();
    const province = this.originProvince();
    return this.districts().filter((d) => d.department === department && d.province === province);
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    try {
      const [view, districts] = await Promise.all([this.api.get(), this.api.ubigeos()]);
      this.districts.set(districts);
      this.apply(view);
    } catch {
      this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  setOriginDepartment(department: string): void {
    this.originDepartment.set(department);
    this.originProvince.set('');
    this.form.controls.shippingOriginUbigeo.setValue('');
    this.form.controls.shippingOriginUbigeo.markAsDirty();
    this.syncDistrictControl();
  }

  setOriginProvince(province: string): void {
    this.originProvince.set(province);
    this.form.controls.shippingOriginUbigeo.setValue('');
    this.form.controls.shippingOriginUbigeo.markAsDirty();
    this.syncDistrictControl();
  }

  /** The district list depends on the province, so it stays disabled until one is chosen. */
  private syncDistrictControl(): void {
    const control = this.form.controls.shippingOriginUbigeo;
    if (this.originProvince()) control.enable({ emitEvent: false });
    else control.disable({ emitEvent: false });
  }

  async save(): Promise<void> {
    this.errorMessage.set(null);
    this.successMessage.set(null);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    const values = this.form.getRawValue();
    const carrierRates = this.ratesPayload(values);
    if (carrierRates && !values.shippingOriginUbigeo) {
      this.errorMessage.set('Elige el distrito desde donde despachas para cobrar Olva o Shalom por distancia.');
      return;
    }
    this.saving.set(true);
    try {
      this.apply(
        await this.api.update({
          deliveryEnabled: values.deliveryEnabled,
          freeShippingFromCents: toCents(values.freeShippingFrom),
          pickupEnabled: values.pickupEnabled,
          pickupAddress: values.pickupAddress.trim() || null,
          shippingOriginUbigeo: values.shippingOriginUbigeo || null,
          carrierRates,
        }),
      );
      this.successMessage.set('Envíos actualizados.');
    } catch (error) {
      this.errorMessage.set(messageFrom(error, 'No se pudo guardar. Inténtalo de nuevo.'));
    } finally {
      this.saving.set(false);
    }
  }

  private rateControls(soles: number[]) {
    return soles.map((value) =>
      this.fb.nonNullable.control<number | null>(value, [Validators.required, Validators.min(0), Validators.max(1000)]),
    );
  }

  private ratesPayload(values: ReturnType<ShippingPage['form']['getRawValue']>): CarrierRates | null {
    const cents = (rates: (number | null)[]) => rates.map((soles) => toCents(soles) ?? 0);
    const rates: CarrierRates = {};
    if (values.olvaEnabled) rates.olva = cents(values.olva);
    if (values.shalomEnabled) rates.shalom = cents(values.shalom);
    return rates.olva || rates.shalom ? rates : null;
  }

  private apply(view: ShippingSettingsView): void {
    this.options.set(view.options);
    const origin = this.districts().find((d) => d.code === view.shippingOriginUbigeo);
    this.originDepartment.set(origin?.department ?? '');
    this.originProvince.set(origin?.province ?? '');
    const olva = view.carrierRates?.olva;
    const shalom = view.carrierRates?.shalom;
    this.form.reset({
      deliveryEnabled: view.deliveryEnabled,
      freeShippingFrom: toSoles(view.freeShippingFromCents),
      pickupEnabled: view.pickupEnabled,
      pickupAddress: view.pickupAddress ?? '',
      shippingOriginUbigeo: view.shippingOriginUbigeo ?? '',
      olvaEnabled: Boolean(olva),
      olva: olva?.map((c) => c / 100) ?? [...CARRIERS[0].defaults],
      shalomEnabled: Boolean(shalom),
      shalom: shalom?.map((c) => c / 100) ?? [...CARRIERS[1].defaults],
    });
    this.syncDistrictControl();
  }
}

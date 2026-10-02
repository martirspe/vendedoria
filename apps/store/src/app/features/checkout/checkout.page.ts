import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CouponPreviewResult, ShippingMode, UbigeoDistrict } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { StoreApiService } from '../../core/store-api.service';
import { StoreStateService } from '../../core/store-state.service';

const CHECKOUT_KEY = 'vendedoria-checkout-key';

/** Same rule as the API: Lima Metropolitana (1501) and Callao (07) use the Lima rate. */
const shippingZone = (code: string): ShippingMode =>
  code.startsWith('1501') || code.startsWith('07') ? 'LIMA' : 'PROVINCE';

@Component({
  selector: 'store-checkout-page',
  imports: [ReactiveFormsModule, RouterLink, DsIconComponent, MoneyPipe],
  templateUrl: './checkout.page.html',
  styleUrl: './checkout.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPage {
  private readonly api = inject(StoreApiService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  readonly cart = inject(CartService);
  readonly store = inject(StoreStateService).store;

  readonly submitting = signal(false);
  readonly applyingCoupon = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly couponError = signal<string | null>(null);
  readonly coupon = signal<CouponPreviewResult | null>(null);
  readonly mode = signal<ShippingMode | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    phone: ['', [Validators.required, Validators.pattern(/^9\d{8}$/)]],
    document: ['', [Validators.pattern(/^\d{8,12}$/)]],
    mode: ['' as ShippingMode | '', [Validators.required]],
    department: [''],
    province: [''],
    ubigeo: [''],
    address: ['', [Validators.maxLength(200)]],
    reference: ['', [Validators.maxLength(180)]],
    couponCode: ['', [Validators.maxLength(40)]],
    acceptTerms: [false, [Validators.requiredTrue]],
  });

  readonly ubigeos = signal<UbigeoDistrict[]>([]);
  readonly ubigeoState = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly department = signal('');
  readonly province = signal('');
  readonly homeDelivery = computed(() => this.mode() === 'LIMA' || this.mode() === 'PROVINCE');
  private readonly zoneDistricts = computed(() => {
    const mode = this.mode();
    return this.ubigeos().filter((d) => shippingZone(d.code) === mode);
  });
  readonly departments = computed(() => [...new Set(this.zoneDistricts().map((d) => d.department))].sort());
  readonly provinces = computed(() =>
    [...new Set(this.zoneDistricts().filter((d) => d.department === this.department()).map((d) => d.province))].sort(),
  );
  readonly districts = computed(() =>
    this.zoneDistricts().filter((d) => d.department === this.department() && d.province === this.province()),
  );

  readonly options = computed(() => this.store()?.shipping.options ?? []);
  readonly selectedOption = computed(() => this.options().find((o) => o.mode === this.mode()) ?? null);
  readonly discountCents = computed(() => this.coupon()?.discountCents ?? 0);
  readonly shippingCents = computed(() => {
    const option = this.selectedOption();
    if (!option || option.mode === 'PICKUP') return 0;
    const threshold = this.store()?.shipping.freeShippingFromCents ?? null;
    const base = this.cart.subtotalCents() - this.discountCents();
    if (this.coupon()?.freeShipping || (threshold !== null && base >= threshold)) return 0;
    return option.cents;
  });
  readonly totalCents = computed(
    () => this.cart.subtotalCents() - this.discountCents() + this.shippingCents(),
  );
  readonly missingForFree = computed(() => {
    const threshold = this.store()?.shipping.freeShippingFromCents ?? null;
    const option = this.selectedOption();
    if (threshold === null || !option || option.mode === 'PICKUP' || this.coupon()?.freeShipping) return 0;
    return Math.max(threshold - (this.cart.subtotalCents() - this.discountCents()), 0);
  });

  constructor() {
    inject(SeoService).set({ title: 'Finalizar compra', path: '/checkout', noindex: true });
    this.form.controls.mode.valueChanges.subscribe((mode) => {
      this.mode.set(mode || null);
      this.syncAddressValidators(mode || null);
      this.selectDepartment('');
      if (mode === 'LIMA' || mode === 'PROVINCE') void this.loadUbigeos();
    });
    this.form.controls.department.valueChanges.subscribe((value) => this.selectDepartment(value, false));
    this.form.controls.province.valueChanges.subscribe((value) => this.selectProvince(value, false));
    effect(() => {
      if (this.cart.ready() && !this.cart.lines().length && !this.submitting()) {
        void this.router.navigate(['/carrito']);
      }
    });
    effect(() => {
      const options = this.options();
      if (options.length === 1 && !this.form.controls.mode.value) {
        this.form.controls.mode.setValue(options[0].mode);
      }
    });
  }

  async loadUbigeos(): Promise<void> {
    if (this.ubigeoState() === 'loading' || this.ubigeoState() === 'ready') return;
    this.ubigeoState.set('loading');
    try {
      this.ubigeos.set(await this.api.ubigeos());
      this.ubigeoState.set('ready');
      this.selectDepartment('');
    } catch {
      this.ubigeoState.set('error');
    }
  }

  /** Resets the dependent selects and preselects the only option when there is one. */
  private selectDepartment(value: string, write = true): void {
    const departments = this.departments();
    const department = value || (departments.length === 1 ? departments[0] : '');
    this.department.set(department);
    if (write) this.form.controls.department.setValue(department, { emitEvent: false });
    this.selectProvince('');
  }

  private selectProvince(value: string, write = true): void {
    const provinces = this.provinces();
    const province = value || (provinces.length === 1 ? provinces[0] : '');
    this.province.set(province);
    if (write || province !== value) this.form.controls.province.setValue(province, { emitEvent: false });
    this.form.controls.ubigeo.setValue('', { emitEvent: false });
  }

  async applyCoupon(): Promise<void> {
    const code = this.form.controls.couponCode.value.trim();
    if (!code) return;
    this.applyingCoupon.set(true);
    this.couponError.set(null);
    try {
      this.coupon.set(
        await this.api.previewCoupon({
          items: this.items(),
          code,
          ...(this.form.controls.email.valid ? { email: this.form.controls.email.value.trim() } : {}),
        }),
      );
    } catch (error) {
      this.coupon.set(null);
      this.couponError.set(this.messageFrom(error, 'No pudimos validar el cupón.'));
    } finally {
      this.applyingCoupon.set(false);
    }
  }

  removeCoupon(): void {
    this.coupon.set(null);
    this.couponError.set(null);
    this.form.controls.couponCode.setValue('');
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      return;
    }
    const v = this.form.getRawValue();
    const mode = v.mode as ShippingMode;
    this.submitting.set(true);
    this.errorMessage.set(null);
    try {
      const order = await this.api.checkout({
        checkoutKey: this.checkoutKey(),
        items: this.items(),
        customer: {
          name: v.name.trim(),
          email: v.email.trim(),
          phone: v.phone,
          ...(v.document ? { document: v.document } : {}),
        },
        delivery: {
          mode,
          ...(mode !== 'PICKUP'
            ? {
                ubigeo: v.ubigeo,
                address: v.address.trim(),
              }
            : {}),
          ...(v.reference.trim() ? { reference: v.reference.trim() } : {}),
        },
        ...(this.coupon() ? { couponCode: this.coupon()!.code } : {}),
        acceptTerms: true,
      });
      sessionStorage.removeItem(CHECKOUT_KEY);
      await this.router.navigate(['/pedido', order.id], { queryParams: { t: order.token } });
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No pudimos registrar tu pedido. Inténtalo de nuevo.'));
      if (error instanceof HttpErrorResponse && error.status === 409) {
        sessionStorage.removeItem(CHECKOUT_KEY);
      }
      this.submitting.set(false);
    }
  }

  private items() {
    return this.cart.lines().map((line) => ({
      handle: line.handle,
      ...(line.variantId ? { variantId: line.variantId } : {}),
      quantity: line.quantity,
    }));
  }

  /** Same key while the buyer retries, so a double click never creates two orders. */
  private checkoutKey(): string {
    let key = sessionStorage.getItem(CHECKOUT_KEY);
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(CHECKOUT_KEY, key);
    }
    return key;
  }

  private syncAddressValidators(mode: ShippingMode | null): void {
    const { address, department, province, ubigeo } = this.form.controls;
    const delivery = mode === 'LIMA' || mode === 'PROVINCE';
    address.setValidators(delivery ? [Validators.required, Validators.minLength(5), Validators.maxLength(200)] : []);
    for (const control of [department, province, ubigeo]) {
      control.setValidators(delivery ? [Validators.required] : []);
    }
    for (const control of [address, department, province, ubigeo]) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 429].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

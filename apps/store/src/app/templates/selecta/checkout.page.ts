import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  CouponPreviewResult,
  ShippingMode,
  ShippingQuote,
  UbigeoDistrict,
} from '@vendedoria/contracts';
import { campaignCoupon, forgetCampaignCoupon } from '../../core/campaign-coupon';
import { CartService } from '../../core/cart.service';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { isCarrier, shippingZone } from '../../core/shipping';
import { StoreApiService } from '../../core/store-api.service';
import { StoreStateService } from '../../core/store-state.service';
import { MAX_UNITS, Product, SelectaCatalog, complements, maxUnits } from './selecta-catalog';
import { SelectaIcon } from './selecta-icon';
import { SelectaProductImage } from './selecta-photo';

const CHECKOUT_KEY = 'vendedoria-checkout-key';

type Line = {
  handle: string;
  variantId: string | null;
  name: string;
  variantLabel: string | null;
  unitCents: number;
  quantity: number;
  product: Product | undefined;
};

type DeliveryChoice = { mode: ShippingMode; label: string; cents: number; note: string };

@Component({
  selector: 'selecta-checkout',
  imports: [ReactiveFormsModule, RouterLink, MoneyPipe, SelectaIcon, SelectaProductImage],
  templateUrl: './checkout.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaCheckoutPage {
  private readonly api = inject(StoreApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);
  readonly store = inject(StoreStateService).store;

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    phone: ['', [Validators.required, Validators.pattern(/^9\d{8}$/)]],
    department: ['', Validators.required],
    province: ['', Validators.required],
    ubigeo: ['', Validators.required],
    address: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(200)]],
    reference: ['', Validators.maxLength(180)],
    consent: [false, Validators.requiredTrue],
    shippingAcknowledged: [false],
  });

  readonly busy = signal(false);
  readonly error = signal('');
  readonly online = computed(() => this.store()?.checkout.mode === 'online');

  /** `?producto=&cantidad=` buys one product directly, without touching the bag. */
  private readonly direct = (() => {
    const params = this.route.snapshot.queryParamMap;
    const handle = params.get('producto');
    if (!handle) return null;
    const quantity = Number(params.get('cantidad') ?? 1);
    return {
      handle,
      variantId: params.get('variante'),
      quantity: Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_UNITS ? quantity : 1,
    };
  })();

  private readonly base = computed<Line[]>(() => {
    if (this.direct) {
      const product = this.catalog.find(this.direct.handle);
      if (!product?.isAvailable) return [];
      const variant = product.variants.find((v) => v.id === this.direct!.variantId) ?? null;
      if (product.hasVariants && !variant?.isAvailable) return [];
      return [
        {
          handle: product.handle,
          variantId: variant?.id ?? null,
          name: product.name,
          variantLabel: variant?.label ?? null,
          unitCents: variant?.priceCents ?? product.priceCents,
          quantity: Math.min(this.direct.quantity, maxUnits(product)),
          product,
        },
      ];
    }
    return this.cart.lines().map((line) => ({
      handle: line.handle,
      variantId: line.variantId,
      name: line.name,
      variantLabel: line.variantLabel,
      unitCents: line.unitCents,
      quantity: line.quantity,
      product: this.catalog.find(line.handle),
    }));
  });
  readonly bump = signal<string | null>(null);
  readonly bumpOffer = computed(
    () => complements(this.base().map((l) => ({ handle: l.handle, quantity: l.quantity })), this.catalog.products(), 1)[0],
  );
  readonly lines = computed<Line[]>(() => {
    const offer = this.bumpOffer();
    if (!offer || this.bump() !== offer.handle) return this.base();
    return [
      ...this.base(),
      {
        handle: offer.handle,
        variantId: null,
        name: offer.name,
        variantLabel: null,
        unitCents: offer.priceCents,
        quantity: 1,
        product: offer,
      },
    ];
  });
  readonly ready = computed(() => (this.direct ? this.catalog.loaded() : this.cart.ready()));
  readonly subtotal = computed(() => this.lines().reduce((n, l) => n + l.unitCents * l.quantity, 0));

  readonly couponsEnabled = computed(() => Boolean(this.store()?.checkout.couponsEnabled));
  readonly coupon = signal<CouponPreviewResult | null>(null);
  readonly couponInput = signal('');
  readonly couponError = signal('');
  readonly couponBusy = signal(false);
  readonly couponOpen = signal(false);
  private couponSeq = 0;
  readonly discount = computed(() => this.coupon()?.discountCents ?? 0);

  readonly options = computed(() => this.store()?.shipping.options ?? []);
  readonly homeOptions = computed(() => this.options().filter((o) => o.mode !== 'PICKUP'));
  readonly pickupOption = computed(() => this.options().find((o) => o.mode === 'PICKUP') ?? null);
  readonly pickup = signal(false);
  readonly ubigeos = signal<UbigeoDistrict[]>([]);
  readonly ubigeoState = signal<'loading' | 'ready' | 'error'>('loading');
  readonly department = signal('');
  readonly province = signal('');
  readonly ubigeo = signal('');
  readonly quotes = signal<ShippingQuote[] | null>(null);
  readonly quoteState = signal<'idle' | 'loading' | 'error'>('idle');
  readonly mode = signal<ShippingMode | null>(null);

  /** Couriers reach every district; flat zone rates only their own zone. */
  private readonly eligible = computed(() => {
    const modes = this.homeOptions().map((o) => o.mode);
    if (modes.some((m) => isCarrier(m))) return this.ubigeos();
    return this.ubigeos().filter((d) => modes.includes(shippingZone(d.code)));
  });
  readonly departments = computed(() => [...new Set(this.eligible().map((d) => d.department))].sort());
  readonly provinces = computed(() =>
    [...new Set(this.eligible().filter((d) => d.department === this.department()).map((d) => d.province))].sort(),
  );
  readonly districtsHere = computed(() =>
    this.eligible().filter((d) => d.department === this.department() && d.province === this.province()),
  );

  /** Delivery options for the chosen district, with their price there. */
  readonly choices = computed<DeliveryChoice[]>(() => {
    const code = this.ubigeo();
    if (!code) return [];
    return this.homeOptions().flatMap((o): DeliveryChoice[] => {
      if (isCarrier(o.mode)) {
        const quote = this.quotes()?.find((q) => q.mode === o.mode);
        return quote ? [{ mode: o.mode, label: o.label, cents: quote.cents, note: 'A domicilio · cobertura por confirmar' }] : [];
      }
      return shippingZone(code) === o.mode
        ? [{ mode: o.mode, label: o.label, cents: o.cents, note: o.eta ?? 'A domicilio' }]
        : [];
    });
  });
  readonly choice = computed<DeliveryChoice | null>(() => {
    const pickup = this.pickupOption();
    if (this.pickup()) return pickup ? { mode: 'PICKUP', label: pickup.label, cents: 0, note: pickup.eta ?? '' } : null;
    return this.choices().find((c) => c.mode === this.mode()) ?? null;
  });
  readonly carrierChosen = computed(() => !this.pickup() && isCarrier(this.choice()?.mode ?? null));
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly freeShip = computed(() => this.freeFrom() > 0 && this.subtotal() - this.discount() >= this.freeFrom());
  readonly couponShip = computed(() => Boolean(this.coupon()?.freeShipping) && !this.pickup());
  readonly missing = computed(() => this.freeFrom() - this.subtotal() + this.discount());
  readonly shippingCents = computed(() => {
    const choice = this.choice();
    if (!choice || this.pickup() || this.freeShip() || this.couponShip()) return 0;
    return choice.cents;
  });
  readonly total = computed(() => this.subtotal() - this.discount() + this.shippingCents());

  constructor() {
    inject(SeoService).set({ title: 'Finaliza tu compra', path: '/checkout', noindex: true });
    effect(() => {
      if (!this.homeOptions().length && this.pickupOption()) untracked(() => this.setPickup(true));
    });
    effect(() => {
      const choices = this.choices();
      if (choices.length && !choices.some((c) => c.mode === untracked(this.mode))) this.mode.set(choices[0].mode);
    });
    effect(() => {
      if (!this.lines().length) return;
      const code = untracked(this.coupon)?.code ?? this.pendingCoupon;
      this.pendingCoupon = null;
      if (code) untracked(() => void this.applyCoupon(code, true));
    });
    afterNextRender(() => {
      void this.catalog.refresh();
      const saved = campaignCoupon();
      if (saved && this.couponsEnabled()) {
        this.couponOpen.set(true);
        if (this.lines().length) void this.applyCoupon(saved, true);
        else this.pendingCoupon = saved;
      }
      void this.loadUbigeos();
    });
  }

  /** Campaign code waiting for the bag to load. */
  private pendingCoupon: string | null = null;

  async loadUbigeos(): Promise<void> {
    this.ubigeoState.set('loading');
    try {
      this.ubigeos.set(await this.api.ubigeos());
      this.ubigeoState.set('ready');
    } catch {
      this.ubigeoState.set('error');
    }
  }

  invalid(name: keyof typeof this.form.controls): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  setPickup(value: boolean): void {
    this.pickup.set(value);
    for (const name of ['department', 'province', 'ubigeo', 'address', 'reference', 'shippingAcknowledged'] as const) {
      const control = this.form.controls[name];
      if (value) control.disable();
      else control.enable();
    }
  }

  departmentChanged(): void {
    this.department.set(this.form.controls.department.value);
    this.province.set('');
    this.form.patchValue({ province: '', ubigeo: '' });
    this.ubigeo.set('');
    this.quotes.set(null);
  }

  provinceChanged(): void {
    this.province.set(this.form.controls.province.value);
    this.form.controls.ubigeo.setValue('');
    this.ubigeo.set('');
    this.quotes.set(null);
  }

  async districtChanged(): Promise<void> {
    const code = this.form.controls.ubigeo.value;
    this.ubigeo.set(code);
    this.quotes.set(null);
    if (!code || !this.homeOptions().some((o) => o.byDistance)) return;
    this.quoteState.set('loading');
    try {
      const quotes = await this.api.shippingQuote(code);
      if (this.form.controls.ubigeo.value === code) this.quotes.set(quotes);
      this.quoteState.set('idle');
    } catch {
      this.quoteState.set('error');
    }
  }

  openCoupon(): void {
    this.couponOpen.set(true);
    setTimeout(() => document.getElementById('coupon-code')?.focus());
  }

  async applyCoupon(raw = this.couponInput(), silent = false): Promise<void> {
    const code = raw.trim().toUpperCase();
    if (!code || !this.lines().length) return;
    const seq = ++this.couponSeq;
    this.couponBusy.set(true);
    if (!silent) this.couponError.set('');
    const email = this.form.controls.email.valid ? this.form.controls.email.value.trim() : undefined;
    try {
      const coupon = await this.api.previewCoupon({ items: this.items(), code, ...(email ? { email } : {}) });
      if (seq !== this.couponSeq) return;
      this.coupon.set(coupon);
      this.couponInput.set('');
      this.couponError.set('');
    } catch (error) {
      if (seq !== this.couponSeq) return;
      this.coupon.set(null);
      this.couponOpen.set(true);
      this.couponInput.set(code);
      this.couponError.set(this.messageFrom(error, 'No pudimos validar el cupón.'));
      forgetCampaignCoupon();
    } finally {
      if (seq === this.couponSeq) this.couponBusy.set(false);
    }
  }

  removeCoupon(): void {
    this.couponSeq++;
    this.coupon.set(null);
    this.couponError.set('');
    this.couponBusy.set(false);
    forgetCampaignCoupon();
  }

  async prepare(): Promise<void> {
    this.error.set('');
    this.form.markAllAsTouched();
    const choice = this.choice();
    if (this.form.invalid || !choice) {
      this.error.set('Completa los campos marcados y acepta los términos.');
      return;
    }
    if (this.carrierChosen() && !this.form.controls.shippingAcknowledged.value) {
      this.error.set('Acepta la tarifa referencial de la agencia para continuar.');
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      const order = await this.api.checkout({
        checkoutKey: this.checkoutKey(),
        items: this.items(),
        customer: { name: v.name.trim(), email: v.email.trim(), phone: v.phone },
        delivery: {
          mode: choice.mode,
          ...(this.pickup()
            ? {}
            : {
                ubigeo: v.ubigeo,
                address: v.address.trim(),
                ...(v.reference.trim() ? { reference: v.reference.trim() } : {}),
                ...(isCarrier(choice.mode) ? { acknowledgeRate: true } : {}),
              }),
        },
        ...(this.coupon() ? { couponCode: this.coupon()!.code } : {}),
        acceptTerms: true,
      });
      sessionStorage.removeItem(CHECKOUT_KEY);
      if (this.coupon()) forgetCampaignCoupon();
      await this.router.navigate(['/pedido', order.id], { queryParams: { t: order.token } });
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No pudimos reservar tu pedido. Inténtalo de nuevo.'));
      if (error instanceof HttpErrorResponse && error.status === 409) sessionStorage.removeItem(CHECKOUT_KEY);
      this.busy.set(false);
    }
  }

  private items() {
    return this.lines().map((l) => ({
      handle: l.handle,
      ...(l.variantId ? { variantId: l.variantId } : {}),
      quantity: l.quantity,
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

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 429].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

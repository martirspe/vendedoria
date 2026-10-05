import { ConversionSession } from '../../core/conversion-session.service';
import { RecommendationsComponent } from '../../components/recommendations.component';
import { CartRecoveryComponent } from '../../components/cart-recovery.component';
import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type {
  CouponPreviewResult,
  PublicOrder,
  ShippingMode,
  ShippingQuote,
  UbigeoDistrict,
} from '@vendedoria/contracts';
import { DsTurnstileComponent } from '@vendedoria/ui';
import { AnalyticsService } from '../../core/analytics.service';
import { CheckoutPaymentComponent } from '../../components/checkout-payment.component';
import { campaignCoupon, forgetCampaignCoupon, keepCoupon } from '../../core/campaign-coupon';
import { CartService } from '../../core/cart.service';
import { checkoutStorageKey } from '../../core/checkout-context';
import { MoneyPipe } from '../../core/money.pipe';
import { SeoService } from '../../core/seo.service';
import { isCarrier } from '../../core/shipping';
import { StoreApiService } from '../../core/store-api.service';
import { StoreStateService } from '../../core/store-state.service';
import { TemplateDemo } from '../../core/template-demo';
import { MAX_UNITS, Product, SelectaCatalog, maxUnits } from './selecta-catalog';
import { SelectaIcon } from './selecta-icon';
import { SelectaProductImage } from './selecta-photo';

const CHALLENGE_PENDING = 'Completa la verificación de seguridad para continuar.';

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
  imports: [RecommendationsComponent, CartRecoveryComponent, DsSelectComponent, ReactiveFormsModule, RouterLink, MoneyPipe, SelectaIcon, SelectaProductImage, DsTurnstileComponent, CheckoutPaymentComponent],
  templateUrl: './checkout.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaCheckoutPage {
  readonly demo = inject(TemplateDemo);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly conversion = inject(ConversionSession);
  readonly recommendationHandles = computed(() => this.items().map((item) => item.handle));
  private readonly api = inject(StoreApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly catalog = inject(SelectaCatalog);
  readonly cart = inject(CartService);
  readonly store = inject(StoreStateService).store;
  private readonly turnstile = viewChild(DsTurnstileComponent);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(160)]],
    phone: ['', [Validators.required, Validators.pattern(/^9\d{8}$/)]],
    department: ['', Validators.required],
    province: ['', Validators.required],
    ubigeo: ['', Validators.required],
    address: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(200)]],
    reference: ['', Validators.maxLength(180)],
    serviceNote: ['', Validators.maxLength(300)],
    consent: [false, Validators.requiredTrue],
  });

  readonly busy = signal(false);
  readonly reservedOrder = signal<PublicOrder | null>(null);
  readonly reserveOrder = () => this.prepare();
  readonly displayedTotal = computed(() => this.reservedOrder()?.totalCents ?? this.total());
  readonly displayedSubtotal = computed(() => this.reservedOrder()?.subtotalCents ?? this.subtotal());
  readonly displayedDiscount = computed(() => this.reservedOrder()?.discountCents ?? this.discount());
  readonly displayedShipping = computed(() => this.reservedOrder()?.shippingCents ?? this.shippingCents());
  readonly reservationStorageKey = signal<string | null>(null);
  releaseReservation(): void {
    const key = this.reservationStorageKey();
    if (key) sessionStorage.removeItem(key);
    this.reservedOrder.set(null);
  }
  readonly error = signal('');
  readonly online = computed(() => this.store()?.checkout.mode === 'online');

  /** `?producto=&cantidad=` buys one product directly, without touching the bag. */
  readonly direct = (() => {
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
          quantity: Math.min(this.direct.quantity, variant?.stockLeft ?? maxUnits(product), MAX_UNITS),
          product,
        },
      ];
    }
    return this.cart.lines().map((line) => {
      const product = this.catalog.find(line.handle);
      const variant = line.variantId ? product?.variants.find((v) => v.id === line.variantId) : undefined;
      return {
        handle: line.handle,
        variantId: line.variantId,
        name: line.name,
        variantLabel: line.variantLabel,
        unitCents: variant?.priceCents ?? product?.priceCents ?? line.unitCents,
        quantity: line.quantity,
        product,
      };
    });
  });
  readonly bump = signal<string | null>(null);
  readonly bumpOffer = signal<Product | undefined>(undefined);
  async selectRecommendation(product: { handle: string }): Promise<void> {
    if (this.busy() || this.reservedOrder()) return;
    try {
      await this.catalog.ensure([product.handle], true);
      const offer = this.catalog.find(product.handle);
      if (!offer || offer.hasVariants || !offer.isAvailable || this.reservedOrder() || this.busy()) return;
      this.bumpOffer.set(offer); this.bump.set(offer.handle);
    } catch { this.error.set('No pudimos agregar el complemento. Inténtalo de nuevo.'); }
  }
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
  /** A line whose product is still loading counts as shipped until the catalog says otherwise. */
  readonly needsDelivery = computed(() =>
    this.lines().some((l) => l.product?.kind !== 'SERVICE' && l.product?.kind !== 'DIGITAL'),
  );
  readonly hasServices = computed(() => this.lines().some((l) => l.product?.kind === 'SERVICE'));
  readonly hasDigital = computed(() => this.lines().some((l) => l.product?.kind === 'DIGITAL'));
  readonly canSubmit = computed(() => !this.needsDelivery() || Boolean(this.choice()));
  readonly subtotal = computed(() => this.lines().reduce((n, l) => n + l.unitCents * l.quantity, 0));

  readonly couponsEnabled = computed(() => Boolean(this.store()?.checkout.couponsEnabled));
  readonly coupon = signal<CouponPreviewResult | null>(null);
  readonly couponInput = signal('');
  readonly couponError = signal('');
  readonly couponBusy = signal(false);
  readonly couponOpen = signal(false);
  /** Code that did not apply; retried when the bag or the delivery changes. */
  private readonly failedCoupon = signal<string | null>(null);
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

  /** Couriers reach every district; the rate comes from the district. */
  private readonly eligible = computed(() => (this.homeOptions().length ? this.ubigeos() : []));
  readonly departments = computed(() => [...new Set(this.eligible().map((d) => d.department))].sort());
  readonly provinces = computed(() =>
    [...new Set(this.eligible().filter((d) => d.department === this.department()).map((d) => d.province))].sort(),
  );
  readonly districtsHere = computed(() =>
    this.eligible().filter((d) => d.department === this.department() && d.province === this.province()),
  );

  /** Delivery options for the chosen district, with their price there. */
  readonly choices = computed<DeliveryChoice[]>(() => {
    if (!this.ubigeo()) return [];
    return this.homeOptions().flatMap((o): DeliveryChoice[] => {
      const quote = this.quotes()?.find((q) => q.mode === o.mode);
      return quote ? [{ mode: o.mode, label: o.label, cents: quote.cents, note: 'A domicilio · cobertura por confirmar' }] : [];
    });
  });
  readonly choice = computed<DeliveryChoice | null>(() => {
    const pickup = this.pickupOption();
    if (this.pickup()) return pickup ? { mode: 'PICKUP', label: pickup.label, cents: 0, note: pickup.eta ?? '' } : null;
    return this.choices().find((c) => c.mode === this.mode()) ?? null;
  });
  readonly deliveryMode = computed<ShippingMode | undefined>(() =>
    this.pickup() ? 'PICKUP' : this.choice()?.mode,
  );
  readonly carrierChosen = computed(() => !this.pickup() && isCarrier(this.choice()?.mode ?? null));
  readonly freeFrom = computed(() => this.store()?.shipping.freeShippingFromCents ?? 0);
  readonly freeShip = computed(() => this.freeFrom() > 0 && this.subtotal() - this.discount() >= this.freeFrom());
  readonly couponShip = computed(() => Boolean(this.coupon()?.freeShipping) && !this.pickup());
  readonly missing = computed(() => this.freeFrom() - this.subtotal() + this.discount());
  readonly shippingCents = computed(() => {
    const choice = this.choice();
    if (!this.needsDelivery() || !choice || this.pickup() || this.freeShip() || this.couponShip()) return 0;
    return choice.cents;
  });
  readonly total = computed(() => this.subtotal() - this.discount() + this.shippingCents());

  constructor() {
    inject(SeoService).set({ title: 'Finaliza tu compra', path: '/checkout', noindex: true });
    const analytics = inject(AnalyticsService);
    let checkoutTracked = false;
    effect(() => {
      if (checkoutTracked || !this.ready() || !this.lines().length) return;
      checkoutTracked = true;
      untracked(() => analytics.beginCheckoutFromCart(this.lines().map((line) => ({ ...line, key: `${line.handle}::${line.variantId ?? ''}`, currency: line.product?.currency ?? 'PEN', imageUrl: line.product?.imageUrl ?? null })), this.store()?.currency ?? 'PEN'));
    });
    effect(() => {
      if (!this.homeOptions().length && this.pickupOption()) untracked(() => this.setPickup(true));
    });
    effect(() => {
      const skip = !this.needsDelivery();
      untracked(() => this.toggleAddress(skip || this.pickup()));
    });
    effect(() => {
      const choices = this.choices();
      if (choices.length && !choices.some((c) => c.mode === untracked(this.mode))) this.mode.set(choices[0].mode);
    });
    // A different district or delivery rate requires accepting the updated terms again.
    effect(() => {
      this.deliveryMode(); this.ubigeo(); this.choice()?.cents;
      untracked(() => { if (!this.reservedOrder()) this.form.controls.consent.setValue(false); });
    });
    /** Lines or delivery changed: re-check the applied code, or retry one that did not apply. */
    effect(() => {
      this.deliveryMode();
      if (!this.lines().length) return;
      const code = untracked(this.coupon)?.code ?? this.pendingCoupon ?? untracked(this.failedCoupon);
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
    effect(() => {
      const handles = this.cart.lines().map((line) => line.handle);
      void this.catalog.ensure(handles).catch(() => undefined);
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
    this.toggleAddress(value || !this.needsDelivery());
  }

  /** Address fields only validate when something travels to the buyer's home. */
  private toggleAddress(off: boolean): void {
    for (const name of ['department', 'province', 'ubigeo', 'address', 'reference'] as const) {
      const control = this.form.controls[name];
      if (off) control.disable();
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
    if (!code || !this.homeOptions().length) return;
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
    const mode = this.deliveryMode();
    try {
      const coupon = await this.api.previewCoupon({
        items: this.items(),
        code,
        ...(email ? { email } : {}),
        ...(mode ? { mode } : {}),
      });
      if (seq !== this.couponSeq) return;
      this.coupon.set(coupon);
      this.failedCoupon.set(null);
      this.couponInput.set('');
      this.couponError.set('');
      keepCoupon(coupon.code);
    } catch (error) {
      if (seq !== this.couponSeq) return;
      this.coupon.set(null);
      this.failedCoupon.set(code);
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
    this.failedCoupon.set(null);
    this.couponError.set('');
    this.couponBusy.set(false);
    forgetCampaignCoupon();
  }

  async prepare(): Promise<PublicOrder | null> {
    if (this.reservedOrder()) return this.reservedOrder();
    if (this.busy()) return null;
    this.error.set('');
    this.form.markAllAsTouched();
    const choice = this.choice();
    const needsDelivery = this.needsDelivery();
    if (this.form.invalid || this.couponBusy() || (needsDelivery && !choice)) {
      this.error.set(this.couponBusy() ? 'Espera a que terminemos de validar tu cupón.' : 'Completa los campos marcados y acepta los términos.');
      const field = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
      if (field) this.host.nativeElement.querySelector<HTMLElement>(`[formControlName="${field}"]`)?.focus();
      return null;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    const widget = this.turnstile();
    const token = widget ? await widget.waitForToken() : undefined;
    if (token === null) {
      this.error.set(CHALLENGE_PENDING);
      this.busy.set(false);
      return null;
    }
    try {
      const purchased = this.cart.lines().map((line) => ({ ...line }));
      this.reservationStorageKey.set(this.checkoutStorageKey());
      const order = await this.api.checkout({
        checkoutKey: this.checkoutKey(),
        recoveryToken: this.conversion.checkoutToken(),
        items: this.items(),
        customer: { name: v.name.trim(), email: v.email.trim(), phone: v.phone },
        ...(needsDelivery && choice
          ? {
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
            }
          : {}),
        ...(this.hasServices() && v.serviceNote.trim() ? { serviceNote: v.serviceNote.trim() } : {}),
        ...(this.coupon() ? { couponCode: this.coupon()!.code } : {}),
        acceptTerms: true,
      }, token);
      if (this.coupon()) forgetCampaignCoupon();
      this.conversion.remember(undefined);
      if (!this.direct) this.cart.rememberOrder(order.id, purchased);
      this.reservedOrder.set(order);
      return order;
    } catch (error) {
      this.error.set(this.messageFrom(error, 'No pudimos reservar tu pedido. Inténtalo de nuevo.'));
      if (error instanceof HttpErrorResponse && error.status === 409) sessionStorage.removeItem(this.checkoutStorageKey());
      widget?.reset();
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  items() {
    return this.lines().map((l) => ({
      handle: l.handle,
      ...(l.variantId ? { variantId: l.variantId } : {}),
      quantity: l.quantity,
    }));
  }

  /** Same key while the buyer retries, so a double click never creates two orders. */
  private checkoutKey(): string {
    const storageKey = this.checkoutStorageKey();
    let key = sessionStorage.getItem(storageKey);
    if (!key) {
      key = crypto.randomUUID();
      sessionStorage.setItem(storageKey, key);
    }
    return key;
  }

  private checkoutStorageKey(): string {
    return checkoutStorageKey(this.store()?.slug ?? '', this.direct ? 'direct' : 'cart', this.items());
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 404, 409, 429, 503].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  Coupon,
  CouponKind,
  CouponPayload,
  CouponScope,
  CouponTargets,
  CouponsApiService,
} from '../../core/api/coupons-api.service';
import { StoreApiService } from '../../core/api/store-api.service';

type TargetOption = { value: string; label: string };

const KIND_LABELS: Record<CouponKind, string> = {
  PERCENT: 'Porcentaje',
  FIXED: 'Monto fijo',
  FREE_SHIPPING: 'Envío gratis',
  BUY_X_GET_Y: 'Compra X, lleva Y',
};

const toCents = (soles: number | null) =>
  soles === null || Number.isNaN(soles) ? null : Math.round(soles * 100);
const toSoles = (cents: number | null) => (cents === null ? null : cents / 100);
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

@Component({
  selector: 'app-coupons-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './coupons.page.html',
  styleUrls: ['../store/store.page.scss', '../payments/payments.page.scss', './coupons.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouponsPage {
  private readonly api = inject(CouponsApiService);
  private readonly store = inject(StoreApiService);
  private readonly fb = inject(FormBuilder);

  readonly kindLabels = KIND_LABELS;
  readonly kinds = Object.keys(KIND_LABELS) as CouponKind[];

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly coupons = signal<Coupon[]>([]);
  readonly targetsCatalog = signal<CouponTargets>({ categories: [], brands: [], lines: [], products: [] });
  readonly storeUrl = signal<string | null>(null);
  readonly copiedCode = signal<string | null>(null);
  /** `null` = editor closed, `'new'` = creating, otherwise the coupon being edited. */
  readonly editing = signal<Coupon | 'new' | null>(null);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,30}$/)]],
    label: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(80)]],
    note: [''],
    kind: ['PERCENT' as CouponKind],
    value: [10 as number | null],
    maxDiscount: [null as number | null],
    buyQuantity: [2 as number | null],
    getQuantity: [1 as number | null],
    maxApplications: [null as number | null],
    minSubtotal: [null as number | null],
    minItems: [null as number | null],
    scope: ['ALL' as CouponScope],
    targets: [[] as string[]],
    startsAt: [''],
    endsAt: [''],
    usageLimit: [null as number | null],
    perCustomerLimit: [null as number | null],
    firstOrderOnly: [false],
    isActive: [true],
    applyToSets: [true],
  });

  readonly kind = signal<CouponKind>('PERCENT');
  readonly scope = signal<CouponScope>('ALL');
  readonly selectedTargets = signal<string[]>([]);

  readonly targetOptions = computed<TargetOption[]>(() => {
    const catalog = this.targetsCatalog();
    switch (this.scope()) {
      case 'CATEGORY':
        return catalog.categories.map((c) => ({ value: c, label: c }));
      case 'BRAND':
        return catalog.brands.map((b) => ({ value: b, label: b }));
      case 'LINE':
        return catalog.lines.map((l) => ({ value: l, label: l }));
      case 'PRODUCTS':
        return catalog.products.map((p) => ({ value: p.handle, label: p.name }));
      default:
        return [];
    }
  });

  constructor() {
    this.form.controls.kind.valueChanges.subscribe((kind) => {
      if (kind === this.kind()) return;
      this.kind.set(kind);
      const defaults: Record<CouponKind, number | null> = {
        PERCENT: 10,
        FIXED: null,
        FREE_SHIPPING: null,
        BUY_X_GET_Y: 100,
      };
      this.form.controls.value.setValue(defaults[kind]);
      this.form.controls.maxDiscount.setValue(null);
    });
    this.form.controls.scope.valueChanges.subscribe((scope) => {
      this.scope.set(scope);
      this.setTargets([]);
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [coupons, targets] = await Promise.all([this.api.list(), this.api.targets()]);
      this.coupons.set(coupons);
      this.targetsCatalog.set(targets);
      this.store
        .get()
        .then((view) => this.storeUrl.set(view.url))
        .catch(() => this.storeUrl.set(null));
    } catch {
      this.errorMessage.set('No pudimos cargar tus cupones.');
    } finally {
      this.loading.set(false);
    }
  }

  startCreate(): void {
    this.clearMessages();
    this.kind.set('PERCENT');
    this.form.reset();
    this.scope.set('ALL');
    this.setTargets([]);
    this.editing.set('new');
  }

  startEdit(coupon: Coupon): void {
    this.clearMessages();
    const percentLike = coupon.kind === 'PERCENT' || coupon.kind === 'BUY_X_GET_Y';
    this.kind.set(coupon.kind);
    this.form.reset({
      code: coupon.code,
      label: coupon.label,
      note: coupon.note ?? '',
      kind: coupon.kind,
      value: coupon.kind === 'FREE_SHIPPING' ? null : percentLike ? coupon.value : toSoles(coupon.value),
      maxDiscount: toSoles(coupon.maxDiscountCents),
      buyQuantity: coupon.buyQuantity ?? 2,
      getQuantity: coupon.getQuantity ?? 1,
      maxApplications: coupon.maxApplications,
      minSubtotal: coupon.minSubtotalCents ? toSoles(coupon.minSubtotalCents) : null,
      minItems: coupon.minItems || null,
      scope: coupon.scope,
      targets: coupon.targets,
      startsAt: toLocalInput(coupon.startsAt),
      endsAt: toLocalInput(coupon.endsAt),
      usageLimit: coupon.usageLimit,
      perCustomerLimit: coupon.perCustomerLimit,
      firstOrderOnly: coupon.firstOrderOnly,
      isActive: coupon.isActive,
      applyToSets: coupon.applyToSets,
    });
    this.scope.set(coupon.scope);
    this.setTargets(coupon.targets);
    this.editing.set(coupon);
  }

  cancel(): void {
    this.editing.set(null);
  }

  toggleTarget(value: string, checked: boolean): void {
    const current = this.selectedTargets();
    this.setTargets(checked ? [...current, value] : current.filter((t) => t !== value));
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      return;
    }
    const payload = this.toPayload();
    const editing = this.editing();
    this.saving.set(true);
    this.clearMessages();
    try {
      if (editing === 'new') {
        await this.api.create(payload);
        this.successMessage.set(`Cupón ${payload.code} creado.`);
      } else if (editing) {
        await this.api.update(editing.id, payload);
        this.successMessage.set(`Cupón ${payload.code} actualizado.`);
      }
      this.editing.set(null);
      this.coupons.set(await this.api.list());
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo guardar el cupón.'));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(coupon: Coupon): Promise<void> {
    this.clearMessages();
    try {
      await this.api.update(coupon.id, { isActive: !coupon.isActive });
      this.coupons.set(await this.api.list());
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo cambiar el estado.'));
    }
  }

  async remove(coupon: Coupon): Promise<void> {
    if (!confirm(`¿Eliminar el cupón ${coupon.code}?`)) return;
    this.clearMessages();
    try {
      await this.api.remove(coupon.id);
      this.coupons.set(this.coupons().filter((c) => c.id !== coupon.id));
      this.successMessage.set('Cupón eliminado.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo eliminar el cupón.'));
    }
  }

  summary(coupon: Coupon): string {
    const money = (cents: number) => `S/ ${(cents / 100).toFixed(2)}`;
    switch (coupon.kind) {
      case 'PERCENT':
        return `${coupon.value} % de descuento${coupon.maxDiscountCents ? ` (tope ${money(coupon.maxDiscountCents)})` : ''}`;
      case 'FIXED':
        return `${money(coupon.value)} de descuento`;
      case 'FREE_SHIPPING':
        return 'Envío gratis';
      default:
        return `Compra ${coupon.buyQuantity}, lleva ${coupon.getQuantity} con ${coupon.value} % de descuento`;
    }
  }

  status(coupon: Coupon): { label: string; ok: boolean } {
    const now = Date.now();
    if (!coupon.isActive) return { label: 'Inactivo', ok: false };
    if (coupon.endsAt && new Date(coupon.endsAt).getTime() <= now) return { label: 'Vencido', ok: false };
    if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return { label: 'Programado', ok: false };
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return { label: 'Agotado', ok: false };
    return { label: 'Activo', ok: true };
  }

  formatSoles(cents: number): string {
    return `S/ ${(cents / 100).toFixed(2)}`;
  }

  private setTargets(targets: string[]): void {
    this.selectedTargets.set(targets);
    this.form.controls.targets.setValue(targets, { emitEvent: false });
  }

  private toPayload(): CouponPayload {
    const v = this.form.getRawValue();
    const bxgy = v.kind === 'BUY_X_GET_Y';
    const percentLike = v.kind === 'PERCENT' || bxgy;
    return {
      code: v.code.trim().toUpperCase(),
      label: v.label.trim(),
      note: v.note.trim() || null,
      kind: v.kind,
      value:
        v.kind === 'FREE_SHIPPING'
          ? 0
          : percentLike
            ? Math.round(v.value ?? 0)
            : (toCents(v.value) ?? 0),
      maxDiscountCents: percentLike ? toCents(v.maxDiscount) : null,
      buyQuantity: bxgy ? v.buyQuantity : null,
      getQuantity: bxgy ? v.getQuantity : null,
      maxApplications: bxgy ? v.maxApplications : null,
      minSubtotalCents: toCents(v.minSubtotal) ?? 0,
      minItems: v.minItems ?? 0,
      scope: v.scope,
      targets: v.scope === 'ALL' ? [] : this.selectedTargets(),
      startsAt: fromLocalInput(v.startsAt),
      endsAt: fromLocalInput(v.endsAt),
      usageLimit: v.usageLimit,
      perCustomerLimit: v.perCustomerLimit,
      firstOrderOnly: v.firstOrderOnly,
      isActive: v.isActive,
      applyToSets: v.applyToSets,
    };
  }

  campaignLink(coupon: Coupon): string | null {
    const url = this.storeUrl();
    return url ? `${url.replace(/\/$/, '')}/?cupon=${encodeURIComponent(coupon.code)}` : null;
  }

  async copyLink(coupon: Coupon): Promise<void> {
    const link = this.campaignLink(coupon);
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      this.copiedCode.set(coupon.code);
      setTimeout(() => this.copiedCode.set(null), 2000);
    } catch {
      this.errorMessage.set('No pudimos copiar el enlace. Cópialo manualmente: ' + link);
    }
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 409].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

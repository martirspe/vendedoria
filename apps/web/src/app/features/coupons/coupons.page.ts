import { DsActionBarComponent } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsSelectComponent } from '@vendedoria/ui';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsCheckboxComponent, DsChoiceCardComponent, DsDisclosureComponent, DsConfirmService, DsFormSectionComponent, DsIconComponent, DsModalDirective, type DsIconName } from '@vendedoria/ui';
import {
  Coupon,
  CouponKind,
  CouponMethod,
  CouponPayload,
  CouponScope,
  CouponTargets,
  CouponsApiService,
} from '../../core/api/coupons-api.service';
import { StoreApiService } from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

type TargetOption = { value: string; label: string };

const KIND_LABELS: Record<CouponKind, string> = {
  PERCENT: 'Porcentaje',
  FIXED: 'Monto fijo',
  FREE_SHIPPING: 'Envío gratis',
  BUY_X_GET_Y: 'Compra X, lleva Y',
};

const METHOD_LABELS: Record<CouponMethod, string> = {
  CODE: 'Código de descuento',
  AUTOMATIC: 'Descuento automático',
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
  imports: [DsActionBarComponent, DsCheckboxComponent, DsChoiceCardComponent, DsDisclosureComponent, DsFormSectionComponent, DsEmptyStateComponent, DsSelectComponent, ReactiveFormsModule, DsButtonComponent, DsIconComponent, DsModalDirective, IntegrationGateComponent],
  templateUrl: './coupons.page.html',
  styleUrl: './coupons.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouponsPage {
  private readonly api = inject(CouponsApiService);
  private readonly store = inject(StoreApiService);
  private readonly fb = inject(FormBuilder);
  private readonly confirmDialog = inject(DsConfirmService);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly active = computed(() => this.integrations.isActive('store'));
  readonly kindLabels = KIND_LABELS;
  readonly methodLabels = METHOD_LABELS;
  readonly kinds = Object.keys(KIND_LABELS) as CouponKind[];
  readonly methods: CouponMethod[] = ['CODE', 'AUTOMATIC'];
  readonly creationOptions: { kind: CouponKind; title: string; description: string; icon: DsIconName }[] = [
    { kind: 'PERCENT', title: 'Porcentaje de descuento', description: 'Reduce un porcentaje del importe de los productos participantes.', icon: 'ticketPercent' },
    { kind: 'FIXED', title: 'Importe fijo', description: 'Define cuánto descontar en soles y la compra mínima, si corresponde.', icon: 'shoppingBag' },
    { kind: 'BUY_X_GET_Y', title: 'Compra X, lleva Y', description: 'Ofrece un beneficio en unidades adicionales al comprar una cantidad definida.', icon: 'package' },
    { kind: 'FREE_SHIPPING', title: 'Envío gratis', description: 'Cubre el envío a domicilio en pedidos que cumplan tus condiciones.', icon: 'truck' },
  ];

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly submitted = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly coupons = signal<Coupon[]>([]);
  readonly targetsCatalog = signal<CouponTargets>({ categories: [], brands: [], lines: [], products: [] });
  readonly storeUrl = signal<string | null>(null);
  readonly copiedCode = signal<string | null>(null);
  /** `null` = editor closed, `'new'` = creating, otherwise the coupon being edited. */
  readonly editing = signal<Coupon | 'new' | null>(null);
  readonly selectingType = signal(false);

  readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,30}$/)]],
    method: ['CODE' as CouponMethod],
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
  readonly formValues = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });
  readonly draftBenefit = computed(() => {
    const v = this.formValues();
    if (v.kind === 'FREE_SHIPPING') return 'Envío gratis';
    if (v.value === null || !Number.isFinite(v.value) || v.value <= 0) return 'Define el beneficio';
    if (v.kind === 'FIXED') return `${this.formatSoles(Math.round(v.value * 100))} de descuento`;
    if (v.kind === 'BUY_X_GET_Y') return `Compra ${v.buyQuantity ?? '—'}, lleva ${v.getQuantity ?? '—'} con ${v.value} % de descuento`;
    return `${v.value} % de descuento`;
  });

  scheduleLabel(value: string, fallback: string): string {
    if (!value) return fallback;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Revisa la fecha';
  }
  private readonly formEvents = toSignal(this.form.events, { initialValue: null });
  readonly hasChanges = computed(() => { this.formEvents(); return this.form.dirty; });
  readonly validationErrors = computed(() => {
    const v = this.formValues();
    const errors: Record<string, string> = {};
    if (v.label.trim().length < 3 || v.label.trim().length > 80) errors['label'] = 'Usa un nombre de 3 a 80 caracteres.';
    if (v.method === 'CODE' && !/^[A-Za-z0-9_-]{3,30}$/.test(v.code)) errors['code'] = 'Usa de 3 a 30 letras, números, guiones o guiones bajos.';
    const number = (key: keyof typeof v, min: number, max: number, integer = false, required = false) => {
      const value = v[key];
      if (value === null && !required) return;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) errors[key] = integer ? `Ingresa un número entero entre ${min} y ${max}.` : `Ingresa un importe entre S/ ${min} y S/ ${max}.`;
    };
    if (v.kind !== 'FREE_SHIPPING') number('value', v.kind === 'FIXED' ? 0.01 : 1, v.kind === 'FIXED' ? 1_000_000 : v.kind === 'PERCENT' ? 90 : 100, v.kind !== 'FIXED', true);
    if (v.kind === 'PERCENT' || v.kind === 'BUY_X_GET_Y') number('maxDiscount', 0.01, 1_000_000);
    if (v.kind === 'BUY_X_GET_Y') { number('buyQuantity', 1, 20, true, true); number('getQuantity', 1, 20, true, true); number('maxApplications', 1, 50, true); }
    number('minSubtotal', 0, 1_000_000); number('minItems', 0, 100, true);
    number('usageLimit', 1, 2_147_483_647, true); number('perCustomerLimit', 1, 2_147_483_647, true);
    if (v.scope !== 'ALL' && !this.selectedTargets().length) errors['targets'] = 'Selecciona al menos una opción participante.';
    for (const key of ['startsAt', 'endsAt'] as const) if (v[key] && !Number.isFinite(new Date(v[key]).getTime())) errors[key] = 'Ingresa una fecha válida.';
    if (v.startsAt && v.endsAt && new Date(v.endsAt) <= new Date(v.startsAt)) errors['endsAt'] = 'La fecha de fin debe ser posterior al inicio.';
    if (v.note.length > 300) errors['note'] = 'Usa un máximo de 300 caracteres.';
    return errors;
  });

  fieldError(field: keyof CouponsPage['form']['controls']): string | null {
    return this.submitted() || this.form.controls[field].touched ? this.validationErrors()[field] ?? null : null;
  }

  readonly kind = signal<CouponKind>('PERCENT');
  readonly method = signal<CouponMethod>('CODE');
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
    this.form.controls.method.valueChanges.subscribe((method) => this.setMethod(method));
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      if (!this.active()) return;
      const [coupons, targets] = await Promise.all([this.api.list(), this.api.targets()]);
      this.coupons.set(coupons);
      this.targetsCatalog.set(targets);
      this.store
        .get()
        .then((view) => this.storeUrl.set(view.url))
        .catch(() => this.storeUrl.set(null));
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar tus descuentos.');
    } finally {
      this.loading.set(false);
    }
  }

  openCreatePicker(): void {
    if (this.busyId() || this.loading() || this.loadFailed()) return;
    this.selectingType.set(true);
  }

  startCreate(kind: CouponKind = 'PERCENT', method: CouponMethod = 'CODE'): void {
    if (this.saving() || this.busyId()) return;
    this.submitted.set(false);
    this.selectingType.set(false);
    this.clearMessages();
    this.kind.set(kind);
    this.form.reset({
      kind,
      method,
      isActive: true,
      applyToSets: true,
      value: kind === 'BUY_X_GET_Y' ? 100 : kind === 'PERCENT' ? 10 : null,
      buyQuantity: 2,
      getQuantity: 1,
    });
    this.setMethod(method);
    this.scope.set('ALL');
    this.setTargets([]);
    this.editing.set('new');
  }

  startEdit(coupon: Coupon): void {
    if (this.saving() || this.busyId()) return;
    this.submitted.set(false);
    this.clearMessages();
    const percentLike = coupon.kind === 'PERCENT' || coupon.kind === 'BUY_X_GET_Y';
    this.kind.set(coupon.kind);
    this.method.set(coupon.method);
    this.form.reset({
      code: coupon.code,
      method: coupon.method,
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
    this.setMethod(coupon.method);
    this.setTargets(coupon.targets);
    this.editing.set(coupon);
  }

  cancel(): void {
    if (this.saving()) return;
    this.editing.set(null);
  }

  toggleTarget(value: string, checked: boolean): void {
    if (this.saving()) return;
    const current = this.selectedTargets();
    this.setTargets(checked ? [...current, value] : current.filter((t) => t !== value));
    this.form.markAsDirty();
  }

  async save(): Promise<void> {
    if (this.saving() || this.editing() === null) return;
    this.submitted.set(true);
    if (this.form.invalid || Object.keys(this.validationErrors()).length) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      const field = Object.keys(this.validationErrors())[0];
      queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`[formControlName="${field}"]`)?.focus());
      return;
    }
    const payload = this.toPayload();
    const editing = this.editing();
    this.saving.set(true);
    this.clearMessages();
    try {
      let saved: Coupon;
      if (editing === 'new') {
        saved = await this.api.create(payload);
        this.successMessage.set(payload.method === 'CODE' ? `Código ${payload.code} creado.` : 'Descuento automático creado.');
      } else if (editing) {
        saved = await this.api.update(editing.id, payload);
        this.successMessage.set(payload.method === 'CODE' ? `Código ${payload.code} actualizado.` : 'Descuento automático actualizado.');
      } else return;
      this.coupons.update(items => items.some(item => item.id === saved.id) ? items.map(item => item.id === saved.id ? saved : item) : [saved, ...items]);
      this.editing.set(null);
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo guardar el descuento.'));
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(coupon: Coupon): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(coupon.id);
    this.clearMessages();
    try {
      const saved = await this.api.update(coupon.id, { isActive: !coupon.isActive });
      this.coupons.update(items => items.map(item => item.id === saved.id ? saved : item));
      this.successMessage.set(saved.isActive ? 'Descuento activado.' : 'Descuento pausado.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo cambiar el estado.'));
    } finally {
      this.busyId.set(null);
    }
  }

  async remove(coupon: Coupon): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(coupon.id);
    const confirmed = await this.confirmDialog.confirm({
      title: `¿Eliminar ${coupon.method === 'CODE' ? 'el código' : 'el descuento'} ${coupon.method === 'CODE' ? coupon.code : coupon.label}?`,
      message: 'Dejará de aplicarse a las nuevas compras. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar descuento',
      tone: 'danger',
    });
    if (!confirmed) { this.busyId.set(null); return; }
    this.clearMessages();
    try {
      await this.api.remove(coupon.id);
      this.coupons.set(this.coupons().filter((c) => c.id !== coupon.id));
      this.successMessage.set('Descuento eliminado.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo eliminar el descuento.'));
    } finally {
      this.busyId.set(null);
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
      code: v.method === 'CODE' ? v.code.trim().toUpperCase() : undefined,
      method: v.method,
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
    if (coupon.method !== 'CODE') return null;
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

  private setMethod(method: CouponMethod): void {
    this.method.set(method);
    const code = this.form.controls.code;
    if (method === 'CODE') {
      code.setValidators([Validators.required, Validators.pattern(/^[A-Za-z0-9_-]{3,30}$/)]);
    } else {
      code.clearValidators();
      code.setValue('', { emitEvent: false });
    }
    code.updateValueAndValidity({ emitEvent: false });
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 409].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

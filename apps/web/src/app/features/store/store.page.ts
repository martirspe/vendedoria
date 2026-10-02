import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { StoreTemplate, StoreTemplateCopy, UbigeoDistrict } from '@vendedoria/contracts';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  CarrierRates,
  StoreApiService,
  StoreIndustry,
  StoreSettingsView,
  UpdateStorePayload,
} from '../../core/api/store-api.service';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const toCents = (soles: number | null) =>
  soles === null || Number.isNaN(soles) ? null : Math.round(soles * 100);
const toSoles = (cents: number | null) => (cents === null ? null : cents / 100);

export const INDUSTRY_OPTIONS: { value: StoreIndustry; label: string }[] = [
  { value: 'general', label: 'General / varios rubros' },
  { value: 'belleza', label: 'Belleza y cuidado personal' },
  { value: 'moda', label: 'Moda y accesorios' },
  { value: 'hogar', label: 'Hogar y decoración' },
  { value: 'alimentos', label: 'Alimentos y bebidas' },
  { value: 'tecnologia', label: 'Tecnología' },
  { value: 'salud', label: 'Salud y bienestar' },
  { value: 'mascotas', label: 'Mascotas' },
  { value: 'otros', label: 'Otro rubro' },
];

/** Mirrors `apps/api/src/storefront/store-templates.ts`. */
export const TEMPLATE_OPTIONS: {
  value: StoreTemplate;
  label: string;
  description: string;
  industries: StoreIndustry[] | 'all';
}[] = [
  {
    value: 'classic',
    label: 'Clásica',
    description: 'Catálogo limpio con tus colores. Sirve para cualquier rubro.',
    industries: 'all',
  },
  {
    value: 'selecta',
    label: 'Selecta',
    description:
      'Editorial y elegante, pensada para belleza: sets con ahorro, complementos en el carrito y fichas con notas, beneficios y modo de uso.',
    industries: ['belleza'],
  },
];

export const CARRIERS = [
  { key: 'olva', label: 'Olva Courier', defaults: [9, 12, 16, 22, 28] },
  { key: 'shalom', label: 'Shalom', defaults: [8, 10, 14, 18, 24] },
] as const;
export const CARRIER_TIER_LABELS = ['Hasta 20 km', 'Hasta 100 km', 'Hasta 400 km', 'Hasta 900 km', 'Más lejos'];

const COPY_FIELDS = [
  'heroEyebrow',
  'heroTitle',
  'heroEmphasis',
  'heroText',
  'heroNote',
  'bannerEyebrow',
  'bannerTitle',
  'bannerText',
  'bannerImageUrl',
  'closingPhrase',
  'footerNote',
] as const;
type CopyField = (typeof COPY_FIELDS)[number];

@Component({
  selector: 'app-store-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './store.page.html',
  styleUrl: './store.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorePage {
  private readonly api = inject(StoreApiService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly busyAction = signal<'publish' | 'unpublish' | 'preview' | 'products' | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly view = signal<StoreSettingsView | null>(null);

  readonly isPublished = computed(() => this.view()?.storefront.status === 'PUBLISHED');
  readonly hiddenProducts = computed(() => {
    const view = this.view();
    return view ? view.totalProducts - view.publishedProducts : 0;
  });
  readonly requiredPending = computed(
    () => this.view()?.checklist.filter((item) => item.required && !item.done) ?? [],
  );

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    tagline: ['', [Validators.maxLength(140)]],
    logoUrl: ['', [Validators.maxLength(500)]],
    heroImageUrl: ['', [Validators.maxLength(500)]],
    brandColor: ['#0b0d12', [Validators.pattern(HEX_COLOR)]],
    accentColor: ['#5b8cff', [Validators.pattern(HEX_COLOR)]],
    whatsappPhone: ['', [Validators.pattern(/^\+?[\d\s-]{8,20}$/)]],
    contactEmail: ['', [Validators.email, Validators.maxLength(160)]],
    seoTitle: ['', [Validators.maxLength(70)]],
    seoDescription: ['', [Validators.maxLength(160)]],
    deliveryEnabled: [true],
    freeShippingFrom: [null as number | null, [Validators.min(1)]],
    pickupEnabled: [false],
    pickupAddress: ['', [Validators.maxLength(240)]],
    legalName: ['', [Validators.maxLength(160)]],
    ruc: ['', [Validators.pattern(/^(10|15|16|17|20)\d{9}$/)]],
    legalAddress: ['', [Validators.maxLength(240)]],
    complaintsBookUrl: ['', [Validators.pattern(/^https:\/\/\S+$/), Validators.maxLength(500)]],
    exchangeDays: [0, [Validators.min(0), Validators.max(60)]],
    dataBankCode: ['', [Validators.maxLength(60)]],
    industry: ['general' as StoreIndustry],
    template: ['classic' as StoreTemplate],
    copy: this.fb.nonNullable.group(
      Object.fromEntries(COPY_FIELDS.map((field) => [field, ['', [Validators.maxLength(600)]]])) as Record<
        CopyField,
        [string, ReturnType<typeof Validators.maxLength>[]]
      >,
    ),
    faq: this.fb.array<ReturnType<StorePage['faqGroup']>>([]),
    shippingOriginUbigeo: [''],
    olvaEnabled: [false],
    olva: this.fb.array(this.rateControls([...CARRIERS[0].defaults])),
    shalomEnabled: [false],
    shalom: this.fb.array(this.rateControls([...CARRIERS[1].defaults])),
  });

  readonly industries = INDUSTRY_OPTIONS;
  readonly carriers = CARRIERS;
  readonly tierLabels = CARRIER_TIER_LABELS;
  readonly districts = signal<UbigeoDistrict[]>([]);
  readonly originDepartment = signal('');
  readonly originProvince = signal('');
  private readonly industry = signal<StoreIndustry>('general');
  readonly templates = computed(() =>
    TEMPLATE_OPTIONS.map((option) => ({
      ...option,
      available: option.industries === 'all' || option.industries.includes(this.industry()),
    })),
  );
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
    this.form.controls.industry.valueChanges.subscribe((industry) => {
      this.industry.set(industry);
      const allowed = this.templates().find((t) => t.value === this.form.controls.template.value)?.available;
      if (!allowed) this.form.controls.template.setValue('classic');
    });
  }

  get faq() {
    return this.form.controls.faq;
  }

  addFaq(): void {
    this.faq.push(this.faqGroup('', ''));
    this.faq.markAsDirty();
  }

  removeFaq(index: number): void {
    this.faq.removeAt(index);
    this.faq.markAsDirty();
  }

  pickTemplate(template: StoreTemplate): void {
    if (!this.templates().find((t) => t.value === template)?.available) return;
    this.form.controls.template.setValue(template);
    this.form.controls.template.markAsDirty();
  }

  setOriginDepartment(department: string): void {
    this.originDepartment.set(department);
    this.originProvince.set('');
    this.form.controls.shippingOriginUbigeo.setValue('');
    this.form.controls.shippingOriginUbigeo.markAsDirty();
  }

  setOriginProvince(province: string): void {
    this.originProvince.set(province);
    this.form.controls.shippingOriginUbigeo.setValue('');
    this.form.controls.shippingOriginUbigeo.markAsDirty();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [view, districts] = await Promise.all([this.api.get(), this.api.ubigeos()]);
      this.districts.set(districts);
      this.apply(view);
    } catch {
      this.errorMessage.set('No pudimos cargar tu tienda web. Revisa la API e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados antes de guardar.');
      return;
    }
    const values = this.form.getRawValue();
    const payload: UpdateStorePayload = {
      displayName: values.displayName.trim(),
      tagline: values.tagline.trim() || null,
      logoUrl: values.logoUrl.trim() || null,
      heroImageUrl: values.heroImageUrl.trim() || null,
      brandColor: values.brandColor,
      accentColor: values.accentColor,
      whatsappPhone: values.whatsappPhone.replace(/\D/g, '') || null,
      contactEmail: values.contactEmail.trim() || null,
      seoTitle: values.seoTitle.trim() || null,
      seoDescription: values.seoDescription.trim() || null,
      deliveryEnabled: values.deliveryEnabled,
      freeShippingFromCents: toCents(values.freeShippingFrom),
      pickupEnabled: values.pickupEnabled,
      pickupAddress: values.pickupAddress.trim() || null,
      legalName: values.legalName.trim() || null,
      ruc: values.ruc.trim() || null,
      legalAddress: values.legalAddress.trim() || null,
      complaintsBookUrl: values.complaintsBookUrl.trim() || null,
      exchangeDays: values.exchangeDays ?? 0,
      dataBankCode: values.dataBankCode.trim() || null,
      industry: values.industry,
      template: values.template,
      templateCopy: this.copyPayload(values.copy, values.faq),
      shippingOriginUbigeo: values.shippingOriginUbigeo || null,
      carrierRates: this.ratesPayload(values),
    };
    if (payload.carrierRates && !payload.shippingOriginUbigeo) {
      this.errorMessage.set('Elige el distrito desde donde despachas para cobrar Olva o Shalom por distancia.');
      return;
    }
    this.saving.set(true);
    this.clearMessages();
    try {
      this.apply(await this.api.update(payload));
      this.successMessage.set('Tienda actualizada.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo guardar. Revisa los datos de la tienda.'));
    } finally {
      this.saving.set(false);
    }
  }

  async publish(): Promise<void> {
    await this.run('publish', () => this.api.publish(), 'Tu tienda está publicada.');
  }

  async unpublish(): Promise<void> {
    await this.run(
      'unpublish',
      () => this.api.unpublish(),
      'Tienda despublicada. Solo tú puedes verla con la vista previa.',
    );
  }

  async showAvailableProducts(): Promise<void> {
    await this.run(
      'products',
      () => this.api.showAvailableProducts(),
      'Tus productos disponibles ya son visibles en la tienda.',
    );
  }

  async openPreview(): Promise<void> {
    const preview = window.open('', '_blank');
    this.busyAction.set('preview');
    this.clearMessages();
    try {
      const { url } = await this.api.previewLink();
      if (preview) {
        preview.opener = null;
        preview.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      preview?.close();
      this.errorMessage.set(this.messageFrom(error, 'No pudimos generar la vista previa.'));
    } finally {
      this.busyAction.set(null);
    }
  }

  private async run(
    action: 'publish' | 'unpublish' | 'products',
    request: () => Promise<StoreSettingsView>,
    success: string,
  ): Promise<void> {
    this.busyAction.set(action);
    this.clearMessages();
    try {
      this.view.set(await request());
      this.successMessage.set(success);
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo completar la acción.'));
    } finally {
      this.busyAction.set(null);
    }
  }

  private faqGroup(question: string, answer: string) {
    return this.fb.nonNullable.group({
      question: [question, [Validators.required, Validators.maxLength(200)]],
      answer: [answer, [Validators.required, Validators.maxLength(1200)]],
    });
  }

  private rateControls(soles: number[]) {
    return soles.map((value) =>
      this.fb.nonNullable.control<number | null>(value, [Validators.required, Validators.min(0), Validators.max(1000)]),
    );
  }

  private copyPayload(
    copy: Record<CopyField, string>,
    faq: { question: string; answer: string }[],
  ): StoreTemplateCopy | null {
    const result: StoreTemplateCopy = {};
    for (const field of COPY_FIELDS) {
      const text = copy[field].trim();
      if (text) result[field] = text;
    }
    const rows = faq
      .map((row) => ({ question: row.question.trim(), answer: row.answer.trim() }))
      .filter((row) => row.question && row.answer);
    if (rows.length) result.faq = rows;
    return Object.keys(result).length ? result : null;
  }

  private ratesPayload(values: ReturnType<StorePage['form']['getRawValue']>): CarrierRates | null {
    const cents = (rates: (number | null)[]) => rates.map((soles) => toCents(soles) ?? 0);
    const rates: CarrierRates = {};
    if (values.olvaEnabled) rates.olva = cents(values.olva);
    if (values.shalomEnabled) rates.shalom = cents(values.shalom);
    return rates.olva || rates.shalom ? rates : null;
  }

  private apply(view: StoreSettingsView): void {
    const store = view.storefront;
    this.view.set(view);
    const copy = store.templateCopy ?? {};
    this.faq.clear();
    for (const row of copy.faq ?? []) this.faq.push(this.faqGroup(row.question, row.answer));
    const origin = this.districts().find((d) => d.code === store.shippingOriginUbigeo);
    this.originDepartment.set(origin?.department ?? '');
    this.originProvince.set(origin?.province ?? '');
    this.industry.set(store.industry);
    const olva = store.carrierRates?.olva;
    const shalom = store.carrierRates?.shalom;
    this.form.reset({
      industry: store.industry,
      template: store.template,
      copy: Object.fromEntries(COPY_FIELDS.map((field) => [field, copy[field] ?? ''])) as Record<CopyField, string>,
      shippingOriginUbigeo: store.shippingOriginUbigeo ?? '',
      olvaEnabled: Boolean(olva),
      olva: olva?.map((c) => c / 100) ?? [...CARRIERS[0].defaults],
      shalomEnabled: Boolean(shalom),
      shalom: shalom?.map((c) => c / 100) ?? [...CARRIERS[1].defaults],
      displayName: store.displayName,
      tagline: store.tagline ?? '',
      logoUrl: store.logoUrl ?? '',
      heroImageUrl: store.heroImageUrl ?? '',
      brandColor: store.brandColor,
      accentColor: store.accentColor,
      whatsappPhone: store.whatsappPhone ?? '',
      contactEmail: store.contactEmail ?? '',
      seoTitle: store.seoTitle ?? '',
      seoDescription: store.seoDescription ?? '',
      deliveryEnabled: store.deliveryEnabled,
      freeShippingFrom: toSoles(store.freeShippingFromCents),
      pickupEnabled: store.pickupEnabled,
      pickupAddress: store.pickupAddress ?? '',
      legalName: store.legalName ?? '',
      ruc: store.ruc ?? '',
      legalAddress: store.legalAddress ?? '',
      complaintsBookUrl: store.complaintsBookUrl ?? '',
      exchangeDays: store.exchangeDays,
      dataBankCode: store.dataBankCode ?? '',
    });
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && error.status === 400) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { DsButtonComponent, DsConfirmService } from '@vendedoria/ui';
import { DsEmptyStateComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  CatalogApiService,
  ComponentInput,
  MediaInput,
  ProductDetails,
  ProductDto,
  ProductKind,
  ServiceMode,
} from '../../core/api/catalog-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { resizeImage } from '../../core/media/resize-image';
import { productCompleteness, specificationHint } from './product-completeness';

import { CombinationDraft, VariantAxis, generateCombinations, readOptions, keyOf } from './variant-combinations';
import { CatalogCategory } from '../../core/api/catalog-api.service';
type VariantDraft = CombinationDraft;

type FaqDraft = { question: string; answer: string };

export type KindFilter = 'todos' | 'productos' | 'servicios' | 'digitales';
const KIND_FILTERS: KindFilter[] = ['todos', 'productos', 'servicios', 'digitales'];
const MAX_FAQS = 10;

type MediaDraft = { url: string; kind: 'image' | 'related'; alt: string; caption: string };

const MAX_MEDIA = 12;
const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [DsSelectComponent,
    ReactiveFormsModule,
    FormsModule,
    RouterLink,
    DsButtonComponent,
    DsEmptyStateComponent,
    DsIconComponent,
  ],
  templateUrl: './products.page.html',
  styleUrl: './products.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsPage {
  private readonly api = inject(CatalogApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(DsConfirmService);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly storeActive = computed(() => this.integrations.isActive('store'));
  readonly products = signal<ProductDto[]>([]);
  readonly kindFilter = toSignal(
    this.route.queryParamMap.pipe(
      map((params): KindFilter => {
        const value = params.get('tipo') as KindFilter | null;
        return value && KIND_FILTERS.includes(value) ? value : 'todos';
      }),
    ),
    { initialValue: 'todos' as KindFilter },
  );
  readonly kindOptions: Array<{ id: KindFilter; label: string }> = [
    { id: 'todos', label: 'Todos' },
    { id: 'productos', label: 'Productos' },
    { id: 'servicios', label: 'Servicios' },
    { id: 'digitales', label: 'Digitales' },
  ];
  readonly kindCounts = computed((): Record<KindFilter, number> => {
    const list = this.products();
    const services = list.filter((product) => product.kind === 'SERVICE').length;
    const digital = list.filter((product) => product.kind === 'DIGITAL').length;
    return { todos: list.length, productos: list.length - services - digital, servicios: services, digitales: digital };
  });
  readonly visibleProducts = computed(() => {
    const filter = this.kindFilter();
    return this.products().filter(
      (product) =>
        filter === 'todos' || product.kind === ({ productos: 'PRODUCT', servicios: 'SERVICE', digitales: 'DIGITAL' } as const)[filter],
    );
  });
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly editingVersion = signal<string | null>(null);
  readonly handleLocked = signal(false);
  readonly variantsEnabled = signal(false);
  readonly sellerHelpEnabled = signal(false);
  readonly media = signal<MediaDraft[]>([]);
  readonly mediaDraft = signal('');
  readonly uploading = signal(false);
  readonly detailsEnabled = signal(false);
  readonly setEnabled = signal(false);
  readonly components = signal<ComponentInput[]>([]);
  readonly pieceOptions = computed(() =>
    this.products().filter(
      (product) =>
        product.id !== this.editingId() &&
        product.kind === 'PRODUCT' &&
        !(product.variants?.length ?? 0) &&
        !(product.components?.length ?? 0),
    ),
  );
  readonly categoryDraft = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly variantDrafts = signal<VariantDraft[]>([]);
  readonly axes = signal<VariantAxis[]>([]);
  readonly axesPending = signal(false);
  readonly variantPage = signal(0);
  readonly variantRows = computed(() => this.variantDrafts().slice(this.variantPage() * 25, (this.variantPage() + 1) * 25));
  readonly categories = signal<CatalogCategory[]>([]);
  readonly classificationError = signal(false);
  readonly categoryId = signal('');
  readonly attributeValues = signal<Record<string, string>>({});
  readonly kindCategories = computed(() => this.categories().filter((category) => category.kind === this.formValues().kind));
  readonly selectedCategory = computed(() => this.categories().find((category) => category.id === this.categoryId()));
  readonly editorStep = signal('basics');
  readonly editorSteps = [{ id: 'basics', label: '1. Tipo e información' }, { id: 'configuration', label: '2. Características y variantes' }, { id: 'media', label: '3. Fotos' }, { id: 'publication', label: '4. Precio y revisión' }];
  readonly faqs = signal<FaqDraft[]>([]);
  readonly maxFaqs = MAX_FAQS;

  readonly isEditing = computed(() => Boolean(this.editingId()));

  readonly productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(250)]],
    handle: ['', [Validators.required, Validators.minLength(2)]],
    descriptionShort: ['', [Validators.maxLength(1000)]],
    descriptionFull: ['', [Validators.maxLength(5000)]],
    categoriesText: [''],
    kind: ['PRODUCT' as ProductKind],
    digitalAccessUrl: ['', [Validators.maxLength(500), Validators.pattern(/^$|^https:\/\/[^\s]+$/)]],
    digitalInstructions: ['', [Validators.maxLength(600)]],
    digitalFormat: ['', [Validators.maxLength(80)]],
    license: ['', [Validators.maxLength(300)]],
    accessDuration: ['', [Validators.maxLength(200)]],
    returns: ['', [Validators.maxLength(300)]],
    useCasesText: [''],
    exclusionsText: [''],
    compatibilityText: [''],
    durationMinutes: [null as number | null, [Validators.min(5), Validators.max(1440)]],
    serviceMode: ['' as ServiceMode | ''],
    price: [0, [Validators.required, Validators.min(0)]],
    currency: ['PEN', Validators.required],
    isAvailable: [true],
    stockUnlimited: [true],
    stockQty: [0, [Validators.min(0)]],
    isPublishedOnStore: [false],
    compareAtPrice: [null as number | null, [Validators.min(0)]],
    brand: ['', [Validators.maxLength(60)]],
    sku: ['', [Validators.maxLength(60)]],
    line: ['', [Validators.maxLength(80)]],
    size: ['', [Validators.maxLength(60)]],
    family: ['', [Validators.maxLength(80)]],
    intensity: ['', [Validators.maxLength(80)]],
    benefitsText: [''],
    usageText: [''],
    notesText: [''],
    highlightsText: [''],
    scentText: [''],
    montage: [false],
    audience: ['', [Validators.maxLength(200)]],
    attributesText: [''],
    contentsText: [''],
    warranty: ['', [Validators.maxLength(300)]],
    requirementsText: [''],
    coverage: ['', [Validators.maxLength(200)]],
    cancellation: ['', [Validators.maxLength(300)]],
    keywordsText: [''],
  });

  private readonly formValues = toSignal(
    this.productForm.valueChanges.pipe(
      startWith(this.productForm.getRawValue()),
      map(() => this.productForm.getRawValue()),
    ),
    { initialValue: this.productForm.getRawValue() },
  );

  readonly isService = computed(() => this.formValues().kind === 'SERVICE');
  readonly isDigital = computed(() => this.formValues().kind === 'DIGITAL');
  readonly isPhysical = computed(() => this.formValues().kind === 'PRODUCT');
  readonly specificationHint = computed(() => specificationHint(this.parseCategories(this.formValues().categoriesText)));

  readonly readiness = computed(() => {
    const values = this.formValues();
    const hasName = values.name.trim().length >= 2;
    const hasDescription = values.descriptionShort.trim().length >= 8;
    const hasPrice = Number(values.price) > 0;
    const items = [
      {
        id: 'name',
        label: values.kind === 'SERVICE' ? 'Nombre del servicio' : 'Nombre del producto',
        done: hasName,
        required: true,
      },
      {
        id: 'description',
        label: 'Descripción',
        done: hasDescription,
        required: true,
      },
      { id: 'price', label: 'Precio', done: hasPrice, required: true },
    ];
    if (values.kind === 'DIGITAL') items.push({ id: 'access', label: 'Enlace de acceso seguro', done: /^https:\/\/[^\s]+$/.test(values.digitalAccessUrl.trim()), required: true });
    return items;
  });

  readonly completeness = computed(() => {
    const values = this.formValues();
    return productCompleteness({
      kind: values.kind,
      categories: this.parseCategories(values.categoriesText),
      photos: this.media().filter((item) => item.kind === 'image').length,
      details: this.detailsPayload(values),
      descriptionFull: values.descriptionFull,
      durationMinutes: values.durationMinutes,
      serviceMode: values.serviceMode,
      digitalAccessUrl: values.digitalAccessUrl,
    });
  });

  readonly readinessReady = computed(() =>
    this.readiness()
      .filter((item) => item.required)
      .every((item) => item.done),
  );

  readonly nameCount = computed(() => this.formValues().name.length);
  readonly descriptionCount = computed(
    () => this.formValues().descriptionShort.length,
  );

  constructor() {
    this.productForm.controls.name.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((name) => {
        if (this.handleLocked() || this.editingId()) return;
        this.productForm.controls.handle.setValue(slugify(name), {
          emitEvent: false,
        });
      });

    this.productForm.controls.stockUnlimited.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((unlimited) => {
        const qty = this.productForm.controls.stockQty;
        if (unlimited) {
          qty.disable({ emitEvent: false });
        } else {
          qty.enable({ emitEvent: false });
        }
      });

    void this.load();
    void this.loadCategories();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.products.set(await this.api.list());
    } catch {
      this.errorMessage.set(
        'No pudimos cargar el catálogo. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingId.set(null);
    this.handleLocked.set(false);
    this.variantsEnabled.set(false);
    this.sellerHelpEnabled.set(false);
    this.media.set([]);
    this.mediaDraft.set('');
    this.categoryDraft.set('');
    this.variantDrafts.set([]);
    this.axes.set([]);
    this.axesPending.set(false);
    this.categoryId.set('');
    this.attributeValues.set({});
    this.variantPage.set(0);
    this.editorStep.set('basics');
    this.faqs.set([]);
    this.detailsEnabled.set(false);
    this.setEnabled.set(false);
    this.components.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.productForm.reset({
      audience: '',
      attributesText: '',
      contentsText: '',
      warranty: '',
      requirementsText: '',
      coverage: '',
      cancellation: '',
      keywordsText: '',
      name: '',
      handle: '',
      descriptionShort: '',
      descriptionFull: '',
      categoriesText: '',
      kind: 'PRODUCT',
      digitalAccessUrl: '',
      digitalInstructions: '',
      durationMinutes: null,
      serviceMode: '',
      price: 0,
      currency: 'PEN',
      isAvailable: true,
      stockUnlimited: true,
      stockQty: 0,
      isPublishedOnStore: false,
      compareAtPrice: null,
      brand: '',
      sku: '',
      line: '',
      size: '',
      family: '',
      intensity: '',
      benefitsText: '',
      usageText: '',
      notesText: '',
      highlightsText: '',
      scentText: '',
      montage: false,
    });
    this.productForm.controls.stockQty.disable({ emitEvent: false });
    this.editorOpen.set(true);
  }

  openEdit(product: ProductDto): void {
    this.editingId.set(product.id);
    this.editingVersion.set(product.updatedAt);
    this.handleLocked.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.sellerHelpEnabled.set(Boolean(product.descriptionFull?.trim()));
    this.variantsEnabled.set((product.variants?.length ?? 0) > 0);
    this.media.set(
      (product.media ?? []).map((item) => ({
        url: item.url,
        kind: item.kind === 'related' ? 'related' : 'image',
        alt: item.alt ?? '',
        caption: item.caption ?? '',
      })),
    );
    this.mediaDraft.set('');
    this.categoryDraft.set('');
    const details = product.details ?? {};
    this.detailsEnabled.set(
      Boolean(
        details.family ||
          details.intensity ||
          details.scent?.length ||
          details.notes?.length ||
          details.highlights?.length ||
          details.montage,
      ),
    );
    this.faqs.set((details.faqs ?? []).map((faq) => ({ ...faq })));
    this.setEnabled.set((product.components?.length ?? 0) > 0);
    this.components.set(
      (product.components ?? []).map((row) => ({ productId: row.componentId, quantity: row.quantity })),
    );
    this.productForm.reset({
      sku: product.sku ?? '',
      line: product.line ?? '',
      size: details.size ?? '',
      family: details.family ?? '',
      intensity: details.intensity ?? '',
      benefitsText: (details.benefits ?? []).join('\n'),
      usageText: (details.usage ?? []).join('\n'),
      notesText: (details.notes ?? []).join('\n'),
      highlightsText: (details.highlights ?? []).join('\n'),
      scentText: (details.scent ?? [])
        .map((note) => (note.description ? `${note.name}: ${note.description}` : note.name))
        .join('\n'),
      montage: details.montage ?? false,
      audience: details.audience ?? '',
      attributesText: (details.attributes ?? [])
        .map((row) => `${row.name}: ${row.value}`)
        .join('\n'),
      contentsText: (details.contents ?? []).join('\n'),
      warranty: details.warranty ?? '',
      requirementsText: (details.requirements ?? []).join('\n'),
      coverage: details.coverage ?? '',
      cancellation: details.cancellation ?? '',
      keywordsText: (details.keywords ?? []).join(', '),
      name: product.name,
      handle: product.handle,
      descriptionShort: product.descriptionShort ?? '',
      descriptionFull: product.descriptionFull ?? '',
      categoriesText: (product.categories ?? []).join(', '),
      kind: product.kind,
      digitalAccessUrl: product.digitalAccessUrl ?? '',
      digitalInstructions: product.digitalInstructions ?? '',
      digitalFormat: details.digitalFormat ?? '',
      license: details.license ?? '',
      accessDuration: details.accessDuration ?? '',
      returns: details.returns ?? '',
      useCasesText: (details.useCases ?? []).join('\n'),
      exclusionsText: (details.exclusions ?? []).join('\n'),
      compatibilityText: (details.compatibility ?? []).join('\n'),
      durationMinutes: product.durationMinutes,
      serviceMode: product.serviceMode ?? '',
      price: product.basePriceCents / 100,
      currency: product.currency,
      isAvailable: product.isAvailable,
      stockUnlimited: product.stockUnlimited,
      stockQty: product.stockQty ?? 0,
      isPublishedOnStore: product.isPublishedOnStore,
      compareAtPrice:
        product.compareAtPriceCents === null ? null : product.compareAtPriceCents / 100,
      brand: product.brand ?? '',
    });
    if (product.stockUnlimited) {
      this.productForm.controls.stockQty.disable({ emitEvent: false });
    } else {
      this.productForm.controls.stockQty.enable({ emitEvent: false });
    }
    const variants = product.variants ?? [];
    this.variantDrafts.set(variants.map((variant) => ({
      id: variant.id, sku: variant.sku ?? '', options: readOptions(variant),
      imageUrl: variant.imageUrl ?? null, price: variant.priceCents / 100,
      priceInherited: variant.priceInherited ?? false, isAvailable: variant.isAvailable, stockQty: variant.stockQty,
      expectedStockQty: variant.stockQty,
    })));
    const optionValues = new Map<string, Set<string>>();
    for (const variant of this.variantDrafts()) for (const option of variant.options) {
      const values = optionValues.get(option.name) ?? new Set<string>();
      values.add(option.value); optionValues.set(option.name, values);
    }
    this.axes.set([...optionValues].map(([name, values]) => ({ name, values: [...values].join(', ') })));
    this.axesPending.set(false);
    this.categoryId.set(product.categoryId ?? '');
    this.attributeValues.set({ ...(product.attributeValues ?? {}) });
    this.variantPage.set(0);
    this.editorStep.set('basics');
    this.editorOpen.set(true);
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.variantDrafts.set([]);
    this.media.set([]);
  }

  toggleDetails(enabled: boolean): void {
    this.detailsEnabled.set(enabled);
  }

  /** A service has no stock of its own, so it cannot be sold as a set. */
  setKind(kind: ProductKind): void {
    this.productForm.controls.kind.setValue(kind);
    if (kind !== 'PRODUCT') this.setEnabled.set(false);
    this.setCategory('');
  }

  toggleSet(enabled: boolean): void {
    this.setEnabled.set(enabled);
    if (enabled) {
      this.variantsEnabled.set(false);
      if (!this.components().length) this.addComponent();
    }
  }

  addComponent(): void {
    const used = new Set(this.components().map((row) => row.productId));
    const next = this.pieceOptions().find((product) => !used.has(product.id));
    this.components.update((list) => [...list, { productId: next?.id ?? '', quantity: 1 }]);
  }

  updateComponent(index: number, patch: Partial<ComponentInput>): void {
    this.components.update((list) => list.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  removeComponent(index: number): void {
    this.components.update((list) => list.filter((_, i) => i !== index));
  }

  updateMedia(index: number, patch: Partial<MediaDraft>): void {
    this.media.update((list) => list.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  moveMedia(index: number, delta: -1 | 1): void {
    this.media.update((list) => {
      const target = index + delta;
      if (target < 0 || target >= list.length) return list;
      const next = [...list];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async onFiles(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    const room = MAX_MEDIA - this.media().length;
    if (room <= 0) {
      this.errorMessage.set(`Máximo ${MAX_MEDIA} fotos por producto.`);
      return;
    }
    this.uploading.set(true);
    this.errorMessage.set(null);
    try {
      for (const file of files.slice(0, room)) {
        const image = await resizeImage(file);
        const { url } = await this.api.uploadMedia(image.contentType, image.data);
        this.media.update((list) => [...list, { url, kind: 'image', alt: '', caption: '' }]);
      }
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 429
          ? 'Subiste muchas fotos seguidas. Espera un minuto e inténtalo de nuevo.'
          : 'No pudimos subir la foto. Usa una imagen JPG, PNG o WebP.',
      );
    } finally {
      this.uploading.set(false);
    }
  }

  pieceName(productId: string): string {
    return this.products().find((product) => product.id === productId)?.name ?? '';
  }

  pieceSelectable(id: string): boolean { return this.pieceOptions().some((piece) => piece.id === id); }
  hasMedia(url: string): boolean { return this.media().some((photo) => photo.url === url); }
  categoryPath(category: CatalogCategory): string { return category.path.map((item) => item.name).join(' → '); }
  nextStep(): void {
    const index = this.editorSteps.findIndex((step) => step.id === this.editorStep());
    this.editorStep.set(this.editorSteps[Math.min(index + 1, this.editorSteps.length - 1)].id);
  }
  updateVariantOption(index: number, optionIndex: number, value: string): void {
    const variant = this.variantDrafts()[index];
    this.updateVariant(index, { options: variant.options.map((option, i) => i === optionIndex ? { ...option, value } : option) });
  }
  updateVariantStock(index: number, value: string): void { this.updateVariant(index, { stockQty: value.trim() ? Number(value) : null }); }

  onHandleInput(): void {
    this.handleLocked.set(true);
  }

  toggleVariants(enabled: boolean): void {
    this.variantsEnabled.set(enabled);
    if (enabled && this.variantDrafts().length === 0) {
      this.addVariant();
    }
  }

  toggleSellerHelp(enabled: boolean): void {
    this.sellerHelpEnabled.set(enabled);
  }

  async loadCategories(): Promise<void> {
    this.classificationError.set(false);
    try { this.categories.set(await this.api.categories()); }
    catch { this.classificationError.set(true); }
  }

  setCategory(id: string): void {
    this.categoryId.set(id); this.attributeValues.set({});
    this.detailsEnabled.set(id === 'fragrances');
    if (!this.variantDrafts().length) {
      const suggested = this.selectedCategory()?.attributes.filter((attribute) => attribute.variant && attribute.required) ?? [];
      this.axes.set(suggested.slice(0, 5).map((attribute) => ({ name: attribute.name, values: '' })));
    }
  }

  setAttribute(key: string, value: string): void {
    this.attributeValues.update((values) => ({ ...values, [key]: value }));
  }

  addAxis(): void {
    if (this.axes().length < 5) {
      this.axes.update((axes) => [...axes, { name: '', values: '' }]);
      this.axesPending.set(true);
    }
  }

  updateAxis(index: number, patch: Partial<VariantAxis>): void {
    this.axes.update((axes) => axes.map((axis, i) => i === index ? { ...axis, ...patch } : axis));
    this.axesPending.set(true);
  }

  removeAxis(index: number): void {
    this.axes.update((axes) => axes.filter((_, i) => i !== index));
    this.axesPending.set(true);
  }

  generateVariants(): void {
    try {
      this.variantDrafts.set(generateCombinations(this.axes(), this.variantDrafts(), Number(this.productForm.controls.price.value), this.productForm.controls.sku.value.trim()));
      this.axesPending.set(false);
      this.variantPage.set(0); this.errorMessage.set(null);
    } catch (error) { this.errorMessage.set(error instanceof Error ? error.message : 'Revisa los atributos.'); }
  }

  addVariant(): void {
    if (!this.axes().length) this.addAxis();
  }

  addFaq(): void {
    if (this.faqs().length >= MAX_FAQS) return;
    this.faqs.update((list) => [...list, { question: '', answer: '' }]);
  }

  updateFaq(index: number, patch: Partial<FaqDraft>): void {
    this.faqs.update((list) => list.map((faq, i) => (i === index ? { ...faq, ...patch } : faq)));
  }

  removeFaq(index: number): void {
    this.faqs.update((list) => list.filter((_, i) => i !== index));
  }

  setKindFilter(filter: KindFilter): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tipo: filter === 'todos' ? null : filter },
      queryParamsHandling: 'merge',
    });
  }

  listScore(product: ProductDto): number {
    return productCompleteness({
      kind: product.kind,
      categories: product.categories ?? [],
      photos: (product.media ?? []).filter((item) => item.kind !== 'related').length,
      details: product.details,
      descriptionFull: product.descriptionFull,
      durationMinutes: product.durationMinutes,
      serviceMode: product.serviceMode,
      digitalAccessUrl: product.digitalAccessUrl,
    }).score;
  }

  removeVariant(index: number): void {
    this.variantDrafts.update((list) => list.filter((_, i) => i !== index));
    this.variantPage.set(Math.min(this.variantPage(), Math.max(0, Math.ceil(this.variantDrafts().length / 25) - 1)));
  }

  updateVariant(index: number, patch: Partial<VariantDraft>): void {
    this.variantDrafts.update((list) =>
      list.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  onVariantPriceInput(index: number, value: string): void {
    this.updateVariant(index, { price: Number(value || 0), priceInherited: false });
  }

  onMediaDraftInput(value: string): void {
    this.mediaDraft.set(value);
  }

  addMediaUrl(): void {
    const url = this.mediaDraft().trim();
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      this.errorMessage.set('La URL debe empezar con https://');
      return;
    }
    if (this.media().length >= MAX_MEDIA) {
      this.errorMessage.set(`Máximo ${MAX_MEDIA} fotos por producto.`);
      return;
    }
    if (!this.media().some((item) => item.url === url)) {
      this.media.update((list) => [...list, { url, kind: 'image', alt: '', caption: '' }]);
    }
    this.mediaDraft.set('');
  }

  removeMediaUrl(index: number): void {
    this.media.update((list) => list.filter((_, i) => i !== index));
  }

  onCategoryDraftInput(value: string): void {
    this.categoryDraft.set(value);
  }

  addCategoryFromDraft(): void {
    const value = this.categoryDraft().trim();
    if (!value) return;
    const current = this.parseCategories(
      this.productForm.controls.categoriesText.value,
    );
    if (!current.includes(value)) {
      this.productForm.controls.categoriesText.setValue(
        [...current, value].join(', '),
      );
    }
    this.categoryDraft.set('');
  }

  removeCategory(category: string): void {
    const next = this.parseCategories(
      this.productForm.controls.categoriesText.value,
    ).filter((item) => item !== category);
    this.productForm.controls.categoriesText.setValue(next.join(', '));
  }

  categoryChips(): string[] {
    return this.parseCategories(this.formValues().categoriesText);
  }

  private storeFields(values: {
    isPublishedOnStore: boolean;
    compareAtPrice: number | null;
    brand: string;
  }) {
    const compareAt =
      values.compareAtPrice === null || String(values.compareAtPrice) === ''
        ? null
        : toCents(Number(values.compareAtPrice));
    return {
      isPublishedOnStore: values.isPublishedOnStore,
      compareAtPriceCents: compareAt && compareAt > 0 ? compareAt : null,
      brand: values.brand.trim() || null,
    };
  }

  async saveProduct(): Promise<void> {
    if (this.variantsEnabled() && !this.setEnabled() && this.axesPending()) {
      this.editorStep.set('configuration');
      this.errorMessage.set('Genera las combinaciones para aplicar los cambios de atributos antes de guardar.');
      return;
    }
    if (this.productForm.invalid || !this.readinessReady()) {
      this.productForm.markAllAsTouched();
      this.errorMessage.set(
        'Completa nombre, descripción y precio para publicar.',
      );
      return;
    }

    const values = this.productForm.getRawValue();
    const handle = slugify(values.handle);
    if (handle.length < 2) {
      this.productForm.controls.handle.setErrors({ minlength: true });
      return;
    }

    const service = values.kind === 'SERVICE';
    const stockless = values.kind !== 'PRODUCT';
    const asSet = this.setEnabled() && !stockless;
    const components = asSet ? this.components() : [];
    if (components.some((row) => !row.productId || !Number.isInteger(row.quantity) || row.quantity < 1 || row.quantity > 20) || new Set(components.map((row) => row.productId)).size !== components.length) {
      this.errorMessage.set('Elige todas las piezas y cantidades válidas, sin repetir productos.'); return;
    }
    if (asSet && !components.length) {
      this.errorMessage.set('Agrega al menos una pieza al set o desactiva "Se vende como set".');
      return;
    }
    const duration = Number(values.durationMinutes);
    const extras = {
      kind: values.kind,
      categoryId: this.categoryId() || null,
      attributeValues: this.categoryId() ? this.attributeValues() : null,
      digitalAccessUrl: values.kind === 'DIGITAL' ? values.digitalAccessUrl.trim() || null : null,
      digitalInstructions: values.kind === 'DIGITAL' ? values.digitalInstructions.trim() || null : null,
      durationMinutes: service && duration > 0 ? Math.round(duration) : null,
      serviceMode: service && values.serviceMode ? values.serviceMode : null,
      sku: values.sku.trim() || null,
      line: values.line.trim() || null,
      details: this.detailsPayload(values),
      media: this.media().map(
        (item): MediaInput => ({
          url: item.url,
          kind: item.kind,
          alt: item.alt.trim() || undefined,
          caption: item.caption.trim() || undefined,
        }),
      ),
      components,
    };

    const variants = this.variantsEnabled() && !asSet ? this.variantDrafts().map((item) => ({
      ...(item.id ? { id: item.id } : {}), sku: item.sku.trim() || undefined,
      expectedStockQty: item.expectedStockQty,
      options: item.options, imageUrl: item.imageUrl, priceInherited: item.priceInherited,
      priceCents: toCents(item.priceInherited ? Number(values.price) : item.price),
      isAvailable: item.isAvailable, stockQty: stockless ? null : item.stockQty,
    })) : [];
    if (this.variantsEnabled() && !asSet && (!variants.length || new Set(variants.map((item) => keyOf(item.options))).size !== variants.length)) {
      this.editorStep.set('configuration'); this.errorMessage.set('Genera combinaciones válidas y distintas antes de guardar.'); return;
    }
    if (this.categoryId() && !this.selectedCategory()) {
      this.editorStep.set('basics'); this.errorMessage.set('Carga la clasificación antes de guardar este producto.'); return;
    }
    const missing = this.selectedCategory()?.attributes.find((attribute) => attribute.required && !this.attributeValues()[attribute.key]?.trim() && !(attribute.variant && variants.length && variants.every((variant) => variant.options.some((option) => option.name.trim().toLocaleLowerCase('es') === attribute.name.trim().toLocaleLowerCase('es') && option.value.trim()))));
    if (missing) { this.editorStep.set('configuration'); this.errorMessage.set('Completa ' + missing.name + '.'); return; }

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const editingId = this.editingId();
      const saved = editingId
        ? await this.api.update(editingId, {
            expectedUpdatedAt: this.editingVersion() ?? undefined,
            name: values.name.trim(),
            handle,
            descriptionShort: values.descriptionShort.trim() || undefined,
            descriptionFull: this.sellerHelpEnabled()
              ? values.descriptionFull.trim() || undefined
              : '',
            categories: this.parseCategories(values.categoriesText),
            basePriceCents: toCents(values.price),
            currency: values.currency,
            isAvailable: values.isAvailable,
            stockUnlimited: stockless || values.stockUnlimited,
            stockQty: stockless || values.stockUnlimited ? null : Number(values.stockQty),
            variants,
            ...extras,
            ...this.storeFields(values),
          })
        : await this.api.create({
            name: values.name.trim(),
            handle,
            descriptionShort: values.descriptionShort.trim() || undefined,
            descriptionFull: this.sellerHelpEnabled()
              ? values.descriptionFull.trim() || undefined
              : undefined,
            categories: this.parseCategories(values.categoriesText),
            basePriceCents: toCents(values.price),
            currency: values.currency,
            isAvailable: values.isAvailable,
            stockUnlimited: stockless || values.stockUnlimited,
            stockQty: stockless || values.stockUnlimited
              ? undefined
              : Number(values.stockQty),
            variants,
            ...extras,
            ...this.storeFields(values),
          });
      this.editorOpen.set(false);
      this.editingId.set(null);
      this.successMessage.set(
        editingId
          ? `"${saved.name}" actualizado.`
          : `"${saved.name}" publicado y listo para el vendedor.`,
      );
      await this.load();
    } catch (error) {
      this.errorMessage.set(this.mapSaveError(error));
    } finally {
      this.saving.set(false);
    }
  }

  async deleteProduct(): Promise<void> {
    const productId = this.editingId();
    if (!productId) return;
    const name = this.productForm.controls.name.value.trim() || 'este producto';
    const confirmed = await this.confirmDialog.confirm({
      title: `¿Eliminar "${name}"?`,
      message:
        'Sale del catálogo, la tienda web y el inventario. Los pedidos anteriores conservan su detalle.',
      confirmLabel: 'Eliminar producto',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.deleting.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.remove(productId);
      this.products.set(this.products().filter((product) => product.id !== productId));
      this.closeEditor();
      this.successMessage.set(`"${name}" eliminado.`);
    } catch (error) {
      this.errorMessage.set(
        error instanceof HttpErrorResponse && error.status === 409 && typeof error.error?.message === 'string'
          ? error.error.message
          : 'No se pudo eliminar el producto. Inténtalo de nuevo.',
      );
    } finally {
      this.deleting.set(false);
    }
  }

  formatPrice(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  stockLabel(product: ProductDto): string {
    if (product.kind === 'DIGITAL') return 'Digital · acceso tras el pago';
    if (product.kind === 'SERVICE') {
      return product.durationMinutes ? `Servicio · ${product.durationMinutes} min` : 'Servicio';
    }
    const pieces = product.components?.length ?? 0;
    if (pieces) return `Set · ${pieces} ${pieces === 1 ? 'pieza' : 'piezas'}`;
    if (product.stockUnlimited) return 'Stock ilimitado';
    const qty = product.stockQty ?? 0;
    const base = qty === 1 ? '1 unidad' : `${qty} unidades`;
    const variants = product.variants?.length ?? 0;
    return variants ? `${base} · ${variants} var.` : base;
  }

  thumb(product: ProductDto): string | null {
    return product.media?.find((item) => item.kind !== 'related')?.url ?? null;
  }

  private detailsPayload(values: ReturnType<ProductsPage['productForm']['getRawValue']>): ProductDetails | null {
    const details: ProductDetails = {};
    const text = (value: string) => value.trim() || undefined;
    const service = values.kind === 'SERVICE';
    const fragrance = this.detailsEnabled() && values.kind === 'PRODUCT';
    details.size = text(values.size);
    details.audience = text(values.audience);
    details.returns = text(values.returns);
    if (values.kind === 'DIGITAL') {
      details.digitalFormat = text(values.digitalFormat);
      details.license = text(values.license);
      details.accessDuration = text(values.accessDuration);
    }
    if (!service) details.warranty = text(values.warranty);
    if (service) {
      details.coverage = text(values.coverage);
      details.cancellation = text(values.cancellation);
    }
    if (fragrance) {
      details.family = text(values.family);
      details.intensity = text(values.intensity);
    }
    const listFields: Array<[keyof ProductDetails, string, boolean]> = [
      ['benefits', values.benefitsText, true],
      ['useCases', values.useCasesText, true],
      ['exclusions', values.exclusionsText, true],
      ['compatibility', values.compatibilityText, !service],
      ['contents', values.contentsText, true],
      ['usage', values.usageText, !service],
      ['requirements', values.requirementsText, service || values.kind === 'DIGITAL'],
      ['notes', values.notesText, fragrance],
      ['highlights', values.highlightsText, fragrance],
    ];
    for (const [key, raw, enabled] of listFields) {
      const list = enabled ? lines(raw) : [];
      if (list.length) (details as Record<string, unknown>)[key] = list;
    }
    const pairs = (raw: string, max: number) =>
      lines(raw)
        .slice(0, max)
        .map((row) => {
          const [name, ...rest] = row.split(':');
          return { name: name.trim(), rest: rest.join(':').trim() };
        })
        .filter((row) => row.name);
    const attributes = pairs(values.attributesText, 20)
      .filter((row) => row.rest)
      .map((row) => ({ name: row.name.slice(0, 60), value: row.rest.slice(0, 200) }));
    for (const definition of this.selectedCategory()?.attributes ?? []) {
      const value = this.attributeValues()[definition.key]?.trim();
      if (value) attributes.push({ name: definition.name, value });
    }
    if (attributes.length) details.attributes = [...new Map(attributes.map((attribute) => [attribute.name.trim().toLocaleLowerCase('es'), attribute])).values()];
    const keywords = values.keywordsText
      .split(',')
      .map((word) => word.trim().slice(0, 40))
      .filter(Boolean)
      .slice(0, 20);
    if (keywords.length) details.keywords = keywords;
    const faqs = this.faqs()
      .map((faq) => ({ question: faq.question.trim(), answer: faq.answer.trim() }))
      .filter((faq) => faq.question.length >= 3 && faq.answer);
    if (faqs.length) details.faqs = faqs;
    const scent = fragrance
      ? pairs(values.scentText, 6).map((row) => ({
          name: row.name.slice(0, 80),
          ...(row.rest ? { description: row.rest.slice(0, 200) } : {}),
        }))
      : [];
    if (scent.length) details.scent = scent;
    if (fragrance && values.montage) details.montage = true;
    const clean = Object.fromEntries(
      Object.entries(details).filter(([, value]) => value !== undefined),
    ) as ProductDetails;
    return Object.keys(clean).length ? clean : null;
  }

  private parseCategories(raw: string): string[] {
    return raw
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  private mapSaveError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      const message =
        typeof error.error?.message === 'string'
          ? error.error.message
          : Array.isArray(error.error?.message)
            ? error.error.message.join(' ')
            : '';
      if (
        error.status === 409 ||
        /unique|already exists|handle/i.test(message)
      ) {
        return 'Ese identificador (handle) ya existe. Elige otro.';
      }
      if (error.status === 400) {
        return typeof error.error?.message === 'string'
          ? error.error.message
          : 'Revisa los campos: nombre, descripción y precio son obligatorios.';
      }
    }
    return 'No se pudo guardar el producto. Inténtalo de nuevo.';
  }
}

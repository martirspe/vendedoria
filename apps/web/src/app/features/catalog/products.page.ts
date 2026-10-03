import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
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
} from '../../core/api/catalog-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { resizeImage } from '../../core/media/resize-image';

type VariantDraft = {
  option1Value: string;
  option2Value: string;
  price: number;
  stockQty: number | null;
};

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
  imports: [
    ReactiveFormsModule,
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

  readonly storeActive = computed(() => this.integrations.isActive('store'));
  readonly products = signal<ProductDto[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly deleting = signal(false);
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
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
        !(product.variants?.length ?? 0) &&
        !(product.components?.length ?? 0),
    ),
  );
  readonly categoryDraft = signal('');
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly variantDrafts = signal<VariantDraft[]>([]);

  readonly isEditing = computed(() => Boolean(this.editingId()));

  readonly productForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(250)]],
    handle: ['', [Validators.required, Validators.minLength(2)]],
    descriptionShort: ['', [Validators.maxLength(1000)]],
    descriptionFull: ['', [Validators.maxLength(2000)]],
    categoriesText: [''],
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
  });

  private readonly formValues = toSignal(
    this.productForm.valueChanges.pipe(
      startWith(this.productForm.getRawValue()),
      map(() => this.productForm.getRawValue()),
    ),
    { initialValue: this.productForm.getRawValue() },
  );

  readonly readiness = computed(() => {
    const values = this.formValues();
    const hasName = values.name.trim().length >= 2;
    const hasDescription = values.descriptionShort.trim().length >= 8;
    const hasPrice = Number(values.price) > 0;
    const hasPhoto = this.media().some((item) => item.kind === 'image');
    return [
      { id: 'name', label: 'Nombre del producto', done: hasName, required: true },
      {
        id: 'description',
        label: 'Descripción',
        done: hasDescription,
        required: true,
      },
      { id: 'price', label: 'Precio', done: hasPrice, required: true },
      {
        id: 'photo',
        label: 'Al menos 1 foto — recomendado',
        done: hasPhoto,
        required: false,
      },
    ];
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
    this.detailsEnabled.set(false);
    this.setEnabled.set(false);
    this.components.set([]);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.productForm.reset({
      name: '',
      handle: '',
      descriptionShort: '',
      descriptionFull: '',
      categoriesText: '',
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
    this.detailsEnabled.set(Object.keys(details).length > 0);
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
      name: product.name,
      handle: product.handle,
      descriptionShort: product.descriptionShort ?? '',
      descriptionFull: product.descriptionFull ?? '',
      categoriesText: (product.categories ?? []).join(', '),
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
    this.variantDrafts.set(
      (product.variants ?? []).map((variant) => ({
        option1Value: variant.option1Value ?? '',
        option2Value: variant.option2Value ?? '',
        price: variant.priceCents / 100,
        stockQty: variant.stockQty,
      })),
    );
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

  addVariant(): void {
    const price = this.productForm.controls.price.value || 0;
    this.variantDrafts.update((list) => [
      ...list,
      { option1Value: '', option2Value: '', price, stockQty: null },
    ]);
  }

  removeVariant(index: number): void {
    this.variantDrafts.update((list) => list.filter((_, i) => i !== index));
  }

  updateVariant(index: number, patch: Partial<VariantDraft>): void {
    this.variantDrafts.update((list) =>
      list.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  onVariantPriceInput(index: number, value: string): void {
    this.updateVariant(index, { price: Number(value || 0) });
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

    const components = this.setEnabled()
      ? this.components().filter((row) => row.productId && row.quantity >= 1)
      : [];
    if (this.setEnabled() && !components.length) {
      this.errorMessage.set('Agrega al menos una pieza al set o desactiva "Se vende como set".');
      return;
    }
    const extras = {
      sku: values.sku.trim() || null,
      line: values.line.trim() || null,
      details: this.detailsEnabled() ? this.detailsPayload(values) : null,
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

    const variants = this.variantsEnabled() && !this.setEnabled()
      ? this.variantDrafts()
          .filter(
            (item) => item.option1Value.trim() || item.option2Value.trim(),
          )
          .map((item) => ({
            option1Name: item.option1Value.trim() ? 'Opción' : undefined,
            option1Value: item.option1Value.trim() || undefined,
            option2Name: item.option2Value.trim() ? 'Opción 2' : undefined,
            option2Value: item.option2Value.trim() || undefined,
            priceCents: toCents(item.price),
            isAvailable: true,
            stockQty: item.stockQty,
          }))
      : [];

    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      const editingId = this.editingId();
      const saved = editingId
        ? await this.api.update(editingId, {
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
            stockUnlimited: values.stockUnlimited,
            stockQty: values.stockUnlimited ? null : Number(values.stockQty),
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
            stockUnlimited: values.stockUnlimited,
            stockQty: values.stockUnlimited
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
    details.size = text(values.size);
    details.family = text(values.family);
    details.intensity = text(values.intensity);
    for (const [key, raw] of [
      ['benefits', values.benefitsText],
      ['usage', values.usageText],
      ['notes', values.notesText],
      ['highlights', values.highlightsText],
    ] as const) {
      const list = lines(raw);
      if (list.length) details[key] = list;
    }
    const scent = lines(values.scentText)
      .slice(0, 6)
      .map((row) => {
        const [name, ...rest] = row.split(':');
        const description = rest.join(':').trim();
        return { name: name.trim().slice(0, 80), ...(description ? { description: description.slice(0, 200) } : {}) };
      })
      .filter((note) => note.name);
    if (scent.length) details.scent = scent;
    if (values.montage) details.montage = true;
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
        return 'Revisa los campos: nombre, descripción y precio son obligatorios.';
      }
    }
    return 'No se pudo guardar el producto. Inténtalo de nuevo.';
  }
}

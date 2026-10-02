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
import { map, startWith } from 'rxjs';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsEmptyStateComponent } from '../../design-system/empty-state/ds-empty-state.component';
import { DsIconComponent } from '../../design-system/icon/ds-icon.component';
import {
  CatalogApiService,
  ProductDto,
} from '../../core/api/catalog-api.service';

type VariantDraft = {
  option1Value: string;
  option2Value: string;
  price: number;
  stockQty: number | null;
};

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

  readonly products = signal<ProductDto[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly editorOpen = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly handleLocked = signal(false);
  readonly variantsEnabled = signal(false);
  readonly sellerHelpEnabled = signal(false);
  readonly mediaUrls = signal<string[]>([]);
  readonly mediaDraft = signal('');
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
    const hasPhoto = this.mediaUrls().length > 0;
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
        'No pudimos cargar el catálogo. Revisa la API e inténtalo de nuevo.',
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
    this.mediaUrls.set([]);
    this.mediaDraft.set('');
    this.categoryDraft.set('');
    this.variantDrafts.set([]);
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
    this.mediaUrls.set((product.media ?? []).map((item) => item.url));
    this.mediaDraft.set('');
    this.categoryDraft.set('');
    this.productForm.reset({
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
    this.mediaUrls.set([]);
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
    if (this.mediaUrls().length >= 8) {
      this.errorMessage.set('Máximo 8 archivos por producto.');
      return;
    }
    if (this.mediaUrls().includes(url)) {
      this.mediaDraft.set('');
      return;
    }
    this.mediaUrls.update((list) => [...list, url]);
    this.mediaDraft.set('');
  }

  removeMediaUrl(index: number): void {
    this.mediaUrls.update((list) => list.filter((_, i) => i !== index));
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

    const variants = this.variantsEnabled()
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
            mediaUrls: this.mediaUrls(),
            variants,
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
            mediaUrls: this.mediaUrls(),
            variants,
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

  formatPrice(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }

  stockLabel(product: ProductDto): string {
    if (product.stockUnlimited) return 'Stock ilimitado';
    const qty = product.stockQty ?? 0;
    const base = qty === 1 ? '1 unidad' : `${qty} unidades`;
    const variants = product.variants?.length ?? 0;
    return variants ? `${base} · ${variants} var.` : base;
  }

  thumb(product: ProductDto): string | null {
    return product.media?.[0]?.url ?? null;
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

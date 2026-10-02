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
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  StoreApiService,
  StoreSettingsView,
  UpdateStorePayload,
} from '../../core/api/store-api.service';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const toCents = (soles: number | null) =>
  soles === null || Number.isNaN(soles) ? null : Math.round(soles * 100);
const toSoles = (cents: number | null) => (cents === null ? null : cents / 100);

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
    shippingLima: [null as number | null, [Validators.min(0), Validators.max(1000)]],
    shippingProvince: [null as number | null, [Validators.min(0), Validators.max(1000)]],
    freeShippingFrom: [null as number | null, [Validators.min(1)]],
    deliveryDaysLima: ['', [Validators.maxLength(60)]],
    deliveryDaysProvince: ['', [Validators.maxLength(60)]],
    pickupEnabled: [false],
    pickupAddress: ['', [Validators.maxLength(240)]],
    legalName: ['', [Validators.maxLength(160)]],
    ruc: ['', [Validators.pattern(/^(10|15|16|17|20)\d{9}$/)]],
    legalAddress: ['', [Validators.maxLength(240)]],
    complaintsBookUrl: ['', [Validators.pattern(/^https:\/\/\S+$/), Validators.maxLength(500)]],
    exchangeDays: [0, [Validators.min(0), Validators.max(60)]],
    dataBankCode: ['', [Validators.maxLength(60)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.apply(await this.api.get());
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
      shippingLimaCents: toCents(values.shippingLima),
      shippingProvinceCents: toCents(values.shippingProvince),
      freeShippingFromCents: toCents(values.freeShippingFrom),
      deliveryDaysLima: values.deliveryDaysLima.trim() || null,
      deliveryDaysProvince: values.deliveryDaysProvince.trim() || null,
      pickupEnabled: values.pickupEnabled,
      pickupAddress: values.pickupAddress.trim() || null,
      legalName: values.legalName.trim() || null,
      ruc: values.ruc.trim() || null,
      legalAddress: values.legalAddress.trim() || null,
      complaintsBookUrl: values.complaintsBookUrl.trim() || null,
      exchangeDays: values.exchangeDays ?? 0,
      dataBankCode: values.dataBankCode.trim() || null,
    };
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

  private apply(view: StoreSettingsView): void {
    const store = view.storefront;
    this.view.set(view);
    this.form.reset({
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
      shippingLima: toSoles(store.shippingLimaCents),
      shippingProvince: toSoles(store.shippingProvinceCents),
      freeShippingFrom: toSoles(store.freeShippingFromCents),
      deliveryDaysLima: store.deliveryDaysLima ?? '',
      deliveryDaysProvince: store.deliveryDaysProvince ?? '',
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

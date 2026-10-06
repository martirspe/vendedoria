import { DsEmptyStateComponent } from '@vendedoria/ui';
import { latestThemes } from '@vendedoria/themes/catalog';
import { ConversionSettingsComponent } from './conversion-settings.component';
import { ThemeManagerComponent } from './theme-manager.component';
import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { STORE_SECTIONS } from '../../layout/console-context';
import type { StoreTemplate } from '@vendedoria/contracts';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  SellerType,
  StoreApiService,
  StoreIndustry,
  StoreSettingsView,
  UpdateStorePayload,
} from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';

/** Mirrors `CHOOSABLE_SLUG` in `apps/api/src/storefront/storefront-host.ts`. */
const SUBDOMAIN = /^(?!.*--)[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;

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

export const TEMPLATE_OPTIONS = latestThemes().map(theme => ({
  value: theme.slug, label: theme.displayName, description: theme.description,
  cover: theme.assets.cover, industries: theme.industries,
}));

@Component({
  selector: 'app-store-page',
  standalone: true,
  imports: [DsEmptyStateComponent, ThemeManagerComponent, ConversionSettingsComponent, DsSelectComponent, ReactiveFormsModule, RouterLink, DsButtonComponent, DsIconComponent, IntegrationGateComponent],
  templateUrl: './store.page.html',
  styleUrl: './store.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StorePage {
  private readonly api = inject(StoreApiService);
  private readonly fb = inject(FormBuilder);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly section = toSignal(this.route.queryParamMap.pipe(map(params => STORE_SECTIONS.find(item => item.section === params.get('seccion'))?.section ?? 'temas')), { initialValue: 'temas' });
  readonly sectionTitle = computed(() => STORE_SECTIONS.find(item => item.section === this.section())!.label);
  readonly sectionDescription = computed(() => ({ temas: 'Personaliza el diseño de tu tienda y prepara tu próxima publicación.', identidad: 'La información que tus clientes ven al visitar tu tienda.', preferencias: 'Dirección, buscadores y opciones para vender online.', legal: 'Información del vendedor y políticas de la tienda.', automatizaciones: 'Configura las acciones que acompañan la compra.' })[this.section() as 'temas']);

  readonly active = computed(() => this.integrations.isActive('store'));
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly busyAction = signal<'publish' | 'unpublish' | 'preview' | 'products' | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly view = signal<StoreSettingsView | null>(null);
  readonly failedCovers = signal<StoreTemplate[]>([]);

  readonly isPublished = computed(() => this.view()?.storefront.status === 'PUBLISHED');
  readonly hiddenProducts = computed(() => {
    const view = this.view();
    return view ? view.totalProducts - view.publishedProducts : 0;
  });
  readonly requiredPending = computed(
    () => this.view()?.checklist.filter((item) => item.required && !item.done) ?? [],
  );
  /** Store URL split for display: `https:` + `//` + slug + `.tiendas.example.pe[:port]`. */
  readonly address = computed(() => {
    const url = this.view()?.url;
    if (!url) return null;
    const { protocol, host } = new URL(url);
    const dot = host.indexOf('.');
    return { protocol, slug: host.slice(0, dot), suffix: host.slice(dot) };
  });

  readonly subdomainForm = this.fb.nonNullable.group({ slug: [''] });
  readonly subdomain = this.subdomainForm.controls.slug;
  private readonly injector = inject(Injector);
  private readonly subdomainInput = viewChild<ElementRef<HTMLInputElement>>('subdomainInput');
  readonly editingSubdomain = signal(false);
  readonly savingSubdomain = signal(false);
  readonly subdomainError = signal<string | null>(null);
  readonly subdomainSuccess = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(80)]],
    tagline: ['', [Validators.maxLength(140)]],
    whatsappPhone: ['', [Validators.pattern(/^\+?[\d\s-]{8,20}$/)]],
    contactEmail: ['', [Validators.email, Validators.maxLength(160)]],
    seoTitle: ['', [Validators.maxLength(70)]],
    seoDescription: ['', [Validators.maxLength(160)]],
    sellerType: ['BUSINESS' as SellerType],
    legalName: ['', [Validators.maxLength(160)]],
    ruc: ['', [Validators.pattern(/^(10|15|16|17|20)\d{9}$/)]],
    legalAddress: ['', [Validators.maxLength(240)]],
    dni: ['', [Validators.pattern(/^\d{8}$/)]],
    legalDistrict: ['', [Validators.maxLength(120)]],
    complaintsBookUrl: ['', [Validators.pattern(/^https:\/\/\S+$/), Validators.maxLength(500)]],
    exchangeDays: [0, [Validators.min(0), Validators.max(60)]],
    dataBankCode: ['', [Validators.maxLength(60)]],
    industry: ['general' as StoreIndustry],
    template: ['classic' as StoreTemplate],
  });

  readonly industries = INDUSTRY_OPTIONS;
  private readonly industry = signal<StoreIndustry>('general');
  private readonly sellerType = signal<SellerType>('BUSINESS');
  readonly individualSeller = computed(() => this.sellerType() === 'INDIVIDUAL');
  readonly templates = computed(() =>
    TEMPLATE_OPTIONS.map((option) => ({
      ...option,
      available: option.industries === 'all' || option.industries.includes(this.industry()),
    })),
  );
  constructor() {
    void this.load();
    this.form.controls.industry.valueChanges.pipe(takeUntilDestroyed()).subscribe((industry) => {
      this.industry.set(industry);
      const allowed = this.templates().find((t) => t.value === this.form.controls.template.value)?.available;
      if (!allowed) this.form.controls.template.setValue('classic');
    });
    this.form.controls.sellerType.valueChanges.pipe(takeUntilDestroyed()).subscribe((type) => this.sellerType.set(type));
  }

  pickTemplate(template: StoreTemplate): void {
    if (!this.templates().find((t) => t.value === template)?.available) return;
    this.form.controls.template.setValue(template);
    this.form.controls.template.markAsDirty();
  }

  templatePreviewUrl(template: StoreTemplate): string {
    const view = this.view();
    if (!view) return '';
    const base = view.templateDemoBaseUrl ?? new URL('/_templates/', view.url).href;
    return new URL(`${template}/`, base).href;
  }

  coverFailed(template: StoreTemplate): void {
    this.failedCovers.update((covers) => [...new Set([...covers, template])]);
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      await this.integrations.refresh();
      this.apply(await this.api.get());
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar tu tienda web. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados antes de guardar.');
      const invalid = Object.entries(this.form.controls).find(([, control]) => control.invalid)?.[0];
      const section = ['displayName', 'tagline', 'whatsappPhone', 'contactEmail'].includes(invalid ?? '') ? 'identidad' : ['seoTitle', 'seoDescription'].includes(invalid ?? '') ? 'preferencias' : 'legal';
      await this.router.navigate([], { relativeTo: this.route, queryParams: { seccion: section }, queryParamsHandling: 'merge' });
      return;
    }
    const values = this.form.getRawValue();
    const payload: UpdateStorePayload = {
      displayName: values.displayName.trim(),
      tagline: values.tagline.trim() || null,
      whatsappPhone: values.whatsappPhone.replace(/\D/g, '') || null,
      contactEmail: values.contactEmail.trim() || null,
      seoTitle: values.seoTitle.trim() || null,
      seoDescription: values.seoDescription.trim() || null,
      sellerType: values.sellerType,
      legalName: values.legalName.trim() || null,
      ruc: values.ruc.trim() || null,
      legalAddress: values.legalAddress.trim() || null,
      dni: values.dni.trim() || null,
      legalDistrict: values.legalDistrict.trim() || null,
      complaintsBookUrl: values.complaintsBookUrl.trim() || null,
      exchangeDays: values.exchangeDays ?? 0,
      dataBankCode: values.dataBankCode.trim() || null,
      industry: values.industry,
      template: values.template,
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

  startSubdomainEdit(): void {
    this.subdomain.setValue(this.address()?.slug ?? '');
    this.subdomainError.set(null);
    this.subdomainSuccess.set(null);
    this.editingSubdomain.set(true);
    afterNextRender(() => this.subdomainInput()?.nativeElement.focus(), { injector: this.injector });
  }

  cancelSubdomainEdit(): void {
    this.editingSubdomain.set(false);
    this.subdomainError.set(null);
  }

  /** Lowercase, accents stripped, spaces as hyphens: what the merchant types becomes a valid label. */
  normalizeSubdomain(): void {
    const clean = this.subdomain.value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (clean !== this.subdomain.value) this.subdomain.setValue(clean);
    this.subdomainError.set(null);
  }

  async saveSubdomain(): Promise<void> {
    const slug = this.subdomain.value.replace(/^-+|-+$/g, '');
    if (slug === this.address()?.slug) {
      this.editingSubdomain.set(false);
      return;
    }
    if (!SUBDOMAIN.test(slug)) {
      this.subdomainError.set(
        'Usa entre 3 y 40 letras minúsculas, números o guiones, sin empezar ni terminar en guion y sin guiones seguidos.',
      );
      this.subdomainInput()?.nativeElement.focus();
      return;
    }
    this.savingSubdomain.set(true);
    this.subdomainError.set(null);
    try {
      const view = await this.api.changeSubdomain(slug);
      this.view.set(view);
      this.editingSubdomain.set(false);
      this.subdomainSuccess.set('Listo. Tu tienda ya está en la nueva dirección y la anterior redirige a ella.');
    } catch (error) {
      this.subdomainError.set(this.messageFrom(error, 'No pudimos cambiar la dirección. Inténtalo de nuevo.'));
    } finally {
      this.savingSubdomain.set(false);
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
    this.industry.set(store.industry);
    this.sellerType.set(store.sellerType);
    this.form.reset({
      sellerType: store.sellerType,
      industry: store.industry,
      template: view.themeStatus.editing.template,
      displayName: store.displayName,
      tagline: store.tagline ?? '',
      whatsappPhone: store.whatsappPhone ?? '',
      contactEmail: store.contactEmail ?? '',
      seoTitle: store.seoTitle ?? '',
      seoDescription: store.seoDescription ?? '',
      legalName: store.legalName ?? '',
      ruc: store.ruc ?? '',
      legalAddress: store.legalAddress ?? '',
      dni: store.dni ?? '',
      legalDistrict: store.legalDistrict ?? '',
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
    if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 409)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

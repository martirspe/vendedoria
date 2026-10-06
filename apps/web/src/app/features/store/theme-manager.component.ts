import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import { StoreApiService, type StoreThemeCatalog } from '../../core/api/store-api.service';
import { compareVersions } from '@vendedoria/themes/catalog';

@Component({
  selector: 'app-theme-manager',
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './theme-manager.component.html',
  styleUrl: './theme-manager.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeManagerComponent {
  private readonly api = inject(StoreApiService);
  readonly inEditor = input(false);
  readonly staged = output<void>();
  readonly data = signal<StoreThemeCatalog | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly notice = signal<string | null>(null);
  readonly current = computed(() => {
    const data = this.data();
    return data?.themes.find(theme => theme.slug === data.status.editing.template && theme.version === data.status.editing.version);
  });
  readonly functions = computed(() => {
    const names: Record<string, string> = { catalog: 'Catálogo', cart: 'Carrito', checkout: 'Compra', seo: 'Buscadores', variants: 'Variantes', search: 'Búsqueda', filters: 'Filtros', coupons: 'Cupones', services: 'Servicios', digitalProducts: 'Productos digitales', recommendations: 'Recomendaciones', whatsapp: 'Consulta por WhatsApp' };
    const theme = this.current();
    return theme ? [...new Set([...theme.capabilities.requires, ...theme.capabilities.supports])].map(key => names[key] ?? 'Función adicional') : [];
  });
  readonly activeName = computed(() => {
    const data = this.data();
    return data?.themes.find(theme => theme.slug === data.status.active.template && theme.version === data.status.active.version)?.displayName ?? 'una plantilla anterior';
  });
  readonly pending = computed(() => {
    const status = this.data()?.status;
    return status && (status.active.template !== status.editing.template || status.active.version !== status.editing.version);
  });

  constructor() { void this.load(); }

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try { this.data.set(await this.api.themes()); }
    catch { this.error.set('No pudimos consultar tu plantilla. Vuelve a intentarlo.'); }
    finally { this.loading.set(false); }
  }

  async prepare(action: 'update' | 'preset' | 'recover', preset?: string): Promise<void> {
    const data = this.data();
    if (!data || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.notice.set(null);
    try {
      const selection = action === 'recover'
        ? { template: 'classic', version: data.themes.filter(theme => theme.slug === 'classic').sort((a, b) => compareVersions(b.version, a.version))[0].version }
        : action === 'update'
          ? { template: data.status.active.template, version: data.status.update!.version }
          : data.status.editing;
      await this.api.stageTheme(selection.template, selection.version, data.savedAt, action === 'preset' ? preset : undefined);
      this.data.set(await this.api.themes());
      this.notice.set(action === 'preset' ? 'Muestra preparada: tus textos y fotos personalizados se conservan. No se importaron productos de ejemplo.' : 'Diseño preparado en tu borrador. Revísalo en el editor y publica cuando esté listo.');
      this.staged.emit();
    } catch (error) {
      const message = error instanceof HttpErrorResponse ? error.error?.message : null;
      this.error.set(typeof message === 'string' ? message : 'No pudimos preparar el diseño. Recarga y vuelve a intentarlo.');
    } finally { this.busy.set(false); }
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  CatalogApiService,
  CatalogImportFile,
  CatalogImportOptions,
  CatalogImportPayload,
  CatalogImportReport,
  CatalogImportResult,
} from '../../core/api/catalog-api.service';
import { messageFrom } from '../../core/api/api-error';
import { resizeImage } from '../../core/media/resize-image';
import {
  CatalogPackage,
  entriesFromDrop,
  entriesFromInput,
  PackageEntry,
  readPackage,
  sha256,
} from './catalog-package';

type Step = 'select' | 'reading' | 'review' | 'importing' | 'done';
type Filter = 'all' | 'create' | 'update' | 'unpublished';
type LoadedPackage = CatalogPackage & { files: CatalogImportFile[] };

/** The API rejects request bodies over 1 MB. */
const MAX_PAYLOAD_BYTES = 1_000_000;
const UPLOAD_WORKERS = 2;
const RATE_LIMIT_WAIT_MS = 20_000;
const MAX_UPLOAD_ATTEMPTS = 5;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

@Component({
  selector: 'app-catalog-import-page',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './catalog-import.page.html',
  styleUrls: ['../store/store.page.scss', './catalog-import.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class CatalogImportPage {
  private readonly api = inject(CatalogApiService);

  readonly step = signal<Step>('select');
  readonly dragging = signal(false);
  readonly pkg = signal<LoadedPackage | null>(null);
  readonly report = signal<CatalogImportReport | null>(null);
  readonly previewing = signal(false);
  readonly progress = signal({ done: 0, total: 0, label: '' });
  readonly result = signal<CatalogImportResult | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly filter = signal<Filter>('all');
  readonly options = signal<CatalogImportOptions>({
    updatePrices: false,
    updateStock: false,
    fullSync: false,
    applyStoreSettings: false,
  });

  readonly errors = computed(() => this.report()?.issues.filter((issue) => issue.level === 'error') ?? []);
  readonly warnings = computed(() => this.report()?.issues.filter((issue) => issue.level === 'warning') ?? []);
  readonly visibleProducts = computed(() => {
    const rows = this.report()?.products ?? [];
    switch (this.filter()) {
      case 'create':
        return rows.filter((row) => row.action === 'create');
      case 'update':
        return rows.filter((row) => row.action === 'update');
      case 'unpublished':
        return rows.filter((row) => !row.published);
      default:
        return rows;
    }
  });
  readonly progressPercent = computed(() => {
    const { done, total } = this.progress();
    return total ? Math.round((done / total) * 100) : 0;
  });

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.step() === 'importing' || this.step() === 'reading') event.preventDefault();
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    if (!event.dataTransfer) return;
    try {
      await this.load(await entriesFromDrop(event.dataTransfer));
    } catch {
      this.fail('No pudimos leer la carpeta. Prueba con el botón "Elegir carpeta".');
    }
  }

  async onFolder(input: HTMLInputElement): Promise<void> {
    const entries = entriesFromInput(input.files);
    input.value = '';
    await this.load(entries);
  }

  setFilter(filter: Filter): void {
    this.filter.set(filter);
  }

  async setOption(key: keyof CatalogImportOptions, value: boolean): Promise<void> {
    this.options.update((current) => ({ ...current, [key]: value }));
    await this.preview();
  }

  reset(): void {
    this.step.set('select');
    this.pkg.set(null);
    this.report.set(null);
    this.result.set(null);
    this.errorMessage.set(null);
    this.filter.set('all');
  }

  async runImport(): Promise<void> {
    const pkg = this.pkg();
    const report = this.report();
    if (!pkg || !report?.canImport) return;
    this.step.set('importing');
    this.errorMessage.set(null);
    try {
      const uploaded = await this.uploadPhotos(pkg, report.uploads);
      this.progress.set({ done: 1, total: 1, label: 'Guardando el catálogo…' });
      const result = await this.api.commitImport({ ...this.payload(pkg), uploaded });
      this.result.set(result);
      this.step.set('done');
    } catch (error) {
      this.errorMessage.set(
        error instanceof PhotoError
          ? error.message
          : messageFrom(error, 'No pudimos completar la importación. No se guardó ningún cambio; inténtalo de nuevo.'),
      );
      this.step.set('review');
      await this.preview(true);
    }
  }

  price(cents: number): string {
    return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(cents / 100);
  }

  plural(count: number, one: string, many: string): string {
    return `${count} ${count === 1 ? one : many}`;
  }

  private async load(entries: PackageEntry[]): Promise<void> {
    this.errorMessage.set(null);
    this.step.set('reading');
    this.progress.set({ done: 0, total: 0, label: 'Buscando catalog.json…' });
    try {
      const pkg = await readPackage(entries);
      if (!pkg) {
        this.fail('La carpeta no tiene un archivo catalog.json. Elige la carpeta del paquete completo.');
        return;
      }
      const used = [...pkg.referenced].filter((key) => pkg.images.has(key));
      const files: CatalogImportFile[] = [];
      this.progress.set({ done: 0, total: used.length, label: 'Leyendo fotos…' });
      for (const key of used) {
        files.push({ path: key, hash: await sha256(pkg.images.get(key)!) });
        this.progress.update((p) => ({ ...p, done: p.done + 1 }));
      }
      this.pkg.set({ ...pkg, files });
      await this.preview();
    } catch {
      this.fail('No pudimos leer los archivos de la carpeta. Inténtalo de nuevo.');
    }
  }

  /** `keepError` keeps the message of a failed import visible over the refreshed review. */
  private async preview(keepError = false): Promise<void> {
    const pkg = this.pkg();
    if (!pkg) return;
    const payload = this.payload(pkg);
    if (new Blob([JSON.stringify(payload)]).size > MAX_PAYLOAD_BYTES) {
      this.fail('El catalog.json pesa más de 1 MB. Divide el catálogo en varios archivos e impórtalos por partes.');
      return;
    }
    this.previewing.set(true);
    if (!keepError) this.errorMessage.set(null);
    try {
      this.report.set(await this.api.previewImport(payload));
      this.step.set('review');
    } catch (error) {
      const message =
        error instanceof HttpErrorResponse && error.status === 413
          ? 'El catalog.json es demasiado grande. Divide el catálogo en varios archivos.'
          : messageFrom(error, 'No pudimos revisar el paquete. Revisa tu conexión e inténtalo de nuevo.');
      if (this.report()) this.errorMessage.set(message);
      else this.fail(message);
    } finally {
      this.previewing.set(false);
    }
  }

  private payload(pkg: LoadedPackage): CatalogImportPayload {
    return { catalog: pkg.catalogText, files: pkg.files, options: this.options() };
  }

  private async uploadPhotos(
    pkg: LoadedPackage,
    uploads: CatalogImportReport['uploads'],
  ): Promise<{ hash: string; url: string }[]> {
    const queue = [...uploads];
    const done: { hash: string; url: string }[] = [];
    const label = 'Subiendo fotos…';
    this.progress.set({ done: 0, total: uploads.length, label });
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const file = pkg.images.get(next.path);
        if (!file) throw new PhotoError(`Falta la foto ${next.path} en la carpeta.`);
        let image;
        try {
          image = await resizeImage(file);
        } catch {
          throw new PhotoError(`No pudimos procesar la foto ${next.path}. Usa JPG, PNG o WebP.`);
        }
        const { url } = await this.uploadWithRetry(image.contentType, image.data, label);
        done.push({ hash: next.hash, url });
        this.progress.update((p) => ({ ...p, done: p.done + 1 }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_WORKERS, uploads.length) }, worker));
    return done;
  }

  private async uploadWithRetry(
    contentType: 'image/jpeg' | 'image/webp',
    data: string,
    label: string,
  ): Promise<{ url: string }> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.api.uploadImportMedia(contentType, data);
      } catch (error) {
        const retriable =
          error instanceof HttpErrorResponse && (error.status === 429 || error.status === 503 || error.status === 0);
        if (!retriable || attempt >= MAX_UPLOAD_ATTEMPTS) throw error;
        this.progress.update((p) => ({ ...p, label: 'Pausa breve para no saturar la subida…' }));
        await sleep(error.status === 429 ? RATE_LIMIT_WAIT_MS : 3_000);
        this.progress.update((p) => ({ ...p, label }));
      }
    }
  }

  private fail(message: string): void {
    this.errorMessage.set(message);
    this.step.set('select');
    this.pkg.set(null);
    this.report.set(null);
  }
}

class PhotoError extends Error {}

import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DsActionBarComponent, DsButtonComponent, DsCheckboxComponent, DsDisclosureComponent, DsEmptyStateComponent, DsIconComponent, DsMenuComponent, DsSelectComponent } from '@vendedoria/ui';
import { CatalogApiService, InventoryRow, InventoryUpdate } from '../../core/api/catalog-api.service';

type Draft = { unlimited: boolean; qty: string };
type InventoryColumn = 'sku' | 'disponible' | 'limite';
type InventorySort = 'producto' | 'sku' | 'disponible';

const rowKey = (row: Pick<InventoryRow, 'productId' | 'variantId'>) => `${row.productId}:${row.variantId ?? ''}`;

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [DsActionBarComponent, RouterLink, DsButtonComponent, DsCheckboxComponent, DsDisclosureComponent, DsEmptyStateComponent, DsIconComponent, DsMenuComponent, DsSelectComponent],
  templateUrl: './inventory.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPage {
  private readonly api = inject(CatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly params = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap });

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly rows = signal<InventoryRow[]>([]);
  readonly failedImages = signal<ReadonlySet<string>>(new Set());
  readonly drafts = signal<Record<string, Draft>>({});
  readonly query = computed(() => this.params().get('q') ?? '');
  readonly lowOnly = computed(() => this.params().get('stock') === 'bajo');
  readonly hasFilters = computed(() => !!this.query().trim() || this.lowOnly());
  readonly columnOptions = [
    { id: 'sku', label: 'SKU' }, { id: 'disponible', label: 'Disponible' }, { id: 'limite', label: 'Stock ilimitado' },
  ] as const;
  readonly sortOptions = [{ id: 'producto', label: 'Producto' }, { id: 'sku', label: 'SKU' }, { id: 'disponible', label: 'Disponible' }] as const;
  readonly sortBy = computed<InventorySort>(() => {
    const value = this.params().get('orden');
    return value === 'sku' || value === 'disponible' ? value : 'producto';
  });
  readonly descending = computed(() => this.params().get('direccion') === 'desc');
  readonly hiddenColumns = computed(() => new Set((this.params().get('ocultar') ?? '').split(',').filter(value => this.columnOptions.some(column => column.id === value))));
  readonly productSpan = computed(() => 12 - (this.columnVisible('sku') ? 2 : 0) - (this.columnVisible('disponible') ? 3 : 0) - (this.columnVisible('limite') ? 2 : 0));
  private readonly collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
  readonly summary = computed(() => ({
    total: this.rows().length,
    soldOut: this.rows().filter(row => !row.stockUnlimited && (row.stockQty ?? 0) === 0).length,
    low: this.rows().filter(row => !row.stockUnlimited && (row.stockQty ?? 0) <= 3).length,
  }));
  readonly pendingCount = computed(() => this.rows().filter(row => this.isChanged(row)).length);
  readonly hasInvalidQty = computed(() => this.rows().some(row => this.invalidQty(row)));

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((row) => {
      if (this.lowOnly() && (row.stockUnlimited || (row.stockQty ?? 0) > 3)) return false;
      if (!q) return true;
      return [row.name, row.option, row.sku].some((text) => text?.toLowerCase().includes(q));
    }).sort((a, b) => {
      const key = this.sortBy();
      const left = key === 'sku' ? a.sku || null : key === 'disponible' ? a.stockUnlimited ? null : a.stockQty ?? 0 : a.name;
      const right = key === 'sku' ? b.sku || null : key === 'disponible' ? b.stockUnlimited ? null : b.stockQty ?? 0 : b.name;
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const comparison = typeof left === 'number' && typeof right === 'number' ? left - right : this.collator.compare(String(left ?? ''), String(right ?? ''));
      const tie = this.collator.compare(a.name, b.name) || this.collator.compare(a.option ?? '', b.option ?? '') || this.collator.compare(rowKey(a), rowKey(b));
      return (comparison || tie) * (this.descending() ? -1 : 1);
    });
  });
  readonly pageSize = computed(() => {
    const size = Number(this.params().get('porPagina'));
    return [25, 50, 100].includes(size) ? size : 25;
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.visible().length / this.pageSize())));
  readonly currentPage = computed(() => {
    const page = Number(this.params().get('pagina'));
    return Number.isSafeInteger(page) && page > 0 ? Math.min(page, this.totalPages()) : 1;
  });
  readonly pageStart = computed(() => this.visible().length ? (this.currentPage() - 1) * this.pageSize() + 1 : 0);
  readonly pageEnd = computed(() => Math.min(this.currentPage() * this.pageSize(), this.visible().length));
  readonly pagedRows = computed(() => this.visible().slice(this.pageStart() - 1, this.pageEnd()));

  readonly changes = computed<InventoryUpdate[]>(() => {
    const drafts = this.drafts();
    return this.rows().flatMap((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft || this.invalidQty(row)) return [];
      const stockQty = draft.unlimited ? null : Number(draft.qty);
      const current = row.stockUnlimited ? null : row.stockQty;
      if (stockQty === current) return [];
      return [{ productId: row.productId, ...(row.variantId ? { variantId: row.variantId } : {}), stockQty }];
    });
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      this.rows.set(await this.api.inventory());
      this.drafts.set({});
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set('No pudimos cargar el inventario. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  draft(row: InventoryRow): Draft {
    return (
      this.drafts()[rowKey(row)] ?? {
        unlimited: row.stockUnlimited && row.stockQty === null,
        qty: String(row.stockQty ?? 0),
      }
    );
  }

  setQty(row: InventoryRow, value: string): void {
    this.patch(row, { unlimited: false, qty: value });
  }

  setUnlimited(row: InventoryRow, unlimited: boolean): void {
    this.patch(row, { ...this.draft(row), unlimited });
  }

  isChanged(row: InventoryRow): boolean {
    const draft = this.drafts()[rowKey(row)];
    if (!draft) return false;
    return draft.unlimited !== row.stockUnlimited || (!draft.unlimited && (this.invalidQty(row) || Number(draft.qty) !== (row.stockQty ?? 0)));
  }

  invalidQty(row: InventoryRow): boolean {
    const draft = this.draft(row);
    const qty = Number(draft.qty);
    return !draft.unlimited && (!draft.qty.trim() || !Number.isSafeInteger(qty) || qty < 0);
  }

  setFilter(key: 'q' | 'stock', value: string): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  clearFilters(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: null, stock: null, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  columnVisible(column: InventoryColumn): boolean {
    return !this.hiddenColumns().has(column);
  }

  toggleColumn(column: InventoryColumn): void {
    const hidden = new Set(this.hiddenColumns());
    if (hidden.has(column)) hidden.delete(column); else hidden.add(column);
    const value = this.columnOptions.filter(option => hidden.has(option.id)).map(option => option.id).join(',');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ocultar: value || null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setSort(value: string): void {
    if (!this.sortOptions.some(option => option.id === value)) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { orden: value === 'producto' ? null : value, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setDirection(value: string): void {
    if (value !== 'asc' && value !== 'desc') return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { direccion: value === 'asc' ? null : value, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  resetView(): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { orden: null, direccion: null, ocultar: null, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  setPage(page: number): void {
    if (!Number.isSafeInteger(page) || page < 1 || page > this.totalPages()) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { pagina: page === 1 ? null : page }, queryParamsHandling: 'merge' });
  }

  setPageSize(value: string): void {
    const size = Number(value);
    if (![25, 50, 100].includes(size)) return;
    void this.router.navigate([], { relativeTo: this.route, queryParams: { porPagina: size === 25 ? null : size, pagina: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  showInvalidRow(): void {
    const firstError = this.rows().find(row => this.invalidQty(row));
    if (!firstError) return;
    // Reset sorting so the target page uses the same stable product order as the view.
    const ordered = [...this.rows()].sort((a, b) => this.collator.compare(a.name, b.name) || this.collator.compare(a.option ?? '', b.option ?? '') || this.collator.compare(rowKey(a), rowKey(b)));
    const index = ordered.indexOf(firstError);
    if (index < 0) return;
    const hidden = this.columnOptions.filter(column => column.id !== 'disponible' && this.hiddenColumns().has(column.id)).map(column => column.id).join(',');
    void this.router.navigate([], { relativeTo: this.route, queryParams: { q: null, stock: null, orden: null, direccion: null, ocultar: hidden || null, pagina: Math.floor(index / this.pageSize()) + 1 }, queryParamsHandling: 'merge' });
  }

  discard(): void {
    if (this.saving()) return;
    this.drafts.set({});
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  async save(): Promise<void> {
    if (this.saving() || this.loading() || this.loadFailed() || this.hasInvalidQty()) return;
    const items = this.changes();
    if (!items.length) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.rows.set(await this.api.updateInventory(items));
      this.drafts.set({});
      this.successMessage.set(
        items.length === 1 ? 'Stock actualizado.' : `Stock actualizado en ${items.length} registros.`,
      );
    } catch (error) {
      const message = error instanceof HttpErrorResponse ? error.error?.message : null;
      this.errorMessage.set(typeof message === 'string' ? message : 'No se pudo guardar el stock.');
    } finally {
      this.saving.set(false);
    }
  }

  track(row: InventoryRow): string {
    return rowKey(row);
  }

  private patch(row: InventoryRow, draft: Draft): void {
    if (this.saving()) return;
    this.drafts.update((all) => ({ ...all, [rowKey(row)]: draft }));
    this.successMessage.set(null);
  }

  imageFailed(url: string): void {
    this.failedImages.update(images => new Set([...images, url]));
  }
}

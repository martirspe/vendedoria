import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { DsButtonComponent, DsEmptyStateComponent, DsIconComponent } from '@vendedoria/ui';
import { CatalogApiService, InventoryRow, InventoryUpdate } from '../../core/api/catalog-api.service';

type Draft = { unlimited: boolean; qty: number };

const rowKey = (row: Pick<InventoryRow, 'productId' | 'variantId'>) => `${row.productId}:${row.variantId ?? ''}`;

@Component({
  selector: 'app-inventory-page',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsEmptyStateComponent, DsIconComponent],
  templateUrl: './inventory.page.html',
  styleUrls: ['../store/store.page.scss', './inventory.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryPage {
  private readonly api = inject(CatalogApiService);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly rows = signal<InventoryRow[]>([]);
  readonly drafts = signal<Record<string, Draft>>({});
  readonly query = signal('');
  readonly lowOnly = signal(false);

  readonly visible = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((row) => {
      if (this.lowOnly() && (row.stockUnlimited || (row.stockQty ?? 0) > 3)) return false;
      if (!q) return true;
      return [row.name, row.option, row.sku].some((text) => text?.toLowerCase().includes(q));
    });
  });

  readonly changes = computed<InventoryUpdate[]>(() => {
    const drafts = this.drafts();
    return this.rows().flatMap((row) => {
      const draft = drafts[rowKey(row)];
      if (!draft) return [];
      const stockQty = draft.unlimited ? null : Math.max(0, Math.floor(draft.qty));
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
    this.errorMessage.set(null);
    try {
      this.rows.set(await this.api.inventory());
      this.drafts.set({});
    } catch {
      this.errorMessage.set('No pudimos cargar el inventario. Inténtalo de nuevo.');
    } finally {
      this.loading.set(false);
    }
  }

  draft(row: InventoryRow): Draft {
    return (
      this.drafts()[rowKey(row)] ?? {
        unlimited: row.stockUnlimited && row.stockQty === null,
        qty: row.stockQty ?? 0,
      }
    );
  }

  setQty(row: InventoryRow, value: string): void {
    const qty = Number(value);
    this.patch(row, { unlimited: false, qty: Number.isFinite(qty) && qty >= 0 ? qty : 0 });
  }

  step(row: InventoryRow, delta: number): void {
    const current = this.draft(row);
    this.patch(row, { unlimited: false, qty: Math.max(0, (current.unlimited ? 0 : current.qty) + delta) });
  }

  setUnlimited(row: InventoryRow, unlimited: boolean): void {
    this.patch(row, { ...this.draft(row), unlimited });
  }

  isChanged(row: InventoryRow): boolean {
    return this.changes().some((c) => c.productId === row.productId && (c.variantId ?? null) === row.variantId);
  }

  discard(): void {
    this.drafts.set({});
  }

  async save(): Promise<void> {
    const items = this.changes();
    if (!items.length) return;
    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);
    try {
      this.rows.set(await this.api.updateInventory(items));
      this.drafts.set({});
      this.successMessage.set(
        items.length === 1 ? 'Stock actualizado.' : `Stock actualizado en ${items.length} SKU.`,
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
    this.drafts.update((all) => ({ ...all, [rowKey(row)]: draft }));
  }
}

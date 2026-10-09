import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { CatalogApiService, type InventoryRow } from '../../core/api/catalog-api.service';
import { InventoryPage } from './inventory.page';

const rows: InventoryRow[] = [
  { productId: 'shirt', variantId: 'small', name: 'Camisa', option: 'S', sku: 'CAM-S', imageUrl: 'https://images.example.test/shirt.jpg', stockUnlimited: false, stockQty: 2, usedInSets: 1 },
  { productId: 'bag', variantId: null, name: 'Bolso', option: null, sku: 'BOL', imageUrl: null, stockUnlimited: false, stockQty: 9, usedInSets: 0 },
  { productId: 'gift', variantId: null, name: 'Regalo', option: null, sku: null, imageUrl: null, stockUnlimited: true, stockQty: null, usedInSets: 0 },
];

beforeEach(() => vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });

async function setup(initial: Record<string, string> = {}, fail = false) {
  const params = new BehaviorSubject(convertToParamMap(initial));
  const api = {
    inventory: vi.fn(async (): Promise<InventoryRow[]> => { if (fail) throw new Error('offline'); return rows; }),
    updateInventory: vi.fn(async (_items: unknown): Promise<InventoryRow[]> => rows),
  };
  TestBed.configureTestingModule({ imports: [InventoryPage], providers: [
    provideRouter([]),
    { provide: ActivatedRoute, useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } } },
    { provide: CatalogApiService, useValue: api },
  ] });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(InventoryPage);
  fixture.detectChanges(); await fixture.whenStable();
  await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, api, params, navigate };
}

describe('inventory editing and recovery', () => {
  it('sorts saved quantities and SKU in both directions, keeping unlimited stock last and drafts stable', async () => {
    const { page, params, navigate } = await setup({ orden: 'disponible' });
    expect(page.visible().map(row => row.productId)).toEqual(['shirt', 'bag', 'gift']);
    page.setQty(rows[0], '99');
    expect(page.visible()[0].productId).toBe('shirt');
    params.next(convertToParamMap({ orden: 'disponible', direccion: 'desc' }));
    expect(page.visible().map(row => row.productId)).toEqual(['bag', 'shirt', 'gift']);
    params.next(convertToParamMap({ orden: 'sku', direccion: 'desc' }));
    expect(page.visible().map(row => row.productId)).toEqual(['shirt', 'bag', 'gift']);
    page.setSort('producto');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { orden: null, pagina: null }, queryParamsHandling: 'merge' }));
    page.setDirection('asc');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { direccion: null, pagina: null } }));
    expect(page.draft(rows[0]).qty).toBe('99');
  });

  it('restores column visibility, preserves hidden drafts and makes hidden validation errors reachable', async () => {
    const { page, fixture, params, navigate } = await setup({ ocultar: 'sku,disponible,desconocida' });
    expect(page.productSpan()).toBe(10);
    expect(fixture.nativeElement.querySelector('[id="stock-shirt:small"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('ul').textContent).not.toContain('CAM-S');
    page.setQty(rows[0], ''); page.showInvalidRow();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: null, stock: null, orden: null, direccion: null, ocultar: 'sku', pagina: 1 } }));
    params.next(convertToParamMap({ ocultar: 'sku' })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[id="stock-shirt:small"]').getAttribute('aria-invalid')).toBe('true');
    page.toggleColumn('sku');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { ocultar: null } }));
    page.resetView();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { orden: null, direccion: null, ocultar: null, pagina: null }, queryParamsHandling: 'merge' }));
    expect(page.pendingCount()).toBe(1);
  });
  it('paginates matching records, restores URL settings and bounds invalid pages', async () => {
    const { page, fixture, params, navigate } = await setup({ pagina: '99', porPagina: '25' });
    const many = Array.from({ length: 61 }, (_, index) => ({ ...rows[1], productId: `product-${index}`, name: `Producto ${index}` }));
    page.rows.set(many); fixture.detectChanges();
    expect(page.currentPage()).toBe(3);
    expect(page.pagedRows()).toHaveLength(11);
    expect(fixture.nativeElement.querySelector('nav').textContent).toContain('51–61 de 61');
    expect(fixture.nativeElement.querySelector('[aria-label="Página siguiente"]').disabled).toBe(true);
    page.setPage(4); expect(navigate).not.toHaveBeenCalled();
    page.setPage(2);
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { pagina: 2 }, queryParamsHandling: 'merge' }));
    page.setPageSize('50');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { porPagina: 50, pagina: null } }));
    params.next(convertToParamMap({ porPagina: '50', pagina: '2' })); fixture.detectChanges();
    expect(page.pagedRows()).toHaveLength(11);
    expect(page.pageStart()).toBe(51);
    params.next(convertToParamMap({ porPagina: 'invalid', pagina: '-1' })); fixture.detectChanges();
    expect(page.pageSize()).toBe(25); expect(page.currentPage()).toBe(1);
    expect(page.pagedRows()).toHaveLength(25);
    page.rows.set(many.slice(0, 4));
    expect(page.totalPages()).toBe(1);
  });

  it('retains edits across pages, saves the full draft and locates errors on hidden pages', async () => {
    const { page, fixture, params, navigate, api } = await setup();
    const many = Array.from({ length: 30 }, (_, index) => ({ ...rows[1], productId: `product-${index}` }));
    page.rows.set(many); page.setQty(many[0], '5');
    params.next(convertToParamMap({ pagina: '2' })); fixture.detectChanges();
    page.setQty(many[29], '7');
    expect(page.pagedRows()).toHaveLength(5);
    expect(page.pendingCount()).toBe(2);
    await page.save();
    expect(api.updateInventory).toHaveBeenCalledWith([
      { productId: 'product-0', stockQty: 5 }, { productId: 'product-29', stockQty: 7 },
    ]);
    page.rows.set(many); page.setQty(many[29], '');
    params.next(convertToParamMap({ q: 'oculto' })); fixture.detectChanges();
    page.showInvalidRow();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: null, stock: null, orden: null, direccion: null, ocultar: null, pagina: 2 } }));
    params.next(convertToParamMap({ pagina: '2' })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[id="stock-product-29:"]').getAttribute('aria-invalid')).toBe('true');
  });
  it('shows the main photo and replaces failed images with the same fallback as products without a photo', async () => {
    const { fixture } = await setup();
    const image = fixture.nativeElement.querySelector('img') as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(rows[0].imageUrl);
    expect(image.getAttribute('loading')).toBe('lazy');
    expect(image.alt).toBe('');
    image.dispatchEvent(new Event('error')); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.querySelector('li:first-child ds-icon[name="image"]')).not.toBeNull();
  });
  it('restores URL filters and clears them without discarding hidden edits', async () => {
    const { fixture, page, params, navigate } = await setup({ q: 'CAM', stock: 'bajo' });
    expect(page.visible()).toEqual([rows[0]]);
    page.setQty(rows[1], '5');
    expect(page.pendingCount()).toBe(1);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('incluidos los productos ocultos');
    page.setFilter('q', 'Bolso');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: 'Bolso', pagina: null }, queryParamsHandling: 'merge' }));
    (fixture.nativeElement.querySelector('[aria-label="Quitar filtro de stock bajo"]') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { stock: null, pagina: null }, queryParamsHandling: 'merge' }));
    page.setQty(rows[1], ''); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Corrige las cantidades marcadas antes de guardar');
    expect(fixture.nativeElement.textContent).toContain('Revisar cantidad');
    page.setQty(rows[1], '5');
    page.clearFilters();
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: null, stock: null, pagina: null }, queryParamsHandling: 'merge' }));
    params.next(convertToParamMap({})); fixture.detectChanges();
    expect(page.visible()).toHaveLength(3);
    expect(page.draft(rows[1]).qty).toBe('5');
    expect(page.summary()).toEqual({ total: 3, low: 1, soldOut: 0 });
  });

  it('shows inline errors and never silently converts invalid stock to zero or an integer', async () => {
    const { fixture, page, api } = await setup();
    for (const value of ['', '-1', '1.5', '9007199254740992']) {
      page.setQty(rows[0], value); await page.save(); fixture.detectChanges();
      expect(page.hasInvalidQty()).toBe(true);
      expect(api.updateInventory).not.toHaveBeenCalled();
      expect(fixture.nativeElement.querySelector('[id="stock-shirt:small"]').getAttribute('aria-invalid')).toBe('true');
      expect(fixture.nativeElement.textContent).toContain('Ingresa un número entero');
    }
    page.setQty(rows[0], '0'); await page.save();
    expect(api.updateInventory).toHaveBeenCalledWith([{ productId: 'shirt', variantId: 'small', stockQty: 0 }]);
  });

  it('locks inputs and discarding during saves, blocks duplicates and adopts the server result', async () => {
    const { fixture, page, api } = await setup();
    let resolve!: (value: InventoryRow[]) => void;
    api.updateInventory.mockImplementationOnce(() => new Promise(result => { resolve = result; }));
    page.setQty(rows[0], '4');
    const saving = page.save(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[id="stock-shirt:small"]').disabled).toBe(true);
    page.setQty(rows[0], '8'); page.setUnlimited(rows[0], true); page.discard(); await page.save();
    expect(page.draft(rows[0])).toEqual({ unlimited: false, qty: '4' });
    expect(api.updateInventory).toHaveBeenCalledTimes(1);
    resolve([{ ...rows[0], stockQty: 4 }, ...rows.slice(1)]); await saving; fixture.detectChanges();
    expect(page.pendingCount()).toBe(0);
    expect(page.rows()[0].stockQty).toBe(4);
    expect(fixture.nativeElement.textContent).toContain('Stock actualizado');
    page.setQty(page.rows()[0], '5'); fixture.detectChanges();
    expect(page.successMessage()).toBeNull();
  });

  it('preserves quantities and unlimited changes after a save failure and retries the same payload', async () => {
    const { fixture, page, api } = await setup();
    page.setQty(rows[0], '6'); page.setUnlimited(rows[1], true);
    api.updateInventory.mockRejectedValueOnce(new Error('offline'));
    await page.save(); fixture.detectChanges();
    expect(page.rows()).toEqual(rows);
    expect(page.pendingCount()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Tus cambios siguen disponibles');
    await page.save();
    expect(api.updateInventory).toHaveBeenLastCalledWith([
      { productId: 'shirt', variantId: 'small', stockQty: 6 }, { productId: 'bag', stockQty: null },
    ]);
  });

  it('keeps the low-stock filter tied to saved data until the save succeeds', async () => {
    const { page } = await setup({ stock: 'bajo' });
    page.setQty(rows[0], '8');
    expect(page.visible()).toEqual([rows[0]]);
    expect(page.summary().low).toBe(1);
    page.setUnlimited(rows[0], true);
    expect(page.changes()).toEqual([{ productId: 'shirt', variantId: 'small', stockQty: null }]);
    page.setUnlimited(rows[0], false);
    expect(page.draft(rows[0]).qty).toBe('8');
    page.discard(); expect(page.pendingCount()).toBe(0);
  });

  it('recovers failed loading and distinguishes empty inventory from no filter matches', async () => {
    const { fixture, page, api, params } = await setup({}, true);
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar el inventario');
    expect(fixture.nativeElement.querySelector('input')).toBeNull();
    api.inventory.mockResolvedValueOnce([]); await page.load(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aún no hay productos con inventario');
    api.inventory.mockResolvedValueOnce(rows); await page.load();
    params.next(convertToParamMap({ q: 'inexistente' })); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay coincidencias');
    expect(fixture.nativeElement.textContent).not.toContain('Aún no hay productos con inventario');
  });
});


import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, of } from 'rxjs';
import { DsConfirmService } from '@vendedoria/ui';
import { CatalogApiService, type CreateProductPayload, type ProductDto, type UpdateProductPayload } from '../../core/api/catalog-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { ProductsPage } from './products.page';
import { catalogCsv, filterCatalog, type CatalogListState } from './catalog-list';

const product = (id: string): ProductDto => ({
  id, handle: id, name: `Producto ${id}`, descriptionShort: 'Descripción para comprar este producto', descriptionFull: null, categories: [],
  basePriceCents: 10000, currency: 'PEN', kind: 'PRODUCT', durationMinutes: null, serviceMode: null, digitalAccessUrl: null, digitalInstructions: null,
  isAvailable: true, stockUnlimited: true, stockQty: null, isPublishedOnStore: false, compareAtPriceCents: null, brand: null, sku: null,
  line: null, details: null, variants: [], media: [], components: [], createdAt: '2026-10-05', updatedAt: '2026-10-05',
});

describe('set editor round trip', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  });
  afterEach(() => { TestBed.resetTestingModule(); vi.unstubAllGlobals(); });
  it('selects persisted IDs after options render, modifies pieces, saves and hydrates again', async () => {
    const first = product('piece-a'); const second = product('piece-b');
    let set: ProductDto = product('set');
    const persist = (payload: CreateProductPayload | UpdateProductPayload): ProductDto => {
      set = { ...set, name: payload.name ?? set.name, components: (payload.components ?? []).map((row) => {
        const piece = [first, second].find((item) => item.id === row.productId)!;
        return { id: 'recipe', componentId: row.productId, quantity: row.quantity, component: { id: piece.id, name: piece.name, handle: piece.handle, sku: null } };
      }) }; return set;
    };
    const api = {
      list: vi.fn(async () => [first, second, set]), categories: vi.fn(async () => []),
      create: vi.fn(async (payload: CreateProductPayload) => persist(payload)),
      update: vi.fn(async (_id: string, payload: UpdateProductPayload) => persist(payload)),
    };
    TestBed.configureTestingModule({ imports: [ProductsPage], providers: [
      { provide: CatalogApiService, useValue: api }, { provide: IntegrationsStateService, useValue: { isActive: () => true } },
      { provide: DsConfirmService, useValue: { confirm: async () => true } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap({})) } },
      { provide: Router, useValue: { navigate: async () => true } },
    ] });
    const fixture = TestBed.createComponent(ProductsPage); const page = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
    page.openCreate(); page.productForm.patchValue({ name: 'Set de prueba', handle: 'test-set', descriptionShort: 'Dos piezas para completar tu selección', price: 100 });
    page.toggleSet(true); page.updateComponent(0, { productId: first.id, quantity: 2 }); await page.saveProduct();
    expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ components: [{ productId: first.id, quantity: 2 }] }));
    page.openEdit(set); fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('[formControlName="name"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('input[type="file"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[formControlName="price"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[formControlName="isPublishedOnStore"]')).not.toBeNull();
    const select = fixture.nativeElement.querySelector('.variant-row--set select') as HTMLSelectElement;
    expect(select.value).toBe(first.id);
    expect(select.selectedOptions[0].textContent).toContain(first.name);
    select.value = second.id; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    page.updateComponent(0, { quantity: 3 });
    await page.saveProduct();
    expect(api.update).toHaveBeenCalledWith('set', expect.objectContaining({ components: [{ productId: second.id, quantity: 3 }] }));
    page.openEdit(set); fixture.detectChanges(); await fixture.whenStable();
    const next = fixture.nativeElement.querySelector('.variant-row--set select') as HTMLSelectElement;
    expect(next.value).toBe(second.id); expect(page.components()[0].quantity).toBe(3);
    page.removeComponent(0); page.addComponent(); expect(page.components()).toHaveLength(1);

    page.openEdit({ ...first, variants: [{ id: 'variant-a', option1Name: 'Color', option1Value: 'Negro', priceCents: 10000, stockQty: 2, isAvailable: true }] });
    page.updateAxis(0, { values: 'Negro, Blanco' });
    const saves = api.update.mock.calls.length;
    await page.saveProduct();
    expect(api.update.mock.calls.length).toBe(saves);
    expect(page.errorMessage()).toContain('Completa las opciones');
    page.generateVariants();
    await page.saveProduct();
    expect(api.update).toHaveBeenLastCalledWith(first.id, expect.objectContaining({ variants: [
      expect.objectContaining({ id: 'variant-a', expectedStockQty: 2, stockQty: 2 }),
      expect.objectContaining({ options: [{ name: 'Color', value: 'Blanco' }], stockQty: 0 }),
    ] }));
  });
});

describe('catalog management', () => {
  afterEach(() => TestBed.resetTestingModule());
  const state: CatalogListState = { kind: 'todos', query: '', status: 'todos', publication: 'todos', sort: 'nombre', page: 1, pageSize: 25 };

  it('searches accented names and variant SKUs across the complete catalog, then combines filters and ordering', () => {
    const first = { ...product('a'), name: 'Botín Ámbar', brand: 'Cuero', isPublishedOnStore: true };
    const second = { ...product('b'), name: 'Botín 2', isAvailable: false, variants: [{ sku: 'TALLA-38', priceCents: 10000, isAvailable: true, stockQty: 1 }] };
    expect(filterCatalog([first, second], { ...state, query: 'botin cuero' }).map(p => p.id)).toEqual(['a']);
    expect(filterCatalog([first, second], { ...state, query: 'talla-38' }).map(p => p.id)).toEqual(['b']);
    expect(filterCatalog([first, second], { ...state, status: 'disponibles', publication: 'visibles' }).map(p => p.id)).toEqual(['a']);
    expect(filterCatalog([first, second], state).map(p => p.id)).toEqual(['b', 'a']);
  });

  it('exports safe public fields without digital fulfillment URLs or spreadsheet formulas', () => {
    const csv = catalogCsv([{ ...product('a'), name: '=HYPERLINK("bad")', sku: '\t=1+1', digitalAccessUrl: 'https://private.example.test/access', digitalInstructions: 'Private access instructions' }]);
    expect(csv).toContain("'=");
    expect(csv).toContain("'\t=1+1");
    expect(csv).not.toContain('private.example');
    expect(csv).not.toContain('Private access');
    expect(csv).toContain('100.00');
  });

  async function setup() {
    const params = new BehaviorSubject(convertToParamMap({ pagina: '99', porPagina: '25' }));
    const navigate = vi.fn(async () => true);
    TestBed.configureTestingModule({ imports: [ProductsPage], providers: [
      { provide: CatalogApiService, useValue: { list: async () => [], categories: async () => [] } },
      { provide: IntegrationsStateService, useValue: { isActive: () => true } },
      { provide: DsConfirmService, useValue: { confirm: async () => true } },
      { provide: ActivatedRoute, useValue: { queryParamMap: params } },
      { provide: Router, useValue: { navigate } },
    ] });
    const fixture = TestBed.createComponent(ProductsPage); fixture.detectChanges(); await fixture.whenStable();
    return { page: fixture.componentInstance, fixture, params, navigate };
  }

  it('clamps a stale page after filtering or removal, and resets paging when editing a filter', async () => {
    const { page, params, navigate } = await setup();
    page.products.set(Array.from({ length: 61 }, (_, i) => product(`p-${i}`)));
    expect(page.currentPage()).toBe(3); expect(page.visibleProducts()).toHaveLength(11);
    page.products.set([product('only')]);
    expect(page.currentPage()).toBe(1); expect(page.listStart()).toBe(1); expect(page.listEnd()).toBe(1);
    page.setListFilter('q', 'no existe');
    expect(navigate).toHaveBeenLastCalledWith([], expect.objectContaining({ queryParams: { q: 'no existe', pagina: null }, replaceUrl: true }));
    params.next(convertToParamMap({ q: 'no existe', pagina: '99' }));
    expect(page.visibleProducts()).toEqual([]); expect(page.listStart()).toBe(0);
  });

  it('regroups by any option without modifying prices, stock, identity or photos, including rows on later pages', async () => {
    const { page } = await setup();
    page.openCreate(); page.toggleVariants(true);
    page.updateAxis(0, { name: 'Color', values: 'Negro, Blanco' }); page.addAxis();
    page.updateAxis(1, { name: 'Talla', values: Array.from({ length: 20 }, (_, i) => String(i + 30)).join(',') }); page.generateVariants();
    expect(page.variantDrafts()).toHaveLength(40);
    page.updateVariant(0, { id: 'saved', price: 125, priceInherited: false, stockQty: 4, expectedStockQty: 4 });
    page.variantPhotoTarget.set({ indexes: [0], label: 'Negro / 30' }); page.selectVariantPhoto('https://assets.example.test/negro.webp');
    const before = page.variantDrafts().map(v => ({ ...v }));
    page.setVariantGroup('Talla'); expect(page.variantGroups()[0].key).toBe('30');
    expect(page.variantDrafts()).toEqual(before);
    page.setVariantGroup('Color'); page.variantPage.set(1);
    const white = page.variantGroups().find(group => group.key === 'Blanco')!;
    expect(white.total).toBe(20); expect(white.rows).toHaveLength(15);
    page.variantPhotoTarget.set({ indexes: white.indexes, label: 'Blanco' }); page.selectVariantPhoto('https://assets.example.test/blanco.webp');
    expect(page.variantDrafts().slice(20).every(v => v.imageUrl?.endsWith('blanco.webp'))).toBe(true);
    expect(page.variantDrafts()[0]).toMatchObject({ id: 'saved', price: 125, stockQty: 4, imageUrl: 'https://assets.example.test/negro.webp' });
    page.updateAxisValue(0, 0, 'Negro intenso'); page.generateVariants();
    expect(page.variantDrafts()[0]).toMatchObject({ id: 'saved', price: 125, stockQty: 4, imageUrl: 'https://assets.example.test/negro.webp' });
    page.updateAxis(0, { name: 'Acabado' }); page.generateVariants();
    expect(page.variantDrafts()[0]).toMatchObject({ id: 'saved', price: 125, stockQty: 4 });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { DsConfirmService } from '@vendedoria/ui';
import { CatalogApiService, type CreateProductPayload, type ProductDto, type UpdateProductPayload } from '../../core/api/catalog-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { ProductsPage } from './products.page';

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
    page.openEdit(set); page.editorStep.set('configuration'); fixture.detectChanges(); await fixture.whenStable();
    const select = fixture.nativeElement.querySelector('.variant-row--set select') as HTMLSelectElement;
    expect(select.value).toBe(first.id);
    expect(select.selectedOptions[0].textContent).toContain(first.name);
    select.value = second.id; select.dispatchEvent(new Event('change')); fixture.detectChanges();
    page.updateComponent(0, { quantity: 3 });
    await page.saveProduct();
    expect(api.update).toHaveBeenCalledWith('set', expect.objectContaining({ components: [{ productId: second.id, quantity: 3 }] }));
    page.openEdit(set); page.editorStep.set('configuration'); fixture.detectChanges(); await fixture.whenStable();
    const next = fixture.nativeElement.querySelector('.variant-row--set select') as HTMLSelectElement;
    expect(next.value).toBe(second.id); expect(page.components()[0].quantity).toBe(3);
    page.removeComponent(0); page.addComponent(); expect(page.components()).toHaveLength(1);

    page.openEdit({ ...first, variants: [{ id: 'variant-a', option1Name: 'Color', option1Value: 'Negro', priceCents: 10000, stockQty: 2, isAvailable: true }] });
    page.updateAxis(0, { values: 'Negro, Blanco' });
    const saves = api.update.mock.calls.length;
    await page.saveProduct();
    expect(api.update.mock.calls.length).toBe(saves);
    expect(page.errorMessage()).toContain('Genera las combinaciones');
    page.generateVariants();
    await page.saveProduct();
    expect(api.update).toHaveBeenLastCalledWith(first.id, expect.objectContaining({ variants: [
      expect.objectContaining({ id: 'variant-a', expectedStockQty: 2, stockQty: 2 }),
      expect.objectContaining({ options: [{ name: 'Color', value: 'Blanco' }], stockQty: 0 }),
    ] }));
  });
});

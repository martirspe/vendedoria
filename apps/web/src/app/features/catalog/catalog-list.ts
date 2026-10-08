import { ProductDto } from '../../core/api/catalog-api.service';

export type CatalogListState = {
  kind: 'todos' | 'productos' | 'servicios' | 'digitales';
  query: string;
  status: 'todos' | 'disponibles' | 'pausados';
  publication: 'todos' | 'visibles' | 'ocultos';
  inventory?: 'todos' | 'agotados';
  sort: 'recientes' | 'antiguos' | 'nombre' | 'nombre-desc';
  page: number;
  pageSize: number;
};
const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

/** Sets require component availability; do not infer it from their parent stock. */
export function catalogStock(product: ProductDto): number | null {
  if (product.kind !== 'PRODUCT' || product.components?.length) return null;
  if (product.variants?.length) {
    return product.variants.filter(variant => variant.isAvailable)
      .reduce((total, variant) => total + Math.max(variant.stockQty ?? 0, 0), 0);
  }
  return product.stockUnlimited ? null : Math.max(product.stockQty ?? 0, 0);
}

export function filterCatalog(products: ProductDto[], state: CatalogListState): ProductDto[] {
  const words = normalize(state.query.trim()).split(/\s+/).filter(Boolean);
  const kind = state.kind === 'todos' ? undefined : ({ productos: 'PRODUCT', servicios: 'SERVICE', digitales: 'DIGITAL' } as const)[state.kind];
  return products.filter(product => {
    if (kind && product.kind !== kind) return false;
    if (state.status !== 'todos' && product.isAvailable !== (state.status === 'disponibles')) return false;
    if (state.publication !== 'todos' && product.isPublishedOnStore !== (state.publication === 'visibles')) return false;
    if (state.inventory === 'agotados' && catalogStock(product) !== 0) return false;
    const text = normalize([product.name, product.handle, product.sku, product.brand, product.line, ...product.categories, ...(product.variants ?? []).map(v => v.sku)].filter(Boolean).join(' '));
    return words.every(word => text.includes(word));
  }).sort((a, b) => {
    const byName = a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true });
    if (state.sort === 'nombre' || state.sort === 'nombre-desc') return (state.sort === 'nombre' ? byName : -byName) || a.id.localeCompare(b.id);
    const byDate = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return (state.sort === 'antiguos' ? byDate : -byDate) || byName || a.id.localeCompare(b.id);
  });
}

/** Export public catalog facts only; neutralize spreadsheet formulas in merchant text. */
export function catalogCsv(products: ProductDto[]): string {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const rows: Array<Array<string | number>> = [['Nombre', 'SKU', 'Tipo', 'Moneda', 'Precio', 'Stock', 'Disponible', 'Visible en tienda', 'Marca', 'Colecciones']];
  for (const p of products) rows.push([p.name, p.sku ?? '', p.kind === 'SERVICE' ? 'Servicio' : p.kind === 'DIGITAL' ? 'Digital' : 'Producto', p.currency, (p.basePriceCents / 100).toFixed(2), p.stockUnlimited ? 'Ilimitado' : p.stockQty ?? '', p.isAvailable ? 'Sí' : 'No', p.isPublishedOnStore ? 'Sí' : 'No', p.brand ?? '', p.categories.join(', ')]);
  return '\uFEFF' + rows.map(row => row.map(cell).join(',')).join('\r\n');
}

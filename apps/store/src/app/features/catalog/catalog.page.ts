import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
} from "@angular/router";
import type {
  PublicCatalogSelection,
  PublicProductList,
  PublicProductSort,
} from "@vendedoria/contracts";
import { DsIconComponent, DsSelectComponent } from "@vendedoria/ui";
import { CatalogFiltersComponent } from "../../components/catalog-filters.component";
import { ProductCardComponent } from "../../components/product-card.component";
import {
  catalogNoun,
  kindTab,
  visibleKindTabs,
} from "../../core/catalog-kinds";
import { catalogPriceCents, catalogSelections } from "../../core/catalog-query";
import { SeoService } from "../../core/seo.service";
import { StoreStateService } from "../../core/store-state.service";

const SORT_OPTIONS: Array<{ value: PublicProductSort; label: string }> = [
  { value: "featured", label: "Destacados" },
  { value: "newest", label: "Más recientes" },
  { value: "price-asc", label: "Precio: menor a mayor" },
  { value: "price-desc", label: "Precio: mayor a menor" },
];

@Component({
  selector: "store-catalog-page",
  imports: [
    DsSelectComponent,
    RouterLink,
    DsIconComponent,
    ProductCardComponent,
    CatalogFiltersComponent,
  ],
  templateUrl: "./catalog.page.html",
  styleUrl: "./catalog.page.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  private readonly router = inject(Router);
  private readonly seo = inject(SeoService);
  private readonly document = inject(DOCUMENT);
  private scrollLock: string | null = null;
  private readonly drawer = viewChild<ElementRef<HTMLDialogElement>>("drawer");
  readonly store = inject(StoreStateService).store;
  readonly sortOptions = SORT_OPTIONS;
  readonly loading = signal(false);
  readonly navigationError = signal(false);
  readonly skeletons = Array.from({ length: 8 }, (_, index) => index);
  readonly list = input.required<PublicProductList | null>();
  readonly categoria = input<string>();
  readonly q = input<string>();
  readonly orden = input<string>();
  readonly tipo = input<string>();
  readonly filtros = input<string>();
  readonly desde = input<string>();
  readonly hasta = input<string>();
  readonly porPagina = input<string>();
  readonly vista = input<string>();
  readonly pageSizes = [12, 24, 48];
  readonly pageSize = computed(() => this.list()?.pageSize ?? 24);
  readonly listView = computed(() => this.vista() === "lista");
  readonly selection = computed(() => catalogSelections(this.filtros()));
  readonly minCents = computed(() => catalogPriceCents(this.desde()));
  readonly maxCents = computed(() => catalogPriceCents(this.hasta()));
  readonly kindTabs = computed(() => visibleKindTabs(this.store()?.kinds));
  readonly activeKind = computed(() => kindTab(this.tipo()));
  readonly noun = computed(
    () => this.activeKind() ?? catalogNoun(this.store()?.kinds),
  );
  readonly sort = computed(
    () =>
      SORT_OPTIONS.find((option) => option.value === this.orden())?.value ??
      "featured",
  );
  readonly totalPages = computed(() =>
    Math.max(
      1,
      Math.ceil((this.list()?.total ?? 0) / (this.list()?.pageSize ?? 24)),
    ),
  );
  readonly heading = computed(() =>
    this.q()
      ? "Resultados para “" + this.q() + "”"
      : this.categoria()
          ?.split(/\s*[>/]\s*/)
          .at(-1) ||
        (this.activeKind()
          ? this.noun().label
          : this.store()?.template === "selecta"
            ? "Toda la selección"
            : "Nuestra tienda"),
  );
  readonly chips = computed(() => {
    const chips: Array<{ label: string; key: string; value?: string }> = [];
    if (this.q()) chips.push({ label: "Búsqueda: " + this.q(), key: "q" });
    if (this.categoria())
      chips.push({ label: this.categoria()!, key: "categoria" });
    if (this.activeKind())
      chips.push({ label: this.activeKind()!.label, key: "tipo" });
    for (const group of this.selection()) {
      const label =
        this.list()?.facets.groups.find((facet) => facet.key === group.key)
          ?.label ??
        (group.key === "brand"
          ? "Marca"
          : group.key === "benefit"
            ? "Beneficio"
            : group.key.split(":").slice(1).join(":"));
      for (const value of group.values)
        chips.push({ label: label + ": " + value, key: group.key, value });
    }
    const currency = this.list()?.facets.price?.currency ?? "";
    if (this.minCents() !== null)
      chips.push({
        label: "Desde " + currency + " " + (this.minCents()! / 100).toFixed(2),
        key: "desde",
      });
    if (this.maxCents() !== null)
      chips.push({
        label: "Hasta " + currency + " " + (this.maxCents()! / 100).toFixed(2),
        key: "hasta",
      });
    return chips;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.restoreScrolling());
    this.router.events.pipe(takeUntilDestroyed()).subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.loading.set(true);
        this.navigationError.set(false);
      }
      if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      )
        this.loading.set(false);
      if (event instanceof NavigationError) this.navigationError.set(true);
    });
    effect(() => {
      const params = new URLSearchParams();
      if (this.activeKind()) params.set("tipo", this.activeKind()!.param);
      if (this.categoria()) params.set("categoria", this.categoria()!);
      if ((this.list()?.page ?? 1) > 1)
        params.set("pagina", String(this.list()!.page));
      const query = params.toString();
      this.seo.set({
        title: this.heading(),
        description: this.categoria()
          ? this.categoria() +
            " en " +
            (this.store()?.displayName ?? "nuestra tienda") +
            "."
          : null,
        path: "/productos" + (query ? "?" + query : ""),
      });
    });
  }

  updateQuery(params: Record<string, string | number | null>): void {
    void this.router.navigate([], {
      queryParams: { ...params, pagina: null },
      queryParamsHandling: "merge",
    });
  }
  changeSort(value: string): void {
    this.updateQuery({ orden: value === "featured" ? null : value });
  }
  changePageSize(value: string): void {
    this.updateQuery({ porPagina: value === "24" ? null : value });
  }
  changeView(list: boolean): void {
    this.updateQuery({ vista: list ? "lista" : null });
  }
  searchCatalog(value: string): void {
    this.updateQuery({ q: value.trim().slice(0, 80) || null });
  }
  changeSelection(selection: PublicCatalogSelection[]): void {
    this.updateQuery({
      filtros: selection.length ? JSON.stringify(selection) : null,
    });
  }
  changePrice(price: { min: number | null; max: number | null }): void {
    this.updateQuery({
      desde: price.min === null ? null : (price.min / 100).toFixed(2),
      hasta: price.max === null ? null : (price.max / 100).toFixed(2),
    });
  }
  removeChip(chip: { key: string; value?: string }): void {
    if (!chip.value) {
      this.updateQuery({ [chip.key]: null });
      return;
    }
    this.changeSelection(
      this.selection()
        .map((group) =>
          group.key === chip.key
            ? {
                ...group,
                values: group.values.filter((value) => value !== chip.value),
              }
            : group,
        )
        .filter((group) => group.values.length),
    );
  }
  clearFilters(): void {
    this.updateQuery({
      q: null,
      categoria: null,
      tipo: null,
      filtros: null,
      desde: null,
      hasta: null,
    });
  }
  retry(): void {
    void this.router.navigateByUrl(this.router.url, {
      onSameUrlNavigation: "reload",
    });
  }
  openDrawer(): void {
    const drawer = this.drawer()?.nativeElement;
    if (!drawer || drawer.open) return;
    drawer.showModal();
    this.scrollLock = this.document.body.style.overflow;
    this.document.body.style.overflow = "hidden";
  }
  closeDrawer(): void {
    this.drawer()?.nativeElement.close();
    this.restoreScrolling();
  }
  restoreScrolling(): void {
    if (this.scrollLock === null) return;
    this.document.body.style.overflow = this.scrollLock;
    this.scrollLock = null;
  }
  closeBackdrop(event: MouseEvent): void {
    if (event.target !== event.currentTarget) return;
    const bounds = this.drawer()?.nativeElement.getBoundingClientRect();
    if (
      bounds &&
      (event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom)
    )
      this.closeDrawer();
  }
}

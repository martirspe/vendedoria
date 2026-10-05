import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import type {
  PublicCatalogCard,
  PublicCatalogSelection,
  PublicProductCard,
} from "@vendedoria/contracts";
import { DsIconComponent, DsSelectComponent } from "@vendedoria/ui";
import { CartService } from "../core/cart.service";
import { StoreStateService } from "../core/store-state.service";
import { MoneyPipe } from "../core/money.pipe";
import { serviceSummary } from "../core/service-info";

@Component({
  selector: "store-product-card",
  imports: [RouterLink, DsIconComponent, DsSelectComponent, MoneyPipe],
  templateUrl: "./product-card.component.html",
  styleUrl: "./product-card.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductCardComponent {
  readonly product = input.required<PublicProductCard>();
  readonly purchase = input<PublicCatalogCard | null>(null);
  readonly selection = input<PublicCatalogSelection[]>([]);
  readonly listView = input(false);
  readonly options = computed(() => {
    const groups = this.selection().filter((group) =>
      group.key.startsWith("variant:"),
    );
    const matches = (variant: PublicCatalogCard["variants"][number]) =>
      groups.every((group) =>
        variant.options.some(
          (option) =>
            option.name === group.key.slice(8) &&
            group.values.includes(option.value),
        ),
      );
    return [...(this.purchase()?.variants ?? [])].sort(
      (a, b) => Number(matches(b)) - Number(matches(a)),
    );
  });
  readonly cart = inject(CartService);
  private readonly router = inject(Router);
  private readonly store = inject(StoreStateService).store;
  readonly added = signal(false);
  readonly secondaryReady = signal(false);
  readonly online = computed(() => this.store()?.checkout.mode === "online");
  readonly variantId = linkedSignal(() => {
    // A concrete option is chosen explicitly; discovery keeps its displayed minimum price.
    this.purchase();
    return "";
  });
  readonly variant = computed(
    () =>
      this.purchase()?.variants.find(
        (variant) => variant.id === this.variantId(),
      ) ?? null,
  );
  readonly priceCents = computed(
    () => this.variant()?.priceCents ?? this.product().priceCents,
  );
  readonly imageUrl = computed(
    () => this.variant()?.imageUrl ?? this.product().imageUrl,
  );
  readonly canAdd = computed(
    () =>
      !!this.purchase() &&
      this.product().isAvailable &&
      (!this.product().hasVariants || !!this.variant()?.isAvailable) &&
      this.cart.ready(),
  );

  readonly service = computed(() => serviceSummary(this.product().service));

  readonly discount = computed(() => {
    const p = this.product();
    return p.compareAtPriceCents && p.compareAtPriceCents > this.priceCents()
      ? Math.round((1 - this.priceCents() / p.compareAtPriceCents) * 100)
      : 0;
  });

  selectVariant(id: string): void {
    this.variantId.set(id);
    this.added.set(false);
  }

  addToCart(): void {
    if (!this.canAdd()) return;
    const p = this.product();
    const variant = this.variant();
    this.cart.add(
      {
        handle: p.handle,
        name: p.name,
        variantId: variant?.id ?? null,
        variantLabel: variant?.label ?? null,
        unitCents: this.priceCents(),
        currency: p.currency,
        imageUrl: this.imageUrl(),
        isService: p.kind === "SERVICE",
        isDigital: p.kind === "DIGITAL",
      },
      1,
      this.purchase()?.stockLeft ?? 99,
    );
    this.added.set(true);
  }

  buyNow(): void {
    if (!this.canAdd() || !this.online()) return;
    this.addToCart();
    void this.router.navigate(["/checkout"]);
  }
}

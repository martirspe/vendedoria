import {
  ChangeDetectionStrategy,
  Component,
  afterNextRender,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from "@angular/core";
import { RouterLink } from "@angular/router";
import type {
  PublicProductCard,
  StoreRecommendations,
} from "@vendedoria/contracts";
import { CartService } from "../core/cart.service";
import { ConversionSession } from "../core/conversion-session.service";
import { MoneyPipe } from "../core/money.pipe";
import { StoreApiService } from "../core/store-api.service";
import { StoreStateService } from "../core/store-state.service";
import { computed } from "@angular/core";

@Component({
  selector: "store-recommendations",
  imports: [RouterLink, MoneyPipe],
  templateUrl: "./recommendations.component.html",
  styleUrl: "./recommendations.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RecommendationsComponent {
  readonly handles = input<string[]>([]);
  readonly context = input<"product" | "cart" | "checkout">("cart");
  readonly disabled = input(false);
  readonly addToCart = input(true);
  readonly selected = output<PublicProductCard>();
  readonly session = inject(ConversionSession);
  private readonly api = inject(StoreApiService);
  private readonly cart = inject(CartService);
  private readonly store = inject(StoreStateService).store;
  readonly missingForFree = computed(() => {
    const store = this.store();
    const minimum = store?.shipping.freeShippingFromCents;
    if (
      this.context() !== "cart" ||
      !this.cart.needsDelivery() ||
      !minimum ||
      !store.shipping.options.some((option) => option.mode !== "PICKUP")
    )
      return 0;
    return Math.max(0, minimum - this.cart.subtotalCents());
  });
  readonly result = signal<StoreRecommendations>({ items: [] });
  readonly status = signal<"idle" | "loading" | "ready" | "error">("idle");
  readonly adding = signal<string | null>(null);
  readonly feedback = signal("");
  private readonly rendered = signal(false);
  private request = 0;
  constructor() {
    afterNextRender(() => {
      this.session.init();
      this.rendered.set(true);
    });
    effect(() => {
      const handles = this.handles();
      const context = this.context();
      const session = this.session.personalizedSession();
      if (!this.rendered()) return;
      untracked(() => {
        void this.load(handles, context, session);
      });
    });
    effect(() => {
      if (!this.rendered() || !this.session.consent()) return;
      const handles = this.handles();
      const kind = this.context() === "product" ? "VIEW" : "CART";
      untracked(() => {
        for (const handle of handles.slice(0, 5))
          void this.session.record(handle, kind);
      });
    });
  }
  private async load(
    handles: string[],
    context: "product" | "cart" | "checkout",
    session?: string,
  ): Promise<void> {
    const request = ++this.request;
    this.status.set("loading");
    try {
      const result = await this.api.recommendations(handles, context, session);
      if (request !== this.request) return;
      this.result.set(result);
      this.status.set("ready");
    } catch {
      if (request === this.request) this.status.set("error");
    }
  }
  retry(): void {
    void this.load(
      this.handles(),
      this.context(),
      this.session.personalizedSession(),
    );
  }
  async add(product: PublicProductCard): Promise<void> {
    if (this.adding() || this.disabled()) return;
    this.adding.set(product.handle);
    this.feedback.set("");
    try {
      const current = await this.api.product(product.handle);
      if (!current?.isAvailable || current.hasVariants)
        throw new Error("Unavailable");
      if (this.disabled()) return;
      if (this.addToCart())
        this.cart.add(
          {
            handle: current.handle,
            name: current.name,
            variantId: null,
            variantLabel: null,
            unitCents: current.priceCents,
            currency: current.currency,
            imageUrl: current.imageUrl,
            isService: current.kind === "SERVICE",
            isDigital: current.kind === "DIGITAL",
          },
          1,
          20,
        );
      this.selected.emit(current);
      this.feedback.set(
        this.addToCart()
          ? `${current.name} se agregó a tu selección.`
          : "Revisa tu selección y el total actualizado antes de pagar.",
      );
      void this.session.record(current.handle, "CART");
    } catch {
      this.feedback.set(
        "Este producto cambió. Revisa su detalle antes de agregarlo.",
      );
    } finally {
      this.adding.set(null);
    }
  }
}

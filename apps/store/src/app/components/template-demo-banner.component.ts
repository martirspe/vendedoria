import { ChangeDetectionStrategy, Component, DOCUMENT, inject } from "@angular/core";
import { Router, RouterLink } from "@angular/router";
import { TemplateDemo } from "../core/template-demo";
import { CartService } from "../core/cart.service";

@Component({
  selector: "store-template-demo-banner",
  imports: [RouterLink],
  templateUrl: "./template-demo-banner.component.html",
  styleUrl: "./template-demo-banner.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TemplateDemoBannerComponent {
  readonly demo = inject(TemplateDemo);
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  constructor() {
    if (!this.demo.active) return;
    const document = inject(DOCUMENT);
    const icon = document.createElement('link');
    icon.rel = 'icon';
    icon.href = '/template-demos/favicon.svg';
    document.head.appendChild(icon);
  }

  async previewPayment(): Promise<void> {
    if (!this.demo.template || !this.cart.ready()) return;
    if (!this.cart.lines().length) {
      const { demoProducts } = await import("../demos/template-demo-data");
      const p = demoProducts(this.demo.template)[0];
      const variant = p.variants[0];
      await this.cart.add(
        {
          handle: p.handle,
          name: p.name,
          variantId: variant?.id ?? null,
          variantLabel: variant?.label ?? null,
          unitCents: variant?.priceCents ?? p.priceCents,
          currency: p.currency,
          imageUrl: p.imageUrl,
        },
        1,
      );
    }
    void this.router.navigate(["/checkout"]);
  }
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PublicProductDetails } from '@vendedoria/contracts';

/** Merchant-written product sheet: specifications, contents, policies and questions. */
@Component({
  selector: 'store-product-facts',
  templateUrl: './product-facts.component.html',
  styleUrl: './product-facts.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductFactsComponent {
  readonly details = input.required<PublicProductDetails>();
  readonly isService = input(false);
  /** Size, benefits, usage and notes; off for templates that already render them. */
  readonly showBasics = input(true);

  readonly hasContent = computed(() => {
    const d = this.details();
    const basics =
      this.showBasics() && Boolean(d.size || d.benefits.length || d.usage.length || d.notes.length);
    return (
      basics ||
      Boolean(
        d.audience ||
          d.attributes.length ||
          d.contents.length ||
          d.requirements.length ||
          d.coverage ||
          d.warranty ||
          d.cancellation ||
          d.faqs.length || d.useCases.length || d.exclusions.length || d.compatibility.length ||
          d.returns || d.digitalFormat || d.license || d.accessDuration,
      )
    );
  });
}

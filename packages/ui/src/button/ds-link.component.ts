import { ChangeDetectionStrategy, Component, input } from "@angular/core";
import type { DsButtonVariant } from "./ds-button.component";

/** Native navigation with the shared action appearance, without a nested button. */
@Component({
  selector: "a[dsLink]",
  template: "<ng-content />",
  styleUrl: "./ds-button.scss",
  host: {
    class: "ds-button",
    "[class.ds-button--primary]": "variant() === 'primary'",
    "[class.ds-button--secondary]": "variant() === 'secondary'",
    "[class.ds-button--ghost]": "variant() === 'ghost'",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsLinkComponent {
  readonly variant = input<Exclude<DsButtonVariant, "danger">>("primary");
}

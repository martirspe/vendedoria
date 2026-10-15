import { ChangeDetectionStrategy, Component, input } from "@angular/core";

export type DsButtonVariant = "primary" | "secondary" | "ghost" | "danger";

@Component({
  selector: "ds-button",
  standalone: true,
  template: `
    <button
      class="ds-button"
      [class.ds-button--primary]="variant() === 'primary'"
      [class.ds-button--secondary]="variant() === 'secondary'"
      [class.ds-button--ghost]="variant() === 'ghost'"
      [class.ds-button--danger]="variant() === 'danger'"
      [class.ds-button--block]="block()"
      [disabled]="disabled()"
      [attr.type]="type()"
      [attr.form]="form()"
      [attr.aria-label]="label()"
      [attr.aria-pressed]="pressed()"
    >
      <ng-content />
    </button>
  `,
  host: { "[class.ds-button-host--block]": "block()" },
  styleUrl: "./ds-button.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsButtonComponent {
  readonly variant = input<DsButtonVariant>("primary");
  readonly disabled = input(false);
  /** Stretches the button to the width of its container. */
  readonly block = input(false);
  /** Accessible name for icon-only buttons. */
  readonly label = input<string | null>(null);
  /** Native toggle state; null keeps ordinary buttons free of aria-pressed. */
  readonly pressed = input<boolean | null>(null);
  readonly type = input<"button" | "submit" | "reset">("button");
  /** Associates the native button with a form outside its ancestor tree. */
  readonly form = input<string | null>(null);
}

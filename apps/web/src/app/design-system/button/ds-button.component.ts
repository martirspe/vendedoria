import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

export type DsButtonVariant = 'primary' | 'secondary' | 'ghost';

@Component({
  selector: 'ds-button',
  standalone: true,
  template: `
    <button
      class="ds-button"
      [class.ds-button--primary]="variant() === 'primary'"
      [class.ds-button--secondary]="variant() === 'secondary'"
      [class.ds-button--ghost]="variant() === 'ghost'"
      [disabled]="disabled()"
      [attr.type]="type()"
    >
      <ng-content />
    </button>
  `,
  styles: `
    .ds-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: var(--ds-touch-target);
      padding: 0 var(--ds-space-5);
      border-radius: 999px;
      border: 1px solid transparent;
      cursor: pointer;
      font-weight: 700;
      letter-spacing: 0.01em;
      transition:
        transform var(--ds-motion-fast) var(--ds-ease-out),
        background-color var(--ds-motion-fast) var(--ds-ease-out),
        border-color var(--ds-motion-fast) var(--ds-ease-out);
    }

    .ds-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .ds-button--primary {
      background: var(--ds-color-primary);
      color: var(--ds-color-ink);
    }

    .ds-button--secondary {
      background: var(--ds-color-surface);
      border-color: var(--ds-color-border);
      color: var(--ds-color-text-primary);
    }

    .ds-button--ghost {
      background: transparent;
      color: var(--ds-color-text-secondary);
    }

    .ds-button:not(:disabled):hover {
      transform: translateY(-1px);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsButtonComponent {
  readonly variant = input<DsButtonVariant>('primary');
  readonly disabled = input(false);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
}

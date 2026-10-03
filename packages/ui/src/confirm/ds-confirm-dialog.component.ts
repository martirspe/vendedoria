import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  inject,
  viewChild,
} from '@angular/core';
import { DsButtonComponent } from '../button/ds-button.component';
import { DsIconComponent } from '../icon/ds-icon.component';
import { DsConfirmService } from './ds-confirm.service';

@Component({
  selector: 'ds-confirm-dialog',
  standalone: true,
  imports: [DsButtonComponent, DsIconComponent],
  template: `
    @if (confirm.request(); as request) {
      <dialog
        #dialog
        class="ds-confirm"
        [class.ds-confirm--danger]="request.tone === 'danger'"
        aria-labelledby="ds-confirm-title"
        aria-describedby="ds-confirm-message"
        (cancel)="dismiss($event)"
        (click)="onBackdrop($event)"
      >
        <div class="ds-confirm__panel">
          <span class="ds-confirm__icon">
            <ds-icon [name]="request.tone === 'danger' ? 'alert' : 'circleHelp'" />
          </span>
          <div class="ds-confirm__copy">
            <h2 id="ds-confirm-title">{{ request.title }}</h2>
            <p id="ds-confirm-message">{{ request.message }}</p>
          </div>
          <div class="ds-confirm__actions">
            <ds-button variant="secondary" [block]="true" (click)="settle(false)">
              {{ request.cancelLabel ?? 'Cancelar' }}
            </ds-button>
            <ds-button
              [variant]="request.tone === 'danger' ? 'danger' : 'primary'"
              [block]="true"
              (click)="settle(true)"
            >
              {{ request.confirmLabel }}
            </ds-button>
          </div>
        </div>
      </dialog>
    }
  `,
  styles: `
    .ds-confirm {
      width: min(28rem, calc(100% - 2 * var(--ds-space-4)));
      max-width: none;
      padding: 0;
      border: 0;
      border-radius: var(--ds-radius-lg);
      background: var(--ds-color-surface);
      color: var(--ds-color-text-primary);
      font-family: var(--ds-font-ui);
      animation: ds-confirm-rise var(--ds-motion-base) var(--ds-ease-out);
    }

    .ds-confirm::backdrop {
      background: var(--ds-color-overlay);
    }

    .ds-confirm__panel {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--ds-space-4);
      padding: var(--ds-space-6);
    }

    .ds-confirm__icon {
      display: grid;
      place-items: center;
      width: var(--ds-touch-target);
      height: var(--ds-touch-target);
      border-radius: 999px;
      background: color-mix(in srgb, var(--ds-color-info) 12%, var(--ds-color-surface));
      color: var(--ds-color-info);
    }

    .ds-confirm--danger .ds-confirm__icon {
      background: color-mix(in srgb, var(--ds-color-danger) 12%, var(--ds-color-surface));
      color: var(--ds-color-danger);
    }

    .ds-confirm__copy h2 {
      margin: var(--ds-space-2) 0 0;
      font-size: 1.125rem;
      letter-spacing: -0.02em;
    }

    .ds-confirm__copy p {
      margin: var(--ds-space-2) 0 0;
      color: var(--ds-color-text-secondary);
      line-height: 1.5;
    }

    .ds-confirm__actions {
      grid-column: 1 / -1;
      display: flex;
      justify-content: flex-end;
      gap: var(--ds-space-2);
    }

    @media (max-width: 30rem) {
      .ds-confirm__panel {
        grid-template-columns: 1fr;
      }

      .ds-confirm__actions {
        flex-direction: column-reverse;
      }
    }

    @keyframes ds-confirm-rise {
      from {
        opacity: 0;
        transform: translateY(0.5rem) scale(0.98);
      }
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsConfirmDialogComponent {
  protected readonly confirm = inject(DsConfirmService);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });
  }

  protected settle(confirmed: boolean): void {
    this.dialog()?.nativeElement.close();
    this.confirm.settle(confirmed);
  }

  protected dismiss(event: Event): void {
    event.preventDefault();
    this.settle(false);
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target === event.currentTarget) this.settle(false);
  }
}

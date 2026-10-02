import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ds-empty-state',
  standalone: true,
  template: `
    <div class="ds-empty" role="status">
      <h2 class="ds-empty__title">{{ title() }}</h2>
      <p class="ds-empty__body">{{ body() }}</p>
      <div class="ds-empty__actions">
        <ng-content />
      </div>
    </div>
  `,
  styles: `
    .ds-empty__actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ds-space-3);
      margin-top: var(--ds-space-2);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsEmptyStateComponent {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
}

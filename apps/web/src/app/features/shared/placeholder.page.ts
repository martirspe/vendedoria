import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DsEmptyStateComponent } from '../../design-system/empty-state/ds-empty-state.component';

@Component({
  selector: 'app-placeholder-page',
  standalone: true,
  imports: [DsEmptyStateComponent],
  template: `
    <section>
      <h1>{{ title() }}</h1>
      <ds-empty-state [title]="emptyTitle()" [body]="emptyBody()" />
    </section>
  `,
  styles: `
    section {
      display: grid;
      gap: var(--ds-space-6);
    }
    h1 {
      margin: 0;
      font-size: 1.75rem;
      letter-spacing: -0.03em;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PlaceholderPage {
  readonly title = input('Consola');
  readonly emptyTitle = input('Próximamente');
  readonly emptyBody = input(
    'Esta superficie está definida en la constitución y se implementará en el siguiente slice.',
  );
}

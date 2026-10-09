import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DsIconComponent } from '../icon/ds-icon.component';

/** Native disclosure provides keyboard, expanded state and SSR support. */
@Component({
  selector: 'ds-disclosure',
  imports: [DsIconComponent],
  templateUrl: './ds-disclosure.component.html',
  styleUrl: './ds-disclosure.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsDisclosureComponent {
  readonly title = input.required<string>();
  readonly group = input<string | null>(null);
}

import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';
import { DsIconComponent } from '../icon/ds-icon.component';

/** Projects a native checkbox, preserving Angular forms and browser interaction. */
@Component({
  selector: 'ds-checkbox',
  imports: [DsIconComponent],
  templateUrl: './ds-checkbox.component.html',
  styleUrl: './ds-checkbox.component.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsCheckboxComponent {
  readonly variant = input<'panel' | 'inline'>('panel');
  readonly description = input('');
}

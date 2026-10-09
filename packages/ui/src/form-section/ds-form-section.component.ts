import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DsIconComponent, type DsIconName } from '../icon/ds-icon.component';

@Component({
  selector: 'ds-form-section',
  imports: [DsIconComponent],
  templateUrl: './ds-form-section.component.html',
  styleUrl: './ds-form-section.component.scss',
  host: { '[class.ds-form-section--plain]': 'variant() === "plain"', '[class.ds-form-section--compact]': 'density() === "compact"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsFormSectionComponent {
  readonly title = input.required<string>();
  readonly description = input('');
  readonly icon = input<DsIconName | null>(null);
  readonly variant = input<'panel' | 'plain'>('panel');
  readonly density = input<'comfortable' | 'compact'>('comfortable');
}

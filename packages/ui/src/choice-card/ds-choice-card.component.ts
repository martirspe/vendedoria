import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { DsIconComponent, type DsIconName } from '../icon/ds-icon.component';

@Component({
  selector: 'ds-choice-card',
  imports: [DsIconComponent],
  templateUrl: './ds-choice-card.component.html',
  styleUrl: './ds-choice-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsChoiceCardComponent {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input.required<DsIconName>();
  readonly disabled = input(false);
  readonly density = input<'comfortable' | 'compact'>('comfortable');
  readonly activate = output<void>();
}

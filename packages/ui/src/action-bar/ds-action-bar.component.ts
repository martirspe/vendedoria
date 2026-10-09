import { ChangeDetectionStrategy, Component, input, ViewEncapsulation } from '@angular/core';

/** A shared sticky container; projected actions keep their native form semantics. */
@Component({
  selector: 'ds-action-bar',
  templateUrl: './ds-action-bar.component.html',
  styleUrl: './ds-action-bar.component.scss',
  encapsulation: ViewEncapsulation.None,
  host: { '[class.ds-action-bar--bottom]': 'placement() === "bottom"' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsActionBarComponent {
  readonly placement = input<'top' | 'bottom'>('top');
  readonly label = input('Acciones de esta vista');
}

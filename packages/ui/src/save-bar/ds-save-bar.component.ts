import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DsButtonComponent } from '../button/ds-button.component';
import { DsActionBarComponent } from '../action-bar/ds-action-bar.component';

@Component({
  selector: 'ds-save-bar',
  imports: [DsButtonComponent, DsActionBarComponent],
  templateUrl: './ds-save-bar.component.html',
  styleUrl: './ds-save-bar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsSaveBarComponent {
  readonly pending = input(false);
  readonly busy = input(false);
  readonly disabled = input(false);
  readonly label = input('Guardar cambios');
  readonly pendingText = input('Cambios sin guardar');
}

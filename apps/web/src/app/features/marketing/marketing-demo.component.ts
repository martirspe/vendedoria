import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';

@Component({
  selector: 'app-marketing-demo',
  imports: [DsButtonComponent, DsIconComponent],
  templateUrl: './marketing-demo.component.html',
  styleUrl: './marketing-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingDemoComponent {
  readonly demoStage = signal<'recommend' | 'checkout' | 'handoff'>('recommend');
}

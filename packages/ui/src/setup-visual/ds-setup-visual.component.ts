import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { DsIconComponent, DsIconName } from '../icon/ds-icon.component';

type SetupKind = 'seller' | 'product' | 'channel' | 'chat' | 'order';
const SETUP_VISUALS: Record<SetupKind, { icon: DsIconName; label: string }> = {
  seller: { icon: 'bot', label: 'Vendedor IA' },
  product: { icon: 'package', label: 'Tu catálogo' },
  channel: { icon: 'whatsapp', label: 'Tus canales' },
  chat: { icon: 'message', label: 'Conversaciones' },
  order: { icon: 'shoppingBag', label: 'Tus pedidos' },
};

/** Decorative product diagrams, independent of merchant content and theme renderer. */
@Component({
  selector: 'ds-setup-visual',
  imports: [DsIconComponent],
  template: `
    <div class="visual" aria-hidden="true">
      <div class="visual__sheet visual__sheet--back"><span></span><span></span><span></span></div>
      <div class="visual__sheet visual__sheet--side"><ds-icon [name]="visual().icon" [size]="2" /></div>
      <div class="visual__front">
        <span class="visual__brand"><ds-icon name="sparkles" [size]="0.85" /> VendedorIA</span>
        <span class="visual__icon"><ds-icon [name]="visual().icon" [size]="2.6" /></span>
        <span class="visual__label">{{ visual().label }}</span>
      </div>
      <span class="visual__signal"><ds-icon [name]="complete() ? 'check' : 'plus'" [size]="1.1" /></span>
    </div>
  `,
  styleUrl: './ds-setup-visual.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsSetupVisualComponent {
  readonly kind = input.required<SetupKind>();
  readonly complete = input(false);
  protected readonly visual = computed(() => SETUP_VISUALS[this.kind()]);
}

import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';
import { DsIconComponent, DsIconName } from '@vendedoria/ui';

export type SelectaIconName =
  | 'bag'
  | 'arrow'
  | 'back'
  | 'truck'
  | 'store'
  | 'shield'
  | 'card'
  | 'check'
  | 'plus'
  | 'minus'
  | 'close'
  | 'next'
  | 'prev'
  | 'lock'
  | 'search'
  | 'package'
  | 'trash'
  | 'success'
  | 'alert'
  | 'external'
  | 'up'
  | 'book'
  | 'print'
  | 'coupon'
  | 'whatsapp';

const NAMES: Record<SelectaIconName, DsIconName> = {
  bag: 'shoppingBag',
  arrow: 'arrowRight',
  back: 'arrowLeft',
  truck: 'truck',
  store: 'store',
  shield: 'shieldCheck',
  card: 'creditCard',
  check: 'check',
  plus: 'plus',
  minus: 'minus',
  close: 'x',
  next: 'chevronRight',
  prev: 'chevronLeft',
  lock: 'lockKeyhole',
  search: 'search',
  package: 'package',
  trash: 'trash',
  success: 'circleCheck',
  alert: 'circleAlert',
  external: 'externalLink',
  up: 'arrowUp',
  book: 'bookOpen',
  print: 'printer',
  coupon: 'ticketPercent',
  whatsapp: 'whatsapp',
};

/** Selecta icon: the stylesheet sizes `app-icon svg`; the 24px attributes are only the fallback. */
@Component({
  selector: 'app-icon',
  imports: [DsIconComponent],
  templateUrl: './selecta-icon.html',
  styleUrl: './selecta-icon.scss',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaIcon {
  readonly name = input.required<SelectaIconName>();
  readonly icon = computed(() => NAMES[this.name()]);
}

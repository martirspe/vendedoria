import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconBook,
  IconBrandWhatsappFilled,
  IconBroadcast,
  IconBuildingStore,
  IconChartBar,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronUp,
  IconCircleCheck,
  IconCommand,
  IconCreditCard,
  IconExternalLink,
  IconEye,
  IconFileText,
  IconHelpCircle,
  IconLayoutKanban,
  IconList,
  IconLock,
  IconLockSquareRounded,
  IconLogout,
  IconMail,
  IconMenu2,
  IconMessage,
  IconMinus,
  IconNotebook,
  IconPackage,
  IconPhoto,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlug,
  IconPlus,
  IconPrinter,
  IconRobot,
  IconRocket,
  IconRosetteDiscount,
  IconSearch,
  IconSend,
  IconSettings,
  IconShieldCheck,
  IconShoppingBag,
  IconSparkles,
  IconTicket,
  IconTrash,
  IconTruck,
  IconUpload,
  IconWallet,
  IconX,
  TablerIconComponent,
} from '@tabler/icons-angular';

/** Design System icon names mapped to Tabler Icons (the only icon source). */
export const DS_ICONS = {
  sparkles: IconSparkles,
  message: IconMessage,
  arrowRight: IconArrowRight,
  radio: IconBroadcast,
  bot: IconRobot,
  search: IconSearch,
  alert: IconAlertTriangle,
  check: IconCheck,
  send: IconSend,
  pause: IconPlayerPause,
  play: IconPlayerPlay,
  list: IconList,
  kanban: IconLayoutKanban,
  package: IconPackage,
  upload: IconUpload,
  image: IconPhoto,
  x: IconX,
  plus: IconPlus,
  book: IconNotebook,
  rocket: IconRocket,
  shoppingBag: IconShoppingBag,
  chartColumn: IconChartBar,
  plug: IconPlug,
  creditCard: IconCreditCard,
  settings: IconSettings,
  logOut: IconLogout,
  circleHelp: IconHelpCircle,
  command: IconCommand,
  minus: IconMinus,
  trash: IconTrash,
  arrowLeft: IconArrowLeft,
  chevronLeft: IconChevronLeft,
  chevronRight: IconChevronRight,
  menu: IconMenu2,
  store: IconBuildingStore,
  externalLink: IconExternalLink,
  eye: IconEye,
  mail: IconMail,
  wallet: IconWallet,
  ticket: IconTicket,
  truck: IconTruck,
  fileText: IconFileText,
  lock: IconLock,
  lockKeyhole: IconLockSquareRounded,
  chevronUp: IconChevronUp,
  chevronDown: IconChevronDown,
  arrowUp: IconArrowUp,
  shieldCheck: IconShieldCheck,
  circleCheck: IconCircleCheck,
  circleAlert: IconAlertCircle,
  ticketPercent: IconRosetteDiscount,
  bookOpen: IconBook,
  printer: IconPrinter,
  whatsapp: IconBrandWhatsappFilled,
} as const;

export type DsIconName = keyof typeof DS_ICONS;

@Component({
  selector: 'ds-icon',
  standalone: true,
  imports: [TablerIconComponent],
  template: `
    <tabler-icon
      [icon]="icon()"
      [size]="size() * 16"
      [stroke]="1.8"
      svgClass="ds-icon"
      [svgAttributes]="{ 'aria-hidden': 'true' }"
    />
  `,
  styles: `
    ds-icon > tabler-icon {
      display: contents;
    }
    .ds-icon {
      display: block;
      flex-shrink: 0;
    }
  `,
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsIconComponent {
  readonly name = input.required<DsIconName>();
  /** Icon box size in rem (default ~1.25). */
  readonly size = input(1.25);

  readonly icon = computed(() => DS_ICONS[this.name()]);
}

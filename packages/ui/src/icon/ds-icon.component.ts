import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import {
  LucideArrowLeft,
  LucideArrowRight,
  LucideArrowUp,
  LucideBookOpen,
  LucideBot,
  LucideChartColumn,
  LucideCheck,
  LucideChevronDown,
  LucideChevronLeft,
  LucideChevronRight,
  LucideChevronUp,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideCircleQuestionMark,
  LucideCommand,
  LucideCreditCard,
  LucideDynamicIcon,
  LucideExternalLink,
  LucideEye,
  LucideEyeOff,
  LucideFileText,
  LucideIcon,
  LucideImage,
  LucideList,
  LucideLock,
  LucideLockKeyhole,
  LucideLogOut,
  LucideMail,
  LucideMenu,
  LucideMessageCircle,
  LucideMinus,
  LucideNotebookText,
  LucidePackage,
  LucidePause,
  LucidePlay,
  LucidePlug,
  LucidePlus,
  LucidePrinter,
  LucideRadio,
  LucideRocket,
  LucideSearch,
  LucideSend,
  LucideSettings,
  LucideShieldCheck,
  LucideShoppingBag,
  LucideSparkles,
  LucideSquareKanban,
  LucideStore,
  LucideTicket,
  LucideTicketPercent,
  LucideTrash,
  LucideTriangleAlert,
  LucideTruck,
  LucideUpload,
  LucideUserRound,
  LucideWallet,
  LucideX,
} from '@lucide/angular';

/** Design System icon names mapped to Lucide icons (the only UI icon source). */
export const DS_ICONS = {
  sparkles: LucideSparkles,
  message: LucideMessageCircle,
  arrowRight: LucideArrowRight,
  radio: LucideRadio,
  bot: LucideBot,
  search: LucideSearch,
  alert: LucideTriangleAlert,
  check: LucideCheck,
  send: LucideSend,
  pause: LucidePause,
  play: LucidePlay,
  list: LucideList,
  kanban: LucideSquareKanban,
  package: LucidePackage,
  upload: LucideUpload,
  image: LucideImage,
  x: LucideX,
  plus: LucidePlus,
  book: LucideNotebookText,
  rocket: LucideRocket,
  shoppingBag: LucideShoppingBag,
  chartColumn: LucideChartColumn,
  plug: LucidePlug,
  creditCard: LucideCreditCard,
  settings: LucideSettings,
  logOut: LucideLogOut,
  circleHelp: LucideCircleQuestionMark,
  command: LucideCommand,
  minus: LucideMinus,
  trash: LucideTrash,
  arrowLeft: LucideArrowLeft,
  chevronLeft: LucideChevronLeft,
  chevronRight: LucideChevronRight,
  menu: LucideMenu,
  store: LucideStore,
  externalLink: LucideExternalLink,
  eye: LucideEye,
  eyeOff: LucideEyeOff,
  mail: LucideMail,
  wallet: LucideWallet,
  ticket: LucideTicket,
  truck: LucideTruck,
  fileText: LucideFileText,
  lock: LucideLock,
  lockKeyhole: LucideLockKeyhole,
  chevronUp: LucideChevronUp,
  chevronDown: LucideChevronDown,
  arrowUp: LucideArrowUp,
  shieldCheck: LucideShieldCheck,
  circleCheck: LucideCircleCheck,
  circleAlert: LucideCircleAlert,
  ticketPercent: LucideTicketPercent,
  bookOpen: LucideBookOpen,
  printer: LucidePrinter,
  user: LucideUserRound,
} as const satisfies Record<string, LucideIcon>;

/**
 * Official brand glyphs (single filled path on a 24×24 viewBox). Lucide ships no
 * brand logos; keep the paths unmodified from each brand's published asset.
 */
export const DS_BRAND_ICONS = {
  whatsapp:
    'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z',
} as const;

export type DsUiIconName = keyof typeof DS_ICONS;
export type DsBrandIconName = keyof typeof DS_BRAND_ICONS;
export type DsIconName = DsUiIconName | DsBrandIconName;

function isBrandIcon(name: DsIconName): name is DsBrandIconName {
  return name in DS_BRAND_ICONS;
}

@Component({
  selector: 'ds-icon',
  standalone: true,
  imports: [LucideDynamicIcon],
  template: `
    @if (brandPath(); as path) {
      <svg
        class="ds-icon ds-icon--brand"
        viewBox="0 0 24 24"
        fill="currentColor"
        [attr.width]="pixels()"
        [attr.height]="pixels()"
        aria-hidden="true"
        focusable="false"
      >
        <path [attr.d]="path" />
      </svg>
    } @else if (icon(); as icon) {
      <svg
        class="ds-icon"
        [lucideIcon]="icon"
        [size]="pixels()"
        [strokeWidth]="strokeWidth()"
      ></svg>
    }
  `,
  styles: `
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
  readonly strokeWidth = input(1.8);

  protected readonly pixels = computed(() => this.size() * 16);
  protected readonly brandPath = computed(() => {
    const name = this.name();
    return isBrandIcon(name) ? DS_BRAND_ICONS[name] : null;
  });
  protected readonly icon = computed(() => {
    const name = this.name();
    return isBrandIcon(name) ? null : DS_ICONS[name];
  });
}

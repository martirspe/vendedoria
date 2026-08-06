import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Lucide-inspired SVG registry for the Design System. */
const ICONS = {
  sparkles:
    'M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zm6 10l.75 2.25L21 16l-2.25.75L18 19l-.75-2.25L15 16l2.25-.75L18 13zM5 14l.75 2.25L8 17l-2.25.75L5 20l-.75-2.25L2 17l2.25-.75L5 14z',
  message: 'M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z',
  arrowRight: 'M5 12h14M13 5l7 7-7 7',
  radio: 'M4.9 19.1C1 15.2 1 8.8 4.9 4.9M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5m8.5 0c2.3 2.3 2.3 6.1 0 8.5M19.1 4.9C23 8.8 23 15.1 19.1 19M12 12h.01',
  bot: 'M12 8V4H8M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 0H8m12 4v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3',
  alert:
    'M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  check: 'M20 6 9 17l-5-5',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z',
  pause: 'M6 4h4v16H6zM14 4h4v16h-4z',
  play: 'M8 5v14l11-7z',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  kanban:
    'M6 5h4v14H6zM14 5h4v9h-4z',
  package:
    'M21 8l-9-5-9 5v8l9 5 9-5V8zm-9 5 9-5M12 13v8M3.5 8.5l8.5 4.5',
} as const;

export type DsIconName = keyof typeof ICONS;

@Component({
  selector: 'ds-icon',
  standalone: true,
  template: `
    <svg
      class="ds-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="path" />
    </svg>
  `,
  styles: `
    .ds-icon {
      width: 1.25rem;
      height: 1.25rem;
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsIconComponent {
  readonly name = input.required<DsIconName>();

  get path(): string {
    return ICONS[this.name()];
  }
}

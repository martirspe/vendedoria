import { afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';

/** Projected menu actions retain their real links and native button behavior. */
@Component({
  selector: 'ds-menu',
  standalone: true,
  templateUrl: './ds-menu.component.html',
  styleUrl: './ds-menu.component.scss',
  host: { '[attr.data-tone]': 'tone()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsMenuComponent {
  readonly label = input.required<string>();
  readonly menuId = input.required<string>();
  readonly tone = input<'surface' | 'navigation'>('surface');
  readonly mode = input<'menu' | 'panel'>('menu');
  readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const win = this.host.nativeElement.ownerDocument.defaultView;
      if (!win) return;
      const resize = () => this.close(false);
      const scroll = (event: Event) => { if (this.open() && !this.panel()?.contains(event.target as Node)) this.close(false); };
      win.addEventListener('resize', resize); win.addEventListener('scroll', scroll, true);
      destroy.onDestroy(() => { win.removeEventListener('resize', resize); win.removeEventListener('scroll', scroll, true); this.close(false); });
    });
  }

  private trigger() { return this.host.nativeElement.querySelector<HTMLButtonElement>('.ds-menu-trigger'); }
  private panel() { return this.host.nativeElement.querySelector<HTMLElement>('.ds-menu-panel'); }
  private actions() { return Array.from(this.panel()?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []).filter(e => !e.matches(':disabled') && e.getClientRects().length > 0); }
  private controls() { return Array.from(this.panel()?.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex="0"]') ?? []).filter(e => !e.matches(':disabled') && e.getClientRects().length > 0); }

  toggle() {
    if (this.open()) this.close(); else this.show();
  }

  private show(last = false) {
    const panel = this.panel();
    const trigger = this.trigger();
    const win = this.host.nativeElement.ownerDocument.defaultView;
    if (!panel || !trigger || !win) return;
    panel.showPopover();
    this.open.set(true);
    // Positioning is measured; visual decisions remain in semantic CSS tokens.
    const gap = parseFloat(win.getComputedStyle(panel).paddingLeft);
    const rect = trigger.getBoundingClientRect();
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(gap, Math.min(rect.left, win.innerWidth - bounds.width - gap))}px`;
    const top = this.mode() === 'panel' && rect.bottom + bounds.height + gap <= win.innerHeight
      ? rect.bottom + gap : rect.top - bounds.height - gap;
    panel.style.top = `${Math.max(gap, Math.min(top, win.innerHeight - bounds.height - gap))}px`;
    const targets = this.mode() === 'panel' ? this.controls() : this.actions();
    (last ? targets.at(-1) : targets[0])?.focus();
  }

  close(restore = true) {
    const panel = this.panel();
    if (panel?.matches(':popover-open')) panel.hidePopover();
    this.open.set(false);
    if (restore) this.trigger()?.focus({ preventScroll: true });
  }

  onToggle(event: Event) { this.open.set((event as ToggleEvent).newState === 'open'); }

  onTriggerKey(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); this.show(event.key === 'ArrowUp');
    }
  }

  onAction(event: MouseEvent) {
    if (this.mode() === 'menu' && (event.target as Element).closest('[role="menuitem"]')) this.close();
  }

  onPanelFocusOut(event: FocusEvent) {
    if (this.mode() !== 'panel' || !this.open()) return;
    const target = event.relatedTarget as Node | null;
    if (!target || (!this.panel()?.contains(target) && !this.trigger()?.contains(target))) this.close(false);
  }

  onMenuKey(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); return; }
    if (this.mode() === 'panel') return;
    if (event.key === 'Tab') { this.close(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const actions = this.actions();
    if (!actions.length) return;
    const index = actions.indexOf(this.host.nativeElement.ownerDocument.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1
      : (index + (event.key === 'ArrowDown' ? 1 : -1) + actions.length) % actions.length;
    actions[next]?.focus();
  }
}

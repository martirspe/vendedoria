import { afterEveryRender, afterNextRender, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, ViewEncapsulation } from '@angular/core';
import { DsIconComponent } from '../icon/ds-icon.component';

interface SelectOption { label: string; disabled: boolean; selected: boolean; group: string }
let nextSelectId = 0;

/** Enhances a projected single-select without replacing Angular's native value accessor. */
@Component({
  selector: 'ds-select',
  imports: [DsIconComponent],
  templateUrl: './ds-select.component.html',
  styleUrl: './ds-select.component.scss',
  host: { '[class.ds-select-enhanced]': 'enhanced()' },
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsSelectComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private native?: HTMLSelectElement;
  private originalTabIndex: string | null = null;
  private originalAriaHidden: string | null = null;
  private search = '';
  private searchTime = 0;
  readonly enhanced = signal(false);
  readonly options = signal<SelectOption[]>([]);
  readonly selectedLabel = signal('');
  readonly label = signal('');
  readonly disabled = signal(false);
  readonly invalid = signal(false);
  readonly describedBy = signal<string | null>(null);
  readonly required = signal(false);
  readonly open = signal(false);
  readonly active = signal(-1);
  readonly panelId = signal('');

  constructor() {
    afterEveryRender(() => this.sync());
    afterNextRender(() => {
      const select = this.host.nativeElement.querySelector('select');
      const win = this.host.nativeElement.ownerDocument.defaultView;
      if (!select || !win || select.multiple || select.size > 1) return;
      this.native = select;
      this.originalTabIndex = select.getAttribute('tabindex');
      this.originalAriaHidden = select.getAttribute('aria-hidden');
      this.panelId.set(`ds-select-options-${++nextSelectId}`);
      // Keep the usable native control on older browsers and mobile devices.
      const media = win.matchMedia('(max-width: 760px)');
      const adapt = () => {
        this.close();
        const enhance = !media.matches && typeof HTMLElement.prototype.showPopover === 'function';
        this.enhanced.set(enhance);
        if (enhance) { select.tabIndex = -1; select.setAttribute('aria-hidden', 'true'); }
        else {
          this.restoreAttribute('tabindex', this.originalTabIndex);
          this.restoreAttribute('aria-hidden', this.originalAriaHidden);
        }
        this.sync();
      };
      const onFocus = () => { if (this.enhanced()) this.trigger()?.focus(); };
      const closeOnScroll = (event: Event) => {
        if (this.open() && !this.panel()?.contains(event.target as Node)) this.positionPanel();
      };
      const observer = new MutationObserver(() => this.sync());
      observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true });
      select.addEventListener('focus', onFocus);
      select.addEventListener('change', this.sync);
      media.addEventListener('change', adapt);
      win.addEventListener('resize', this.close);
      win.addEventListener('scroll', closeOnScroll, true);
      this.destroy.onDestroy(() => {
        this.close(); observer.disconnect();
        select.removeEventListener('focus', onFocus);
        select.removeEventListener('change', this.sync);
        media.removeEventListener('change', adapt);
        win.removeEventListener('resize', this.close);
        win.removeEventListener('scroll', closeOnScroll, true);
      });
      adapt();
    });
  }

  private restoreAttribute(name: string, value: string | null) {
    if (value === null) this.native?.removeAttribute(name);
    else this.native?.setAttribute(name, value);
  }

  private trigger() { return this.host.nativeElement.querySelector<HTMLButtonElement>('.ds-select-trigger'); }
  private panel() { return this.host.nativeElement.querySelector<HTMLElement>('.ds-select-options'); }

  private readonly sync = () => {
    const native = this.native;
    if (!native) return;
    const options = Array.from(native.options, option => ({
      label: option.text, selected: option.selected,
      disabled: option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
      group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : '',
    }));
    if (JSON.stringify(options) !== JSON.stringify(this.options())) this.options.set(options);
    this.selectedLabel.set(native.selectedOptions[0]?.text ?? '');
    this.disabled.set(native.matches(':disabled'));
    this.invalid.set(native.getAttribute('aria-invalid') === 'true');
    this.required.set(native.required);
    this.describedBy.set(native.getAttribute('aria-describedby'));
    const labelledBy = native.getAttribute('aria-labelledby');
    const explicit = native.getAttribute('aria-label') || labelledBy?.split(/\s+/).map(id => native.ownerDocument.getElementById(id)?.textContent ?? '').join(' ');
    const labelCopy = native.labels?.[0]?.cloneNode(true) as HTMLElement | undefined;
    labelCopy?.querySelectorAll('ds-select, select, small, .hint, .field-error').forEach(node => node.remove());
    this.label.set((explicit || labelCopy?.textContent || native.title || native.name || 'Selecciona una opción').trim());
    if (this.disabled() && this.open()) this.close();
  };

  toggle(event: Event) {
    event.preventDefault(); event.stopPropagation();
    if (this.open()) this.close(); else this.show();
  }

  private show() {
    this.sync();
    if (this.disabled() || !this.enhanced()) return;
    const panel = this.panel(); const trigger = this.trigger();
    if (!panel || !trigger) return;
    this.positionPanel();
    const selected = this.options().findIndex(option => option.selected && !option.disabled);
    this.active.set(selected >= 0 ? selected : this.options().findIndex(option => !option.disabled));
    panel.showPopover(); this.open.set(true);
    this.scrollActive();
  }

  private positionPanel() {
    const panel = this.panel(); const trigger = this.trigger();
    const win = this.host.nativeElement.ownerDocument.defaultView;
    if (!panel || !trigger || !win) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.bottom <= 0 || rect.top >= win.innerHeight) { this.close(); return; }
    const gap = 8;
    const below = win.innerHeight - rect.bottom - gap * 2;
    const above = rect.top - gap * 2;
    const upward = below < 180 && above > below;
    const maxHeight = Math.min(320, Math.max(80, upward ? above : below));
    panel.style.width = `${Math.min(rect.width, win.innerWidth - gap * 2)}px`;
    panel.style.left = `${Math.max(gap, Math.min(rect.left, win.innerWidth - rect.width - gap))}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.top = upward ? 'auto' : `${rect.bottom + gap}px`;
    panel.style.bottom = upward ? `${win.innerHeight - rect.top + gap}px` : 'auto';
  }

  readonly close = () => {
    const panel = this.panel();
    if (panel?.matches(':popover-open')) panel.hidePopover();
    this.open.set(false);
  };

  onToggle(event: Event) {
    this.open.set((event as ToggleEvent).newState === 'open');
  }

  choose(index: number, event?: Event) {
    event?.preventDefault(); event?.stopPropagation();
    if (!this.native || this.disabled() || index < 0 || index >= this.options().length || this.options()[index].disabled) return;
    if (this.native.selectedIndex !== index) {
      this.native.selectedIndex = index;
      this.native.dispatchEvent(new Event('input', { bubbles: true }));
      this.native.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.sync(); this.close(); this.trigger()?.focus(); this.touch();
  }

  touch() { this.native?.dispatchEvent(new Event('blur')); }

  keydown(event: KeyboardEvent) {
    if (this.disabled()) return;
    if (event.key === 'Tab') { this.close(); return; }
    if (event.key === 'Escape') { event.preventDefault(); this.close(); return; }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (this.open()) this.choose(this.active()); else this.show();
      return;
    }
    const options = this.options();
    const enabled = options.map((option, index) => option.disabled ? -1 : index).filter(index => index >= 0);
    if (!enabled.length) return;
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      if (!this.open()) this.show();
      const position = enabled.indexOf(this.active());
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
        : Math.max(0, Math.min(enabled.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)));
      this.active.set(enabled[next]); this.scrollActive(); return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!this.open()) this.show();
      const now = Date.now();
      this.search = now - this.searchTime > 600 ? event.key : this.search + event.key;
      this.searchTime = now;
      const normalize = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
      const index = enabled.find(index => normalize(options[index].label).startsWith(normalize(this.search)));
      if (index !== undefined) { this.active.set(index); this.scrollActive(); }
    }
  }

  private scrollActive() {
    const panel = this.panel();
    const option = panel?.querySelector<HTMLElement>(`[data-option-index="${this.active()}"]`);
    if (!panel || !option) return;
    const top = option.offsetTop;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (top + option.offsetHeight > panel.scrollTop + panel.clientHeight) panel.scrollTop = top + option.offsetHeight - panel.clientHeight;
  }
}

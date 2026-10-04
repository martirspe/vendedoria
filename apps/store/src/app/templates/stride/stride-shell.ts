import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  DestroyRef,
  Renderer2,
  computed,
  inject,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { STORE_EDITOR } from '../../core/store-editor';
import { StoreStateService } from '../../core/store-state.service';
import { readableTextOn } from '../../core/theme';
import { StoreShellLayout } from '../../layout/store-shell.layout';

@Component({
  selector: 'stride-shell',
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    DsIconComponent,
    STORE_EDITOR,
  ],
  templateUrl: './stride-shell.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StrideShell extends StoreShellLayout {
  readonly hasAnnouncementOverride = computed(
    () =>
      this.store()?.templateContent.sections['announcement']?.['text'] !==
      undefined,
  );
  readonly primary = computed(
    () => this.store()?.templateContent.theme?.primary ?? '#181a18',
  );
  readonly accent = computed(
    () => this.store()?.templateContent.theme?.accent ?? '#c8f542',
  );
  readonly onPrimary = computed(() => readableTextOn(this.primary()));
  readonly onAccent = computed(() => readableTextOn(this.accent()));
  readonly freeShipping = computed(() => {
    const shipping = this.store()?.shipping;
    return shipping?.options.some((option) => option.mode !== 'PICKUP')
      ? shipping.freeShippingFromCents
      : null;
  });
  private readonly moneyState = inject(StoreStateService);

  constructor() {
    super();
    const document = inject(DOCUMENT);
    const renderer = inject(Renderer2);
    renderer.addClass(document.body, 'tpl-stride');
    if (!document.head.querySelector('link[href="/stride.css"]')) {
      const link = renderer.createElement('link') as HTMLLinkElement;
      renderer.setAttribute(link, 'rel', 'stylesheet');
      renderer.setAttribute(link, 'href', '/stride.css');
      renderer.appendChild(document.head, link);
    }
    inject(DestroyRef).onDestroy(() =>
      renderer.removeClass(document.body, 'tpl-stride'),
    );
  }

  money(cents: number): string {
    return this.moneyState.formatMoney(cents);
  }
}

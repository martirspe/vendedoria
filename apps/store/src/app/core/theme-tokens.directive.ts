import { Directive, ElementRef, Renderer2, RendererStyleFlags2, effect, inject } from '@angular/core';
import { StoreStateService } from './store-state.service';
import { storeTheme } from './theme';

/** Semantic tokens only. No merchant CSS or executable theme code is evaluated. */
@Directive({ selector: '[storeThemeTokens]' })
export class StoreThemeTokens {
  private readonly state = inject(StoreStateService);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly renderer = inject(Renderer2);
  private applied = new Set<string>();

  constructor() {
    effect(() => {
      const store = this.state.store();
      const theme = store ? storeTheme(store) : undefined;
      const styles: Record<string, string> = {};
      const colors = {
        background: ['--store-bg', '--cream'], surface: ['--store-surface'], text: ['--store-text', '--ink'],
        muted: ['--store-muted', '--muted'], border: ['--store-border', '--border'], accent: ['--green'],
      } as const;
      for (const [key, variables] of Object.entries(colors)) {
        const value = theme?.[key as keyof typeof colors];
        if (value && /^#[a-f0-9]{6}$/i.test(value)) for (const variable of variables) styles[variable] = value;
      }
      if (theme?.background) styles['background-color'] = 'var(--store-bg)';
      if (theme?.text) styles['color'] = 'var(--store-text)';
      if (theme?.container) styles['--store-max-width'] = `var(--store-theme-width-${theme.container})`;
      if (theme?.container) this.renderer.setAttribute(this.element, 'data-theme-container', theme.container);
      else this.renderer.removeAttribute(this.element, 'data-theme-container');
      if (theme?.surface) this.renderer.setAttribute(this.element, 'data-theme-surface', 'custom');
      else this.renderer.removeAttribute(this.element, 'data-theme-surface');
      if (theme?.spacing) styles['--store-section-space'] = `var(--store-theme-space-${theme.spacing})`;
      if (theme?.typeScale === 'large') {
        styles['--store-type-body'] = 'var(--store-theme-body-large)';
        styles['--store-type-caption'] = 'var(--store-theme-caption-large)';
        styles['font-size'] = 'var(--store-type-body)';
      }
      if (theme?.corners) {
        this.renderer.setAttribute(this.element, 'data-theme-corners', theme.corners);
        styles['--store-radius-control'] = `var(--store-theme-control-${theme.corners})`;
        styles['--store-radius-card'] = `var(--store-theme-card-${theme.corners})`;
      } else this.renderer.removeAttribute(this.element, 'data-theme-corners');
      for (const key of this.applied) if (!(key in styles)) this.renderer.removeStyle(this.element, key, RendererStyleFlags2.DashCase);
      for (const [key, value] of Object.entries(styles)) this.renderer.setStyle(this.element, key, value, RendererStyleFlags2.DashCase);
      this.applied = new Set(Object.keys(styles));
    });
  }
}

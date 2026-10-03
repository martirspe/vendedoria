import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  ElementRef,
  afterNextRender,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

type TurnstileApi = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
};

/** Must be loaded from this exact URL (Cloudflare forbids proxying or self-hosting it). */
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const DEFAULT_WAIT_MS = 15_000;

let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(doc: Document): Promise<TurnstileApi> {
  const win = doc.defaultView as (Window & { turnstile?: TurnstileApi }) | null;
  if (win?.turnstile) return Promise.resolve(win.turnstile);
  scriptLoad ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => (win?.turnstile ? resolve(win.turnstile) : reject(new Error('Turnstile unavailable')));
    script.onerror = () => {
      scriptLoad = null;
      script.remove();
      reject(new Error('Turnstile unavailable'));
    };
    doc.head.appendChild(script);
  });
  return scriptLoad;
}

/**
 * Cloudflare Turnstile widget (Managed mode, shown only when the visitor must interact).
 * Tokens are single-use and expire after 5 minutes: read one with `waitForToken()` right
 * before submitting and call `reset()` after every request, successful or not.
 */
@Component({
  selector: 'ds-turnstile',
  standalone: true,
  template: `
    <div #widget class="ds-turnstile__widget"></div>
    @if (failed()) {
      <p class="ds-turnstile__error" role="alert">
        No pudimos cargar la verificación de seguridad.
        <button type="button" class="ds-turnstile__retry" (click)="retry()">Reintentar</button>
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .ds-turnstile__error {
      margin: 0;
      font-size: 0.9rem;
      color: var(--store-danger, var(--ds-color-danger));
    }
    .ds-turnstile__retry {
      min-height: var(--ds-touch-target);
      padding: 0 var(--ds-space-2);
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 600;
      text-decoration: underline;
      cursor: pointer;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DsTurnstileComponent {
  readonly siteKey = input.required<string>();
  /** Must match the action the API expects for the endpoint (e.g. `login`, `checkout`). */
  readonly action = input.required<string>();
  readonly theme = input<'auto' | 'light' | 'dark'>('auto');

  readonly failed = signal(false);
  private readonly token = signal<string | null>(null);
  private readonly widget = viewChild.required<ElementRef<HTMLElement>>('widget');
  private readonly doc = inject(DOCUMENT);
  private api: TurnstileApi | null = null;
  private widgetId: string | null = null;
  private destroyed = false;
  private waiters: Array<(token: string | null) => void> = [];

  constructor() {
    afterNextRender(() => void this.render());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      this.flush(null);
      if (this.widgetId) this.api?.remove(this.widgetId);
    });
  }

  /** Current token, or the next one; `null` if none arrives in time (challenge pending or failed). */
  waitForToken(timeoutMs = DEFAULT_WAIT_MS): Promise<string | null> {
    const current = this.token();
    if (current) return Promise.resolve(current);
    return new Promise((resolve) => {
      const done = (token: string | null) => {
        clearTimeout(timer);
        resolve(token);
      };
      const timer = setTimeout(() => {
        this.waiters = this.waiters.filter((waiter) => waiter !== done);
        resolve(null);
      }, timeoutMs);
      this.waiters.push(done);
    });
  }

  /** Discards the used token and runs a fresh challenge. */
  reset(): void {
    this.token.set(null);
    if (this.widgetId) this.api?.reset(this.widgetId);
  }

  retry(): void {
    this.failed.set(false);
    if (this.widgetId) this.reset();
    else void this.render();
  }

  private async render(): Promise<void> {
    try {
      this.api = await loadTurnstile(this.doc);
    } catch {
      this.failed.set(true);
      return;
    }
    if (this.destroyed || this.widgetId) return;
    this.widgetId = this.api.render(this.widget().nativeElement, {
      sitekey: this.siteKey(),
      action: this.action(),
      theme: this.theme(),
      size: 'flexible',
      appearance: 'interaction-only',
      language: 'es',
      'refresh-expired': 'auto',
      'response-field': false,
      callback: (token: string) => {
        this.failed.set(false);
        this.token.set(token);
        this.flush(token);
      },
      'expired-callback': () => this.token.set(null),
      'timeout-callback': () => this.token.set(null),
      'error-callback': () => {
        this.token.set(null);
        this.failed.set(true);
      },
      'unsupported-callback': () => {
        this.failed.set(true);
        this.flush(null);
      },
    });
  }

  private flush(token: string | null): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const waiter of waiters) waiter(token);
  }
}

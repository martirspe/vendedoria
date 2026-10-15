import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import type { WhatsAppSignupSession } from '../../core/api/messaging-api.service';

type MetaSdk = {
  init(options: { appId: string; version: string; autoLogAppEvents: boolean; xfbml: boolean }): void;
  login(callback: (response: { authResponse?: { code?: string } }) => void, options: Record<string, unknown>): void;
};
type MetaWindow = Window & { FB?: MetaSdk };

@Injectable({ providedIn: 'root' })
export class MetaWhatsAppSignupService {
  private readonly document = inject(DOCUMENT);
  private readonly platform = inject(PLATFORM_ID);
  private loading: Promise<void> | null = null;
  private stopLogin: (() => void) | null = null;

  load(appId: string, version: string): Promise<void> {
    if (!isPlatformBrowser(this.platform)) return Promise.reject(new Error('Abre esta página en un navegador.'));
    if (this.loading) return this.loading;
    const browser = this.document.defaultView as MetaWindow;
    this.loading = new Promise<void>((resolve, reject) => {
      const initialize = () => {
        if (!browser.FB) { fail(); return; }
        browser.FB.init({ appId, version, autoLogAppEvents: false, xfbml: false });
        clearTimeout(timer);
        resolve();
      };
      const fail = () => {
        clearTimeout(timer);
        script?.remove();
        this.loading = null;
        reject(new Error('No pudimos cargar Meta. Revisa tu conexión y los bloqueadores del navegador.'));
      };
      const timer = setTimeout(fail, 15000);
      let script: HTMLScriptElement | null = null;
      if (browser.FB) { initialize(); return; }
      script = this.document.createElement('script');
      script.src = 'https://connect.facebook.net/es_LA/sdk.js';
      script.async = true;
      script.onload = initialize;
      script.onerror = fail;
      this.document.head.appendChild(script);
    });
    return this.loading;
  }

  login(session: WhatsAppSignupSession): Promise<string> {
    const browser = this.document.defaultView as MetaWindow;
    if (!browser.FB) return Promise.reject(new Error('Meta aún no está disponible. Vuelve a intentarlo.'));
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (code?: string, message?: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        browser.removeEventListener('message', onMessage);
        this.stopLogin = null;
        if (code) resolve(code);
        else reject(new Error(message || 'La autorización se canceló. Puedes volver a conectar WhatsApp.'));
      };
      const onMessage = (event: MessageEvent) => {
        if (!['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
        let data: { type?: string; event?: string };
        try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
        if (data?.type === 'WA_EMBEDDED_SIGNUP' && ['CANCEL', 'ERROR'].includes(data.event || '')) finish();
        // Asset IDs reported by the popup are never treated as proof of ownership.
      };
      const timer = setTimeout(() => finish(undefined, 'La autorización venció. Vuelve a conectar WhatsApp.'), 10 * 60 * 1000);
      this.stopLogin = () => finish();
      browser.addEventListener('message', onMessage);
      try {
        // Called directly from the user's click, with SDK and session preloaded.
        browser.FB!.login(response => finish(response.authResponse?.code), {
          config_id: session.configId, response_type: 'code', override_default_response_type: true,
          state: session.state, extras: { setup: {}, version: 'v4' },
        });
      } catch { finish(undefined, 'No pudimos abrir Meta. Permite las ventanas emergentes y vuelve a intentarlo.'); }
    });
  }

  cancel(): void { this.stopLogin?.(); }
}

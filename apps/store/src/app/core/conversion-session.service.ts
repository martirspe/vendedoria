import { isPlatformBrowser } from "@angular/common";
import {
  Injectable,
  PLATFORM_ID,
  computed,
  inject,
  signal,
} from "@angular/core";
import { StoreApiService } from "./store-api.service";
import { StoreStateService } from "./store-state.service";

/** Separate, explicit recommendation consent; contact is never used to identify browsing. */
@Injectable({ providedIn: "root" })
export class ConversionSession {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly api = inject(StoreApiService);
  private readonly state = inject(StoreStateService);
  readonly consent = signal(false);
  readonly sessionId = signal<string | undefined>(undefined);
  readonly recoverySessionId = signal<string | undefined>(undefined);
  readonly recoveryToken = signal<string | undefined>(undefined);
  readonly recoveryChannel = signal<"EMAIL" | "WHATSAPP">("EMAIL");
  readonly personalizedSession = computed(() =>
    this.consent() ? this.sessionId() : undefined,
  );
  private get key() {
    return `vendedoria-conversion:${this.state.store()?.slug ?? ""}`;
  }
  init(): void {
    if (!this.browser || this.sessionId()) return;
    let id: string | null = null;
    try {
      id = sessionStorage.getItem(`${this.key}:session`);
    } catch {
      /* Storage may be blocked. */
    }
    id = id && /^[0-9a-f-]{36}$/.test(id) ? id : crypto.randomUUID();
    this.sessionId.set(id);
    this.recoverySessionId.set(crypto.randomUUID());
    try {
      sessionStorage.setItem(`${this.key}:session`, id);
      this.recoverySessionId.set(
        sessionStorage.getItem(`${this.key}:recovery-session`) ||
          this.recoverySessionId(),
      );
      sessionStorage.setItem(
        `${this.key}:recovery-session`,
        this.recoverySessionId()!,
      );
      this.recoveryToken.set(
        sessionStorage.getItem(`${this.key}:recovery`) || undefined,
      );
      this.recoveryChannel.set(sessionStorage.getItem(`${this.key}:recovery-channel`) === "WHATSAPP" ? "WHATSAPP" : "EMAIL");
      this.consent.set(
        sessionStorage.getItem(`${this.key}:consent`) === "true",
      );
    } catch {
      /* The selection remains usable for this visit. */
    }
  }
  setConsent(allowed: boolean): void {
    this.init();
    this.consent.set(allowed);
    try {
      sessionStorage.setItem(`${this.key}:consent`, String(allowed));
    } catch {
      /* Optional storage. */
    }
    if (!allowed && this.sessionId())
      void this.api.forgetBehavior(this.sessionId()!).catch(() => undefined);
  }
  remember(token: string | undefined, channel?: "EMAIL" | "WHATSAPP"): void {
    this.recoveryToken.set(token);
    if (channel) this.recoveryChannel.set(channel);
    if (!token) this.recoverySessionId.set(crypto.randomUUID());
    try {
      if (token) {
        sessionStorage.setItem(`${this.key}:recovery`, token);
        sessionStorage.setItem(`${this.key}:recovery-channel`, this.recoveryChannel());
      }
      else {
        sessionStorage.removeItem(`${this.key}:recovery`);
        sessionStorage.setItem(
          `${this.key}:recovery-session`,
          this.recoverySessionId()!,
        );
      }
    } catch {
      /* Optional storage. */
    }
  }
  async record(handle: string, kind: "VIEW" | "CART"): Promise<void> {
    if (!this.consent() || !this.sessionId() || this.state.store()?.isPreview)
      return;
    try {
      await this.api.behavior(this.sessionId()!, handle, kind);
    } catch {
      /* Optional personalization does not block buying. */
    }
  }
  checkoutToken(): string | undefined {
    const token = this.recoveryToken();
    if (token && Number(token.split(".")[1]) <= Date.now()) {
      this.remember(undefined);
      return undefined;
    }
    return token;
  }
}

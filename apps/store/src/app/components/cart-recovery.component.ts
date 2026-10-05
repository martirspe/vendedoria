import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { FormsModule } from "@angular/forms";
import type { CheckoutItemInput, RecoveryOptions } from "@vendedoria/contracts";
import { DsTurnstileComponent } from "@vendedoria/ui";
import { CartService } from "../core/cart.service";
import { ConversionSession } from "../core/conversion-session.service";
import { StoreApiService } from "../core/store-api.service";
import { StoreStateService } from "../core/store-state.service";

@Component({
  selector: "store-cart-recovery",
  imports: [RouterLink, FormsModule, DsTurnstileComponent],
  templateUrl: "./cart-recovery.component.html",
  styleUrl: "./cart-recovery.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartRecoveryComponent {
  readonly captureEnabled = input(true);
  readonly disabled = input(false);
  readonly items = input<CheckoutItemInput[] | null>(null);
  readonly email = input("");
  readonly phone = input("");
  readonly cart = inject(CartService);
  readonly store = inject(StoreStateService).store;
  private readonly session = inject(ConversionSession);
  private readonly api = inject(StoreApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  private readonly turnstile = viewChild(DsTurnstileComponent);
  readonly selection = computed(
    () =>
      this.items() ??
      this.cart.lines().map((line) => ({
        handle: line.handle,
        quantity: Math.min(line.quantity, 20),
        ...(line.variantId ? { variantId: line.variantId } : {}),
      })),
  );
  readonly options = signal<RecoveryOptions | null>(null);
  readonly optedIn = signal(false);
  readonly expanded = signal(false);
  emailValue = "";
  phoneValue = "";
  emailConsent = false;
  whatsappConsent = false;

  open(): void {
    this.emailValue = this.email().trim();
    const phone = this.phone().replace(/\D/g, "");
    this.phoneValue = /^9\d{8}$/.test(phone) ? `+51${phone}` : this.phone();
    this.expanded.set(true);
  }
  readonly channel = signal<"EMAIL" | "WHATSAPP">("EMAIL");
  private readonly rendered = signal(false);
  readonly busy = signal(false);
  readonly feedback = signal("");
  readonly failed = signal(false);
  private saveTimer?: ReturnType<typeof setTimeout>;
  private lastAttempt = "";
  readonly channelLabel = computed(() => this.channel() === "EMAIL" ? "correo" : "WhatsApp");
  private contact() {
    if (this.expanded()) {
      const email = this.emailValue.trim().toLowerCase();
      const phone = this.phoneValue.replace(/[^\d+]/g, "");
      const emailConsent = Boolean(this.options()?.email && this.emailConsent);
      const whatsappConsent = Boolean(this.options()?.whatsapp && this.whatsappConsent);
      if ((!emailConsent && !whatsappConsent) || (emailConsent && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || (whatsappConsent && !/^\+\d{8,15}$/.test(phone))) return null;
      return { ...(emailConsent ? { email } : {}), ...(whatsappConsent ? { phone } : {}), emailConsent, whatsappConsent };
    }
    const email = this.email().trim().toLowerCase();
    const national = this.phone().replace(/\D/g, "");
    return this.channel() === "EMAIL"
      ? (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? { email } : null)
      : (/^9\d{8}$/.test(national) ? { phone: `+51${national}` } : null);
  }
  private fingerprint(): string {
    const contact = this.contact();
    return contact && this.selection().length
      ? JSON.stringify([this.channel(), contact, this.selection()]) : "";
  }
  private schedule(): void {
    clearTimeout(this.saveTimer);
    if (!this.optedIn() || this.disabled() || !this.captureEnabled()) return;
    const fingerprint = this.fingerprint();
    if (!fingerprint || fingerprint === this.lastAttempt) return;
    this.saveTimer = setTimeout(() => void this.save(), 2000);
  }
  constructor() {
    effect(() => {
      this.email(); this.phone(); this.selection(); this.channel();
      this.optedIn(); this.disabled(); this.captureEnabled();
      if (!this.rendered()) return;
      untracked(() => this.schedule());
    });
    afterNextRender(() => {
      this.session.init();
      this.channel.set(this.session.recoveryChannel());
      this.rendered.set(true);
      void this.restore();
      let lastActivity = Date.now();
      const touched = () => {
        lastActivity = Date.now();
      };
      const heartbeat = setInterval(() => {
        const token = this.session.recoveryToken();
        if (
          !token ||
          document.hidden ||
          Date.now() - lastActivity > 90_000 ||
          this.disabled() ||
          this.busy()
        )
          return;
        if (!this.selection().length) {
          void this.cancel();
          return;
        }
        void this.api
          .recoveryActivity(token, this.selection())
          .catch(() => undefined);
      }, 60_000);
      document.addEventListener("pointerdown", touched, { passive: true });
      document.addEventListener("keydown", touched);
      this.destroy.onDestroy(() => {
        clearInterval(heartbeat);
        clearTimeout(this.saveTimer);
        document.removeEventListener("pointerdown", touched);
        document.removeEventListener("keydown", touched);
      });
      if (!this.captureEnabled()) return;
      void this.loadOptions();
    });
  }
  async loadOptions(): Promise<void> {
    try {
      const options = await this.api.recoveryOptions();
      this.options.set(options);
      if (!options.email && options.whatsapp) this.channel.set("WHATSAPP");
    } catch {
      /* Optional reminders do not block checkout. */
    }
  }
  chooseChannel(value: string): void {
    if (value === "EMAIL" || value === "WHATSAPP") this.channel.set(value);
  }
  toggle(allowed: boolean): void {
    this.optedIn.set(allowed);
    this.feedback.set("");
    this.failed.set(false);
    if (!allowed) {
      clearTimeout(this.saveTimer);
      this.lastAttempt = "";
      void this.cancel();
    }
  }
  async save(force = false): Promise<void> {
    if (this.busy() || this.disabled() || (!this.optedIn() && !this.expanded())) return;
    const contact = this.contact();
    const fingerprint = this.fingerprint();
    if (!contact || !fingerprint) {
      this.failed.set(true);
      this.feedback.set("Elige un canal, acepta recibir recordatorios y completa un contacto válido.");
      return;
    }
    if (!force && fingerprint === this.lastAttempt) return;
    this.lastAttempt = fingerprint;
    this.failed.set(false);
    this.feedback.set("");
    this.busy.set(true);
    try {
      const savedToken = this.session.checkoutToken();
      const challenge = await this.turnstile()?.waitForToken();
      if (this.store()?.checkout.turnstileSiteKey && !challenge)
        throw new Error("Challenge");
      const saved = await this.api.captureRecovery(
        {
          sessionId: this.session.recoverySessionId()!,
          token: savedToken,
          items: this.selection(),
          emailConsent: this.channel() === "EMAIL",
          whatsappConsent: this.channel() === "WHATSAPP",
          ...contact,
        },
        challenge ?? undefined,
      );
      this.session.remember(saved.token, this.channel());
      this.feedback.set("Recordatorio activado.");
    } catch {
      this.failed.set(true);
      this.feedback.set(
        "No pudimos activar el recordatorio. Tu compra puede continuar.",
      );
    } finally {
      this.turnstile()?.reset();
      this.busy.set(false);
      this.schedule();
    }
  }
  async cancel(): Promise<void> {
    const token = this.session.recoveryToken();
    if (!token || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.revokeRecovery(token);
      this.session.remember(undefined);
      this.feedback.set("Ya no recibirás recordatorios de esta selección.");
      this.failed.set(false);
    } catch {
      this.feedback.set(
        "No pudimos cancelar los recordatorios. Inténtalo de nuevo.",
      );
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }
  readonly hasSaved = computed(() => Boolean(this.session.recoveryToken()));
  private async restore(): Promise<void> {
    const recover = this.route.snapshot.queryParamMap.get("recover");
    const stop = this.route.snapshot.queryParamMap.get("stop");
    if (!recover && !stop) return;
    // Remove the capability before navigation to product pages or third-party resources.
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { recover: null, stop: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
    this.busy.set(true);
    try {
      if (stop) {
        await this.api.revokeRecovery(stop);
        this.session.remember(undefined);
        this.feedback.set("Ya no recibirás recordatorios de esta selección.");
      } else {
        const restored = await this.api.restoreRecovery(recover!);
        this.cart.restore(restored.lines);
        this.session.remember(recover!);
        try {
          sessionStorage.removeItem("vendedoria-checkout-key");
        } catch {
          /* Storage may be blocked. */
        }
        this.feedback.set(
          restored.changed
            ? "Recuperamos los productos disponibles y ajustamos las cantidades al stock actual. Revisa tu carrito antes de pagar."
            : "Recuperamos tu selección con los precios actuales. Revisa tu carrito antes de pagar.",
        );
      }
      this.failed.set(false);
    } catch {
      this.failed.set(true);
      this.feedback.set(
        "Este enlace venció o ya no está disponible. Puedes armar una nueva selección desde el catálogo.",
      );
    } finally {
      this.busy.set(false);
    }
  }
}

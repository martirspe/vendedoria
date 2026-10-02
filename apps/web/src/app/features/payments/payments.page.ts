import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DsButtonComponent, DsIconComponent } from '@vendedoria/ui';
import {
  ConnectPaymentAccountPayload,
  PaymentAccountView,
  PaymentsApiService,
} from '../../core/api/payments-api.service';

const CREDENTIAL = /^(APP_USR|TEST)-[A-Za-z0-9-]{20,200}$/;

@Component({
  selector: 'app-payments-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './payments.page.html',
  styleUrls: ['../store/store.page.scss', './payments.page.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PaymentsPage {
  private readonly api = inject(PaymentsApiService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly copied = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly view = signal<PaymentAccountView | null>(null);

  readonly form = this.fb.nonNullable.group({
    liveMode: [false],
    publicKey: ['', [Validators.required, Validators.pattern(CREDENTIAL)]],
    accessToken: ['', [Validators.pattern(CREDENTIAL)]],
    webhookSecret: ['', [Validators.pattern(/^[A-Za-z0-9_-]{16,200}$/)]],
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      this.apply(await this.api.get());
    } catch {
      this.errorMessage.set('No pudimos cargar el estado de tus cobros.');
    } finally {
      this.loading.set(false);
    }
  }

  async save(): Promise<void> {
    const connected = this.view()?.connected ?? false;
    const values = this.form.getRawValue();
    if (!connected && !values.accessToken.trim()) {
      this.form.controls.accessToken.setErrors({ required: true });
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa los campos marcados.');
      return;
    }
    const payload: ConnectPaymentAccountPayload = {
      liveMode: values.liveMode,
      publicKey: values.publicKey.trim(),
      ...(values.accessToken.trim() ? { accessToken: values.accessToken.trim() } : {}),
      ...(values.webhookSecret.trim() ? { webhookSecret: values.webhookSecret.trim() } : {}),
    };
    this.saving.set(true);
    this.clearMessages();
    try {
      this.apply(await this.api.connect(payload));
      this.successMessage.set('Cuenta verificada con Mercado Pago.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo conectar la cuenta.'));
    } finally {
      this.saving.set(false);
    }
  }

  async disconnect(): Promise<void> {
    if (!confirm('¿Desconectar Mercado Pago? La tienda dejará de cobrar online.')) return;
    this.saving.set(true);
    this.clearMessages();
    try {
      this.apply(await this.api.disconnect());
      this.successMessage.set('Cuenta desconectada.');
    } catch (error) {
      this.errorMessage.set(this.messageFrom(error, 'No se pudo desconectar la cuenta.'));
    } finally {
      this.saving.set(false);
    }
  }

  async copyWebhook(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.errorMessage.set('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  private apply(view: PaymentAccountView): void {
    this.view.set(view);
    this.form.reset({
      liveMode: view.liveMode,
      publicKey: view.publicKey ?? '',
      accessToken: '',
      webhookSecret: '',
    });
  }

  private clearMessages(): void {
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 503].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

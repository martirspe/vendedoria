import { HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DsButtonComponent, DsIconComponent, DsTurnstileComponent } from '@vendedoria/ui';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { authErrorMessage, CHALLENGE_PENDING } from './auth-errors';
import { type FieldMessages, fieldError, focusFirstInvalid } from './auth-form';
import { AuthShellComponent } from './auth-shell.component';

type RegisterField = 'fullName' | 'businessName' | 'email' | 'password';

const FIELD_MESSAGES: Record<RegisterField, FieldMessages> = {
  fullName: { required: 'Ingresa tu nombre completo.', minlength: 'Ingresa tu nombre completo.' },
  businessName: {
    required: 'Ingresa el nombre de tu negocio.',
    minlength: 'El nombre del negocio debe tener al menos 2 caracteres.',
  },
  email: { required: 'Ingresa tu email.', email: 'Revisa el formato del email (ej. tu@negocio.com).' },
  password: { required: 'Crea una contraseña.', minlength: 'Usa al menos 8 caracteres.' },
};

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DsButtonComponent,
    DsIconComponent,
    DsTurnstileComponent,
    AuthShellComponent,
  ],
  templateUrl: './register.page.html',
  styleUrl: './auth-pages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly turnstile = viewChild(DsTurnstileComponent);

  readonly errorMessage = signal<string | null>(null);
  readonly emailTaken = signal(false);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly turnstileSiteKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    afterNextRender(async () => this.turnstileSiteKey.set(await this.authApi.turnstileSiteKey()));
  }

  error(field: RegisterField): string | null {
    return fieldError(this.form.controls[field], FIELD_MESSAGES[field]);
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host);
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);
    this.emailTaken.set(false);

    const widget = this.turnstile();
    try {
      const token = widget ? await widget.waitForToken() : undefined;
      if (token === null) {
        this.errorMessage.set(CHALLENGE_PENDING);
        return;
      }
      await this.authApi.register(this.form.getRawValue(), token);
      await this.router.navigateByUrl('/app/products');
    } catch (error) {
      const emailTaken =
        error instanceof HttpErrorResponse && error.status === 409;
      this.emailTaken.set(emailTaken);
      this.errorMessage.set(
        emailTaken
          ? 'Ya existe una cuenta con este email.'
          : authErrorMessage(error) ??
              'No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.',
      );
      widget?.reset();
    } finally {
      this.submitting.set(false);
    }
  }
}

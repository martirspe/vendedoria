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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DsButtonComponent, DsIconComponent, DsTurnstileComponent } from '@vendedoria/ui';
import { AuthApiService } from '../../core/auth/auth-api.service';
import { authErrorMessage, CHALLENGE_PENDING } from './auth-errors';
import { fieldError, focusFirstInvalid } from './auth-form';
import { AuthShellComponent } from './auth-shell.component';

const DEFAULT_REDIRECT = '/app/products';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DsButtonComponent,
    DsIconComponent,
    DsTurnstileComponent,
    AuthShellComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './auth-pages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly turnstile = viewChild(DsTurnstileComponent);

  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly turnstileSiteKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    afterNextRender(async () => this.turnstileSiteKey.set(await this.authApi.turnstileSiteKey()));
  }

  emailError(): string | null {
    return fieldError(this.form.controls.email, {
      required: 'Ingresa tu email.',
      email: 'Revisa el formato del email (ej. tu@negocio.com).',
    });
  }

  passwordError(): string | null {
    return fieldError(this.form.controls.password, {
      required: 'Ingresa tu contraseña.',
      minlength: 'La contraseña tiene al menos 8 caracteres.',
    });
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host);
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const widget = this.turnstile();
    try {
      const token = widget ? await widget.waitForToken() : undefined;
      if (token === null) {
        this.errorMessage.set(CHALLENGE_PENDING);
        return;
      }
      await this.authApi.login(this.form.getRawValue(), token);
      await this.router.navigateByUrl(this.redirectTarget());
    } catch (error) {
      this.errorMessage.set(
        authErrorMessage(error) ??
          (error instanceof HttpErrorResponse && error.status === 401
            ? 'Email o contraseña incorrectos.'
            : 'No pudimos iniciar sesión. Inténtalo de nuevo.'),
      );
      widget?.reset();
    } finally {
      this.submitting.set(false);
    }
  }

  /** Only console paths: an arbitrary `redirect` would turn sign-in into an open redirect. */
  private redirectTarget(): string {
    const target = this.route.snapshot.queryParamMap.get('redirect');
    return target && /^\/app(\/|\?|$)/.test(target) ? target : DEFAULT_REDIRECT;
  }
}

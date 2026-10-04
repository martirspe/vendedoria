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
import { messageFrom } from '../../core/api/api-error';
import { AuthApiService, InvitePreview } from '../../core/auth/auth-api.service';
import { authErrorMessage, CHALLENGE_PENDING } from './auth-errors';
import { LEGAL_LINKS } from '../legal/legal-identity';
import { type FieldMessages, TERMS_REQUIRED, fieldError, focusFirstInvalid } from './auth-form';
import { AuthShellComponent } from './auth-shell.component';

type InviteField = 'fullName' | 'password' | 'acceptTerms';

const FIELD_MESSAGES: Record<InviteField, FieldMessages> = {
  fullName: { required: 'Ingresa tu nombre completo.', minlength: 'Ingresa tu nombre completo.' },
  password: { required: 'Crea una contraseña.', minlength: 'Usa al menos 8 caracteres.' },
  acceptTerms: { required: TERMS_REQUIRED },
};

const ROLE_LABELS: Record<InvitePreview['role'], string> = {
  OWNER: 'dueño',
  ADMIN: 'administrador',
  AGENT: 'asesor',
};

@Component({
  selector: 'app-invite-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    DsButtonComponent,
    DsIconComponent,
    DsTurnstileComponent,
    AuthShellComponent,
  ],
  templateUrl: './invite.page.html',
  styleUrl: './auth-pages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvitePage {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly turnstile = viewChild(DsTurnstileComponent);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  readonly roleLabels = ROLE_LABELS;
  readonly loading = signal(true);
  readonly invalid = signal(false);
  readonly loadError = signal(false);
  readonly preview = signal<InvitePreview | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);
  readonly showPassword = signal(false);
  readonly turnstileSiteKey = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    acceptTerms: [false, Validators.requiredTrue],
  });
  readonly links = LEGAL_LINKS;

  constructor() {
    afterNextRender(async () => {
      void this.load();
      this.turnstileSiteKey.set(await this.authApi.turnstileSiteKey());
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(false);
    this.invalid.set(false);
    if (!/^[a-f0-9]{64}$/.test(this.token)) {
      this.invalid.set(true);
      this.loading.set(false);
      return;
    }
    try {
      this.preview.set(await this.authApi.previewInvite(this.token));
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 400 || status === 404) this.invalid.set(true);
      else this.loadError.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  error(field: InviteField): string | null {
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
    const widget = this.turnstile();
    try {
      const turnstileToken = widget ? await widget.waitForToken() : undefined;
      if (turnstileToken === null) {
        this.errorMessage.set(CHALLENGE_PENDING);
        return;
      }
      const { fullName, password, acceptTerms } = this.form.getRawValue();
      await this.authApi.acceptInvite(
        this.token,
        { fullName: fullName.trim(), password, acceptTerms },
        turnstileToken,
      );
      await this.router.navigateByUrl('/app/messages');
    } catch (error) {
      this.errorMessage.set(
        authErrorMessage(error) ?? messageFrom(error, 'No pudimos crear tu acceso. Inténtalo de nuevo.'),
      );
      widget?.reset();
    } finally {
      this.submitting.set(false);
    }
  }
}

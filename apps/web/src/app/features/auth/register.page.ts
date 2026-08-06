import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { AuthApiService } from '../../core/auth/auth-api.service';

@Component({
  selector: 'app-register-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, DsButtonComponent],
  templateUrl: './register.page.html',
  styleUrl: './auth-pages.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly authApi = inject(AuthApiService);
  private readonly router = inject(Router);

  readonly errorMessage = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    businessName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    try {
      await this.authApi.register(this.form.getRawValue());
      await this.router.navigateByUrl('/app/products');
    } catch {
      this.errorMessage.set(
        'No pudimos crear la cuenta. Revisa los datos e inténtalo de nuevo.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}

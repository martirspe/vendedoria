import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthApiService } from '../core/auth/auth-api.service';
import { DsButtonComponent } from '../design-system/button/ds-button.component';

@Component({
  selector: 'app-console-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, DsButtonComponent],
  templateUrl: './console-shell.layout.html',
  styleUrl: './console-shell.layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsoleShellLayout {
  private readonly auth = inject(AuthApiService);

  logout(): void {
    this.auth.logout();
    location.href = '/auth/login';
  }
}

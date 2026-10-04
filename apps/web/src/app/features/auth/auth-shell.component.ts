import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DsIconComponent } from '@vendedoria/ui';
import { LEGAL_LINKS, PLATFORM_LEGAL } from '../legal/legal-identity';

/** Centered card layout shared by the sign-in and sign-up pages. */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [DsIconComponent],
  templateUrl: './auth-shell.component.html',
  styleUrl: './auth-shell.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthShellComponent {
  readonly title = input.required<string>();
  readonly lead = input<string | null>(null);

  protected readonly year = new Date().getFullYear();
  protected readonly legal = PLATFORM_LEGAL;
  protected readonly links = LEGAL_LINKS;
}

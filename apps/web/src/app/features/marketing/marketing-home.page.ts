import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './marketing-home.page.html',
  styleUrl: './marketing-home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingHomePage {}

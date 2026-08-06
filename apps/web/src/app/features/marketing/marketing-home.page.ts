import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsIconComponent } from '../../design-system/icon/ds-icon.component';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [RouterLink, DsButtonComponent, DsIconComponent],
  templateUrl: './marketing-home.page.html',
  styleUrl: './marketing-home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingHomePage {}

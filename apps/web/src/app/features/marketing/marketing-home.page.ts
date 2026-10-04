import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { MarketingFeaturesComponent } from './marketing-features.component';
import { MarketingPricingComponent } from './marketing-pricing.component';

@Component({
  selector: 'app-marketing-home',
  standalone: true,
  imports: [
    RouterLink,
    DsButtonComponent,
    DsIconComponent,
    MarketingFeaturesComponent,
    MarketingPricingComponent,
  ],
  templateUrl: './marketing-home.page.html',
  styleUrl: './marketing-home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingHomePage {}

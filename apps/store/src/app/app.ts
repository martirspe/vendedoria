import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConsentBannerComponent } from './components/consent-banner.component';
import { rememberCampaignCoupon } from './core/campaign-coupon';

@Component({
  selector: 'store-root',
  imports: [RouterOutlet, ConsentBannerComponent],
  template: '<router-outlet /><store-consent-banner />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) rememberCampaignCoupon(window.location.search);
  }
}

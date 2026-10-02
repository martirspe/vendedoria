import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { rememberCampaignCoupon } from './core/campaign-coupon';

@Component({
  selector: 'store-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) rememberCampaignCoupon(window.location.search);
  }
}

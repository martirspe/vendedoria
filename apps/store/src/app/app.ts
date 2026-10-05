import { ChangeDetectionStrategy, Component, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { ConsentBannerComponent } from './components/consent-banner.component';
import { rememberCampaignCoupon } from './core/campaign-coupon';
import { TemplateDemoBannerComponent } from './components/template-demo-banner.component';
import { TemplateDemo } from './core/template-demo';

@Component({
  selector: 'store-root',
  imports: [RouterOutlet, ConsentBannerComponent, TemplateDemoBannerComponent],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID)) && !inject(TemplateDemo).active) rememberCampaignCoupon(window.location.search);
  }
}

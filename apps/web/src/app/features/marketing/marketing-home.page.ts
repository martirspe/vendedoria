import { ChangeDetectionStrategy, Component, OnDestroy } from '@angular/core';
import { DsIconComponent, DsLinkComponent } from '@vendedoria/ui';
import { MarketingDemoComponent } from './marketing-demo.component';
import { MarketingFeaturesComponent } from './marketing-features.component';
import { MarketingPricingComponent } from './marketing-pricing.component';
import { installMarketingSeo } from './marketing-seo';

@Component({
  selector: 'app-marketing-home',
  imports: [
    DsIconComponent,
    DsLinkComponent,
    MarketingDemoComponent,
    MarketingFeaturesComponent,
    MarketingPricingComponent,
  ],
  templateUrl: './marketing-home.page.html',
  styleUrl: './marketing-home.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingHomePage implements OnDestroy {
  private readonly removeSeo = installMarketingSeo();
  private menuCloseTimer: ReturnType<typeof setTimeout> | undefined;

  closeMobileMenu(menu: HTMLDetailsElement): void {
    // Keep the link rendered until the browser completes its native anchor navigation.
    clearTimeout(this.menuCloseTimer);
    this.menuCloseTimer = setTimeout(() => {
      menu.open = false;
    }, 0);
  }

  ngOnDestroy(): void {
    clearTimeout(this.menuCloseTimer);
    this.removeSeo();
  }
}

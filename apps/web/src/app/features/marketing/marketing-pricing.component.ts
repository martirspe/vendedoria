import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DsDisclosureComponent, DsIconComponent, DsLinkComponent } from '@vendedoria/ui';
import { LEGAL_LINKS, PLATFORM_LEGAL } from '../legal/legal-identity';
import { MARKETING_PLANS, MARKETING_QUESTIONS } from './marketing-content';

@Component({
  selector: 'app-marketing-pricing',
  imports: [RouterLink, DsDisclosureComponent, DsIconComponent, DsLinkComponent],
  templateUrl: './marketing-pricing.component.html',
  styleUrl: './marketing-pricing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MarketingPricingComponent {
  readonly plans = MARKETING_PLANS;
  readonly questions = MARKETING_QUESTIONS;
  readonly year = new Date().getFullYear();
  readonly legal = PLATFORM_LEGAL;
  readonly links = LEGAL_LINKS;
}

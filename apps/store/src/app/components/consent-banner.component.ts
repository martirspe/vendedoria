import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AnalyticsService } from '../core/analytics.service';

/** Cookie choice for stores with analytics; Accept and Reject carry the same weight. */
@Component({
  selector: 'store-consent-banner',
  imports: [RouterLink],
  templateUrl: './consent-banner.component.html',
  styleUrl: './consent-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConsentBannerComponent {
  readonly analytics = inject(AnalyticsService);

  constructor() {
    effect(() => {
      if (this.analytics.tracking()) untracked(() => this.analytics.init());
    });
  }
}

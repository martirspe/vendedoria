import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { StoreStateService } from '../core/store-state.service';
import { themeSocialLinks } from '../core/theme-navigation';

@Component({
  selector: 'store-social-links',
  templateUrl: './theme-social-links.component.html',
  styleUrl: './theme-social-links.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ThemeSocialLinksComponent {
  private readonly state = inject(StoreStateService);
  readonly links = computed(() => {
    const store = this.state.store();
    return store ? themeSocialLinks(store.templateContent) : [];
  });
}

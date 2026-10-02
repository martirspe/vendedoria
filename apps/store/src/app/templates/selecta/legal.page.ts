import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LegalPage } from '../../features/legal/legal.page';
import { SelectaIcon } from './selecta-icon';

/** Same legal documents as the classic store, with the Selecta layout. */
@Component({
  selector: 'selecta-legal',
  imports: [NgTemplateOutlet, RouterLink, SelectaIcon],
  templateUrl: './legal.page.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaLegalPage extends LegalPage {
  readonly others = computed(() => this.docs().filter((d) => d !== this.doc()));
}

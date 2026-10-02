import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { SeoService } from '../../core/seo.service';
import { StoreStateService } from '../../core/store-state.service';
import { Inline, legalDocs, legalUpdatedLabel } from './legal-content';
import type { LegalSlug } from './legal-slugs';

@Component({
  selector: 'store-legal-page',
  imports: [NgTemplateOutlet, RouterLink, DsIconComponent],
  templateUrl: './legal.page.html',
  styleUrl: './legal.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPage {
  private readonly slug = inject(ActivatedRoute).snapshot.data['slug'] as LegalSlug | undefined;
  readonly store = inject(StoreStateService).store;

  readonly docs = computed(() => {
    const store = this.store();
    return store ? legalDocs(store) : [];
  });
  readonly doc = computed(() => (this.slug ? this.docs().find((d) => d.slug === this.slug) ?? null : null));
  readonly updated = computed(() => {
    const store = this.store();
    return store ? legalUpdatedLabel(store) : '';
  });

  constructor() {
    const doc = this.doc();
    inject(SeoService).set(
      doc
        ? { title: doc.title, description: doc.description, path: `/${doc.slug}` }
        : { title: 'Centro legal', description: 'Términos, políticas y Libro de Reclamaciones de la tienda.', path: '/legal' },
    );
  }

  asObject(part: Inline) {
    return typeof part === 'string' ? null : part;
  }

  print(): void {
    window.print();
  }
}

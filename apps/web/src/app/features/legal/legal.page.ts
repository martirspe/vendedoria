import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DsIconComponent } from '@vendedoria/ui';
import { type Inline, LEGAL_DOCS, type LegalSlug, legalUpdatedLabel } from './legal-content';
import { PLATFORM_LEGAL } from './legal-identity';

@Component({
  selector: 'app-legal-page',
  standalone: true,
  imports: [NgTemplateOutlet, RouterLink, DsIconComponent],
  templateUrl: './legal.page.html',
  styleUrl: './legal.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LegalPage {
  private readonly slug = inject(ActivatedRoute).snapshot.data['slug'] as LegalSlug | undefined;

  readonly docs = LEGAL_DOCS;
  readonly doc = this.slug ? (LEGAL_DOCS.find((d) => d.slug === this.slug) ?? null) : null;
  readonly legal = PLATFORM_LEGAL;
  readonly updated = legalUpdatedLabel();
  readonly year = new Date().getFullYear();

  constructor() {
    const title = this.doc ? `${this.doc.title} · VendedorIA` : 'Centro legal · VendedorIA';
    const description =
      this.doc?.description ?? 'Términos, políticas y Libro de Reclamaciones de VendedorIA.';
    inject(Title).setTitle(title);
    inject(Meta).updateTag({ name: 'description', content: description });
  }

  asObject(part: Inline) {
    return typeof part === 'string' ? null : part;
  }

  print(): void {
    window.print();
  }
}

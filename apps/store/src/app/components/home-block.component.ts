import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StoreTemplateFaq } from '@vendedoria/contracts';
import { DsIconComponent } from '@vendedoria/ui';
import { STORE_EDITOR, StoreEditorBridge } from '../core/store-editor';
import type { HomeBlock } from '../core/store-layout';

export type SharedHomeBlockType = 'benefits' | 'testimonials' | 'whatsapp' | 'gallery' | 'cta' | 'questions';

const SHARED_TYPES: readonly string[] = ['benefits', 'testimonials', 'whatsapp', 'gallery', 'cta', 'questions'];

/** Library blocks with the same structure in every template; colors and fonts come from the theme. */
export function sharedBlockType(type: string): SharedHomeBlockType | null {
  return SHARED_TYPES.includes(type) ? (type as SharedHomeBlockType) : null;
}

@Component({
  selector: 'store-home-block',
  imports: [DsIconComponent, RouterLink, STORE_EDITOR],
  templateUrl: './home-block.component.html',
  styleUrl: './home-block.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomeBlockComponent {
  readonly editing = inject(StoreEditorBridge).active;
  readonly type = input.required<SharedHomeBlockType>();
  /** Content key of the block (`benefits-a1b2c3`). */
  readonly sectionId = input.required<string>();
  readonly block = input.required<HomeBlock>();
  /** Sales WhatsApp link; null when the store has no number. */
  readonly whatsappHref = input<string | null>(null);
  /** Questions and answers of a questions block: the merchant's own or the ones built from the settings. */
  readonly faq = input<StoreTemplateFaq[]>([]);
}

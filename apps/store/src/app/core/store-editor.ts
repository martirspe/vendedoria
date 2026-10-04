import {
  DOCUMENT,
  DestroyRef,
  Directive,
  ElementRef,
  Injectable,
  PLATFORM_ID,
  REQUEST_CONTEXT,
  TransferState,
  computed,
  effect,
  inject,
  input,
  makeStateKey,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import type {
  StoreEditorFrameMessage,
  StoreEditorHostMessage,
  StoreEditorPage,
  StoreTemplateContent,
  StoreTemplateFaq,
} from '@vendedoria/contracts';
import { StoreApiService } from './store-api.service';
import type { StoreRequestContext } from './store-context';
import { StoreStateService } from './store-state.service';

const EDITOR_ORIGIN = makeStateKey<string | null>('storeEditorOrigin');

type FrameMessage = StoreEditorFrameMessage extends infer M
  ? M extends { source: 'vendedoria-store' }
    ? Omit<M, 'source'>
    : never
  : never;

/** `hero.title` → ['hero', 'title']. */
function splitKey(key: string): [string, string] {
  const dot = key.indexOf('.');
  return [key.slice(0, dot), key.slice(dot + 1)];
}

/**
 * Edit mode of the store inside the console visual editor. Active only for signed editor requests
 * (`?editor=`) rendered as a preview and framed by the console origin; otherwise every method is a
 * no-op and the store renders exactly as buyers see it.
 */
@Injectable({ providedIn: 'root' })
export class StoreEditorBridge {
  private readonly state = inject(StoreStateService);
  private readonly api = inject(StoreApiService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly origin: string | null;
  private readonly values = new Map<string, string>();
  private faq: StoreTemplateFaq[] = [];
  private snapshotTimer: ReturnType<typeof setTimeout> | null = null;

  /** Section highlighted in the page, chosen here or from the console. */
  readonly selected = signal<string | null>(null);
  readonly active = computed(() => this.origin !== null && Boolean(this.state.store()?.isPreview));

  constructor() {
    const transfer = inject(TransferState);
    if (this.browser) {
      const origin = transfer.get(EDITOR_ORIGIN, null);
      const framed = typeof window !== 'undefined' && window.parent !== window;
      this.origin = origin && framed ? origin : null;
    } else {
      const context = inject(REQUEST_CONTEXT, { optional: true }) as StoreRequestContext | null;
      this.origin = context?.editorOrigin ?? null;
      transfer.set(EDITOR_ORIGIN, this.origin);
    }
    if (this.origin) {
      this.document.documentElement.classList.add('store-editing');
    }
    if (this.browser && this.origin) {
      window.addEventListener('message', this.onMessage);
      // Links and forms stay put: the editor edits this page, it does not browse the store.
      this.document.addEventListener('click', this.blockNavigation, true);
      this.document.addEventListener('submit', this.blockSubmit, true);
    }
  }

  /** Effective value of an editable field, reported to the console. */
  register(key: string, value: string | null): void {
    if (!this.browser || !this.origin) return;
    if (value === null) this.values.delete(key);
    else this.values.set(key, value);
    this.scheduleSnapshot();
  }

  registerFaq(faq: StoreTemplateFaq[]): void {
    if (!this.browser || !this.origin) return;
    this.faq = faq;
    this.scheduleSnapshot();
  }

  select(section: string, field: string | null): void {
    if (!this.active()) return;
    this.selected.set(section);
    this.post({ type: 'select', section, field });
  }

  input(key: string, value: string): void {
    const [section, field] = splitKey(key);
    this.post({ type: 'input', section, field, value });
  }

  /** Applies a finished inline edit locally so the page re-renders clean markup. */
  commit(key: string, value: string): void {
    const [section, field] = splitKey(key);
    this.state.store.update((store) => {
      if (!store) return store;
      const content = store.templateContent;
      const sections = { ...content.sections, [section]: { ...content.sections[section], [field]: value } };
      return { ...store, templateContent: { ...content, sections } };
    });
    this.post({ type: 'commit', section, field, value });
  }

  pickImage(key: string): void {
    const [section, field] = splitKey(key);
    this.select(section, field);
    this.post({ type: 'image', section, field });
  }

  private post(message: FrameMessage): void {
    if (!this.browser || !this.origin || !this.active()) return;
    window.parent.postMessage({ ...message, source: 'vendedoria-store' }, this.origin);
  }

  private scheduleSnapshot(): void {
    if (this.snapshotTimer) clearTimeout(this.snapshotTimer);
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      const sections = [...this.document.querySelectorAll<HTMLElement>('[data-store-section]')].map(
        (element) => element.dataset['storeSection'] ?? '',
      );
      this.post({
        type: 'snapshot',
        snapshot: { fields: Object.fromEntries(this.values), faq: this.faq, sections },
      });
    }, 60);
  }

  private readonly onMessage = (event: MessageEvent): void => {
    if (event.origin !== this.origin || event.source !== window.parent) return;
    const message = event.data as StoreEditorHostMessage | null;
    if (message?.source !== 'vendedoria-editor') return;
    if (message.type === 'content' && isContent(message.content)) {
      this.state.store.update((store) => (store ? { ...store, templateContent: message.content } : store));
      this.scheduleSnapshot();
    } else if (message.type === 'select') {
      this.selected.set(message.section);
      const section = message.section;
      void this.openPage(message.page).then(() => {
        // A block added a moment ago (or a page just opened) renders a moment later; wait for it.
        if (!section) return;
        setTimeout(() => {
          this.document
            .querySelector(`[data-store-section="${CSS.escape(section)}"]`)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      });
    }
  };

  /** Shows the page the console is editing; the product page uses the first product of the catalog. */
  private async openPage(page: StoreEditorPage | undefined): Promise<void> {
    const path = this.router.url.split(/[?#]/)[0];
    if (page === 'home' && path !== '/') {
      await this.router.navigateByUrl('/');
    } else if (page === 'product' && !path.startsWith('/producto/')) {
      const first = await this.api.products({ pageSize: 1 }).catch(() => null);
      const handle = first?.items[0]?.handle;
      if (handle) await this.router.navigate(['/producto', handle]);
    }
  }

  private readonly blockNavigation = (event: Event): void => {
    if ((event.target as Element | null)?.closest?.('a')) event.preventDefault();
  };

  private readonly blockSubmit = (event: Event): void => event.preventDefault();
}

function isContent(value: unknown): value is StoreTemplateContent {
  const content = value as StoreTemplateContent | null;
  return Boolean(content && typeof content === 'object' && content.sections && typeof content.sections === 'object');
}

/**
 * Text the merchant edits in place. The directive owns the element text (`textContent`), so
 * inline typing never fights Angular-rendered nodes; multiline texts keep their line breaks.
 */
@Directive({
  selector: '[storeEditText]',
  host: {
    '[textContent]': 'editValue()',
    '[class.store-edit-multiline]': "editKind() === 'multiline'",
    '[attr.data-edit]': 'bridge.active() ? storeEditText() : null',
    '[attr.data-placeholder]': 'bridge.active() ? editPlaceholder() : null',
    '[attr.contenteditable]': "bridge.active() ? 'plaintext-only' : null",
    '[attr.spellcheck]': 'bridge.active() ? true : null',
    '(focus)': 'onFocus()',
    '(click)': 'onClick($event)',
    '(input)': 'onInput()',
    '(keydown)': 'onKeydown($event)',
    '(blur)': 'onBlur()',
  },
})
export class StoreEditText {
  readonly bridge = inject(StoreEditorBridge);
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly storeEditText = input.required<string>();
  readonly editValue = input.required<string>();
  readonly editKind = input<'text' | 'multiline'>('text');
  /** Shown in the editor while the text is empty (hidden for buyers). */
  readonly editPlaceholder = input<string | null>(null);
  private original = '';

  constructor() {
    effect(() => this.bridge.register(this.storeEditText(), this.editValue()));
    inject(DestroyRef).onDestroy(() => this.bridge.register(this.storeEditText(), null));
  }

  onFocus(): void {
    if (!this.bridge.active()) return;
    this.original = this.editValue();
    this.bridge.select(...splitKey(this.storeEditText()));
  }

  onClick(event: Event): void {
    if (!this.bridge.active()) return;
    event.stopPropagation();
  }

  onInput(): void {
    if (this.bridge.active()) this.bridge.input(this.storeEditText(), this.read());
  }

  onKeydown(event: KeyboardEvent): void {
    if (!this.bridge.active()) return;
    if (event.key === 'Escape') {
      this.element.textContent = this.original;
      this.bridge.input(this.storeEditText(), this.original);
      this.element.blur();
    } else if (event.key === 'Enter' && this.editKind() === 'text') {
      event.preventDefault();
      this.element.blur();
    }
  }

  onBlur(): void {
    if (!this.bridge.active()) return;
    const value = this.read();
    if (value !== this.original) this.bridge.commit(this.storeEditText(), value);
    else this.element.textContent = value;
  }

  private read(): string {
    const text = this.element.innerText.replace(/\u00a0/g, ' ');
    return this.editKind() === 'text' ? text.replace(/\s*\n\s*/g, ' ') : text.replace(/\n+$/, '');
  }
}

/**
 * Image the merchant replaces from the console; a click asks the editor for a new file. Also used on
 * the editor-only placeholder of a block without image.
 */
@Directive({
  selector: '[storeEditImage]',
  host: {
    '[attr.data-edit]': 'bridge.active() ? storeEditImage() : null',
    '(click)': 'onClick($event)',
  },
})
export class StoreEditImage {
  readonly bridge = inject(StoreEditorBridge);
  readonly storeEditImage = input.required<string>();
  readonly editValue = input.required<string | null>();

  constructor() {
    effect(() => this.bridge.register(this.storeEditImage(), this.editValue() ?? ''));
    inject(DestroyRef).onDestroy(() => this.bridge.register(this.storeEditImage(), null));
  }

  onClick(event: Event): void {
    if (!this.bridge.active()) return;
    event.preventDefault();
    event.stopPropagation();
    this.bridge.pickImage(this.storeEditImage());
  }
}

/** Editable part of the page: a click selects it in the console inspector. */
@Directive({
  selector: '[storeSection]',
  host: {
    '[attr.data-store-section]': 'bridge.active() ? storeSection() : null',
    '[class.store-section-selected]': 'bridge.active() && bridge.selected() === storeSection()',
    '(click)': 'onClick()',
  },
})
export class StoreSection {
  readonly bridge = inject(StoreEditorBridge);
  readonly storeSection = input.required<string>();

  onClick(): void {
    this.bridge.select(this.storeSection(), null);
  }
}

export const STORE_EDITOR = [StoreEditText, StoreEditImage, StoreSection] as const;

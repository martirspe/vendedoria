import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import type {
  StoreEditorField,
  StoreEditorFrameMessage,
  StoreEditorHostMessage,
  StoreEditorPage as PreviewPage,
  StoreEditorSection,
  StoreEditorSnapshot,
  StoreLayoutItem,
  StoreTemplateContent,
  StoreTemplateFaq,
  StoreTemplateTheme,
  StoreThemeOption,
} from '@vendedoria/contracts';
import { DsButtonComponent, DsConfirmService, DsIconComponent } from '@vendedoria/ui';
import { CatalogApiService } from '../../core/api/catalog-api.service';
import {
  StoreApiService,
  StoreEditorState,
  StoreEditorVersion,
  StoreEditorView,
  StoreTextAiAction,
} from '../../core/api/store-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { resizeImage } from '../../core/media/resize-image';
import { IntegrationGateComponent } from '../integrations/integration-gate.component';
import {
  ContentHistory,
  MAX_BLOCKS,
  MAX_FAQ,
  THEME_COLORS,
  THEME_CORNERS,
  THEME_FONTS,
  addBlock,
  applyPage,
  canGenerateImage,
  clampValue,
  displayValue,
  fieldKey,
  isOverridden,
  isTextField,
  layoutOf,
  moveItem,
  newBlockId,
  removeBlock,
  sectionSchema,
  toggleHidden,
  typeOf,
  withFaq,
  withField,
  withLayout,
  withTheme,
  withoutField,
} from './template-editor';

const SAVE_DELAY_MS = 1200;
const HEX_COLOR = /^#[0-9a-f]{6}$/;
/** Upload target of the logo, which lives in the theme instead of a section. */
const THEME_TARGET = '@theme';
const FRAME_TIMEOUT_MS = 20_000;
const NOTICE_MS = 4000;

type SaveState = 'saved' | 'pending' | 'saving' | 'error';
type Device = 'desktop' | 'mobile';

/** A section as the panel lists it: `id` is the content key (`hero`, `text-a1b2c3`). */
type PanelSection = Pick<StoreEditorSection, 'label' | 'fields' | 'faq' | 'role' | 'canHide' | 'description'> & {
  id: string;
  hidden: boolean;
  /** Page the preview opens to show it; null for parts of every page. */
  page: PreviewPage | null;
};

const AI_ACTIONS: { id: StoreTextAiAction; label: string }[] = [
  { id: 'write', label: 'Escribir' },
  { id: 'shorter', label: 'Más corto' },
  { id: 'persuasive', label: 'Más vendedor' },
  { id: 'friendly', label: 'Más cercano' },
  { id: 'fix', label: 'Corregir' },
];

const DATE_FORMAT = new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

/** `datetime-local` value (local time, minutes) of a date. */
function localInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function panelSection(section: StoreEditorSection, id: string, label: string, hidden: boolean): PanelSection {
  const { fields, faq, role, canHide, description } = section;
  const page = role === 'fixed' ? (section.page ?? null) : 'home';
  return { id, label, fields, faq, role, canHide, description, hidden, page };
}

@Component({
  selector: 'app-store-editor-page',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet, DsButtonComponent, DsIconComponent, IntegrationGateComponent],
  templateUrl: './store-editor.page.html',
  styleUrls: [
    './store-editor.panel.scss',
    './store-editor.versions.scss',
    './store-editor.ai.scss',
    './store-editor.page.scss',
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:message)': 'onMessage($event)', '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class StoreEditorPage {
  private readonly api = inject(StoreApiService);
  private readonly catalog = inject(CatalogApiService);
  private readonly integrations = inject(IntegrationsStateService);
  private readonly confirmDialog = inject(DsConfirmService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly frame = viewChild<ElementRef<HTMLIFrameElement>>('frame');
  private readonly filePicker = viewChild<ElementRef<HTMLInputElement>>('filePicker');
  private readonly history = new ContentHistory();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private frameTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private dirty = false;
  private imageTarget: { section: string; field: string } | null = null;
  private aiRequest = 0;

  readonly active = computed(() => this.integrations.isActive('store'));
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly view = signal<StoreEditorView | null>(null);
  readonly frameSrc = signal<SafeResourceUrl | null>(null);
  readonly frameReady = signal(false);
  readonly frameFailed = signal(false);
  readonly content = signal<StoreTemplateContent>({ version: 1, sections: {} });
  readonly snapshot = signal<StoreEditorSnapshot | null>(null);
  readonly selectedSection = signal<string | null>(null);
  readonly selectedField = signal<string | null>(null);
  readonly device = signal<Device>('desktop');
  readonly panelOpen = signal(true);
  readonly saveState = signal<SaveState>('saved');
  readonly hasUnpublished = signal(false);
  readonly scheduledAt = signal<string | null>(null);
  readonly busy = signal<'publish' | 'discard' | 'schedule' | 'restore' | null>(null);
  readonly uploading = signal<string | null>(null);
  readonly notice = signal<{ tone: 'success' | 'danger'; text: string } | null>(null);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);

  readonly panelTab = signal<'sections' | 'style' | 'versions'>('sections');
  /** Previous published designs; null until the Versions tab loads them. */
  readonly versions = signal<StoreEditorVersion[] | null>(null);
  readonly versionsError = signal(false);
  /** Earliest time the schedule input accepts (local `YYYY-MM-DDTHH:mm`). */
  readonly scheduleMin = signal('');
  /** `section.field` whose writing assistant is open. */
  readonly aiField = signal<string | null>(null);
  readonly aiBusy = signal<StoreTextAiAction | null>(null);
  readonly aiSuggestions = signal<string[] | null>(null);
  readonly aiError = signal<string | null>(null);
  readonly aiInstruction = signal('');
  readonly aiActions = AI_ACTIONS;
  readonly aiSectionBusy = signal(false);
  readonly aiSectionError = signal<string | null>(null);
  readonly aiPageOpen = signal(false);
  readonly aiPageBusy = signal(false);
  readonly aiPageError = signal<string | null>(null);
  /** `section.field` whose AI photo is being created; it lands in that field even if the panel closes. */
  readonly aiImageBusy = signal<string | null>(null);
  readonly fieldKey = fieldKey;
  readonly isText = isTextField;
  readonly canAiImage = canGenerateImage;
  readonly formatDate = formatDate;
  readonly fonts = THEME_FONTS;
  readonly colors = THEME_COLORS;
  readonly cornerStyles = THEME_CORNERS;
  /** Style the store shows: merchant choices over the template defaults. */
  readonly theme = computed<Required<StoreTemplateTheme> | null>(() => {
    const view = this.view();
    return view ? { ...view.theme.defaults, ...this.content().theme } : null;
  });

  readonly libraryOpen = signal(false);
  readonly dragging = signal<string | null>(null);
  readonly dropTarget = signal<string | null>(null);

  /** Home order being edited (merchant layout of the current template). */
  readonly layout = computed<StoreLayoutItem[]>(() => {
    const view = this.view();
    return view ? layoutOf(this.content(), view.template, view.sections) : [];
  });
  /** Home sections in page order; repeated blocks are numbered. */
  readonly bodySections = computed<PanelSection[]>(() => {
    const schema = this.view()?.sections ?? [];
    const totals = new Map<string, number>();
    for (const item of this.layout()) totals.set(item.type, (totals.get(item.type) ?? 0) + 1);
    const seen = new Map<string, number>();
    return this.layout().flatMap((item) => {
      const section = sectionSchema(schema, item.type);
      if (!section) return [];
      const n = (seen.get(item.type) ?? 0) + 1;
      seen.set(item.type, n);
      const label = section.role === 'block' && (totals.get(item.type) ?? 0) > 1 ? `${section.label} ${n}` : section.label;
      return [panelSection(section, item.id, label, Boolean(item.hidden))];
    });
  });
  /** Sections outside the home body (announcement bar, footer, other pages): texts only. */
  readonly fixedSections = computed<PanelSection[]>(() =>
    (this.view()?.sections ?? []).filter((s) => s.role === 'fixed').map((s) => panelSection(s, s.id, s.label, false)),
  );
  readonly globalSections = computed(() => this.fixedSections().filter((s) => !s.page));
  readonly pageSections = computed(() => this.fixedSections().filter((s) => s.page));
  readonly library = computed(() => (this.view()?.sections ?? []).filter((s) => s.role === 'block'));
  readonly blockCount = computed(() => this.bodySections().filter((s) => s.role === 'block').length);
  readonly maxBlocks = MAX_BLOCKS;
  readonly section = computed(
    () => [...this.bodySections(), ...this.fixedSections()].find((s) => s.id === this.selectedSection()) ?? null,
  );
  /** Where a new block goes: below the open home section, else at the end. */
  readonly insertAfter = computed(() => this.bodySections().find((s) => s.id === this.selectedSection()) ?? null);
  readonly customFaq = computed(() => this.content().faq ?? null);
  readonly maxFaq = MAX_FAQ;
  readonly saveLabel = computed(() => {
    switch (this.saveState()) {
      case 'saving':
        return 'Guardando…';
      case 'pending':
        return 'Cambios sin guardar';
      case 'error':
        return 'No se pudo guardar';
      default: {
        const at = this.scheduledAt();
        if (at) return `Se publica el ${formatDate(at)}`;
        return this.hasUnpublished() ? 'Borrador guardado' : 'Sin cambios pendientes';
      }
    }
  });

  constructor() {
    void this.load();
    inject(DestroyRef).onDestroy(() => {
      if (this.saveTimer) clearTimeout(this.saveTimer);
      if (this.frameTimer) clearTimeout(this.frameTimer);
      if (this.noticeTimer) clearTimeout(this.noticeTimer);
      if (this.dirty) void this.api.saveDraft(this.content()).catch(() => undefined);
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await this.integrations.refresh();
      if (!this.active()) return;
      const view = await this.api.editor();
      this.view.set(view);
      this.content.set(view.content);
      this.applyState(view);
      this.selectedSection.set(view.sections[0]?.id ?? null);
      this.startFrame(view.frameUrl);
    } catch (error) {
      this.loadError.set(this.messageFrom(error, 'No pudimos abrir el editor. Revisa tu conexión e inténtalo de nuevo.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** New signed frame URL (the previous one may have expired). */
  async reloadFrame(): Promise<void> {
    try {
      const view = await this.api.editor();
      this.view.update((current) => (current ? { ...current, frameUrl: view.frameUrl, frameExpiresAt: view.frameExpiresAt } : view));
      this.startFrame(view.frameUrl);
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos recargar la vista de tu tienda.') });
    }
  }

  onMessage(event: MessageEvent): void {
    const frame = this.frame()?.nativeElement;
    const view = this.view();
    if (!frame || !view || event.source !== frame.contentWindow || event.origin !== new URL(view.frameUrl).origin) return;
    const message = event.data as StoreEditorFrameMessage | null;
    if (message?.source !== 'vendedoria-store') return;
    switch (message.type) {
      case 'snapshot':
        this.snapshot.set(message.snapshot);
        if (!this.frameReady()) {
          this.frameReady.set(true);
          this.frameFailed.set(false);
          if (this.frameTimer) clearTimeout(this.frameTimer);
          this.push();
        }
        break;
      case 'select':
        this.selectedSection.set(message.section);
        this.selectedField.set(message.field);
        break;
      case 'input':
        this.edit(message.section, message.field, message.value, false);
        break;
      case 'commit': {
        const field = this.field(message.section, message.field);
        const value = field ? clampValue(field, message.value) : message.value;
        this.edit(message.section, message.field, value, value !== message.value);
        break;
      }
      case 'image':
        this.chooseImage(message.section, message.field);
        break;
    }
  }

  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.dirty || this.saveState() === 'saving') event.preventDefault();
  }

  /** Accordion header: opens the section (and scrolls the store to it) or closes it. */
  toggleSection(id: string): void {
    if (this.selectedSection() === id) {
      this.selectedSection.set(null);
      this.selectedField.set(null);
      this.post({ source: 'vendedoria-editor', type: 'select', section: null });
      return;
    }
    this.selectSection(id);
  }

  selectSection(id: string): void {
    this.panelOpen.set(true);
    this.selectedSection.set(id);
    this.selectedField.set(null);
    const page = [...this.bodySections(), ...this.fixedSections()].find((s) => s.id === id)?.page ?? undefined;
    this.post({ source: 'vendedoria-editor', type: 'select', section: id, page });
    this.reveal(`.section[data-section="${id}"] .section__bar`);
  }

  toggleLibrary(): void {
    this.libraryOpen.update((open) => !open);
    if (this.libraryOpen()) this.reveal('.library');
  }

  /** Adds a block written by AI as one undo step; images keep the block defaults. */
  async createSectionWithAi(input: HTMLTextAreaElement): Promise<void> {
    const prompt = input.value.trim();
    if (!prompt) {
      this.aiSectionError.set('Cuéntanos qué sección quieres crear.');
      return;
    }
    this.aiSectionBusy.set(true);
    this.aiSectionError.set(null);
    try {
      const { type, texts } = await this.api.suggestSection(prompt);
      const view = this.view();
      const block = this.library().find((b) => b.id === type);
      if (!view || !block || this.blockCount() >= MAX_BLOCKS) throw new Error('block');
      const id = newBlockId(block.id);
      const added = addBlock(this.content(), view.template, this.layout(), block, id, this.insertAfter()?.id ?? null);
      const fields = new Set(block.fields.filter(isTextField).map((f) => f.id));
      const written = Object.entries(texts).filter(([field]) => fields.has(field));
      this.change(
        { ...added, sections: { ...added.sections, [id]: { ...added.sections[id], ...Object.fromEntries(written) } } },
        null,
      );
      this.push();
      input.value = '';
      this.libraryOpen.set(false);
      this.selectSection(id);
      this.success(`Sección «${block.label}» creada. Revisa sus textos y agrega fotos si lleva.`);
    } catch (error) {
      this.aiSectionError.set(this.messageFrom(error, 'No pudimos crear la sección. Inténtalo de nuevo.'));
    } finally {
      this.aiSectionBusy.set(false);
    }
  }

  /** Rewrites the home page from the merchant's request as one undo step. */
  async createPageWithAi(input: HTMLTextAreaElement): Promise<void> {
    const prompt = input.value.trim();
    if (!prompt) {
      this.aiPageError.set('Cuéntanos de tu negocio y qué quieres destacar.');
      return;
    }
    if (this.blockCount() > 0) {
      const confirmed = await this.confirmDialog.confirm({
        title: '¿Crear tu página con IA?',
        message:
          'Reescribe los textos de tus secciones y reemplaza las secciones que agregaste. Tus fotos se mantienen y puedes deshacerlo con Ctrl+Z.',
        confirmLabel: 'Crear página',
      });
      if (!confirmed) return;
    }
    this.aiPageBusy.set(true);
    this.aiPageError.set(null);
    try {
      const page = await this.api.suggestPage(prompt);
      const view = this.view();
      if (!view) return;
      this.change(applyPage(this.content(), view.template, view.sections, page), null);
      this.push();
      input.value = '';
      this.aiPageOpen.set(false);
      this.selectedSection.set(null);
      this.success('Página creada. Revisa los textos, agrega tus fotos y publica cuando quieras.');
    } catch (error) {
      this.aiPageError.set(this.messageFrom(error, 'No pudimos crear la página. Inténtalo de nuevo.'));
    } finally {
      this.aiPageBusy.set(false);
    }
  }

  moveSection(id: string, delta: number): void {
    const index = this.layout().findIndex((item) => item.id === id);
    if (index !== -1) this.changeLayout(moveItem(this.layout(), id, index + delta));
  }

  toggleVisibility(id: string): void {
    this.changeLayout(toggleHidden(this.layout(), id));
  }

  addSection(block: StoreEditorSection): void {
    const view = this.view();
    if (!view || this.blockCount() >= MAX_BLOCKS) return;
    const id = newBlockId(block.id);
    this.change(addBlock(this.content(), view.template, this.layout(), block, id, this.insertAfter()?.id ?? null), null);
    this.push();
    this.libraryOpen.set(false);
    this.selectSection(id);
  }

  removeSection(id: string): void {
    const view = this.view();
    if (!view) return;
    this.change(removeBlock(this.content(), view.template, this.layout(), id), null);
    this.push();
    if (this.selectedSection() === id) this.selectedSection.set(null);
    this.success('Sección quitada. Puedes deshacerlo con Ctrl+Z.');
  }

  onDragStart(event: DragEvent, id: string): void {
    this.dragging.set(id);
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  onDragOver(event: DragEvent, id: string): void {
    if (!this.dragging()) return;
    event.preventDefault();
    this.dropTarget.set(id);
  }

  onDrop(event: DragEvent, id: string): void {
    event.preventDefault();
    const dragged = this.dragging();
    this.onDragEnd();
    if (!dragged || dragged === id) return;
    this.changeLayout(moveItem(this.layout(), dragged, this.layout().findIndex((item) => item.id === id)));
  }

  onDragEnd(): void {
    this.dragging.set(null);
    this.dropTarget.set(null);
  }

  value(section: string, field: string): string {
    return displayValue(this.content(), this.snapshot(), section, field);
  }

  overridden(section: string, field: string): boolean {
    return isOverridden(this.content(), section, field);
  }

  /** Edits from the inspector: they are pushed to the page right away. */
  editFromPanel(section: string, field: StoreEditorField, value: string): void {
    this.edit(section, field.id, clampValue(field, value), true);
  }

  toggleAi(section: string, field: string): void {
    const key = fieldKey(section, field);
    this.aiRequest++;
    this.aiBusy.set(null);
    this.aiSuggestions.set(null);
    this.aiError.set(null);
    this.aiInstruction.set('');
    this.aiField.set(this.aiField() === key ? null : key);
  }

  async suggest(section: string, field: StoreEditorField, action: StoreTextAiAction): Promise<void> {
    const request = ++this.aiRequest;
    this.aiBusy.set(action);
    this.aiError.set(null);
    try {
      const { suggestions } = await this.api.suggestText({
        section,
        field: field.id,
        action,
        current: this.value(section, field.id),
        instruction: this.aiInstruction().trim() || undefined,
      });
      if (request === this.aiRequest) this.aiSuggestions.set(suggestions);
    } catch (error) {
      if (request === this.aiRequest) {
        this.aiError.set(this.messageFrom(error, 'No pudimos generar textos ahora. Inténtalo de nuevo.'));
      }
    } finally {
      if (request === this.aiRequest) this.aiBusy.set(null);
    }
  }

  /** The chosen text becomes one undo step, like any other edit. */
  useSuggestion(section: string, field: StoreEditorField, text: string): void {
    this.change(withField(this.content(), section, field.id, clampValue(field, text)), null);
    this.push();
    this.toggleAi(section, field.id);
    this.success('Texto aplicado. Puedes deshacerlo con Ctrl+Z.');
  }

  async createImage(section: string, field: string): Promise<void> {
    const key = fieldKey(section, field);
    this.aiImageBusy.set(key);
    this.aiError.set(null);
    try {
      const { url } = await this.api.suggestImage({
        section,
        field,
        instruction: this.aiInstruction().trim() || undefined,
      });
      this.change(withField(this.content(), section, field, url), null);
      this.push();
      if (this.aiField() === key) this.toggleAi(section, field);
      this.success('Imagen creada y aplicada. Puedes deshacerlo con Ctrl+Z.');
    } catch (error) {
      const text = this.messageFrom(error, 'No pudimos crear la imagen. Inténtalo de nuevo.');
      if (this.aiField() === key) this.aiError.set(text);
      else this.notice.set({ tone: 'danger', text });
    } finally {
      this.aiImageBusy.set(null);
    }
  }

  restore(section: string, field: string): void {
    this.change(withoutField(this.content(), section, field), null);
    this.push();
  }

  setChoice(section: string, field: string, value: string): void {
    this.change(withField(this.content(), section, field, value), null);
    this.push();
  }

  hideImage(section: string, field: string): void {
    this.change(withField(this.content(), section, field, ''), null);
    this.push();
  }

  chooseImage(section: string, field: string): void {
    this.selectedSection.set(section);
    this.selectedField.set(field);
    this.imageTarget = { section, field };
    this.filePicker()?.nativeElement.click();
  }

  async onImagePicked(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    const target = this.imageTarget;
    if (!file || !target) return;
    this.uploading.set(fieldKey(target.section, target.field));
    this.notice.set(null);
    try {
      const logo = target.section === THEME_TARGET;
      const image = await resizeImage(file, logo ? 800 : 2000);
      const { url } = await this.catalog.uploadMedia(image.contentType, image.data);
      if (logo) {
        this.setTheme('logo', url);
      } else {
        this.change(withField(this.content(), target.section, target.field, url), null);
        this.push();
      }
    } catch (error) {
      this.notice.set({
        tone: 'danger',
        text: this.messageFrom(error, 'No pudimos subir la imagen. Usa una foto JPG, PNG o WebP e inténtalo de nuevo.'),
      });
    } finally {
      this.uploading.set(null);
    }
  }

  hasThemeOption(option: StoreThemeOption): boolean {
    return this.view()?.theme.options.includes(option) ?? false;
  }

  themeChanged(option: StoreThemeOption): boolean {
    return this.content().theme?.[option] !== undefined;
  }

  /** `merge` joins quick changes (dragging the color picker) into one undo step. */
  setTheme<K extends StoreThemeOption>(option: K, value: StoreTemplateTheme[K] | undefined, merge = false): void {
    this.change(withTheme(this.content(), option, value), merge ? `theme.${option}` : null);
    this.push();
  }

  /** Hex typed by hand: applied when valid, otherwise the field shows the current color again. */
  typeColor(option: 'primary' | 'accent', input: HTMLInputElement): void {
    const raw = input.value.trim().toLowerCase();
    const hex = raw.startsWith('#') ? raw : `#${raw}`;
    if (HEX_COLOR.test(hex)) this.setTheme(option, hex);
    else input.value = this.theme()?.[option] ?? '';
  }

  chooseLogo(): void {
    this.imageTarget = { section: THEME_TARGET, field: 'logo' };
    this.filePicker()?.nativeElement.click();
  }

  customizeFaq(): void {
    this.change(withFaq(this.content(), this.snapshot()?.faq ?? []), null);
    this.push();
  }

  useAutomaticFaq(): void {
    this.change(withFaq(this.content(), undefined), null);
    this.push();
  }

  addFaq(): void {
    const faq = this.customFaq() ?? [];
    if (faq.length >= MAX_FAQ) return;
    this.change(withFaq(this.content(), [...faq, { question: 'Nueva pregunta', answer: 'Escribe aquí la respuesta.' }]), null);
    this.push();
  }

  editFaq(index: number, part: keyof StoreTemplateFaq, value: string): void {
    const faq = [...(this.customFaq() ?? [])];
    if (!faq[index]) return;
    faq[index] = { ...faq[index], [part]: value.slice(0, part === 'question' ? 200 : 1200) };
    this.change(withFaq(this.content(), faq), `faq.${index}.${part}`);
    this.push();
  }

  removeFaq(index: number): void {
    this.change(withFaq(this.content(), (this.customFaq() ?? []).filter((_, i) => i !== index)), null);
    this.push();
  }

  undo(): void {
    const previous = this.history.undo(this.content());
    if (previous) this.apply(previous);
  }

  redo(): void {
    const next = this.history.redo(this.content());
    if (next) this.apply(next);
  }

  /** Ctrl/Cmd+Z outside text fields; inside them the browser undoes the typing. */
  onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z') return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea')) return;
    event.preventDefault();
    if (event.shiftKey) this.redo();
    else this.undo();
  }

  async retrySave(): Promise<void> {
    this.dirty = true;
    await this.flush();
  }

  async publish(): Promise<void> {
    this.busy.set('publish');
    this.notice.set(null);
    try {
      await this.flush();
      if (this.saveState() === 'error') throw new Error('save');
      const state = await this.api.publishDraft();
      this.applyState(state);
      this.versions.set(null);
      if (this.panelTab() === 'versions') void this.loadVersions();
      this.success(
        this.view()?.storeStatus === 'PUBLISHED'
          ? 'Cambios publicados. Tus clientes ya ven la nueva versión.'
          : 'Cambios listos. Se verán cuando publiques tu tienda.',
      );
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos publicar los cambios. Inténtalo de nuevo.') });
    } finally {
      this.busy.set(null);
    }
  }

  async discard(): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Descartar los cambios sin publicar?',
      message: 'Tu tienda vuelve a la última versión publicada. Esta acción no se puede deshacer.',
      confirmLabel: 'Descartar cambios',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.busy.set('discard');
    this.notice.set(null);
    try {
      await this.stopSaving();
      const state = await this.api.discardDraft();
      this.content.set(state.content);
      this.applyState(state);
      this.saveState.set('saved');
      this.push();
      this.success('Cambios descartados.');
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos descartar los cambios.') });
    } finally {
      this.busy.set(null);
    }
  }

  openTab(tab: 'sections' | 'style' | 'versions'): void {
    this.panelTab.set(tab);
    if (tab !== 'versions') return;
    this.scheduleMin.set(localInputValue(new Date(Date.now() + 10 * 60_000)));
    if (!this.versions()) void this.loadVersions();
  }

  async loadVersions(): Promise<void> {
    this.versionsError.set(false);
    try {
      this.versions.set(await this.api.editorVersions());
    } catch {
      this.versionsError.set(true);
    }
  }

  /** `value` comes from a `datetime-local` input, in the merchant's local time. */
  async schedule(value: string): Promise<void> {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) {
      this.notice.set({ tone: 'danger', text: 'Elige el día y la hora en que quieres publicar.' });
      return;
    }
    this.busy.set('schedule');
    this.notice.set(null);
    try {
      await this.flush();
      if (this.saveState() === 'error') throw new Error('save');
      const state = await this.api.scheduleDraft(date.toISOString());
      this.applyState(state);
      this.success(`Listo: el ${formatDate(date.toISOString())} se publicarán tus cambios.`);
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos programar la publicación. Inténtalo de nuevo.') });
    } finally {
      this.busy.set(null);
    }
  }

  async cancelSchedule(): Promise<void> {
    this.busy.set('schedule');
    this.notice.set(null);
    try {
      this.applyState(await this.api.cancelSchedule());
      this.success('Programación cancelada. Tus cambios siguen guardados como borrador.');
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos cancelar la programación.') });
    } finally {
      this.busy.set(null);
    }
  }

  /** Loads a previous design into the draft; Ctrl+Z brings back the draft it replaced. */
  async restoreVersion(version: StoreEditorVersion): Promise<void> {
    const confirmed = await this.confirmDialog.confirm({
      title: '¿Restaurar esta versión?',
      message: `El diseño publicado hasta el ${formatDate(version.replacedAt)} pasará a tu borrador y reemplazará tus cambios sin publicar. Tus clientes no verán nada hasta que publiques.`,
      confirmLabel: 'Restaurar',
    });
    if (!confirmed) return;
    this.busy.set('restore');
    this.notice.set(null);
    try {
      await this.stopSaving();
      const state = await this.api.restoreVersion(version.id);
      this.history.record(this.content(), null);
      this.content.set(state.content);
      this.syncHistory();
      this.applyState(state);
      this.saveState.set('saved');
      this.push();
      this.success('Versión restaurada en tu borrador. Revísala y publícala cuando quieras.');
    } catch (error) {
      this.notice.set({ tone: 'danger', text: this.messageFrom(error, 'No pudimos restaurar esa versión.') });
    } finally {
      this.busy.set(null);
    }
  }

  private applyState(state: StoreEditorState): void {
    this.hasUnpublished.set(state.hasUnpublishedChanges);
    this.scheduledAt.set(state.scheduledAt);
  }

  /** Drops the pending autosave and waits for the one in flight. */
  private async stopSaving(): Promise<void> {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    this.dirty = false;
    await this.saving;
  }

  private field(section: string, field: string): StoreEditorField | undefined {
    return sectionSchema(this.view()?.sections ?? [], typeOf(section))?.fields.find((f) => f.id === field);
  }

  /** Brings a panel element into view once the pending render (new section, opened library) is in the DOM. */
  private reveal(selector: string): void {
    afterNextRender(
      () => this.host.nativeElement.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
      { injector: this.injector },
    );
  }

  private changeLayout(layout: StoreLayoutItem[]): void {
    const view = this.view();
    if (!view) return;
    this.change(withLayout(this.content(), view.template, layout), null);
    this.push();
  }

  private edit(section: string, field: string, value: string, push: boolean): void {
    if (!this.field(section, field)) return;
    this.change(withField(this.content(), section, field, value), fieldKey(section, field));
    if (push) this.push();
  }

  private change(next: StoreTemplateContent, key: string | null): void {
    this.history.record(this.content(), key);
    this.content.set(next);
    this.syncHistory();
    this.scheduleSave();
  }

  private apply(content: StoreTemplateContent): void {
    this.content.set(content);
    this.syncHistory();
    this.push();
    this.scheduleSave();
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private scheduleSave(): void {
    this.dirty = true;
    this.saveState.set('pending');
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Saves the latest content; edits made while saving trigger one more save. */
  private async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    while (this.saving) await this.saving;
    if (!this.dirty) return;
    this.dirty = false;
    this.saveState.set('saving');
    this.saving = this.api
      .saveDraft(this.content())
      .then((state) => {
        this.applyState(state);
        this.saveState.set(this.dirty ? 'pending' : 'saved');
      })
      .catch(() => {
        this.dirty = true;
        this.saveState.set('error');
      })
      .finally(() => {
        this.saving = null;
      });
    await this.saving;
    if (this.dirty && this.saveState() === 'pending') await this.flush();
  }

  /** Success toasts close by themselves; errors stay until dismissed. */
  private success(text: string): void {
    const notice = { tone: 'success' as const, text };
    this.notice.set(notice);
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.notice() === notice) this.notice.set(null);
    }, NOTICE_MS);
  }

  private startFrame(url: string): void {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) {
      this.frameFailed.set(true);
      return;
    }
    this.frameReady.set(false);
    this.frameFailed.set(false);
    this.frameSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(parsed.toString()));
    if (this.frameTimer) clearTimeout(this.frameTimer);
    this.frameTimer = setTimeout(() => {
      if (!this.frameReady()) this.frameFailed.set(true);
    }, FRAME_TIMEOUT_MS);
  }

  private push(): void {
    this.post({ source: 'vendedoria-editor', type: 'content', content: this.content() });
  }

  private post(message: StoreEditorHostMessage): void {
    const target = this.frame()?.nativeElement.contentWindow;
    const view = this.view();
    if (!target || !view || !this.frameReady()) return;
    target.postMessage(message, new URL(view.frameUrl).origin);
  }

  private messageFrom(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse && [400, 403, 409, 429, 503].includes(error.status)) {
      const message = error.error?.message;
      if (typeof message === 'string') return message;
      if (Array.isArray(message) && typeof message[0] === 'string') return message[0];
    }
    return fallback;
  }
}

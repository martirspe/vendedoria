import { DsSelectComponent } from '@vendedoria/ui';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { DsButtonComponent, DsConfirmService } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import { SellerPlaygroundComponent } from './seller-playground.component';
import {
  AgentsApiService,
  AgentQuality,
  SalesAgentDto,
  SalesAgentPromptDto,
  SalesAgentPromptMode,
  SalesAgentSummaryDto,
} from '../../core/api/agents-api.service';
import {
  JourneyStage,
  JourneyTemplateDto,
  KnowledgeApiService,
  KnowledgeFaqDto,
} from '../../core/api/knowledge-api.service';
import {
  ChannelDto,
  MessagingApiService,
} from '../../core/api/messaging-api.service';
import {
  SALES_TECHNIQUES,
  SELLER_PRESETS,
  SELLER_SECTIONS,
  SellerPreset,
  SellerSectionId,
  TECHNIQUE_GROUPS,
  asSellerSection,
  resolveSellerPreset,
} from './seller-config';

const CUSTOM_PROMPT_MAX = 12000;

@Component({
  selector: 'app-seller-page',
  standalone: true,
  imports: [DsSelectComponent,
    ReactiveFormsModule,
    RouterLink,
    DsButtonComponent,
    DsIconComponent,
    SellerPlaygroundComponent,
  ],
  templateUrl: './seller.page.html',
  styleUrl: './seller.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerPage {
  private readonly api = inject(AgentsApiService);
  private readonly knowledgeApi = inject(KnowledgeApiService);
  private readonly messagingApi = inject(MessagingApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmDialog = inject(DsConfirmService);

  readonly sections = SELLER_SECTIONS;
  readonly techniqueGroups = TECHNIQUE_GROUPS;
  readonly presets = SELLER_PRESETS;
  readonly customPromptMax = CUSTOM_PROMPT_MAX;

  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly agentLoadFailed = signal(false);
  readonly agentLoading = signal(false);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly quality = signal<AgentQuality | null>(null);

  readonly agents = signal<SalesAgentSummaryDto[]>([]);
  readonly agentId = signal<string | null>(null);
  readonly channels = signal<ChannelDto[]>([]);
  readonly channelsBusy = signal(false);
  readonly newAgentOpen = signal(false);
  readonly newAgentName = signal('');
  readonly newAgentCopy = signal(true);
  readonly agentBusy = signal(false);

  readonly prompt = signal<SalesAgentPromptDto | null>(null);
  readonly promptLoading = signal(false);

  readonly faqs = signal<KnowledgeFaqDto[]>([]);
  readonly journeys = signal<JourneyTemplateDto[]>([]);
  readonly knowledgeBusy = signal(false);
  readonly importDraft = signal('');
  readonly faqQuestion = signal('');
  readonly faqAnswer = signal('');
  readonly journeyTitle = signal('');
  readonly journeyStage = signal<JourneyStage>('DISCOVER');
  readonly journeyScript = signal('');

  readonly playgroundOpen = signal(false);

  readonly section = toSignal(
    this.route.paramMap.pipe(
      map((params) => asSellerSection(params.get('section')) ?? 'profile'),
    ),
    { initialValue: 'profile' as SellerSectionId },
  );

  readonly activeSection = computed(
    () => this.sections.find((item) => item.id === this.section()) ?? this.sections[0],
  );

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    companyName: [''],
    companyDescription: [''],
    audienceDescription: [''],
    rulesText: [''],
    communicationStyle: [''],
    personalityPreset: [''],
    salesStyle: [''],
    responseLength: ['balanced' as 'concise' | 'balanced' | 'detailed'],
    useEmojis: [true],
    emojiPalette: [''],
    wordsToAvoid: [''],
    initialMessage: [''],
    purchaseConfirmMessage: [''],
    handoffMessage: [''],
    pauseOnHandoff: [true],
    neverOfferDiscount: [true],
    neverInventShipping: [true],
    catalogOnlyFacts: [true],
    salesTechniques: this.fb.nonNullable.control<string[]>([]),
    objectionHandling: [''],
    promptMode: ['guided' as SalesAgentPromptMode],
    customPrompt: ['', [Validators.maxLength(CUSTOM_PROMPT_MAX)]],
    isActive: [true],
  });

  private readonly formValues = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
  );

  readonly currentAgent = computed(
    () => this.agents().find((agent) => agent.id === this.agentId()) ?? null,
  );

  readonly selectedTechniques = computed(
    () => new Set(this.formValues().salesTechniques),
  );

  readonly techniquesByGroup = computed(() =>
    this.techniqueGroups.map((group) => ({
      ...group,
      items: SALES_TECHNIQUES.filter((item) => item.group === group.id),
    })),
  );

  readonly activePreset = computed(() => resolveSellerPreset(this.formValues()));

  readonly customPromptLength = computed(
    () => this.formValues().customPrompt.length,
  );

  readonly previewGreeting = computed(() => {
    const values = this.formValues();
    const name = values.name?.trim() || 'tu vendedor IA';
    const company = values.companyName?.trim() || 'tu negocio';
    const custom = values.initialMessage?.trim();
    if (custom) {
      return custom;
    }
    return `¡Hola! Soy ${name} de ${company}. ¿En qué puedo ayudarte hoy?`;
  });

  readonly previewPulse = computed(() => this.previewGreeting().length);

  readonly qualityPercent = computed(() => {
    const quality = this.quality();
    if (!quality || quality.max === 0) {
      return 0;
    }
    return Math.round((quality.score / quality.max) * 100);
  });

  readonly qualityLabel = computed(() => {
    const percent = this.qualityPercent();
    if (percent >= 80) return 'Listo para vender';
    if (percent >= 50) return 'Buen avance';
    if (percent >= 25) return 'En configuración';
    return 'Empieza por lo esencial';
  });

  readonly publishedFaqCount = computed(
    () =>
      this.faqs().filter(
        (item) => item.isPublished && item.reviewStatus === 'APPROVED',
      ).length,
  );

  readonly draftFaqCount = computed(
    () => this.faqs().filter((item) => item.reviewStatus === 'DRAFT').length,
  );

  readonly activeJourneyCount = computed(
    () => this.journeys().filter((item) => item.isActive).length,
  );

  constructor() {
    void this.init();
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (!this.loading() && this.agentId() && params.get('playground') === '1' && !this.playgroundOpen()) {
          void this.openPlayground();
        }
        const requested = params.get('agent');
        if (!this.loading() && requested && requested !== this.agentId()) {
          void this.loadAgent(requested);
        }
      });
  }

  async init(): Promise<void> {
    this.loading.set(true);
    this.loadFailed.set(false);
    this.errorMessage.set(null);
    try {
      const [agents, faqs, journeys, channels] = await Promise.all([
        this.api.list(),
        this.knowledgeApi.listFaqs(),
        this.knowledgeApi.listJourneys(),
        this.messagingApi.listChannels().catch(() => [] as ChannelDto[]),
      ]);
      this.agents.set(agents);
      this.faqs.set(faqs);
      this.journeys.set(journeys);
      this.channels.set(channels);
      const requested = this.route.snapshot.queryParamMap.get('agent');
      const target = agents.find((agent) => agent.id === requested) ?? agents[0];
      if (target) {
        await this.loadAgent(target.id);
      }
    } catch {
      this.loadFailed.set(true);
      this.errorMessage.set(
        'No pudimos cargar tu vendedor IA. Revisa tu conexión e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
      if (this.route.snapshot.queryParamMap.get('playground') === '1' && this.agentId()) void this.openPlayground();
    }
  }

  async loadAgent(id: string): Promise<void> {
    this.agentLoading.set(true);
    this.agentLoadFailed.set(false);
    this.errorMessage.set(null);
    try {
      const agent = await this.api.get(id);
      this.applyAgent(agent);
      this.prompt.set(null);
    } catch {
      this.agentLoadFailed.set(true);
      this.errorMessage.set('No pudimos cargar este vendedor. Inténtalo de nuevo.');
    } finally {
      this.agentLoading.set(false);
    }
  }

  async selectAgent(id: string): Promise<void> {
    if (id === this.agentId()) return;
    if (
      this.dirty() &&
      !(await this.confirmDialog.confirm({
        title: '¿Descartar los cambios?',
        message: 'Tienes cambios sin guardar en este vendedor. Si cambias de vendedor, se perderán.',
        confirmLabel: 'Descartar cambios',
        cancelLabel: 'Seguir editando',
        tone: 'danger',
      }))
    ) {
      return;
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { agent: id },
      queryParamsHandling: 'merge',
    });
  }

  sectionQuery(): Record<string, string> {
    const id = this.agentId();
    return id ? { agent: id } : {};
  }

  markDirty(): void {
    this.dirty.set(true);
    this.successMessage.set(null);
    this.quality.set(this.estimateQuality(this.form.getRawValue()));
  }

  toggleNewAgent(): void {
    this.newAgentOpen.update((open) => !open);
    this.newAgentName.set('');
  }

  onNewAgentName(value: string): void {
    this.newAgentName.set(value);
  }

  onNewAgentCopy(value: boolean): void {
    this.newAgentCopy.set(value);
  }

  async createAgent(): Promise<void> {
    if (this.agentBusy()) return;
    const name = this.newAgentName().trim();
    if (name.length < 2) {
      this.errorMessage.set('Ponle un nombre de al menos 2 letras al nuevo vendedor.');
      return;
    }
    this.agentBusy.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.api.create({
        name,
        copyFromId: this.newAgentCopy() ? (this.agentId() ?? undefined) : undefined,
      });
      this.agents.set(await this.api.list());
      this.newAgentOpen.set(false);
      this.dirty.set(false);
      await this.router.navigate(['/app/seller', 'profile'], {
        queryParams: { agent: created.id },
      });
      this.successMessage.set(`${created.name} está listo. Asígnale un canal para que empiece a vender.`);
    } catch (error) {
      this.errorMessage.set(
        this.apiMessage(error) ?? 'No se pudo crear el vendedor. Inténtalo otra vez.',
      );
    } finally {
      this.agentBusy.set(false);
    }
  }

  async deleteAgent(): Promise<void> {
    const agent = this.currentAgent();
    if (!agent || agent.isPrimary) return;
    const confirmed = await this.confirmDialog.confirm({
      title: `¿Eliminar a ${agent.name}?`,
      message: 'Sus canales pasarán a tu vendedor principal. Esta acción no se puede deshacer.',
      confirmLabel: 'Eliminar vendedor',
      tone: 'danger',
    });
    if (!confirmed) return;
    this.agentBusy.set(true);
    try {
      await this.api.remove(agent.id);
      const agents = await this.api.list();
      this.agents.set(agents);
      this.dirty.set(false);
      await this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { agent: agents[0]?.id },
      });
      this.successMessage.set(`${agent.name} fue eliminado.`);
    } catch {
      this.errorMessage.set('No se pudo eliminar el vendedor.');
    } finally {
      this.agentBusy.set(false);
    }
  }

  channelOwner(channel: ChannelDto): SalesAgentSummaryDto | null {
    return this.agents().find((agent) => agent.channelIds.includes(channel.id)) ?? null;
  }

  isChannelAssigned(channel: ChannelDto): boolean {
    return this.currentAgent()?.channelIds.includes(channel.id) ?? false;
  }

  channelLabel(channel: ChannelDto): string {
    const type = channel.type === 'WHATSAPP' ? 'WhatsApp' : 'Instagram';
    return channel.displayName ? `${type} · ${channel.displayName}` : type;
  }

  async toggleChannel(channel: ChannelDto): Promise<void> {
    const agent = this.currentAgent();
    if (!agent) return;
    const next = this.isChannelAssigned(channel)
      ? agent.channelIds.filter((id) => id !== channel.id)
      : [...agent.channelIds, channel.id];
    this.channelsBusy.set(true);
    this.errorMessage.set(null);
    try {
      await this.api.assignChannels(agent.id, next);
      this.agents.set(await this.api.list());
      this.successMessage.set('Canales actualizados. Aplica desde el próximo mensaje.');
    } catch {
      this.errorMessage.set('No se pudieron actualizar los canales.');
    } finally {
      this.channelsBusy.set(false);
    }
  }

  applyPreset(preset: SellerPreset): void {
    this.form.patchValue({
      personalityPreset: preset.id,
      communicationStyle: preset.communicationStyle,
      salesStyle: preset.salesStyle,
      responseLength: preset.responseLength,
      salesTechniques: [...preset.salesTechniques],
    });
    this.markDirty();
  }

  customizePersonality(): void {
    this.form.controls.personalityPreset.setValue('custom');
    this.markDirty();
  }

  toggleTechnique(id: string): void {
    const current = this.form.controls.salesTechniques.value;
    this.form.controls.salesTechniques.setValue(
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
    this.markDirty();
  }

  setPromptMode(mode: SalesAgentPromptMode): void {
    this.form.controls.promptMode.setValue(mode);
    this.markDirty();
  }

  async loadPrompt(): Promise<void> {
    const id = this.agentId();
    if (!id) return;
    this.promptLoading.set(true);
    try {
      if (this.dirty()) {
        await this.save(true);
      }
      this.prompt.set(await this.api.getPrompt(id));
    } catch {
      this.errorMessage.set('No pudimos generar la vista del prompt.');
    } finally {
      this.promptLoading.set(false);
    }
  }

  async startFromGuided(): Promise<void> {
    const current = this.form.controls.customPrompt.value.trim();
    if (
      current &&
      !(await this.confirmDialog.confirm({
        title: '¿Reemplazar tu prompt personalizado?',
        message: 'Cargaremos las instrucciones guiadas en el editor en lugar del texto que tienes ahora.',
        confirmLabel: 'Reemplazar',
        tone: 'danger',
      }))
    ) {
      return;
    }
    await this.loadPrompt();
    const prompt = this.prompt();
    if (!prompt) return;
    this.form.patchValue({ customPrompt: prompt.guidedPersona, promptMode: 'custom' });
    this.markDirty();
  }

  async copyPrompt(): Promise<void> {
    const text = this.prompt()?.effectivePrompt;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      this.successMessage.set('Prompt copiado.');
    } catch {
      this.errorMessage.set('No se pudo copiar. Selecciona el texto y cópialo manualmente.');
    }
  }

  async openPlayground(): Promise<void> {
    if (this.loading() || this.loadFailed() || this.agentLoading() || this.agentLoadFailed() || !this.agentId()) return;
    if (this.dirty()) {
      await this.save(true);
      if (this.dirty()) return;
    }
    this.playgroundOpen.set(true);
  }

  closePlayground(): void {
    this.playgroundOpen.set(false);
  }

  stageLabel(stage: JourneyStage): string {
    switch (stage) {
      case 'DISCOVER':
        return 'Descubrir';
      case 'RECOMMEND':
        return 'Recomendar';
      case 'CLOSE':
        return 'Cerrar';
      case 'SUPPORT':
        return 'Postventa';
    }
  }

  onFaqQuestion(value: string): void {
    this.faqQuestion.set(value);
  }

  onFaqAnswer(value: string): void {
    this.faqAnswer.set(value);
  }

  onImportDraft(value: string): void {
    this.importDraft.set(value);
  }

  onJourneyTitle(value: string): void {
    this.journeyTitle.set(value);
  }

  onJourneyStage(value: string): void {
    if (
      value === 'DISCOVER' ||
      value === 'RECOMMEND' ||
      value === 'CLOSE' ||
      value === 'SUPPORT'
    ) {
      this.journeyStage.set(value);
    }
  }

  onJourneyScript(value: string): void {
    this.journeyScript.set(value);
  }

  async addFaq(): Promise<void> {
    const question = this.faqQuestion().trim();
    const answer = this.faqAnswer().trim();
    if (question.length < 4 || answer.length < 4) {
      this.errorMessage.set('La pregunta frecuente necesita pregunta y respuesta claras.');
      return;
    }
    this.knowledgeBusy.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.knowledgeApi.createFaq({ question, answer });
      this.faqs.update((list) => [created, ...list]);
      this.faqQuestion.set('');
      this.faqAnswer.set('');
      this.successMessage.set('Pregunta publicada. Tus vendedores ya pueden usarla.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo guardar la pregunta frecuente.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async approveFaq(faq: KnowledgeFaqDto): Promise<void> {
    this.knowledgeBusy.set(true);
    try {
      const updated = await this.knowledgeApi.approveFaq(faq.id);
      this.faqs.update((list) =>
        list.map((item) => (item.id === faq.id ? updated : item)),
      );
      this.successMessage.set('Pregunta aprobada y publicada.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo aprobar la pregunta frecuente.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async deleteFaq(faq: KnowledgeFaqDto): Promise<void> {
    this.knowledgeBusy.set(true);
    try {
      await this.knowledgeApi.deleteFaq(faq.id);
      this.faqs.update((list) => list.filter((item) => item.id !== faq.id));
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo eliminar la pregunta frecuente.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async importFaqs(): Promise<void> {
    const rawText = this.importDraft().trim();
    if (rawText.length < 8) {
      this.errorMessage.set('Pega al menos un bloque pregunta/respuesta.');
      return;
    }
    this.knowledgeBusy.set(true);
    this.errorMessage.set(null);
    try {
      const result = await this.knowledgeApi.importPaste(rawText);
      if (result.skipped || !result.created.length) {
        this.errorMessage.set(
          'No detectamos preguntas. Usa bloques separados o líneas Q:/A:.',
        );
        return;
      }
      this.faqs.update((list) => [...result.created, ...list]);
      this.importDraft.set('');
      this.successMessage.set(
        `${result.created.length} borrador${result.created.length === 1 ? '' : 'es'} listo${result.created.length === 1 ? '' : 's'} para revisar. No se publican hasta que apruebes.`,
      );
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo importar el texto.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async addJourney(): Promise<void> {
    const title = this.journeyTitle().trim();
    const scriptText = this.journeyScript().trim();
    if (title.length < 2 || scriptText.length < 8) {
      this.errorMessage.set('El guion necesita título y texto.');
      return;
    }
    this.knowledgeBusy.set(true);
    try {
      const created = await this.knowledgeApi.createJourney({
        title,
        stage: this.journeyStage(),
        scriptText,
      });
      this.journeys.update((list) => [created, ...list]);
      this.journeyTitle.set('');
      this.journeyScript.set('');
      this.successMessage.set('Guion activo.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo guardar el guion.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async toggleJourney(journey: JourneyTemplateDto): Promise<void> {
    this.knowledgeBusy.set(true);
    try {
      const updated = await this.knowledgeApi.updateJourney(journey.id, {
        isActive: !journey.isActive,
      });
      this.journeys.update((list) =>
        list.map((item) => (item.id === journey.id ? updated : item)),
      );
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo actualizar el guion.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async deleteJourney(journey: JourneyTemplateDto): Promise<void> {
    this.knowledgeBusy.set(true);
    try {
      await this.knowledgeApi.deleteJourney(journey.id);
      this.journeys.update((list) =>
        list.filter((item) => item.id !== journey.id),
      );
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo eliminar el guion.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async save(quiet = false): Promise<void> {
    const id = this.agentId();
    if (!id) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set(
        this.form.controls.customPrompt.invalid
          ? `El prompt personalizado supera los ${CUSTOM_PROMPT_MAX} caracteres.`
          : 'Revisa el nombre del vendedor antes de guardar.',
      );
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    if (!quiet) {
      this.successMessage.set(null);
    }

    try {
      const values = this.form.getRawValue();
      const updated = await this.api.update(id, {
        ...values,
        personalityPreset: this.activePreset(),
        companyName: values.companyName.trim() || undefined,
        companyDescription: values.companyDescription.trim() || undefined,
        audienceDescription: values.audienceDescription.trim() || undefined,
        rulesText: values.rulesText.trim() || undefined,
        communicationStyle: values.communicationStyle.trim() || undefined,
        salesStyle: values.salesStyle.trim() || undefined,
        emojiPalette: values.emojiPalette.trim() || undefined,
        wordsToAvoid: values.wordsToAvoid.trim() || undefined,
        initialMessage: values.initialMessage.trim() || undefined,
        purchaseConfirmMessage:
          values.purchaseConfirmMessage.trim() || undefined,
        handoffMessage: values.handoffMessage.trim() || undefined,
        objectionHandling: values.objectionHandling.trim() || undefined,
        customPrompt: values.customPrompt.trim() || undefined,
      });
      this.applyAgent(updated);
      this.agents.update((list) =>
        list.map((agent) =>
          agent.id === updated.id
            ? { ...agent, name: updated.name, isActive: updated.isActive, promptMode: updated.promptMode }
            : agent,
        ),
      );
      if (!quiet) {
        this.successMessage.set(
          'Vendedor actualizado. Los cambios aplican en el próximo mensaje.',
        );
      }
    } catch {
      this.errorMessage.set(
        'No se pudo guardar. Verifica los campos e inténtalo otra vez.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  private applyAgent(agent: SalesAgentDto): void {
    this.agentId.set(agent.id);
    this.patchForm(agent);
    this.quality.set(agent.quality);
    this.dirty.set(false);
  }

  private async refreshQuality(): Promise<void> {
    const id = this.agentId();
    try {
      if (!id) throw new Error('no agent');
      const agent = await this.api.get(id);
      this.quality.set(agent.quality);
    } catch {
      this.quality.set(this.estimateQuality(this.form.getRawValue()));
    }
  }

  private apiMessage(error: unknown): string | null {
    const message = (error as { error?: { message?: unknown } })?.error?.message;
    return typeof message === 'string' ? message : null;
  }

  private patchForm(agent: SalesAgentDto): void {
    this.form.reset({
      name: agent.name,
      companyName: agent.companyName ?? '',
      companyDescription: agent.companyDescription ?? '',
      audienceDescription: agent.audienceDescription ?? '',
      rulesText: agent.rulesText ?? '',
      communicationStyle: agent.communicationStyle ?? '',
      personalityPreset: agent.personalityPreset ?? '',
      salesStyle: agent.salesStyle ?? '',
      responseLength: (['concise', 'balanced', 'detailed'].includes(
        agent.responseLength,
      )
        ? agent.responseLength
        : 'balanced') as 'concise' | 'balanced' | 'detailed',
      useEmojis: agent.useEmojis,
      emojiPalette: agent.emojiPalette ?? '',
      wordsToAvoid: agent.wordsToAvoid ?? '',
      initialMessage: agent.initialMessage ?? '',
      purchaseConfirmMessage: agent.purchaseConfirmMessage ?? '',
      handoffMessage: agent.handoffMessage ?? '',
      pauseOnHandoff: agent.pauseOnHandoff,
      neverOfferDiscount: agent.neverOfferDiscount ?? true,
      neverInventShipping: agent.neverInventShipping ?? true,
      catalogOnlyFacts: agent.catalogOnlyFacts ?? true,
      salesTechniques: agent.salesTechniques ?? [],
      objectionHandling: agent.objectionHandling ?? '',
      promptMode: agent.promptMode === 'custom' ? 'custom' : 'guided',
      customPrompt: agent.customPrompt ?? '',
      isActive: agent.isActive,
    });
  }

  private estimateQuality(
    values: ReturnType<typeof this.form.getRawValue>,
  ): AgentQuality {
    const checks: Array<{ ok: boolean; points: number; hint: string }> = [
      {
        ok: values.name.trim().length >= 2,
        points: 20,
        hint: 'Ponle un nombre memorable al vendedor',
      },
      {
        ok: values.companyName.trim().length >= 2,
        points: 15,
        hint: 'Indica el nombre del negocio',
      },
      {
        ok: values.companyDescription.trim().length >= 20,
        points: 20,
        hint: 'Describe qué vende el negocio',
      },
      {
        ok: values.audienceDescription.trim().length >= 12,
        points: 20,
        hint: 'Define a quién le vende',
      },
      {
        ok: values.rulesText.trim().length >= 12,
        points: 25,
        hint: 'Agrega reglas de qué hacer siempre y qué nunca',
      },
      {
        ok: values.communicationStyle.trim().length >= 4,
        points: 15,
        hint: 'Define el estilo de comunicación',
      },
      {
        ok: values.salesStyle.trim().length >= 4,
        points: 15,
        hint: 'Define el estilo de ventas',
      },
      {
        ok: values.initialMessage.trim().length >= 12,
        points: 25,
        hint: 'Escribe el mensaje de bienvenida',
      },
      {
        ok: values.purchaseConfirmMessage.trim().length >= 8,
        points: 15,
        hint: 'Agrega el mensaje de confirmación de compra',
      },
      {
        ok: values.handoffMessage.trim().length >= 8,
        points: 20,
        hint: 'Configura el mensaje al escalar a humano',
      },
      {
        ok: Boolean(values.responseLength),
        points: 10,
        hint: 'Elige la longitud de respuesta',
      },
      {
        ok: this.publishedFaqCount() > 0,
        points: 25,
        hint: 'Publica al menos 1 FAQ aprobada para políticas reales',
      },
      {
        ok: this.activeJourneyCount() > 0,
        points: 15,
        hint: 'Activa una plantilla de recorrido de venta',
      },
    ];

    const completed = checks.filter((item) => item.ok);
    const missing = checks
      .filter((item) => !item.ok)
      .map((item) => item.hint);
    if (this.draftFaqCount() > 0) {
      missing.unshift(
        `Revisa ${this.draftFaqCount()} FAQ${this.draftFaqCount() === 1 ? '' : 's'} en borrador (import)`,
      );
    }

    return {
      score: Math.min(
        completed.reduce((sum, item) => sum + item.points, 0),
        240,
      ),
      max: 240,
      completedFields: completed.length,
      totalFields: checks.length,
      missingHints: missing.slice(0, 4),
    };
  }
}

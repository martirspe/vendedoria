import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { DsButtonComponent } from '@vendedoria/ui';
import { DsIconComponent } from '@vendedoria/ui';
import {
  AgentsApiService,
  AgentQuality,
  AgentToolTrace,
  PlaygroundMessageDto,
  PlaygroundSessionDto,
  SalesAgentDto,
} from '../../core/api/agents-api.service';
import {
  JourneyStage,
  JourneyTemplateDto,
  KnowledgeApiService,
  KnowledgeFaqDto,
} from '../../core/api/knowledge-api.service';

type SellerSectionId =
  | 'basics'
  | 'audience'
  | 'personality'
  | 'messages'
  | 'handoff'
  | 'limits'
  | 'knowledge'
  | 'journeys';

@Component({
  selector: 'app-seller-page',
  standalone: true,
  imports: [ReactiveFormsModule, DsButtonComponent, DsIconComponent],
  templateUrl: './seller.page.html',
  styleUrl: './seller.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SellerPage {
  private readonly api = inject(AgentsApiService);
  private readonly knowledgeApi = inject(KnowledgeApiService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly quality = signal<AgentQuality | null>(null);
  readonly activeSection = signal<SellerSectionId>('basics');

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
  readonly playgroundLoading = signal(false);
  readonly playgroundSending = signal(false);
  readonly playgroundError = signal<string | null>(null);
  readonly playgroundSession = signal<PlaygroundSessionDto | null>(null);
  readonly playgroundDraft = signal('');
  readonly lastTools = signal<AgentToolTrace[]>([]);

  readonly sections: Array<{ id: SellerSectionId; label: string }> = [
    { id: 'basics', label: 'Básico' },
    { id: 'audience', label: 'Audiencia' },
    { id: 'personality', label: 'Personalidad' },
    { id: 'messages', label: 'Mensajes' },
    { id: 'handoff', label: 'Handoff' },
    { id: 'limits', label: 'Límites' },
    { id: 'knowledge', label: 'Conocimiento' },
    { id: 'journeys', label: 'Recorrido' },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    companyName: [''],
    companyDescription: [''],
    audienceDescription: [''],
    rulesText: [''],
    communicationStyle: [''],
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
    isActive: [true],
  });

  private readonly formValues = toSignal(
    this.form.valueChanges.pipe(
      startWith(this.form.getRawValue()),
      map(() => this.form.getRawValue()),
    ),
    { initialValue: this.form.getRawValue() },
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

  readonly playgroundMessages = computed(
    () => this.playgroundSession()?.messages ?? [],
  );

  constructor() {
    void this.load();
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('playground') === '1' && !this.playgroundOpen()) {
        void this.openPlayground();
      }
    });
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const [agent, faqs, journeys] = await Promise.all([
        this.api.getPrimary(),
        this.knowledgeApi.listFaqs(),
        this.knowledgeApi.listJourneys(),
      ]);
      this.patchForm(agent);
      this.quality.set(agent.quality);
      this.faqs.set(faqs);
      this.journeys.set(journeys);
      this.dirty.set(false);
    } catch {
      this.errorMessage.set(
        'No pudimos cargar tu vendedor IA. Revisa la API e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  markDirty(): void {
    this.dirty.set(true);
    this.successMessage.set(null);
    this.quality.set(this.estimateQuality(this.form.getRawValue()));
  }

  scrollTo(section: SellerSectionId): void {
    this.activeSection.set(section);
    const el = document.getElementById(`seller-${section}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async openPlayground(): Promise<void> {
    this.playgroundOpen.set(true);
    this.playgroundError.set(null);
    this.playgroundLoading.set(true);
    try {
      if (this.dirty()) {
        await this.save(true);
      }
      const session = await this.api.getPlaygroundSession();
      this.playgroundSession.set(session);
      const lastAgent = [...session.messages]
        .reverse()
        .find((message) => message.authorType === 'SALES_AGENT');
      this.lastTools.set(this.asToolTraces(lastAgent?.toolTraces));
    } catch {
      this.playgroundError.set(
        'No pudimos abrir la prueba. Guarda el vendedor y reintenta.',
      );
    } finally {
      this.playgroundLoading.set(false);
    }
  }

  closePlayground(): void {
    this.playgroundOpen.set(false);
  }

  async resetPlayground(): Promise<void> {
    const session = this.playgroundSession();
    if (!session) return;
    this.playgroundSending.set(true);
    this.playgroundError.set(null);
    try {
      const refreshed = await this.api.resetPlaygroundSession(session.id);
      this.playgroundSession.set(refreshed);
      this.lastTools.set([]);
    } catch {
      this.playgroundError.set('No se pudo reiniciar la prueba.');
    } finally {
      this.playgroundSending.set(false);
    }
  }

  onDraftInput(value: string): void {
    this.playgroundDraft.set(value);
  }

  async sendPlayground(): Promise<void> {
    const session = this.playgroundSession();
    const text = this.playgroundDraft().trim();
    if (!session || !text) return;

    this.playgroundSending.set(true);
    this.playgroundError.set(null);
    try {
      const result = await this.api.sendPlaygroundMessage(session.id, text);
      this.playgroundSession.set(result.session);
      this.lastTools.set(result.lastAgentReply.tools);
      this.playgroundDraft.set('');
    } catch {
      this.playgroundError.set(
        'No se pudo enviar. Revisa productos/FAQs e inténtalo otra vez.',
      );
    } finally {
      this.playgroundSending.set(false);
    }
  }

  sendSuggestion(text: string): void {
    this.playgroundDraft.set(text);
    void this.sendPlayground();
  }

  toolLabel(name: string): string {
    switch (name) {
      case 'search_catalog':
        return 'Catálogo';
      case 'get_product_availability':
        return 'Precio / stock';
      case 'lookup_faq':
        return 'FAQ';
      case 'create_order':
        return 'Pedido';
      case 'create_payment_link':
        return 'Link de pago';
      case 'escalate':
        return 'Handoff';
      default:
        return name;
    }
  }

  isBuyer(message: PlaygroundMessageDto): boolean {
    return message.authorType === 'BUYER';
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
        return 'Soporte';
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
      this.errorMessage.set('La FAQ necesita pregunta y respuesta claras.');
      return;
    }
    this.knowledgeBusy.set(true);
    this.errorMessage.set(null);
    try {
      const created = await this.knowledgeApi.createFaq({ question, answer });
      this.faqs.update((list) => [created, ...list]);
      this.faqQuestion.set('');
      this.faqAnswer.set('');
      this.successMessage.set('FAQ publicada. El vendedor ya puede usarla.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo guardar la FAQ.');
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
      this.successMessage.set('FAQ aprobada y publicada.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo aprobar la FAQ.');
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
      this.errorMessage.set('No se pudo eliminar la FAQ.');
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
          'No detectamos FAQs. Usa bloques separados o líneas Q:/A:.',
        );
        return;
      }
      this.faqs.update((list) => [...result.created, ...list]);
      this.importDraft.set('');
      this.successMessage.set(
        `${result.created.length} borrador${result.created.length === 1 ? '' : 'es'} listo${result.created.length === 1 ? '' : 's'} para revisar. No se publican hasta que apruebes.`,
      );
      await this.refreshQuality();
      this.scrollTo('knowledge');
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
      this.errorMessage.set('La plantilla necesita título y guion.');
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
      this.successMessage.set('Plantilla de recorrido activa.');
      await this.refreshQuality();
    } catch {
      this.errorMessage.set('No se pudo guardar la plantilla.');
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
      this.errorMessage.set('No se pudo actualizar la plantilla.');
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
      this.errorMessage.set('No se pudo eliminar la plantilla.');
    } finally {
      this.knowledgeBusy.set(false);
    }
  }

  async save(quiet = false): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa el nombre del vendedor antes de guardar.');
      this.scrollTo('basics');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    if (!quiet) {
      this.successMessage.set(null);
    }

    try {
      const values = this.form.getRawValue();
      const updated = await this.api.updatePrimary({
        ...values,
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
      });
      this.patchForm(updated);
      this.quality.set(updated.quality);
      this.dirty.set(false);
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

  private async refreshQuality(): Promise<void> {
    try {
      const agent = await this.api.getPrimary();
      this.quality.set(agent.quality);
    } catch {
      this.quality.set(this.estimateQuality(this.form.getRawValue()));
    }
  }

  private asToolTraces(value: unknown): AgentToolTrace[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (item): item is AgentToolTrace =>
        typeof item === 'object' &&
        item !== null &&
        'name' in item &&
        'summary' in item,
    );
  }

  private patchForm(agent: SalesAgentDto): void {
    this.form.reset({
      name: agent.name,
      companyName: agent.companyName ?? '',
      companyDescription: agent.companyDescription ?? '',
      audienceDescription: agent.audienceDescription ?? '',
      rulesText: agent.rulesText ?? '',
      communicationStyle: agent.communicationStyle ?? '',
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
        hint: 'Agrega reglas ALWAYS / NEVER',
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

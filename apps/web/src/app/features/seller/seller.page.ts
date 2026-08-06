import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { map, startWith } from 'rxjs';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsIconComponent } from '../../design-system/icon/ds-icon.component';
import {
  AgentsApiService,
  AgentQuality,
  SalesAgentDto,
} from '../../core/api/agents-api.service';

type SellerSectionId =
  | 'basics'
  | 'audience'
  | 'personality'
  | 'messages'
  | 'handoff';

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
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly quality = signal<AgentQuality | null>(null);
  readonly activeSection = signal<SellerSectionId>('basics');

  readonly sections: Array<{ id: SellerSectionId; label: string }> = [
    { id: 'basics', label: 'Básico' },
    { id: 'audience', label: 'Audiencia' },
    { id: 'personality', label: 'Personalidad' },
    { id: 'messages', label: 'Mensajes' },
    { id: 'handoff', label: 'Handoff' },
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

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const agent = await this.api.getPrimary();
      this.patchForm(agent);
      this.quality.set(agent.quality);
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

  async save(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage.set('Revisa el nombre del vendedor antes de guardar.');
      this.scrollTo('basics');
      return;
    }

    this.saving.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

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
      this.successMessage.set('Vendedor actualizado. Los cambios aplican en el próximo mensaje.');
    } catch {
      this.errorMessage.set(
        'No se pudo guardar. Verifica los campos e inténtalo otra vez.',
      );
    } finally {
      this.saving.set(false);
    }
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
      isActive: agent.isActive,
    });
  }

  private estimateQuality(values: ReturnType<typeof this.form.getRawValue>): AgentQuality {
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
    ];

    const completed = checks.filter((item) => item.ok);
    return {
      score: completed.reduce((sum, item) => sum + item.points, 0),
      max: 200,
      completedFields: completed.length,
      totalFields: checks.length,
      missingHints: checks.filter((item) => !item.ok).map((item) => item.hint).slice(0, 4),
    };
  }
}

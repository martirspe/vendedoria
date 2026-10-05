import { AgentReplyResult } from './sales-agent-runtime.service';
import { CatalogProductView } from './sales-agent-tools.service';
import { SalesStage } from './sales-state';
import { validateSalesResponse } from './sales-response-validator';

export const SALES_METRICS = [
  'context_retention',
  'repeated_question_rate',
  'intent_accuracy',
  'product_accuracy',
  'price_accuracy',
  'inventory_accuracy',
  'hallucination_rate',
  'tool_selection_accuracy',
  'state_transition_accuracy',
  'reference_resolution_accuracy',
  'handoff_accuracy',
  'sales_progression',
] as const;
export type SalesMetric = (typeof SALES_METRICS)[number];
export type SalesExpectation = {
  facts?: Record<string, string>;
  intent?: string;
  productIds?: string[];
  stage?: SalesStage;
  referenceId?: string;
  handoff?: boolean;
  allowedTools?: string[];
  progressed?: boolean;
};

/** Scores annotated outputs. Null means no annotated opportunity, never an invented success. */
export function evaluateSalesTurn(
  result: AgentReplyResult,
  products: CatalogProductView[],
  expected: SalesExpectation,
): Partial<Record<SalesMetric, number>> {
  const state = result.salesState;
  const facts = { ...state?.customerFacts, ...state?.requirements };
  const errors = validateSalesResponse(
    result.replyText,
    products
      .filter((p) => result.replyText.includes(p.name))
      .map((p) => p.name),
    products,
    state,
  );
  const score: Partial<Record<SalesMetric, number>> = {
    repeated_question_rate: errors.includes('repeated_question') ? 1 : 0,
    hallucination_rate: errors.some((e) => e !== 'repeated_question') ? 1 : 0,
  };
  if (
    /(?:S\s*\/|PEN|USD|\$|€)\s*\d|\d\s*(?:soles|dolares)/i.test(
      result.replyText,
    )
  )
    score.price_accuracy = errors.some((e) => e.includes('price')) ? 0 : 1;
  if (/\b(?:stock|agotado|disponible|disponibles)\b/i.test(result.replyText))
    score.inventory_accuracy = errors.some(
      (e) => e.includes('inventory') || e === 'unsupported_variant',
    )
      ? 0
      : 1;
  if (expected.facts)
    score.context_retention =
      Object.entries(expected.facts).filter(([k, v]) => facts[k]?.value === v)
        .length / Math.max(1, Object.keys(expected.facts).length);
  if (expected.intent)
    score.intent_accuracy = state?.intent === expected.intent ? 1 : 0;
  if (expected.productIds)
    score.product_accuracy =
      JSON.stringify(state?.recommendedProductIds ?? []) ===
      JSON.stringify(expected.productIds)
        ? 1
        : 0;
  if (expected.stage)
    score.state_transition_accuracy = state?.stage === expected.stage ? 1 : 0;
  if (expected.referenceId)
    score.reference_resolution_accuracy =
      state?.selectedProduct?.productId === expected.referenceId ? 1 : 0;
  if (expected.handoff !== undefined)
    score.handoff_accuracy = result.escalate === expected.handoff ? 1 : 0;
  if (expected.allowedTools)
    score.tool_selection_accuracy = result.tools.every((t) =>
      expected.allowedTools!.includes(t.name),
    )
      ? 1
      : 0;
  if (expected.progressed !== undefined)
    score.sales_progression =
      (state?.stage !== 'NEW' && state?.stage !== 'DISCOVERY') ===
      expected.progressed
        ? 1
        : 0;
  return score;
}

export function aggregateSalesEvaluations(
  scores: Array<Partial<Record<SalesMetric, number>>>,
) {
  return Object.fromEntries(
    SALES_METRICS.map((metric) => {
      const observed = scores.flatMap((s) =>
        s[metric] === undefined ? [] : [s[metric]],
      );
      return [
        metric,
        {
          samples: observed.length,
          value: observed.length
            ? observed.reduce((sum, n) => sum + n, 0) / observed.length
            : null,
        },
      ];
    }),
  );
}

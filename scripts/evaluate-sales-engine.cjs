/* Run after build: node scripts/evaluate-sales-engine.cjs. No DB, network, secrets or real orders. */
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { Logger } = require('@nestjs/common');
const root = join(__dirname, '..');
const { SalesAgentRuntimeService } = require(join(root, 'apps/api/dist/agent-runtime/sales-agent-runtime.service.js'));
const { SalesAgentToolsService } = require(join(root, 'apps/api/dist/agent-runtime/sales-agent-tools.service.js'));
const { initialSalesState, observeBuyer } = require(join(root, 'apps/api/dist/agent-runtime/sales-state.js'));
const { evaluateSalesTurn, aggregateSalesEvaluations } = require(join(root, 'apps/api/dist/agent-runtime/sales-evaluation.js'));
Logger.overrideLogger(false);
const fixtures = JSON.parse(readFileSync(join(root, 'docs/agent/evals/sales-engine.json'), 'utf8'));
const product = (id, name, cents) => ({ id, handle: id, name, descriptionShort: 'Para uso diario', basePriceCents: cents, currency: 'PEN', categories: ['Zapatillas'], isAvailable: true, stockUnlimited: false, stockQty: 2, stockLabel: '2 en stock', priceLabel: `S/ ${(cents / 100).toFixed(2)}`, isService: false, productUrl: null, imageUrl: null, variants: [{ id: `${id}-40`, label: 'Negro / 40', isAvailable: true, priceCents: cents, priceLabel: `S/ ${(cents / 100).toFixed(2)}`, stockLabel: '2 en stock' }] });

async function main() {
  const cases = [];
  for (const fixture of fixtures) {
    if (fixture.integration) { cases.push({ id: fixture.id, integration: fixture.integration, metrics: null }); continue; }
    let catalog = [product('one', 'Zapatilla negra Uno', fixture.priceCents ?? 15000), product('two', 'Zapatilla negra Dos', 16000)];
    if (fixture.exhausted) catalog[0] = { ...catalog[0], stockQty: 0, stockLabel: 'Agotado', isAvailable: false, variants: [] };
    if (fixture.deactivated) catalog = catalog.filter((p) => p.id !== 'one');
    const config = { get: (_key, fallback) => fallback };
    const tools = new SalesAgentToolsService(null, null, config);
    tools.listAvailableProducts = async (tenantId) => tenantId === 'fixture' ? catalog : [];
    tools.getProducts = async (tenantId, ids) => tenantId === 'fixture' ? catalog.filter((p) => ids.includes(p.id)) : [];
    tools.catalogOverview = async () => ({ total: catalog.length, categories: [], storeUrl: null });
    tools.browseProducts = async () => ({ products: catalog, remaining: 0 });
    tools.shippingRules = async () => null;
    const runtime = new SalesAgentRuntimeService({ salesAgent: { findFirst: async () => null } }, config, tools, { getRuntimeKnowledge: async () => ({ faqs: [], journeys: [] }) });
    let state = initialSalesState();
    for (const [i, text] of (fixture.history ?? []).entries()) state = observeBuyer(state, text, `fixture-${i}`);
    if (fixture.recommended) state.recommendedProductIds = fixture.recommended;
    if (fixture.selected) state.selectedProduct = { productId: fixture.selected };
    const result = await runtime.generateReply({ tenantId: 'fixture', inboundText: fixture.text, mode: 'playground', salesState: state, allowAi: false });
    const metrics = evaluateSalesTurn(result, catalog, fixture.expected);
    cases.push({ id: fixture.id, metrics });
  }
  const report = { mode: 'deterministic-offline', fixtureCount: fixtures.length, runtimeCases: cases.filter((c) => c.metrics).length, integrationCases: cases.filter((c) => !c.metrics).length, metrics: aggregateSalesEvaluations(cases.flatMap((c) => c.metrics ? [c.metrics] : [])), cases };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  const failures = cases.filter((c) => c.metrics && Object.entries(c.metrics).some(([name, score]) => ['repeated_question_rate', 'hallucination_rate'].includes(name) ? score !== 0 : score !== 1));
  if (failures.length) { process.stderr.write(`Evaluation failed: ${failures.map((c) => c.id).join(', ')}\n`); process.exitCode = 1; }
}
main().catch((error) => { process.stderr.write(`Evaluation failed: ${error.name}\n`); process.exitCode = 1; });

import { buildAgentPrompt, toPersonality } from './sales-playbook';

describe('sales playbook prompt', () => {
  const base = toPersonality(null);

  it('compiles the guided persona with the selected techniques only', () => {
    const prompt = buildAgentPrompt({
      ...base,
      name: 'Valeria',
      companyName: 'Marrso',
      salesTechniques: ['alternative_close'],
    });
    expect(prompt).toContain('Eres Valeria');
    expect(prompt).toContain('MÉTODO DE VENTA');
    expect(prompt).toContain('Cierre por alternativa');
    expect(prompt).not.toContain('Escasez real');
  });

  it('replaces the persona in custom mode but keeps the system guardrails', () => {
    const prompt = buildAgentPrompt({
      ...base,
      promptMode: 'custom',
      customPrompt: 'Vende como un sommelier.',
      catalogOnlyFacts: true,
      neverOfferDiscount: true,
    });
    expect(prompt).toContain('Vende como un sommelier.');
    expect(prompt).not.toContain('MÉTODO DE VENTA');
    expect(prompt).toContain('REGLAS DEL SISTEMA');
    expect(prompt).toContain('Nunca inventes precios');
    expect(prompt).toContain('Nunca ofrezcas descuentos');
  });

  it('falls back to the guided persona when custom mode has an empty prompt', () => {
    const prompt = buildAgentPrompt({ ...base, promptMode: 'custom', customPrompt: '  ' });
    expect(prompt).toContain('MÉTODO DE VENTA');
  });
});

import { buildImagePrompt, imageSize } from './store-ai-image';

describe('store AI images', () => {
  const request = {
    business: { industry: 'belleza', categories: ['Cuidado facial'] },
    section: { label: 'Portada', description: undefined },
    texts: ['Tu rutina, tu momento'],
    instruction: 'Tonos verdes',
  };

  it('describes the mood and always carries the no-product and no-text rules', () => {
    const prompt = buildImagePrompt(request);
    expect(prompt).toContain('belleza');
    expect(prompt).toContain('Tonos verdes');
    expect(prompt).toContain('this is not a product photo');
    expect(prompt).toContain('No text, letters, numbers, logos');
    expect(prompt.indexOf('Tonos verdes')).toBeLessThan(
      prompt.indexOf('Strict rules'),
    );
  });

  it('leaves out generic industries and empty data', () => {
    const prompt = buildImagePrompt({
      ...request,
      business: { industry: 'general', categories: [] },
      texts: [],
      instruction: '',
    });
    expect(prompt).not.toContain('Business type');
    expect(prompt).not.toContain('It sells');
    expect(prompt).not.toContain("Merchant's wish (in Spanish)");
  });

  it('uses a portrait photo only for the Selecta cover', () => {
    expect(imageSize('selecta', 'hero')).toBe('1024x1536');
    expect(imageSize('classic', 'hero')).toBe('1536x1024');
    expect(imageSize('selecta', 'banner')).toBe('1536x1024');
  });
});

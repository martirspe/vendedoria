import { resolveSellerPreset, SELLER_PRESETS } from './seller-config';

describe('personality profile selection', () => {
  const preset = SELLER_PRESETS[0];
  const settings = { ...preset, promptMode: 'guided' };
  it('recognizes an unchanged preset regardless of technique ordering', () => {
    expect(resolveSellerPreset({ ...settings, salesTechniques: [...settings.salesTechniques].reverse() })).toBe(preset.id);
  });
  it('marks changed tone, length or techniques as personalized', () => {
    expect(resolveSellerPreset({ ...settings, communicationStyle: 'Mi propio tono' })).toBe('custom');
    expect(resolveSellerPreset({ ...settings, responseLength: 'detailed' })).toBe('custom');
    expect(resolveSellerPreset({ ...settings, salesTechniques: settings.salesTechniques.slice(1) })).toBe('custom');
  });
  it('retains an explicit personalized selection even if its settings resemble a preset', () => {
    expect(resolveSellerPreset({ ...settings, personalityPreset: 'custom' })).toBe('custom');
    expect(settings.communicationStyle).toBe(preset.communicationStyle);
  });
  it('recognizes independently written prompts as personalized', () => {
    expect(resolveSellerPreset({ ...settings, promptMode: 'custom' })).toBe('custom');
  });
});

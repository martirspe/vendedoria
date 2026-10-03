import { splitInstagramText } from './meta-instagram.client';

describe('splitInstagramText', () => {
  it('keeps short replies in one message', () => {
    expect(splitInstagramText('  Hola, ¿qué talla buscas?  ')).toEqual(['Hola, ¿qué talla buscas?']);
  });

  it('splits long replies at a space under the Instagram limit', () => {
    const text = Array.from({ length: 300 }, (_, i) => `palabra${i}`).join(' ');
    const parts = splitInstagramText(text);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((part) => part.length <= 1000)).toBe(true);
    expect(parts.join(' ')).toBe(text);
  });

  it('cuts text without spaces at the limit', () => {
    const parts = splitInstagramText('a'.repeat(2500));
    expect(parts.map((part) => part.length)).toEqual([1000, 1000, 500]);
  });
});

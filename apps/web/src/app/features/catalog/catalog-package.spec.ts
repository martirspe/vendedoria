import { imageKey, readPackage, referencedImages } from './catalog-package';

const file = (content: string, name = 'f') => new File([content], name);

describe('imageKey', () => {
  it('matches the API normalization', () => {
    expect(imageKey('/images/products/a/foto-1.jpg')).toBe('a/foto-1.jpg');
    expect(imageKey('images/a/foto-1.png')).toBe('a/foto-1.png');
    expect(imageKey('https://cdn.example.com/a.jpg')).toBeNull();
    expect(imageKey('../a.jpg')).toBeNull();
  });
});

describe('referencedImages', () => {
  it('collects product and store photos and ignores invalid JSON', () => {
    const text = JSON.stringify({
      store: { heroImage: '/images/products/hero/1.jpg' },
      products: [{ content: { images: [{ url: '/images/products/a/1.jpg' }, { url: 'https://x/y.jpg' }] } }],
    });
    expect([...referencedImages(text)].sort()).toEqual(['a/1.jpg', 'hero/1.jpg']);
    expect(referencedImages('{nope').size).toBe(0);
  });
});

describe('readPackage', () => {
  it('finds catalog.json and maps photos under its images folder', async () => {
    const pkg = await readPackage([
      { path: 'selecta/catalog.json', file: file('{"products":[{"content":{"images":[{"url":"/images/products/a/1.jpg"}]}}]}') },
      { path: 'selecta/images/a/1.jpg', file: file('x') },
      { path: 'selecta/images/a/notes.txt', file: file('x') },
      { path: 'selecta/otros/b.jpg', file: file('x') },
    ]);
    expect(pkg?.folderName).toBe('selecta');
    expect([...(pkg?.images.keys() ?? [])]).toEqual(['a/1.jpg']);
    expect([...(pkg?.referenced ?? [])]).toEqual(['a/1.jpg']);
  });

  it('returns null without catalog.json', async () => {
    expect(await readPackage([{ path: 'x/images/a.jpg', file: file('x') }])).toBeNull();
  });
});

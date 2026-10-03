/**
 * Reads a catalog package chosen in the browser: a folder with `catalog.json` and an
 * `images/` folder. The API validates everything again; this only finds the files, maps
 * photo paths the same way the API does and hashes the photos the catalog uses.
 */

export type PackageEntry = { path: string; file: File };

export type CatalogPackage = {
  folderName: string;
  catalogText: string;
  /** Photo path inside `images/` → file. */
  images: Map<string, File>;
  /** Photo paths the catalog references. */
  referenced: Set<string>;
};

const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;
const CATALOG_FILE = 'catalog.json';

/** Same normalization as the API: "/images/products/a/1.jpg", "images/a/1.jpg" and "a/1.jpg" match. */
export function imageKey(reference: unknown): string | null {
  if (typeof reference !== 'string') return null;
  const path = reference.trim().replace(/\\/g, '/');
  if (!path || /^[a-z][a-z0-9+.-]*:/i.test(path) || path.startsWith('//')) return null;
  const key = path.replace(/^\/+/, '').replace(/^images\/products\//, '').replace(/^images\//, '');
  if (!IMAGE_EXT.test(key) || key.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return key.slice(0, 300);
}

/** Photo paths used by products and by the optional store block. Invalid JSON yields none. */
export function referencedImages(catalogText: string): Set<string> {
  const keys = new Set<string>();
  let root: unknown;
  try {
    root = JSON.parse(catalogText);
  } catch {
    return keys;
  }
  const record = (value: unknown): Record<string, unknown> | null =>
    typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  const add = (value: unknown) => {
    const key = imageKey(value);
    if (key) keys.add(key);
  };
  const data = record(root);
  for (const product of Array.isArray(data?.['products']) ? data['products'] : []) {
    const images = record(record(product)?.['content'])?.['images'];
    for (const image of Array.isArray(images) ? images : []) add(record(image)?.['url']);
  }
  const store = record(data?.['store']);
  add(store?.['heroImage']);
  add(store?.['bannerImage']);
  return keys;
}

/** Locates `catalog.json` (the shallowest one) and the photos under its `images/` folder. */
export async function readPackage(entries: PackageEntry[]): Promise<CatalogPackage | null> {
  const normalized = entries.map((entry) => ({ ...entry, path: entry.path.replace(/\\/g, '/').replace(/^\/+/, '') }));
  const catalog = normalized
    .filter((entry) => entry.path.split('/').pop()?.toLowerCase() === CATALOG_FILE)
    .sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
  if (!catalog) return null;
  const base = catalog.path.slice(0, catalog.path.length - CATALOG_FILE.length);
  const imagesRoot = `${base}images/`;
  const images = new Map<string, File>();
  for (const entry of normalized) {
    if (!entry.path.startsWith(imagesRoot) || !IMAGE_EXT.test(entry.path)) continue;
    const key = imageKey(entry.path.slice(imagesRoot.length));
    if (key) images.set(key, entry.file);
  }
  const catalogText = await catalog.file.text();
  return {
    folderName: base.replace(/\/$/, '').split('/').pop() || CATALOG_FILE,
    catalogText,
    images,
    referenced: referencedImages(catalogText),
  };
}

export async function sha256(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Files of a folder input (`webkitdirectory`), keeping their path inside the folder. */
export function entriesFromInput(files: FileList | null): PackageEntry[] {
  return Array.from(files ?? [], (file) => ({ path: file.webkitRelativePath || file.name, file }));
}

/** Files of a dropped folder (or loose files), walking sub-folders. */
export async function entriesFromDrop(transfer: DataTransfer): Promise<PackageEntry[]> {
  const roots = Array.from(transfer.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => Boolean(entry));
  if (!roots.length) return Array.from(transfer.files, (file) => ({ path: file.name, file }));
  const out: PackageEntry[] = [];
  const walk = async (entry: FileSystemEntry, prefix: string): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ path: `${prefix}${entry.name}`, file });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${prefix}${entry.name}/`);
    }
  };
  for (const root of roots) await walk(root, '');
  return out;
}

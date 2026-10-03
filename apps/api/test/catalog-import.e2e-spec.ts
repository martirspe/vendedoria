import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { CatalogImportService } from '../src/catalog/catalog-import.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { PrismaService } from '../src/prisma/prisma.service';

/** Bulk import writes only into the caller's catalog, keeps console edits and reuses photos. */
describe('Catalog import (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let importer: CatalogImportService;
  const run = randomBytes(3).toString('hex');
  const tenantIds: string[] = [];
  const emails: string[] = [];
  let owner: AuthUserPayload;
  let other: AuthUserPayload;
  let photo: Buffer;

  const createUser = async (
    label: string,
    role: 'OWNER' | 'AGENT',
    tenantId?: string,
  ): Promise<AuthUserPayload> => {
    const id =
      tenantId ??
      (
        await prisma.tenant.create({
          data: { name: `Import ${label}`, slug: `import-${label}-${run}` },
        })
      ).id;
    if (!tenantId) tenantIds.push(id);
    const email = `${label}-${run}@example.test`;
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x', fullName: label },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: id, role },
    });
    emails.push(email);
    return { userId: user.id, email, tenantId: id, membershipRole: role };
  };

  const catalog = (priceCents = 1500) =>
    JSON.stringify({
      source: 'Prueba e2e',
      store: {
        industry: 'belleza',
        template: 'selecta',
        freeShippingFromCents: 50000,
      },
      products: [
        {
          slug: 'colonia',
          name: 'Colonia',
          category: 'Perfumería',
          priceCents,
          content: {
            format: 'individual',
            images: [{ url: '/images/products/colonia/1.jpg' }],
            inventory: [{ sku: 'C1', quantity: 1 }],
          },
        },
        {
          slug: 'crema',
          name: 'Crema',
          category: 'Cuidado',
          priceCents: 2000,
          content: {
            format: 'individual',
            images: [{ url: '/images/products/crema/1.jpg' }],
            inventory: [{ sku: 'K1', quantity: 1 }],
          },
        },
        {
          slug: 'set-duo',
          name: 'Set dúo',
          category: 'Sets',
          priceCents: 3000,
          content: {
            format: 'set',
            images: [
              { url: '/images/products/colonia/1.jpg' },
              { url: '/images/products/crema/1.jpg' },
            ],
            inventory: [
              { sku: 'C1', quantity: 1 },
              { sku: 'K1', quantity: 1 },
            ],
          },
        },
        {
          slug: 'sin-precio',
          name: 'Sin precio',
          priceCents: null,
          content: { inventory: [{ sku: 'S1', quantity: 1 }] },
        },
      ],
      inventory: [
        { sku: 'C1', stock: 5 },
        { sku: 'K1', stock: 3 },
        { sku: 'S1', stock: 1 },
      ],
    });

  const files = [
    { path: 'colonia/1.jpg', hash: 'a'.repeat(64) },
    { path: 'crema/1.jpg', hash: 'b'.repeat(64) },
  ];

  /** Uploads what the preview asks for, as the console does, and commits. */
  const importAs = async (
    user: AuthUserPayload,
    options = {},
    text = catalog(),
  ) => {
    const report = await importer.preview(user, {
      catalog: text,
      files,
      options,
    });
    const uploaded = [];
    for (const item of report.uploads) {
      const { url } = await importer.uploadPhoto(user, {
        contentType: 'image/jpeg',
        data: photo.toString('base64'),
      });
      uploaded.push({ hash: item.hash, url });
    }
    const result = await importer.commit(user, {
      catalog: text,
      files,
      options,
      uploaded,
    });
    return { report, result };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    prisma = app.get(PrismaService);
    importer = app.get(CatalogImportService);
    photo = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#c8f542' },
    })
      .jpeg()
      .toBuffer();
    owner = await createUser('owner', 'OWNER');
    other = await createUser('other', 'OWNER');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.productComponent.deleteMany({
        where: { set: { tenantId: { in: tenantIds } } },
      });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    }
    await app?.close();
  });

  it('previews without writing and only owners or admins can import', async () => {
    const report = await importer.preview(owner, { catalog: catalog(), files });
    expect(report).toMatchObject({
      canImport: true,
      summary: { products: 4, create: 4, sets: 1, uploads: 2 },
    });
    expect(
      report.products.find((p) => p.handle === 'sin-precio')?.published,
    ).toBe(false);
    expect(
      await prisma.product.count({ where: { tenantId: owner.tenantId } }),
    ).toBe(0);

    const agent = await createUser('agent', 'AGENT', owner.tenantId);
    await expect(
      importer.preview(agent, { catalog: catalog(), files }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('creates products, sets and photos in one go', async () => {
    const { result } = await importAs(owner, { applyStoreSettings: true });
    expect(result).toEqual({
      created: 4,
      updated: 0,
      published: 3,
      hidden: 0,
      storeUpdated: true,
    });

    const products = await prisma.product.findMany({
      where: { tenantId: owner.tenantId },
      include: { media: true, components: { include: { component: true } } },
    });
    const byHandle = new Map(products.map((p) => [p.handle, p]));
    expect(byHandle.get('colonia')).toMatchObject({
      basePriceCents: 1500,
      stockUnlimited: false,
      stockQty: 5,
      sku: 'C1',
    });
    expect(byHandle.get('sin-precio')?.isPublishedOnStore).toBe(false);
    const set = byHandle.get('set-duo')!;
    expect(set.stockUnlimited).toBe(true);
    expect(set.components.map((c) => c.component.handle).sort()).toEqual([
      'colonia',
      'crema',
    ]);
    // The set reuses its pieces' photos: two files stored once each.
    expect(set.media.map((m) => m.url).sort()).toEqual(
      [
        byHandle.get('colonia')!.media[0].url,
        byHandle.get('crema')!.media[0].url,
      ].sort(),
    );
    expect(set.media.every((m) => m.sourceHash)).toBe(true);

    const store = await prisma.storefront.findUniqueOrThrow({
      where: { tenantId: owner.tenantId },
    });
    expect(store).toMatchObject({
      industry: 'belleza',
      template: 'selecta',
      freeShippingFromCents: 50000,
    });
  });

  it('re-imports keeping console prices and stock, without uploading photos again', async () => {
    await prisma.product.updateMany({
      where: { tenantId: owner.tenantId, handle: 'colonia' },
      data: { basePriceCents: 1800, stockQty: 2 },
    });
    const { report, result } = await importAs(owner, {}, catalog(1600));
    expect(report.summary.uploads).toBe(0);
    expect(result).toMatchObject({ created: 0, updated: 4 });
    const colonia = await prisma.product.findFirstOrThrow({
      where: { tenantId: owner.tenantId, handle: 'colonia' },
    });
    expect(colonia).toMatchObject({ basePriceCents: 1800, stockQty: 2 });

    await importAs(
      owner,
      { updatePrices: true, updateStock: true },
      catalog(1600),
    );
    const updated = await prisma.product.findFirstOrThrow({
      where: { tenantId: owner.tenantId, handle: 'colonia' },
    });
    expect(updated).toMatchObject({ basePriceCents: 1600, stockQty: 5 });
  });

  it('hides products missing from the file only on full sync', async () => {
    await prisma.product.create({
      data: {
        tenantId: owner.tenantId,
        handle: 'viejo',
        name: 'Viejo',
        basePriceCents: 900,
        isPublishedOnStore: true,
      },
    });
    const { result } = await importAs(owner, { fullSync: true });
    expect(result.hidden).toBe(1);
    const viejo = await prisma.product.findFirstOrThrow({
      where: { tenantId: owner.tenantId, handle: 'viejo' },
    });
    expect(viejo.isPublishedOnStore).toBe(false);
  });

  it('never touches another business and rejects photos it did not upload', async () => {
    const report = await importer.preview(other, { catalog: catalog(), files });
    expect(report.summary).toMatchObject({ create: 4, update: 0, uploads: 2 });
    await expect(
      importer.commit(other, {
        catalog: catalog(),
        files,
        uploaded: files.map((f) => ({
          hash: f.hash,
          url: `https://evil.example/${f.hash.slice(0, 32)}.webp`,
        })),
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      importer.commit(other, { catalog: catalog(), files, uploaded: [] }),
    ).rejects.toThrow(/fotos por subir/);
    expect(
      await prisma.product.count({ where: { tenantId: other.tenantId } }),
    ).toBe(0);
  });
});

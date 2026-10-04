import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { MAX_VERSIONS, StorefrontEditorService } from '../src/storefront/storefront-editor.service';

/** Published versions of the store design: history, restore into the draft and scheduled publishing. */
describe('Store editor versions (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let editor: StorefrontEditorService;
  const run = randomBytes(3).toString('hex');
  const owners: AuthUserPayload[] = [];

  const content = (title: string) => ({ version: 1, sections: { hero: { title } } });
  const titleOf = (state: { content: { sections: Record<string, Record<string, string>> } }) =>
    state.content.sections['hero']?.['title'];

  async function createOwner(name: string): Promise<AuthUserPayload> {
    const slug = `${name}-${run}`;
    const email = `owner-${slug}@example.test`;
    const tenant = await prisma.tenant.create({
      data: {
        name: slug,
        slug,
        planTier: 'SCALE',
        planTrial: false,
        planExpiresAt: new Date(Date.now() + 30 * 86_400_000),
        storefront: { create: { displayName: `Tienda ${slug}`, status: 'PUBLISHED' } },
      },
    });
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', fullName: 'Dueño' } });
    await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    const owner: AuthUserPayload = { userId: user.id, email, tenantId: tenant.id, membershipRole: 'OWNER' };
    await app.get(IntegrationsService).enable(owner, 'store');
    owners.push(owner);
    return owner;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    editor = app.get(StorefrontEditorService);
  });

  afterAll(async () => {
    if (prisma && owners.length) {
      await prisma.tenant.deleteMany({ where: { id: { in: owners.map((o) => o.tenantId) } } });
      await prisma.user.deleteMany({ where: { email: { in: owners.map((o) => o.email) } } });
    }
    await app?.close();
  });

  it('keeps the replaced content on each publish and restores it into the draft', async () => {
    const owner = await createOwner('versions');
    await editor.saveDraft(owner.tenantId, content('Primera'));
    await editor.publish(owner.tenantId);
    await editor.saveDraft(owner.tenantId, content('Segunda'));
    await editor.publish(owner.tenantId);

    const versions = await editor.versions(owner.tenantId);
    expect(versions).toHaveLength(2);
    const restored = await editor.restore(owner.tenantId, versions[0].id);
    expect(titleOf(restored)).toBe('Primera');
    expect(restored.hasUnpublishedChanges).toBe(true);

    // The oldest version is the template before any edit: restoring it is a full undo.
    const original = await editor.restore(owner.tenantId, versions[1].id);
    expect(original.content.sections).toEqual({});
  });

  it('caps the history', async () => {
    const owner = await createOwner('cap');
    for (let i = 0; i <= MAX_VERSIONS; i++) {
      await editor.saveDraft(owner.tenantId, content(`Versión ${i}`));
      await editor.publish(owner.tenantId);
    }
    expect(await editor.versions(owner.tenantId)).toHaveLength(MAX_VERSIONS);
  });

  it('never restores a version of another business', async () => {
    const owner = await createOwner('own');
    const other = await createOwner('other');
    await editor.saveDraft(other.tenantId, content('Ajena'));
    await editor.publish(other.tenantId);
    const [foreign] = await editor.versions(other.tenantId);

    await expect(editor.restore(owner.tenantId, foreign.id)).rejects.toThrow(NotFoundException);
    expect(await editor.versions(owner.tenantId)).toEqual([]);
  });

  it('publishes a scheduled draft when its time comes and only once', async () => {
    const owner = await createOwner('schedule');
    await expect(editor.schedule(owner.tenantId, new Date(Date.now() + 3600_000))).rejects.toThrow(BadRequestException);

    await editor.saveDraft(owner.tenantId, content('Programada'));
    await expect(editor.schedule(owner.tenantId, new Date(Date.now() + 60_000))).rejects.toThrow(BadRequestException);
    const scheduled = await editor.schedule(owner.tenantId, new Date(Date.now() + 3600_000));
    expect(scheduled.scheduledAt).not.toBeNull();

    expect(await editor.publishScheduled(new Date())).toBe(0);
    expect(await editor.publishScheduled(new Date(Date.now() + 2 * 3600_000))).toBeGreaterThanOrEqual(1);
    const state = await editor.get(owner.tenantId);
    expect(state).toMatchObject({ hasUnpublishedChanges: false, scheduledAt: null });
    expect(titleOf(state)).toBe('Programada');
    expect(await editor.versions(owner.tenantId)).toHaveLength(1);
  });

  it('drops the schedule when the draft is discarded', async () => {
    const owner = await createOwner('discard');
    await editor.saveDraft(owner.tenantId, content('Borrador'));
    await editor.schedule(owner.tenantId, new Date(Date.now() + 3600_000));
    expect((await editor.discard(owner.tenantId)).scheduledAt).toBeNull();
    const row = await prisma.storefront.findUniqueOrThrow({ where: { tenantId: owner.tenantId } });
    expect(row.templatePublishAt).toBeNull();
  });
});

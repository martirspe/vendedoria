import {
  BadRequestException,
  ForbiddenException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import { AppModule } from '../src/app.module';
import { currentPeriodStart } from '../src/billing/plan-catalog';
import { MediaService } from '../src/catalog/media.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { StorefrontAiService } from '../src/storefront/storefront-ai.service';

/** Writing assistant of the store editor: schema checks, plan quota and output filtering. */
describe('Store editor AI texts (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let ai: StorefrontAiService;
  let config: ConfigService;
  const run = randomBytes(3).toString('hex');
  const owners: AuthUserPayload[] = [];

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
        storefront: {
          create: { displayName: `Tienda ${slug}`, status: 'PUBLISHED' },
        },
      },
    });
    const user = await prisma.user.create({
      data: { email, passwordHash: 'x', fullName: 'Dueño' },
    });
    await prisma.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' },
    });
    const owner: AuthUserPayload = {
      userId: user.id,
      email,
      tenantId: tenant.id,
      membershipRole: 'OWNER',
    };
    await app.get(IntegrationsService).enable(owner, 'store');
    owners.push(owner);
    return owner;
  }

  function withKey(key: string | undefined): void {
    jest
      .spyOn(config, 'get')
      .mockImplementation((name: string, fallback?: unknown) =>
        name === 'OPENAI_API_KEY' ? key : fallback,
      );
  }

  function modelReturns(suggestions: string[]): jest.SpyInstance {
    return jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ suggestions }) } }],
        }),
      ),
    );
  }

  const usage = (tenantId: string) =>
    prisma.aiUsageMonth.findUnique({
      where: {
        tenantId_periodStart: { tenantId, periodStart: currentPeriodStart() },
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    prisma = app.get(PrismaService);
    ai = app.get(StorefrontAiService);
    config = app.get(ConfigService);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    if (prisma && owners.length) {
      await prisma.tenant.deleteMany({
        where: { id: { in: owners.map((o) => o.tenantId) } },
      });
      await prisma.user.deleteMany({
        where: { email: { in: owners.map((o) => o.email) } },
      });
    }
    await app?.close();
  });

  it('is unavailable without an OpenAI key', async () => {
    const owner = await createOwner('ai-off');
    withKey(undefined);
    await expect(
      ai.suggestText(owner.tenantId, {
        section: 'hero',
        field: 'title',
        action: 'write',
      }),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it('only writes text fields of the store template', async () => {
    const owner = await createOwner('ai-schema');
    withKey('test-key');
    const fetch = modelReturns(['Hola']);
    for (const input of [
      { section: 'hero', field: 'image', action: 'write' as const },
      { section: 'hero', field: 'unknown', action: 'write' as const },
      { section: 'collection', field: 'title', action: 'write' as const },
      { section: 'hero', field: 'title', action: 'shorter' as const },
    ]) {
      await expect(ai.suggestText(owner.tenantId, input)).rejects.toThrow(
        BadRequestException,
      );
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('filters invented prices and counts one AI reply per request', async () => {
    const owner = await createOwner('ai-ok');
    withKey('test-key');
    modelReturns([
      'Todo a S/ 20',
      'Tu estilo empieza aquí',
      'Elige lo que te hace bien',
    ]);
    const result = await ai.suggestText(owner.tenantId, {
      section: 'hero',
      field: 'title',
      action: 'write',
    });
    expect(result.suggestions).toEqual([
      'Tu estilo empieza aquí',
      'Elige lo que te hace bien',
    ]);
    expect(await usage(owner.tenantId)).toMatchObject({
      editorTexts: 1,
      replies: 0,
    });
  });

  it('writes a library block of the template, never customer reviews', async () => {
    const owner = await createOwner('ai-section');
    withKey('test-key');
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  type: 'benefits',
                  texts: {
                    title: 'Comprar aquí es fácil',
                    item1Title: 'Atención cercana',
                  },
                }),
              },
            },
          ],
        }),
      ),
    );
    const section = await ai.suggestSection(
      owner.tenantId,
      'Beneficios de mi tienda',
    );
    expect(section).toEqual({
      type: 'benefits',
      texts: { title: 'Comprar aquí es fácil', item1Title: 'Atención cercana' },
    });
    const sent = JSON.parse(
      (fetch.mock.calls[0][1] as RequestInit).body as string,
    ) as {
      messages: { content: string }[];
    };
    expect(sent.messages[1].content).not.toContain('"testimonials"');
    expect((await usage(owner.tenantId))?.editorTexts).toBe(1);
  });

  it('has its own monthly cap, apart from the agent replies', async () => {
    const owner = await createOwner('ai-quota');
    withKey('test-key');
    const fetch = modelReturns(['Hola']);
    const periodStart = currentPeriodStart();
    await prisma.aiUsageMonth.create({
      data: { tenantId: owner.tenantId, periodStart, replies: 1_000_000 },
    });
    await expect(
      ai.suggestText(owner.tenantId, {
        section: 'hero',
        field: 'title',
        action: 'write',
      }),
    ).resolves.toEqual({ suggestions: ['Hola'] });

    // SCALE includes 1 000 editor texts a month.
    await prisma.aiUsageMonth.update({
      where: {
        tenantId_periodStart: { tenantId: owner.tenantId, periodStart },
      },
      data: { editorTexts: 1_000 },
    });
    fetch.mockClear();
    await expect(
      ai.suggestText(owner.tenantId, {
        section: 'hero',
        field: 'title',
        action: 'write',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('writes a whole home page without the how-to-buy steps or photo blocks', async () => {
    const owner = await createOwner('ai-page');
    withKey('test-key');
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  sections: {
                    hero: { title: 'Cuida tu piel' },
                    how: { title: 'Pasos' },
                  },
                  blocks: [
                    { type: 'benefits', texts: { title: 'Por qué elegirnos' } },
                    { type: 'gallery', texts: { title: 'Fotos' } },
                    { type: 'cta', texts: { title: 'Mira el catálogo' } },
                  ],
                }),
              },
            },
          ],
        }),
      ),
    );
    await expect(
      ai.suggestPage(owner.tenantId, 'Cosmética natural'),
    ).resolves.toEqual({
      sections: { hero: { title: 'Cuida tu piel' } },
      blocks: [
        { type: 'benefits', texts: { title: 'Por qué elegirnos' } },
        { type: 'cta', texts: { title: 'Mira el catálogo' } },
      ],
    });
    const sent = JSON.parse(
      (fetch.mock.calls[0][1] as RequestInit).body as string,
    ) as { messages: { content: string }[] };
    for (const left of ['"how"', '"gallery"', '"testimonials"', '"whatsapp"']) {
      expect(sent.messages[1].content).not.toContain(left);
    }
    expect((await usage(owner.tenantId))?.editorTexts).toBe(1);
  });

  describe('ambiance images', () => {
    async function imageReturns(): Promise<jest.SpiedFunction<typeof fetch>> {
      const webp = await sharp({
        create: {
          width: 48,
          height: 32,
          channels: 3,
          background: '#c8a99a',
        },
      })
        .webp()
        .toBuffer();
      return jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ data: [{ b64_json: webp.toString('base64') }] }),
          ),
        );
    }

    it('only fills image fields, never the real-photo gallery', async () => {
      const owner = await createOwner('img-schema');
      withKey('test-key');
      const fetch = await imageReturns();
      for (const input of [
        { section: 'hero', field: 'title' },
        { section: 'hero', field: 'unknown' },
        { section: 'gallery-a1b2c3', field: 'image1' },
      ]) {
        await expect(ai.suggestImage(owner.tenantId, input)).rejects.toThrow(
          BadRequestException,
        );
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('saves the photo as an upload of the business and counts one image', async () => {
      const owner = await createOwner('img-ok');
      withKey('test-key');
      const fetch = await imageReturns();
      const { url } = await ai.suggestImage(owner.tenantId, {
        section: 'hero',
        field: 'image',
        instruction: 'Tonos cálidos',
      });
      expect(app.get(MediaService).isOwnUpload(owner.tenantId, url)).toBe(true);
      const sent = JSON.parse(
        (fetch.mock.calls[0][1] as RequestInit).body as string,
      ) as { prompt: string; size: string };
      expect(sent.size).toBe('1536x1024');
      expect(sent.prompt).toContain('Tonos cálidos');
      expect(sent.prompt).toContain('not a product photo');
      expect(await usage(owner.tenantId)).toMatchObject({
        editorImages: 1,
        editorTexts: 0,
      });
    });

    it('has its own monthly cap, apart from the texts', async () => {
      const owner = await createOwner('img-quota');
      withKey('test-key');
      const fetch = await imageReturns();
      // SCALE includes 100 editor images a month.
      await prisma.aiUsageMonth.create({
        data: {
          tenantId: owner.tenantId,
          periodStart: currentPeriodStart(),
          editorImages: 100,
        },
      });
      await expect(
        ai.suggestImage(owner.tenantId, { section: 'hero', field: 'image' }),
      ).rejects.toThrow(ForbiddenException);
      expect(fetch).not.toHaveBeenCalled();
    });
  });
});

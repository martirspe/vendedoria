import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { randomBytes } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { AuthService } from '../src/auth/auth.service';
import type { AuthUserPayload } from '../src/common/types/auth-user';
import { IntegrationsService } from '../src/integrations/integrations.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TeamService } from '../src/team/team.service';

/** Invitations only add people to the inviting business, within its seats, once per link. */
describe('Team invites (e2e)', () => {
  let app: NestFastifyApplication;
  let prisma: PrismaService;
  let team: TeamService;
  const run = randomBytes(3).toString('hex');
  const tenantIds: string[] = [];
  const emails: string[] = [];
  let owner: AuthUserPayload;
  let otherOwner: AuthUserPayload;

  const createOwner = async (label: string): Promise<AuthUserPayload> => {
    const tenant = await prisma.tenant.create({ data: { name: `Team ${label}`, slug: `team-${label}-${run}` } });
    const email = `owner-${label}-${run}@example.test`;
    const user = await prisma.user.create({ data: { email, passwordHash: 'x', fullName: 'Dueño' } });
    await prisma.membership.create({ data: { userId: user.id, tenantId: tenant.id, role: 'OWNER' } });
    tenantIds.push(tenant.id);
    emails.push(email);
    return { userId: user.id, email, tenantId: tenant.id, membershipRole: 'OWNER' };
  };

  const tokenOf = (link: string) => link.split('/invite/')[1];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    prisma = app.get(PrismaService);
    team = app.get(TeamService);
    owner = await createOwner('a');
    otherOwner = await createOwner('b');
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    }
    await app?.close();
  });

  it('requires the Team integration to be on', async () => {
    await expect(team.invite(owner, { email: `x-${run}@example.test`, role: 'AGENT' })).rejects.toThrow(
      ForbiddenException,
    );
    await app.get(IntegrationsService).enable(owner, 'team');
  });

  it('adds the invited person to the inviting business once', async () => {
    const email = `asesor-${run}@example.test`;
    emails.push(email);
    const { link } = await team.invite(owner, { email, role: 'AGENT' });
    const token = tokenOf(link);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await prisma.memberInvite.count({ where: { tokenHash: token } })).toBe(0);

    await expect(team.previewInvite(token)).resolves.toMatchObject({ email, role: 'AGENT' });
    const tokens = await team.acceptInvite(token, { fullName: 'Asesora', password: 'segura123' });
    expect(tokens.accessToken).toBeTruthy();

    const membership = await prisma.membership.findFirstOrThrow({ where: { user: { email } } });
    expect(membership).toMatchObject({ tenantId: owner.tenantId, role: 'AGENT' });
    await expect(team.acceptInvite(token, { fullName: 'Otra', password: 'segura123' })).rejects.toThrow(
      NotFoundException,
    );
  });

  it('keeps invitations inside their seats and their business', async () => {
    // The trial includes 2 users: the owner and the person who just joined.
    await expect(team.invite(owner, { email: `extra-${run}@example.test`, role: 'AGENT' })).rejects.toThrow(
      ForbiddenException,
    );
    const asesor = await prisma.membership.findFirstOrThrow({
      where: { tenantId: owner.tenantId, role: 'AGENT' },
    });
    await expect(team.removeMember(otherOwner, asesor.id)).rejects.toThrow(NotFoundException);
    await expect(team.updateRole(otherOwner, asesor.id, 'ADMIN')).rejects.toThrow(NotFoundException);
    await team.removeMember(owner, asesor.id);
    expect(await prisma.membership.count({ where: { id: asesor.id } })).toBe(0);
  });

  it('AUTH-005 enforces role changes and removal through HTTP with the original access token', async () => {
    const email = `revocation-${run}@example.test`;
    emails.push(email);
    const user = await prisma.user.create({ data: { email, passwordHash: 'unused' } });
    const membership = await prisma.membership.create({
      data: { userId: user.id, tenantId: owner.tenantId, role: 'ADMIN' },
    });
    const { accessToken } = await app.get(AuthService).issueTokens({
      userId: user.id, email, tenantId: owner.tenantId, membershipRole: 'ADMIN',
    });
    const headers = { authorization: `Bearer ${accessToken}` };
    expect((await app.inject({ method: 'GET', url: '/team', headers })).statusCode).toBe(200);

    await team.updateRole(owner, membership.id, 'AGENT');
    const demoted = await app.inject({ method: 'GET', url: '/team', headers });
    expect(demoted.statusCode).toBe(200);
    expect(demoted.json().canManage).toBe(false);
    expect((await app.inject({ method: 'DELETE', url: '/team/invites/nonexistent', headers })).statusCode).toBe(403);

    await team.removeMember(owner, membership.id);
    expect((await app.inject({ method: 'GET', url: '/team', headers })).statusCode).toBe(401);
  });
});

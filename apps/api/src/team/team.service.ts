import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MembershipRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { assertManager } from '../common/roles';
import type { AuthUserPayload } from '../common/types/auth-user';
import { isIntegrationActive } from '../integrations/integration-state';
import { PrismaService } from '../prisma/prisma.service';
import { AcceptInviteDto, AssignableRole, CreateInviteDto } from './dto/team.dto';

export const INVITE_TTL_DAYS = 7;
const MANAGER_MESSAGE = 'Solo el dueño o un administrador puede gestionar el equipo.';
const INVALID_INVITE = 'Esta invitación ya no es válida. Pide a tu equipo que te envíe una nueva.';

export type TeamMemberView = {
  id: string;
  userId: string;
  fullName: string | null;
  email: string;
  role: MembershipRole;
  isYou: boolean;
  joinedAt: Date;
};

export type TeamInviteView = {
  id: string;
  email: string;
  role: MembershipRole;
  expiresAt: Date;
  createdAt: Date;
};

export type TeamOverview = {
  members: TeamMemberView[];
  invites: TeamInviteView[];
  seatsUsed: number;
  seatQuota: number | null;
  canManage: boolean;
};

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planLimits: PlanLimitsService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async overview(user: AuthUserPayload): Promise<TeamOverview> {
    const tenantId = user.tenantId;
    const [memberships, invites, usage] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          role: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
        },
      }),
      this.prisma.memberInvite.findMany({
        where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
      }),
      this.planLimits.getUsage(tenantId),
    ]);
    return {
      members: memberships.map((membership) => ({
        id: membership.id,
        userId: membership.user.id,
        fullName: membership.user.fullName,
        email: membership.user.email,
        role: membership.role,
        isYou: membership.user.id === user.userId,
        joinedAt: membership.createdAt,
      })),
      invites,
      seatsUsed: usage.seatsUsed,
      seatQuota: usage.seatQuota,
      canManage: user.membershipRole === 'OWNER' || user.membershipRole === 'ADMIN',
    };
  }

  /** Returns the invite link once; only its hash is stored. */
  async invite(user: AuthUserPayload, dto: CreateInviteDto): Promise<{ invite: TeamInviteView; link: string }> {
    const tenantId = await this.assertTeamManager(user);
    const email = dto.email.trim().toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new ConflictException('Ese correo ya tiene una cuenta en VendedorIA. Invita otro correo.');
    }
    const now = new Date();
    // A new invite for the same email replaces the previous one instead of taking another seat.
    await this.prisma.memberInvite.deleteMany({ where: { tenantId, email, acceptedAt: null } });
    await this.prisma.memberInvite.deleteMany({ where: { tenantId, acceptedAt: null, expiresAt: { lte: now } } });
    await this.planLimits.assertCanAddMember(tenantId);

    const token = randomBytes(32).toString('hex');
    const invite = await this.prisma.memberInvite.create({
      data: {
        tenantId,
        email,
        role: dto.role,
        tokenHash: hashInviteToken(token),
        expiresAt: new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
      },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
    });
    return { invite, link: `${this.consoleOrigin()}/invite/${token}` };
  }

  async revokeInvite(user: AuthUserPayload, inviteId: string): Promise<void> {
    assertManager(user, MANAGER_MESSAGE);
    const { count } = await this.prisma.memberInvite.deleteMany({
      where: { id: inviteId, tenantId: user.tenantId, acceptedAt: null },
    });
    if (count === 0) {
      throw new NotFoundException('Esa invitación ya no existe.');
    }
  }

  async updateRole(user: AuthUserPayload, membershipId: string, role: AssignableRole): Promise<void> {
    assertManager(user, MANAGER_MESSAGE);
    const membership = await this.findMember(user.tenantId, membershipId);
    if (membership.role === 'OWNER') {
      throw new BadRequestException('El rol del dueño no se puede cambiar.');
    }
    if (membership.userId === user.userId) {
      throw new BadRequestException('No puedes cambiar tu propio rol.');
    }
    await this.prisma.membership.update({ where: { id: membership.id }, data: { role } });
    await this.revokeSessions(membership.userId);
  }

  async removeMember(user: AuthUserPayload, membershipId: string): Promise<void> {
    assertManager(user, MANAGER_MESSAGE);
    const membership = await this.findMember(user.tenantId, membershipId);
    if (membership.role === 'OWNER') {
      throw new BadRequestException('El dueño no se puede quitar del equipo.');
    }
    if (membership.userId === user.userId) {
      throw new BadRequestException('No puedes quitarte a ti mismo del equipo.');
    }
    const otherMemberships = await this.prisma.membership.count({
      where: { userId: membership.userId, id: { not: membership.id } },
    });
    if (otherMemberships === 0) {
      // Invited accounts exist only for this business: removing the member frees the email for a new invite.
      await this.prisma.user.delete({ where: { id: membership.userId } });
      return;
    }
    await this.prisma.membership.delete({ where: { id: membership.id } });
    await this.revokeSessions(membership.userId);
  }

  async previewInvite(token: string): Promise<{ businessName: string; email: string; role: MembershipRole }> {
    const invite = await this.findValidInvite(token);
    return { businessName: invite.tenant.name, email: invite.email, role: invite.role };
  }

  async acceptInvite(token: string, dto: AcceptInviteDto) {
    const invite = await this.findValidInvite(token);
    if (await this.prisma.user.findUnique({ where: { email: invite.email }, select: { id: true } })) {
      throw new ConflictException('Ese correo ya tiene una cuenta. Inicia sesión.');
    }
    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.memberInvite.updateMany({
        where: { id: invite.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count === 0) {
        throw new NotFoundException(INVALID_INVITE);
      }
      const created = await tx.user.create({
        data: { email: invite.email, passwordHash, fullName: dto.fullName.trim() },
      });
      await tx.membership.create({
        data: { userId: created.id, tenantId: invite.tenantId, role: invite.role },
      });
      return created;
    });
    return this.auth.issueTokens({
      userId: user.id,
      email: user.email,
      tenantId: invite.tenantId,
      membershipRole: invite.role,
    });
  }

  private async findValidInvite(token: string) {
    const invite = await this.prisma.memberInvite.findUnique({
      where: { tokenHash: hashInviteToken(token) },
      select: {
        id: true,
        tenantId: true,
        email: true,
        role: true,
        expiresAt: true,
        acceptedAt: true,
        tenant: { select: { name: true } },
      },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.expiresAt <= new Date() ||
      !(await isIntegrationActive(this.prisma, invite.tenantId, 'team'))
    ) {
      throw new NotFoundException(INVALID_INVITE);
    }
    return invite;
  }

  private async assertTeamManager(user: AuthUserPayload): Promise<string> {
    assertManager(user, MANAGER_MESSAGE);
    if (!(await isIntegrationActive(this.prisma, user.tenantId, 'team'))) {
      throw new ForbiddenException('Activa «Equipo» en Integraciones para invitar personas.');
    }
    return user.tenantId;
  }

  private async findMember(tenantId: string, membershipId: string) {
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId },
      select: { id: true, userId: true, role: true },
    });
    if (!membership) {
      throw new NotFoundException('Ese miembro no existe.');
    }
    return membership;
  }

  private async revokeSessions(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private consoleOrigin(): string {
    return this.config.get<string>('CORS_ORIGIN')?.split(',')[0]?.trim() || 'http://localhost:4200';
  }
}

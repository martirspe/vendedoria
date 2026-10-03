import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { Turnstile } from '../turnstile/turnstile.decorator';
import { AcceptInviteDto, CreateInviteDto, InviteTokenParamDto, UpdateMemberRoleDto } from './dto/team.dto';
import { TeamService } from './team.service';

@ApiTags('team')
@ApiBearerAuth()
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  overview(@CurrentUser() user: AuthUserPayload) {
    return this.team.overview(user);
  }

  @Post('invites')
  invite(@CurrentUser() user: AuthUserPayload, @Body() dto: CreateInviteDto) {
    return this.team.invite(user, dto);
  }

  @Delete('invites/:id')
  @HttpCode(204)
  revokeInvite(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.team.revokeInvite(user, id);
  }

  @Patch('members/:id')
  @HttpCode(204)
  updateRole(@CurrentUser() user: AuthUserPayload, @Param('id') id: string, @Body() dto: UpdateMemberRoleDto) {
    return this.team.updateRole(user, id, dto.role);
  }

  @Delete('members/:id')
  @HttpCode(204)
  removeMember(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.team.removeMember(user, id);
  }

  @Public()
  @RateLimit('team-invite-preview', 20)
  @Get('invites/accept/:token')
  previewInvite(@Param() params: InviteTokenParamDto) {
    return this.team.previewInvite(params.token);
  }

  @Public()
  @RateLimit('team-invite-accept', 5)
  @Turnstile('register')
  @Post('invites/accept/:token')
  acceptInvite(@Param() params: InviteTokenParamDto, @Body() dto: AcceptInviteDto) {
    return this.team.acceptInvite(params.token, dto);
  }
}

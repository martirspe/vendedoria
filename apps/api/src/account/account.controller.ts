import { Body, Controller, Get, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { AccountService } from './account.service';
import { ChangePasswordDto, RevokeSessionsDto, UpdateAccountDto } from './dto/account.dto';

@ApiTags('account')
@ApiBearerAuth()
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('me')
  profile(@CurrentUser() user: AuthUserPayload) {
    return this.account.profile(user);
  }

  @Patch('me')
  update(@CurrentUser() user: AuthUserPayload, @Body() dto: UpdateAccountDto) {
    return this.account.update(user, dto);
  }

  @RateLimit('account-password', 5)
  @Post('password')
  changePassword(@CurrentUser() user: AuthUserPayload, @Body() dto: ChangePasswordDto) {
    return this.account.changePassword(user, dto);
  }

  @Post('sessions/revoke-others')
  revokeOtherSessions(@CurrentUser() user: AuthUserPayload, @Body() dto: RevokeSessionsDto) {
    return this.account.revokeOtherSessions(user, dto.refreshToken);
  }
}

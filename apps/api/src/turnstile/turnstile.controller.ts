import { Controller, Get, Header } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/auth.decorators';
import { TurnstileService } from './turnstile.service';

@ApiTags('turnstile')
@Public()
@Controller('turnstile')
export class TurnstileController {
  constructor(private readonly turnstile: TurnstileService) {}

  /** Public site key the console renders the widget with; `null` when verification is off. */
  @Get('config')
  @Header('Cache-Control', 'public, max-age=300')
  config(): { siteKey: string | null } {
    return { siteKey: this.turnstile.siteKey };
  }
}

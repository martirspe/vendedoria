import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import {
  SaveTemplateDraftDto,
  ScheduleTemplateDraftDto,
  SuggestTemplateImageDto,
  SuggestTemplatePageDto,
  SuggestTemplateSectionDto,
  SuggestTemplateTextDto,
} from './dto/template-draft.dto';
import { UpdateStorefrontDto } from './dto/update-storefront.dto';
import { UpdateSubdomainDto } from './dto/update-subdomain.dto';
import { StorefrontAiService } from './storefront-ai.service';
import { StorefrontEditorService } from './storefront-editor.service';
import { StorefrontService } from './storefront.service';

@ApiTags('storefront-admin')
@ApiBearerAuth()
@Controller('store')
export class StorefrontController {
  constructor(
    private readonly storefront: StorefrontService,
    private readonly editor: StorefrontEditorService,
    private readonly ai: StorefrontAiService,
  ) {}

  @Get('editor')
  getEditor(@CurrentUser() user: AuthUserPayload) {
    return this.editor.get(user.tenantId);
  }

  @Put('editor/draft')
  saveDraft(@CurrentUser() user: AuthUserPayload, @Body() dto: SaveTemplateDraftDto) {
    return this.editor.saveDraft(user.tenantId, dto.content);
  }

  @Post('editor/publish')
  publishDraft(@CurrentUser() user: AuthUserPayload) {
    return this.editor.publish(user.tenantId);
  }

  @Post('editor/discard')
  discardDraft(@CurrentUser() user: AuthUserPayload) {
    return this.editor.discard(user.tenantId);
  }

  @Put('editor/schedule')
  scheduleDraft(@CurrentUser() user: AuthUserPayload, @Body() dto: ScheduleTemplateDraftDto) {
    return this.editor.schedule(user.tenantId, new Date(dto.publishAt));
  }

  @Delete('editor/schedule')
  cancelSchedule(@CurrentUser() user: AuthUserPayload) {
    return this.editor.cancelSchedule(user.tenantId);
  }

  @Get('editor/versions')
  listVersions(@CurrentUser() user: AuthUserPayload) {
    return this.editor.versions(user.tenantId);
  }

  @Post('editor/versions/:id/restore')
  restoreVersion(@CurrentUser() user: AuthUserPayload, @Param('id') id: string) {
    return this.editor.restore(user.tenantId, id);
  }

  @Post('editor/ai/text')
  @RateLimit('store-editor-ai', 20)
  suggestText(@CurrentUser() user: AuthUserPayload, @Body() dto: SuggestTemplateTextDto) {
    return this.ai.suggestText(user.tenantId, dto);
  }

  @Post('editor/ai/section')
  @RateLimit('store-editor-ai', 20)
  suggestSection(@CurrentUser() user: AuthUserPayload, @Body() dto: SuggestTemplateSectionDto) {
    return this.ai.suggestSection(user.tenantId, dto.prompt);
  }

  @Post('editor/ai/page')
  @RateLimit('store-editor-ai', 20)
  suggestPage(@CurrentUser() user: AuthUserPayload, @Body() dto: SuggestTemplatePageDto) {
    return this.ai.suggestPage(user.tenantId, dto.prompt);
  }

  @Post('editor/ai/image')
  @RateLimit('store-editor-ai-image', 5)
  suggestImage(@CurrentUser() user: AuthUserPayload, @Body() dto: SuggestTemplateImageDto) {
    return this.ai.suggestImage(user.tenantId, dto);
  }

  @Get()
  get(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.get(user.tenantId);
  }

  @Patch()
  update(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateStorefrontDto,
  ) {
    return this.storefront.update(user.tenantId, dto);
  }

  @Patch('subdomain')
  changeSubdomain(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: UpdateSubdomainDto,
  ) {
    return this.storefront.changeSubdomain(user.tenantId, dto.slug);
  }

  @Post('publish')
  publish(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.publish(user.tenantId);
  }

  @Post('unpublish')
  unpublish(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.unpublish(user.tenantId);
  }

  @Post('products/show-available')
  showAvailableProducts(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.showAvailableProducts(user.tenantId);
  }

  @Post('preview-link')
  previewLink(@CurrentUser() user: AuthUserPayload) {
    return this.storefront.previewLink(user.tenantId);
  }
}

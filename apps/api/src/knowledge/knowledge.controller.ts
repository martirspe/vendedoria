import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import {
  CreateJourneyTemplateDto,
  CreateKnowledgeFaqDto,
  ImportKnowledgePasteDto,
  UpdateJourneyTemplateDto,
  UpdateKnowledgeFaqDto,
} from './dto/knowledge.dto';
import { KnowledgeService } from './knowledge.service';

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Get('faqs')
  listFaqs(@CurrentUser() user: AuthUserPayload) {
    return this.knowledgeService.listFaqs(user.tenantId);
  }

  @Post('faqs')
  createFaq(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateKnowledgeFaqDto,
  ) {
    return this.knowledgeService.createFaq(user.tenantId, dto);
  }

  @Post('faqs/import-paste')
  importPaste(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: ImportKnowledgePasteDto,
  ) {
    return this.knowledgeService.importPaste(user.tenantId, dto);
  }

  @Patch('faqs/:faqId')
  updateFaq(
    @CurrentUser() user: AuthUserPayload,
    @Param('faqId') faqId: string,
    @Body() dto: UpdateKnowledgeFaqDto,
  ) {
    return this.knowledgeService.updateFaq(user.tenantId, faqId, dto);
  }

  @Post('faqs/:faqId/approve')
  approveFaq(
    @CurrentUser() user: AuthUserPayload,
    @Param('faqId') faqId: string,
  ) {
    return this.knowledgeService.approveFaq(user.tenantId, faqId);
  }

  @Delete('faqs/:faqId')
  deleteFaq(
    @CurrentUser() user: AuthUserPayload,
    @Param('faqId') faqId: string,
  ) {
    return this.knowledgeService.deleteFaq(user.tenantId, faqId);
  }

  @Get('journeys')
  listJourneys(@CurrentUser() user: AuthUserPayload) {
    return this.knowledgeService.listJourneys(user.tenantId);
  }

  @Post('journeys')
  createJourney(
    @CurrentUser() user: AuthUserPayload,
    @Body() dto: CreateJourneyTemplateDto,
  ) {
    return this.knowledgeService.createJourney(user.tenantId, dto);
  }

  @Patch('journeys/:journeyId')
  updateJourney(
    @CurrentUser() user: AuthUserPayload,
    @Param('journeyId') journeyId: string,
    @Body() dto: UpdateJourneyTemplateDto,
  ) {
    return this.knowledgeService.updateJourney(
      user.tenantId,
      journeyId,
      dto,
    );
  }

  @Delete('journeys/:journeyId')
  deleteJourney(
    @CurrentUser() user: AuthUserPayload,
    @Param('journeyId') journeyId: string,
  ) {
    return this.knowledgeService.deleteJourney(user.tenantId, journeyId);
  }
}

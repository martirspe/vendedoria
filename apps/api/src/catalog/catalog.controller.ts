import { Body, Controller, Get, Param, Patch, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { CurrentUser, Public } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { RateLimit } from '../rate-limit/rate-limit.decorator';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { InventoryUpdateDto, MediaUploadDto } from './dto/inventory.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { MediaService } from './media.service';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog')
export class CatalogController {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly media: MediaService,
  ) {}

  @Get('products')
  list(@CurrentUser() user: AuthUserPayload) {
    return this.catalogService.list(user.tenantId);
  }

  @Post('products')
  create(@CurrentUser() user: AuthUserPayload, @Body() dto: CreateProductDto) {
    return this.catalogService.create(user.tenantId, dto);
  }

  @Get('products/:productId')
  getById(
    @CurrentUser() user: AuthUserPayload,
    @Param('productId') productId: string,
  ) {
    return this.catalogService.getById(user.tenantId, productId);
  }

  @Patch('products/:productId')
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.update(user.tenantId, productId, dto);
  }

  @Get('inventory')
  inventory(@CurrentUser() user: AuthUserPayload) {
    return this.catalogService.inventory(user.tenantId);
  }

  @Patch('inventory')
  updateInventory(@CurrentUser() user: AuthUserPayload, @Body() dto: InventoryUpdateDto) {
    return this.catalogService.updateInventory(user.tenantId, dto);
  }

  @Post('media')
  @RateLimit('catalog-media', 30)
  upload(@Body() dto: MediaUploadDto) {
    return this.media.upload(dto);
  }
}

/** Uploaded product photos; names are random so they cannot be enumerated. */
@ApiTags('media')
@Public()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Get(':file')
  async read(@Param('file') file: string, @Res() reply: FastifyReply) {
    const { bytes, contentType } = await this.media.read(file);
    return reply
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('X-Content-Type-Options', 'nosniff')
      .send(bytes);
  }
}

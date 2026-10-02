import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/auth.decorators';
import type { AuthUserPayload } from '../common/types/auth-user';
import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

@ApiTags('catalog')
@ApiBearerAuth()
@Controller('catalog/products')
export class CatalogController {
  constructor(private readonly catalogService: CatalogService) {}

  @Get()
  list(@CurrentUser() user: AuthUserPayload) {
    return this.catalogService.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: AuthUserPayload, @Body() dto: CreateProductDto) {
    return this.catalogService.create(user.tenantId, dto);
  }

  @Get(':productId')
  getById(
    @CurrentUser() user: AuthUserPayload,
    @Param('productId') productId: string,
  ) {
    return this.catalogService.getById(user.tenantId, productId);
  }

  @Patch(':productId')
  update(
    @CurrentUser() user: AuthUserPayload,
    @Param('productId') productId: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.catalogService.update(user.tenantId, productId, dto);
  }
}

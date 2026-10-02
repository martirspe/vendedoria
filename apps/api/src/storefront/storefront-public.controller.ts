import { Controller, Get, Headers, Param, Query, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { Public } from '../common/decorators/auth.decorators';
import {
  ProductListQueryDto,
  ResolveStoreQueryDto,
} from './dto/storefront-query.dto';
import {
  StoreAccess,
  StorefrontPublicService,
} from './storefront-public.service';

const PREVIEW_HEADER = 'x-store-preview';

/**
 * Anonymous read API for the store app. The store server proxies browser calls,
 * so the slug always comes from the request host, never from user input.
 */
@ApiTags('storefront')
@Public()
@Controller('storefront')
export class StorefrontPublicController {
  constructor(private readonly storefront: StorefrontPublicService) {}

  @Get('resolve')
  resolve(@Query() query: ResolveStoreQueryDto) {
    return this.storefront.resolveHost(query.host);
  }

  @Get(':slug')
  async getStore(
    @Param('slug') slug: string,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const access = await this.access(slug, preview, reply);
    return this.storefront.getStore(access);
  }

  @Get(':slug/products')
  async listProducts(
    @Param('slug') slug: string,
    @Query() query: ProductListQueryDto,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const access = await this.access(slug, preview, reply);
    return this.storefront.listProducts(access, query);
  }

  @Get(':slug/products/:handle')
  async getProduct(
    @Param('slug') slug: string,
    @Param('handle') handle: string,
    @Headers(PREVIEW_HEADER) preview: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const access = await this.access(slug, preview, reply);
    return this.storefront.getProduct(access, handle);
  }

  @Get(':slug/sitemap')
  async sitemap(
    @Param('slug') slug: string,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const access = await this.access(slug, undefined, reply);
    return this.storefront.sitemap(access);
  }

  private async access(
    slug: string,
    preview: string | undefined,
    reply: FastifyReply,
  ): Promise<StoreAccess> {
    const access = await this.storefront.access(slug, preview);
    reply.header(
      'Cache-Control',
      access.isPreview
        ? 'private, no-store'
        : 'public, max-age=30, stale-while-revalidate=120',
    );
    return access;
  }
}

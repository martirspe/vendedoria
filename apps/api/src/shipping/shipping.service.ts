import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, Storefront } from '@prisma/client';
import type { ShippingOption } from '@vendedoria/contracts';
import { PrismaService } from '../prisma/prisma.service';
import { shippingOptions } from '../storefront/shipping';
import { ensureStorefront } from '../storefront/storefront-row';
import { findUbigeo } from '../ubigeo/ubigeo';
import { UpdateShippingDto } from './dto/update-shipping.dto';

export type ShippingSettingsView = {
  deliveryEnabled: boolean;
  freeShippingFromCents: number | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  shippingOriginUbigeo: string | null;
  carrierRates: Prisma.JsonValue | null;
  /** What buyers can choose with the current settings, in the store and through the sales agent. */
  options: ShippingOption[];
};

/** Shipping belongs to the business, not to the store add-on: it is never gated by an integration. */
@Injectable()
export class ShippingService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string): Promise<ShippingSettingsView> {
    return this.view(await ensureStorefront(this.prisma, tenantId));
  }

  async update(tenantId: string, dto: UpdateShippingDto): Promise<ShippingSettingsView> {
    if (dto.shippingOriginUbigeo && !findUbigeo(dto.shippingOriginUbigeo)) {
      throw new BadRequestException('Elige un distrito de origen válido.');
    }
    await ensureStorefront(this.prisma, tenantId);
    const storefront = await this.prisma.storefront.update({
      where: { tenantId },
      data: {
        deliveryEnabled: dto.deliveryEnabled,
        freeShippingFromCents: dto.freeShippingFromCents,
        pickupEnabled: dto.pickupEnabled,
        pickupAddress: optionalText(dto.pickupAddress),
        shippingOriginUbigeo: optionalText(dto.shippingOriginUbigeo),
        ...(dto.carrierRates !== undefined
          ? {
              carrierRates: dto.carrierRates
                ? ({
                    ...(dto.carrierRates.olva ? { olva: dto.carrierRates.olva } : {}),
                    ...(dto.carrierRates.shalom ? { shalom: dto.carrierRates.shalom } : {}),
                  } as Prisma.JsonObject)
                : Prisma.DbNull,
            }
          : {}),
      },
    });
    return this.view(storefront);
  }

  private view(storefront: Storefront): ShippingSettingsView {
    return {
      deliveryEnabled: storefront.deliveryEnabled,
      freeShippingFromCents: storefront.freeShippingFromCents,
      pickupEnabled: storefront.pickupEnabled,
      pickupAddress: storefront.pickupAddress,
      shippingOriginUbigeo: storefront.shippingOriginUbigeo,
      carrierRates: storefront.carrierRates,
      options: shippingOptions(storefront),
    };
  }
}

function optionalText(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

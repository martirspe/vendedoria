import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { ShippingOption, UbigeoDistrict } from '@vendedoria/contracts';
import { environment } from '../../../environments/environment';

/** Five rates in cents, from the nearest distance tier to the farthest. */
export type CarrierRates = { olva?: number[]; shalom?: number[] };

export type ShippingSettings = {
  deliveryEnabled: boolean;
  freeShippingFromCents: number | null;
  pickupEnabled: boolean;
  pickupAddress: string | null;
  shippingOriginUbigeo: string | null;
  carrierRates: CarrierRates | null;
};

export type ShippingSettingsView = ShippingSettings & { options: ShippingOption[] };

@Injectable({ providedIn: 'root' })
export class ShippingApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/shipping`;

  get(): Promise<ShippingSettingsView> {
    return firstValueFrom(this.http.get<ShippingSettingsView>(this.base));
  }

  ubigeos(): Promise<UbigeoDistrict[]> {
    return firstValueFrom(this.http.get<UbigeoDistrict[]>(`${this.base}/ubigeos`));
  }

  update(payload: Partial<ShippingSettings>): Promise<ShippingSettingsView> {
    return firstValueFrom(this.http.patch<ShippingSettingsView>(this.base, payload));
  }
}

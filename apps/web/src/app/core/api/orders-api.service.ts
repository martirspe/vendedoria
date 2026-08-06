import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'FULFILLING'
  | 'SHIPPED'
  | 'COMPLETED'
  | 'CANCELLED';

export type PaymentStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED';

export type OrderItemDto = {
  id: string;
  productId: string | null;
  variantId: string | null;
  title: string;
  quantity: number;
  unitCents: number;
  totalCents: number;
};

export type PaymentDto = {
  id: string;
  status: PaymentStatus;
  provider: string;
  amountCents: number;
  currency: string;
  checkoutUrl: string | null;
  externalId: string | null;
  createdAt: string;
};

export type OrderDto = {
  id: string;
  status: OrderStatus;
  currency: string;
  totalCents: number;
  customerName: string | null;
  customerPhone: string | null;
  conversationId: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemDto[];
  payments: PaymentDto[];
  conversation: {
    id: string;
    contactName: string | null;
    contactPhone: string | null;
    channel: { type: string; displayName: string | null };
  } | null;
};

export type CreateOrderPayload = {
  conversationId?: string;
  customerName?: string;
  customerPhone?: string;
  currency?: string;
  items: Array<{
    productId?: string;
    title: string;
    quantity: number;
    unitCents: number;
  }>;
  createPaymentLink?: boolean;
  sendLinkToChat?: boolean;
};

export type ProductOption = {
  id: string;
  name: string;
  basePriceCents: number;
  currency: string;
  isAvailable: boolean;
};

@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  private readonly http = inject(HttpClient);

  list(filters?: { status?: OrderStatus; tab?: 'new' | 'all'; q?: string }) {
    let params = new HttpParams();
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.tab) params = params.set('tab', filters.tab);
    if (filters?.q) params = params.set('q', filters.q);
    return firstValueFrom(
      this.http.get<OrderDto[]>(`${environment.apiBaseUrl}/orders`, { params }),
    );
  }

  get(orderId: string) {
    return firstValueFrom(
      this.http.get<OrderDto>(`${environment.apiBaseUrl}/orders/${orderId}`),
    );
  }

  create(payload: CreateOrderPayload) {
    return firstValueFrom(
      this.http.post<OrderDto>(`${environment.apiBaseUrl}/orders`, payload),
    );
  }

  createPaymentLink(orderId: string, sendLinkToChat = false) {
    return firstValueFrom(
      this.http.post<OrderDto>(
        `${environment.apiBaseUrl}/orders/${orderId}/payment-link`,
        { sendLinkToChat },
      ),
    );
  }

  updateStatus(orderId: string, status: OrderStatus) {
    return firstValueFrom(
      this.http.patch<OrderDto>(
        `${environment.apiBaseUrl}/orders/${orderId}/status`,
        { status },
      ),
    );
  }

  getPaymentProvider() {
    return firstValueFrom(
      this.http.get<{
        provider: string;
        mockMode: boolean;
        configured: boolean;
      }>(`${environment.apiBaseUrl}/payments/provider`),
    );
  }

  simulatePayment(paymentId: string) {
    return firstValueFrom(
      this.http.post(
        `${environment.apiBaseUrl}/payments/${paymentId}/simulate`,
        {},
      ),
    );
  }

  listProducts() {
    return firstValueFrom(
      this.http.get<ProductOption[]>(
        `${environment.apiBaseUrl}/catalog/products`,
      ),
    );
  }
}

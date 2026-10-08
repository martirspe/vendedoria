import type { ParamMap } from '@angular/router';
import type { OrderStatus } from '../../core/api/orders-api.service';

export type OrderListState = {
  tab: 'new' | 'all';
  view: 'table' | 'kanban';
  query: string;
  status: OrderStatus | 'ALL';
};

const STATUSES: readonly string[] = ['DRAFT', 'PENDING_PAYMENT', 'PAID', 'FULFILLING', 'SHIPPED', 'COMPLETED', 'CANCELLED'];

export function readOrderList(params: ParamMap): OrderListState {
  const status = params.get('estado');
  return {
    tab: params.get('pestana') === 'todos' ? 'all' : 'new',
    view: params.get('vista') === 'kanban' ? 'kanban' : 'table',
    query: (params.get('q') ?? '').slice(0, 200),
    status: status && STATUSES.includes(status) ? status as OrderStatus : 'ALL',
  };
}

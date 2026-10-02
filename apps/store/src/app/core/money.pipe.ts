import { Pipe, PipeTransform, inject } from '@angular/core';
import { StoreStateService } from './store-state.service';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  private readonly state = inject(StoreStateService);

  transform(cents: number | null | undefined, currency?: string): string {
    return cents === null || cents === undefined
      ? ''
      : this.state.formatMoney(cents, currency);
  }
}

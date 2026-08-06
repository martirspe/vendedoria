import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DsButtonComponent } from '../../design-system/button/ds-button.component';
import { DsEmptyStateComponent } from '../../design-system/empty-state/ds-empty-state.component';
import { environment } from '../../../environments/environment';

type Product = {
  id: string;
  name: string;
  handle: string;
  basePriceCents: number;
  currency: string;
  isAvailable: boolean;
};

@Component({
  selector: 'app-products-page',
  standalone: true,
  imports: [DsButtonComponent, DsEmptyStateComponent],
  templateUrl: './products.page.html',
  styleUrl: './products.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsPage {
  private readonly http = inject(HttpClient);

  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      const data = await firstValueFrom(
        this.http.get<Product[]>(`${environment.apiBaseUrl}/catalog/products`),
      );
      this.products.set(data);
    } catch {
      this.errorMessage.set(
        'No pudimos cargar el catálogo. Revisa la API e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  formatPrice(cents: number, currency: string): string {
    return new Intl.NumberFormat('es-PE', {
      style: 'currency',
      currency,
    }).format(cents / 100);
  }
}

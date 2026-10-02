import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Product, photos } from './selecta-catalog';

@Component({
  selector: 'app-photo',
  template: '<img class="photo-render" [src]="src()" [alt]="alt()" width="600" height="600" loading="lazy" />',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaPhoto {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();
}

/** Main product picture, or every gallery photo together when the product is a montage. */
@Component({
  selector: 'app-product-image',
  imports: [SelectaPhoto],
  templateUrl: './selecta-product-image.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SelectaProductImage {
  readonly product = input.required<Product>();
  readonly photos = computed(() => photos(this.product()));
  readonly montage = computed(() => this.product().details.montage && this.photos().length > 1);
}

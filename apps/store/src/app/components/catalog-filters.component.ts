import { NgTemplateOutlet } from "@angular/common";
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from "@angular/core";
import type {
  PublicCatalogFacets,
  PublicCatalogSelection,
} from "@vendedoria/contracts";
import { MoneyPipe } from "../core/money.pipe";

type CategoryNode = {
  value: string;
  label: string;
  count: number;
  children: CategoryNode[];
};

@Component({
  selector: "store-catalog-filters",
  imports: [NgTemplateOutlet, MoneyPipe],
  templateUrl: "./catalog-filters.component.html",
  styleUrl: "./catalog-filters.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogFiltersComponent {
  readonly facets = input.required<PublicCatalogFacets>();
  readonly category = input<string>();
  readonly selection = input<PublicCatalogSelection[]>([]);
  readonly minCents = input<number | null>(null);
  readonly maxCents = input<number | null>(null);
  readonly prefix = input("catalog");
  readonly categoryChange = output<string | null>();
  readonly selectionChange = output<PublicCatalogSelection[]>();
  readonly priceChange = output<{ min: number | null; max: number | null }>();
  readonly priceError = signal("");

  readonly categories = computed(() => {
    const roots: CategoryNode[] = [];
    for (const item of this.facets().categories) {
      const parts = item.value.split(" > ");
      let siblings = roots;
      parts.forEach((label, index) => {
        const value = parts.slice(0, index + 1).join(" > ");
        let node = siblings.find((node) => node.value === value);
        if (!node) {
          node = { value, label, count: 0, children: [] };
          siblings.push(node);
        }
        if (index === parts.length - 1) node.count = item.count;
        siblings = node.children;
      });
    }
    return roots;
  });

  isSelected(key: string, value: string): boolean {
    return this.selection().some(
      (group) => group.key === key && group.values.includes(value),
    );
  }

  hasSelection(key: string): boolean {
    return this.selection().some((group) => group.key === key);
  }

  toggle(key: string, value: string): void {
    const groups = this.selection();
    const current = groups.find((group) => group.key === key)?.values ?? [];
    const values = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value];
    this.selectionChange.emit([
      ...groups.filter((group) => group.key !== key),
      ...(values.length ? [{ key, values }] : []),
    ]);
  }

  applyPrice(minValue: string, maxValue: string): void {
    const amount = (value: string) =>
      value === "" ? null : Math.round(Number(value) * 100);
    const min = amount(minValue);
    const max = amount(maxValue);
    if (
      [min, max].some(
        (value) =>
          value !== null &&
          (!Number.isFinite(value) || value < 0 || value > 2147483647),
      ) ||
      (min !== null && max !== null && min > max)
    ) {
      this.priceError.set("El precio mínimo debe ser menor o igual al máximo.");
      return;
    }
    this.priceError.set("");
    this.priceChange.emit({ min, max });
  }
}

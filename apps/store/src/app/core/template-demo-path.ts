import type { StoreTemplate } from "@vendedoria/contracts";

export const TEMPLATE_DEMO_PREFIX = "/_templates";
export const TEMPLATE_DEMO_LABELS: Record<StoreTemplate, string> = {
  classic: "Clásica",
  selecta: "Selecta",
  stride: "Impulso",
};

export function templateDemoFromPath(path: string): StoreTemplate | null {
  const match = /^\/_templates\/(classic|selecta|stride)(?:\/|$)/.exec(path);
  return match ? (match[1] as StoreTemplate) : null;
}

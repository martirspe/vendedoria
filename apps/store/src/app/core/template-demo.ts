import { DOCUMENT, Injectable, REQUEST_CONTEXT, inject } from "@angular/core";
import type { StoreRequestContext } from "./store-context";
import {
  TEMPLATE_DEMO_PREFIX,
  TEMPLATE_DEMO_LABELS,
  templateDemoFromPath,
} from "./template-demo-path";

@Injectable({ providedIn: "root" })
export class TemplateDemo {
  private readonly context = inject(REQUEST_CONTEXT, {
    optional: true,
  }) as StoreRequestContext | null;
  private readonly document = inject(DOCUMENT);
  readonly origin =
    this.context?.origin ??
    this.document.location?.origin ??
    "http://localhost";
  readonly template =
    this.context?.demoTemplate ??
    templateDemoFromPath(this.document.location?.pathname ?? "");
  readonly active = !!this.template;
  readonly label = this.template ? TEMPLATE_DEMO_LABELS[this.template] : "";
  readonly base = this.template
    ? `${TEMPLATE_DEMO_PREFIX}/${this.template}/`
    : "/";
}

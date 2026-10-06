import {
  Directive,
  ElementRef,
  DestroyRef,
  afterNextRender,
  inject,
  output,
} from "@angular/core";

/** Native modal behavior for existing dialogs: focus, Escape and inert background. */
@Directive({
  selector: "dialog[dsModal]",
  standalone: true,
  host: {
    "(cancel)": "onCancel($event)",
    "(keydown)": "onKeydown($event)",
    "(click)": "onBackdrop($event)",
  },
})
export class DsModalDirective {
  readonly dsModalClose = output<void>();
  private readonly dialog =
    inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;
  private readonly previousFocus = this.dialog.ownerDocument
    .activeElement as HTMLElement | null;

  constructor() {
    afterNextRender(() => {
      if (!this.dialog.open) this.dialog.showModal();
      this.dialog
        .querySelector<HTMLElement>("[autofocus]")
        ?.focus({ preventScroll: true });
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.dialog.open) this.dialog.close();
      if (
        this.previousFocus?.isConnected &&
        typeof this.previousFocus.focus === "function"
      ) {
        this.previousFocus.focus({ preventScroll: true });
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.dsModalClose.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Search fields consume Escape before the browser's dialog cancel event.
    if (event.key === "Escape") {
      this.onCancel(event);
      return;
    }
    if (event.key !== "Tab" || event.defaultPrevented) return;

    const controls = Array.from(
      this.dialog.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]',
      ),
    ).filter(
      (control) =>
        control.tabIndex >= 0 &&
        !control.matches(":disabled") &&
        !control.closest('[inert], [aria-hidden="true"]') &&
        control.getClientRects().length > 0,
    );
    const first = controls[0];
    const last = controls.at(-1);
    const active = this.dialog.ownerDocument.activeElement;
    if (!first) {
      event.preventDefault();
    } else if (event.shiftKey && (active === first || active === this.dialog)) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && (active === last || active === this.dialog)) {
      event.preventDefault();
      first.focus();
    }
  }

  protected onBackdrop(event: MouseEvent): void {
    if (event.target !== this.dialog) return;
    const bounds = this.dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      this.dsModalClose.emit();
    }
  }
}

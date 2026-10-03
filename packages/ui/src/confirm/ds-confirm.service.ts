import { Injectable, signal } from '@angular/core';

export type DsConfirmTone = 'default' | 'danger';

export interface DsConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive or hard-to-undo actions. */
  tone?: DsConfirmTone;
}

export interface DsConfirmRequest extends DsConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

/**
 * Opens the app-wide confirmation dialog. Requires one `<ds-confirm-dialog />`
 * mounted in the root component.
 */
@Injectable({ providedIn: 'root' })
export class DsConfirmService {
  private readonly current = signal<DsConfirmRequest | null>(null);
  readonly request = this.current.asReadonly();

  confirm(options: DsConfirmOptions): Promise<boolean> {
    this.current()?.resolve(false);
    return new Promise((resolve) => this.current.set({ ...options, resolve }));
  }

  settle(confirmed: boolean): void {
    const request = this.current();
    if (!request) return;
    this.current.set(null);
    request.resolve(confirmed);
  }
}

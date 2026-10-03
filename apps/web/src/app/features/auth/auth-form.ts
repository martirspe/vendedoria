import type { ElementRef } from '@angular/core';
import type { AbstractControl } from '@angular/forms';

export type FieldMessages = Partial<Record<'required' | 'email' | 'minlength', string>>;

/** First message for the control's current error, shown only once the visitor left the field or submitted. */
export function fieldError(control: AbstractControl, messages: FieldMessages): string | null {
  if (!control.touched || !control.errors) return null;
  const key = (Object.keys(messages) as Array<keyof FieldMessages>).find((name) => control.hasError(name));
  return key ? (messages[key] ?? null) : null;
}

export function focusFirstInvalid(host: ElementRef<HTMLElement>): void {
  host.nativeElement.querySelector<HTMLElement>('input.ng-invalid')?.focus();
}

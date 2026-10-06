import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DsModalDirective } from '@vendedoria/ui';

@Component({
  imports: [DsModalDirective],
  template: `
    <button id="opener" (click)="open.set(true)">Abrir</button>
    @if (open()) {
      <dialog dsModal (dsModalClose)="open.set(false)">
        <input type="search" autofocus aria-label="Buscar" />
        <button disabled>Deshabilitado</button>
        <button id="last">Cerrar</button>
      </dialog>
    }
  `,
})
class DialogHost {
  readonly open = signal(false);
}

const dialogPrototype = HTMLDialogElement.prototype;
const nativeMethods = new Map(
  ['showModal', 'close'].map((name) => [
    name,
    Object.getOwnPropertyDescriptor(dialogPrototype, name),
  ]),
);

beforeEach(() => {
  // jsdom has no native dialog API; browser checks cover top-layer behavior.
  Object.defineProperty(dialogPrototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(dialogPrototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
    },
  });
});

async function setup() {
  TestBed.configureTestingModule({ imports: [DialogHost] });
  const fixture = TestBed.createComponent(DialogHost);
  fixture.detectChanges();
  document.body.append(fixture.nativeElement);
  const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
  opener.focus();
  opener.click();
  fixture.detectChanges();
  await fixture.whenStable();
  const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
  const search = dialog.querySelector('input')!;
  const last = dialog.querySelector('#last') as HTMLButtonElement;
  for (const control of [search, last]) {
    vi.spyOn(control, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  }
  return { fixture, opener, dialog, search, last };
}

afterEach(() => {
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
  for (const [name, descriptor] of nativeMethods) {
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor);
    else Reflect.deleteProperty(dialogPrototype, name);
  }
});

describe('modal keyboard navigation', () => {
  it('wraps forward from the last control to the first control', async () => {
    const { search, last } = await setup();
    last.focus();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search);
  });

  it('wraps backward to the last enabled control', async () => {
    const { search, last } = await setup();
    search.focus();
    search.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });

  it('dismisses a filled search on the first Escape and restores the opener', async () => {
    const { fixture, search, opener } = await setup();
    search.value = 'productos';
    search.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    search.dispatchEvent(escape);
    fixture.detectChanges();
    expect(escape.defaultPrevented).toBe(true);
    expect(fixture.nativeElement.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});

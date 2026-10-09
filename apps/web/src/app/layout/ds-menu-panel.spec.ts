import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsMenuComponent } from '@vendedoria/ui';

@Component({
  imports: [DsMenuComponent],
  template: `<ds-menu label="Opciones" menuId="test-options" [mode]="mode()"><span dsMenuTrigger>Abrir</span><label>Orden<select><option>Producto</option><option>SKU</option></select></label><button type="button" role="menuitem">Acción</button></ds-menu><button id="outside">Fuera</button>`,
})
class MenuHost { readonly mode = signal<'menu' | 'panel'>('panel'); }

afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });

async function setup(mode: 'menu' | 'panel' = 'panel') {
  TestBed.configureTestingModule({ imports: [MenuHost] });
  const fixture = TestBed.createComponent(MenuHost);
  fixture.componentInstance.mode.set(mode);
  fixture.detectChanges(); await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const panel = element.querySelector<HTMLElement>('.ds-menu-panel')!;
  const trigger = element.querySelector<HTMLButtonElement>('.ds-menu-trigger')!;
  let opened = false;
  panel.showPopover = vi.fn(() => { opened = true; });
  panel.hidePopover = vi.fn(() => { opened = false; });
  const matches = panel.matches.bind(panel);
  vi.spyOn(panel, 'matches').mockImplementation(selector => selector === ':popover-open' ? opened : matches(selector));
  for (const control of panel.querySelectorAll<HTMLElement>('button, select')) {
    vi.spyOn(control, 'getClientRects').mockReturnValue({ length: 1 } as DOMRectList);
  }
  return { fixture, element, panel, trigger };
}

describe('shared settings popover', () => {
  it('focuses native controls, preserves their keyboard behavior and returns focus on Escape', async () => {
    const { fixture, panel, trigger, element } = await setup();
    trigger.click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(panel.getAttribute('role')).toBe('dialog');
    const select = panel.querySelector('select')!;
    expect(document.activeElement).toBe(select);
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    select.dispatchEvent(down); expect(down.defaultPrevented).toBe(false);
    select.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); fixture.detectChanges();
    expect(panel.hidePopover).toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    expect(element.querySelector('[aria-expanded="false"]')).toBe(trigger);
  });

  it('closes when keyboard focus leaves the panel without moving focus back', async () => {
    const { fixture, panel, trigger, element } = await setup();
    trigger.click(); fixture.detectChanges();
    const outside = element.querySelector<HTMLButtonElement>('#outside')!;
    outside.focus(); fixture.detectChanges();
    expect(panel.hidePopover).toHaveBeenCalled();
    expect(document.activeElement).toBe(outside);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('retains the default action-menu semantics and closes after an action', async () => {
    const { fixture, panel, trigger } = await setup('menu');
    trigger.click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(panel.getAttribute('role')).toBe('menu');
    (panel.querySelector('button') as HTMLButtonElement).click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });
});

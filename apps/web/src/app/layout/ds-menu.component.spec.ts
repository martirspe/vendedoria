import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DsMenuComponent } from '@vendedoria/ui';

@Component({ imports: [DsMenuComponent], template: `<ds-menu label="Cuenta" menuId="test-menu"><span dsMenuTrigger>Abrir cuenta</span><a role="menuitem" href="/perfil">Mi perfil</a><button role="menuitem" disabled>No disponible</button><button role="menuitem">Salir</button></ds-menu>` })
class MenuHost {}
async function setup() {
  TestBed.configureTestingModule({ imports: [MenuHost] });
  const fixture = TestBed.createComponent(MenuHost); fixture.detectChanges(); await fixture.whenStable();
  document.body.append(fixture.nativeElement);
  const panel = fixture.nativeElement.querySelector('[role="menu"]') as HTMLElement;
  const trigger = fixture.nativeElement.querySelector('.ds-menu-trigger') as HTMLButtonElement;
  const items = Array.from(panel.querySelectorAll<HTMLElement>('[role="menuitem"]')).filter(item => !item.matches(':disabled'));
  let open = false;
  Object.defineProperty(panel, 'showPopover', { value: () => { open = true; }, configurable: true });
  Object.defineProperty(panel, 'hidePopover', { value: () => { open = false; }, configurable: true });
  const matches = panel.matches.bind(panel);
  vi.spyOn(panel, 'matches').mockImplementation(selector => selector === ':popover-open' ? open : matches(selector));
  items.forEach(item => vi.spyOn(item, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList));
  const key = (target: HTMLElement, key: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  return { fixture, trigger, panel, items, key };
}
afterEach(() => { TestBed.resetTestingModule(); vi.restoreAllMocks(); });
describe('shared account menu', () => {
  it('opens by keyboard, skips disabled actions and wraps focus', async () => {
    const { fixture, trigger, items, key } = await setup();
    trigger.focus(); key(trigger, 'ArrowDown'); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true'); expect(document.activeElement).toBe(items[0]);
    key(items[0], 'ArrowUp'); expect(document.activeElement).toBe(items[1]);
    key(items[1], 'Home'); expect(document.activeElement).toBe(items[0]);
    key(items[0], 'End'); expect(document.activeElement).toBe(items[1]);
  });
  it('restores the trigger on Escape and closes after an action', async () => {
    const { fixture, trigger, items, key } = await setup();
    key(trigger, 'ArrowUp'); key(items[1], 'Escape'); fixture.detectChanges();
    expect(document.activeElement).toBe(trigger); expect(trigger.getAttribute('aria-expanded')).toBe('false');
    trigger.click(); items[1].click(); fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

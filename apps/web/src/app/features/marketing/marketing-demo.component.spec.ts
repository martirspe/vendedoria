import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { MarketingDemoComponent } from './marketing-demo.component';

afterEach(() => TestBed.resetTestingModule());
describe('Marketing sales example', () => {
  it('switches between recommendation, confirmed payment and human takeover without navigation', async () => {
    await TestBed.configureTestingModule({ imports: [MarketingDemoComponent] }).compileComponents();
    const fixture = TestBed.createComponent(MarketingDemoComponent);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const controls = Array.from(host.querySelectorAll<HTMLButtonElement>('.demo__controls button'));
    expect(controls.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(host.querySelector('.demo__product')).not.toBeNull();
    controls[1].click();
    fixture.detectChanges();
    expect(host.querySelector('.demo__product')).toBeNull();
    expect(host.querySelector('.demo__payment')?.textContent).toContain('Pago confirmado');
    controls[2].click();
    fixture.detectChanges();
    expect(host.querySelector('.demo__payment')).toBeNull();
    expect(host.querySelector('.demo__handoff')?.textContent).toContain('se pausa en este chat');
    expect(host.querySelector('.demo__chat-header')?.textContent).toContain('Tú estás atendiendo');
    expect(controls.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true',
    ]);
    controls[0].click();
    fixture.detectChanges();
    expect(host.querySelector('.demo__product img')).not.toBeNull();
    expect(host.querySelector('.demo__handoff')).toBeNull();
    expect(controls.every((button) => button.type === 'button')).toBe(true);
  });
});

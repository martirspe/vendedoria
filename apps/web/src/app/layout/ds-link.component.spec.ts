import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RouterLink, provideRouter } from '@angular/router';
import { DsLinkComponent } from '@vendedoria/ui';
import { afterEach, describe, expect, it } from 'vitest';

@Component({
  imports: [RouterLink, DsLinkComponent],
  template:
    '<a dsLink routerLink="/auth/register">Crear mi cuenta</a><a dsLink variant="secondary" href="#planes">Ver planes</a>',
})
class LinkHost {}
afterEach(() => TestBed.resetTestingModule());
describe('Shared navigation action', () => {
  it('preserves native destinations and projected labels without interactive nesting', async () => {
    await TestBed.configureTestingModule({
      imports: [LinkHost],
      providers: [provideRouter([])],
    }).compileComponents();
    const fixture = TestBed.createComponent(LinkHost);
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const links = host.querySelectorAll('a');
    expect(links[0].getAttribute('href')).toBe('/auth/register');
    expect(links[0].textContent).toBe('Crear mi cuenta');
    expect(links[1].getAttribute('href')).toBe('#planes');
    expect(host.querySelector('a button, a a')).toBeNull();
  });
});

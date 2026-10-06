import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountApiService } from '../core/api/account-api.service';
import { BillingApiService } from '../core/api/billing-api.service';
import { AuthApiService } from '../core/auth/auth-api.service';
import { IntegrationsStateService } from '../core/integrations/integrations-state.service';
import { ConsoleShellLayout } from './console-shell.layout';
import { CatalogApiService } from '../core/api/catalog-api.service';
import { isContextLinkActive, contextForUrl } from './console-context';

@Component({ template: '' })
class RouteContent {}

async function setup() {
  TestBed.configureTestingModule({
    imports: [ConsoleShellLayout],
    providers: [
      provideRouter([{ path: '**', component: RouteContent }]),
      { provide: AccountApiService, useValue: { profile: signal({ fullName: 'Operador de prueba', email: 'qa@example.test', business: { name: 'Negocio de prueba' } }), load: async () => undefined } },
      { provide: AuthApiService, useValue: { logout: vi.fn() } },
      { provide: CatalogApiService, useValue: { list: async () => [] } },
      { provide: BillingApiService, useValue: { getUsage: async () => ({ planStatus: 'ACTIVE' }) } },
      { provide: IntegrationsStateService, useValue: { isActive: (key: string) => key === 'store', refresh: async () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ConsoleShellLayout);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, router: TestBed.inject(Router) };
}

afterEach(() => TestBed.resetTestingModule());

describe('console navigation', () => {
  it('keeps destinations named and reachable when collapsed, and expands again', async () => {
    const { fixture } = await setup();
    const nav = fixture.nativeElement.querySelector('#console-navigation') as HTMLElement;
    (nav.querySelector('[aria-label="Contraer navegación"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Expandir navegación');
    expect(nav.querySelectorAll('[data-nav-toggle]')).toHaveLength(1);
    expect(nav.querySelector('[data-nav-toggle]')?.parentElement?.querySelector('a[aria-label="VendedorIA"]')).toBeNull();
    const product = nav.querySelector('a[href="/app/products"]') as HTMLAnchorElement;
    expect(product.getAttribute('aria-label')).toBe('Productos');
    expect(product.getAttribute('title')).toBe('Productos');
    expect(product.querySelector('span')).toBeNull();
    (nav.querySelector('[aria-label="Expandir navegación"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Contraer navegación');
    expect(nav.textContent).toContain('Productos');
    expect(nav.querySelector('[aria-label="Contraer navegación"]')).not.toBeNull();
  });

  it('keeps a compact global sidebar while contextual settings retain room for their labels', async () => {
    const { fixture, router } = await setup();
    await router.navigateByUrl('/app/store');
    fixture.detectChanges();
    await fixture.whenStable();
    const global = fixture.nativeElement.querySelector('#console-navigation') as HTMLElement;
    const contextual = fixture.nativeElement.querySelector('aside[aria-label="Ajustes de sección"]') as HTMLElement;
    expect(global.className).toContain('tw:w-rail');
    expect(contextual.className).toContain('tw:w-context-sidebar');
    expect(contextual.querySelectorAll('a')).toHaveLength(8);
  });

  it('keeps catalog details nested and promotes shipping to a direct operational destination', async () => {
    const { fixture, router } = await setup();
    for (const [route, parent, label] of [['/app/inventory', '/app/products', 'Inventario']]) {
      await router.navigateByUrl(route);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      if (fixture.componentInstance.navCollapsed()) { fixture.componentInstance.toggleNavigation(); fixture.detectChanges(); await fixture.whenStable(); }
      const nav = fixture.nativeElement.querySelector('#console-navigation') as HTMLElement;
      expect(nav.querySelector(`a[href="${parent}"]`)?.getAttribute('aria-current')).toBe('location');
      expect(nav.querySelector(`a[href="${route}"]`)?.getAttribute('aria-current')).toBe('page');
      expect(fixture.componentInstance.currentLocation().label).toBe(label);
      expect(fixture.componentInstance.contentHref()).toBe(`${route}#console-main`);
    }
    await router.navigateByUrl('/app/shipping');
    fixture.detectChanges();
    await fixture.whenStable();
    const nav = fixture.nativeElement.querySelector('#console-navigation') as HTMLElement;
    expect(nav.querySelector('a[href="/app/shipping"]')?.getAttribute('aria-current')).toBe('page');
    expect(nav.querySelector('a[href="/app/orders"]')?.getAttribute('aria-current')).toBeNull();
    expect(nav.querySelector('#nav-shoppingBag')).toBeNull();
  });

  it('keeps the settings sidebar administrative and removes duplicated operational routes', async () => {
    const { fixture, router } = await setup();
    await router.navigateByUrl('/app/settings');
    fixture.detectChanges();
    await fixture.whenStable();
    const contextual = fixture.nativeElement.querySelector('aside[aria-label="Ajustes de sección"]') as HTMLElement;
    expect(contextual.textContent).toContain('General');
    expect(contextual.textContent).toContain('Equipo');
    for (const route of ['/app/payments', '/app/shipping', '/app/channels', '/app/integrations', '/app/plans']) {
      expect(contextual.querySelector(`a[href="${route}"]`)).toBeNull();
    }
    const global = fixture.nativeElement.querySelector('#console-navigation') as HTMLElement;
    expect(global.querySelector('a[href="/app/shipping"]')).not.toBeNull();
  });
  it('selects store subsections exactly and restores navigation when leaving settings', async () => {
    const { fixture, router } = await setup();
    await router.navigateByUrl('/app/store?seccion=legal'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.contextLocation()).toBe('Datos legales');
    expect(fixture.componentInstance.navCollapsed()).toBe(true);
    expect(isContextLinkActive({ label: 'Temas', path: '/app/store', icon: 'palette', section: 'temas' }, '/app/store?seccion=legal')).toBe(false);
    expect(contextForUrl('/app/store/editor')).toBeUndefined();
    await router.navigateByUrl('/app/products'); fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.componentInstance.navCollapsed()).toBe(false);
    expect(fixture.nativeElement.querySelector('aside[aria-label="Ajustes de sección"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('#console-navigation button[role="menuitem"]')?.textContent).toContain('Cerrar sesión');
    expect(fixture.nativeElement.querySelector('#console-navigation > button[role="menuitem"]')).toBeNull();
  });
  it('matches accents and variant SKUs, scopes results, wraps keyboard selection and opens the real catalog', async () => {
    const { fixture, router } = await setup();
    const shell = fixture.componentInstance;
    shell.paletteProducts.set([{ id: 'sample', name: 'Café orgánico', sku: 'CF-1', brand: 'Origen', variants: [{ sku: 'CAFE-A' }] } as any]);
    shell.onPaletteQuery('cafe origen');
    expect(shell.searchResults()[0].label).toBe('Café orgánico');
    shell.onPaletteQuery('CAFE-A'); expect(shell.searchResults()[0].id).toBe('product-sample');
    shell.setSearchFilter('vendedor'); expect(shell.searchResults()).toEqual([]);
    shell.setSearchFilter('productos');
    shell.onSearchKey(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(shell.paletteIndex()).toBe(shell.searchResults().length - 1);
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    shell.runPaletteAction(shell.searchResults()[0]);
    expect(navigate).toHaveBeenCalledWith('/app/products?q=Caf%C3%A9%20org%C3%A1nico');
    expect(shell.paletteRecent()[0].label).toBe('Café orgánico');
  });
});

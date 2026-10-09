import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { afterEach, describe, expect, it } from 'vitest';
import { DsCheckboxComponent, DsDisclosureComponent, DsFormSectionComponent, DsSaveBarComponent } from '@vendedoria/ui';

@Component({
  imports: [ReactiveFormsModule, DsCheckboxComponent, DsDisclosureComponent, DsFormSectionComponent, DsSaveBarComponent],
  template: `<form [formGroup]="form" (ngSubmit)="submissions = submissions + 1">
    <ds-form-section title="Entrega" icon="truck"><ds-checkbox variant="inline" description="Disponible para tus clientes"><input type="checkbox" formControlName="enabled" />Activar entrega</ds-checkbox></ds-form-section>
    <ds-disclosure title="¿Cómo funciona?">Contenido de ayuda</ds-disclosure>
    <ds-save-bar [pending]="form.dirty" [busy]="busy()" label="Guardar entrega" />
  </form>`,
})
class ComponentsHost {
  readonly form = new FormGroup({ enabled: new FormControl(false, { nonNullable: true }) });
  readonly busy = signal(false);
  submissions = 0;
}

async function setup() {
  TestBed.configureTestingModule({ imports: [ComponentsHost] });
  const fixture = TestBed.createComponent(ComponentsHost);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
}
afterEach(() => TestBed.resetTestingModule());

describe('shared console controls', () => {
  it('keeps the native checkbox form value, dirty state and label association', async () => {
    const { fixture, host, element } = await setup();
    const checkbox = element.querySelector('input')!;
    expect(checkbox.labels?.[0]?.textContent).toContain('Activar entrega');
    checkbox.click(); fixture.detectChanges();
    expect(host.form.controls.enabled.value).toBe(true);
    expect(host.form.dirty).toBe(true);
    host.form.controls.enabled.disable(); fixture.detectChanges();
    checkbox.click(); expect(host.form.controls.enabled.value).toBe(true);
    expect(checkbox.disabled).toBe(true);
  });

  it('supports mixed checkbox state without replacing the native control', async () => {
    const { element, host } = await setup();
    const checkbox = element.querySelector('input')!;
    checkbox.indeterminate = true;
    checkbox.click();
    expect(checkbox.indeterminate).toBe(false);
    expect(host.form.controls.enabled.value).toBe(true);
  });

  it('submits from the shared action bar and blocks a busy or pristine form', async () => {
    const { fixture, element, host } = await setup();
    const save = element.querySelector('ds-save-bar button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    element.querySelector('input')!.click(); fixture.detectChanges();
    save.click(); expect(host.submissions).toBe(1);
    host.busy.set(true); fixture.detectChanges();
    expect(save.disabled).toBe(true);
    save.click(); expect(host.submissions).toBe(1);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Guardando');
  });

  it('uses a native disclosure whose summary opens and closes the content', async () => {
    const { element } = await setup();
    const details = element.querySelector('details')!;
    const summary = element.querySelector('summary')!;
    expect(details.open).toBe(false);
    summary.click(); expect(details.open).toBe(true);
    summary.click(); expect(details.open).toBe(false);
  });
});

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

@Component({
  imports: [ReactiveFormsModule, DsSaveBarComponent],
  template: `<form id="external-save-form" [formGroup]="form" (ngSubmit)="submissions = submissions + 1"><input formControlName="name" /></form>
    <form id="unrelated-save-form" (submit)="$event.preventDefault(); unrelatedSubmissions = unrelatedSubmissions + 1"></form>
    <ds-save-bar formId="external-save-form" [pending]="true" [busy]="busy()" label="Guardar nombre" />`,
})
class ExternalSaveHost {
  readonly form = new FormGroup({ name: new FormControl('Nombre', { nonNullable: true }) });
  readonly busy = signal(false);
  submissions = 0;
  unrelatedSubmissions = 0;
}

@Component({
  imports: [ReactiveFormsModule],
  template: `<form [formGroup]="form"><fieldset [disabled]="disabled()"><label for="native-checkbox">Activar avisos</label><input id="native-checkbox" type="checkbox" formControlName="enabled" /></fieldset></form>`,
})
class NativeCheckboxHost {
  readonly form = new FormGroup({ enabled: new FormControl(false, { nonNullable: true }) });
  readonly disabled = signal(false);
}

async function setup() {
  TestBed.configureTestingModule({ imports: [ComponentsHost] });
  const fixture = TestBed.createComponent(ComponentsHost);
  fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
  return { fixture, host: fixture.componentInstance, element: fixture.nativeElement as HTMLElement };
}
afterEach(() => TestBed.resetTestingModule());

describe('shared console controls', () => {
  it('preserves label activation, dirty and touched state on standalone native checkboxes', async () => {
    TestBed.configureTestingModule({ imports: [NativeCheckboxHost] });
    const fixture = TestBed.createComponent(NativeCheckboxHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const checkbox = element.querySelector('input')!;
    element.querySelector('label')!.click();
    expect(checkbox.checked).toBe(true);
    expect(host.form.controls.enabled.value).toBe(true);
    expect(host.form.dirty).toBe(true);
    checkbox.focus();
    checkbox.blur();
    expect(host.form.touched).toBe(true);
  });

  it('keeps mixed state and disabled fieldsets native after checkbox appearance changes', async () => {
    TestBed.configureTestingModule({ imports: [NativeCheckboxHost] });
    const fixture = TestBed.createComponent(NativeCheckboxHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const checkbox = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    checkbox.indeterminate = true;
    checkbox.click();
    expect(checkbox.indeterminate).toBe(false);
    expect(host.form.controls.enabled.value).toBe(true);
    host.disabled.set(true);
    fixture.detectChanges();
    expect(checkbox.matches(':disabled')).toBe(true);
    checkbox.click();
    expect(host.form.controls.enabled.value).toBe(true);
  });

  it('associates an external save bar with exactly one native form and retains busy blocking', async () => {
    TestBed.configureTestingModule({ imports: [ExternalSaveHost] });
    const fixture = TestBed.createComponent(ExternalSaveHost);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    const save = element.querySelector('ds-save-bar button') as HTMLButtonElement;
    expect(save.form?.id).toBe('external-save-form');
    expect(element.querySelector('[role="region"]')?.getAttribute('aria-label')).toBe('Guardar nombre');
    save.click();
    expect(host.submissions).toBe(1);
    expect(host.unrelatedSubmissions).toBe(0);
    host.busy.set(true);
    fixture.detectChanges();
    save.click();
    expect(host.submissions).toBe(1);
  });

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

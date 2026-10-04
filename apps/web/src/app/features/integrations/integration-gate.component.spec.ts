import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { IntegrationsApiService } from '../../core/api/integrations-api.service';
import { IntegrationsStateService } from '../../core/integrations/integrations-state.service';
import { IntegrationGateComponent } from './integration-gate.component';

describe('IntegrationGateComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [IntegrationGateComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: IntegrationsApiService, useValue: { list: () => Promise.reject(new Error('offline')) } },
      ],
    }).compileComponents();
  });

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(IntegrationGateComponent);
    fixture.componentRef.setInput('key', 'store');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says nothing while the integrations could not be loaded', async () => {
    expect((await render()).textContent?.trim()).toBe('');
  });

  it('explains that the integration is off once the state is known', async () => {
    TestBed.inject(IntegrationsStateService).set([
      {
        key: 'store',
        enabled: false,
        active: false,
        included: true,
        available: true,
        requiredPlan: null,
        requires: null,
      },
    ]);
    expect((await render()).textContent).toContain('Tienda web está desactivada');
  });
});

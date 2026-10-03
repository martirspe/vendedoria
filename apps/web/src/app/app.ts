import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DsConfirmDialogComponent } from '@vendedoria/ui';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, DsConfirmDialogComponent],
  template: `<router-outlet /><ds-confirm-dialog />`,
  styles: `
    :host {
      display: block;
      min-height: 100vh;
    }
  `,
})
export class App {}

import { ApplicationConfig, mergeApplicationConfig } from '@angular/core';
import { HttpBackend } from '@angular/common/http';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';
import { StoreServerBackend } from './core/store-server.backend';

const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(withRoutes(serverRoutes)),
    { provide: HttpBackend, useClass: StoreServerBackend },
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);

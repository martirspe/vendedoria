import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import type { FastifyRequest } from 'fastify';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // nginx and the store server reach the API over the Docker network; trusting only those
    // hops makes `request.ip` the real client and ignores X-Forwarded-For sent by the client.
    new FastifyAdapter({
      logger: {
        serializers: {
          req: (request: FastifyRequest) => ({
            id: request.id,
            method: request.method,
            url: request.url.split('?')[0],
            host: request.hostname,
            remoteAddress: request.ip,
          }),
        },
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
        ],
      },
      trustProxy: ['loopback', 'uniquelocal'],
    }),
    // Webhook signatures (Meta) are computed over the exact bytes received.
    { rawBody: true },
  );

  const config = app.get(ConfigService);
  const port = config.get<number>('PORT', 3000);
  const corsOrigin = config.get<string>('CORS_ORIGIN', 'http://localhost:4200');

  // The console only calls (and CORS only allows) http://localhost; loopback IP URLs move there.
  if (config.get<string>('NODE_ENV') === 'development') {
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', (request, reply, done) => {
        const loopback = /^(?:127\.0\.0\.1|\[::1\])(:\d+)?$/.exec(
          request.headers.host ?? '',
        );
        if (!loopback) {
          done();
          return;
        }
        void reply.redirect(
          `${request.protocol}://localhost${loopback[1] ?? ''}${request.url}`,
          308,
        );
      });
  }

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: corsOrigin.split(',').map((value) => value.trim()),
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
      'X-Turnstile-Token',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('VendedorIA API')
    .setDescription('Premium AI Sales Agents SaaS API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swagger));

  await app.listen(port, '0.0.0.0');
}

void bootstrap();

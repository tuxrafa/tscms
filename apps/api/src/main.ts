import 'reflect-metadata';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { product } from '@tscms/content-schema';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './filter.js';

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV === 'test' ? false : { level: 'info' } }),
    { logger: process.env.NODE_ENV === 'test' ? false : ['error', 'warn', 'log'] },
  );
  const origin = process.env.AUTHOR_ORIGIN ?? true;
  await app.register(cors, { origin, credentials: true });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
  app.useGlobalFilters(new AllExceptionsFilter());
  const config = new DocumentBuilder()
    .setTitle(product.displayName)
    .setDescription('Management API e Delivery API. O conteúdo não depende do Author nem de um framework de frontend.')
    .setVersion('1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const app = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 3000), process.env.API_HOST ?? '0.0.0.0');
}

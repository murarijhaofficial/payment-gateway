import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import 'reflect-metadata';

import { AppModule } from './app.module.js';

function getAllowedOrigins(): readonly string[] {
  const configuredOrigins = process.env['CORS_ORIGINS']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (process.env['APP_ENV'] === 'production') {
    return [];
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  app.use(helmet());
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: false,
    methods: ['GET'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: false,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  // Payment and webhook routes are intentionally absent until M0 approval and a raw-body design exist.
  const port = process.env['PORT'] ? Number(process.env['PORT']) : 3001;
  await app.listen(port, '127.0.0.1');
}

void bootstrap();

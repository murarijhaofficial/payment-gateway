import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import 'reflect-metadata';
import type { Request, Response, NextFunction, Application } from 'express';

import { AppModule } from './app.module.js';

function getAllowedOrigins(): readonly string[] {
  const configuredOrigins = process.env['CORS_ORIGINS']
    ?.split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (configuredOrigins && configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  if (process.env['APP_ENV'] === 'production' || process.env['RENDER'] === 'true') {
    return [];
  }

  return ['http://localhost:3000', 'http://127.0.0.1:3000'];
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: true });

  app.use(helmet());
  if (process.env['RENDER'] === 'true') {
    (app.getHttpAdapter().getInstance() as Application).set('trust proxy', 1);
  }
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.enableCors({
    origin: getAllowedOrigins(),
    credentials: false,
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: false,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    }),
  );

  // Only explicit sandbox simulation routes exist; no provider or real money processing.
  const port = process.env['PORT'] ? Number(process.env['PORT']) : 3001;
  const host =
    process.env['APP_ENV'] === 'production' || process.env['RENDER'] === 'true'
      ? '0.0.0.0'
      : '127.0.0.1';
  await app.listen(port, host);
}

void bootstrap();

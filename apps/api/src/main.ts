import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ApiController } from './controller';
import { Storage } from './storage';
import { IncidentService } from './incident-service';
import { SessionGuard } from './auth';
import { config } from './config';
import { ReadCache } from './cache';
import { InProcessEventProcessor } from './event-processor';

@Module({
  controllers: [ApiController],
  providers: [Storage, IncidentService, SessionGuard, ReadCache, InProcessEventProcessor],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet(), express.json({ limit: '256kb' }), cookieParser());
  app.enableCors({ origin: config.WEB_ORIGIN, credentials: true });
  const attempts = new Map<string, { count: number; until: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID(),
      start = Date.now();
    res.setHeader('x-request-id', requestId);
    res.setHeader('Cache-Control', 'no-store');
    res.on('finish', () =>
      console.log(
        JSON.stringify({
          level: 'info',
          requestId,
          method: req.method,
          path: req.path,
          status: res.statusCode,
          durationMs: Date.now() - start,
        }),
      ),
    );
    if (['POST', 'PATCH', 'DELETE'].includes(req.method)) {
      const origin = req.get('origin');
      if (origin && origin !== config.WEB_ORIGIN) {
        res.status(403).json({ message: 'Origin is not allowed' });
        return;
      }
      const key = req.ip ?? 'local';
      const now = Date.now();
      for (const [k, v] of attempts) if (v.until < now) attempts.delete(k);
      const bucket = attempts.get(key) ?? { count: 0, until: now + 60000 };
      bucket.count++;
      attempts.set(key, bucket);
      if (bucket.count > 60) {
        res.status(429).json({ message: 'Too many write requests. Try again in one minute.' });
        return;
      }
    }
    next();
  });
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
}
bootstrap().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

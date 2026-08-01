import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { validateEnv } from './env';

async function bootstrap() {
  validateEnv();

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  const corsOrigins = ['https://shiranami.app', 'http://localhost:15175'];
  // Allow additional mobile/dev origins via env
  const mobileOrigins = process.env.MOBILE_ORIGINS;
  if (mobileOrigins) {
    corsOrigins.push(...mobileOrigins.split(',').map(o => o.trim()));
  }
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST'],
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
}

bootstrap();

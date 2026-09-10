import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: ConfigService,
    @InjectPinoLogger(RedisService.name) private readonly logger: PinoLogger
  ) {
    super(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    this.on('connect', () => this.logger.info('Connected to Redis'));
    this.on('error', err => this.logger.error({ err }, 'Redis connection error'));
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.quit();
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { ShareModule } from './modules/share/share.module';

// TODO: Reimport YoutubeModule when mobile app is ready
const isDev = process.env.NODE_ENV !== 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({
      pinoHttp: {
        transport: isDev
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        level: process.env.LOG_LEVEL ?? 'info',
      },
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'default', ttl: 60000, limit: 100 },
      ],
    }),
    PrismaModule,
    RedisModule,
    ShareModule,
  ],
})
export class AppModule {}

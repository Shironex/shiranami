import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateShareDto } from './dto/create-share.dto';
import { nanoid } from 'nanoid';

interface ShareResult {
  code: string;
  url: string;
  expiresAt: Date;
}

interface ShareData {
  id: string;
  code: string;
  type: 'TRACK' | 'PLAYLIST';
  payload: unknown;
  createdAt: Date;
  expiresAt: Date;
}

@Injectable()
export class ShareService {
  private readonly baseUrl: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @InjectPinoLogger(ShareService.name) private readonly logger: PinoLogger,
  ) {
    this.baseUrl = this.config.getOrThrow<string>('SHARE_BASE_URL');
    this.ttlSeconds = this.config.get<number>('SHARE_TTL_SECONDS') ?? 3600;
  }

  async create(dto: CreateShareDto): Promise<ShareResult> {
    const code = nanoid(8);
    const expiresAt = new Date(Date.now() + this.ttlSeconds * 1000);

    const share = await this.prisma.share.create({
      data: {
        code,
        type: dto.type,
        payload: dto.payload as any,
        expiresAt,
      },
    });

    // Cache in Redis for fast lookups
    await this.redis.setex(
      `share:${code}`,
      this.ttlSeconds,
      JSON.stringify({
        id: share.id,
        code: share.code,
        type: share.type,
        payload: share.payload,
        createdAt: share.createdAt,
        expiresAt: share.expiresAt,
      }),
    );

    this.logger.info({ code, type: dto.type }, 'Share created');

    return {
      code,
      url: `${this.baseUrl}/s/${code}`,
      expiresAt,
    };
  }

  async findByCode(code: string): Promise<ShareData> {
    // Try Redis cache first
    const cached = await this.redis.get(`share:${code}`);
    if (cached) {
      const data = JSON.parse(cached) as ShareData;
      // Check if expired (Redis TTL might still be valid but DB record expired)
      if (new Date(data.expiresAt) > new Date()) {
        return data;
      }
      await this.redis.del(`share:${code}`);
    }

    // Fall back to database
    const share = await this.prisma.share.findUnique({ where: { code } });
    if (!share || share.expiresAt < new Date()) {
      throw new NotFoundException('Share not found or expired');
    }

    // Re-cache for remaining TTL
    const remainingTtl = Math.max(0, Math.floor((share.expiresAt.getTime() - Date.now()) / 1000));
    if (remainingTtl > 0) {
      await this.redis.setex(
        `share:${code}`,
        remainingTtl,
        JSON.stringify({
          id: share.id,
          code: share.code,
          type: share.type,
          payload: share.payload,
          createdAt: share.createdAt,
          expiresAt: share.expiresAt,
        }),
      );
    }

    return {
      id: share.id,
      code: share.code,
      type: share.type,
      payload: share.payload,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt,
    };
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.share.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.info({ count: result.count }, 'Cleaned up expired shares');
    }
    return result.count;
  }
}

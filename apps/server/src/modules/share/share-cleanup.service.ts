import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ShareService } from './share.service';

@Injectable()
export class ShareCleanupService {
  constructor(private readonly shareService: ShareService) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async handleCleanup() {
    await this.shareService.cleanupExpired();
  }
}

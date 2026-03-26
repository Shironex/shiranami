import { Module } from '@nestjs/common';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { ShareCleanupService } from './share-cleanup.service';

@Module({
  controllers: [ShareController],
  providers: [ShareService, ShareCleanupService],
})
export class ShareModule {}

import { Module } from '@nestjs/common';
import { YoutubeAudioController, YoutubeController } from './youtube.controller';
import { YoutubeService } from './youtube.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  controllers: [YoutubeController, YoutubeAudioController],
  providers: [YoutubeService],
})
export class YoutubeModule {}

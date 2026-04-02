import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  BadRequestException,
  InternalServerErrorException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiKeyGuard } from '../../guards/api-key.guard';
import { YoutubeService } from './youtube.service';
import {
  searchQuerySchema,
  suggestQuerySchema,
  streamParamsSchema,
  playlistBodySchema,
} from './dto/youtube.dto';

@Controller('api/youtube')
@UseGuards(ApiKeyGuard)
export class YoutubeController {
  constructor(private readonly youtubeService: YoutubeService) {}

  @Get('search')
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  async search(@Query() query: unknown) {
    const result = searchQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    try {
      return await this.youtubeService.search(result.data.q);
    } catch (err) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Search failed',
      );
    }
  }

  @Get('suggest')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async suggest(@Query() query: unknown) {
    const result = suggestQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    try {
      return await this.youtubeService.suggest(result.data.q);
    } catch (err) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Suggest failed',
      );
    }
  }

  @Get('stream/:videoId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async stream(@Param() params: unknown) {
    const result = streamParamsSchema.safeParse(params);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    try {
      const url = await this.youtubeService.getStreamUrl(result.data.videoId);
      return { url };
    } catch (err) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Stream extraction failed',
      );
    }
  }

  @Post('playlist')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  async extractPlaylist(@Body() body: unknown) {
    const result = playlistBodySchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    try {
      return await this.youtubeService.extractPlaylist(result.data.url);
    } catch (err) {
      throw new InternalServerErrorException(
        err instanceof Error ? err.message : 'Playlist extraction failed',
      );
    }
  }
}

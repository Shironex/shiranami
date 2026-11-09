import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpException,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { FastifyReply } from 'fastify';
import { ApiKeyGuard } from '../../guards/api-key.guard';
import { AudioAccessGuard } from '../../guards/audio-access.guard';
import { UpstreamError, VideoUnavailableError, YoutubeService } from './youtube.service';
import { AUDIO_TOKEN_TTL_SECONDS, signAudioToken } from './youtube-audio';
import {
  searchQuerySchema,
  suggestQuerySchema,
  streamParamsSchema,
  playlistBodySchema,
  type StreamResponse,
} from './dto/youtube.dto';

/** Turns a service failure into a status the app can tell apart. */
function toHttpError(err: unknown, fallback: string): HttpException {
  if (err instanceof HttpException) return err;
  if (err instanceof VideoUnavailableError) return new NotFoundException(err.message);
  if (err instanceof UpstreamError) return new BadGatewayException(err.message);
  return new BadGatewayException(err instanceof Error ? err.message : fallback);
}

function parseVideoId(params: unknown): string {
  const result = streamParamsSchema.safeParse(params);
  if (!result.success) {
    throw new BadRequestException(result.error.flatten());
  }
  return result.data.videoId;
}

// The throttler module is configured in AppModule but no guard is registered
// globally, so each controller here opts in. It runs before the key check, so
// guessing keys is rate limited too.
@Controller('api/youtube')
@UseGuards(ThrottlerGuard, ApiKeyGuard)
export class YoutubeController {
  private readonly apiKey: string;

  constructor(
    private readonly youtubeService: YoutubeService,
    config: ConfigService
  ) {
    // ApiKeyGuard rejects every request when the key is unset, so the routes
    // below only ever run with one.
    this.apiKey = config.get<string>('API_KEY') ?? '';
  }

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
      throw toHttpError(err, 'Search failed');
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
      throw toHttpError(err, 'Suggest failed');
    }
  }

  /**
   * Checks that a video can be played and hands back a signed link to its
   * audio on this server (see the audio route). The phone streams or saves
   * from that link and never talks to YouTube directly.
   */
  @Get('stream/:videoId')
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  async stream(@Param() params: unknown): Promise<StreamResponse> {
    const videoId = parseVideoId(params);
    try {
      const source = await this.youtubeService.resolveAudio(videoId);
      const expiresAt = Math.floor(Date.now() / 1000) + AUDIO_TOKEN_TTL_SECONDS;
      const token = signAudioToken(this.apiKey, videoId, expiresAt);
      return {
        path: `/api/youtube/audio/${videoId}?t=${token}`,
        expiresAt,
        ext: source.ext,
        mimeType: source.mimeType,
        size: source.size,
      };
    } catch (err) {
      throw toHttpError(err, 'Stream extraction failed');
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
      throw toHttpError(err, 'Playlist extraction failed');
    }
  }
}

/**
 * The audio bytes of a video, streamed from googlevideo through this server
 * with `Range` support for seeking. Its own controller because it is guarded
 * by AudioAccessGuard (key header or signed link) instead of ApiKeyGuard.
 */
@Controller('api/youtube/audio')
@UseGuards(ThrottlerGuard, AudioAccessGuard)
export class YoutubeAudioController {
  constructor(
    private readonly youtubeService: YoutubeService,
    @InjectPinoLogger(YoutubeAudioController.name) private readonly logger: PinoLogger
  ) {}

  // A player opens a new request on every seek, hence the higher limit.
  @Get(':videoId')
  @Throttle({ default: { ttl: 60000, limit: 120 } })
  async audio(
    @Param() params: unknown,
    @Headers('range') range: string | undefined,
    @Res() reply: FastifyReply
  ): Promise<void> {
    const videoId = parseVideoId(params);
    const abort = new AbortController();
    // Fires when the response ends or the client hangs up mid-stream.
    reply.raw.on('close', () => abort.abort());

    let audio;
    try {
      audio = await this.youtubeService.openAudio(videoId, range, abort.signal);
    } catch (err) {
      throw toHttpError(err, 'Audio failed');
    }

    if (audio.status === 416) {
      await reply.status(416).header('Content-Range', `bytes */${audio.total}`).send();
      return;
    }

    const { start, end } = audio.range;
    audio.body.on('error', err => {
      if (!abort.signal.aborted) this.logger.warn({ err, videoId }, 'Audio stream broke off');
    });
    reply
      .status(audio.status)
      .header('Content-Type', audio.mimeType)
      .header('Content-Length', String(end - start + 1))
      .header('Accept-Ranges', 'bytes')
      .header('Cache-Control', 'private, max-age=3600');
    if (audio.status === 206) {
      reply.header('Content-Range', `bytes ${start}-${end}/${audio.total}`);
    }
    await reply.send(audio.body);
  }
}

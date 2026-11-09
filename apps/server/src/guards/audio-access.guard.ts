import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verifyAudioToken } from '../modules/youtube/youtube-audio';
import { secretsEqual } from './secrets';

interface AudioRequest {
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string | undefined>;
  query: Record<string, unknown>;
}

/**
 * Guards the audio route. The phone's player and downloader cannot always
 * send the `x-shiranami-key` header, so a request passes with either that
 * header or a `t` query token signed for this video by `stream/:videoId`
 * (itself behind ApiKeyGuard). The key itself never appears in a URL, where
 * it would end up in access logs. Fails closed like ApiKeyGuard.
 */
@Injectable()
export class AudioAccessGuard implements CanActivate {
  private readonly logger = new Logger(AudioAccessGuard.name);

  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    if (!this.apiKey) {
      this.logger.error('API_KEY is not configured: denying request to the audio route');
      throw new UnauthorizedException('API key authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<AudioRequest>();
    const key = request.headers['x-shiranami-key'];
    if (typeof key === 'string' && secretsEqual(key, this.apiKey)) return true;

    const token = request.query.t;
    const videoId = request.params.videoId;
    if (
      typeof token === 'string' &&
      typeof videoId === 'string' &&
      verifyAudioToken(this.apiKey, videoId, token, Math.floor(Date.now() / 1000))
    ) {
      return true;
    }

    throw new UnauthorizedException('Invalid or expired audio link');
  }
}

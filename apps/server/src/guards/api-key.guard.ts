import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  // Nest's logger is routed through pino by `app.useLogger()` in main.ts, and
  // keeps the guard's injection surface to ConfigService alone — guards applied
  // with `@UseGuards(ApiKeyGuard)` are resolved outside a module's provider list.
  private readonly logger = new Logger(ApiKeyGuard.name);

  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    // Fail closed: a guarded route with no configured key is a misconfiguration,
    // never an invitation to serve the request unauthenticated.
    if (!this.apiKey) {
      this.logger.error('API_KEY is not configured — denying request to a guarded route');
      throw new UnauthorizedException('API key authentication is not configured');
    }

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const key = request.headers['x-shiranami-key'];

    if (!key || key !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return true;
  }
}

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  BadRequestException,
  Header,
} from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Throttle } from '@nestjs/throttler';
import { ShareService } from './share.service';
import { createShareSchema, type TrackPayload, type PlaylistPayload } from '@shiranami/contracts';

@Controller()
export class ShareController {
  constructor(private readonly shareService: ShareService) {}

  @Post('api/share')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  async createShare(@Body() body: unknown) {
    const result = createShareSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return this.shareService.create(result.data);
  }

  @Get('api/share/:code')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  async getShare(@Param('code') code: string) {
    return this.shareService.findByCode(code);
  }

  @Get('s/:code')
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Header('Content-Type', 'text/html; charset=utf-8')
  async previewShare(@Param('code') code: string, @Res() reply: FastifyReply) {
    const share = await this.shareService.findByCode(code);
    const html = this.renderPreview(share);
    return reply.type('text/html').send(html);
  }

  private renderPreview(share: {
    code: string;
    type: string;
    payload: unknown;
    expiresAt: Date;
  }): string {
    const isPlaylist = share.type === 'PLAYLIST';
    const payload = share.payload as TrackPayload | PlaylistPayload;

    let title: string;
    let description: string;
    let trackListHtml: string;

    if (isPlaylist) {
      const pl = payload as PlaylistPayload;
      title = pl.name;
      description = `${pl.tracks.length} track${pl.tracks.length === 1 ? '' : 's'}`;
      trackListHtml = pl.tracks
        .map(
          (t, i) =>
            `<div class="track"><span class="num">${i + 1}</span><div class="info"><span class="title">${escapeHtml(t.title)}</span><span class="artist">${escapeHtml(t.artist)}</span></div></div>`
        )
        .join('');
    } else {
      const t = payload as TrackPayload;
      title = t.title;
      description = t.artist;
      trackListHtml = `<div class="track"><span class="num">1</span><div class="info"><span class="title">${escapeHtml(t.title)}</span><span class="artist">${escapeHtml(t.artist)}</span></div></div>`;
    }

    const expiresIn = Math.max(
      0,
      Math.ceil((new Date(share.expiresAt).getTime() - Date.now()) / 60000)
    );

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} - Shiranami</title>
  <meta property="og:title" content="${escapeHtml(title)} - Shiranami">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:type" content="music.${isPlaylist ? 'playlist' : 'song'}">
  <meta name="theme-color" content="#7c3aed">
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0c0a14;color:#e2e0ea;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{max-width:480px;width:100%;background:#16121f;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:32px;box-shadow:0 8px 32px rgba(0,0,0,0.4)}
    .badge{display:inline-block;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;background:rgba(124,58,237,0.15);color:#a78bfa;margin-bottom:16px}
    h1{font-size:22px;font-weight:700;margin-bottom:4px}
    .desc{color:#9890a8;font-size:14px;margin-bottom:20px}
    .tracks{display:flex;flex-direction:column;gap:2px;margin-bottom:24px;max-height:320px;overflow-y:auto}
    .track{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.03)}
    .num{color:#5a5470;font-size:12px;font-weight:600;width:20px;text-align:center;flex-shrink:0}
    .info{display:flex;flex-direction:column;min-width:0}
    .title{font-size:14px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .artist{font-size:12px;color:#9890a8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .actions{display:flex;gap:10px}
    .btn{flex:1;padding:12px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;transition:all 0.15s}
    .btn-primary{background:#7c3aed;color:white;border:none}
    .btn-primary:hover{background:#6d28d9}
    .btn-secondary{background:transparent;color:#a78bfa;border:1px solid rgba(167,139,250,0.3)}
    .btn-secondary:hover{background:rgba(124,58,237,0.1)}
    .expires{text-align:center;color:#5a5470;font-size:12px;margin-top:16px}
    .logo{display:flex;align-items:center;gap:8px;margin-bottom:20px;color:#9890a8;font-size:13px;font-weight:500}
    .tracks::-webkit-scrollbar{width:4px}
    .tracks::-webkit-scrollbar-track{background:transparent}
    .tracks::-webkit-scrollbar-thumb{background:#2a2438;border-radius:4px}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l4-4 4 4M12 16V8"/></svg>
      Shiranami
    </div>
    <span class="badge">${isPlaylist ? 'Shared Playlist' : 'Shared Track'}</span>
    <h1>${escapeHtml(title)}</h1>
    <p class="desc">${escapeHtml(description)}</p>
    <div class="tracks">${trackListHtml}</div>
    <div class="actions">
      <a href="shiranami://import/${share.code}" class="btn btn-primary">Open in Shiranami</a>
      <a href="https://shiranami.app" class="btn btn-secondary">Get App</a>
    </div>
    <p class="expires">Expires in ${expiresIn} minute${expiresIn === 1 ? '' : 's'}</p>
  </div>
</body>
</html>`;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

import { describe, it, expect, vi } from 'vitest';
import { BadGatewayException, BadRequestException, NotFoundException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { FastifyReply } from 'fastify';
import type { PinoLogger } from 'nestjs-pino';
import { Readable } from 'node:stream';
import { YoutubeAudioController, YoutubeController } from './youtube.controller';
import {
  UpstreamError,
  VideoUnavailableError,
  type AudioStream,
  type YoutubeService,
} from './youtube.service';
import { verifyAudioToken } from './youtube-audio';

const API_KEY = 'super-secret-key';
const VIDEO = 'abcdefghijk';
const SOURCE = {
  url: 'https://rr1.googlevideo.com/x',
  ext: 'm4a',
  size: 1234,
  mimeType: 'audio/mp4',
  availableAt: null,
};

function controller(service: Partial<YoutubeService>) {
  const config = { get: () => API_KEY } as unknown as ConfigService;
  return new YoutubeController(service as YoutubeService, config);
}

describe('YoutubeController.stream', () => {
  it('answers a signed audio path that the audio guard accepts', async () => {
    const resolveAudio = vi.fn().mockResolvedValue(SOURCE);
    const result = await controller({ resolveAudio }).stream({ videoId: VIDEO });

    const match = /^\/api\/youtube\/audio\/abcdefghijk\?t=(.+)$/.exec(result.path);
    expect(match).not.toBeNull();
    expect(verifyAudioToken(API_KEY, VIDEO, match![1], Math.floor(Date.now() / 1000))).toBe(true);
    expect(result).toMatchObject({ ext: 'm4a', mimeType: 'audio/mp4', size: 1234 });
    expect(result.expiresAt).toBeGreaterThan(Date.now() / 1000);
  });

  it('rejects a malformed video id', async () => {
    await expect(controller({}).stream({ videoId: '../etc' })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('maps an unavailable video to 404 and other failures to 502', async () => {
    const unavailable = vi.fn().mockRejectedValue(new VideoUnavailableError('gone'));
    await expect(
      controller({ resolveAudio: unavailable }).stream({ videoId: VIDEO })
    ).rejects.toBeInstanceOf(NotFoundException);

    const broken = vi.fn().mockRejectedValue(new Error('yt-dlp died'));
    await expect(
      controller({ resolveAudio: broken }).stream({ videoId: VIDEO })
    ).rejects.toBeInstanceOf(BadGatewayException);
  });
});

function fakeReply() {
  const headers: Record<string, string> = {};
  const reply = {
    raw: { on: vi.fn() },
    statusCode: 0,
    sent: undefined as unknown,
    status(code: number) {
      reply.statusCode = code;
      return reply;
    },
    header(name: string, value: string) {
      headers[name] = value;
      return reply;
    },
    send: vi.fn(async (body?: unknown) => {
      reply.sent = body;
    }),
  };
  return { reply, headers };
}

function audioController(openAudio: (...args: unknown[]) => Promise<AudioStream>) {
  const logger = { warn: vi.fn() } as unknown as PinoLogger;
  return new YoutubeAudioController({ openAudio } as unknown as YoutubeService, logger);
}

describe('YoutubeAudioController.audio', () => {
  it('sends a partial response with range headers', async () => {
    const body = Readable.from([Buffer.from('abcd')]);
    const open = vi.fn().mockResolvedValue({
      status: 206,
      range: { start: 10, end: 13 },
      total: 100,
      mimeType: 'audio/mp4',
      body,
    });
    const { reply, headers } = fakeReply();

    await audioController(open).audio(
      { videoId: VIDEO },
      'bytes=10-13',
      reply as unknown as FastifyReply
    );

    expect(open).toHaveBeenCalledWith(VIDEO, 'bytes=10-13', expect.any(AbortSignal));
    expect(reply.statusCode).toBe(206);
    expect(headers).toMatchObject({
      'Content-Type': 'audio/mp4',
      'Content-Length': '4',
      'Accept-Ranges': 'bytes',
      'Content-Range': 'bytes 10-13/100',
    });
    expect(reply.sent).toBe(body);
  });

  it('sends a full response without Content-Range', async () => {
    const open = vi.fn().mockResolvedValue({
      status: 200,
      range: { start: 0, end: 99 },
      total: 100,
      mimeType: 'audio/mp4',
      body: Readable.from([]),
    });
    const { reply, headers } = fakeReply();

    await audioController(open).audio(
      { videoId: VIDEO },
      undefined,
      reply as unknown as FastifyReply
    );

    expect(reply.statusCode).toBe(200);
    expect(headers['Content-Length']).toBe('100');
    expect(headers['Content-Range']).toBeUndefined();
  });

  it('answers 416 with the total size', async () => {
    const open = vi.fn().mockResolvedValue({ status: 416, total: 100 });
    const { reply, headers } = fakeReply();

    await audioController(open).audio(
      { videoId: VIDEO },
      'bytes=500-',
      reply as unknown as FastifyReply
    );

    expect(reply.statusCode).toBe(416);
    expect(headers['Content-Range']).toBe('bytes */100');
  });

  it('turns upstream refusals into 502 before anything is sent', async () => {
    const open = vi.fn().mockRejectedValue(new UpstreamError(403));
    const { reply } = fakeReply();

    await expect(
      audioController(open).audio({ videoId: VIDEO }, undefined, reply as unknown as FastifyReply)
    ).rejects.toBeInstanceOf(BadGatewayException);
    expect(reply.send).not.toHaveBeenCalled();
  });

  it('aborts the upstream fetch when the response closes', async () => {
    let signal: AbortSignal | undefined;
    const open = vi.fn(async (_id: unknown, _range: unknown, s: unknown) => {
      signal = s as AbortSignal;
      return { status: 416 as const, total: 1 };
    });
    const { reply } = fakeReply();

    await audioController(open).audio(
      { videoId: VIDEO },
      undefined,
      reply as unknown as FastifyReply
    );
    const onClose = reply.raw.on.mock.calls.find(([event]) => event === 'close')![1];
    onClose();

    expect(signal?.aborted).toBe(true);
  });
});

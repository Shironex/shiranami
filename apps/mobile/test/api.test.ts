import {
  ApiError,
  applyServerUrl,
  configureApi,
  errorFromStatus,
  getAudioLink,
  searchYouTube,
  suggestYouTube,
} from '@/lib/api';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  configureApi('http://10.0.2.2:3000', 'test-key');
});

function lastRequest(): [string, RequestInit] {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit];
}

function lastRequestUrl(): string {
  return lastRequest()[0];
}

describe('configureApi', () => {
  it('drops every trailing slash from the base URL', async () => {
    configureApi('http://10.0.2.2:3000///');
    await suggestYouTube('a');
    expect(lastRequestUrl()).toBe('http://10.0.2.2:3000/api/youtube/suggest?q=a');
  });

  it('sends the key header', async () => {
    await suggestYouTube('a');
    expect((lastRequest()[1].headers as Record<string, string>)['x-shiranami-key']).toBe(
      'test-key'
    );
  });
});

describe('applyServerUrl', () => {
  it('applies a valid URL after normalizing it', async () => {
    expect(applyServerUrl(' https://music.example.com// ')).toBe(true);
    await suggestYouTube('a');
    expect(lastRequestUrl()).toBe('https://music.example.com/api/youtube/suggest?q=a');
  });

  it('keeps the last valid URL when the new one has no http(s) scheme', async () => {
    applyServerUrl('http://192.168.1.5:3000');
    expect(applyServerUrl('10.0.2.2:3000')).toBe(false);
    expect(applyServerUrl('')).toBe(false);
    await suggestYouTube('a');
    expect(lastRequestUrl()).toBe('http://192.168.1.5:3000/api/youtube/suggest?q=a');
  });
});

describe('errors', () => {
  function answer(status: number, body: unknown) {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    });
  }

  async function kindOf(call: Promise<unknown>) {
    const error = await call.catch(e => e);
    expect(error).toBeInstanceOf(ApiError);
    return (error as ApiError).kind;
  }

  it('turns a refused key into unauthorized', async () => {
    answer(401, { message: 'Invalid or missing API key', statusCode: 401 });
    expect(await kindOf(searchYouTube('a'))).toBe('unauthorized');
  });

  it('tells a server without the YouTube routes from an unplayable video', async () => {
    answer(404, { message: 'Cannot GET /api/youtube/search?q=a', statusCode: 404 });
    expect(await kindOf(searchYouTube('a'))).toBe('disabled');

    answer(404, { message: 'This video cannot be played', statusCode: 404 });
    expect(await kindOf(getAudioLink('abcdefghijk'))).toBe('unavailable');
  });

  it('turns no answer at all into unreachable', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await kindOf(searchYouTube('a'))).toBe('unreachable');
  });

  it('maps 429 and 5xx', () => {
    expect(errorFromStatus(429, '').kind).toBe('rate_limited');
    expect(errorFromStatus(502, 'not json').kind).toBe('server');
    expect(errorFromStatus(502, 'not json').message).toBe('not json');
  });
});

describe('getAudioLink', () => {
  it('turns the signed path into an absolute URL on the current server', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        path: '/api/youtube/audio/abcdefghijk?t=1.x',
        expiresAt: 5,
        ext: 'm4a',
        mimeType: 'audio/mp4',
        size: 10,
      }),
    });

    expect(await getAudioLink('abcdefghijk')).toEqual({
      url: 'http://10.0.2.2:3000/api/youtube/audio/abcdefghijk?t=1.x',
      expiresAt: 5,
      ext: 'm4a',
      size: 10,
    });
    expect(lastRequestUrl()).toBe('http://10.0.2.2:3000/api/youtube/stream/abcdefghijk');
  });
});

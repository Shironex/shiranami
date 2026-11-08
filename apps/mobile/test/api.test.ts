import { applyServerUrl, configureApi, suggestYouTube } from '@/lib/api';

const fetchMock = jest.fn();

beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => [] });
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

function lastRequestUrl(): string {
  return fetchMock.mock.calls[fetchMock.mock.calls.length - 1][0] as string;
}

describe('configureApi', () => {
  it('drops every trailing slash from the base URL', async () => {
    configureApi('http://10.0.2.2:3000///');
    await suggestYouTube('a');
    expect(lastRequestUrl()).toBe('http://10.0.2.2:3000/api/youtube/suggest?q=a');
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

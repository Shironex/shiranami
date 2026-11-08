import { normalizeHttpUrl, readEnv } from '@/lib/env';

describe('readEnv', () => {
  it('falls back to defaults when nothing is set, with YouTube search off', () => {
    expect(readEnv({})).toEqual({
      apiUrl: 'http://localhost:3000',
      apiKey: '',
      youtubeSearch: false,
    });
  });

  it('trims the server URL and drops trailing slashes', () => {
    expect(readEnv({ EXPO_PUBLIC_API_URL: ' http://10.0.2.2:3000// ' }).apiUrl).toBe(
      'http://10.0.2.2:3000'
    );
  });

  it('rejects a server URL without an http(s) scheme, naming the variable', () => {
    expect(() => readEnv({ EXPO_PUBLIC_API_URL: '10.0.2.2:3000' })).toThrow(
      'EXPO_PUBLIC_API_URL must be an http(s) URL'
    );
  });

  it('reads the YouTube search flag strictly', () => {
    expect(readEnv({ EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH: 'true' }).youtubeSearch).toBe(true);
    expect(readEnv({ EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH: 'false' }).youtubeSearch).toBe(false);
    expect(() => readEnv({ EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH: 'yes' })).toThrow(
      'EXPO_PUBLIC_FEATURE_YOUTUBE_SEARCH must be "true" or "false"'
    );
  });
});

describe('normalizeHttpUrl', () => {
  it('trims and drops every trailing slash', () => {
    expect(normalizeHttpUrl(' https://music.example.com/// ')).toBe('https://music.example.com');
  });

  it('returns null for a value without an http(s) scheme or host', () => {
    expect(normalizeHttpUrl('10.0.2.2:3000')).toBeNull();
    expect(normalizeHttpUrl('http://')).toBeNull();
    expect(normalizeHttpUrl('   ')).toBeNull();
    expect(normalizeHttpUrl(undefined)).toBeNull();
  });
});

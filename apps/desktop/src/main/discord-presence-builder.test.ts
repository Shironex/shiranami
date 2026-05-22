import { describe, it, expect } from 'vitest';
import { DEFAULT_DISCORD_TEMPLATES, type DiscordRpcSettings } from '@shiranami/shared';
import { buildPresence, resolveActivityType } from './discord-presence-builder';

function makeSettings(overrides: Partial<DiscordRpcSettings> = {}): DiscordRpcSettings {
  return {
    enabled: true,
    showTrackDetails: true,
    showElapsedTime: true,
    useCustomTemplates: false,
    templates: structuredClone(DEFAULT_DISCORD_TEMPLATES),
    ...overrides,
  };
}

const PLAYING = {
  isPlaying: true,
  title: 'Idol',
  artist: 'Yoasobi',
  album: 'THE BOOK 3',
  duration: 222,
  currentTime: 60,
};

const PAUSED = { ...PLAYING, isPlaying: false };

describe('resolveActivityType', () => {
  it('returns idle for null activity', () => {
    expect(resolveActivityType(null)).toBe('idle');
  });

  it('returns idle for an activity with no title', () => {
    expect(resolveActivityType({ ...PLAYING, title: '' })).toBe('idle');
  });

  it('returns playing when a titled track is playing', () => {
    expect(resolveActivityType(PLAYING)).toBe('playing');
  });

  it('returns paused when a titled track is not playing', () => {
    expect(resolveActivityType(PAUSED)).toBe('paused');
  });
});

describe('buildPresence — default templates', () => {
  it('substitutes {title} and {artist} into the state line for playing', () => {
    const presence = buildPresence(PLAYING, makeSettings());
    expect(presence.details).toBe('Listening to music');
    expect(presence.state).toBe('Idol by Yoasobi');
  });

  it('uses the paused template details for a paused track', () => {
    const presence = buildPresence(PAUSED, makeSettings());
    expect(presence.details).toBe('Music paused');
    expect(presence.state).toBe('Idol by Yoasobi');
  });

  it('uses the idle template (no state line) for null activity', () => {
    const presence = buildPresence(null, makeSettings());
    expect(presence.details).toBe('Idle');
    expect(presence.state).toBeUndefined();
  });
});

describe('buildPresence — large image', () => {
  it('sets the static asset key and album text when showLargeImage is on', () => {
    const presence = buildPresence(PLAYING, makeSettings());
    expect(presence.largeImageKey).toBe('shiranami');
    expect(presence.largeImageText).toBe('THE BOOK 3');
  });

  it('falls back to Shiranami for largeImageText when album is missing', () => {
    const presence = buildPresence({ ...PLAYING, album: '' }, makeSettings());
    expect(presence.largeImageText).toBe('Shiranami');
  });

  it('omits the large image entirely when showLargeImage is off', () => {
    const settings = makeSettings({ useCustomTemplates: true });
    settings.templates.playing.showLargeImage = false;
    const presence = buildPresence(PLAYING, settings);
    expect(presence.largeImageKey).toBeUndefined();
    expect(presence.largeImageText).toBeUndefined();
  });
});

describe('buildPresence — timestamp', () => {
  it('adds an endTimestamp when playing and showTimestamp is on', () => {
    const presence = buildPresence(PLAYING, makeSettings());
    expect(presence.endTimestamp).toBeInstanceOf(Date);
  });

  it('omits the timestamp for a paused track even though the template allows it', () => {
    // Paused template has showTimestamp:false; flip it on to prove the
    // playing-only guard, not the template, suppresses it.
    const settings = makeSettings({ useCustomTemplates: true });
    settings.templates.paused.showTimestamp = true;
    const presence = buildPresence(PAUSED, settings);
    expect(presence.endTimestamp).toBeUndefined();
  });

  it('omits the timestamp when showElapsedTime is off (legacy mode)', () => {
    const presence = buildPresence(PLAYING, makeSettings({ showElapsedTime: false }));
    expect(presence.endTimestamp).toBeUndefined();
  });

  it('omits the timestamp when the template disables it (custom mode)', () => {
    const settings = makeSettings({ useCustomTemplates: true });
    settings.templates.playing.showTimestamp = false;
    const presence = buildPresence(PLAYING, settings);
    expect(presence.endTimestamp).toBeUndefined();
  });

  it('omits the timestamp when duration is zero', () => {
    const presence = buildPresence({ ...PLAYING, duration: 0 }, makeSettings());
    expect(presence.endTimestamp).toBeUndefined();
  });
});

describe('buildPresence — button', () => {
  it('includes the landing button for the playing template', () => {
    const presence = buildPresence(PLAYING, makeSettings());
    expect(presence.buttons).toEqual([{ label: 'Get Shiranami', url: 'https://shiranami.app' }]);
  });

  it('omits the button for the paused template', () => {
    const presence = buildPresence(PAUSED, makeSettings());
    expect(presence.buttons).toBeUndefined();
  });
});

describe('buildPresence — track details toggle (legacy mode)', () => {
  it('drops the state line when showTrackDetails is off', () => {
    const presence = buildPresence(PLAYING, makeSettings({ showTrackDetails: false }));
    expect(presence.state).toBeUndefined();
    expect(presence.details).toBe('Listening to music');
  });

  it('still shows the state line in custom-template mode regardless of showTrackDetails', () => {
    const presence = buildPresence(
      PLAYING,
      makeSettings({ useCustomTemplates: true, showTrackDetails: false })
    );
    expect(presence.state).toBe('Idol by Yoasobi');
  });
});

describe('buildPresence — custom template substitution', () => {
  it('substitutes {album} and truncates over-long fields', () => {
    const settings = makeSettings({ useCustomTemplates: true });
    settings.templates.playing.state = '{album}';
    const longAlbum = 'A'.repeat(200);
    const presence = buildPresence({ ...PLAYING, album: longAlbum }, settings);
    expect((presence.state as string).length).toBe(128);
    expect((presence.state as string).endsWith('…')).toBe(true);
  });

  it('collapses whitespace from empty token substitutions', () => {
    const settings = makeSettings({ useCustomTemplates: true });
    settings.templates.playing.state = '{title} by {artist}';
    const presence = buildPresence({ ...PLAYING, artist: '' }, settings);
    expect(presence.state).toBe('Idol by');
  });
});

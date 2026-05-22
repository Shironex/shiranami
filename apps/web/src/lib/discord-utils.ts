import type { DiscordMusicActivityType } from '@shiranami/shared';

/** Sample track data for the live preview of Discord Rich Presence templates. */
const PREVIEW_DATA: Record<
  DiscordMusicActivityType,
  { title: string; artist: string; album: string }
> = {
  playing: { title: 'Idol', artist: 'Yoasobi', album: 'THE BOOK 3' },
  paused: { title: 'Idol', artist: 'Yoasobi', album: 'THE BOOK 3' },
  idle: { title: '', artist: '', album: '' },
};

/** Substitute `{title}`/`{artist}`/`{album}` with preview data for the given activity. */
export function substitutePreview(
  template: string,
  activityType: DiscordMusicActivityType
): string {
  if (!template) return '';
  const data = PREVIEW_DATA[activityType];
  return template
    .replace(/\{title\}/g, data.title)
    .replace(/\{artist\}/g, data.artist)
    .replace(/\{album\}/g, data.album)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

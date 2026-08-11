import { useEffect } from 'react';
import type { RadioNowPlaying } from '@shiranami/contracts';
import { IS_ELECTRON } from '@/lib/platform';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useRadioStore } from '@/stores/useRadioStore';
import { isRadioTrack } from '@/lib/utils';
import type { Track } from '@/stores/types';

/** How `stationToTrack` and the yt-dlp preview hook spell a radio `filePath`. */
const RADIO_PREFIX = 'shiranami-radio://stream?url=';

/**
 * The upstream stream URL a radio track addresses, or null when the path is not
 * one of ours.
 *
 * The parameter is percent-encoded by `encodeURIComponent` on the way in and
 * decoded by the proxy on the way out, so decoding here is what puts the two
 * spellings on the same footing — the event carries the *decoded* URL because
 * that is the form the Rust side asked the station for.
 */
export function radioStreamUrl(filePath: string): string | null {
  if (!filePath.startsWith(RADIO_PREFIX)) return null;
  try {
    return decodeURIComponent(filePath.slice(RADIO_PREFIX.length));
  } catch {
    // A malformed escape means this is not a URL we produced. Not an error
    // worth surfacing: the station name is a perfectly good title.
    return null;
  }
}

/**
 * Fold the Unicode "fancy font" codepoints station metadata is full of.
 *
 * Blackletter, mathematical alphanumerics, circled and full-width letters all
 * have NFKC decompositions to plain ASCII, so one `normalize` call turns
 * `𝕹𝖔𝖜 𝕻𝖑𝖆𝖞𝖎𝖓𝖌` into something the UI font can actually render — and, more to
 * the point, something the user can read. It also folds full-width punctuation
 * and ligatures, which is the same win.
 *
 * Compatibility folding is lossy by design, which is why it happens **here, at
 * the point of render**, and never to `nowPlaying.raw` in the store. The raw
 * string stays the source of truth for anything that has to match, log or
 * eventually scrobble it.
 */
function fold(title: string): string {
  try {
    return title.normalize('NFKC');
  } catch {
    // `normalize` throws only on an invalid form argument, which 'NFKC' is not.
    // Guarded anyway: a title is never worth an exception in a render path.
    return title;
  }
}

/**
 * The title line for `track`: what the station says it is playing, or the
 * station's own name.
 *
 * Falls back for every "we do not know yet" case rather than blanking — no
 * title has arrived, the station sends no metadata at all, or the title that
 * did arrive belongs to a station the user has already left. The last one is
 * why the event carries a stream URL: without the check, switching stations
 * shows the previous one's song until the new one's first block lands.
 */
export function radioTitleFor(track: Track, nowPlaying: RadioNowPlaying | null): string {
  if (!nowPlaying || !isRadioTrack(track.filePath)) return track.title;
  if (radioStreamUrl(track.filePath) !== nowPlaying.streamUrl) return track.title;

  const folded = fold(nowPlaying.raw).trim();
  return folded === '' ? track.title : folded;
}

/**
 * The title line for the currently playing track, radio or not.
 *
 * A non-radio track is its own title and always was; this hook exists so the
 * two players ask one question instead of each re-deriving the radio case.
 */
export function useTrackTitle(track: Track | null): string {
  const nowPlaying = useRadioStore(s => s.nowPlaying);
  if (!track) return '';
  return radioTitleFor(track, nowPlaying);
}

/**
 * Whether a `radio:now-playing` event describes the station currently playing.
 *
 * The station the user just left keeps emitting for the few milliseconds its
 * proxy connection takes to drain, so an event can arrive *after* the switch
 * and describe the old stream. `radioTitleFor` already refuses to render one,
 * but the store must refuse to hold one too: the de-framer only emits on a
 * *change*, so once a stale title has overwritten the new station's, that
 * station will not re-send its own until its song ends — and the bar sits on
 * the station-name fallback for the rest of the track.
 */
export function belongsToCurrent(
  currentFilePath: string | null,
  playing: RadioNowPlaying
): boolean {
  if (currentFilePath === null) return false;
  return radioStreamUrl(currentFilePath) === playing.streamUrl;
}

/**
 * Pipe `radio:now-playing` into the radio store.
 *
 * Mount once at the app root. No-op where there is no shell to listen to, and
 * no-op on a shell that predates the channel — v1's Electron preload declines
 * ICY metadata and exposes no `onNowPlaying`, so this feature-detects rather
 * than assuming the newer surface.
 */
export function useRadioNowPlayingBridge(): void {
  const currentFilePath = usePlaybackStore(s => s.currentTrack?.filePath ?? null);

  useEffect(() => {
    if (!IS_ELECTRON) return;

    const subscribe = window.electronAPI.radio.onNowPlaying;
    if (!subscribe) return;

    return subscribe(playing => {
      const path = usePlaybackStore.getState().currentTrack?.filePath ?? null;
      if (!belongsToCurrent(path, playing)) return;

      useRadioStore.getState().setNowPlaying(playing);
    });
  }, []);

  // Drop a title the moment playback moves off the station it came from. The
  // render path already refuses to show a mismatched one, so this is not what
  // prevents the flicker — it stops a title outliving its station in the store,
  // where coming back to that station minutes later would show its old song.
  useEffect(() => {
    const { nowPlaying, clearNowPlaying } = useRadioStore.getState();
    if (!nowPlaying) return;

    const playing = currentFilePath === null ? null : radioStreamUrl(currentFilePath);
    if (playing !== nowPlaying.streamUrl) clearNowPlaying();
  }, [currentFilePath]);
}

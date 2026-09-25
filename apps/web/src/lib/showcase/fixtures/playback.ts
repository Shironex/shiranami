/**
 * Showcase mode restores a paused track on the player bar (through the fixture
 * `player-state`), but there is no audio behind it: the deck's `<audio>` element
 * fails to load the file and the engine records the error, leaving the bar at
 * 0:00 with no length. Answer that one failure with the length the library
 * already knows, so the bar reads like a track paused partway through.
 */

import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { TRACK_BY_ID } from './catalog';

export function installShowcasePlayback(): void {
  usePlaybackStore.subscribe(state => {
    if (!state.currentTrack || !state.error) return;
    const known = TRACK_BY_ID.get(state.currentTrack.id)?.duration;
    if (!known) return;
    usePlaybackStore.setState({ error: null, isLoading: false, duration: known });
  });
}

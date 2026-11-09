import { useCallback, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { CardQuiet, CardRow } from '@/components/player/CardRow';
import { FadeScroll } from '@/components/player/FadeScroll';
import { similarReasonLabel, similarTracks } from '@/lib/similar';
import { PLAYER_CARD } from '@/lib/theme';
import { usePlayerStore, type Track } from '@/stores/usePlayerStore';

/**
 * Songs from the library that go with the playing one (same artist, album,
 * then genre). A tap plays the list from that song; a long press opens the
 * song's sheet, as on library rows.
 */
export function CardSimilar({ track }: { track: Track }) {
  const router = useRouter();
  const library = usePlayerStore(s => s.library);
  const playFromList = usePlayerStore(s => s.playFromList);
  const entries = useMemo(() => similarTracks(library, track), [library, track]);

  const onPress = useCallback(
    (picked: Track) => {
      const tracks = entries.map(e => e.track);
      playFromList(tracks, tracks.indexOf(picked), 'Similar');
    },
    [entries, playFromList]
  );
  const onLongPress = useCallback(
    (picked: Track) => router.push({ pathname: '/track/[id]', params: { id: picked.id } }),
    [router]
  );

  if (entries.length === 0) {
    return <CardQuiet>Nothing in your library like this yet.</CardQuiet>;
  }
  return (
    <FadeScroll
      fadeColor={PLAYER_CARD}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
    >
      {entries.map(entry => (
        <CardRow
          key={entry.track.id}
          track={entry.track}
          meta={`${entry.track.artist} · ${similarReasonLabel(entry.reason)}`}
          onPress={onPress}
          onLongPress={onLongPress}
        />
      ))}
    </FadeScroll>
  );
}

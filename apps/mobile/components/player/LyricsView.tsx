import { useCallback, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { FadeScroll } from '@/components/player/FadeScroll';
import { LyricRow, type LyricRowSize } from '@/components/player/LyricRow';
import type { LyricsResult } from '@/hooks/useLyrics';
import { useLyricFollow } from '@/hooks/useLyricFollow';
import { activeLyricIndex, karaokeLineDuration, lyricLineState } from '@/lib/lyrics-sync';
import { usePlayerStore } from '@/stores/usePlayerStore';

interface LyricsViewProps {
  lyrics: LyricsResult;
  size: LyricRowSize;
  /** The opaque color behind the list, for the fades at its edges. */
  fadeColor: string;
  fadeTop?: number;
  fadeBottom?: number;
  paddingHorizontal: number;
  paddingVertical: number;
  /** A tap between lines (or anywhere on unsynced lyrics). */
  onBackgroundPress?: () => void;
  /** Shown when the song has no lyrics at all. */
  empty: ReactNode;
}

/**
 * Lyrics in a box that scrolls on its own: synced lines follow the song and
 * seek on tap, unsynced lyrics are a plain list. Shared by the player's card
 * and the full screen view, which differ only in `size` and padding.
 */
export function LyricsView({
  lyrics,
  size,
  fadeColor,
  fadeTop,
  fadeBottom,
  paddingHorizontal,
  paddingVertical,
  onBackgroundPress,
  empty,
}: LyricsViewProps) {
  const synced = lyrics.synced;
  const active = usePlayerStore(s => activeLyricIndex(synced, s.currentTime));
  const seek = usePlayerStore(s => s.seek);
  const reduceMotion = useReducedMotion();
  const follow = useLyricFollow(active, synced !== null);
  const { resume } = follow;

  const onSeek = useCallback(
    (time: number) => {
      seek(time);
      resume();
    },
    [seek, resume]
  );

  const plain = !synced && lyrics.plain ? lyrics.plain.split('\n') : null;
  if (!synced && !plain) return <>{empty}</>;

  return (
    <FadeScroll
      fadeColor={fadeColor}
      fadeTop={fadeTop}
      fadeBottom={fadeBottom}
      scrollRef={follow.scrollRef}
      onScroll={follow.onScroll}
      onLayout={follow.onLayout}
      onContentSizeChange={follow.onContentSizeChange}
    >
      <Pressable
        onPress={onBackgroundPress}
        disabled={!onBackgroundPress}
        accessible={false}
        style={{ paddingHorizontal, paddingVertical }}
      >
        {synced
          ? synced.map((line, index) => (
              <LyricRow
                key={index}
                index={index}
                size={size}
                text={line.text}
                time={line.time}
                state={lyricLineState(index, active)}
                onSeek={onSeek}
                karaoke={
                  index === active && !reduceMotion ? karaokeLineDuration(synced, index) : undefined
                }
                onRowLayout={follow.onRowLayout}
              />
            ))
          : plain?.map((text, index) => (
              <LyricRow key={index} index={index} size={size} text={text || ' '} state="plain" />
            ))}
      </Pressable>
    </FadeScroll>
  );
}

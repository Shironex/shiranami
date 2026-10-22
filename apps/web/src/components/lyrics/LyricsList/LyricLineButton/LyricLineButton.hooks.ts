import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { karaokeElapsed, karaokeTokens } from '@/lib/lyrics';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { usePlaybackStore } from '@/stores/usePlaybackStore';
import { useLyricsAppearanceStore } from '@/stores/useLyricsAppearanceStore';
import type {
  IKaraokeTextProps,
  IKaraokeTextView,
  IKaraokeWord,
  ILyricLineButtonProps,
  ILyricLineButtonView,
} from './LyricLineButton.types';

/** The glow needs a moment to read even on a one-letter word. */
const GLOW_MIN_SECONDS = 0.6;
/** `word` lights each word with a short fade rather than a slow sweep. */
const WORD_FADE_SECONDS = 0.2;

/**
 * One instance renders per lyric line, so this hook stays deliberately bare: a
 * class merge and a click closure, with no memoization. `useCallback` would
 * allocate the same closure and then pay for a deps comparison on top, which is
 * the wrong trade on a list that re-renders on every playback tick.
 */
export function useLyricLineButton({
  text,
  time,
  isActive,
  isPast,
  duration,
  onSelect,
  activeRef,
  baseClassName,
  activeClassName,
  pastClassName,
  idleClassName,
}: ILyricLineButtonProps): ILyricLineButtonView {
  return {
    text,
    className: cn(
      baseClassName,
      isActive && activeClassName,
      isPast && pastClassName,
      !isActive && !isPast && idleClassName
    ),
    animated: isActive && duration !== undefined,
    buttonRef: isActive ? activeRef : null,
    onClick: () => onSelect(time),
  };
}

/**
 * Drives the karaoke animation of the one active line. Everything moves in CSS:
 * each word span gets a delay of `word start - elapsed` (negative once the word
 * is underway) and runs on its own, paused with the player. React only
 * re-renders this on activation, play/pause, and seeks; never per tick.
 *
 * A seek inside the same line leaves the active index alone, so `_seekCount`
 * keys the spans: every seek remounts them with a freshly measured elapsed.
 * `seek` writes `currentTime` in the same update, so that is always current.
 */
export function useKaraokeText({ text, time, duration }: IKaraokeTextProps): IKaraokeTextView {
  const chosen = useLyricsAppearanceStore(s => s.lyricsAnimation);
  const reducedMotion = useReducedMotion();
  const isPlaying = usePlaybackStore(s => s.isPlaying);
  const seekCount = usePlaybackStore(s => s._seekCount);
  const animation = reducedMotion ? 'off' : chosen;

  const timedWords = useMemo(() => {
    const elapsed = karaokeElapsed(usePlaybackStore.getState().currentTime, time, duration);
    return karaokeTokens(text, duration).map(token => ({
      ...token,
      delay: token.start - elapsed,
    }));
    // `animation` too: switching style remounts the spans, so re-measure then.
  }, [text, time, duration, seekCount, animation]);

  const playState = isPlaying ? 'running' : 'paused';
  const words: IKaraokeWord[] = timedWords.map(word => {
    if (!word.isWord || animation === 'off') {
      return { text: word.text, className: null, style: undefined };
    }
    const wordDuration =
      animation === 'word'
        ? WORD_FADE_SECONDS
        : animation === 'glow'
          ? Math.max(word.duration, GLOW_MIN_SECONDS)
          : word.duration;
    return {
      text: word.text,
      className: `lyric-word lyric-word-${animation}`,
      style: {
        animationDelay: `${word.delay}s`,
        animationDuration: `${wordDuration}s`,
        animationPlayState: playState,
      },
    };
  });

  return { animation, syncKey: `${time}:${seekCount}:${animation}`, words };
}

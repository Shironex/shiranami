import { memo } from 'react';
import { useKaraokeText, useLyricLineButton } from './LyricLineButton.hooks';
import type { IKaraokeTextProps, ILyricLineButtonProps } from './LyricLineButton.types';

/**
 * One seekable line in the synced-lyrics column. Memoized: the list re-renders
 * on every playback tick, but only the two lines whose active/past state flipped
 * actually change props. Only the active line gets a `duration`, and only it
 * renders through the karaoke animation.
 */
const LyricLineButton = memo(function LyricLineButton(props: ILyricLineButtonProps) {
  const { text, className, animated, buttonRef, onClick } = useLyricLineButton(props);

  return (
    <button ref={buttonRef} onClick={onClick} type="button" className={className}>
      {animated && props.duration !== undefined ? (
        <KaraokeText text={text} time={props.time} duration={props.duration} />
      ) : (
        text
      )}
    </button>
  );
});

/**
 * The active line split into word spans that animate on their own in CSS
 * (`.lyric-word-*` in globals.css). Whitespace stays as bare text, so the
 * button's accessible name is still exactly the lyric line.
 */
function KaraokeText(props: IKaraokeTextProps) {
  const { animation, syncKey, words } = useKaraokeText(props);
  if (animation === 'off') return props.text;

  const spans = words.map((word, index) =>
    word.className === null ? (
      word.text
    ) : (
      <span key={index} className={word.className} style={word.style}>
        {word.text}
      </span>
    )
  );
  return <span key={syncKey}>{spans}</span>;
}

export default LyricLineButton;

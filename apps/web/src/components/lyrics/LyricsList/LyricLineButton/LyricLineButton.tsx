import { memo } from 'react';
import { useLyricLineButton } from './LyricLineButton.hooks';
import type { ILyricLineButtonProps } from './LyricLineButton.types';

/**
 * One seekable line in the synced-lyrics column. Memoized: the list re-renders
 * on every playback tick, but only the two lines whose active/past state flipped
 * actually change props.
 */
const LyricLineButton = memo(function LyricLineButton(props: ILyricLineButtonProps) {
  const { text, className, buttonRef, onClick } = useLyricLineButton(props);

  return (
    <button ref={buttonRef} onClick={onClick} type="button" className={className}>
      {text}
    </button>
  );
});

export default LyricLineButton;

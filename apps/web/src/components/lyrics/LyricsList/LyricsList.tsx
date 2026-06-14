import { memo } from 'react';
import { cn } from '@/lib/utils';
import { useLyricsList } from './LyricsList.hooks';
import type { ILyricsListProps } from './LyricsList.types';

const LyricsList = memo(function LyricsList(props: ILyricsListProps) {
  const { lineButtons } = useLyricsList(props);
  const { containerClassName, spacingClassName, bottomSpacerClassName } = props;

  return (
    <div className={cn('flex-1 overflow-y-auto scrollbar-hide', containerClassName)}>
      <div className={spacingClassName}>
        {lineButtons}
        {bottomSpacerClassName && <div className={bottomSpacerClassName} />}
      </div>
    </div>
  );
});

export default LyricsList;

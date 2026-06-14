import { createElement, useEffect, useRef } from 'react';
import { LyricLineButton } from './LyricLineButton';
import type { ILyricsListProps, ILyricsListView } from './LyricsList.types';

export function useLyricsList({
  lines,
  activeIndex,
  onLineClick,
  baseClassName,
  activeClassName,
  pastClassName,
  idleClassName,
}: ILyricsListProps): ILyricsListView {
  const activeLineRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // `scrollIntoView` is absent in jsdom and some non-DOM environments; guard
    // so the active-line autoscroll degrades gracefully instead of throwing.
    if (typeof activeLineRef.current?.scrollIntoView === 'function') {
      activeLineRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeIndex]);

  const lineButtons = lines.map((line, index) =>
    createElement(LyricLineButton, {
      key: index,
      text: line.text,
      time: line.time,
      isActive: index === activeIndex,
      isPast: index < activeIndex,
      onSelect: onLineClick,
      activeRef: activeLineRef,
      baseClassName,
      activeClassName,
      pastClassName,
      idleClassName,
    })
  );

  return { activeLineRef, lineButtons };
}

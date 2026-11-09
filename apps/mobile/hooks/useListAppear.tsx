import { useCallback, useEffect, useRef, type ReactElement } from 'react';
import type { ListRenderItemInfo } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { MOTION, easeOutExpo } from '@/lib/motion';

/** Only the rows on screen when a list first shows rise in, one after another. */
const APPEAR_ROWS = 10;
const APPEAR_STEP_MS = 28;
const APPEAR_RISE = 10;
/** After this long, rows that mount (scrolled in, added) just appear. */
const APPEAR_WINDOW_MS = 600;

type RenderRow<T> = (info: ListRenderItemInfo<T>) => ReactElement | null;

/**
 * Wraps a FlatList `renderItem` so the first rows fade and rise in when the
 * list first shows its items (`ready`). Every row gets the same wrapper, so a
 * row never remounts when it moves; with reduce motion on, Reanimated skips
 * the entering animation and the rows simply appear.
 */
export function useListAppear<T>(renderItem: RenderRow<T>, ready: boolean): RenderRow<T> {
  const open = useRef(true);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      open.current = false;
    }, APPEAR_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [ready]);

  return useCallback(
    (info: ListRenderItemInfo<T>) => {
      const entering =
        ready && open.current && info.index < APPEAR_ROWS
          ? FadeInDown.duration(MOTION.base)
              .delay(info.index * APPEAR_STEP_MS)
              .easing(easeOutExpo)
              .withInitialValues({ opacity: 0, transform: [{ translateY: APPEAR_RISE }] })
          : undefined;
      return <Animated.View entering={entering}>{renderItem(info)}</Animated.View>;
    },
    [renderItem, ready]
  );
}

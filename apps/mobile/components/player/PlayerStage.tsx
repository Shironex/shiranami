import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, type GestureType } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Cover } from '@/components/player/Cover';
import { easeOutExpoFn } from '@/lib/motion';
import { STAGE, mixRect, stageLayout, type Rect } from '@/lib/player-stage';
import type { Track } from '@/stores/usePlayerStore';

/** Corner radius of the cover in each state, as drawn. */
const RADIUS = { side: 18, hero: 24, mini: 12 } as const;
const HEART = 44;
const HEART_RIGHT = 18;
const SIDE_TITLE_GAP = 16;
const HERO_TITLE_X = 28;

/**
 * The open transition, driven by the player screen. `progress` runs 0 to 1
 * as the cover flies out of the mini player (`origin`, in window coordinates)
 * to its place; the rest of the stage fades in behind it, staggered.
 */
export interface StageEnter {
  progress: SharedValue<number>;
  origin: SharedValue<Rect | null>;
  /** The stage's top left corner in the window, set by the stage once laid out. */
  offset: SharedValue<{ x: number; y: number }>;
  /** How far the player is dragged down; the stage moves with it. */
  drag: SharedValue<number>;
  /** True while closing, so the pieces ease out on the way back too. */
  leaving: SharedValue<boolean>;
  /** Called once the stage knows where it is, so the transition can start. */
  onPlaced: () => void;
}

/**
 * The transition's travel, 0 to 1, on the app's curve. `progress` itself runs
 * linearly; opening eases out towards 1 and closing eases out towards 0, so
 * both directions start quick and land softly.
 */
export function entered(progress: number, leaving: boolean): number {
  'worklet';
  const t = Math.min(1, Math.max(0, progress));
  return leaving ? 1 - easeOutExpoFn(1 - t) : easeOutExpoFn(t);
}

/**
 * 0 to 1 for a piece that starts appearing once `progress` passes `delay`,
 * eased over the time that is left. On the way out all pieces go together.
 */
export function staggered(progress: number, delay: number, leaving: boolean): number {
  'worklet';
  if (leaving) {
    // Nothing clips the pieces to the shrinking backdrop, so they are gone
    // by the time it is a third of the way back into the mini player.
    return Math.max(0, entered(progress, true) * 3 - 2);
  }
  return entered((progress - delay) / (1 - delay), false);
}

/** The player rises this far into place while it opens from the mini player. */
const ENTER_LIFT = 96;

/** How far below its place the player content is at `progress` (none for a plain fade). */
export function enterLift(progress: number, fromMini: boolean, leaving: boolean): number {
  'worklet';
  return fromMini ? (1 - entered(progress, leaving)) * ENTER_LIFT : 0;
}

interface PlayerStageProps {
  track: Track;
  hasCard: boolean;
  /** 0 with the card open (small cover beside the title), 1 folded (big cover). */
  hero: SharedValue<number>;
  /** The same state as `hero` once it settles; hidden titles stop taking taps. */
  folded: boolean;
  enter: StageEnter;
  /** Dragging the cover or the title pulls the player down. */
  gesture?: GestureType;
  /** Title and artist beside the small cover. */
  sideTitle: ReactNode;
  /** Title and artist under the big cover. */
  heroTitle: ReactNode;
  heart: ReactNode;
  /** The card, given the height its open body gets. */
  renderCard?: (bodyHeight: number) => ReactNode;
  onCoverPress?: () => void;
  coverLabel?: string;
}

/**
 * The middle of the player: cover, title, heart and card, placed by hand so
 * one value (`hero`) can move them all between the open card layout and the
 * big cover layout in a single transition. The cover is drawn once at its big
 * size and scaled, so it never re-lays out while it moves.
 */
export function PlayerStage({
  track,
  hasCard,
  hero,
  folded,
  enter,
  gesture,
  sideTitle,
  heroTitle,
  heart,
  renderCard,
  onCoverPress,
  coverLabel,
}: PlayerStageProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const layout = useMemo(
    () => (box ? stageLayout(box.width, box.height, hasCard) : null),
    [box, hasCard]
  );
  const sideTitleHeight = useSharedValue(0);

  const base = layout?.hero.cover.width ?? 1;
  const width = box?.width ?? 0;

  const coverStyle = useAnimatedStyle(() => {
    if (!layout) return { opacity: 0 };
    const h = hero.value;
    let rect = mixRect(layout.side.cover, layout.hero.cover, h);
    let radius = RADIUS.side + (RADIUS.hero - RADIUS.side) * h;
    const p = enter.progress.value;
    const origin = enter.origin.value;
    if (origin && p < 1) {
      // The stage sits inside the dragged and lifted content; undo that here.
      const moved = enter.drag.value + enterLift(p, true, enter.leaving.value);
      const from = {
        x: origin.x - enter.offset.value.x,
        y: origin.y - enter.offset.value.y - moved,
        width: origin.width,
        height: origin.height,
      };
      const e = entered(p, enter.leaving.value);
      rect = mixRect(from, rect, e);
      radius = RADIUS.mini + (radius - RADIUS.mini) * e;
    }
    const scale = rect.width / base;
    return {
      opacity: origin ? 1 : enter.progress.value,
      borderRadius: radius / scale,
      transform: [{ translateX: rect.x }, { translateY: rect.y }, { scale }],
    };
  });

  const sideTitleStyle = useAnimatedStyle(() => {
    if (!layout) return { opacity: 0 };
    const h = hero.value;
    const rect = mixRect(layout.side.cover, layout.hero.cover, h);
    const shown = staggered(enter.progress.value, 0.25, enter.leaving.value);
    return {
      opacity: Math.max(0, 1 - h * 2) * shown,
      transform: [
        { translateX: rect.x + rect.width + SIDE_TITLE_GAP },
        { translateY: rect.y + rect.height - 6 - sideTitleHeight.value + (1 - shown) * 10 },
      ],
    };
  });

  const heroTitleStyle = useAnimatedStyle(() => {
    if (!layout) return { opacity: 0 };
    const h = hero.value;
    const rect = mixRect(layout.side.cover, layout.hero.cover, h);
    const shown = staggered(enter.progress.value, 0.25, enter.leaving.value);
    return {
      opacity: Math.max(0, h * 2 - 1) * shown,
      transform: [{ translateY: rect.y + rect.height + STAGE.heroTitleGap + (1 - shown) * 10 }],
    };
  });

  const heartStyle = useAnimatedStyle(() => {
    if (!layout) return { opacity: 0 };
    const h = hero.value;
    const rect = mixRect(layout.side.cover, layout.hero.cover, h);
    const bottom = rect.y + rect.height;
    const sideTop = bottom - HEART - 2;
    const heroTop = bottom + STAGE.heroTitleGap + (STAGE.heroTitleHeight - HEART) / 2;
    const shown = staggered(enter.progress.value, 0.3, enter.leaving.value);
    return {
      opacity: shown,
      transform: [{ translateY: sideTop + (heroTop - sideTop) * h + (1 - shown) * 10 }],
    };
  });

  // The card keeps its open size inside a box that clips at the open card's
  // bottom; folding slides it down so only its tab row stays in the box.
  // Transforms only, so the fold never waits on a layout pass.
  const cardBoxStyle = useAnimatedStyle(() => {
    const shown = staggered(enter.progress.value, 0.3, enter.leaving.value);
    return { opacity: shown, transform: [{ translateY: (1 - shown) * 16 }] };
  });
  const cardStyle = useAnimatedStyle(() => {
    if (!layout) return {};
    return {
      transform: [{ translateY: (layout.hero.card.y - layout.side.card.y) * hero.value }],
    };
  });

  const sideTitleWidth =
    width - (STAGE.sideX + STAGE.sideCover + SIDE_TITLE_GAP) - HEART - HEART_RIGHT - 4;
  const heroTitleWidth = width - HERO_TITLE_X - HEART - HEART_RIGHT - 8;

  const boxRef = useRef<View>(null);
  const placed = useRef(false);
  const top = (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {layout && (
        <>
          <Animated.View
            pointerEvents={folded ? 'none' : 'box-none'}
            style={[styles.abs, { width: sideTitleWidth }, sideTitleStyle]}
            onLayout={e => {
              sideTitleHeight.value = e.nativeEvent.layout.height;
            }}
          >
            {sideTitle}
          </Animated.View>
          <Animated.View
            pointerEvents={folded ? 'box-none' : 'none'}
            style={[styles.abs, { left: HERO_TITLE_X, width: heroTitleWidth }, heroTitleStyle]}
          >
            {heroTitle}
          </Animated.View>
          <Animated.View style={[styles.abs, { left: width - HEART - HEART_RIGHT }, heartStyle]}>
            {heart}
          </Animated.View>
          <Animated.View
            style={[styles.abs, styles.cover, { width: base, height: base }, coverStyle]}
          >
            <Pressable
              accessibilityRole={onCoverPress ? 'button' : 'image'}
              accessibilityLabel={coverLabel}
              disabled={!onCoverPress}
              onPress={onCoverPress}
            >
              <Cover track={track} size={base} radius={0} shadow={false} />
            </Pressable>
          </Animated.View>
        </>
      )}
    </View>
  );

  return (
    <View
      ref={boxRef}
      style={styles.fill}
      onLayout={e => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox(prev => (prev?.width === w && prev?.height === h ? prev : { width: w, height: h }));
        boxRef.current?.measureInWindow((x, y) => {
          enter.offset.value = { x, y };
          if (!placed.current) {
            placed.current = true;
            enter.onPlaced();
          }
        });
      }}
    >
      {layout && (
        <>
          {hasCard && renderCard && (
            <Animated.View
              style={[
                styles.cardBox,
                {
                  left: STAGE.cardX,
                  top: layout.side.card.y,
                  width: layout.side.card.width,
                  height: layout.side.card.height,
                },
                cardBoxStyle,
              ]}
            >
              <Animated.View style={[styles.card, cardStyle]}>
                {renderCard(Math.max(0, layout.side.card.height - STAGE.foldedCard))}
              </Animated.View>
            </Animated.View>
          )}
        </>
      )}
      {gesture ? <GestureDetector gesture={gesture}>{top}</GestureDetector> : top}
    </View>
  );
}

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  fill: { flex: 1 },
  abs: { position: 'absolute', left: 0, top: 0 },
  cover: {
    overflow: 'hidden',
    transformOrigin: 'left top',
    boxShadow: '0 30px 50px -24px rgba(0,0,4,0.95)',
  },
  cardBox: { position: 'absolute', overflow: 'hidden' },
  card: { flex: 1, overflow: 'hidden', borderRadius: 22 },
});

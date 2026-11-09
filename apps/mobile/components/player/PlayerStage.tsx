import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import { Cover } from '@/components/player/Cover';
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
  /** The stage's top left corner in the window. */
  offset: SharedValue<{ x: number; y: number }>;
}

/** 0 to 1 for a piece that starts appearing once `progress` passes `delay`. */
export function staggered(progress: number, delay: number): number {
  'worklet';
  return Math.min(1, Math.max(0, (progress - delay) / (1 - delay)));
}

interface PlayerStageProps {
  track: Track;
  hasCard: boolean;
  /** 0 with the card open (small cover beside the title), 1 folded (big cover). */
  hero: SharedValue<number>;
  enter: StageEnter;
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
  enter,
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
      const from = {
        x: origin.x - enter.offset.value.x,
        y: origin.y - enter.offset.value.y,
        width: origin.width,
        height: origin.height,
      };
      rect = mixRect(from, rect, p);
      radius = RADIUS.mini + (radius - RADIUS.mini) * p;
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
    const shown = staggered(enter.progress.value, 0.25);
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
    const shown = staggered(enter.progress.value, 0.25);
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
    const shown = staggered(enter.progress.value, 0.3);
    return {
      opacity: shown,
      transform: [{ translateY: sideTop + (heroTop - sideTop) * h + (1 - shown) * 10 }],
    };
  });

  const cardStyle = useAnimatedStyle(() => {
    if (!layout) return { opacity: 0 };
    const rect = mixRect(layout.side.card, layout.hero.card, hero.value);
    const shown = staggered(enter.progress.value, 0.35);
    return {
      opacity: shown,
      top: rect.y,
      height: rect.height,
      transform: [{ translateY: (1 - shown) * 16 }],
    };
  });

  const sideTitleWidth =
    width - (STAGE.sideX + STAGE.sideCover + SIDE_TITLE_GAP) - HEART - HEART_RIGHT - 4;
  const heroTitleWidth = width - HERO_TITLE_X - HEART - HEART_RIGHT - 8;

  return (
    <View
      style={styles.fill}
      onLayout={e => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setBox(prev => (prev?.width === w && prev?.height === h ? prev : { width: w, height: h }));
      }}
    >
      {layout && (
        <>
          {hasCard && renderCard && (
            <Animated.View
              style={[styles.card, { left: STAGE.cardX, width: layout.side.card.width }, cardStyle]}
            >
              {renderCard(Math.max(0, layout.side.card.height - STAGE.foldedCard))}
            </Animated.View>
          )}
          <Animated.View
            pointerEvents="box-none"
            style={[styles.abs, { width: sideTitleWidth }, sideTitleStyle]}
            onLayout={e => {
              sideTitleHeight.value = e.nativeEvent.layout.height;
            }}
          >
            {sideTitle}
          </Animated.View>
          <Animated.View
            pointerEvents="box-none"
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
  card: { position: 'absolute', overflow: 'hidden', borderRadius: 22 },
});

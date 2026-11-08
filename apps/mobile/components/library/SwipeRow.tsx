import { useCallback, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import ListPlus from 'lucide-react-native/icons/list-plus';
import ListStart from 'lucide-react-native/icons/list-start';
import { Text } from '@/components/ui/text';
import { EASE_OUT_QUART, colors } from '@/lib/theme';

/** How far a row has to travel before letting go does something. */
export const SWIPE_THRESHOLD = 72;
/** Past this the row drags at a quarter speed, so it never leaves the screen. */
const SWIPE_MAX = 176;
/** Horizontal travel before the swipe claims the touch from the list. */
const ACTIVATE_X = 16;
/** Vertical travel that hands the touch back to the list for scrolling. */
const FAIL_Y = 12;
const SETTLE = { duration: 220, easing: Easing.bezier(...EASE_OUT_QUART) };

function tick() {
  void Haptics.selectionAsync();
}

/** The row's offset for a finger offset: one to one, then with resistance. */
function dragOffset(translation: number): number {
  'worklet';
  const distance = Math.abs(translation);
  const eased = distance <= SWIPE_MAX ? distance : SWIPE_MAX + (distance - SWIPE_MAX) * 0.25;
  return Math.sign(translation) * eased;
}

interface SwipeRowProps {
  /** Swipe right: put the song after the one playing. */
  onPlayNext: () => void;
  /** Swipe left: pick a playlist for the song. */
  onAddToPlaylist?: () => void;
  testID?: string;
  /**
   * Renders the row. Wrap its onPress (and onLongPress) in `guard`, so the
   * press that ends a swipe never also plays the song.
   */
  children: (guard: SwipeGuard) => ReactNode;
}

/** Wraps a press handler so it does nothing when the touch was a swipe. */
export type SwipeGuard = <A extends unknown[]>(
  handler?: (...args: A) => void
) => (...args: A) => void;

/**
 * A row that queues its song with a short swipe. The colour under the row
 * says what will happen; a haptic tick marks the point where letting go
 * counts. Vertical drags stay with the list, so scrolling feels the same.
 */
export function SwipeRow({ onPlayNext, onAddToPlaylist, testID, children }: SwipeRowProps) {
  const x = useSharedValue(0);
  // -1 armed to add to a playlist, 1 armed to play next, 0 neither.
  const armed = useSharedValue(0);
  const canLeft = !!onAddToPlaylist;
  // Set once the pan takes the touch, cleared when the next touch begins.
  // The tap a platform may still deliver after the swipe is then ignored,
  // whether or not the gesture handler cancelled it.
  const swiped = useRef(false);
  const markSwiped = useCallback((value: boolean) => {
    swiped.current = value;
  }, []);
  const guard = useCallback<SwipeGuard>(
    handler =>
      (...args) => {
        if (!swiped.current) handler?.(...args);
      },
    []
  );

  const release = (side: number) => {
    if (side === 1) onPlayNext();
    else if (side === -1) onAddToPlaylist?.();
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-ACTIVATE_X, ACTIVATE_X])
    .failOffsetY([-FAIL_Y, FAIL_Y])
    .onBegin(() => {
      runOnJS(markSwiped)(false);
    })
    .onStart(() => {
      runOnJS(markSwiped)(true);
    })
    .onUpdate(e => {
      const t = canLeft ? e.translationX : Math.max(0, e.translationX);
      x.value = dragOffset(t);
      const next = Math.abs(x.value) >= SWIPE_THRESHOLD ? Math.sign(x.value) : 0;
      if (next !== armed.value) {
        armed.value = next;
        if (next !== 0) runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const side = armed.value;
      if (side !== 0) runOnJS(release)(side);
    })
    .onFinalize(() => {
      armed.value = 0;
      x.value = withTiming(0, SETTLE);
    });
  if (testID) pan.withTestId(testID);

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const nextStyle = useAnimatedStyle(() => ({
    opacity: x.value > 0 ? 1 : 0,
    backgroundColor: armed.value === 1 ? colors.primaryChip : colors.raised,
  }));
  const playlistStyle = useAnimatedStyle(() => ({
    opacity: x.value < 0 ? 1 : 0,
    backgroundColor: armed.value === -1 ? colors.primaryChip : colors.raised,
  }));

  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={[styles.under, styles.left, nextStyle]}
        importantForAccessibility="no-hide-descendants"
      >
        <ListStart size={20} color={colors.foreground} />
        <Text variant="label" className="text-foreground">
          Play next
        </Text>
      </Animated.View>
      {canLeft && (
        <Animated.View
          pointerEvents="none"
          style={[styles.under, styles.right, playlistStyle]}
          importantForAccessibility="no-hide-descendants"
        >
          <Text variant="label" className="text-foreground">
            Add to playlist
          </Text>
          <ListPlus size={20} color={colors.foreground} />
        </Animated.View>
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children(guard)}</Animated.View>
      </GestureDetector>
    </View>
  );
}

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  under: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  left: { justifyContent: 'flex-start' },
  right: { justifyContent: 'flex-end' },
  // Opaque, so the layer underneath only shows where the row has moved away.
  row: { backgroundColor: colors.background, borderRadius: 12 },
});

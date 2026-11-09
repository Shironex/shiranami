import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { MOTION, motion } from '@/lib/motion';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

export interface CardTab<T extends string> {
  value: T;
  label: string;
}

interface CardTabsProps<T extends string> {
  tabs: readonly CardTab<T>[];
  value: T;
  /** The card is folded away: the tile stays on the last tab, quieter. */
  folded?: boolean;
  onPress: (tab: T) => void;
}

interface Slot {
  x: number;
  width: number;
}

/**
 * The card's tab pill. The selected tab sits on a raised tile that slides
 * between tabs, like the dock's. Tapping the open tab folds the card away;
 * the parent decides what a press means.
 */
export function CardTabs<T extends string>({ tabs, value, folded, onPress }: CardTabsProps<T>) {
  const [slots, setSlots] = useState<Record<string, Slot>>({});
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  const dim = useSharedValue(folded ? 1 : 0);
  const placed = useSharedValue(false);
  const slot = slots[value];

  useEffect(() => {
    if (!slot) return;
    if (placed.value) {
      x.value = withTiming(slot.x, motion(MOTION.base));
      width.value = withTiming(slot.width, motion(MOTION.base));
    } else {
      x.value = slot.x;
      width.value = slot.width;
      placed.value = true;
    }
  }, [slot, x, width, placed]);

  useEffect(() => {
    dim.value = withTiming(folded ? 1 : 0, motion(MOTION.slow));
  }, [folded, dim]);

  const tile = useAnimatedStyle(() => ({
    width: width.value,
    transform: [{ translateX: x.value }],
    opacity: 1 - dim.value * 0.55,
  }));

  const onSlot = (tab: T) => (e: LayoutChangeEvent) => {
    const { x: left, width: w } = e.nativeEvent.layout;
    setSlots(prev =>
      prev[tab]?.x === left && prev[tab]?.width === w
        ? prev
        : { ...prev, [tab]: { x: left, width: w } }
    );
  };

  return (
    <View role="tablist" className="flex-row self-start rounded-full bg-border p-[3px]">
      {slot && <Animated.View pointerEvents="none" style={[styles.tile, tile]} />}
      {tabs.map(tab => {
        const on = tab.value === value;
        return (
          <Pressable
            key={tab.value}
            role="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: on && !folded, expanded: !folded }}
            accessibilityHint={on && !folded ? 'Hides the card' : undefined}
            onPress={() => onPress(tab.value)}
            onLayout={onSlot(tab.value)}
            hitSlop={{ top: 7, bottom: 7 }}
            className="h-[30px] justify-center rounded-full px-3.5 active:opacity-70"
          >
            <Text
              variant="label"
              className={cn(
                'font-body-semibold text-[13.5px]',
                on && !folded ? 'text-foreground' : 'text-muted-foreground'
              )}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Reanimated views take no className (NativeWind only maps core components).
const styles = StyleSheet.create({
  tile: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    left: 0,
    borderRadius: 999,
    backgroundColor: colors.dockTab,
  },
});

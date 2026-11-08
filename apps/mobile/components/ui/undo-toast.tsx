import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';

interface UndoToastProps {
  label: string;
  bottom: number;
  /** Read out with Undo, for example "Undo remove". */
  undoLabel: string;
  onUndo: () => void;
}

/** "Something happened · Undo" over the bottom of the screen. */
export function UndoToast({ label, bottom, undoLabel, onUndo }: UndoToastProps) {
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      accessibilityLiveRegion="polite"
      style={[styles.overlay, { bottom }]}
      pointerEvents="box-none"
    >
      <View className="min-h-12 max-w-full flex-row items-center rounded-xl bg-raised pl-4 pr-1">
        <Text variant="option" numberOfLines={1} className="shrink text-soft-foreground">
          {label}
        </Text>
        <Text variant="meta" className="mx-2">
          ·
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={undoLabel}
          onPress={onUndo}
          className="h-11 justify-center rounded-full px-3 active:bg-border"
        >
          <Text variant="button" className="text-primary">
            Undo
          </Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

// Reanimated views take no className (NativeWind only maps core components);
// without these the toast would sit in the layout and push the dock up.
const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 30,
    alignItems: 'center',
    paddingHorizontal: 16,
  },
});

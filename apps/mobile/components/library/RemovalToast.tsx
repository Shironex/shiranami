import { Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Text } from '@/components/ui/text';
import { useRemovalStore } from '@/stores/useRemovalStore';

/** "Removed · Undo" over the bottom of the screen while a removal can still be undone. */
export function RemovalToast({ bottom }: { bottom: number }) {
  const pending = useRemovalStore(s => s.pending);
  const undo = useRemovalStore(s => s.undo);
  if (!pending) return null;

  const label =
    pending.tracks.length === 1 ? `Removed ${pending.tracks[0].title}` : 'Removed songs';

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(150)}
      accessibilityLiveRegion="polite"
      className="absolute left-0 right-0 z-30 items-center px-4"
      style={{ bottom }}
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
          accessibilityLabel="Undo remove"
          onPress={() => void undo()}
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

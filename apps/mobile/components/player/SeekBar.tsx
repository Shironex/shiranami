import { useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import { Text } from '@/components/ui/text';
import { formatDuration } from '@/lib/format';
import { usePlayerStore } from '@/stores/usePlayerStore';

const STEP_SECONDS = 10;
const SEEK_ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

/**
 * Thin lavender seek bar with a thumb. Drag or tap to seek; the thumb follows
 * the finger and the player seeks on release. Screen readers get a slider
 * that steps ten seconds.
 */
export function SeekBar() {
  const isLive = usePlayerStore(s => s.currentTrack?.isLive ?? false);
  const currentTime = usePlayerStore(s => s.currentTime);
  const duration = usePlayerStore(s => s.duration);
  const seek = usePlayerStore(s => s.seek);
  const seekBy = usePlayerStore(s => s.seekBy);
  const [width, setWidth] = useState(0);
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  if (isLive) {
    return (
      <View
        className="h-[45px] flex-row items-center gap-2"
        accessible
        accessibilityLabel="Live stream"
      >
        <View className="h-2 w-2 rounded-full bg-live" />
        <Text variant="label" className="text-soft-foreground">
          Live
        </Text>
      </View>
    );
  }

  const canSeek = duration > 0 && width > 0;
  const ratio = dragRatio ?? (duration > 0 ? clamp01(currentTime / duration) : 0);
  const ratioAt = (event: GestureResponderEvent) => clamp01(event.nativeEvent.locationX / width);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  return (
    <View>
      <View
        onLayout={onLayout}
        className="h-5 justify-center"
        hitSlop={{ top: 12, bottom: 12 }}
        onStartShouldSetResponder={() => canSeek}
        onMoveShouldSetResponder={() => canSeek}
        onResponderGrant={e => setDragRatio(ratioAt(e))}
        onResponderMove={e => setDragRatio(ratioAt(e))}
        onResponderRelease={e => {
          seek(ratioAt(e) * duration);
          setDragRatio(null);
        }}
        onResponderTerminate={() => setDragRatio(null)}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{
          min: 0,
          max: Math.round(duration),
          now: Math.round(Math.min(currentTime, duration)),
          text: `${formatDuration(currentTime)} of ${formatDuration(duration)}`,
        }}
        accessibilityActions={duration > 0 ? SEEK_ACTIONS : undefined}
        onAccessibilityAction={e => {
          if (duration <= 0) return;
          if (e.nativeEvent.actionName === 'increment') seekBy(STEP_SECONDS);
          else if (e.nativeEvent.actionName === 'decrement') seekBy(-STEP_SECONDS);
        }}
      >
        <View pointerEvents="none" className="h-1 rounded-full bg-rail">
          <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
          <View
            className="absolute -top-[5px] -ml-[7px] h-3.5 w-3.5 rounded-full bg-foreground"
            style={{ left: `${ratio * 100}%` }}
          />
        </View>
      </View>
      <View className="mt-1.5 flex-row justify-between">
        <Text variant="meta" className="text-[13px]" style={{ fontVariant: ['tabular-nums'] }}>
          {formatDuration(ratio * duration)}
        </Text>
        <Text variant="meta" className="text-[13px]" style={{ fontVariant: ['tabular-nums'] }}>
          {formatDuration(duration)}
        </Text>
      </View>
    </View>
  );
}

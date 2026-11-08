import { View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

interface ScanProgressProps {
  done: number;
  total: number;
  onCancel: () => void;
  className?: string;
}

/** A thin primary bar with the count and a way out, while the phone is scanned. */
export function ScanProgress({ done, total, onCancel, className }: ScanProgressProps) {
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const label = total > 0 ? `Reading ${done} of ${total}` : 'Looking for music';
  return (
    <View className={cn('w-full', className)}>
      <View className="flex-row items-center gap-3">
        <Text
          variant="meta"
          className="flex-1"
          style={{ fontVariant: ['tabular-nums'] }}
          accessibilityLiveRegion="polite"
        >
          {label}
        </Text>
        <Button label="Cancel" variant="text" size="compact" onPress={onCancel} />
      </View>
      <View
        className="mt-1 h-1 overflow-hidden rounded-full bg-border"
        accessibilityRole="progressbar"
        accessibilityLabel="Scanning music"
        accessibilityValue={{ min: 0, max: Math.max(total, 1), now: done }}
      >
        <View className="h-full rounded-full bg-primary" style={{ width: `${ratio * 100}%` }} />
      </View>
    </View>
  );
}

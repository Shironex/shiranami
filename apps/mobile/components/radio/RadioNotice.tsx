import { Pressable, View } from 'react-native';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

/** An inline error with Try again, in place of a spinner that never stops. */
export function RadioNotice({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      className="min-h-[52px] flex-row items-center gap-3 rounded-2xl bg-raised pl-4 pr-1"
    >
      <WifiOff size={18} color={colors.softForeground} />
      <Text variant="body" className="flex-1 text-[14.5px] text-soft-foreground">
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        className="h-11 justify-center rounded-xl px-3 active:bg-border"
      >
        <Text variant="label" className="font-body-semibold text-primary">
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

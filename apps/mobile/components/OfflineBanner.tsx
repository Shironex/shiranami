import { memo } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WifiOff from 'lucide-react-native/icons/wifi-off';
import { Text } from '@/components/ui/text';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { colors } from '@/lib/theme';

/** A small pill over the top of the screen while there is no connection. */
function OfflineBannerInner() {
  const isOnline = useNetworkStatus();
  const insets = useSafeAreaInsets();
  if (isOnline) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        zIndex: 20,
        alignItems: 'center',
        top: insets.top + 64,
      }}
    >
      <View className="flex-row items-center gap-2 rounded-full bg-raised px-3.5 py-2">
        <WifiOff size={14} color={colors.softForeground} />
        <Text variant="caption" className="text-soft-foreground">
          Offline. Your library still works.
        </Text>
      </View>
    </Animated.View>
  );
}

export const OfflineBanner = memo(OfflineBannerInner);

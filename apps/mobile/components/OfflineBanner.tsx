import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { WifiOff } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { colors } from '@/lib/theme';

function OfflineBannerInner() {
  const isOnline = useNetworkStatus();

  if (isOnline) return null;

  return (
    <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(200)} style={s.banner}>
      <WifiOff size={14} color={colors.foreground} />
      <Text style={s.text}>You're offline — local library still works</Text>
    </Animated.View>
  );
}

export const OfflineBanner = memo(OfflineBannerInner);

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.muted,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  text: {
    fontSize: 12,
    color: colors.foreground,
    fontWeight: '500',
  },
});

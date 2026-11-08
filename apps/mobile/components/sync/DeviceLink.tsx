import { View } from 'react-native';
import Laptop from 'lucide-react-native/icons/laptop';
import Smartphone from 'lucide-react-native/icons/smartphone';
import { colors } from '@/lib/theme';

/** The phone, three dots and the desktop: the picture while pairing. */
export function DeviceLink() {
  return (
    <View className="flex-row items-center justify-center gap-4" accessibilityElementsHidden>
      <View className="h-16 w-16 items-center justify-center rounded-[20px] border border-border bg-card">
        <Smartphone size={28} color={colors.softForeground} />
      </View>
      <View className="flex-row gap-1.5">
        {[0.35, 0.6, 1].map(opacity => (
          <View key={opacity} className="h-1.5 w-1.5 rounded-full bg-primary" style={{ opacity }} />
        ))}
      </View>
      <View className="h-16 w-16 items-center justify-center rounded-[20px] border border-primary-ring bg-primary-tonal">
        <Laptop size={28} color={colors.foreground} />
      </View>
    </View>
  );
}

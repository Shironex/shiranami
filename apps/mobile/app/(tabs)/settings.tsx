import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Settings } from 'lucide-react-native';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="flex-1 items-center justify-center bg-background"
      style={{ paddingTop: insets.top }}
    >
      <Settings size={48} color={colors.mutedForeground} />
      <Text variant="muted" className="mt-4">
        Settings
      </Text>
    </View>
  );
}

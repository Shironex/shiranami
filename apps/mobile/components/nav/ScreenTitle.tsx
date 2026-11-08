import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/text';

/** A plain screen title with actions on the right, for screens without the window. */
export function ScreenTitle({ title, actions }: { title: string; actions?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center justify-between pl-6 pr-3"
      style={{ paddingTop: insets.top + 14, paddingBottom: 6 }}
    >
      <Text variant="display">{title}</Text>
      <View className="flex-row items-center">{actions}</View>
    </View>
  );
}

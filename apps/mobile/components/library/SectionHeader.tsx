import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';

/** A Sora section title ("Albums", "Songs") with an optional text action on the right. */
export function SectionHeader({
  title,
  action,
  onAction,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <View className="mb-2.5 mt-[22px] flex-row items-center justify-between px-3">
      <Text variant="sheetTitle" className="text-[17px] leading-[21px]">
        {title}
      </Text>
      {action && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={8}
          className="rounded-full px-1 active:bg-border"
        >
          <Text variant="label" className="text-primary">
            {action}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

import { View } from 'react-native';
import type { IconComponent } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/lib/theme';
import { cn } from '@/lib/utils';

/** A quiet card with an icon and one or two lines of help. */
export function SyncNote({
  icon: Icon,
  children,
  className,
}: {
  icon: IconComponent;
  children: string;
  className?: string;
}) {
  return (
    <View
      className={cn(
        'flex-row gap-3 rounded-2xl border border-border bg-card px-4 py-3.5',
        className
      )}
    >
      <Icon size={20} color={colors.softForeground} />
      <Text variant="body" className="flex-1 text-[14px] leading-[21px] text-soft-foreground">
        {children}
      </Text>
    </View>
  );
}
